/**
 * ==============================================================================
 * SHINEMART DIGITAL CATALOG - ADMIN SCRIPT (admin.js)
 * Khusus untuk Halaman Admin (admin.html):
 * 1. Membaca file Excel (.xlsx / .csv) di browser menggunakan SheetJS
 * 2. Menampilkan tabel preview data hasil pembacaan file sebelum dikirim
 * 3. Mengirim array batch produk ke Google Apps Script (doPost)
 * 4. Menyimpan konfigurasi URL Web App Google Apps Script
 * ==============================================================================
 */

// URL Default (Dapat diperbarui langsung dari input pengaturan di admin.html)
const DEFAULT_GAS_API_URL = "https://script.google.com/macros/s/AKfycbz_sample_shinemart/exec";
const LOCAL_STORAGE_KEY = "shinemart_products_data";

/**
 * Otomatis mengonversi URL Google Drive standar / share link
 * menjadi Direct Image URL agar dapat dirender oleh tag <img> di browser.
 */
function formatGoogleDriveImageUrl(url) {
  if (!url || typeof url !== "string") return "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
  const trimmed = url.trim();

  let match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }

  match = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }

  match = trimmed.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }

  return trimmed;
}

let parsedExcelProducts = [];
let liveSupabaseProducts = [];

let adminSupabaseInstance = null;

// Konfigurasi Database Supabase
const DEFAULT_SUPABASE_URL = "https://amuqgtdyecgdxclqwanj.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_G-am3ojwBmpNqbZDi5qciA_6fn37rX9";

/**
 * Singleton Supabase Client khusus Admin
 * Otomatis menangani persistensi sesi login admin (JWT Token) di browser
 */
function getAdminSupabaseClient() {
  if (adminSupabaseInstance) return adminSupabaseInstance;

  const url = localStorage.getItem("shinemart_supabase_url") || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem("shinemart_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;

  if (typeof supabase !== "undefined" && url && key) {
    try {
      adminSupabaseInstance = supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      return adminSupabaseInstance;
    } catch (e) {
      console.warn("Gagal inisialisasi Supabase:", e);
      return null;
    }
  }
  return null;
}

// Alias helper agar kompatibel di semua modul admin
function getSupabaseClient() {
  return getAdminSupabaseClient();
}

document.addEventListener("DOMContentLoaded", () => {
  initAdminSettings();
  setupAdminListeners();
  checkAdminAuth();

  // Dengarkan perubahan state auth Supabase
  const client = getAdminSupabaseClient();
  if (client && client.auth) {
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        checkAdminAuth();
      }
    });
  }
});

/**
 * Cek status autentikasi resmi Admin via Supabase Auth Session
 */
async function checkAdminAuth() {
  const loginOverlay = document.getElementById("loginOverlaySection");
  const mainContent = document.getElementById("adminMainContent");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const userBadge = document.getElementById("adminUserBadge");
  const userEmailEl = document.getElementById("adminUserEmail");

  const client = getAdminSupabaseClient();
  if (!client) {
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (userBadge) userBadge.classList.add("hidden");
    return;
  }

  try {
    const { data: { session } } = await client.auth.getSession();

    if (session && session.user) {
      if (loginOverlay) loginOverlay.classList.add("hidden");
      if (mainContent) mainContent.classList.remove("hidden");
      if (logoutBtn) logoutBtn.classList.remove("hidden");
      if (userBadge) {
        userBadge.classList.remove("hidden");
        if (userEmailEl) userEmailEl.textContent = session.user.email || "Admin";
      }

      // Muat data live pesanan, produk, banner, dan seksi promosi
      loadAdminOrdersList();
      initAdminOrdersRealtime();
      loadStoreOperationalSettings();
      loadSupabaseProductsList();
      loadSupabaseBannersList();
      if (typeof loadMobileBannersList === "function") {
        loadMobileBannersList();
      }
      if (typeof loadSupabaseSectionsList === "function") {
        loadSupabaseSectionsList();
      }
      if (typeof loadMobileSectionsList === "function") {
        loadMobileSectionsList();
      }
    } else {
      if (loginOverlay) loginOverlay.classList.remove("hidden");
      if (mainContent) mainContent.classList.add("hidden");
      if (logoutBtn) logoutBtn.classList.add("hidden");
      if (userBadge) userBadge.classList.add("hidden");
    }
  } catch (err) {
    console.error("Gagal memeriksa sesi login Supabase:", err);
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (userBadge) userBadge.classList.add("hidden");
  }
}

/**
 * Handler Submit Form Login via Supabase Auth
 */
async function handleAdminLogin(event) {
  event.preventDefault();
  const emailInput = document.getElementById("adminEmailInput");
  const passInput = document.getElementById("adminPasswordInput");
  const errorMsg = document.getElementById("loginErrorMsg");
  const errorText = document.getElementById("loginErrorText");
  const loginBtn = document.getElementById("adminLoginBtn");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passInput ? passInput.value.trim() : "";

  if (!email || !password) {
    if (errorText) errorText.textContent = "Email dan password wajib diisi!";
    if (errorMsg) errorMsg.classList.remove("hidden");
    return;
  }

  const client = getAdminSupabaseClient();
  if (!client) {
    if (errorText) errorText.textContent = "Koneksi Supabase belum terkonfigurasi.";
    if (errorMsg) errorMsg.classList.remove("hidden");
    return;
  }

  // Tampilkan indikator loading pada tombol login
  const originalBtnHtml = loginBtn ? loginBtn.innerHTML : "";
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1.5"></i> Memverifikasi...`;
  }
  if (errorMsg) errorMsg.classList.add("hidden");

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      let friendlyMsg = "Email atau Password tidak cocok!";
      const errMsgLower = (error.message || "").toLowerCase();
      if (errMsgLower.includes("email not confirmed")) {
        friendlyMsg = "Email belum dikonfirmasi di Supabase. Anda dapat mematikan fitur 'Confirm email' di menu Auth Settings Supabase.";
      } else if (errMsgLower.includes("invalid login credentials")) {
        friendlyMsg = "Email atau Password salah! Periksa kembali akun di menu Authentication Supabase.";
      } else {
        friendlyMsg = error.message;
      }

      if (errorText) errorText.textContent = friendlyMsg;
      if (errorMsg) errorMsg.classList.remove("hidden");
      if (passInput) passInput.value = "";
    } else if (data && data.session) {
      if (errorMsg) errorMsg.classList.add("hidden");
      showAdminToast("Login berhasil! Selamat datang di Admin Panel.", "success");
      await checkAdminAuth();
    }
  } catch (err) {
    console.error("Kesalahan proses login Supabase:", err);
    if (errorText) errorText.textContent = `Gagal login: ${err.message}`;
    if (errorMsg) errorMsg.classList.remove("hidden");
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = originalBtnHtml;
    }
  }
}

/**
 * Handler Logout Admin via Supabase Auth
 */
async function handleAdminLogout() {
  if (confirm("Apakah Anda yakin ingin keluar dari Admin Panel?")) {
    const client = getAdminSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        console.warn("Gagal sign out dari Supabase:", err);
      }
    }
    showAdminToast("Anda telah keluar dari sesi admin.", "info");
    await checkAdminAuth();
  }
}

/**
 * Toggle visibility password
 */
function togglePasswordVisibility() {
  const passInput = document.getElementById("adminPasswordInput");
  const icon = document.getElementById("passwordToggleIcon");
  if (!passInput) return;

  if (passInput.type === "password") {
    passInput.type = "text";
    if (icon) icon.className = "fas fa-eye-slash";
  } else {
    passInput.type = "password";
    if (icon) icon.className = "fas fa-eye";
  }
}

function initAdminSettings() {
  const sbUrlInput = document.getElementById("supabaseUrlInput");
  const sbKeyInput = document.getElementById("supabaseKeyInput");
  if (sbUrlInput) {
    sbUrlInput.value = localStorage.getItem("shinemart_supabase_url") || DEFAULT_SUPABASE_URL;
  }
  if (sbKeyInput) {
    sbKeyInput.value = localStorage.getItem("shinemart_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;
  }
}

function saveSupabaseConfig() {
  const urlInput = document.getElementById("supabaseUrlInput");
  const keyInput = document.getElementById("supabaseKeyInput");
  const url = urlInput ? urlInput.value.trim() : "";
  const key = keyInput ? keyInput.value.trim() : "";

  if (url && key) {
    localStorage.setItem("shinemart_supabase_url", url);
    localStorage.setItem("shinemart_supabase_anon_key", key);
    adminSupabaseInstance = null;
    showAdminToast("Kredensial Supabase berhasil disimpan!", "success");
    checkAdminAuth();
  } else {
    localStorage.removeItem("shinemart_supabase_url");
    localStorage.removeItem("shinemart_supabase_anon_key");
    adminSupabaseInstance = null;
    showAdminToast("Konfigurasi Supabase dihapus.", "info");
    checkAdminAuth();
  }
}

function setupAdminListeners() {
  const fileInput = document.getElementById("excelFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", handleExcelFileSelect);
  }

  // Drag & drop box
  const dropZone = document.getElementById("excelDropZone");
  if (dropZone) {
    ["dragenter", "dragover"].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add("border-[#38b6ff]", "bg-sky-50/50");
      }, false);
    });

    ["dragleave", "drop"].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove("border-[#38b6ff]", "bg-sky-50/50");
      }, false);
    });

    dropZone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        processExcelBlob(files[0]);
      }
    }, false);
  }

  // Live search di daftar produk Supabase
  const searchInput = document.getElementById("adminSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = liveSupabaseProducts.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
      renderSupabaseProductsTable(filtered);
    });
  }
}

function handleExcelFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processExcelBlob(file);
  }
}

/**
 * Membaca dan mem-parse file Excel/CSV via SheetJS
 */
function processExcelBlob(file) {
  if (typeof XLSX === "undefined") {
    alert("Library SheetJS sedang dimuat. Pastikan koneksi internet stabil.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rawRows || rawRows.length === 0) {
        alert("File Excel kosong atau data tidak ditemukan.");
        return;
      }

      // Mapping kolom fleksibel (Bahasa Indonesia atau Inggris)
      parsedExcelProducts = rawRows.map((row, idx) => {
        const name = row["Nama Produk"] || row["nama"] || row["name"] || row["Nama"] || `Produk ${idx + 1}`;
        const price = Number(row["Harga"] || row["Harga Promo"] || row["price"] || row["harga"] || 0);
        const category = String(row["Kategori"] || row["category"] || "sembako").toLowerCase().trim();
        const imageUrl = row["Gambar URL"] || row["URL Foto"] || row["imageUrl"] || row["image"] || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
        const unit = String(row["Satuan"] || row["unit"] || "PCS").trim();
        const stock = row["Stok"] || row["stock"] || "Ready";

        // Kolom id di database Supabase bertipe BIGINT (angka)
        const rowId = Number(row["ID"] || row["id"] || row["No"] || row["no"]);
        const productId = !isNaN(rowId) && rowId > 0 ? rowId : (Date.now() + idx + 1);

        return {
          id: productId,
          name: String(name).trim(),
          price: price,
          category: category,
          imageUrl: formatGoogleDriveImageUrl(imageUrl),
          stock: String(stock),
          unit: unit
        };
      }).filter(p => p.name && p.price > 0);

      renderPreviewTable(parsedExcelProducts, file.name);
    } catch (err) {
      console.error("Gagal membaca Excel/CSV:", err);
      // Fallback: Coba baca sebagai text / binary string jika format CSV/text
      tryFallbackTextRead(file);
    }
  };

  reader.readAsArrayBuffer(file);
}

/**
 * Fallback pembacaan jika file berformat CSV / teks murni
 */
function tryFallbackTextRead(file) {
  const textReader = new FileReader();
  textReader.onload = function(e) {
    try {
      const textContent = e.target.result;
      const workbook = XLSX.read(textContent, { type: "string" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (rawRows && rawRows.length > 0) {
        parsedExcelProducts = rawRows.map((row, idx) => {
          const name = row["Nama Produk"] || row["nama"] || row["name"] || row["Nama"] || `Produk ${idx + 1}`;
          const price = Number(row["Harga"] || row["Harga Promo"] || row["price"] || row["harga"] || 0);
          const category = String(row["Kategori"] || row["category"] || "sembako").toLowerCase().trim();
          const imageUrl = row["Gambar URL"] || row["URL Foto"] || row["imageUrl"] || row["image"] || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
          const unit = String(row["Satuan"] || row["unit"] || "PCS").trim();
          const stock = row["Stok"] || row["stock"] || "Ready";
          const rowId = Number(row["ID"] || row["id"] || row["No"] || row["no"]);
          const productId = !isNaN(rowId) && rowId > 0 ? rowId : (Date.now() + idx + 1);

          return {
            id: productId,
            name: String(name).trim(),
            price: price,
            category: category,
            imageUrl: formatGoogleDriveImageUrl(imageUrl),
            stock: String(stock),
            unit: unit
          };
        }).filter(p => p.name && p.price > 0);

        renderPreviewTable(parsedExcelProducts, file.name);
        return;
      }
      throw new Error("Empty rows");
    } catch (fallbackErr) {
      console.error("Fallback error:", fallbackErr);
      alert("Format file Excel/CSV tidak dapat dibaca. Pastikan file berformat .xlsx, .xls, atau .csv dengan kolom: Nama Produk, Harga, Kategori, Satuan, Stok.");
    }
  };
  textReader.readAsText(file);
}

/**
 * Modal Paste CSV / Text Handlers
 */
function openPasteModal() {
  const modal = document.getElementById("pasteModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    const input = document.getElementById("pasteTextInput");
    if (input) input.focus();
  }
}

function closePasteModal() {
  const modal = document.getElementById("pasteModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function processPastedText() {
  const input = document.getElementById("pasteTextInput");
  if (!input || !input.value.trim()) {
    alert("Silakan tempel teks CSV/Excel terlebih dahulu.");
    return;
  }

  try {
    const textContent = input.value.trim();
    const workbook = XLSX.read(textContent, { type: "string" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (!rawRows || rawRows.length === 0) {
      alert("Teks tidak dapat dibaca atau kolom tidak sesuai.");
      return;
    }

    parsedExcelProducts = rawRows.map((row, idx) => {
      const name = row["Nama Produk"] || row["nama"] || row["name"] || row["Nama"] || `Produk ${idx + 1}`;
      const price = Number(row["Harga"] || row["Harga Promo"] || row["price"] || row["harga"] || 0);
      const category = String(row["Kategori"] || row["category"] || "sembako").toLowerCase().trim();
      const imageUrl = row["Gambar URL"] || row["URL Foto"] || row["imageUrl"] || row["image"] || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
      const unit = String(row["Satuan"] || row["unit"] || "PCS").trim();
      const stock = row["Stok"] || row["stock"] || "Ready";
      const rowId = Number(row["ID"] || row["id"] || row["No"] || row["no"]);
      const productId = !isNaN(rowId) && rowId > 0 ? rowId : (Date.now() + idx + 1);

      return {
        id: productId,
        name: String(name).trim(),
        price: price,
        category: category,
        imageUrl: formatGoogleDriveImageUrl(imageUrl),
        stock: String(stock),
        unit: unit
      };
    }).filter(p => p.name && p.price > 0);

    closePasteModal();
    renderPreviewTable(parsedExcelProducts, "Data Tempel CSV");
    showAdminToast(`Berhasil membaca ${parsedExcelProducts.length} baris produk!`, "success");

  } catch (err) {
    console.error("Gagal memproses teks:", err);
    alert("Gagal membaca teks. Pastikan baris pertama berisi nama kolom (Nama Produk,Harga,Kategori,Gambar URL,Satuan,Stok).");
  }
}

/**
 * Menampilkan preview tabel data sebelum di-upload
 */
function renderPreviewTable(products, fileName) {
  const previewSection = document.getElementById("previewSection");
  const tableBody = document.getElementById("previewTableBody");
  const countBadge = document.getElementById("previewCountBadge");
  const fileNameBadge = document.getElementById("previewFileName");
  const uploadBtn = document.getElementById("btnUploadToSheets");

  if (!previewSection || !tableBody) return;

  if (products.length === 0) {
    alert("Tidak ada baris data yang valid (Nama Produk wajib diisi dan Harga > 0).");
    previewSection.classList.add("hidden");
    if (uploadBtn) uploadBtn.disabled = true;
    return;
  }

  if (countBadge) countBadge.textContent = `${products.length} produk siap diunggah`;
  if (fileNameBadge) fileNameBadge.textContent = fileName || "File Excel";

  tableBody.innerHTML = products.map((item, index) => `
    <tr class="border-b border-slate-100 hover:bg-sky-50/50 transition text-xs">
      <td class="py-2.5 px-3 text-slate-400 font-mono">${index + 1}</td>
      <td class="py-2.5 px-3">
        <div class="flex items-center gap-2">
          <img src="${item.imageUrl}" alt="${item.name}" class="w-8 h-8 rounded-lg object-cover border border-slate-200" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
          <span class="font-bold text-slate-800">${item.name}</span>
        </div>
      </td>
      <td class="py-2.5 px-3">
        <span class="capitalize font-semibold text-[#0077d6] bg-sky-50 px-2 py-0.5 rounded text-[11px]">${item.category}</span>
      </td>
      <td class="py-2.5 px-3 font-extrabold text-[#0077d6]">${formatRupiah(item.price)}</td>
      <td class="py-2.5 px-3 text-slate-500">${item.unit}</td>
      <td class="py-2.5 px-3">
        <span class="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">${item.stock}</span>
      </td>
    </tr>
  `).join("");

  previewSection.classList.remove("hidden");
  if (uploadBtn) uploadBtn.disabled = false;

  // Scroll ke preview
  previewSection.scrollIntoView({ behavior: "smooth" });
}

/**
 * Mengirim array produk hasil parsing Excel langsung ke Supabase
 */
async function uploadToSupabaseDatabase() {
  if (parsedExcelProducts.length === 0) {
    showAdminToast("Tidak ada produk untuk diunggah!", "info");
    return;
  }

  const uploadBtn = document.getElementById("btnUploadToSheets");
  const originalHtml = uploadBtn ? uploadBtn.innerHTML : "";
  const uploadMode = document.querySelector('input[name="uploadMode"]:checked')?.value || "append";

  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Mengunggah ke Supabase...`;
  }

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) {
    showAdminToast("Client Supabase belum siap. Periksa Project URL & Key!", "error");
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHtml;
    }
    return;
  }

  try {
    if (uploadMode === "replace") {
      // Hapus data lama jika mode replace
      const { error: delError } = await supabaseClient.from("products").delete().neq("id", 0);
      if (delError) console.warn("Peringatan saat menghapus produk lama:", delError);
    }

    // Format data untuk Supabase
    const sbPayload = parsedExcelProducts.map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      category: p.category,
      image_url: p.imageUrl,
      stock: p.stock,
      unit: p.unit
    }));

    const { data, error } = await supabaseClient.from("products").upsert(sbPayload);

    if (error) {
      throw error;
    }

    // Update offline cache
    let currentLocal = [];
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try { currentLocal = JSON.parse(stored); } catch (e) { currentLocal = []; }
    }

    if (uploadMode === "replace") {
      currentLocal = [...parsedExcelProducts];
    } else {
      currentLocal = [...parsedExcelProducts, ...currentLocal];
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentLocal));

    showAdminToast(`Sukses! ${parsedExcelProducts.length} produk tersimpan langsung di Supabase!`, "success");

    // Sembunyikan preview upload dan reload list produk aktif
    const previewSection = document.getElementById("previewSection");
    if (previewSection) previewSection.classList.add("hidden");
    parsedExcelProducts = [];

    // Reset file input
    const fileInput = document.getElementById("excelFileInput");
    if (fileInput) fileInput.value = "";

    // Refresh daftar produk di bawah
    loadSupabaseProductsList();

  } catch (err) {
    console.error("Gagal upload ke Supabase:", err);
    showAdminToast(`Gagal upload: ${err.message || 'Periksa koneksi Supabase'}`, "error");
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHtml;
    }
  }
}

// Backward compatibility alias
const uploadToGoogleSheets = uploadToSupabaseDatabase;

/**
 * Memuat seluruh daftar produk live dari database Supabase
 */
async function loadSupabaseProductsList() {
  const tbody = document.getElementById("supabaseProductsTableBody");
  const countBadge = document.getElementById("supabaseProductCount");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center py-8 text-xs text-slate-400">
        <i class="fas fa-spinner fa-spin mr-1.5"></i> Mengambil data dari Supabase...
      </td>
    </tr>
  `;

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-6 text-xs text-pink-500 font-bold">
          Kredensial Supabase belum terkonfigurasi.
        </td>
      </tr>
    `;
    return;
  }

  try {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .order("id", { ascending: true })
        .range(from, from + step - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < step) {
          hasMore = false;
        } else {
          from += step;
        }
      } else {
        hasMore = false;
      }
    }

    liveSupabaseProducts = allData || [];
    renderSupabaseProductsTable(liveSupabaseProducts);

    if (countBadge) {
      countBadge.textContent = `${liveSupabaseProducts.length} produk`;
    }

  } catch (err) {
    console.warn("Gagal memuat list produk dari Supabase:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-6 text-xs text-slate-500">
          Belum dapat terhubung ke tabel Supabase. Pastikan tabel <code class="bg-slate-100 px-1 py-0.5 rounded">products</code> telah dibuat.
        </td>
      </tr>
    `;
  }
}

/**
 * Ekstraksi info promo dari string stok (misal: "Ready [PROMO:percent:20]")
 */
function parsePromo(stockStr) {
  if (!stockStr || typeof stockStr !== "string") {
    return { cleanStock: stockStr || "Ready", promo: null };
  }
  const match = stockStr.match(/\[PROMO:([a-z0-9_]+):?([0-9.]*)\]/i);
  if (match) {
    const type = match[1].toLowerCase();
    const value = Number(match[2]) || 0;
    const cleanStock = stockStr.replace(match[0], "").trim() || "Ready";
    return {
      cleanStock: cleanStock,
      promo: {
        type: type, // 'percent', 'b1g1', 'nominal'
        value: value
      }
    };
  }
  return { cleanStock: stockStr.trim() || "Ready", promo: null };
}

/**
 * Hitung kalkulasi promo (harga asli, diskon, harga akhir, label)
 */
function getPromoDetails(originalPrice, promo) {
  const basePrice = Number(originalPrice) || 0;
  if (!promo || !promo.type || promo.type === "none") {
    return {
      hasPromo: false,
      promoType: "none",
      promoValue: 0,
      finalPrice: basePrice,
      originalPrice: basePrice,
      discountAmount: 0,
      label: ""
    };
  }
  let finalPrice = basePrice;
  let discountAmount = 0;
  let label = "";

  if (promo.type === "percent") {
    const percent = Math.min(Math.max(Number(promo.value) || 0, 1), 99);
    discountAmount = Math.round((basePrice * percent) / 100);
    finalPrice = Math.max(0, basePrice - discountAmount);
    label = `Diskon ${percent}%`;
  } else if (promo.type === "nominal") {
    discountAmount = Math.min(basePrice, Number(promo.value) || 0);
    finalPrice = Math.max(0, basePrice - discountAmount);
    label = `Hemat ${formatRupiah(discountAmount)}`;
  } else if (promo.type === "b1g1") {
    finalPrice = basePrice;
    label = "Buy 1 Get 1";
  }

  return {
    hasPromo: true,
    promoType: promo.type,
    promoValue: promo.value,
    finalPrice: finalPrice,
    originalPrice: basePrice,
    discountAmount: discountAmount,
    label: label
  };
}

/**
 * Render tabel produk live Supabase
 */
function renderSupabaseProductsTable(items) {
  const tbody = document.getElementById("supabaseProductsTableBody");
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-8 text-xs text-slate-400">
          Belum ada produk di database Supabase. Silakan unggah produk melalui file Excel di atas.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map((item, idx) => {
    const imgUrl = formatGoogleDriveImageUrl(item.image_url || item.imageUrl);
    const promoInfo = parsePromo(item.stock);
    const promoDetails = getPromoDetails(item.price, promoInfo.promo);

    let priceHtml = `<div class="font-extrabold text-[#0077d6]">${formatRupiah(item.price)}</div>`;
    if (promoDetails.hasPromo) {
      if (promoDetails.promoType === "b1g1") {
        priceHtml = `
          <div>
            <div class="font-extrabold text-[#0077d6]">${formatRupiah(item.price)}</div>
            <span class="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-extrabold text-[9px] px-1.5 py-0.5 rounded mt-0.5">
              <i class="fas fa-gift text-amber-600"></i> BUY 1 GET 1
            </span>
          </div>
        `;
      } else if (promoDetails.promoType === "percent") {
        priceHtml = `
          <div>
            <span class="text-[10px] text-slate-400 line-through">${formatRupiah(item.price)}</span>
            <div class="font-extrabold text-pink-600">${formatRupiah(promoDetails.finalPrice)}</div>
            <span class="inline-flex items-center gap-1 bg-pink-100 text-[#ff66c4] font-black text-[9px] px-1.5 py-0.5 rounded mt-0.5">
              <i class="fas fa-fire"></i> DISKON ${promoDetails.promoValue}%
            </span>
          </div>
        `;
      } else if (promoDetails.promoType === "nominal") {
        priceHtml = `
          <div>
            <span class="text-[10px] text-slate-400 line-through">${formatRupiah(item.price)}</span>
            <div class="font-extrabold text-emerald-600">${formatRupiah(promoDetails.finalPrice)}</div>
            <span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 font-black text-[9px] px-1.5 py-0.5 rounded mt-0.5">
              <i class="fas fa-tags"></i> -${formatRupiah(promoDetails.discountAmount)}
            </span>
          </div>
        `;
      }
    }

    return `
      <tr class="hover:bg-sky-50/40 border-b border-slate-100 transition text-xs">
        <td class="py-3 px-3 font-mono text-slate-400 text-center">${idx + 1}</td>
        <td class="py-3 px-3">
          <div onclick="openProductImageModal('${imgUrl.replace(/'/g, "\\'")}', '${item.name.replace(/'/g, "\\'")}', '${(item.category || 'sembako').replace(/'/g, "\\'")}')"
            class="w-16 h-16 rounded-2xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer relative group shadow-sm hover:border-[#38b6ff] transition"
            title="Klik untuk melihat foto lebih jelas & besar">
            <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-110" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition text-xs font-bold rounded-2xl">
              <i class="fas fa-search-plus"></i>
            </div>
          </div>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-800 text-xs md:text-sm">${item.name}</div>
          <span class="text-[10px] text-slate-400 font-mono">ID: ${item.id}</span>
        </td>
        <td class="py-3 px-3">
          <span class="capitalize font-semibold text-[#0077d6] bg-sky-50 px-2 py-0.5 rounded text-[11px]">${item.category || 'sembako'}</span>
        </td>
        <td class="py-3 px-3">${priceHtml}</td>
        <td class="py-3 px-3 text-slate-500">${item.unit || '1 Pcs'}</td>
        <td class="py-3 px-3">
          <span class="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">${promoInfo.cleanStock || 'Ready'}</span>
        </td>
        <td class="py-3 px-3 text-center">
          <label class="relative inline-flex items-center cursor-pointer" title="${item.is_active !== false ? 'Produk Tayang di Mobile App (Klik untuk sembunyikan)' : 'Produk Disembunyikan dari App (Klik untuk tayangkan)'}">
            <input type="checkbox" ${item.is_active !== false ? 'checked' : ''} onchange="toggleProductActiveStatus('${item.id}', this.checked)" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </td>
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditProductModal('${item.id}')"
              class="px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-[#38b6ff] text-[#0077d6] hover:text-white transition font-bold text-xs"
              title="Edit Produk">
              <i class="fas fa-edit mr-1"></i> Edit
            </button>
            <button onclick="deleteProductFromSupabase('${item.id}', '${item.name.replace(/'/g, "\\'")}')"
              class="px-2.5 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-500 text-pink-600 hover:text-white transition font-bold text-xs"
              title="Hapus Produk dari Supabase">
              <i class="fas fa-trash-alt mr-1"></i> Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Handle perubahan jenis promo pada dropdown edit produk
 */
function handlePromoTypeChange() {
  const type = document.getElementById("editProductPromoType")?.value || "none";
  const valWrapper = document.getElementById("promoValueWrapper");
  const valLabel = document.getElementById("promoValueLabel");
  const valUnit = document.getElementById("promoValueUnit");
  const valInput = document.getElementById("editProductPromoValue");
  const summaryBox = document.getElementById("promoSummaryBox");
  const b1g1Notice = document.getElementById("promoB1G1Notice");

  if (type === "none") {
    if (valWrapper) valWrapper.classList.add("hidden");
    if (summaryBox) summaryBox.classList.add("hidden");
    if (b1g1Notice) b1g1Notice.classList.add("hidden");
    return;
  }

  if (summaryBox) summaryBox.classList.remove("hidden");

  if (type === "percent") {
    if (valWrapper) valWrapper.classList.remove("hidden");
    if (valLabel) valLabel.textContent = "Besar Diskon (%)";
    if (valUnit) valUnit.textContent = "%";
    if (valInput) {
      valInput.placeholder = "20";
      valInput.max = "99";
      valInput.step = "1";
    }
    if (b1g1Notice) b1g1Notice.classList.add("hidden");
  } else if (type === "nominal") {
    if (valWrapper) valWrapper.classList.remove("hidden");
    if (valLabel) valLabel.textContent = "Nominal Potongan (Rp)";
    if (valUnit) valUnit.textContent = "Rp";
    if (valInput) {
      valInput.placeholder = "5000";
      valInput.removeAttribute("max");
      valInput.step = "100";
    }
    if (b1g1Notice) b1g1Notice.classList.add("hidden");
  } else if (type === "b1g1") {
    if (valWrapper) valWrapper.classList.add("hidden");
    if (b1g1Notice) b1g1Notice.classList.remove("hidden");
  }

  updatePromoCalculationPreview();
}

/**
 * Live kalkulasi harga promo pada modal edit produk
 */
function updatePromoCalculationPreview() {
  const price = Number(document.getElementById("editProductPrice")?.value) || 0;
  const type = document.getElementById("editProductPromoType")?.value || "none";
  const val = Number(document.getElementById("editProductPromoValue")?.value) || 0;

  const summaryBox = document.getElementById("promoSummaryBox");
  if (!summaryBox) return;

  if (type === "none") {
    summaryBox.classList.add("hidden");
    return;
  }
  summaryBox.classList.remove("hidden");

  const details = getPromoDetails(price, { type, value: val });

  const origEl = document.getElementById("promoOriginalPricePreview");
  const discLabel = document.getElementById("promoDiscountLabelPreview");
  const discEl = document.getElementById("promoDiscountAmountPreview");
  const finalEl = document.getElementById("promoFinalPricePreview");

  if (origEl) origEl.textContent = formatRupiah(details.originalPrice);
  if (finalEl) finalEl.textContent = formatRupiah(details.finalPrice);

  if (type === "b1g1") {
    if (discLabel) discLabel.textContent = "Bonus Tambahan:";
    if (discEl) discEl.textContent = "+1 Pcs Gratis (Total 2 Pcs)";
  } else {
    if (discLabel) discLabel.textContent = "Potongan Diskon:";
    if (discEl) discEl.textContent = `-${formatRupiah(details.discountAmount)}`;
  }
}

/**
 * Buka modal edit produk dan populate nilai input
 */
function openEditProductModal(productId) {
  const product = liveSupabaseProducts.find(p => String(p.id) === String(productId));
  if (!product) {
    showAdminToast("Data produk tidak ditemukan!", "error");
    return;
  }

  const idInput = document.getElementById("editProductId");
  const nameInput = document.getElementById("editProductName");
  const catInput = document.getElementById("editProductCategory");
  const priceInput = document.getElementById("editProductPrice");
  const unitInput = document.getElementById("editProductUnit");
  const stockInput = document.getElementById("editProductStock");
  const imgInput = document.getElementById("editProductImageUrl");
  const imgPreview = document.getElementById("editImagePreview");
  const promoTypeSelect = document.getElementById("editProductPromoType");
  const promoValueInput = document.getElementById("editProductPromoValue");

  if (idInput) idInput.value = product.id;
  if (nameInput) nameInput.value = product.name || "";
  
  if (catInput) {
    const options = Array.from(catInput.options);
    const prodCatLower = (product.category || "").toLowerCase().trim();
    const matched = options.find(o => o.value.toLowerCase().trim() === prodCatLower);
    if (matched) {
      catInput.value = matched.value;
    } else {
      catInput.value = product.category || "Sembako";
    }
  }

  if (priceInput) priceInput.value = product.price || 0;
  if (unitInput) unitInput.value = product.unit || "";
  
  // Parse info promo yang tersimpan di field stock
  const promoInfo = parsePromo(product.stock);
  if (stockInput) stockInput.value = promoInfo.cleanStock || "Ready";

  if (promoTypeSelect) {
    promoTypeSelect.value = promoInfo.promo ? promoInfo.promo.type : "none";
  }
  if (promoValueInput) {
    promoValueInput.value = promoInfo.promo && promoInfo.promo.value ? promoInfo.promo.value : "";
  }
  
  const currentImg = product.image_url || product.imageUrl || "";
  if (imgInput) imgInput.value = currentImg;
  updateEditImagePreview(currentImg);

  handlePromoTypeChange();
  updatePromoCalculationPreview();

  const modal = document.getElementById("editProductModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

/**
 * Tutup modal edit produk
 */
function closeEditProductModal() {
  const modal = document.getElementById("editProductModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

/**
 * Update pratinjau gambar saat link URL diubah di modal edit
 */
function updateEditImagePreview(url) {
  const imgPreview = document.getElementById("editImagePreview");
  const btnExternal = document.getElementById("btnOpenEditImageExternal");
  const formatted = formatGoogleDriveImageUrl(url);
  if (imgPreview) {
    imgPreview.src = formatted || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
  }
  if (btnExternal) {
    btnExternal.href = formatted || "#";
  }
}

/**
 * Toggle perbesar / perkecil ukuran foto langsung di dalam form edit
 */
function toggleExpandEditImage() {
  const container = document.getElementById("editImageContainer");
  const textElem = document.getElementById("toggleExpandText");
  if (!container) return;

  if (container.classList.contains("h-44")) {
    container.classList.remove("h-44");
    container.classList.add("h-80");
    if (textElem) textElem.textContent = "Kecilkan";
  } else {
    container.classList.remove("h-80");
    container.classList.add("h-44");
    if (textElem) textElem.textContent = "Perbesar";
  }
}

/**
 * Simpan hasil edit produk langsung ke Supabase
 */
async function handleSaveEditedProduct(event) {
  event.preventDefault();

  const id = document.getElementById("editProductId")?.value;
  const name = document.getElementById("editProductName")?.value?.trim();
  const category = document.getElementById("editProductCategory")?.value?.trim();
  const price = Number(document.getElementById("editProductPrice")?.value) || 0;
  const unit = document.getElementById("editProductUnit")?.value?.trim() || "1 Pcs";
  const cleanStock = document.getElementById("editProductStock")?.value?.trim() || "Ready";
  const imageUrl = document.getElementById("editProductImageUrl")?.value?.trim() || "";

  // Ambil data promo
  const promoType = document.getElementById("editProductPromoType")?.value || "none";
  const promoValue = Number(document.getElementById("editProductPromoValue")?.value) || 0;

  if (!id || !name) {
    showAdminToast("Nama produk tidak boleh kosong!", "error");
    return;
  }

  // Bentuk format stock dengan tag promo
  let finalStock = cleanStock;
  if (promoType === "percent" && promoValue > 0) {
    finalStock = `${cleanStock} [PROMO:percent:${promoValue}]`;
  } else if (promoType === "nominal" && promoValue > 0) {
    finalStock = `${cleanStock} [PROMO:nominal:${promoValue}]`;
  } else if (promoType === "b1g1") {
    finalStock = `${cleanStock} [PROMO:b1g1:1]`;
  }

  const btnSave = document.getElementById("btnSaveEditProduct");
  const originalBtnHtml = btnSave ? btnSave.innerHTML : "";
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = `<i class="fas fa-spinner fa-spin mr-1.5"></i> Menyimpan...`;
  }

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) {
    showAdminToast("Client Supabase tidak tersedia!", "error");
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = originalBtnHtml;
    }
    return;
  }

  try {
    const updatedPayload = {
      name: name,
      category: category,
      price: price,
      unit: unit,
      stock: finalStock,
      image_url: imageUrl
    };

    const { data, error } = await supabaseClient
      .from("products")
      .update(updatedPayload)
      .eq("id", id);

    if (error) throw error;

    // Update data di cache lokal / memori admin
    const idx = liveSupabaseProducts.findIndex(p => String(p.id) === String(id));
    if (idx !== -1) {
      liveSupabaseProducts[idx] = {
        ...liveSupabaseProducts[idx],
        ...updatedPayload
      };
    }

    // Perbarui localStorage jika ada
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        let localData = JSON.parse(stored);
        const lIdx = localData.findIndex(p => String(p.id) === String(id));
        if (lIdx !== -1) {
          localData[lIdx] = {
            ...localData[lIdx],
            ...updatedPayload,
            imageUrl: imageUrl
          };
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localData));
        }
      } catch (e) {
        console.warn("Gagal update localStorage cache:", e);
      }
    }

    const promoLabel = promoType !== "none" ? " dan status promo diaktifkan" : "";
    showAdminToast(`Produk "${name}" berhasil diperbarui${promoLabel}!`, "success");
    closeEditProductModal();
    renderSupabaseProductsTable(liveSupabaseProducts);

  } catch (err) {
    console.error("Gagal update produk:", err);
    showAdminToast(`Gagal menyimpan: ${err.message || 'Periksa koneksi Supabase'}`, "error");
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = originalBtnHtml;
    }
  }
}

/**
 * Hapus produk dari database Supabase
 */
async function deleteProductFromSupabase(productId, productName) {
  if (!confirm(`Hapus "${productName}" dari database Supabase?`)) {
    return;
  }

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.from("products").delete().eq("id", productId);
    if (error) throw error;

    showAdminToast(`Produk "${productName}" berhasil dihapus dari Supabase.`, "success");
    loadSupabaseProductsList();

  } catch (err) {
    console.error("Gagal menghapus produk:", err);
    showAdminToast(`Gagal menghapus: ${err.message}`, "error");
  }
}

/**
 * Download Template Excel resmi (.xlsx)
 */
function downloadTemplateExcel() {
  if (typeof XLSX === "undefined") {
    alert("Library SheetJS sedang dimuat. Silakan tunggu.");
    return;
  }

  const templateData = [
    {
      "Nama Produk": "Beras Pandan Wangi 5kg",
      "Harga": 78500,
      "Kategori": "sembako",
      "Gambar URL": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500",
      "Satuan": "5 kg / Sak",
      "Stok": "Ready 50 sak"
    },
    {
      "Nama Produk": "Minyak Goreng Bimoli 2L",
      "Harga": 34500,
      "Kategori": "sembako",
      "Gambar URL": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500",
      "Satuan": "Pouch 2 Liter",
      "Stok": "Ready Stock"
    },
    {
      "Nama Produk": "Fiesta Nugget Crispy 500g",
      "Harga": 48500,
      "Kategori": "frozen",
      "Gambar URL": "https://images.unsplash.com/photo-1562967914-608f82629710?w=500",
      "Satuan": "Pack 500g",
      "Stok": "Ready di Freezer"
    }
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produk");
  XLSX.writeFile(wb, "Template_Bulk_Produk_Shinemart.xlsx");
}

function showAdminToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl text-white font-bold text-xs md:text-sm shadow-2xl transition-all duration-300 transform translate-y-4 opacity-0 flex items-center gap-2.5 ${
    type === 'success' ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-slate-800'
  }`;
  
  toast.innerHTML = `
    <i class="${type === 'success' ? 'fas fa-check-circle' : 'fas fa-info-circle'} text-base"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => toast.classList.remove("translate-y-4", "opacity-0"), 50);
  setTimeout(() => {
    toast.classList.add("translate-y-4", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(amount);
}

// ==============================================================================
// BANNER MANAGEMENT (CRUD) DI ADMIN PANEL
// ==============================================================================
let liveSupabaseBanners = [];
let selectedBannerFile = null;
let currentAdminTab = "products";

/**
 * Switch Tab: Kelola Produk vs Banner Promosi Homepage
 */
function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  const ordersTab = document.getElementById("ordersTabSection");
  const productsTab = document.getElementById("productsTabSection");
  const bannersTab = document.getElementById("bannersTabSection");
  const sectionsTab = document.getElementById("sectionsTabSection");
  const appSettingsTab = document.getElementById("appSettingsTabSection");

  const tabBtnOrders = document.getElementById("tabBtnOrders");
  const tabBtnProducts = document.getElementById("tabBtnProducts");
  const tabBtnBanners = document.getElementById("tabBtnBanners");
  const tabBtnSections = document.getElementById("tabBtnSections");
  const tabBtnAppSettings = document.getElementById("tabBtnAppSettings");

  const btnTopAddBanner = document.getElementById("btnTopAddBanner");
  const btnTopAddSection = document.getElementById("btnTopAddSection");

  // Reset semua tab konten
  if (ordersTab) ordersTab.classList.add("hidden");
  if (productsTab) productsTab.classList.add("hidden");
  if (bannersTab) bannersTab.classList.add("hidden");
  if (sectionsTab) sectionsTab.classList.add("hidden");
  if (appSettingsTab) appSettingsTab.classList.add("hidden");

  // Reset tombol top bar
  if (btnTopAddBanner) btnTopAddBanner.classList.add("hidden");
  if (btnTopAddSection) btnTopAddSection.classList.add("hidden");

  // Reset styling tab buttons
  const inactiveClass = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition text-slate-600 hover:text-slate-900";
  if (tabBtnOrders) tabBtnOrders.className = inactiveClass;
  if (tabBtnProducts) tabBtnProducts.className = inactiveClass;
  if (tabBtnBanners) tabBtnBanners.className = inactiveClass;
  if (tabBtnSections) tabBtnSections.className = inactiveClass;
  if (tabBtnAppSettings) tabBtnAppSettings.className = inactiveClass;

  if (tabName === "orders") {
    if (ordersTab) ordersTab.classList.remove("hidden");
    if (tabBtnOrders) {
      tabBtnOrders.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#0077d6] relative";
    }
    loadAdminOrdersList();
  } else if (tabName === "banners") {
    if (bannersTab) bannersTab.classList.remove("hidden");
    if (btnTopAddBanner) btnTopAddBanner.classList.remove("hidden");
    if (tabBtnBanners) {
      tabBtnBanners.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#ff66c4]";
    }
    loadSupabaseBannersList();
    if (typeof loadMobileBannersList === "function") loadMobileBannersList();
    if (typeof switchBannerPlatformTab === "function") {
      switchBannerPlatformTab(currentBannerPlatform || "web");
    }
  } else if (tabName === "sections") {
    if (sectionsTab) sectionsTab.classList.remove("hidden");
    if (btnTopAddSection) btnTopAddSection.classList.remove("hidden");
    if (tabBtnSections) {
      tabBtnSections.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#0077d6]";
    }
    loadSupabaseSectionsList();
    if (typeof loadMobileSectionsList === "function") loadMobileSectionsList();
    if (typeof switchSectionPlatformTab === "function") {
      switchSectionPlatformTab(currentSectionPlatform || "web");
    }
  } else if (tabName === "appSettings") {
    if (appSettingsTab) appSettingsTab.classList.remove("hidden");
    if (tabBtnAppSettings) {
      tabBtnAppSettings.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 transition shadow-sm bg-white text-emerald-600";
    }
    loadStoreOperationalSettings();
  } else {
    // Default: products
    if (productsTab) productsTab.classList.remove("hidden");
    if (tabBtnProducts) {
      tabBtnProducts.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#0077d6]";
    }
    loadSupabaseProductsList();
  }
}

/**
 * Memuat seluruh daftar banner live dari Supabase
 */
async function loadSupabaseBannersList() {
  const tbody = document.getElementById("supabaseBannersTableBody");
  const countBadge = document.getElementById("supabaseBannersCount");
  const topBadge = document.getElementById("adminBannerCountBadge");
  const summaryEl = document.getElementById("activeBannersSummary");

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-8 text-xs text-slate-400">
        <i class="fas fa-spinner fa-spin mr-1.5"></i> Mengambil data banner dari Supabase...
      </td>
    </tr>
  `;

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-6 text-xs text-pink-500 font-bold">
          Kredensial Supabase belum terkonfigurasi.
        </td>
      </tr>
    `;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("banners")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      // Jika tabel belum dibuat (PGRST205 / 404)
      if (error.code === "PGRST205" || String(error.message).includes("schema cache") || String(error.message).includes("banners")) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-8 px-4">
              <div class="max-w-md mx-auto space-y-3">
                <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl mx-auto">
                  <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h4 class="font-extrabold text-slate-800 text-sm">Tabel "banners" Belum Dibuat di Supabase</h4>
                <p class="text-xs text-slate-500 leading-relaxed">
                  Supabase belum mendeteksi tabel <code>public.banners</code>. Silakan jalankan script SQL yang telah disediakan untuk membuat tabel dan storage bucket.
                </p>
                <button onclick="openSqlGuideModal()" class="px-4 py-2 bg-gradient-to-r from-[#0077d6] to-[#38b6ff] text-white font-extrabold rounded-xl text-xs shadow transition">
                  <i class="fas fa-code mr-1.5"></i> Buka Panduan &amp; Salin Script SQL
                </button>
              </div>
            </td>
          </tr>
        `;
        if (countBadge) countBadge.textContent = "0 banner";
        if (topBadge) topBadge.textContent = "0";
        return;
      }
      throw error;
    }

    liveSupabaseBanners = data || [];
    renderSupabaseBannersTable(liveSupabaseBanners);

    const activeCount = liveSupabaseBanners.filter(b => b.is_active).length;
    if (countBadge) countBadge.textContent = `${liveSupabaseBanners.length} banner (${activeCount} aktif)`;
    if (topBadge) topBadge.textContent = activeCount;
    const pillBadge = document.getElementById("supabaseBannersCountBadge");
    if (pillBadge) pillBadge.textContent = liveSupabaseBanners.length;
    if (summaryEl) summaryEl.textContent = `${activeCount} dari ${liveSupabaseBanners.length} banner sedang tayang`;

  } catch (err) {
    console.error("Gagal memuat list banner dari Supabase:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-6 text-xs text-rose-500">
          Gagal memuat data: ${err.message || 'Periksa koneksi Supabase'}
        </td>
      </tr>
    `;
  }
}

/**
 * Render Tabel Banner di Dashboard Admin
 */
function renderSupabaseBannersTable(items) {
  const tbody = document.getElementById("supabaseBannersTableBody");
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 px-4">
          <div class="max-w-sm mx-auto space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-pink-50 text-[#ff66c4] flex items-center justify-center text-xl mx-auto">
              <i class="fas fa-images"></i>
            </div>
            <h4 class="font-extrabold text-slate-800 text-sm">Belum Ada Banner di Database</h4>
            <p class="text-xs text-slate-400">
              Tambahkan slide promosi pertama Anda untuk ditampilkan di homepage katalog.
            </p>
            <button onclick="openAddBannerModal()" class="px-4 py-2 bg-[#ff66c4] text-white font-bold rounded-xl text-xs hover:bg-[#e043a5] transition shadow-sm">
              <i class="fas fa-plus mr-1"></i> Tambah Banner Baru
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map((banner) => {
    const imgSrc = formatGoogleDriveImageUrl(banner.image_url);
    const badgeText = banner.badge_text || "KATALOG ONLINE";
    const isActive = Boolean(banner.is_active);

    return `
      <tr class="hover:bg-pink-50/30 border-b border-slate-100 transition text-xs">
        <!-- Urutan Slide -->
        <td class="py-3 px-3 text-center">
          <span class="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-extrabold font-mono text-[11px] border border-slate-200">
            Slide ${banner.sort_order || 1}
          </span>
        </td>

        <!-- Foto Slide -->
        <td class="py-3 px-3">
          <div class="w-24 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group">
            <img src="${imgSrc}" alt="${banner.title}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <a href="${imgSrc}" target="_blank" class="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs font-bold" title="Lihat Foto Full">
              <i class="fas fa-external-link-alt"></i>
            </a>
          </div>
        </td>

        <!-- Badge & Judul -->
        <td class="py-3 px-3 max-w-xs">
          <div class="space-y-1">
            <span class="inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-[#0077d6]">
              ${badgeText}
            </span>
            <div class="font-extrabold text-slate-900 text-xs sm:text-sm line-clamp-1" title="${banner.title}">
              ${banner.title}
            </div>
            <div class="text-[11px] text-slate-400 line-clamp-1" title="${banner.description || '-'}">
              ${banner.description || '-'}
            </div>
          </div>
        </td>

        <!-- Tombol CTA -->
        <td class="py-3 px-3">
          <div class="space-y-0.5">
            <div class="font-bold text-slate-700 flex items-center gap-1.5">
              <i class="fas fa-mouse-pointer text-[#ff66c4] text-[10px]"></i>
              <span class="truncate">${banner.button_text || 'Lihat Katalog Produk'}</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono truncate" title="${banner.button_url || '#katalog'}">
              ${banner.button_url || '#katalog'}
            </div>
          </div>
        </td>

        <!-- Status Tayang -->
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-2">
            ${isActive ? `
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 border border-emerald-200">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Aktif</span>
              </span>
              <button onclick="toggleBannerActiveStatus('${banner.id}', false)"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition flex items-center justify-center text-xs"
                title="Sembunyikan / Nonaktifkan banner">
                <i class="fas fa-eye-slash"></i>
              </button>
            ` : `
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-500 border border-slate-200">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span>Nonaktif</span>
              </span>
              <button onclick="toggleBannerActiveStatus('${banner.id}', true)"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition flex items-center justify-center text-xs"
                title="Aktifkan / Tayangkan banner">
                <i class="fas fa-eye"></i>
              </button>
            `}
          </div>
        </td>

        <!-- Aksi -->
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditBannerModal('${banner.id}')"
              class="w-7 h-7 rounded-lg bg-sky-50 text-[#0077d6] hover:bg-[#38b6ff] hover:text-white transition flex items-center justify-center text-xs"
              title="Edit Banner">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteBannerFromSupabase('${banner.id}', '${banner.title.replace(/'/g, "\\'")}')"
              class="w-7 h-7 rounded-lg bg-pink-50 text-[#ff66c4] hover:bg-rose-600 hover:text-white transition flex items-center justify-center text-xs"
              title="Hapus Banner">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Filter tabel banner saat admin mengetik pencarian
 */
function filterBannersTable() {
  const query = (document.getElementById("bannerSearchInput")?.value || "").toLowerCase().trim();
  if (!query) {
    renderSupabaseBannersTable(liveSupabaseBanners);
    return;
  }
  const filtered = liveSupabaseBanners.filter(b => 
    (b.title || "").toLowerCase().includes(query) ||
    (b.badge_text || "").toLowerCase().includes(query) ||
    (b.description || "").toLowerCase().includes(query)
  );
  renderSupabaseBannersTable(filtered);
}

/**
 * Buka Modal Tambah Banner Baru
 */
function openAddBannerModal() {
  selectedBannerFile = null;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal("bannerId", "");
  setVal("bannerExistingImageUrl", "");
  setVal("bannerTitleInput", "");
  setVal("bannerBadgeInput", "KATALOG ONLINE");
  setVal("bannerDescriptionInput", "");
  setVal("bannerButtonTextInput", "Lihat Katalog Produk");
  setVal("bannerButtonUrlInput", "#katalog");
  setVal("bannerSortOrderInput", (liveSupabaseBanners ? liveSupabaseBanners.length : 0) + 1);
  
  const activeInput = document.getElementById("bannerIsActiveInput");
  if (activeInput) activeInput.checked = true;
  setVal("bannerImageUrlInput", "");

  const fileInput = document.getElementById("bannerImageFileInput");
  if (fileInput) fileInput.value = "";
  const fileLabel = document.getElementById("bannerImageFileLabel");
  if (fileLabel) fileLabel.textContent = "Pilih / Upload Gambar ke Supabase Storage";

  const titleEl = document.getElementById("bannerModalTitle");
  if (titleEl) titleEl.textContent = "Tambah Banner Baru";
  updateBannerLivePreview();

  const modal = document.getElementById("bannerModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

/**
 * Buka Modal Edit Banner
 */
function openEditBannerModal(bannerId) {
  const banner = liveSupabaseBanners.find(b => String(b.id) === String(bannerId));
  if (!banner) return;

  selectedBannerFile = null;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal("bannerId", banner.id);
  setVal("bannerExistingImageUrl", banner.image_url || "");
  setVal("bannerTitleInput", banner.title || "");
  setVal("bannerBadgeInput", banner.badge_text || "KATALOG ONLINE");
  setVal("bannerDescriptionInput", banner.description || "");
  setVal("bannerButtonTextInput", banner.button_text || "Lihat Katalog Produk");
  setVal("bannerButtonUrlInput", banner.button_url || "#katalog");
  setVal("bannerSortOrderInput", banner.sort_order || 1);
  
  const activeInput = document.getElementById("bannerIsActiveInput");
  if (activeInput) activeInput.checked = Boolean(banner.is_active);
  setVal("bannerImageUrlInput", banner.image_url || "");

  const fileInput = document.getElementById("bannerImageFileInput");
  if (fileInput) fileInput.value = "";
  const fileLabel = document.getElementById("bannerImageFileLabel");
  if (fileLabel) fileLabel.textContent = "Ganti Gambar via Supabase Storage (Opsional)";

  const titleEl = document.getElementById("bannerModalTitle");
  if (titleEl) titleEl.textContent = "Edit Banner Promosi";
  updateBannerLivePreview();

  const modal = document.getElementById("bannerModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeBannerModal() {
  const modal = document.getElementById("bannerModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

/**
 * Handler saat file gambar dipilih di form banner
 */
function handleBannerFileSelected(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran gambar melebihi batas 5 MB. Silakan pilih gambar yang lebih kecil.");
      input.value = "";
      return;
    }
    selectedBannerFile = file;
    const label = document.getElementById("bannerImageFileLabel");
    if (label) label.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;

    // Preview lokal seketika
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = document.getElementById("previewBannerImg");
      if (previewImg) previewImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

/**
 * Handler saat user mengetik URL gambar manual
 */
function handleBannerUrlInput(url) {
  selectedBannerFile = null;
  const label = document.getElementById("bannerImageFileLabel");
  if (label) label.textContent = "Pilih / Upload Gambar ke Supabase Storage";
  const fileInput = document.getElementById("bannerImageFileInput");
  if (fileInput) fileInput.value = "";

  const previewImg = document.getElementById("previewBannerImg");
  if (previewImg && url.trim()) {
    previewImg.src = formatGoogleDriveImageUrl(url.trim());
  }
}

/**
 * Update pratinjau live banner di modal
 */
function updateBannerLivePreview() {
  const title = document.getElementById("bannerTitleInput")?.value.trim() || "PROMO SPESIAL SHINEMART";
  const badge = document.getElementById("bannerBadgeInput")?.value.trim() || "KATALOG ONLINE";
  const desc = document.getElementById("bannerDescriptionInput")?.value.trim() || "Diskon hingga 35% Sembako & Kebutuhan Dapur Hemat!";
  const btnText = document.getElementById("bannerButtonTextInput")?.value.trim() || "Lihat Katalog Produk";
  const existingUrl = document.getElementById("bannerExistingImageUrl")?.value.trim();
  const manualUrl = document.getElementById("bannerImageUrlInput")?.value.trim();

  const previewTitle = document.getElementById("previewBannerTitle");
  const previewBadge = document.getElementById("previewBannerBadge");
  const previewDesc = document.getElementById("previewBannerDesc");
  const previewBtn = document.getElementById("previewBannerBtn");
  const previewImg = document.getElementById("previewBannerImg");

  if (previewTitle) previewTitle.textContent = title;
  if (previewBadge) previewBadge.textContent = badge;
  if (previewDesc) previewDesc.textContent = desc;
  if (previewBtn) {
    const span = previewBtn.querySelector("span");
    if (span) span.textContent = btnText;
    else previewBtn.textContent = btnText;
  }

  if (previewImg && !selectedBannerFile) {
    const url = manualUrl || existingUrl || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800";
    previewImg.src = formatGoogleDriveImageUrl(url);
  }
}

/**
 * Simpan Banner ke Supabase (Upload Gambar ke Storage + Insert/Update Database)
 */
async function handleSaveBanner(event) {
  event.preventDefault();
  const btn = document.getElementById("btnSaveBanner");
  const originalHtml = btn.innerHTML;

  const bannerId = document.getElementById("bannerId").value.trim();
  const title = document.getElementById("bannerTitleInput").value.trim();
  const badge_text = document.getElementById("bannerBadgeInput").value.trim() || "KATALOG ONLINE";
  const description = document.getElementById("bannerDescriptionInput").value.trim();
  const button_text = document.getElementById("bannerButtonTextInput").value.trim() || "Lihat Katalog Produk";
  const button_url = document.getElementById("bannerButtonUrlInput").value.trim() || "#katalog";
  const sort_order = parseInt(document.getElementById("bannerSortOrderInput").value) || 1;
  const is_active = document.getElementById("bannerIsActiveInput").checked;

  const existingUrl = document.getElementById("bannerExistingImageUrl").value.trim();
  const manualUrl = document.getElementById("bannerImageUrlInput").value.trim();

  let finalImageUrl = manualUrl || existingUrl;

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) {
    showAdminToast("Koneksi Supabase belum terkonfigurasi.", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1.5"></i> Menyimpan...`;

  try {
    // 1. Jika ada file lokal yang dipilih, upload ke Supabase Storage (bucket 'banners')
    if (selectedBannerFile) {
      btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1.5"></i> Upload Foto ke Storage...`;
      const fileExt = selectedBannerFile.name.split('.').pop() || 'jpg';
      const cleanFileName = `banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

      const { data: uploadData, error: uploadErr } = await supabaseClient.storage
        .from("banners")
        .upload(cleanFileName, selectedBannerFile, {
          cacheControl: "3600",
          upsert: true
        });

      if (uploadErr) {
        throw new Error(`Upload ke Supabase Storage gagal: ${uploadErr.message}. Pastikan bucket 'banners' telah dibuat di Supabase Storage.`);
      }

      // Ambil Public URL
      const { data: publicUrlData } = supabaseClient.storage
        .from("banners")
        .getPublicUrl(cleanFileName);

      if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error("Gagal mendapatkan public URL gambar dari Supabase Storage.");
      }

      finalImageUrl = publicUrlData.publicUrl;
    }

    // Pastikan ada URL gambar
    if (!finalImageUrl) {
      throw new Error("Harap unggah file foto banner atau masukkan URL gambar.");
    }

    // 2. Simpan Data ke Tabel 'banners'
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1.5"></i> Menyimpan Database...`;
    const payload = {
      title,
      badge_text,
      description,
      button_text,
      button_url,
      image_url: finalImageUrl,
      sort_order,
      is_active
    };

    if (bannerId) {
      // Update
      const { error: updateErr } = await supabaseClient
        .from("banners")
        .update(payload)
        .eq("id", bannerId);

      if (updateErr) throw updateErr;
      showAdminToast("Banner promosi berhasil diperbarui!", "success");
    } else {
      // Insert baru
      const { error: insertErr } = await supabaseClient
        .from("banners")
        .insert([payload]);

      if (insertErr) throw insertErr;
      showAdminToast("Banner promosi baru berhasil ditambahkan!", "success");
    }

    closeBannerModal();
    loadSupabaseBannersList();

  } catch (err) {
    console.error("Gagal menyimpan banner:", err);
    showAdminToast(err.message || "Gagal menyimpan banner ke Supabase.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

/**
 * Toggle Status Aktif/Nonaktifkan Banner
 */
async function toggleBannerActiveStatus(bannerId, newStatus) {
  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from("banners")
      .update({ is_active: newStatus })
      .eq("id", bannerId);

    if (error) throw error;

    showAdminToast(`Banner berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}!`, "success");
    
    // Update local state dan render ulang
    const idx = liveSupabaseBanners.findIndex(b => String(b.id) === String(bannerId));
    if (idx > -1) {
      liveSupabaseBanners[idx].is_active = newStatus;
      renderSupabaseBannersTable(liveSupabaseBanners);
      const activeCount = liveSupabaseBanners.filter(b => b.is_active).length;
      const countBadge = document.getElementById("supabaseBannersCount");
      const topBadge = document.getElementById("adminBannerCountBadge");
      const summaryEl = document.getElementById("activeBannersSummary");
      if (countBadge) countBadge.textContent = `${liveSupabaseBanners.length} banner (${activeCount} aktif)`;
      if (topBadge) topBadge.textContent = activeCount;
      if (summaryEl) summaryEl.textContent = `${activeCount} dari ${liveSupabaseBanners.length} banner sedang tayang`;
    }

  } catch (err) {
    console.error("Gagal mengubah status banner:", err);
    showAdminToast(`Gagal mengubah status: ${err.message}`, "error");
  }
}

/**
 * Hapus Banner dari Supabase
 */
async function deleteBannerFromSupabase(bannerId, bannerTitle) {
  if (!confirm(`Apakah Anda yakin ingin menghapus banner "${bannerTitle}"?`)) {
    return;
  }

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from("banners")
      .delete()
      .eq("id", bannerId);

    if (error) throw error;

    showAdminToast(`Banner "${bannerTitle}" berhasil dihapus!`, "success");
    loadSupabaseBannersList();

  } catch (err) {
    console.error("Gagal menghapus banner:", err);
    showAdminToast(`Gagal menghapus: ${err.message}`, "error");
  }
}

/**
 * Modal Panduan & Script SQL Supabase
 */
const SQL_BANNERS_SCRIPT = `-- ==============================================================================
-- SCRIPT SQL: TABEL BANNERS & SUPABASE STORAGE BUCKET
-- Sistem Katalog Digital Shinemart
-- Jalankan script ini di SQL Editor dashboard Supabase Anda.
-- ==============================================================================

-- 1. Buat Tabel banners
CREATE TABLE IF NOT EXISTS public.banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_text TEXT DEFAULT 'KATALOG ONLINE',
    title TEXT NOT NULL,
    description TEXT,
    button_text TEXT DEFAULT 'Lihat Katalog Produk',
    button_url TEXT DEFAULT '#katalog',
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index untuk optimasi query
CREATE INDEX IF NOT EXISTS idx_banners_sort_order ON public.banners (sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_banners_is_active ON public.banners (is_active);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- 3. Policy Akses Tabel banners (Aman dengan Supabase Auth)
DROP POLICY IF EXISTS "Public can view active banners" ON public.banners;
DROP POLICY IF EXISTS "Allow anon insert banners" ON public.banners;
DROP POLICY IF EXISTS "Allow anon update banners" ON public.banners;
DROP POLICY IF EXISTS "Allow anon delete banners" ON public.banners;
DROP POLICY IF EXISTS "Public Read Only Banners" ON public.banners;
DROP POLICY IF EXISTS "Admin Full Control Banners" ON public.banners;

-- Pengunjung (publik) hanya bisa membaca banner:
CREATE POLICY "Public Read Only Banners" 
ON public.banners FOR SELECT 
TO anon, authenticated 
USING (true);

-- Hanya Admin login yang bisa Tambah, Ubah, Hapus banner:
CREATE POLICY "Admin Full Control Banners" 
ON public.banners FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 4. Konfigurasi Bucket Supabase Storage untuk upload file gambar banner
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'banners',
    'banners',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
ON CONFLICT (id) DO UPDATE 
SET public = true, file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];

-- 5. Policy Akses Row Level Security untuk Storage Bucket 'banners'
DROP POLICY IF EXISTS "Public Access Banners Storage" ON storage.objects;
DROP POLICY IF EXISTS "Anon Insert Banners Storage" ON storage.objects;
DROP POLICY IF EXISTS "Anon Update Banners Storage" ON storage.objects;
DROP POLICY IF EXISTS "Anon Delete Banners Storage" ON storage.objects;
DROP POLICY IF EXISTS "Admin Manage Banners Storage" ON storage.objects;

-- Publik bisa melihat foto banner:
CREATE POLICY "Public Access Banners Storage" 
ON storage.objects FOR SELECT 
TO anon, authenticated 
USING (bucket_id = 'banners');

-- Hanya Admin login yang bisa upload, ubah, dan hapus foto banner:
CREATE POLICY "Admin Manage Banners Storage" 
ON storage.objects FOR ALL 
TO authenticated 
USING (bucket_id = 'banners') 
WITH CHECK (bucket_id = 'banners');

-- 6. Masukkan Data Awal (Seed Data)
INSERT INTO public.banners (badge_text, title, description, button_text, button_url, image_url, sort_order, is_active)
VALUES 
(
    'KATALOG ONLINE',
    'PROMO SPESIAL SHINEMART',
    'Diskon hingga 35% Sembako & Kebutuhan Dapur Hemat!',
    'Lihat Katalog Produk',
    '#katalog',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80',
    1,
    true
),
(
    'HOT DEAL',
    'BELI BUNDLE LEBIH HEMAT',
    'Paket Snack & Minuman Segar Spesial Warna Favorit',
    'Lihat Katalog Produk',
    '#katalog',
    'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=800&auto=format&fit=crop&q=80',
    2,
    true
),
(
    'PESAN VIA WA',
    'GRATIS ONGKIR AREA LOKAL',
    'Pesan Multi-Item via WhatsApp, Antar Cepat Dalam 30 Menit!',
    'Lihat Katalog Produk',
    '#katalog',
    'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80',
    3,
    true
);`;

const SQL_MOBILE_PROMOS_SCRIPT = `-- ==============================================================================
-- SHINEMART SUPABASE MIGRATION: SEPARATE MOBILE PROMOS & DYNAMIC BANNERS
-- Script ini membuat tabel terpisah khusus untuk Mobile App:
-- 1. public.mobile_banners (Dynamic Banner Slider Mobile)
-- 2. public.mobile_promotional_sections (Seksi Promo Khusus Mobile App)
--
-- Jalankan script ini di SQL Editor pada dashboard Supabase Anda.
-- ==============================================================================

-- 1. TABEL DYNAMIC BANNER KHUSUS MOBILE APP (public.mobile_banners)
CREATE TABLE IF NOT EXISTS public.mobile_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge TEXT DEFAULT '⚡ FLASH SALE • DISKON 40%',
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    action_type TEXT DEFAULT 'category', -- 'category' | 'voucher'
    action_value TEXT DEFAULT 'sembako', -- kategori atau kode voucher
    sort_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_banners_sort ON public.mobile_banners (sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_mobile_banners_active ON public.mobile_banners (is_active);

ALTER TABLE public.mobile_banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active mobile banners" ON public.mobile_banners;
CREATE POLICY "Public can view active mobile banners" ON public.mobile_banners FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anon insert mobile banners" ON public.mobile_banners;
CREATE POLICY "Allow anon insert mobile banners" ON public.mobile_banners FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon update mobile banners" ON public.mobile_banners;
CREATE POLICY "Allow anon update mobile banners" ON public.mobile_banners FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow anon delete mobile banners" ON public.mobile_banners;
CREATE POLICY "Allow anon delete mobile banners" ON public.mobile_banners FOR DELETE USING (true);

-- Seed Data Awal Banner Mobile
INSERT INTO public.mobile_banners (badge, title, image_url, action_type, action_value, sort_order, is_active)
VALUES
('⚡ FLASH SALE • DISKON 40%', 'Diskon Sembako & Kebutuhan Pokok Dapur', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80', 'category', 'sembako', 1, true),
('🛵 BEBAS ONGKIR SEPUASNYA', 'Gratis Ongkir Kilat 15-25 Menit', 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1200&q=80', 'voucher', 'ONGKIRGRATIS', 2, true),
('🧊 FROZEN SPECIAL • CASHBACK 20%', 'Stok Frozen Food & Olahan Segar Terlengkap', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1200&q=80', 'category', 'frozen', 3, true)
ON CONFLICT DO NOTHING;

-- 2. TABEL SEKSI PROMO KHUSUS MOBILE APP (public.mobile_promotional_sections)
CREATE TABLE IF NOT EXISTS public.mobile_promotional_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT 'Koleksi promo pilihan hemat Shinemart',
    badge TEXT DEFAULT 'PROMO SPESIAL',
    icon TEXT DEFAULT '🔥',
    icon_bg TEXT DEFAULT '#0077D6',
    poster_image TEXT NOT NULL,
    category_filter TEXT DEFAULT 'sembako',
    sort_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_promo_sort ON public.mobile_promotional_sections (sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_mobile_promo_active ON public.mobile_promotional_sections (is_active);

ALTER TABLE public.mobile_promotional_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Public can view active mobile sections" ON public.mobile_promotional_sections FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anon insert mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Allow anon insert mobile sections" ON public.mobile_promotional_sections FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon update mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Allow anon update mobile sections" ON public.mobile_promotional_sections FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow anon delete mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Allow anon delete mobile sections" ON public.mobile_promotional_sections FOR DELETE USING (true);

-- Seed Data Awal Seksi Promo Mobile
INSERT INTO public.mobile_promotional_sections (title, subtitle, badge, icon, icon_bg, poster_image, category_filter, sort_order, is_active)
VALUES
('Sembako Murah', 'Koleksi promo pilihan hemat Shinemart', 'PROMO SPESIAL', '🔥', '#0077D6', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80', 'sembako', 1, true),
('Frozen Food Pilihan', 'Nugget, sosis & stok olahan beku segar', 'KILAT & BEKU', '🧊', '#38B6FF', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=600&q=80', 'frozen', 2, true),
('Minuman & Snack Segar', 'Segarkan harimu dengan aneka camilan favorit', 'HEMAT SEGAR', '🥤', '#FF66C4', 'https://images.unsplash.com/photo-1621996346565-e3d5d6281741?auto=format&fit=crop&w=600&q=80', 'minuman', 3, true)
ON CONFLICT DO NOTHING;

-- 3. Publikasi Realtime untuk HP
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'mobile_banners') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_banners;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'mobile_promotional_sections') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_promotional_sections;
  END IF;
END $$;`;

let currentActiveSqlScript = SQL_MOBILE_PROMOS_SCRIPT;

function switchSqlScriptTab(tabName) {
  const btnMobile = document.getElementById("sqlTabBtnMobile");
  const btnBanners = document.getElementById("sqlTabBtnBanners");
  const btnSections = document.getElementById("sqlTabBtnSections");
  const btnSettings = document.getElementById("sqlTabBtnSettings");
  const codeEl = document.getElementById("sqlScriptContent");
  const descEl = document.getElementById("sqlScriptDescription");
  const tipEl = document.getElementById("sqlScriptTipText");

  const inactiveClass = "px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-slate-600 hover:text-slate-900 whitespace-nowrap";
  const activeClass = "px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-white text-[#0077d6] shadow-sm whitespace-nowrap";

  if (btnMobile) btnMobile.className = inactiveClass;
  if (btnBanners) btnBanners.className = inactiveClass;
  if (btnSections) btnSections.className = inactiveClass;
  if (btnSettings) btnSettings.className = inactiveClass;

  if (tabName === "banners") {
    if (btnBanners) btnBanners.className = activeClass;
    currentActiveSqlScript = SQL_BANNERS_SCRIPT;
    if (descEl) descEl.textContent = "Script tabel banners untuk slider promosi di halaman utama Website (Desktop/Katalog Online):";
    if (tipEl) tipEl.textContent = "Otomatis membuat tabel banners, konfigurasi bucket storage banners, serta policy akses RLS.";
  } else if (tabName === "sections") {
    if (btnSections) btnSections.className = activeClass;
    currentActiveSqlScript = typeof SQL_SECTIONS_SCRIPT !== "undefined" ? SQL_SECTIONS_SCRIPT : SQL_BANNERS_SCRIPT;
    if (descEl) descEl.textContent = "Script tabel promotional_sections & promotional_section_items untuk seksi promo website:";
    if (tipEl) tipEl.textContent = "Membuat tabel seksi promo beranda dan relasi produk pilihan per-item.";
  } else if (tabName === "settings") {
    if (btnSettings) btnSettings.className = activeClass;
    currentActiveSqlScript = typeof SQL_STORE_SETTINGS_SCRIPT !== "undefined" ? SQL_STORE_SETTINGS_SCRIPT : SQL_MOBILE_PROMOS_SCRIPT;
    if (descEl) descEl.textContent = "Script tabel store_settings untuk konfigurasi buka/tutup toko dan tarif ongkir kilat:";
    if (tipEl) tipEl.textContent = "Menyimpan status toko buka/tutup, radius maksimal, tarif per km, dan gratis ongkir.";
  } else {
    if (btnMobile) btnMobile.className = activeClass;
    currentActiveSqlScript = SQL_MOBILE_PROMOS_SCRIPT;
    if (descEl) descEl.textContent = "Script SQL khusus Mobile App: tabel mobile_banners dan mobile_promotional_sections:";
    if (tipEl) tipEl.textContent = "Membuat tabel terpisah untuk Mobile App agar tidak tercampur dengan banner & promo website!";
  }

  if (codeEl) codeEl.textContent = currentActiveSqlScript;
}

function openSqlGuideModal(preferredTab = "mobile") {
  switchSqlScriptTab(preferredTab);
  const modal = document.getElementById("sqlGuideModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeSqlGuideModal() {
  const modal = document.getElementById("sqlGuideModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function copySqlScript() {
  const textToCopy = currentActiveSqlScript || SQL_BANNERS_SCRIPT;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      showAdminToast("Script SQL berhasil disalin ke clipboard!", "success");
    }).catch(() => {
      fallbackCopyText(textToCopy);
    });
  } else {
    fallbackCopyText(textToCopy);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  showAdminToast("Script SQL berhasil disalin ke clipboard!", "success");
}

/**
 * ============================================================
 * MODAL PRATINJAU FOTO PRODUK JELAS / LIGHTBOX ADMIN
 * ============================================================
 */
function openProductImageModal(imgUrl, title = "Foto Produk", category = "Produk") {
  const modal = document.getElementById("imagePreviewModal");
  const modalImg = document.getElementById("previewImageModalImg");
  const modalTitle = document.getElementById("previewImageModalTitle");
  const modalCategory = document.getElementById("previewImageModalCategory");
  const modalLink = document.getElementById("previewImageModalLink");

  if (!modal || !modalImg) return;

  const validUrl = imgUrl || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
  modalImg.src = validUrl;
  modalImg.onerror = () => {
    modalImg.src = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
  };

  if (modalTitle) modalTitle.textContent = title;
  if (modalCategory) modalCategory.textContent = `Kategori: ${category}`;
  if (modalLink) modalLink.href = validUrl;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";
}

/**
 * Pratinjau foto produk dari dalam modal edit
 */
function openEditModalImagePreview() {
  const imgElem = document.getElementById("editImagePreview");
  const inputUrl = document.getElementById("editProductImageUrl");
  const nameInput = document.getElementById("editProductName");
  const catInput = document.getElementById("editProductCategory");

  const rawUrl = (inputUrl && inputUrl.value.trim()) ? inputUrl.value.trim() : (imgElem ? imgElem.src : "");
  const formattedUrl = formatGoogleDriveImageUrl(rawUrl);
  const title = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "Pratinjau Foto Produk";
  const category = (catInput && catInput.value) ? catInput.value : "Produk";

  openProductImageModal(formattedUrl, title, category);
}

function closeImagePreviewModal(event) {
  if (event && event.target && event.target.closest(".relative") && !event.target.closest("button")) {
    return;
  }
  const modal = document.getElementById("imagePreviewModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
  }
}

// Support tombol ESC untuk menutup modal foto produk
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeImagePreviewModal();
    closeSectionModal();
    closeProductPickerModal();
  }
});

/**
 * ==============================================================================
 * DYNAMIC PROMOTIONAL SECTIONS / CATALOG MANAGER (KLIK INDOMARET STYLE)
 * Modul Lengkap CRUD Seksi Promosi + Pemilih Produk (Product Picker)
 * ==============================================================================
 */
let liveSupabaseSections = [];
let selectedSectionProducts = []; // Array produk yang sedang dipilih untuk seksi ini

/**
 * Memuat daftar seksi promo dari database Supabase
 */
async function loadSupabaseSectionsList() {
  const tbody = document.getElementById("supabaseSectionsTableBody");
  const countBadge = document.getElementById("supabaseSectionsCount");
  const topBadge = document.getElementById("adminSectionCountBadge");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-8 text-xs text-slate-400">
        <i class="fas fa-spinner fa-spin mr-1.5 text-sky-500"></i> Memuat seksi promo dari database Supabase...
      </td>
    </tr>
  `;

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-xs text-pink-500">
          Supabase belum terkonfigurasi.
        </td>
      </tr>
    `;
    return;
  }

  try {
    // 1. Ambil data seksi
    const { data: sections, error: secError } = await supabaseClient
      .from("promotional_sections")
      .select("*")
      .order("display_order", { ascending: true });

    if (secError) throw secError;

    // 2. Ambil data relasi items
    let items = [];
    try {
      const { data: rawItems, error: itemError } = await supabaseClient
        .from("promotional_section_items")
        .select("id, section_id, product_id, sort_order")
        .order("sort_order", { ascending: true });

      if (!itemError && rawItems) {
        // Map product_id ke liveSupabaseProducts yang sudah ada di memory
        const prodMap = new Map((liveSupabaseProducts || []).map(p => [String(p.id), p]));
        items = rawItems.map(it => ({
          ...it,
          products: prodMap.get(String(it.product_id)) || null
        }));
      }
    } catch (itErr) {
      console.warn("Info item seksi:", itErr);
    }

    // Gabungkan item ke seksi
    const itemsBySec = {};
    items.forEach((it) => {
      if (!itemsBySec[it.section_id]) itemsBySec[it.section_id] = [];
      if (it.products) itemsBySec[it.section_id].push(it.products);
    });

    liveSupabaseSections = (sections || []).map((sec) => ({
      ...sec,
      products: itemsBySec[sec.id] || []
    }));

    if (countBadge) countBadge.textContent = `${liveSupabaseSections.length} Seksi`;
    if (topBadge) topBadge.textContent = liveSupabaseSections.length;
    const pillBadge = document.getElementById("supabaseSectionsCountBadge");
    if (pillBadge) pillBadge.textContent = liveSupabaseSections.length;

    renderSupabaseSectionsTable(liveSupabaseSections);
  } catch (err) {
    console.error("Gagal load sections:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8 text-xs text-pink-500 font-bold">
          <i class="fas fa-exclamation-triangle mr-1 text-pink-500"></i>
          Gagal memuat data: ${err.message || err}. Pastikan Anda sudah menjalankan script SQL migration di Supabase.
        </td>
      </tr>
    `;
  }
}

/**
 * Render tabel seksi promo di Admin
 */
function renderSupabaseSectionsTable(sections) {
  const tbody = document.getElementById("supabaseSectionsTableBody");
  if (!tbody) return;

  if (sections.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-10 text-xs text-slate-400">
          <i class="fas fa-layer-group text-3xl mb-2 text-slate-300 block"></i>
          Belum ada Seksi Promo. Klik tombol <strong>"Buat Seksi Promo Baru"</strong> untuk menambahkan tema koleksi promo Shinemart.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sections.map((sec, idx) => {
    const bannerImg = formatGoogleDriveImageUrl(sec.banner_image_url);
    const prodCount = sec.products ? sec.products.length : 0;
    const isActive = Boolean(sec.is_active);

    // Mini thumbnails preview produk
    const miniThumbnailsHtml = (sec.products || []).slice(0, 5).map((p) => {
      const pImg = formatGoogleDriveImageUrl(p.image_url || p.imageUrl);
      return `
        <div class="w-8 h-8 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0 p-0.5" title="${p.name}">
          <img src="${pImg}" alt="${p.name}" class="w-full h-full object-contain" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
        </div>
      `;
    }).join("");

    return `
      <tr class="hover:bg-sky-50/30 border-b border-slate-100 transition text-xs">
        <td class="py-3 px-3 font-mono text-slate-400 text-center">${idx + 1}</td>
        
        <!-- Banner Kiri -->
        <td class="py-3 px-3">
          <div class="w-20 h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm relative group cursor-pointer" onclick="openProductImageModal('${bannerImg}', '${sec.title.replace(/'/g, "\\'")}', 'Banner Seksi')">
            <img src="${bannerImg}" alt="${sec.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=800';">
            <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition text-xs font-bold">
              <i class="fas fa-search-plus"></i>
            </div>
          </div>
        </td>

        <!-- Info Seksi -->
        <td class="py-3 px-4">
          <div class="font-extrabold text-slate-800 text-sm mb-1">${sec.title}</div>
          <div class="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1.5">
            <i class="fas fa-link text-[#38b6ff]"></i>
            <span class="truncate max-w-[200px]">${sec.see_all_url || '#katalog'}</span>
          </div>
          <div>
            ${getSectionThemeBadgeHtml(sec.bg_color)}
          </div>
        </td>

        <!-- Daftar Produk -->
        <td class="py-3 px-4">
          <div class="flex items-center gap-1 mb-1.5">
            ${miniThumbnailsHtml}
            ${prodCount > 5 ? `<span class="text-[10px] text-slate-400 font-bold ml-1">+${prodCount - 5} lainnya</span>` : ''}
          </div>
          <span class="text-[11px] font-bold text-[#0077d6] bg-sky-50 px-2 py-0.5 rounded-md inline-block">
            ${prodCount} Produk Terhubung
          </span>
        </td>

        <!-- Urutan -->
        <td class="py-3 px-3 text-center font-bold text-slate-700">
          #${sec.display_order}
        </td>

        <!-- Status Saklar -->
        <td class="py-3 px-3 text-center">
          <button onclick="toggleSectionStatus('${sec.id}', ${!isActive})"
            class="px-2.5 py-1 rounded-full text-[10px] font-extrabold transition shadow-sm ${
              isActive ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }">
            <i class="fas ${isActive ? 'fa-check-circle' : 'fa-pause-circle'} mr-1"></i>
            ${isActive ? 'Aktif' : 'Nonaktif'}
          </button>
        </td>

        <!-- Aksi -->
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditSectionModal('${sec.id}')"
              class="px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-[#38b6ff] text-[#0077d6] hover:text-white transition font-bold text-xs"
              title="Edit Seksi Promo">
              <i class="fas fa-edit mr-1"></i> Edit
            </button>
            <button onclick="deleteSectionFromSupabase('${sec.id}', '${sec.title.replace(/'/g, "\\'")}')"
              class="px-2.5 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-500 text-pink-600 hover:text-white transition font-bold text-xs"
              title="Hapus Seksi Promo">
              <i class="fas fa-trash-alt mr-1"></i> Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ==============================================================================
// PENGATURAN TEMA & GRADASI BACKGROUND SEKSI PROMO
// ==============================================================================
const SECTION_THEME_CONFIGS = {
  auto: {
    name: "Otomatis dari Banner",
    desc: "Background akan otomatis membaca warna dominan dari gambar banner",
    gradient: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 55%, #ffffff 100%)",
    border: "#bfdbfe",
    iconBg: "linear-gradient(135deg, #38b6ff, #0077d6)"
  },
  sky: {
    name: "Biru Sky",
    desc: "Gradasi biru muda elegan khas Shinemart",
    gradient: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 55%, #ffffff 100%)",
    border: "#bfdbfe",
    iconBg: "linear-gradient(135deg, #38b6ff, #0077d6)"
  },
  pink: {
    name: "Pink Berry",
    desc: "Gradasi merah muda manis untuk promo spesial",
    gradient: "linear-gradient(135deg, #fce7f3 0%, #fff1f2 55%, #ffffff 100%)",
    border: "#fbcfe8",
    iconBg: "linear-gradient(135deg, #ff66c4, #e043a5)"
  },
  emerald: {
    name: "Mint Hijau",
    desc: "Gradasi hijau segar bernuansa alam & produk fresh",
    gradient: "linear-gradient(135deg, #d1fae5 0%, #ecfdf5 55%, #ffffff 100%)",
    border: "#a7f3d0",
    iconBg: "linear-gradient(135deg, #10b981, #059669)"
  },
  orange: {
    name: "Sunset Oranye",
    desc: "Gradasi oranye hangat untuk camilan & bakery",
    gradient: "linear-gradient(135deg, #ffedd5 0%, #fffbeb 55%, #ffffff 100%)",
    border: "#fed7aa",
    iconBg: "linear-gradient(135deg, #f97316, #ea580c)"
  },
  purple: {
    name: "Ungu Mewah",
    desc: "Gradasi ungu lavender eksklusif",
    gradient: "linear-gradient(135deg, #ede9fe 0%, #f5f3ff 55%, #ffffff 100%)",
    border: "#ddd6fe",
    iconBg: "linear-gradient(135deg, #8b5cf6, #6d28d9)"
  }
};

function hexToRgbaHelper(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return `rgba(56, 182, 255, ${alpha})`;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(56, 182, 255, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSectionThemeBadgeHtml(bgVal) {
  const key = bgVal || 'auto';
  if (key === 'auto') {
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md"><i class="fas fa-magic text-[#38b6ff]"></i> Gradasi Banner</span>`;
  } else if (key === 'sky') {
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md"><span class="w-2 h-2 rounded-full bg-sky-500 inline-block"></span> Biru Sky</span>`;
  } else if (key === 'pink') {
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-pink-700 bg-pink-50 px-2 py-0.5 rounded-md"><span class="w-2 h-2 rounded-full bg-pink-500 inline-block"></span> Pink Berry</span>`;
  } else if (key === 'emerald') {
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Mint Hijau</span>`;
  } else if (key === 'orange') {
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md"><span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Sunset Oranye</span>`;
  } else if (key === 'purple') {
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md"><span class="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> Ungu Mewah</span>`;
  } else {
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md"><span class="w-2 h-2 rounded-full inline-block" style="background:${key}"></span> Kustom</span>`;
  }
}

function handleSectionThemeChange(themeKey) {
  const bgInput = document.getElementById("sectionBgColorInput");
  const previewBox = document.getElementById("sectionThemePreviewBox");
  const previewText = document.getElementById("previewBoxText");
  const previewIcon = document.getElementById("previewBoxIcon");
  if (!bgInput) return;

  // Reset highlight border
  ["Auto", "Sky", "Pink", "Emerald", "Orange", "Purple", "Custom"].forEach(id => {
    const el = document.getElementById(`labelTheme${id}`);
    if (el) {
      el.classList.remove("border-[#38b6ff]", "border-pink-500", "border-emerald-500", "border-orange-500", "border-purple-500", "border-slate-700", "ring-2", "ring-offset-1");
      el.classList.add("border-slate-200");
    }
  });

  if (themeKey === "custom") {
    const customHex = document.getElementById("sectionCustomColorInput")?.value || "#38b6ff";
    bgInput.value = customHex;
    const labelEl = document.getElementById("labelThemeCustom");
    if (labelEl) {
      labelEl.classList.remove("border-slate-200");
      labelEl.classList.add("ring-2", "ring-slate-700", "border-slate-700");
    }
    if (previewBox) {
      previewBox.style.background = `linear-gradient(135deg, ${hexToRgbaHelper(customHex, 0.22)} 0%, ${hexToRgbaHelper(customHex, 0.06)} 55%, #ffffff 100%)`;
      previewBox.style.borderColor = hexToRgbaHelper(customHex, 0.35);
    }
    if (previewText) previewText.textContent = `Tema: Warna Kustom (${customHex.toUpperCase()})`;
    if (previewIcon) previewIcon.style.background = customHex;
    return;
  }

  bgInput.value = themeKey;
  const conf = SECTION_THEME_CONFIGS[themeKey] || SECTION_THEME_CONFIGS.auto;
  const capitalKey = themeKey.charAt(0).toUpperCase() + themeKey.slice(1);
  const labelEl = document.getElementById(`labelTheme${capitalKey}`);
  if (labelEl) {
    labelEl.classList.remove("border-slate-200");
    labelEl.classList.add("ring-2", "ring-offset-1", "border-[#38b6ff]");
  }

  if (previewBox) {
    previewBox.style.background = conf.gradient;
    previewBox.style.borderColor = conf.border;
  }
  if (previewText) previewText.textContent = `Tema: ${conf.name}`;
  if (previewIcon) previewIcon.style.background = conf.iconBg;
}

function handleCustomColorInput(hex) {
  if (!hex) return;
  const colorPicker = document.getElementById("sectionCustomColorInput");
  const colorText = document.getElementById("sectionCustomColorText");
  const customRadio = document.querySelector('input[name="sectionThemeRadio"][value="custom"]');

  if (colorPicker && colorPicker.value !== hex) colorPicker.value = hex;
  if (colorText && colorText.value !== hex) colorText.value = hex;
  if (customRadio) customRadio.checked = true;

  handleSectionThemeChange("custom");
}

function extractColorFromCurrentBannerPreview() {
  const img = document.getElementById("sectionBannerPreviewImg");
  if (!img) return;

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 16;
    canvas.height = 16;
    ctx.drawImage(img, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const bright = (red * 299 + green * 587 + blue * 114) / 1000;
      if (bright > 25 && bright < 235) {
        r += red; g += green; b += blue; count++;
      }
    }
    if (count > 0) {
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

      const previewBox = document.getElementById("sectionThemePreviewBox");
      const previewText = document.getElementById("previewBoxText");
      if (previewBox) {
        previewBox.style.background = `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.22) 0%, rgba(${r}, ${g}, ${b}, 0.06) 55%, #ffffff 100%)`;
        previewBox.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.35)`;
      }
      if (previewText) {
        previewText.textContent = `Terdeteksi dari Banner: RGB(${r}, ${g}, ${b}) / ${hex.toUpperCase()}`;
      }
      showAdminToast(`Berhasil mendeteksi warna banner (${hex.toUpperCase()})!`, "success");
      return;
    }
  } catch (e) {
    console.warn("CORS/Canvas detection info:", e);
  }
  showAdminToast("Mode otomatis aktif! Di beranda sistem akan menyesuaikan warna banner secara dinamis.", "info");
}

/**
 * Buka modal tambah seksi
 */
function openAddSectionModal() {
  const form = document.getElementById("sectionForm");
  if (form) form.reset();

  document.getElementById("sectionId").value = "";
  document.getElementById("sectionModalTitle").textContent = "Buat Seksi Promo Baru";
  document.getElementById("sectionDisplayOrderInput").value = liveSupabaseSections.length + 1;
  document.getElementById("sectionSeeAllUrlInput").value = "#katalog";
  document.getElementById("sectionIsActiveInput").checked = true;

  // Reset tema ke auto
  const autoRadio = document.querySelector('input[name="sectionThemeRadio"][value="auto"]');
  if (autoRadio) autoRadio.checked = true;
  handleSectionThemeChange("auto");

  updateSectionBannerPreview("");
  selectedSectionProducts = [];
  renderSelectedProductsList();

  const modal = document.getElementById("sectionModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

/**
 * Buka modal edit seksi
 */
function openEditSectionModal(sectionId) {
  const sec = liveSupabaseSections.find((s) => String(s.id) === String(sectionId));
  if (!sec) return;

  document.getElementById("sectionId").value = sec.id;
  document.getElementById("sectionModalTitle").textContent = "Edit Seksi Promo";
  document.getElementById("sectionTitleInput").value = sec.title;
  document.getElementById("sectionDisplayOrderInput").value = sec.display_order;
  document.getElementById("sectionSeeAllUrlInput").value = sec.see_all_url || "#katalog";
  document.getElementById("sectionBannerUrlInput").value = sec.banner_image_url;
  document.getElementById("sectionIsActiveInput").checked = Boolean(sec.is_active);

  // Set tema warna
  const savedBg = sec.bg_color || "auto";
  const matchedRadio = document.querySelector(`input[name="sectionThemeRadio"][value="${savedBg}"]`);
  if (matchedRadio) {
    matchedRadio.checked = true;
    handleSectionThemeChange(savedBg);
  } else if (String(savedBg).startsWith("#")) {
    handleCustomColorInput(savedBg);
  } else {
    const autoRadio = document.querySelector('input[name="sectionThemeRadio"][value="auto"]');
    if (autoRadio) autoRadio.checked = true;
    handleSectionThemeChange("auto");
  }

  updateSectionBannerPreview(sec.banner_image_url);
  selectedSectionProducts = [...(sec.products || [])];
  renderSelectedProductsList();

  const modal = document.getElementById("sectionModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeSectionModal() {
  const modal = document.getElementById("sectionModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function updateSectionBannerPreview(url) {
  const img = document.getElementById("sectionBannerPreviewImg");
  if (img) {
    img.src = formatGoogleDriveImageUrl(url) || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800";
  }
}

/**
 * Render list produk yang sedang dipilih di dalam form seksi
 */
function renderSelectedProductsList() {
  const container = document.getElementById("selectedProductsListContainer");
  const countBadge = document.getElementById("selectedProductsCountBadge");
  if (!container) return;

  if (countBadge) countBadge.textContent = `${selectedSectionProducts.length} Produk`;

  if (selectedSectionProducts.length === 0) {
    container.innerHTML = `
      <span class="text-[11px] text-slate-400 mx-auto">Belum ada produk yang dipilih. Klik tombol "+ Pilih Produk" di atas.</span>
    `;
    return;
  }

  container.innerHTML = selectedSectionProducts.map((p, idx) => {
    const pImg = formatGoogleDriveImageUrl(p.image_url || p.imageUrl);
    return `
      <div class="w-20 bg-white p-2 rounded-2xl border border-slate-200 text-center shrink-0 relative group shadow-sm">
        <img src="${pImg}" alt="${p.name}" class="w-12 h-12 object-contain mx-auto mb-1" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
        <span class="block text-[10px] font-bold text-slate-700 truncate">${p.name}</span>
        <span class="block text-[9px] text-[#0077d6] font-semibold">${formatRupiah(p.price)}</span>
        
        <!-- Tombol Hapus Produk dari Seksi -->
        <button type="button" onclick="removeProductFromSection(${idx})"
          class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-pink-500 hover:bg-pink-600 text-white rounded-full text-[10px] font-black flex items-center justify-center shadow transition"
          title="Hapus Produk dari Seksi">
          ✕
        </button>
      </div>
    `;
  }).join("");
}

function removeProductFromSection(index) {
  selectedSectionProducts.splice(index, 1);
  renderSelectedProductsList();
}

/**
 * Simpan Seksi Promo ke Supabase
 */
async function handleSaveSection(event) {
  event.preventDefault();

  const id = document.getElementById("sectionId")?.value;
  const title = document.getElementById("sectionTitleInput")?.value?.trim();
  const display_order = Number(document.getElementById("sectionDisplayOrderInput")?.value) || 1;
  const see_all_url = document.getElementById("sectionSeeAllUrlInput")?.value?.trim() || "#katalog";
  const banner_image_url = document.getElementById("sectionBannerUrlInput")?.value?.trim();
  const bg_color = document.getElementById("sectionBgColorInput")?.value || "auto";
  const is_active = document.getElementById("sectionIsActiveInput")?.checked;

  if (!title || !banner_image_url) {
    showAdminToast("Judul dan URL Banner wajib diisi!", "error");
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  const btn = document.getElementById("btnSaveSection");
  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1.5"></i> Menyimpan...`;
  }

  try {
    let sectionId = id;
    const sectionPayload = {
      title,
      display_order,
      see_all_url,
      banner_image_url,
      bg_color,
      is_active
    };

    if (sectionId) {
      // 1. Update Tabel promotional_sections
      let { error: updateError } = await supabaseClient
        .from("promotional_sections")
        .update(sectionPayload)
        .eq("id", sectionId);

      // Fallback jika kolom bg_color belum di-migration di DB pengguna
      if (updateError && String(updateError.message).includes("bg_color")) {
        delete sectionPayload.bg_color;
        const retryRes = await supabaseClient
          .from("promotional_sections")
          .update(sectionPayload)
          .eq("id", sectionId);
        updateError = retryRes.error;
      }

      if (updateError) throw updateError;

      // 2. Hapus relasi lama
      await supabaseClient
        .from("promotional_section_items")
        .delete()
        .eq("section_id", sectionId);
    } else {
      // Insert Seksi Baru
      let insertRes = await supabaseClient
        .from("promotional_sections")
        .insert([sectionPayload])
        .select()
        .single();

      // Fallback jika kolom bg_color belum ada
      if (insertRes.error && String(insertRes.error.message).includes("bg_color")) {
        delete sectionPayload.bg_color;
        insertRes = await supabaseClient
          .from("promotional_sections")
          .insert([sectionPayload])
          .select()
          .single();
      }

      if (insertRes.error) throw insertRes.error;
      sectionId = insertRes.data.id;
    }

    // 3. Masukkan item produk relasi
    if (selectedSectionProducts.length > 0) {
      const itemsPayload = selectedSectionProducts.map((p, idx) => ({
        section_id: sectionId,
        product_id: p.id,
        sort_order: idx + 1
      }));

      const { error: itemsError } = await supabaseClient
        .from("promotional_section_items")
        .insert(itemsPayload);

      if (itemsError) throw itemsError;
    }

    showAdminToast("Seksi Promo berhasil disimpan ke database!", "success");
    closeSectionModal();
    loadSupabaseSectionsList();
  } catch (err) {
    console.error("Gagal simpan seksi:", err);
    showAdminToast(`Gagal menyimpan: ${err.message || err}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

/**
 * Toggle Status Aktif / Nonaktif Seksi Promo
 */
async function toggleSectionStatus(sectionId, newStatus) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from("promotional_sections")
      .update({ is_active: newStatus })
      .eq("id", sectionId);

    if (error) throw error;

    showAdminToast(`Seksi promo berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}!`, "success");
    loadSupabaseSectionsList();
  } catch (err) {
    showAdminToast(`Gagal mengubah status: ${err.message}`, "error");
  }
}

/**
 * Hapus Seksi Promo dari Supabase
 */
async function deleteSectionFromSupabase(sectionId, title) {
  if (!confirm(`Apakah Anda yakin ingin menghapus seksi promo "${title}"?\nProduk di dalamnya tidak akan terhapus dari katalog.`)) {
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from("promotional_sections")
      .delete()
      .eq("id", sectionId);

    if (error) throw error;

    showAdminToast("Seksi promo berhasil dihapus!", "success");
    loadSupabaseSectionsList();
  } catch (err) {
    showAdminToast(`Gagal menghapus seksi: ${err.message}`, "error");
  }
}

/**
 * ==============================================================================
 * MODAL PRODUCT PICKER (PENCARIAN & PEMILIHAN PRODUK)
 * ==============================================================================
 */
function openProductPickerModal() {
  const modal = document.getElementById("productPickerModal");
  const searchInput = document.getElementById("productPickerSearchInput");
  if (searchInput) searchInput.value = "";

  renderProductPickerList("");

  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeProductPickerModal() {
  const modal = document.getElementById("productPickerModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function filterProductPickerList() {
  const query = document.getElementById("productPickerSearchInput")?.value || "";
  const category = document.getElementById("productPickerCategoryFilter")?.value || "all";
  renderProductPickerList(query, category);
}

function renderProductPickerList(query = "", category = "all") {
  const container = document.getElementById("productPickerListContainer");
  if (!container) return;

  const q = (query || "").toLowerCase().trim();
  const selectedCat = (category || "all").toLowerCase().trim();
  const allProducts = liveSupabaseProducts || [];

  let filtered = allProducts;

  // Filter Kategori
  if (selectedCat && selectedCat !== "all") {
    filtered = filtered.filter((p) => (p.category || "").toLowerCase().trim() === selectedCat);
  }

  // Filter Nama / Teks
  if (q) {
    filtered = filtered.filter((p) => 
      (p.name || "").toLowerCase().includes(q) || 
      (p.category || "").toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400">
        <i class="fas fa-box-open text-2xl mb-2 text-slate-300 block"></i>
        Tidak ditemukan produk yang cocok ${q ? `dengan "${query}"` : ""} ${selectedCat !== 'all' ? `di kategori ini` : ""}.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.slice(0, 150).map((prod) => {
    const isSelected = selectedSectionProducts.some((p) => String(p.id) === String(prod.id));
    const pImg = formatGoogleDriveImageUrl(prod.image_url || prod.imageUrl);

    return `
      <div onclick="togglePickProduct('${prod.id}')"
        class="flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition ${
          isSelected ? 'border-[#38b6ff] bg-sky-50/70 shadow-sm' : 'border-slate-100 hover:bg-slate-50'
        }">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-white border border-slate-200 overflow-hidden p-1 shrink-0">
            <img src="${pImg}" alt="${prod.name}" class="w-full h-full object-contain" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
          </div>
          <div>
            <div class="font-bold text-slate-800 text-xs">${prod.name}</div>
            <div class="text-[11px] text-slate-400 font-medium">
              <span class="text-[#0077d6] font-bold">${formatRupiah(prod.price)}</span> &bull; 
              <span class="capitalize text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">${prod.category || 'Sembako'}</span>
            </div>
          </div>
        </div>

        <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition ${
          isSelected ? 'bg-[#38b6ff] text-white shadow-sm' : 'border-2 border-slate-300 text-transparent'
        }">
          ✓
        </div>
      </div>
    `;
  }).join("");
}

function togglePickProduct(productId) {
  const prod = liveSupabaseProducts.find((p) => String(p.id) === String(productId));
  if (!prod) return;

  const existingIdx = selectedSectionProducts.findIndex((p) => String(p.id) === String(productId));
  if (existingIdx > -1) {
    selectedSectionProducts.splice(existingIdx, 1);
  } else {
    selectedSectionProducts.push(prod);
  }

  filterProductPickerList();
  renderSelectedProductsList();
}

// =========================================================================
// MODUL KHUSUS: LIVE ORDERS, SINKRONISASI PRODUK & OPERASIONAL MOBILE APP
// =========================================================================

let liveAdminOrders = [];
let currentOrderFilter = "ALL";
let orderSoundEnabled = true;
let ordersRealtimeSub = null;
let selectedOrderForModal = null;
let liveStoreSettings = {
  is_store_open: true,
  auto_close_notes: "Toko sedang tutup sementara. Pesanan kilat akan dibuka kembali pukul 07.00 WIB.",
  base_delivery_fee: 10000,
  delivery_fee_per_km: 2500,
  max_delivery_distance_km: 10,
  free_delivery_min_spend: 30000,
  store_whatsapp: "6287782603733"
};

/**
 * Notifikasi Suara Chime Ramah Web Audio API (Tanpa perlu file audio eksternal)
 */
function playOrderBellSound() {
  if (!orderSoundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const now = ctx.currentTime;

    // Nada 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Nada 2: B5 (987.77 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(987.77, now + 0.15);
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.7);
  } catch (err) {
    console.warn("Audio Context playback error:", err);
  }
}

/**
 * Toggle Bunyi Suara Notifikasi Pesanan Baru
 */
function toggleOrderSound() {
  orderSoundEnabled = !orderSoundEnabled;
  const icon = document.getElementById("orderSoundIcon");
  const label = document.getElementById("orderSoundLabel");
  const btn = document.getElementById("orderSoundToggleBtn");
  if (orderSoundEnabled) {
    if (icon) icon.className = "fas fa-volume-up";
    if (label) label.textContent = "Suara: Nyala";
    if (btn) {
      btn.className = "px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-pink-50 text-[#ff66c4] border-pink-200";
    }
    playOrderBellSound();
    showAdminToast("Notifikasi suara pesanan aktif", "info");
  } else {
    if (icon) icon.className = "fas fa-volume-mute";
    if (label) label.textContent = "Suara: Mute";
    if (btn) {
      btn.className = "px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-slate-100 text-slate-500 border-slate-300";
    }
    showAdminToast("Notifikasi suara pesanan dimatikan", "info");
  }
}

/**
 * Normalisasi Status Pesanan ke Kategori Standar
 */
function normalizeOrderStatus(rawStatus) {
  const s = String(rawStatus || "PENDING").trim().toUpperCase();
  if (s === "PENDING") return "PENDING";
  if (["PAID", "SETTLEMENT", "CAPTURE", "DIPROSES", "PICKING"].includes(s)) return "PICKING";
  if (s === "SEDANG DIKEMAS") return "PACKING";
  if (["DIANTAR", "DELIVERING", "SHIPPED"].includes(s)) return "DELIVERING";
  if (["SELESAI", "COMPLETED", "DELIVERED", "SUCCESS"].includes(s)) return "COMPLETED";
  if (["BATAL", "CANCELLED", "EXPIRED", "DENY", "FAILURE"].includes(s)) return "CANCELLED";
  return s;
}

/**
 * Label & Badge Style sesuai Status Pesanan
 */
function getStatusBadgeConfig(status) {
  const norm = normalizeOrderStatus(status);
  switch (norm) {
    case "PENDING":
      return {
        label: "Menunggu Bayar",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
        icon: "fa-clock",
        cardBorder: "border-l-4 border-l-amber-400"
      };
    case "PICKING":
      return {
        label: "Perlu Disiapkan (Picking)",
        badgeClass: "bg-sky-100 text-[#0077d6] border-sky-300 font-extrabold",
        icon: "fa-box-open",
        cardBorder: "border-l-4 border-l-[#38b6ff]"
      };
    case "PACKING":
      return {
        label: "Sedang Dikemas",
        badgeClass: "bg-purple-100 text-purple-800 border-purple-300 font-extrabold",
        icon: "fa-box",
        cardBorder: "border-l-4 border-l-purple-400"
      };
    case "DELIVERING":
      return {
        label: "Sedang Diantar",
        badgeClass: "bg-blue-100 text-blue-800 border-blue-300 font-extrabold",
        icon: "fa-motorcycle",
        cardBorder: "border-l-4 border-l-blue-500"
      };
    case "COMPLETED":
      return {
        label: "Selesai",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
        icon: "fa-check-circle",
        cardBorder: "border-l-4 border-l-emerald-500"
      };
    case "CANCELLED":
      return {
        label: "Dibatalkan",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
        icon: "fa-times-circle",
        cardBorder: "border-l-4 border-l-rose-400"
      };
    default:
      return {
        label: status || "Pesanan",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
        icon: "fa-receipt",
        cardBorder: "border-l-4 border-l-slate-300"
      };
  }
}

/**
 * Inisialisasi Supabase Realtime Subscription untuk Live Orders
 */
function initAdminOrdersRealtime() {
  const client = getAdminSupabaseClient();
  if (!client) return;

  if (ordersRealtimeSub) {
    try {
      client.removeChannel(ordersRealtimeSub);
    } catch (_) {}
    ordersRealtimeSub = null;
  }

  try {
    ordersRealtimeSub = client
      .channel("admin-orders-realtime-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders"
        },
        async (payload) => {
          console.log("[Admin Realtime Orders Event]:", payload);
          const indicator = document.getElementById("realtimeLiveIndicator");
          if (indicator) {
            indicator.classList.remove("bg-emerald-100", "text-emerald-800");
            indicator.classList.add("bg-pink-100", "text-pink-800");
            setTimeout(() => {
              indicator.classList.remove("bg-pink-100", "text-pink-800");
              indicator.classList.add("bg-emerald-100", "text-emerald-800");
            }, 1500);
          }

          if (payload.eventType === "INSERT") {
            playOrderBellSound();
            showAdminToast(`🔔 Pesanan Baru Masuk! #${payload.new.order_number || payload.new.id}`, "success");
            await loadAdminOrdersList(true);
          } else if (payload.eventType === "UPDATE") {
            const idx = liveAdminOrders.findIndex(o => String(o.id) === String(payload.new.id));
            if (idx > -1) {
              liveAdminOrders[idx] = { ...liveAdminOrders[idx], ...payload.new };
              updateOrderStatsCards();
              renderAdminOrdersList();
              if (selectedOrderForModal && String(selectedOrderForModal.id) === String(payload.new.id)) {
                openOrderDetailModal(payload.new.id);
              }
            } else {
              await loadAdminOrdersList(true);
            }
          } else if (payload.eventType === "DELETE") {
            liveAdminOrders = liveAdminOrders.filter(o => String(o.id) !== String(payload.old.id));
            updateOrderStatsCards();
            renderAdminOrdersList();
          }
        }
      )
      .subscribe((status) => {
        console.log("[Admin Orders Realtime Status]:", status);
        const indicator = document.getElementById("realtimeLiveIndicator");
        if (indicator) {
          if (status === "SUBSCRIBED") {
            indicator.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Realtime Aktif`;
          } else {
            indicator.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> ${status}`;
          }
        }
      });
  } catch (err) {
    console.error("Gagal inisialisasi Realtime orders:", err);
  }
}

/**
 * Muat daftar pesanan dari tabel Supabase 'orders'
 */
async function loadAdminOrdersList(silent = false) {
  const container = document.getElementById("adminOrdersContainer");
  const client = getAdminSupabaseClient();

  if (!client) {
    if (container && !silent) {
      container.innerHTML = `
        <div class="text-center py-10 text-slate-400 text-xs">
          <i class="fas fa-exclamation-circle text-amber-500 text-2xl mb-2 block"></i>
          Kredensial Supabase belum terkonfigurasi.
        </div>
      `;
    }
    return;
  }

  if (container && !silent && liveAdminOrders.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-400 text-xs">
        <i class="fas fa-spinner fa-spin text-xl text-[#38b6ff] mb-2 block"></i>
        Memuat data pesanan live...
      </div>
    `;
  }

  try {
    const { data, error } = await client
      .from("orders")
      .select(`
        *,
        order_items (*)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      if (String(error.message).includes("order_items") || error.code === "PGRST200") {
        const { data: rawOrders, error: rawError } = await client
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false });
        if (rawError) throw rawError;
        liveAdminOrders = rawOrders || [];
      } else {
        throw error;
      }
    } else {
      liveAdminOrders = data || [];
    }

    updateOrderStatsCards();
    renderAdminOrdersList();

  } catch (err) {
    console.error("Gagal mengambil daftar pesanan:", err);
    if (container && !silent) {
      container.innerHTML = `
        <div class="text-center py-8 text-rose-500 text-xs">
          <i class="fas fa-exclamation-triangle text-xl mb-2 block"></i>
          Gagal mengambil data pesanan: ${err.message || "Periksa koneksi Supabase"}
        </div>
      `;
    }
  }
}

/**
 * Update Ringkasan Angka Status di Bagian Atas
 */
function updateOrderStatsCards() {
  const countAll = liveAdminOrders.length;
  const countPending = liveAdminOrders.filter(o => normalizeOrderStatus(o.status) === "PENDING").length;
  const countPicking = liveAdminOrders.filter(o => ["PICKING", "PACKING"].includes(normalizeOrderStatus(o.status))).length;
  const countDelivering = liveAdminOrders.filter(o => normalizeOrderStatus(o.status) === "DELIVERING").length;
  const countCompleted = liveAdminOrders.filter(o => normalizeOrderStatus(o.status) === "COMPLETED").length;

  const statAllEl = document.getElementById("statCountAll");
  const statPendingEl = document.getElementById("statCountPending");
  const statPickingEl = document.getElementById("statCountPicking");
  const statDeliveringEl = document.getElementById("statCountDelivering");
  const statCompletedEl = document.getElementById("statCountCompleted");
  const topBadgeEl = document.getElementById("adminOrdersLiveBadge");

  if (statAllEl) statAllEl.textContent = countAll;
  if (statPendingEl) statPendingEl.textContent = countPending;
  if (statPickingEl) statPickingEl.textContent = countPicking;
  if (statDeliveringEl) statDeliveringEl.textContent = countDelivering;
  if (statCompletedEl) statCompletedEl.textContent = countCompleted;

  if (topBadgeEl) {
    topBadgeEl.textContent = countPicking > 0 ? countPicking : countAll;
    if (countPicking > 0) {
      topBadgeEl.className = "bg-pink-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full ml-0.5 animate-pulse";
    } else {
      topBadgeEl.className = "bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full ml-0.5";
    }
  }
}

/**
 * Filter Tampilan Pesanan Berdasarkan Status
 */
function filterOrdersByStatus(filterStatus) {
  currentOrderFilter = filterStatus;

  const chips = ["ALL", "PENDING", "PICKING", "DELIVERING", "COMPLETED", "CANCELLED"];
  chips.forEach(chip => {
    const btn = document.getElementById(`orderFilterChip_${chip}`);
    if (btn) {
      if (chip === filterStatus) {
        btn.className = "px-3.5 py-1.5 rounded-xl font-bold bg-[#0077d6] text-white shadow-sm transition shrink-0";
      } else {
        btn.className = "px-3.5 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition shrink-0";
      }
    }
  });

  renderAdminOrdersList();
}

/**
 * Render Kartu-Kartu Pesanan ke Kontainer
 */
function renderAdminOrdersList() {
  const container = document.getElementById("adminOrdersContainer");
  if (!container) return;

  let filtered = [...liveAdminOrders];

  if (currentOrderFilter !== "ALL") {
    if (currentOrderFilter === "PICKING") {
      filtered = filtered.filter(o => ["PICKING", "PACKING"].includes(normalizeOrderStatus(o.status)));
    } else {
      filtered = filtered.filter(o => normalizeOrderStatus(o.status) === currentOrderFilter);
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
        <i class="fas fa-shopping-bag text-3xl mb-2 text-slate-300 block"></i>
        <div class="font-bold text-slate-700 text-xs">Belum ada pesanan ${currentOrderFilter !== 'ALL' ? `dengan filter ${currentOrderFilter}` : ''}</div>
        <p class="text-[11px] text-slate-400 mt-0.5">Pesanan baru yang dibuat di aplikasi HP akan muncul otomatis di sini.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => renderOrderCardHtml(order)).join("");
}

/**
 * HTML Template untuk Satu Kartu Pesanan
 */
function renderOrderCardHtml(order) {
  const normStatus = normalizeOrderStatus(order.status);
  const cfg = getStatusBadgeConfig(order.status);
  const items = order.order_items || [];
  const itemCount = items.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);

  let itemsSummary = "";
  if (items.length > 0) {
    const names = items.slice(0, 2).map(i => `${i.quantity}x ${i.product_name}`).join(", ");
    itemsSummary = items.length > 2 ? `${names}, +${items.length - 2} item lainnya` : names;
  } else {
    itemsSummary = "Rincian produk tersimpan";
  }

  const dateFormatted = order.created_at
    ? new Date(order.created_at).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "-";

  const customerName = order.customer_name || "Pelanggan Shinemart";
  const customerPhone = order.customer_phone || "-";
  const cleanPhone = customerPhone.replace(/[^0-9]/g, "");
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(`Halo Kak ${customerName}, terima kasih sudah berbelanja di Shinemart! Mengenai pesanan #${order.order_number || order.id}:`)}` : "#";

  return `
    <div class="bg-white rounded-2xl p-4 border border-slate-200/90 hover:border-[#38b6ff] transition shadow-sm ${cfg.cardBorder} flex flex-col md:flex-row md:items-center justify-between gap-4">
      
      <!-- Kolom Info Pesanan -->
      <div class="space-y-1.5 flex-1 cursor-pointer" onclick="openOrderDetailModal('${order.id}')">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-mono font-black text-xs sm:text-sm text-slate-800">#${order.order_number || order.id}</span>
          <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${cfg.badgeClass} flex items-center gap-1">
            <i class="fas ${cfg.icon} text-[9px]"></i> ${cfg.label}
          </span>
          <span class="text-[11px] text-slate-400 font-medium ml-auto md:ml-0 flex items-center gap-1">
            <i class="far fa-clock text-[10px]"></i> ${dateFormatted}
          </span>
        </div>

        <div class="flex items-center gap-2 text-xs">
          <span class="font-extrabold text-slate-800">${customerName}</span>
          <span class="text-slate-300">&bull;</span>
          <span class="text-slate-500 font-mono">${customerPhone}</span>
        </div>

        <div class="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-xl flex items-center gap-2 border border-slate-100">
          <i class="fas fa-boxes text-[#38b6ff]"></i>
          <span class="truncate flex-1 font-medium">${itemsSummary}</span>
          <span class="font-bold text-slate-500 shrink-0">(${itemCount} pcs)</span>
        </div>

        ${order.shipping_address ? `
          <div class="text-[11px] text-slate-500 flex items-start gap-1.5 line-clamp-1">
            <i class="fas fa-map-marker-alt text-pink-500 mt-0.5 text-[10px]"></i>
            <span class="truncate">${order.shipping_address}</span>
          </div>
        ` : ''}
      </div>

      <!-- Kolom Aksi & Total Tagihan -->
      <div class="flex md:flex-col items-center md:items-end justify-between gap-2.5 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
        <div class="text-left md:text-right">
          <span class="text-[10px] text-slate-400 uppercase font-bold block">Total Tagihan</span>
          <span class="font-black text-sm md:text-base text-[#0077d6]">${formatRupiah(order.total_amount || 0)}</span>
        </div>

        <div class="flex items-center gap-1.5">
          ${cleanPhone ? `
            <a href="${waUrl}" target="_blank" onclick="event.stopPropagation()"
              class="w-9 h-9 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white flex items-center justify-center text-sm shadow-sm transition"
              title="Chat WhatsApp Pembeli (${customerPhone})">
              <i class="fab fa-whatsapp"></i>
            </a>
          ` : ''}

          <button onclick="openOrderDetailModal('${order.id}')"
            class="px-3.5 py-2 bg-gradient-to-r from-[#0077d6] to-[#38b6ff] hover:from-[#38b6ff] hover:to-[#0077d6] text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition">
            <i class="fas fa-clipboard-list text-xs"></i>
            <span>Picking &amp; Detail</span>
          </button>
        </div>
      </div>

    </div>
  `;
}

/**
 * Buka Modal Detail Pesanan & Checklist Picking Rak
 */
async function openOrderDetailModal(orderId) {
  const order = liveAdminOrders.find(o => String(o.id) === String(orderId));
  if (!order) {
    showAdminToast("Data pesanan tidak ditemukan!", "error");
    return;
  }

  selectedOrderForModal = order;

  const numEl = document.getElementById("modalOrderNumber");
  const badgeEl = document.getElementById("modalOrderStatusBadge");
  const timeEl = document.getElementById("modalOrderTimestamp");
  const nameEl = document.getElementById("modalCustomerName");
  const phoneLabelEl = document.getElementById("modalCustomerPhoneLabel");
  const addrEl = document.getElementById("modalShippingAddress");
  const notesEl = document.getElementById("modalDeliveryNotes");
  const totalEl = document.getElementById("modalOrderTotalAmount");

  const cfg = getStatusBadgeConfig(order.status);
  if (numEl) numEl.textContent = `#${order.order_number || order.id}`;
  if (badgeEl) {
    badgeEl.textContent = cfg.label;
    badgeEl.className = `text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border ${cfg.badgeClass}`;
  }
  if (timeEl) {
    timeEl.textContent = order.created_at
      ? new Date(order.created_at).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })
      : "-";
  }
  if (nameEl) nameEl.textContent = order.customer_name || "Pelanggan Tanpa Nama";
  if (phoneLabelEl) phoneLabelEl.textContent = order.customer_phone ? `Chat WA (${order.customer_phone})` : "Chat via WhatsApp";
  if (addrEl) addrEl.textContent = order.shipping_address || "Ambil di Toko / Belum diatur";
  if (notesEl) notesEl.textContent = order.delivery_notes || "Tidak ada catatan khusus dari pembeli.";
  if (totalEl) totalEl.textContent = formatRupiah(order.total_amount || 0);

  let items = order.order_items || [];
  if (items.length === 0) {
    const client = getAdminSupabaseClient();
    if (client) {
      try {
        const { data: fetchedItems } = await client
          .from("order_items")
          .select("*")
          .eq("order_id", order.id);
        if (fetchedItems && fetchedItems.length > 0) {
          items = fetchedItems;
          order.order_items = fetchedItems;
        }
      } catch (_) {}
    }
  }

  renderPickingChecklist(order, items);

  const modal = document.getElementById("orderDetailModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

/**
 * Tutup Modal Detail Pesanan
 */
function closeOrderDetailModal() {
  const modal = document.getElementById("orderDetailModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  selectedOrderForModal = null;
}

/**
 * State Checklist Picking Staf di LocalStorage
 */
function getStoredPickingState(orderId) {
  try {
    const raw = localStorage.getItem(`shinemart_picking_${orderId}`);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveStoredPickingState(orderId, state) {
  try {
    localStorage.setItem(`shinemart_picking_${orderId}`, JSON.stringify(state));
  } catch (_) {}
}

function togglePickingItem(orderId, itemIndex) {
  const state = getStoredPickingState(orderId);
  state[itemIndex] = !state[itemIndex];
  saveStoredPickingState(orderId, state);

  if (selectedOrderForModal && String(selectedOrderForModal.id) === String(orderId)) {
    renderPickingChecklist(selectedOrderForModal, selectedOrderForModal.order_items || []);
  }
}

function renderPickingChecklist(order, items) {
  const container = document.getElementById("modalOrderItemsContainer");
  const progressBadge = document.getElementById("modalPickingProgressBadge");
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-xs">
        <i class="fas fa-box-open text-2xl mb-1 text-slate-300 block"></i>
        Tidak ada data rincian barang per item di database.
      </div>
    `;
    if (progressBadge) progressBadge.textContent = "0 / 0 Selesai";
    return;
  }

  const pickingState = getStoredPickingState(order.id);
  const checkedCount = items.filter((_, idx) => !!pickingState[idx]).length;

  if (progressBadge) {
    progressBadge.textContent = `${checkedCount} / ${items.length} Selesai`;
    if (checkedCount === items.length) {
      progressBadge.className = "bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-300";
    } else {
      progressBadge.className = "bg-sky-50 text-[#0077d6] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-sky-200";
    }
  }

  container.innerHTML = items.map((item, idx) => {
    const isChecked = !!pickingState[idx];
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;
    const subtotal = Number(item.subtotal) || (price * qty);

    return `
      <div onclick="togglePickingItem('${order.id}', ${idx})"
        class="p-3 flex items-center justify-between cursor-pointer transition select-none ${isChecked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}">
        <div class="flex items-center gap-3">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); togglePickingItem('${order.id}', ${idx})"
            class="w-4 h-4 rounded text-[#0077d6] focus:ring-[#38b6ff] border-slate-300">
          <div>
            <div class="font-extrabold text-xs ${isChecked ? 'line-through text-slate-400' : 'text-slate-800'}">
              ${item.product_name || 'Produk Shinemart'}
            </div>
            <div class="text-[11px] text-slate-500 font-medium">
              <span class="font-bold text-[#0077d6] bg-sky-50 px-1.5 py-0.5 rounded text-[10px]">${qty} pcs</span> &times; ${formatRupiah(price)}
            </div>
          </div>
        </div>
        <div class="text-right font-black text-xs ${isChecked ? 'text-slate-400' : 'text-slate-700'}">
          ${formatRupiah(subtotal)}
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Hubungi Pembeli via WhatsApp Langsung dari Modal Detail
 */
function openOrderCustomerWhatsApp() {
  if (!selectedOrderForModal) return;
  const rawPhone = selectedOrderForModal.customer_phone || "";
  const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
  if (!cleanPhone) {
    showAdminToast("Nomor WhatsApp pelanggan tidak tersedia!", "error");
    return;
  }
  const formattedPhone = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
  const customerName = selectedOrderForModal.customer_name || "Kak";
  const orderNum = selectedOrderForModal.order_number || selectedOrderForModal.id;
  const statusStr = selectedOrderForModal.status || "DIPROSES";

  const message = `Halo Kak ${customerName}! Terima kasih sudah berbelanja di Shinemart.\n\nKami menginformasikan bahwa pesanan #${orderNum} saat ini berstatus: *${statusStr}*.\n\nApakah ada hal lain yang bisa kami bantu? Terima kasih!`;
  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

/**
 * Update Status Pesanan oleh Admin / Staf Gudang
 */
async function updateOrderStatusFromModal(newStatus) {
  if (!selectedOrderForModal) return;
  const client = getAdminSupabaseClient();
  if (!client) {
    showAdminToast("Koneksi Supabase tidak tersedia!", "error");
    return;
  }

  const orderId = selectedOrderForModal.id;
  try {
    const { error } = await client
      .from("orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error) throw error;

    showAdminToast(`Status pesanan berhasil diubah menjadi: ${newStatus}`, "success");

    const idx = liveAdminOrders.findIndex(o => String(o.id) === String(orderId));
    if (idx > -1) {
      liveAdminOrders[idx].status = newStatus;
    }
    selectedOrderForModal.status = newStatus;

    updateOrderStatsCards();
    renderAdminOrdersList();

    const badgeEl = document.getElementById("modalOrderStatusBadge");
    const cfg = getStatusBadgeConfig(newStatus);
    if (badgeEl) {
      badgeEl.textContent = cfg.label;
      badgeEl.className = `text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border ${cfg.badgeClass}`;
    }

  } catch (err) {
    console.error("Gagal mengupdate status pesanan:", err);
    showAdminToast(`Gagal update status: ${err.message}`, "error");
  }
}

/**
 * Toggle Status Tayang Produk (is_active) di Aplikasi Mobile
 */
async function toggleProductActiveStatus(productId, isActive) {
  const client = getAdminSupabaseClient();
  if (!client) {
    showAdminToast("Client Supabase belum siap!", "error");
    return;
  }

  try {
    const { error } = await client
      .from("products")
      .update({ is_active: isActive })
      .eq("id", productId);

    if (error) {
      if (error.message?.includes("is_active") || error.code === "PGRST204") {
        showAdminToast("Kolom is_active belum dibuat di Supabase. Jalankan script mobile_settings.sql di SQL Editor!", "error");
        return;
      }
      throw error;
    }

    const prod = liveSupabaseProducts.find(p => String(p.id) === String(productId));
    if (prod) {
      prod.is_active = isActive;
    }

    showAdminToast(
      isActive 
        ? `Produk "${prod ? prod.name : productId}" sekarang TAYANG di Mobile App` 
        : `Produk "${prod ? prod.name : productId}" DISEMBUNYIKAN dari Mobile App`, 
      "info"
    );

  } catch (err) {
    console.error("Gagal mengubah status aktif produk:", err);
    showAdminToast(`Gagal: ${err.message}`, "error");
  }
}

/**
 * Tampilan UI Buka/Tutup Toko
 */
function updateStoreOpenStatusUI() {
  const toggle = document.getElementById("settingStoreOpenToggle");
  const badgeBox = document.getElementById("storeOpenBadgeBox");
  const statusText = document.getElementById("storeOpenStatusText");
  const isOpen = toggle ? toggle.checked : true;

  if (isOpen) {
    if (badgeBox) badgeBox.className = "p-3 rounded-xl bg-emerald-100/70 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2";
    if (statusText) statusText.textContent = "Toko Sedang BUKA (Menerima Pesanan Instan)";
  } else {
    if (badgeBox) badgeBox.className = "p-3 rounded-xl bg-rose-100/70 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2";
    if (statusText) statusText.textContent = "Toko Sedang TUTUP (Pesanan Instan Ditolak Sementara)";
  }
}

/**
 * Muat Pengaturan Toko dari Supabase
 */
async function loadStoreOperationalSettings() {
  const client = getAdminSupabaseClient();
  if (!client) return;

  try {
    const { data, error } = await client
      .from("store_settings")
      .select("*")
      .eq("id", "main_store")
      .single();

    if (data) {
      liveStoreSettings = { ...liveStoreSettings, ...data };
      const toggle = document.getElementById("settingStoreOpenToggle");
      const notes = document.getElementById("settingStoreCloseNotes");
      const baseFee = document.getElementById("settingBaseDeliveryFee");
      const feePerKm = document.getElementById("settingDeliveryFeePerKm");
      const maxDist = document.getElementById("settingMaxDistanceKm");
      const minFree = document.getElementById("settingFreeDeliveryMinSpend");
      const waInput = document.getElementById("settingStoreWhatsapp");

      if (toggle) toggle.checked = !!liveStoreSettings.is_store_open;
      if (notes) notes.value = liveStoreSettings.auto_close_notes || "";
      if (baseFee) baseFee.value = liveStoreSettings.base_delivery_fee || 10000;
      if (feePerKm) feePerKm.value = liveStoreSettings.delivery_fee_per_km || 2500;
      if (maxDist) maxDist.value = liveStoreSettings.max_delivery_distance_km || 10;
      if (minFree) minFree.value = liveStoreSettings.free_delivery_min_spend || 30000;
      if (waInput && liveStoreSettings.store_whatsapp) waInput.value = liveStoreSettings.store_whatsapp;

      updateStoreOpenStatusUI();
    }
  } catch (err) {
    console.warn("Gagal memuat store_settings:", err);
  }
}

/**
 * Simpan Pengaturan Operasional Toko ke Supabase
 */
async function saveStoreOperationalSettings() {
  const client = getAdminSupabaseClient();
  if (!client) {
    showAdminToast("Koneksi Supabase tidak tersedia!", "error");
    return;
  }

  const toggle = document.getElementById("settingStoreOpenToggle");
  const notes = document.getElementById("settingStoreCloseNotes");
  const baseFee = document.getElementById("settingBaseDeliveryFee");
  const feePerKm = document.getElementById("settingDeliveryFeePerKm");
  const maxDist = document.getElementById("settingMaxDistanceKm");
  const minFree = document.getElementById("settingFreeDeliveryMinSpend");
  const waInput = document.getElementById("settingStoreWhatsapp");

  const payload = {
    id: "main_store",
    is_store_open: toggle ? toggle.checked : true,
    auto_close_notes: notes ? notes.value.trim() : "",
    base_delivery_fee: Number(baseFee?.value) || 10000,
    delivery_fee_per_km: Number(feePerKm?.value) || 2500,
    max_delivery_distance_km: Number(maxDist?.value) || 10,
    free_delivery_min_spend: Number(minFree?.value) || 30000,
    store_whatsapp: waInput ? waInput.value.trim() : "6287782603733",
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await client
      .from("store_settings")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      if (error.message?.includes("store_settings") || error.code === "PGRST205") {
        showAdminToast("Tabel store_settings belum dibuat di Supabase. Jalankan script mobile_settings.sql di SQL Editor!", "error");
        return;
      }
      throw error;
    }

    liveStoreSettings = { ...liveStoreSettings, ...payload };
    updateStoreOpenStatusUI();
    showAdminToast("Pengaturan operasional toko berhasil disimpan!", "success");

  } catch (err) {
    console.error("Gagal menyimpan store_settings:", err);
    showAdminToast(`Gagal menyimpan: ${err.message}`, "error");
  }
}

/* ==============================================================================
 * MODUL PENGELOLAAN DYNAMIC BANNERS & SEKSI PROMO TERPISAH (MOBILE VS WEB)
 * ============================================================================== */

let currentBannerPlatform = "web";
let currentSectionPlatform = "web";
let liveMobileBanners = [];
let liveMobileSections = [];

// 1. SWITCHER PLATFORM UNTUK BANNER (WEBSITE VS MOBILE)
function switchBannerPlatformTab(platform) {
  currentBannerPlatform = platform;
  const btnWeb = document.getElementById("subTabBtnBannerWeb");
  const btnMobile = document.getElementById("subTabBtnBannerMobile");
  const badgeWeb = document.getElementById("supabaseBannersCountBadge");
  const badgeMobile = document.getElementById("mobileBannerCountBadge");
  const webWrapper = document.getElementById("bannerPlatformWebWrapper");
  const mobileWrapper = document.getElementById("bannerPlatformMobileWrapper");
  const btnTopAddBanner = document.getElementById("btnTopAddBanner");

  const activeBtnClass = "px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 bg-white text-[#ff66c4] shadow-sm";
  const inactiveBtnClass = "px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 text-slate-600 hover:text-slate-900";
  const activeBadgeClass = "bg-pink-50 text-[#ff66c4] text-[10px] font-black px-2 py-0.5 rounded-full border border-pink-200";
  const inactiveBadgeClass = "bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full";

  if (platform === "mobile") {
    if (btnWeb) btnWeb.className = inactiveBtnClass;
    if (btnMobile) btnMobile.className = activeBtnClass;
    if (badgeWeb) badgeWeb.className = inactiveBadgeClass;
    if (badgeMobile) badgeMobile.className = activeBadgeClass;
    if (webWrapper) webWrapper.classList.add("hidden");
    if (mobileWrapper) mobileWrapper.classList.remove("hidden");
    if (btnTopAddBanner) {
      btnTopAddBanner.onclick = openAddMobileBannerModal;
      btnTopAddBanner.innerHTML = '<i class="fas fa-plus"></i><span>Tambah Banner Mobile</span>';
    }
    loadMobileBannersList();
  } else {
    if (btnWeb) btnWeb.className = activeBtnClass;
    if (btnMobile) btnMobile.className = inactiveBtnClass;
    if (badgeWeb) badgeWeb.className = activeBadgeClass;
    if (badgeMobile) badgeMobile.className = inactiveBadgeClass;
    if (webWrapper) webWrapper.classList.remove("hidden");
    if (mobileWrapper) mobileWrapper.classList.add("hidden");
    if (btnTopAddBanner) {
      btnTopAddBanner.onclick = openAddBannerModal;
      btnTopAddBanner.innerHTML = '<i class="fas fa-plus"></i><span>Tambah Banner Web</span>';
    }
    loadSupabaseBannersList();
  }
}

// 2. SWITCHER PLATFORM UNTUK SEKSI PROMO (WEBSITE VS MOBILE)
function switchSectionPlatformTab(platform) {
  currentSectionPlatform = platform;
  const btnWeb = document.getElementById("subTabBtnSectionWeb");
  const btnMobile = document.getElementById("subTabBtnSectionMobile");
  const badgeWeb = document.getElementById("supabaseSectionsCountBadge");
  const badgeMobile = document.getElementById("mobileSectionCountBadge");
  const webWrapper = document.getElementById("sectionPlatformWebWrapper");
  const mobileWrapper = document.getElementById("sectionPlatformMobileWrapper");
  const btnTopAddSection = document.getElementById("btnTopAddSection");

  const activeBtnClass = "px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 bg-white text-[#0077d6] shadow-sm";
  const inactiveBtnClass = "px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 text-slate-600 hover:text-slate-900";
  const activeBadgeClass = "bg-sky-50 text-[#0077d6] text-[10px] font-black px-2 py-0.5 rounded-full border border-sky-200";
  const inactiveBadgeClass = "bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full";

  if (platform === "mobile") {
    if (btnWeb) btnWeb.className = inactiveBtnClass;
    if (btnMobile) btnMobile.className = activeBtnClass;
    if (badgeWeb) badgeWeb.className = inactiveBadgeClass;
    if (badgeMobile) badgeMobile.className = activeBadgeClass;
    if (webWrapper) webWrapper.classList.add("hidden");
    if (mobileWrapper) mobileWrapper.classList.remove("hidden");
    if (btnTopAddSection) {
      btnTopAddSection.onclick = openAddMobileSectionModal;
      btnTopAddSection.innerHTML = '<i class="fas fa-plus"></i><span>Buat Seksi Promo Mobile</span>';
    }
    loadMobileSectionsList();
  } else {
    if (btnWeb) btnWeb.className = activeBtnClass;
    if (btnMobile) btnMobile.className = inactiveBtnClass;
    if (badgeWeb) badgeWeb.className = activeBadgeClass;
    if (badgeMobile) badgeMobile.className = inactiveBadgeClass;
    if (webWrapper) webWrapper.classList.remove("hidden");
    if (mobileWrapper) mobileWrapper.classList.add("hidden");
    if (btnTopAddSection) {
      btnTopAddSection.onclick = openAddSectionModal;
      btnTopAddSection.innerHTML = '<i class="fas fa-plus"></i><span>Tambah Seksi Promo Web</span>';
    }
    loadSupabaseSectionsList();
  }
}

// ==============================================================================
// 3. LOGIKA CRUD DYNAMIC BANNER KHUSUS MOBILE APP (public.mobile_banners)
// ==============================================================================

async function loadMobileBannersList() {
  const tbody = document.getElementById("mobileBannersTableBody");
  const countBadge = document.getElementById("mobileBannerCountBadge");
  const countText = document.getElementById("mobileBannersCountText");
  const appSettingsBadge = document.getElementById("appSettingsMobileBannerCount");
  const summaryEl = document.getElementById("activeMobileBannersSummary");

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-8 text-xs text-slate-400">
        <i class="fas fa-spinner fa-spin mr-1.5 text-pink-500"></i> Memuat daftar banner mobile dari Supabase...
      </td>
    </tr>
  `;

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-xs text-pink-500 font-bold">Kredensial Supabase belum terkonfigurasi.</td></tr>`;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("mobile_banners")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      if (error.code === "PGRST205" || String(error.message).includes("schema cache") || String(error.message).includes("mobile_banners")) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-8 px-4">
              <div class="max-w-md mx-auto space-y-3">
                <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl mx-auto">
                  <i class="fas fa-mobile-alt"></i>
                </div>
                <h4 class="font-extrabold text-slate-800 text-sm">Tabel "mobile_banners" Belum Ada di Supabase</h4>
                <p class="text-xs text-slate-500 leading-relaxed">
                  Jalankan script <code>mobile_promos.sql</code> di SQL Editor Supabase untuk membuat tabel banner khusus Mobile App.
                </p>
                <button onclick="openSqlGuideModal('mobile')" class="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 text-white font-extrabold rounded-xl text-xs shadow transition">
                  <i class="fas fa-code mr-1.5"></i> Salin SQL mobile_promos.sql
                </button>
              </div>
            </td>
          </tr>
        `;
        if (countBadge) countBadge.textContent = "0";
        if (countText) countText.textContent = "0 banner";
        if (appSettingsBadge) appSettingsBadge.textContent = "0 banner";
        return;
      }
      throw error;
    }

    liveMobileBanners = data || [];
    renderMobileBannersTable(liveMobileBanners);

    const activeCount = liveMobileBanners.filter(b => b.is_active).length;
    if (countBadge) countBadge.textContent = liveMobileBanners.length;
    if (countText) countText.textContent = `${liveMobileBanners.length} banner (${activeCount} aktif)`;
    if (appSettingsBadge) appSettingsBadge.textContent = `${activeCount} banner aktif`;
    if (summaryEl) summaryEl.textContent = `${activeCount} dari ${liveMobileBanners.length} banner aktif di aplikasi HP`;

  } catch (err) {
    console.error("Gagal memuat mobile_banners:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-xs text-pink-600 font-bold">Error: ${err.message}</td></tr>`;
  }
}

function renderMobileBannersTable(banners) {
  const tbody = document.getElementById("mobileBannersTableBody");
  if (!tbody) return;

  if (!banners || banners.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 px-4 text-xs text-slate-400">
          <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto mb-2">
            <i class="fas fa-mobile-alt"></i>
          </div>
          <span class="font-bold text-slate-600 block mb-1">Belum ada banner untuk Mobile App</span>
          <span>Klik tombol <strong>+ Tambah Banner Mobile</strong> di atas untuk membuat banner promosi pertama.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = banners.map((b, idx) => {
    const imgUrl = formatGoogleDriveImageUrl(b.image_url);
    const actionDesc = b.action_type === 'voucher' 
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-50 text-pink-700 font-mono text-[11px] font-bold border border-pink-200"><i class="fas fa-ticket-alt"></i> Kupon: ${escapeHtml(b.action_value || '-')}</span>`
      : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-[#0077d6] text-[11px] font-bold border border-sky-200"><i class="fas fa-th-large"></i> Kategori: ${escapeHtml(b.action_value || 'all')}</span>`;

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/70 transition">
        <td class="py-3 px-3 text-center font-extrabold text-slate-700 text-xs">
          ${b.sort_order || idx + 1}
        </td>
        <td class="py-3 px-3">
          <div class="w-28 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group">
            <img src="${imgUrl}" alt="${escapeHtml(b.title)}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <a href="${imgUrl}" target="_blank" class="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs font-bold" title="Lihat Foto Full">
              <i class="fas fa-external-link-alt"></i>
            </a>
            <span class="absolute bottom-1 right-1 px-1 bg-black/60 text-white text-[8px] font-mono rounded">16:9</span>
          </div>
        </td>
        <td class="py-3 px-3">
          <div class="space-y-0.5">
            <span class="inline-block px-2 py-0.5 bg-pink-100 text-[#ff66c4] font-black text-[9px] rounded-md uppercase tracking-wider">
              ${escapeHtml(b.badge || 'PROMO')}
            </span>
            <div class="font-bold text-slate-900 text-xs line-clamp-1">${escapeHtml(b.title)}</div>
          </div>
        </td>
        <td class="py-3 px-3">
          ${actionDesc}
        </td>
        <td class="py-3 px-3 text-center">
          <button type="button" onclick="toggleMobileBannerActive('${b.id}', ${b.is_active})"
            class="px-3 py-1 rounded-full text-[11px] font-bold transition inline-flex items-center gap-1.5 ${
              b.is_active 
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }">
            <i class="fas ${b.is_active ? 'fa-check-circle' : 'fa-times-circle'} text-[10px]"></i>
            <span>${b.is_active ? 'Tayang di HP' : 'Nonaktif'}</span>
          </button>
        </td>
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditMobileBannerModal('${b.id}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-sky-50 hover:text-[#0077d6] text-slate-600 flex items-center justify-center transition" title="Edit Banner Mobile">
              <i class="fas fa-edit text-xs"></i>
            </button>
            <button onclick="deleteMobileBanner('${b.id}', '${escapeHtml(b.title)}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-pink-50 hover:text-pink-600 text-slate-600 flex items-center justify-center transition" title="Hapus Banner Mobile">
              <i class="fas fa-trash-alt text-xs"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterMobileBannersTable() {
  const query = (document.getElementById("mobileBannerSearchInput")?.value || "").toLowerCase().trim();
  if (!query) {
    renderMobileBannersTable(liveMobileBanners);
    return;
  }
  const filtered = liveMobileBanners.filter(b => 
    (b.title || "").toLowerCase().includes(query) ||
    (b.badge || "").toLowerCase().includes(query) ||
    (b.action_value || "").toLowerCase().includes(query)
  );
  renderMobileBannersTable(filtered);
}

function openAddMobileBannerModal() {
  document.getElementById("mobileBannerId").value = "";
  document.getElementById("mobileBannerExistingImageUrl").value = "";
  document.getElementById("mobileBannerTitleInput").value = "";
  document.getElementById("mobileBannerBadgeInput").value = "⚡ FLASH SALE • DISKON 40%";
  document.getElementById("mobileBannerImageUrlInput").value = "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80";
  document.getElementById("mobileBannerActionTypeInput").value = "category";
  document.getElementById("mobileBannerActionValueInput").value = "sembako";
  document.getElementById("mobileBannerSortOrderInput").value = (liveMobileBanners.length + 1).toString();
  document.getElementById("mobileBannerIsActiveInput").checked = true;
  document.getElementById("mobileBannerModalTitle").textContent = "Tambah Banner Mobile Baru";
  handleMobileBannerActionTypeChange();
  updateMobileBannerLivePreview();

  const modal = document.getElementById("mobileBannerModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function openEditMobileBannerModal(id) {
  const banner = liveMobileBanners.find(b => String(b.id) === String(id));
  if (!banner) return;

  document.getElementById("mobileBannerId").value = banner.id;
  document.getElementById("mobileBannerExistingImageUrl").value = banner.image_url || "";
  document.getElementById("mobileBannerTitleInput").value = banner.title || "";
  document.getElementById("mobileBannerBadgeInput").value = banner.badge || "";
  document.getElementById("mobileBannerImageUrlInput").value = banner.image_url || "";
  document.getElementById("mobileBannerActionTypeInput").value = banner.action_type || "category";
  document.getElementById("mobileBannerActionValueInput").value = banner.action_value || "";
  document.getElementById("mobileBannerSortOrderInput").value = (banner.sort_order || 1).toString();
  document.getElementById("mobileBannerIsActiveInput").checked = !!banner.is_active;
  document.getElementById("mobileBannerModalTitle").textContent = "Edit Banner Mobile";
  handleMobileBannerActionTypeChange();
  updateMobileBannerLivePreview();

  const modal = document.getElementById("mobileBannerModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeMobileBannerModal() {
  const modal = document.getElementById("mobileBannerModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function handleMobileBannerActionTypeChange() {
  const type = document.getElementById("mobileBannerActionTypeInput")?.value;
  const label = document.getElementById("mobileBannerActionValueLabel");
  const input = document.getElementById("mobileBannerActionValueInput");
  if (!label || !input) return;

  if (type === "voucher") {
    label.textContent = "Kode Kupon Diskon (Misal: ONGKIRGRATIS)";
    input.placeholder = "Contoh: ONGKIRGRATIS";
  } else {
    label.textContent = "Target Kategori Produk (Misal: sembako, frozen)";
    input.placeholder = "Contoh: sembako";
  }
}

function updateMobileBannerLivePreview() {
  const title = document.getElementById("mobileBannerTitleInput")?.value || "Judul Banner Promo Mobile";
  const badge = document.getElementById("mobileBannerBadgeInput")?.value || "⚡ FLASH SALE";
  const rawUrl = document.getElementById("mobileBannerImageUrlInput")?.value || "";
  const finalUrl = formatGoogleDriveImageUrl(rawUrl);

  const prevTitle = document.getElementById("previewMobileBannerTitle");
  const prevBadge = document.getElementById("previewMobileBannerBadge");
  const prevImg = document.getElementById("previewMobileBannerImg");

  if (prevTitle) prevTitle.textContent = title;
  if (prevBadge) prevBadge.textContent = badge;
  if (prevImg) prevImg.src = finalUrl;
}

async function handleMobileBannerFileSelected(input) {
  const file = input.files?.[0];
  if (!file) return;

  const label = document.getElementById("mobileBannerImageFileLabel");
  if (label) label.textContent = "Mengunggah...";

  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase belum terkonfigurasi!");

    const ext = file.name.split('.').pop() || 'png';
    const fileName = `mobile_banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('banners')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage
      .from('banners')
      .getPublicUrl(fileName);

    if (publicData?.publicUrl) {
      document.getElementById("mobileBannerImageUrlInput").value = publicData.publicUrl;
      updateMobileBannerLivePreview();
      if (label) label.textContent = file.name;
      showAdminToast("Foto banner mobile berhasil diunggah!", "success");
    }
  } catch (err) {
    console.error("Gagal upload banner mobile:", err);
    showAdminToast(`Gagal upload foto: ${err.message}`, "error");
    if (label) label.textContent = "Pilih File Foto";
  }
}

async function handleSaveMobileBanner(event) {
  event.preventDefault();
  const btn = document.getElementById("btnSaveMobileBanner");
  const originalHtml = btn?.innerHTML || "Simpan";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan...';
  }

  const id = document.getElementById("mobileBannerId")?.value.trim();
  const title = document.getElementById("mobileBannerTitleInput")?.value.trim();
  const badge = document.getElementById("mobileBannerBadgeInput")?.value.trim() || "⚡ PROMO";
  const rawUrl = document.getElementById("mobileBannerImageUrlInput")?.value.trim();
  const actionType = document.getElementById("mobileBannerActionTypeInput")?.value || "category";
  const actionValue = document.getElementById("mobileBannerActionValueInput")?.value.trim() || "all";
  const sortOrder = parseInt(document.getElementById("mobileBannerSortOrderInput")?.value) || 1;
  const isActive = document.getElementById("mobileBannerIsActiveInput")?.checked ?? true;

  if (!title || !rawUrl) {
    showAdminToast("Judul promo dan foto banner wajib diisi!", "warning");
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    return;
  }

  const formattedImageUrl = formatGoogleDriveImageUrl(rawUrl);

  const payload = {
    title,
    badge,
    image_url: formattedImageUrl,
    action_type: actionType,
    action_value: actionValue,
    sort_order: sortOrder,
    is_active: isActive
  };

  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase client belum siap!");

    let resError = null;
    if (id) {
      const { error } = await supabaseClient.from("mobile_banners").update(payload).eq("id", id);
      resError = error;
    } else {
      const { error } = await supabaseClient.from("mobile_banners").insert([payload]);
      resError = error;
    }

    if (resError) throw resError;

    showAdminToast("Banner Mobile App berhasil disimpan!", "success");
    closeMobileBannerModal();
    loadMobileBannersList();
    loadSupabaseBannersList();

  } catch (err) {
    console.error("Gagal simpan banner mobile:", err);
    showAdminToast(`Gagal menyimpan banner mobile: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
  }
}

async function toggleMobileBannerActive(id, currentStatus) {
  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) return;
    const nextStatus = !currentStatus;
    const { error } = await supabaseClient.from("mobile_banners").update({ is_active: nextStatus }).eq("id", id);
    if (error) throw error;
    showAdminToast(`Status tayang banner mobile diubah menjadi ${nextStatus ? 'Aktif' : 'Nonaktif'}`, "success");
    loadMobileBannersList();
    loadSupabaseBannersList();
  } catch (err) {
    console.error("Gagal toggle status:", err);
    showAdminToast(`Gagal update status: ${err.message}`, "error");
  }
}

async function deleteMobileBanner(id, title) {
  if (!confirm(`Hapus banner mobile "${title}"?`)) return;
  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from("mobile_banners").delete().eq("id", id);
    if (error) throw error;
    showAdminToast("Banner mobile berhasil dihapus!", "success");
    loadMobileBannersList();
    loadSupabaseBannersList();
  } catch (err) {
    console.error("Gagal menghapus banner mobile:", err);
    showAdminToast(`Gagal menghapus: ${err.message}`, "error");
  }
}


// ==============================================================================
// 4. LOGIKA CRUD SEKSI PROMO KHUSUS MOBILE APP (public.mobile_promotional_sections)
// ==============================================================================

async function loadMobileSectionsList() {
  const tbody = document.getElementById("mobileSectionsTableBody");
  const countBadge = document.getElementById("mobileSectionCountBadge");
  const countText = document.getElementById("mobileSectionsCountText");
  const appSettingsBadge = document.getElementById("appSettingsMobileSectionCount");

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center py-8 text-xs text-slate-400">
        <i class="fas fa-spinner fa-spin mr-1.5 text-sky-500"></i> Memuat daftar seksi promo mobile dari Supabase...
      </td>
    </tr>
  `;

  const supabaseClient = getAdminSupabaseClient();
  if (!supabaseClient) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-xs text-pink-500 font-bold">Kredensial Supabase belum terkonfigurasi.</td></tr>`;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("mobile_promotional_sections")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      if (error.code === "PGRST205" || String(error.message).includes("schema cache") || String(error.message).includes("mobile_promotional_sections")) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center py-8 px-4">
              <div class="max-w-md mx-auto space-y-3">
                <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl mx-auto">
                  <i class="fas fa-layer-group"></i>
                </div>
                <h4 class="font-extrabold text-slate-800 text-sm">Tabel "mobile_promotional_sections" Belum Ada</h4>
                <p class="text-xs text-slate-500 leading-relaxed">
                  Jalankan script <code>mobile_promos.sql</code> di SQL Editor Supabase untuk membuat tabel seksi promo khusus Mobile App.
                </p>
                <button onclick="openSqlGuideModal('mobile')" class="px-4 py-2 bg-gradient-to-r from-[#0077d6] to-[#38b6ff] text-white font-extrabold rounded-xl text-xs shadow transition">
                  <i class="fas fa-code mr-1.5"></i> Salin SQL mobile_promos.sql
                </button>
              </div>
            </td>
          </tr>
        `;
        if (countBadge) countBadge.textContent = "0";
        if (countText) countText.textContent = "0 Seksi";
        if (appSettingsBadge) appSettingsBadge.textContent = "0 seksi";
        return;
      }
      throw error;
    }

    liveMobileSections = data || [];
    renderMobileSectionsTable(liveMobileSections);

    const activeCount = liveMobileSections.filter(s => s.is_active).length;
    if (countBadge) countBadge.textContent = liveMobileSections.length;
    if (countText) countText.textContent = `${liveMobileSections.length} Seksi (${activeCount} aktif)`;
    if (appSettingsBadge) appSettingsBadge.textContent = `${activeCount} seksi aktif`;

  } catch (err) {
    console.error("Gagal memuat mobile_promotional_sections:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-xs text-pink-600 font-bold">Error: ${err.message}</td></tr>`;
  }
}

function renderMobileSectionsTable(sections) {
  const tbody = document.getElementById("mobileSectionsTableBody");
  if (!tbody) return;

  if (!sections || sections.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 px-4 text-xs text-slate-400">
          <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto mb-2">
            <i class="fas fa-layer-group"></i>
          </div>
          <span class="font-bold text-slate-600 block mb-1">Belum ada seksi promo untuk Mobile App</span>
          <span>Klik tombol <strong>+ Buat Seksi Promo Mobile</strong> di atas untuk membuat seksi pertama.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sections.map((s, idx) => {
    const posterUrl = formatGoogleDriveImageUrl(s.poster_image);
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/70 transition">
        <td class="py-3 px-3 text-center font-extrabold text-slate-700 text-xs">
          ${s.sort_order || idx + 1}
        </td>
        <td class="py-3 px-3">
          <div class="w-20 h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group">
            <img src="${posterUrl}" alt="${escapeHtml(s.title)}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <a href="${posterUrl}" target="_blank" class="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs font-bold" title="Lihat Foto Poster">
              <i class="fas fa-external-link-alt"></i>
            </a>
            <span class="absolute bottom-1 right-1 px-1 bg-black/60 text-white text-[8px] font-mono rounded">3:4</span>
          </div>
        </td>
        <td class="py-3 px-4">
          <div class="space-y-0.5">
            <div class="font-extrabold text-slate-900 text-xs">${escapeHtml(s.title)}</div>
            <div class="text-[11px] text-slate-500 line-clamp-1">${escapeHtml(s.subtitle || '-')}</div>
          </div>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-center gap-1.5">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center text-sm shadow-xs" style="background:${escapeHtml(s.icon_bg || '#0077D6')};">
              ${escapeHtml(s.icon || '🔥')}
            </div>
            <span class="px-2 py-0.5 bg-pink-100 text-[#ff66c4] font-black text-[9px] rounded uppercase">
              ${escapeHtml(s.badge || 'PROMO')}
            </span>
          </div>
        </td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-[#0077d6] font-bold text-[11px] border border-sky-200">
            <i class="fas fa-tag text-[10px]"></i> ${escapeHtml(s.category_filter || 'all')}
          </span>
        </td>
        <td class="py-3 px-3 text-center font-bold text-slate-700 text-xs">
          ${s.sort_order || 1}
        </td>
        <td class="py-3 px-3 text-center">
          <button type="button" onclick="toggleMobileSectionActive('${s.id}', ${s.is_active})"
            class="px-3 py-1 rounded-full text-[11px] font-bold transition inline-flex items-center gap-1.5 ${
              s.is_active 
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }">
            <i class="fas ${s.is_active ? 'fa-check-circle' : 'fa-times-circle'} text-[10px]"></i>
            <span>${s.is_active ? 'Aktif di HP' : 'Nonaktif'}</span>
          </button>
        </td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditMobileSectionModal('${s.id}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-sky-50 hover:text-[#0077d6] text-slate-600 flex items-center justify-center transition" title="Edit Seksi Promo Mobile">
              <i class="fas fa-edit text-xs"></i>
            </button>
            <button onclick="deleteMobileSection('${s.id}', '${escapeHtml(s.title)}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-pink-50 hover:text-pink-600 text-slate-600 flex items-center justify-center transition" title="Hapus Seksi Promo Mobile">
              <i class="fas fa-trash-alt text-xs"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openAddMobileSectionModal() {
  document.getElementById("mobileSectionId").value = "";
  document.getElementById("mobileSectionExistingImageUrl").value = "";
  document.getElementById("mobileSectionTitleInput").value = "";
  document.getElementById("mobileSectionSubtitleInput").value = "Koleksi promo pilihan hemat Shinemart";
  document.getElementById("mobileSectionBadgeInput").value = "PROMO SPESIAL";
  document.getElementById("mobileSectionIconInput").value = "🔥";
  document.getElementById("mobileSectionIconBgInput").value = "#0077D6";
  document.getElementById("mobileSectionPosterUrlInput").value = "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80";
  document.getElementById("mobileSectionCategoryFilterInput").value = "sembako";
  document.getElementById("mobileSectionSortOrderInput").value = (liveMobileSections.length + 1).toString();
  document.getElementById("mobileSectionIsActiveInput").checked = true;
  document.getElementById("mobileSectionModalTitle").textContent = "Buat Seksi Promo Mobile Baru";
  updateMobileSectionLivePreview();

  const modal = document.getElementById("mobileSectionModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function openEditMobileSectionModal(id) {
  const section = liveMobileSections.find(s => String(s.id) === String(id));
  if (!section) return;

  document.getElementById("mobileSectionId").value = section.id;
  document.getElementById("mobileSectionExistingImageUrl").value = section.poster_image || "";
  document.getElementById("mobileSectionTitleInput").value = section.title || "";
  document.getElementById("mobileSectionSubtitleInput").value = section.subtitle || "";
  document.getElementById("mobileSectionBadgeInput").value = section.badge || "PROMO SPESIAL";
  document.getElementById("mobileSectionIconInput").value = section.icon || "🔥";
  document.getElementById("mobileSectionIconBgInput").value = section.icon_bg || "#0077D6";
  document.getElementById("mobileSectionPosterUrlInput").value = section.poster_image || "";
  document.getElementById("mobileSectionCategoryFilterInput").value = section.category_filter || "sembako";
  document.getElementById("mobileSectionSortOrderInput").value = (section.sort_order || 1).toString();
  document.getElementById("mobileSectionIsActiveInput").checked = !!section.is_active;
  document.getElementById("mobileSectionModalTitle").textContent = "Edit Seksi Promo Mobile";
  updateMobileSectionLivePreview();

  const modal = document.getElementById("mobileSectionModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeMobileSectionModal() {
  const modal = document.getElementById("mobileSectionModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function selectMobileSectionEmoji(emoji) {
  const input = document.getElementById("mobileSectionIconInput");
  if (input) {
    input.value = emoji;
    updateMobileSectionLivePreview();
  }
}

function selectMobileSectionColor(color) {
  const input = document.getElementById("mobileSectionIconBgInput");
  if (input) {
    input.value = color;
    updateMobileSectionLivePreview();
  }
}

function updateMobileSectionLivePreview() {
  const title = document.getElementById("mobileSectionTitleInput")?.value || "Sembako Murah";
  const sub = document.getElementById("mobileSectionSubtitleInput")?.value || "Koleksi promo pilihan hemat Shinemart";
  const badge = document.getElementById("mobileSectionBadgeInput")?.value || "PROMO SPESIAL";
  const icon = document.getElementById("mobileSectionIconInput")?.value || "🔥";
  const iconBg = document.getElementById("mobileSectionIconBgInput")?.value || "#0077D6";
  const rawUrl = document.getElementById("mobileSectionPosterUrlInput")?.value || "";
  const finalUrl = formatGoogleDriveImageUrl(rawUrl);

  const prevTitle = document.getElementById("previewMobileSectionTitle");
  const prevSub = document.getElementById("previewMobileSectionSub");
  const prevPosterTitle = document.getElementById("previewMobileSectionPosterTitle");
  const prevBadge = document.getElementById("previewMobileSectionBadge");
  const prevEmoji = document.getElementById("previewMobileSectionEmoji");
  const prevIconBox = document.getElementById("previewMobileSectionIconBox");
  const prevPosterImg = document.getElementById("previewMobileSectionPosterImg");

  if (prevTitle) prevTitle.textContent = title;
  if (prevSub) prevSub.textContent = sub;
  if (prevPosterTitle) prevPosterTitle.textContent = title;
  if (prevBadge) prevBadge.textContent = badge;
  if (prevEmoji) prevEmoji.textContent = icon;
  if (prevIconBox) prevIconBox.style.backgroundColor = iconBg;
  if (prevPosterImg) prevPosterImg.src = finalUrl;
}

async function handleMobileSectionFileSelected(input) {
  const file = input.files?.[0];
  if (!file) return;

  const label = document.getElementById("mobileSectionPosterFileLabel");
  if (label) label.textContent = "Mengunggah...";

  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase belum terkonfigurasi!");

    const ext = file.name.split('.').pop() || 'png';
    const fileName = `mobile_section_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('banners')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage
      .from('banners')
      .getPublicUrl(fileName);

    if (publicData?.publicUrl) {
      document.getElementById("mobileSectionPosterUrlInput").value = publicData.publicUrl;
      updateMobileSectionLivePreview();
      if (label) label.textContent = file.name;
      showAdminToast("Foto poster mobile berhasil diunggah!", "success");
    }
  } catch (err) {
    console.error("Gagal upload poster mobile:", err);
    showAdminToast(`Gagal upload poster: ${err.message}`, "error");
    if (label) label.textContent = "Pilih File Poster";
  }
}

async function handleSaveMobileSection(event) {
  event.preventDefault();
  const btn = document.getElementById("btnSaveMobileSection");
  const originalHtml = btn?.innerHTML || "Simpan";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Menyimpan...';
  }

  const id = document.getElementById("mobileSectionId")?.value.trim();
  const title = document.getElementById("mobileSectionTitleInput")?.value.trim();
  const subtitle = document.getElementById("mobileSectionSubtitleInput")?.value.trim();
  const badge = document.getElementById("mobileSectionBadgeInput")?.value.trim() || "PROMO SPESIAL";
  const icon = document.getElementById("mobileSectionIconInput")?.value.trim() || "🔥";
  const iconBg = document.getElementById("mobileSectionIconBgInput")?.value.trim() || "#0077D6";
  const rawPoster = document.getElementById("mobileSectionPosterUrlInput")?.value.trim();
  const categoryFilter = document.getElementById("mobileSectionCategoryFilterInput")?.value || "sembako";
  const sortOrder = parseInt(document.getElementById("mobileSectionSortOrderInput")?.value) || 1;
  const isActive = document.getElementById("mobileSectionIsActiveInput")?.checked ?? true;

  if (!title || !rawPoster) {
    showAdminToast("Judul seksi dan foto poster card wajib diisi!", "warning");
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    return;
  }

  const formattedPoster = formatGoogleDriveImageUrl(rawPoster);

  const payload = {
    title,
    subtitle,
    badge,
    icon,
    icon_bg: iconBg,
    poster_image: formattedPoster,
    category_filter: categoryFilter,
    sort_order: sortOrder,
    is_active: isActive
  };

  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase client belum siap!");

    let resError = null;
    if (id) {
      const { error } = await supabaseClient.from("mobile_promotional_sections").update(payload).eq("id", id);
      resError = error;
    } else {
      const { error } = await supabaseClient.from("mobile_promotional_sections").insert([payload]);
      resError = error;
    }

    if (resError) throw resError;

    showAdminToast("Seksi Promo Mobile App berhasil disimpan!", "success");
    closeMobileSectionModal();
    loadMobileSectionsList();
    loadSupabaseSectionsList();

  } catch (err) {
    console.error("Gagal simpan seksi promo mobile:", err);
    showAdminToast(`Gagal menyimpan seksi promo mobile: ${err.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
  }
}

async function toggleMobileSectionActive(id, currentStatus) {
  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) return;
    const nextStatus = !currentStatus;
    const { error } = await supabaseClient.from("mobile_promotional_sections").update({ is_active: nextStatus }).eq("id", id);
    if (error) throw error;
    showAdminToast(`Status seksi promo mobile diubah menjadi ${nextStatus ? 'Aktif' : 'Nonaktif'}`, "success");
    loadMobileSectionsList();
    loadSupabaseSectionsList();
  } catch (err) {
    console.error("Gagal toggle status seksi promo:", err);
    showAdminToast(`Gagal update status: ${err.message}`, "error");
  }
}

async function deleteMobileSection(id, title) {
  if (!confirm(`Hapus seksi promo mobile "${title}"?`)) return;
  try {
    const supabaseClient = getAdminSupabaseClient();
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from("mobile_promotional_sections").delete().eq("id", id);
    if (error) throw error;
    showAdminToast("Seksi promo mobile berhasil dihapus!", "success");
    loadMobileSectionsList();
    loadSupabaseSectionsList();
  } catch (err) {
    console.error("Gagal menghapus seksi promo mobile:", err);
    showAdminToast(`Gagal menghapus: ${err.message}`, "error");
  }
}

// Inisialisasi awal sinkronisasi badge counter saat script dimuat
function initAllPromoBadges() {
  if (typeof loadSupabaseBannersList === "function") loadSupabaseBannersList();
  if (typeof loadMobileBannersList === "function") loadMobileBannersList();
  if (typeof loadSupabaseSectionsList === "function") loadSupabaseSectionsList();
  if (typeof loadMobileSectionsList === "function") loadMobileSectionsList();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(initAllPromoBadges, 600));
} else {
  setTimeout(initAllPromoBadges, 600);
}




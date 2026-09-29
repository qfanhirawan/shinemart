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

// Session Storage Key untuk Login Admin
const ADMIN_SESSION_KEY = "shinemart_admin_authenticated";
const ADMIN_CREDENTIALS = {
  user: "admin",
  pass: "shinemart2026"
};

document.addEventListener("DOMContentLoaded", () => {
  checkAdminAuth();
  setupAdminListeners();
});

/**
 * Cek status autentikasi Admin
 */
function checkAdminAuth() {
  const isAuth = sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
  const loginOverlay = document.getElementById("loginOverlaySection");
  const mainContent = document.getElementById("adminMainContent");
  const logoutBtn = document.getElementById("adminLogoutBtn");

  if (isAuth) {
    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (mainContent) mainContent.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    loadSupabaseProductsList();
  } else {
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
  }
}

/**
 * Handler Submit Form Login
 */
function handleAdminLogin(event) {
  event.preventDefault();
  const userInput = document.getElementById("adminUsernameInput");
  const passInput = document.getElementById("adminPasswordInput");
  const errorMsg = document.getElementById("loginErrorMsg");

  const username = userInput ? userInput.value.trim() : "";
  const password = passInput ? passInput.value.trim() : "";

  if (username === ADMIN_CREDENTIALS.user && password === ADMIN_CREDENTIALS.pass) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    if (errorMsg) errorMsg.classList.add("hidden");
    showAdminToast("Login berhasil! Selamat datang di Admin Panel.", "success");
    checkAdminAuth();
  } else {
    if (errorMsg) errorMsg.classList.remove("hidden");
    if (passInput) passInput.value = "";
  }
}

/**
 * Handler Logout Admin
 */
function handleAdminLogout() {
  if (confirm("Apakah Anda yakin ingin keluar dari Admin Panel?")) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    showAdminToast("Anda telah keluar.", "info");
    checkAdminAuth();
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

// Konfigurasi Database Supabase
const DEFAULT_SUPABASE_URL = "https://amuqgtdyecgdxclqwanj.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_G-am3ojwBmpNqbZDi5qciA_6fn37rX9";

function getAdminSupabaseClient() {
  const url = localStorage.getItem("shinemart_supabase_url") || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem("shinemart_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;
  if (typeof supabase !== "undefined" && url && key) {
    try {
      return supabase.createClient(url, key);
    } catch (e) {
      console.warn("Gagal inisialisasi Supabase:", e);
      return null;
    }
  }
  return null;
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
    showAdminToast("Kredensial Supabase berhasil disimpan!", "success");
    loadSupabaseProductsList();
  } else {
    localStorage.removeItem("shinemart_supabase_url");
    localStorage.removeItem("shinemart_supabase_anon_key");
    showAdminToast("Konfigurasi Supabase dihapus.", "info");
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
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    liveSupabaseProducts = data || [];
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
    return `
      <tr class="hover:bg-sky-50/40 border-b border-slate-100 transition text-xs">
        <td class="py-3 px-3 font-mono text-slate-400 text-center">${idx + 1}</td>
        <td class="py-3 px-3">
          <div class="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
            <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-contain p-1" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
          </div>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-800 text-xs md:text-sm">${item.name}</div>
          <span class="text-[10px] text-slate-400 font-mono">ID: ${item.id}</span>
        </td>
        <td class="py-3 px-3">
          <span class="capitalize font-semibold text-[#0077d6] bg-sky-50 px-2 py-0.5 rounded text-[11px]">${item.category || 'sembako'}</span>
        </td>
        <td class="py-3 px-3 font-extrabold text-[#0077d6]">${formatRupiah(item.price)}</td>
        <td class="py-3 px-3 text-slate-500">${item.unit || '1 Pcs'}</td>
        <td class="py-3 px-3">
          <span class="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">${item.stock || 'Ready'}</span>
        </td>
        <td class="py-3 px-3 text-center">
          <button onclick="deleteProductFromSupabase('${item.id}', '${item.name.replace(/'/g, "\\'")}')"
            class="px-2.5 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-500 text-pink-600 hover:text-white transition font-bold text-xs"
            title="Hapus Produk dari Supabase">
            <i class="fas fa-trash-alt mr-1"></i> Hapus
          </button>
        </td>
      </tr>
    `;
  }).join("");
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

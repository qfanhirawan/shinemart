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
    loadSupabaseBannersList();
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
  if (imgPreview) imgPreview.src = formatGoogleDriveImageUrl(currentImg);

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
  if (imgPreview) {
    imgPreview.src = formatGoogleDriveImageUrl(url);
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
  const productsTab = document.getElementById("productsTabSection");
  const bannersTab = document.getElementById("bannersTabSection");
  const tabBtnProducts = document.getElementById("tabBtnProducts");
  const tabBtnBanners = document.getElementById("tabBtnBanners");
  const btnTopAddBanner = document.getElementById("btnTopAddBanner");

  if (tabName === "banners") {
    if (productsTab) productsTab.classList.add("hidden");
    if (bannersTab) bannersTab.classList.remove("hidden");
    if (btnTopAddBanner) btnTopAddBanner.classList.remove("hidden");

    if (tabBtnBanners) {
      tabBtnBanners.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#ff66c4]";
    }
    if (tabBtnProducts) {
      tabBtnProducts.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition text-slate-600 hover:text-slate-900";
    }

    loadSupabaseBannersList();
  } else {
    if (bannersTab) bannersTab.classList.add("hidden");
    if (productsTab) productsTab.classList.remove("hidden");
    if (btnTopAddBanner) btnTopAddBanner.classList.add("hidden");

    if (tabBtnProducts) {
      tabBtnProducts.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#0077d6]";
    }
    if (tabBtnBanners) {
      tabBtnBanners.className = "flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition text-slate-600 hover:text-slate-900";
    }
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

-- 3. Policy Akses Tabel banners
DROP POLICY IF EXISTS "Public can view active banners" ON public.banners;
CREATE POLICY "Public can view active banners" ON public.banners FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon insert banners" ON public.banners;
CREATE POLICY "Allow anon insert banners" ON public.banners FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update banners" ON public.banners;
CREATE POLICY "Allow anon update banners" ON public.banners FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anon delete banners" ON public.banners;
CREATE POLICY "Allow anon delete banners" ON public.banners FOR DELETE USING (true);

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
CREATE POLICY "Public Access Banners Storage" ON storage.objects FOR SELECT USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Anon Insert Banners Storage" ON storage.objects;
CREATE POLICY "Anon Insert Banners Storage" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'banners');

DROP POLICY IF EXISTS "Anon Update Banners Storage" ON storage.objects;
CREATE POLICY "Anon Update Banners Storage" ON storage.objects FOR UPDATE USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Anon Delete Banners Storage" ON storage.objects;
CREATE POLICY "Anon Delete Banners Storage" ON storage.objects FOR DELETE USING (bucket_id = 'banners');

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

function openSqlGuideModal() {
  const codeEl = document.getElementById("sqlScriptContent");
  if (codeEl) codeEl.textContent = SQL_BANNERS_SCRIPT;
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
  if (navigator.clipboard) {
    navigator.clipboard.writeText(SQL_BANNERS_SCRIPT).then(() => {
      showAdminToast("Script SQL berhasil disalin ke clipboard!", "success");
    }).catch(() => {
      fallbackCopyText(SQL_BANNERS_SCRIPT);
    });
  } else {
    fallbackCopyText(SQL_BANNERS_SCRIPT);
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
  }
});

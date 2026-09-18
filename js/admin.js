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

document.addEventListener("DOMContentLoaded", () => {
  initAdminSettings();
  setupAdminListeners();
});

function initAdminSettings() {
  const inputUrl = document.getElementById("gasApiUrlInput");
  if (inputUrl) {
    inputUrl.value = getSavedGasApiUrl();
  }
}

function getSavedGasApiUrl() {
  const saved = localStorage.getItem("shinemart_gas_api_url");
  return saved ? saved.trim() : DEFAULT_GAS_API_URL;
}

function saveGasApiUrl() {
  const inputUrl = document.getElementById("gasApiUrlInput");
  const url = inputUrl ? inputUrl.value.trim() : "";

  if (url) {
    localStorage.setItem("shinemart_gas_api_url", url);
    showAdminToast("URL Google Apps Script berhasil disimpan!", "success");
  } else {
    localStorage.removeItem("shinemart_gas_api_url");
    showAdminToast("Mengembalikan ke URL default.", "info");
    if (inputUrl) inputUrl.value = DEFAULT_GAS_API_URL;
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
        const unit = String(row["Satuan"] || row["unit"] || "1 Pcs").trim();
        const stock = row["Stok"] || row["stock"] || "Ready";

        return {
          id: `PRD-${Date.now()}-${idx + 1}`,
          name: String(name).trim(),
          price: price,
          category: category,
          imageUrl: formatGoogleDriveImageUrl(imageUrl),
          stock: stock,
          unit: unit
        };
      }).filter(p => p.name && p.price > 0);

      renderPreviewTable(parsedExcelProducts, file.name);
    } catch (err) {
      console.error("Gagal membaca Excel:", err);
      alert("Format file Excel/CSV tidak valid. Gunakan format file .xlsx, .xls, atau .csv.");
    }
  };

  reader.readAsArrayBuffer(file);
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
 * Mengirim array produk ke Google Apps Script (doPost)
 */
async function uploadToGoogleSheets() {
  if (parsedExcelProducts.length === 0) return;

  const uploadBtn = document.getElementById("btnUploadToSheets");
  const originalHtml = uploadBtn ? uploadBtn.innerHTML : "";
  const uploadMode = document.querySelector('input[name="uploadMode"]:checked')?.value || "append";

  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Sedang Menyimpan ke Google Sheets...`;
  }

  const apiUrl = getSavedGasApiUrl();
  let successOnSheets = false;

  if (apiUrl && !apiUrl.includes("sample_shinemart")) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // text/plain menghindari preflight CORS issue pada GAS
        body: JSON.stringify({
          action: uploadMode, // 'append' atau 'replace'
          items: parsedExcelProducts
        })
      });

      const result = await response.json();
      if (result && result.status === "success") {
        successOnSheets = true;
      }
    } catch (err) {
      console.warn("Gagal request ke Google Apps Script:", err);
    }
  }

  // Update data lokal juga agar instan sinkron
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

  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = originalHtml;
  }

  if (successOnSheets) {
    showAdminToast(`Berhasil menyimpan ${parsedExcelProducts.length} produk langsung ke Google Sheets!`, "success");
  } else {
    showAdminToast(`${parsedExcelProducts.length} produk tersimpan di katalog lokal. (Pastikan URL Google Apps Script valid).`, "info");
  }

  // Reset file input
  const fileInput = document.getElementById("excelFileInput");
  if (fileInput) fileInput.value = "";
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

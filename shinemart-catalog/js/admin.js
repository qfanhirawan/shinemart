/**
 * SHINEMART DIGITAL CATALOG - ADMIN PRODUCT MANAGEMENT SCRIPT
 * Handles CRUD operations, image file/URL previews, description updates, and LocalStorage sync.
 */

const STORAGE_KEY = "shinemart_products_data";

// Initial Fallback Data
const DEFAULT_PRODUCTS = [
  {
    id: 101,
    name: "Beras Pandan Wangi Super 5kg",
    category: "sembako",
    price: 78500,
    originalPrice: 89000,
    discount: "12%",
    unit: "5 kg / Sak",
    badge: "PROMO WEEKEND",
    stock: "Ready 45 sak",
    description: "Beras Pandan Wangi kualitas unggul dengan aroma wangi alami, beras pulen, bersih, dan bebas pemutih.",
    image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80"
  },
  {
    id: 102,
    name: "Minyak Goreng Bimoli Spesial Refill 2L",
    category: "sembako",
    price: 34500,
    originalPrice: 39500,
    discount: "13%",
    unit: "Pouch 2 Liter",
    badge: "BEST SELLER",
    stock: "Ready Stock",
    description: "Minyak goreng kelapa sawit pilihan kaya akan Vitamin E, membuat masakan renyah dan gurih.",
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80"
  },
  {
    id: 103,
    name: "Gula Pasir Gulaku Premium Putih 1kg",
    category: "sembako",
    price: 17500,
    originalPrice: 18500,
    discount: "5%",
    unit: "1 kg",
    badge: "",
    stock: "Ready Stock",
    description: "Gula pasir putih murni terbuat dari tebu pilihan. Manis alami dan cepat larut.",
    image: "https://images.unsplash.com/photo-1581441363689-1f3c3c414635?w=500&auto=format&fit=crop&q=80"
  },
  {
    id: 104,
    name: "Telur Ayam Negeri Fresh Super 1kg",
    category: "sembako",
    price: 28000,
    originalPrice: 31000,
    discount: "10%",
    unit: "1 kg (~16 butir)",
    badge: "FRESH TODAY",
    stock: "Stok Segar",
    description: "Telur ayam negeri segar langsung dari peternakan terpercaya. Sumber protein lengkap.",
    image: "https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=500&auto=format&fit=crop&q=80"
  },
  {
    id: 201,
    name: "Susu UHT Ultra Milk Full Cream 1000ml",
    category: "minuman",
    price: 18900,
    originalPrice: 21500,
    discount: "12%",
    unit: "Kotak 1 Liter",
    badge: "PROMO HEMAT",
    stock: "Ready Stock",
    description: "Susu sapi segar UHT tinggi kalsium dan fosfor untuk nutrisi harian keluarga.",
    image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=80"
  },
  {
    id: 202,
    name: "Kopi Nescafe Classic Jar 100g",
    category: "minuman",
    price: 36000,
    originalPrice: 42000,
    discount: "14%",
    unit: "Botol Kaca 100g",
    badge: "FAVORIT KASIR",
    stock: "Ready Stock",
    description: "Kopi murni 100% Robusta tanpa gula dengan rasa dan aroma khas kopi mantap.",
    image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500&auto=format&fit=crop&q=80"
  },
  {
    id: 301,
    name: "Biskuit Khong Guan Assorted Biscuit 650g",
    category: "snack",
    price: 52500,
    originalPrice: 61000,
    discount: "14%",
    unit: "Kaleng 650g",
    badge: "SPESIAL KELUARGA",
    stock: "Ready Stock",
    description: "Aneka macam biskuit lezat renyah legendaris favorit keluarga Indonesia.",
    image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=80"
  },
  {
    id: 401,
    name: "Deterjen Rinso Anti Noda Molto Liquid 770ml",
    category: "kebersihan",
    price: 22900,
    originalPrice: 27500,
    discount: "17%",
    unit: "Refill Pouch 770ml",
    badge: "SUPER DISKON",
    stock: "Ready Stock",
    description: "Deterjen cair pembersih noda membandel 3x lebih cepat dengan wangi Molto tahan lama.",
    image: "https://images.unsplash.com/photo-1585842378054-ee2e52f94ba2?w=500&auto=format&fit=crop&q=80"
  }
];

// Admin State Variables
let productsList = [];
let editingProductId = null;
let currentPreviewImageData = "";
let adminSearchQuery = "";
let adminCategoryFilter = "all";

// DOM Loaded Event
document.addEventListener("DOMContentLoaded", () => {
  initProductsData();
  renderAdminTable();
  setupAdminEventListeners();
});

// Load Products from LocalStorage
function initProductsData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      productsList = JSON.parse(stored);
    } catch (e) {
      productsList = [...DEFAULT_PRODUCTS];
    }
  } else {
    productsList = [...DEFAULT_PRODUCTS];
    saveProductsToStorage();
  }
}

// Save to LocalStorage
function saveProductsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(productsList));
  updateAdminStats();
}

// Render Admin Products Table & Mobile Cards
function renderAdminTable() {
  const tbody = document.getElementById("adminTableBody");
  const mobileContainer = document.getElementById("adminMobileGrid");
  const emptyNotice = document.getElementById("adminEmptyNotice");

  if (!tbody) return;

  // Filter
  let filtered = productsList.filter((item) => {
    const matchesCategory = adminCategoryFilter === "all" || item.category === adminCategoryFilter;
    const matchesSearch = item.name.toLowerCase().includes(adminSearchQuery) || 
                          item.category.toLowerCase().includes(adminSearchQuery) ||
                          (item.description && item.description.toLowerCase().includes(adminSearchQuery));
    return matchesCategory && matchesSearch;
  });

  updateAdminStats();

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    if (mobileContainer) mobileContainer.innerHTML = "";
    if (emptyNotice) emptyNotice.classList.remove("hidden");
    return;
  } else {
    if (emptyNotice) emptyNotice.classList.add("hidden");
  }

  // Desktop Table Rows
  tbody.innerHTML = filtered.map((item) => {
    const formattedPrice = formatRupiah(item.price);
    const formattedOrigPrice = item.originalPrice ? formatRupiah(item.originalPrice) : "-";

    return `
      <tr class="hover:bg-sky-50/50 transition-colors border-b border-slate-100 text-xs md:text-sm">
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <img src="${item.image}" alt="${item.name}" class="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <div>
              <strong class="font-bold text-slate-900 block line-clamp-1">${item.name}</strong>
              <span class="text-[11px] text-slate-400 font-medium">${item.unit || "1 Pcs"}</span>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="capitalize font-bold text-[#0077d6] bg-sky-50 px-2.5 py-1 rounded-md text-xs border border-sky-100">
            ${item.category}
          </span>
        </td>
        <td class="py-3 px-4">
          <div class="font-extrabold text-[#0077d6]">${formattedPrice}</div>
          ${item.originalPrice ? `<div class="text-[11px] text-slate-400 line-through">${formattedOrigPrice}</div>` : ""}
        </td>
        <td class="py-3 px-4">
          ${item.discount ? `<span class="bg-pink-100 text-[#ff66c4] font-extrabold px-2 py-0.5 rounded-md text-xs">${item.discount} OFF</span>` : `<span class="text-slate-400">-</span>`}
        </td>
        <td class="py-3 px-4">
          <span class="bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-full text-[11px]">
            ${item.stock || "Ready"}
          </span>
        </td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="openFormModal(${item.id})" class="px-3 py-1.5 bg-sky-100 hover:bg-[#38b6ff] text-[#0077d6] hover:text-white rounded-lg transition font-bold flex items-center gap-1">
              <i class="fas fa-edit"></i>
              <span>Edit</span>
            </button>
            <button onclick="confirmDeleteProduct(${item.id})" class="px-2.5 py-1.5 bg-pink-50 hover:bg-[#ff66c4] text-[#ff66c4] hover:text-white rounded-lg transition font-bold">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Mobile Grid Cards
  if (mobileContainer) {
    mobileContainer.innerHTML = filtered.map((item) => `
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div class="flex items-start gap-3 mb-3">
          <img src="${item.image}" alt="${item.name}" class="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0">
          <div>
            <span class="text-[10px] font-bold text-[#0077d6] bg-sky-50 px-2 py-0.5 rounded uppercase">${item.category}</span>
            <h4 class="font-bold text-slate-800 text-sm mt-1 leading-tight">${item.name}</h4>
            <div class="text-xs font-extrabold text-[#0077d6] mt-1">${formatRupiah(item.price)}</div>
          </div>
        </div>
        <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium">${item.stock || 'Ready'}</span>
          <div class="flex gap-2">
            <button onclick="openFormModal(${item.id})" class="px-3 py-1.5 bg-sky-100 text-[#0077d6] rounded-xl font-bold text-xs">
              <i class="fas fa-edit mr-1"></i> Edit
            </button>
            <button onclick="confirmDeleteProduct(${item.id})" class="px-3 py-1.5 bg-pink-50 text-[#ff66c4] rounded-xl font-bold text-xs">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      </div>
    `).join("");
  }
}

// Update Admin Dashboard Stats
function updateAdminStats() {
  const statTotal = document.getElementById("statTotalProducts");
  const statPromo = document.getElementById("statPromoProducts");
  const statCategory = document.getElementById("statTotalCategories");

  if (statTotal) statTotal.textContent = productsList.length;
  if (statPromo) {
    const promoCount = productsList.filter(p => p.discount || p.badge).length;
    statPromo.textContent = promoCount;
  }
  if (statCategory) {
    const categories = new Set(productsList.map(p => p.category));
    statCategory.textContent = categories.size;
  }
}

// Setup Event Listeners
function setupAdminEventListeners() {
  const searchInput = document.getElementById("adminSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      adminSearchQuery = e.target.value.toLowerCase().trim();
      renderAdminTable();
    });
  }

  const categorySelect = document.getElementById("adminCategoryFilter");
  if (categorySelect) {
    categorySelect.addEventListener("change", (e) => {
      adminCategoryFilter = e.target.value;
      renderAdminTable();
    });
  }

  // File Upload Preview
  const imageFileInput = document.getElementById("productImageFile");
  if (imageFileInput) {
    imageFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
          currentPreviewImageData = event.target.result;
          document.getElementById("productImageUrl").value = "";
          updateImagePreview(currentPreviewImageData);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // URL Input Preview
  const imageUrlInput = document.getElementById("productImageUrl");
  if (imageUrlInput) {
    imageUrlInput.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      if (url) {
        currentPreviewImageData = url;
        updateImagePreview(url);
      }
    });
  }

  // Price & Original Price inputs for auto discount calculation
  const priceInput = document.getElementById("productPrice");
  const origPriceInput = document.getElementById("productOriginalPrice");
  
  if (priceInput && origPriceInput) {
    const calculateDiscount = () => {
      const p = parseFloat(priceInput.value) || 0;
      const op = parseFloat(origPriceInput.value) || 0;
      const discountInput = document.getElementById("productDiscount");
      
      if (op > p && p > 0) {
        const discPercent = Math.round(((op - p) / op) * 100);
        if (discountInput) discountInput.value = `${discPercent}%`;
      } else {
        if (discountInput) discountInput.value = "";
      }
    };

    priceInput.addEventListener("input", calculateDiscount);
    origPriceInput.addEventListener("input", calculateDiscount);
  }

  // Form Submit
  const productForm = document.getElementById("productForm");
  if (productForm) {
    productForm.addEventListener("submit", handleProductFormSubmit);
  }
}

// Update Image Preview Element
function updateImagePreview(src) {
  const previewImg = document.getElementById("imagePreview");
  const placeholder = document.getElementById("imagePreviewPlaceholder");
  
  if (previewImg && src) {
    previewImg.src = src;
    previewImg.classList.remove("hidden");
    if (placeholder) placeholder.classList.add("hidden");
  }
}

// Open Form Modal (for Add or Edit)
function openFormModal(productId = null) {
  editingProductId = productId;

  const modalTitle = document.getElementById("formModalTitle");
  const productForm = document.getElementById("productForm");

  if (!productForm) return;

  if (productId) {
    // EDIT MODE
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    if (modalTitle) modalTitle.textContent = "Edit Data Produk";

    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category;
    document.getElementById("productPrice").value = product.price;
    document.getElementById("productOriginalPrice").value = product.originalPrice || "";
    document.getElementById("productDiscount").value = product.discount || "";
    document.getElementById("productUnit").value = product.unit || "";
    document.getElementById("productStock").value = product.stock || "Ready Stock";
    document.getElementById("productBadge").value = product.badge || "";
    document.getElementById("productDescription").value = product.description || "";
    document.getElementById("productImageUrl").value = product.image.startsWith("data:") ? "" : product.image;
    
    currentPreviewImageData = product.image;
    updateImagePreview(product.image);

  } else {
    // ADD NEW MODE
    if (modalTitle) modalTitle.textContent = "Tambah Produk Baru";
    productForm.reset();
    document.getElementById("productId").value = "";
    currentPreviewImageData = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
    updateImagePreview(currentPreviewImageData);
  }

  const modal = document.getElementById("productFormModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

// Close Form Modal
function closeFormModal() {
  const modal = document.getElementById("productFormModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  editingProductId = null;
}

// Handle Form Submission
function handleProductFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("productName").value.trim();
  const category = document.getElementById("productCategory").value;
  const price = parseFloat(document.getElementById("productPrice").value) || 0;
  const originalPrice = parseFloat(document.getElementById("productOriginalPrice").value) || null;
  const discount = document.getElementById("productDiscount").value.trim();
  const unit = document.getElementById("productUnit").value.trim() || "1 Pcs";
  const stock = document.getElementById("productStock").value.trim() || "Ready Stock";
  const badge = document.getElementById("productBadge").value.trim();
  const description = document.getElementById("productDescription").value.trim();
  const imageUrlInput = document.getElementById("productImageUrl").value.trim();

  let finalImage = currentPreviewImageData;
  if (imageUrlInput) {
    finalImage = imageUrlInput;
  }
  if (!finalImage) {
    finalImage = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
  }

  if (editingProductId) {
    // UPDATE
    const index = productsList.findIndex(p => p.id === editingProductId);
    if (index !== -1) {
      productsList[index] = {
        ...productsList[index],
        name,
        category,
        price,
        originalPrice: originalPrice > price ? originalPrice : null,
        discount,
        unit,
        stock,
        badge,
        description,
        image: finalImage
      };
      showToast("Data produk berhasil diperbarui!", "success");
    }
  } else {
    // CREATE NEW
    const newId = Date.now();
    const newProduct = {
      id: newId,
      name,
      category,
      price,
      originalPrice: originalPrice > price ? originalPrice : null,
      discount,
      unit,
      stock,
      badge,
      description,
      image: finalImage
    };
    productsList.unshift(newProduct);
    showToast("Produk baru berhasil ditambahkan!", "success");
  }

  saveProductsToStorage();
  renderAdminTable();
  closeFormModal();
}

// Confirm Delete Product
function confirmDeleteProduct(id) {
  const product = productsList.find(p => p.id === id);
  if (!product) return;

  if (confirm(`Apakah Anda yakin ingin menghapus produk "${product.name}"?`)) {
    productsList = productsList.filter(p => p.id !== id);
    saveProductsToStorage();
    renderAdminTable();
    showToast("Produk berhasil dihapus.", "info");
  }
}

// Reset Data to Default Initial List
function resetToDefaultData() {
  if (confirm("Reset seluruh data produk ke sampel awal? Perubahan custom Anda akan digantikan.")) {
    productsList = [...DEFAULT_PRODUCTS];
    saveProductsToStorage();
    renderAdminTable();
    showToast("Data produk telah dikembalikan ke sampel default.", "info");
  }
}

// Show Toast Notification
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-2xl transition-all duration-300 transform translate-y-4 opacity-0 flex items-center gap-2 ${
    type === 'success' ? 'bg-gradient-to-r from-[#38b6ff] to-[#0099ff]' : 'bg-slate-800'
  }`;
  
  toast.innerHTML = `
    <i class="${type === 'success' ? 'fas fa-check-circle' : 'fas fa-info-circle'} text-lg"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("translate-y-4", "opacity-0");
  }, 50);

  setTimeout(() => {
    toast.classList.add("translate-y-4", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Format Rupiah Helper
function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(amount);
}

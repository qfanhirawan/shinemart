/**
 * SHINEMART DIGITAL CATALOG - MAIN APPLICATION SCRIPT
 * Reads dynamically from LocalStorage (synced with admin.html management page).
 */

const STORAGE_KEY = "shinemart_products_data";

// Fallback Default Products Data
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

// Banner Data
const BANNERS = [
  {
    id: 1,
    title: "PROMO SPESIAL SHINEMART",
    subtitle: "Diskon hingga 35% Sembako & Kebutuhan Dapur Hemat!",
    tag: "PROMO SUPER",
    bgGradient: "linear-gradient(135deg, #38b6ff 0%, #0077d6 100%)",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80"
  },
  {
    id: 2,
    title: "BELI BUNDLE LEBIH HEMAT",
    subtitle: "Paket Snack & Minuman Segar Spesial Warna Favorit",
    tag: "HOT DEAL",
    bgGradient: "linear-gradient(135deg, #ff66c4 0%, #d81b8e 100%)",
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=800&auto=format&fit=crop&q=80"
  },
  {
    id: 3,
    title: "GRATIS ONGKIR AREA LOKAL",
    subtitle: "Pesan via WhatsApp Kasir, Antar Cepat Dalam 30 Menit!",
    tag: "CYAN & PINK EDITION",
    bgGradient: "linear-gradient(135deg, #38b6ff 0%, #ff66c4 100%)",
    image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80"
  }
];

const STORE_WA_NUMBER = "6281234567890";

// Dynamic Products List State
let productsList = [];
let activeCategory = "all";
let searchQuery = "";
let currentBannerIndex = 0;
let bannerInterval = null;
let selectedProductForModal = null;

// DOM Load Event
document.addEventListener("DOMContentLoaded", () => {
  loadProductsFromStorage();
  initBannerSlider();
  renderProducts();
  setupEventListeners();
  updateCategoryCounts();
});

// Load Active Products List from LocalStorage
function loadProductsFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      productsList = JSON.parse(stored);
    } catch (e) {
      productsList = [...DEFAULT_PRODUCTS];
    }
  } else {
    productsList = [...DEFAULT_PRODUCTS];
  }
}

// Setup Event Listeners
function setupEventListeners() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderProducts();
    });
  }

  const categoryBtns = document.querySelectorAll(".category-tab-btn");
  categoryBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      categoryBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.getAttribute("data-category");
      renderProducts();
    });
  });

  const qtyMinusBtn = document.getElementById("qtyMinus");
  const qtyPlusBtn = document.getElementById("qtyPlus");
  const qtyInput = document.getElementById("qtyInput");

  if (qtyMinusBtn && qtyPlusBtn && qtyInput) {
    qtyMinusBtn.addEventListener("click", () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val > 1) qtyInput.value = val - 1;
    });

    qtyPlusBtn.addEventListener("click", () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val < 99) qtyInput.value = val + 1;
    });
  }

  const btnConfirmWa = document.getElementById("btnConfirmWaModal");
  if (btnConfirmWa) {
    btnConfirmWa.addEventListener("click", sendWhatsAppFromModal);
  }
}

// Banner Slider Initialization
function initBannerSlider() {
  const bannerWrapper = document.getElementById("bannerWrapper");
  const bannerDots = document.getElementById("bannerDots");

  if (!bannerWrapper || !bannerDots) return;

  bannerWrapper.innerHTML = BANNERS.map((banner) => `
    <div class="banner-slide flex-shrink-0 w-full relative rounded-2xl overflow-hidden p-6 md:p-10 text-white min-h-[200px] md:min-h-[260px] flex items-center justify-between" style="background: ${banner.bgGradient}">
      <div class="z-10 max-w-xl">
        <span class="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider mb-2 text-white border border-white/30">
          ${banner.tag}
        </span>
        <h2 class="text-2xl md:text-4xl font-extrabold mb-2 leading-tight drop-shadow-sm">${banner.title}</h2>
        <p class="text-sm md:text-lg opacity-95 mb-4 font-medium">${banner.subtitle}</p>
        <a href="#katalog" class="inline-flex items-center gap-2 bg-white text-slate-900 font-bold px-5 py-2.5 rounded-full hover:bg-slate-100 transition shadow-lg text-sm md:text-base">
          <span>Lihat Promo Katalog</span>
          <i class="fas fa-arrow-right text-[#ff66c4]"></i>
        </a>
      </div>
      <div class="hidden md:block w-64 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-white/30 transform rotate-2">
        <img src="${banner.image}" alt="${banner.title}" class="w-full h-full object-cover">
      </div>
    </div>
  `).join("");

  bannerDots.innerHTML = BANNERS.map((_, idx) => `
    <button onclick="goToBanner(${idx})" class="w-3 h-3 rounded-full transition-all duration-300 ${idx === 0 ? 'bg-[#38b6ff] w-8' : 'bg-slate-300'}" id="dot-${idx}"></button>
  `).join("");

  startBannerAutoPlay();
}

function startBannerAutoPlay() {
  clearInterval(bannerInterval);
  bannerInterval = setInterval(() => {
    currentBannerIndex = (currentBannerIndex + 1) % BANNERS.length;
    updateBannerPosition();
  }, 4500);
}

function goToBanner(index) {
  currentBannerIndex = index;
  updateBannerPosition();
  startBannerAutoPlay();
}

function updateBannerPosition() {
  const bannerWrapper = document.getElementById("bannerWrapper");
  if (!bannerWrapper) return;
  
  bannerWrapper.style.transform = `translateX(-${currentBannerIndex * 100}%)`;

  BANNERS.forEach((_, idx) => {
    const dot = document.getElementById(`dot-${idx}`);
    if (dot) {
      if (idx === currentBannerIndex) {
        dot.className = "w-8 h-3 rounded-full bg-[#38b6ff] transition-all duration-300";
      } else {
        dot.className = "w-3 h-3 rounded-full bg-slate-300 transition-all duration-300";
      }
    }
  });
}

// Render Products Grid
function renderProducts() {
  const container = document.getElementById("productGridContainer");
  const countDisplay = document.getElementById("productCountInfo");
  const emptyState = document.getElementById("emptyStateContainer");

  if (!container) return;

  // Always re-read storage in case user returned from admin page
  loadProductsFromStorage();

  let filtered = productsList.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery) || 
                          item.category.toLowerCase().includes(searchQuery) ||
                          (item.badge && item.badge.toLowerCase().includes(searchQuery)) ||
                          (item.description && item.description.toLowerCase().includes(searchQuery));
    return matchesCategory && matchesSearch;
  });

  if (countDisplay) {
    countDisplay.textContent = `Menampilkan ${filtered.length} produk pilihan`;
  }

  if (filtered.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  } else {
    if (emptyState) emptyState.classList.add("hidden");
  }

  container.innerHTML = filtered.map((product) => {
    const formattedPrice = formatRupiah(product.price);
    const formattedOrigPrice = product.originalPrice ? formatRupiah(product.originalPrice) : "";

    return `
      <div class="product-card rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between group">
        <div>
          <div class="product-image-wrap">
            <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            
            ${product.discount ? `
              <span class="absolute top-3 left-3 badge-promo px-2.5 py-1 rounded-lg text-xs tracking-wider">
                ${product.discount} OFF
              </span>
            ` : ""}

            ${product.badge ? `
              <span class="absolute top-3 right-3 bg-[#38b6ff] text-white text-[10px] font-extrabold px-2 py-1 rounded-md uppercase shadow-sm">
                ${product.badge}
              </span>
            ` : ""}
          </div>

          <div class="p-4">
            <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span class="capitalize font-bold text-[#0077d6] bg-[#e8f7ff] px-2 py-0.5 rounded-md">${product.category}</span>
              <span class="badge-stock px-2 py-0.5 rounded-full text-[11px]">${product.stock || 'Ready'}</span>
            </div>

            <h3 class="font-bold text-slate-800 text-sm md:text-base mb-1 group-hover:text-[#38b6ff] transition-colors line-clamp-2" title="${product.name}">
              ${product.name}
            </h3>
            
            <p class="text-xs text-slate-400 mb-2">${product.unit || '1 Pcs'}</p>

            ${product.description ? `
              <p class="text-[11px] text-slate-500 mb-3 line-clamp-2 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                ${product.description}
              </p>
            ` : ""}

            <div class="mb-4">
              <div class="flex items-baseline gap-2">
                <span class="text-lg md:text-xl font-extrabold text-[#0077d6]">${formattedPrice}</span>
                ${formattedOrigPrice ? `<span class="text-xs text-slate-400 line-through">${formattedOrigPrice}</span>` : ""}
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 pt-0">
          <button onclick="openProductModal(${product.id})" class="w-full py-2.5 px-4 rounded-xl btn-wa-card text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-sm">
            <i class="fab fa-whatsapp text-lg"></i>
            <span>Tanyakan / Pesan WA</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// Update Category Count Badges
function updateCategoryCounts() {
  const categories = ["all", "sembako", "minuman", "snack", "kebersihan", "fresh", "frozen", "bayi", "perawatan"];
  
  categories.forEach((cat) => {
    const badgeEl = document.getElementById(`count-${cat}`);
    if (badgeEl) {
      if (cat === "all") {
        badgeEl.textContent = productsList.length;
      } else {
        const count = productsList.filter((p) => p.category === cat).length;
        badgeEl.textContent = count;
      }
    }
  });
}

// Open Order Modal
function openProductModal(productId) {
  const product = productsList.find((p) => p.id === productId);
  if (!product) return;

  selectedProductForModal = product;

  document.getElementById("modalProductImg").src = product.image;
  document.getElementById("modalProductName").textContent = product.name;
  document.getElementById("modalProductPrice").textContent = formatRupiah(product.price);
  document.getElementById("modalProductUnit").textContent = product.unit || "1 Pcs";
  
  const descEl = document.getElementById("modalProductDesc");
  if (descEl) {
    descEl.textContent = product.description || "Produk kualiatas super terjamin di Shinemart.";
  }

  document.getElementById("qtyInput").value = 1;

  const modal = document.getElementById("productModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

// Close Product Modal
function closeProductModal() {
  const modal = document.getElementById("productModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  selectedProductForModal = null;
}

// Send WhatsApp Message
function sendWhatsAppFromModal() {
  if (!selectedProductForModal) return;

  const qtyInput = document.getElementById("qtyInput");
  const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
  const totalPrice = formatRupiah(selectedProductForModal.price * qty);

  const messageText = 
`Halo Kasir *Shinemart*, saya ingin menanyakan stok / memesan produk berikut:

📌 *Detail Pesanan:*
• *Produk:* ${selectedProductForModal.name}
• *Satuan:* ${selectedProductForModal.unit || '1 Pcs'}
• *Harga Satuan:* ${formatRupiah(selectedProductForModal.price)}
• *Jumlah:* ${qty} pcs
• *Total Estimasi:* ${totalPrice}

Apakah produk ini ready untuk dikirim / diambil? Terima kasih!`;

  const encodedMessage = encodeURIComponent(messageText);
  const waUrl = `https://wa.me/${STORE_WA_NUMBER}?text=${encodedMessage}`;

  window.open(waUrl, "_blank");
  closeProductModal();
}

function openGeneralWhatsApp(topic = "") {
  let text = "Halo Kasir *Shinemart*, saya mau bertanya tentang promo & ketersediaan barang hari ini.";
  if (topic === "lokasi") {
    text = "Halo *Shinemart*, saya mau tanya petunjuk arah lokasi toko & layanan pesan antar.";
  } else if (topic === "promo") {
    text = "Halo *Shinemart*, saya mau tanya promo spesial katalog minggu ini.";
  }

  const encodedMessage = encodeURIComponent(text);
  window.open(`https://wa.me/${STORE_WA_NUMBER}?text=${encodedMessage}`, "_blank");
}

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * ==============================================================================
 * SHINEMART DIGITAL CATALOG - VISITOR SCRIPT (app.js)
 * Khusus untuk Halaman Pengunjung (index.html):
 * 1. Fetch data katalog dinamis dari Google Sheets (doGet) dengan fallback offline
 * 2. Render katalog produk, pencarian real-time, dan filter kategori
 * 3. Keranjang belanja sementara (Multi-Item Cart) via LocalStorage
 * 4. Checkout multi-item dengan tautan terformat rapi ke WhatsApp Kasir
 * ==============================================================================
 */

// Konfigurasi Database Supabase
const DEFAULT_SUPABASE_URL = "https://amuqgtdyecgdxclqwanj.supabase.co"; 
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_G-am3ojwBmpNqbZDi5qciA_6fn37rX9"; 

const LOCAL_STORAGE_KEY = "shinemart_products_data";
const CART_STORAGE_KEY = "shinemart_shopping_cart";
const STORE_WA_NUMBER = "6285198963411"; // Nomor WhatsApp Kasir (+62 851-9896-3411)

// Helper Supabase Client
function getSupabaseClient() {
  const url = localStorage.getItem("shinemart_supabase_url") || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem("shinemart_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;
  if (typeof supabase !== "undefined" && url && key && !url.includes("xyzcompany")) {
    try {
      return supabase.createClient(url, key);
    } catch (e) {
      console.warn("Inisialisasi Supabase client gagal:", e);
      return null;
    }
  }
  return null;
}

/**
 * Otomatis mengonversi URL Google Drive standar / share link
 * menjadi Direct Image URL agar dapat dirender oleh tag <img> di browser.
 */
function formatGoogleDriveImageUrl(url) {
  if (!url || typeof url !== "string") return "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500";
  const trimmed = url.trim();

  // Pola 1: drive.google.com/file/d/FILE_ID/view...
  let match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }

  // Pola 2: drive.google.com/open?id=FILE_ID atau uc?id=FILE_ID
  match = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }

  // Pola 3: drive.google.com/uc?export=view&id=FILE_ID
  match = trimmed.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }

  return trimmed;
}

// Data produk katalog Shinemart
const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "ABC Bumbu Kacang Serbaguna (180g)",
    price: 14900,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1hBfvOJnVPLoQE6YrVNavzPsz7Jj4I3J3&sz=w1000",
    stock: "20",
    unit: "PCS"
  },
  {
    id: 2,
    name: "Mie Telur Cap 3 Ayam (200g)",
    price: 4600,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1nlcDSPZq9zov-s9PA_jZrwbr1FXpON6C&sz=w1000",
    stock: "20",
    unit: "PCS"
  },
  {
    id: 3,
    name: "77 Lada Putih Bubuk (60g)",
    price: 15900,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1KDqfYel1aLDN9pxW0NXT3SN55CNTDWY0&sz=w1000",
    stock: "20",
    unit: "PCS"
  },
  {
    id: 4,
    name: "ABC Minuman Sari Kacang Hijau (250ml)",
    price: 21312,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1FMX8YSN3eFph4064w-Zg_jxXMxMmwqN7&sz=w1000",
    stock: "20",
    unit: "PCS"
  },
  {
    id: 5,
    name: "77 Ketumbar Bubuk (60g)",
    price: 82903,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1o9FAyrPB84EzELW5SVRqQDEh7D-nHMsc&sz=w1000",
    stock: "202",
    unit: "PCS"
  },
  {
    id: 6,
    name: "77 Kunyit Bubuk (60g)",
    price: 83040,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1pv7eLz9yTsiy_PXdPUbfWppglQ2sAa_W&sz=w1000",
    stock: "20",
    unit: "PCS"
  },
  {
    id: 7,
    name: "Masako Kaldu Spesial Daging Ayam (100g)",
    price: 82934,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1Z2U2PZNWo3YeHFDuxrzxswo8RR1j_tQP&sz=w1000",
    stock: "20",
    unit: "PCS"
  },
  {
    id: 8,
    name: "Sajiku Bumbu Praktis Nasi Goreng Rasa Ayam (20g)",
    price: 94348,
    category: "sembako",
    imageUrl: "https://drive.google.com/thumbnail?id=1rU8N615rR_fptW0RSCPznb2Wsa3PEXHH&sz=w1000",
    stock: "20",
    unit: "PCS"
  }
];

// Data Slider Banner Promosi
const BANNERS = [
  {
    id: 1,
    title: "PROMO SPESIAL SHINEMART",
    subtitle: "Diskon hingga 35% Sembako & Kebutuhan Dapur Hemat!",
    tag: "KATALOG ONLINE",
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
    subtitle: "Pesan Multi-Item via WhatsApp, Antar Cepat Dalam 30 Menit!",
    tag: "PESAN VIA WA",
    bgGradient: "linear-gradient(135deg, #38b6ff 0%, #ff66c4 100%)",
    image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80"
  }
];

// Application State
let productsList = [];
let cartItems = [];
let activeCategory = "all";
let searchQuery = "";
let currentBannerIndex = 0;
let bannerInterval = null;

// Initial Load
document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  initBannerSlider();
  setupEventListeners();
  fetchProductsFromDatabase();
});

// ==============================================================================
// FETCH KATALOG PRODUK DARI SUPABASE DATABASE
// ==============================================================================
async function fetchProductsFromDatabase() {
  const countDisplay = document.getElementById("productCountInfo");
  if (countDisplay) {
    countDisplay.innerHTML = `<span class="inline-flex items-center gap-2 text-sky-600 font-medium"><i class="fas fa-spinner fa-spin"></i> Memuat katalog produk dari database Supabase...</span>`;
  }

  // Tampilkan data lokal/cache terlebih dahulu jika ada
  const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (cached) {
    try {
      productsList = JSON.parse(cached);
      renderProducts();
      updateCategoryCounts();
    } catch (e) {
      productsList = [...DEFAULT_PRODUCTS];
    }
  } else {
    productsList = [...DEFAULT_PRODUCTS];
    renderProducts();
    updateCategoryCounts();
  }

  // Ambil langsung dari Supabase
  const supabaseClient = getSupabaseClient();
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .order("id", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        productsList = data.map(p => ({
          id: p.id,
          name: p.name,
          price: Number(p.price) || 0,
          category: String(p.category || "sembako").toLowerCase(),
          imageUrl: formatGoogleDriveImageUrl(p.image_url || p.imageUrl || p.image),
          stock: p.stock !== undefined && p.stock !== "" ? p.stock : "Ready",
          unit: p.unit || "1 Pcs"
        }));

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(productsList));
        renderProducts();
        updateCategoryCounts();

        if (countDisplay) {
          countDisplay.textContent = `Menampilkan ${productsList.length} produk pilihan`;
        }
        return;
      }
    } catch (sbError) {
      console.warn("Koneksi Supabase error, menggunakan cache lokal:", sbError);
      if (countDisplay) {
        countDisplay.textContent = `Menampilkan ${productsList.length} produk pilihan`;
      }
    }
  } else {
    if (countDisplay) {
      countDisplay.textContent = `Menampilkan ${productsList.length} produk pilihan`;
    }
  }
}

// ==============================================================================
// SISTEM KERANJANG BELANJA (MULTI-ITEM CART)
// ==============================================================================
function loadCartFromStorage() {
  const saved = localStorage.getItem(CART_STORAGE_KEY);
  if (saved) {
    try {
      cartItems = JSON.parse(saved);
    } catch (e) {
      cartItems = [];
    }
  } else {
    cartItems = [];
  }
  updateCartBadge();
}

function saveCartToStorage() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  updateCartBadge();
}

function addToCart(productId, qty = 1) {
  const product = productsList.find(p => String(p.id) === String(productId));
  if (!product) return;

  const existingIdx = cartItems.findIndex(item => String(item.id) === String(productId));
  if (existingIdx > -1) {
    cartItems[existingIdx].qty += qty;
  } else {
    cartItems.push({
      id: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      imageUrl: product.imageUrl || product.image,
      qty: qty
    });
  }

  saveCartToStorage();
  showToast(`"${product.name}" masuk ke keranjang!`, "success");

  // Animasi getar pada ikon keranjang header
  const headerCartBtn = document.getElementById("headerCartBtn");
  if (headerCartBtn) {
    headerCartBtn.classList.add("scale-125");
    setTimeout(() => headerCartBtn.classList.remove("scale-125"), 250);
  }
}

function updateCartItemQty(productId, delta) {
  const index = cartItems.findIndex(item => String(item.id) === String(productId));
  if (index > -1) {
    cartItems[index].qty += delta;
    if (cartItems[index].qty <= 0) {
      cartItems.splice(index, 1);
    }
    saveCartToStorage();
    renderCartModal();
  }
}

function removeCartItem(productId) {
  cartItems = cartItems.filter(item => String(item.id) !== String(productId));
  saveCartToStorage();
  renderCartModal();
  showToast("Produk dihapus dari keranjang.", "info");
}

function clearCart() {
  if (cartItems.length === 0) return;
  if (confirm("Kosongkan seluruh daftar belanjaan di keranjang?")) {
    cartItems = [];
    saveCartToStorage();
    renderCartModal();
    showToast("Keranjang telah dikosongkan.", "info");
  }
}

function updateCartBadge() {
  const totalCount = cartItems.reduce((acc, item) => acc + item.qty, 0);

  // Badge header
  const headerBadge = document.getElementById("cartCountBadge");
  if (headerBadge) {
    headerBadge.textContent = totalCount;
    if (totalCount > 0) {
      headerBadge.classList.remove("hidden");
    } else {
      headerBadge.classList.add("hidden");
    }
  }

  // Badge floating icon
  const floatingBadge = document.getElementById("floatingCartCount");
  if (floatingBadge) {
    floatingBadge.textContent = totalCount;
    if (totalCount > 0) {
      floatingBadge.classList.remove("hidden");
    } else {
      floatingBadge.classList.add("hidden");
    }
  }
}

function openCartModal() {
  renderCartModal();
  const modal = document.getElementById("cartModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeCartModal() {
  const modal = document.getElementById("cartModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function renderCartModal() {
  const container = document.getElementById("cartItemsContainer");
  const emptyNotice = document.getElementById("cartEmptyNotice");
  const footerSection = document.getElementById("cartFooterSection");
  const totalPriceEl = document.getElementById("cartTotalPrice");
  const totalItemsEl = document.getElementById("cartTotalItemsCount");

  if (!container) return;

  if (cartItems.length === 0) {
    container.innerHTML = "";
    if (emptyNotice) emptyNotice.classList.remove("hidden");
    if (footerSection) footerSection.classList.add("hidden");
    if (totalItemsEl) totalItemsEl.textContent = "0 item";
    return;
  }

  if (emptyNotice) emptyNotice.classList.add("hidden");
  if (footerSection) footerSection.classList.remove("hidden");

  let grandTotal = 0;
  let totalQty = 0;

  container.innerHTML = cartItems.map(item => {
    const subtotal = item.price * item.qty;
    grandTotal += subtotal;
    totalQty += item.qty;

    return `
      <div class="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-sky-50/50 rounded-2xl border border-slate-100 transition-colors">
        <div class="flex items-center gap-3">
          <img src="${item.imageUrl}" alt="${item.name}" class="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
          <div>
            <h4 class="font-bold text-slate-800 text-xs md:text-sm line-clamp-1">${item.name}</h4>
            <span class="text-[11px] text-slate-400 block">${item.unit || '1 Pcs'} • ${formatRupiah(item.price)}</span>
            <div class="text-xs font-extrabold text-[#0077d6] mt-0.5">${formatRupiah(subtotal)}</div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div class="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden shadow-sm">
            <button onclick="updateCartItemQty('${item.id}', -1)" class="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold text-xs">-</button>
            <span class="w-7 text-center text-xs font-extrabold text-slate-800">${item.qty}</span>
            <button onclick="updateCartItemQty('${item.id}', 1)" class="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold text-xs">+</button>
          </div>
          <button onclick="removeCartItem('${item.id}')" class="w-7 h-7 rounded-xl bg-pink-50 hover:bg-[#ff66c4] text-[#ff66c4] hover:text-white flex items-center justify-center text-xs transition" title="Hapus Item">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (totalPriceEl) totalPriceEl.textContent = formatRupiah(grandTotal);
  if (totalItemsEl) totalItemsEl.textContent = `${totalQty} item terdaftar`;
}

// ==============================================================================
// REDIRECT & FORMAT PESANAN OTOMATIS KE WHATSAPP KASIR
// ==============================================================================
function checkoutCartViaWhatsApp() {
  if (cartItems.length === 0) {
    showToast("Keranjang belanja masih kosong!", "info");
    return;
  }

  let itemsText = "";
  let totalPerkiraan = 0;

  cartItems.forEach((item, index) => {
    const subtotal = item.price * item.qty;
    totalPerkiraan += subtotal;
    itemsText += `${index + 1}. ${item.name} - ${item.qty} x ${formatRupiah(item.price)} = ${formatRupiah(subtotal)}\n`;
  });

  const fullMessage = 
`Halo Shinemart, saya mau pesan barang berikut:

${itemsText}
Total Perkiraan: ${formatRupiah(totalPerkiraan)}

Mohon konfirmasi ketersediaan stoknya. Terima kasih!`;

  const waUrl = `https://wa.me/${STORE_WA_NUMBER}?text=${encodeURIComponent(fullMessage)}`;
  window.open(waUrl, "_blank");
  closeCartModal();
}

function orderSingleItemWA(productId) {
  const product = productsList.find(p => String(p.id) === String(productId));
  if (!product) return;

  const message = 
`Halo Shinemart, saya mau tanya / pesan barang ini:
• ${product.name} (${product.unit || '1 Pcs'}) - ${formatRupiah(product.price)}

Apakah ready untuk dikirim? Terima kasih!`;

  window.open(`https://wa.me/${STORE_WA_NUMBER}?text=${encodeURIComponent(message)}`, "_blank");
}

function openGeneralWhatsApp(topic = "") {
  let text = "Halo Shinemart, saya mau bertanya tentang ketersediaan barang hari ini.";
  if (topic === "lokasi") {
    text = "Halo Shinemart, saya mau tanya petunjuk arah lokasi toko.";
  } else if (topic === "kasir") {
    text = "Halo Kasir Shinemart, saya ingin memesan barang.";
  }

  window.open(`https://wa.me/${STORE_WA_NUMBER}?text=${encodeURIComponent(text)}`, "_blank");
}

// ==============================================================================
// RENDER KATALOG PRODUK & FILTER
// ==============================================================================
function renderProducts() {
  const container = document.getElementById("productGridContainer");
  const countDisplay = document.getElementById("productCountInfo");
  const emptyState = document.getElementById("emptyStateContainer");

  if (!container) return;

  let filtered = productsList.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery) ||
      item.category.toLowerCase().includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  if (countDisplay && !countDisplay.innerHTML.includes("Google Sheets")) {
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
    const imageSrc = formatGoogleDriveImageUrl(product.imageUrl || product.image);

    return `
      <div class="product-card rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between group">
        <div class="product-card-body" onclick="openProductPreview('${product.id}')">
          <div class="product-image-wrap">
            <img src="${imageSrc}" alt="${product.name}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <span class="absolute top-3 right-3 bg-[#38b6ff] text-white text-[10px] font-extrabold px-2 py-1 rounded-md uppercase shadow-sm">
              ${product.category}
            </span>
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

            <div class="mb-4">
              <span class="text-lg md:text-xl font-extrabold text-[#0077d6]">${formattedPrice}</span>
            </div>
          </div>
        </div>

        <div class="p-4 pt-0 space-y-2">
          <button onclick="addToCart('${product.id}', 1)" class="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#ff66c4] to-[#e043a5] hover:from-[#e043a5] text-white text-xs md:text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm transition">
            <i class="fas fa-cart-plus text-base"></i>
            <span>+ Keranjang</span>
          </button>
          
          <button onclick="orderSingleItemWA('${product.id}')" class="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-xs font-bold flex items-center justify-center gap-1.5 transition">
            <i class="fab fa-whatsapp text-emerald-600 text-sm"></i>
            <span>Tanya Langsung via WA</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

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
}

// Banner Slider
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
          <span>Lihat Katalog Produk</span>
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

// ==============================================================================
// PRODUCT DETAIL PREVIEW MODAL
// ==============================================================================
function openProductPreview(productId) {
  const product = productsList.find(p => String(p.id) === String(productId));
  if (!product) return;

  const imageSrc = formatGoogleDriveImageUrl(product.imageUrl || product.image);
  const formattedPrice = formatRupiah(product.price);

  // Populate modal content
  document.getElementById("previewImage").src = imageSrc;
  document.getElementById("previewImage").alt = product.name;
  document.getElementById("previewName").textContent = product.name;
  document.getElementById("previewCategory").textContent = product.category;
  document.getElementById("previewPrice").textContent = formattedPrice;
  document.getElementById("previewStock").textContent = product.stock || "Ready";
  document.getElementById("previewUnit").textContent = product.unit || "1 Pcs";

  // Set button actions
  document.getElementById("previewAddCartBtn").onclick = () => {
    addToCart(product.id, 1);
  };
  document.getElementById("previewWaBtn").onclick = () => {
    orderSingleItemWA(product.id);
  };

  // Show modal
  const modal = document.getElementById("productPreviewModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeProductPreview() {
  const modal = document.getElementById("productPreviewModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-white font-bold text-xs md:text-sm shadow-2xl transition-all duration-300 transform translate-y-4 opacity-0 flex items-center gap-2 ${
    type === 'success' ? 'bg-gradient-to-r from-[#38b6ff] to-[#0099ff]' : 'bg-slate-800'
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
  }, 3000);
}

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(amount);
}

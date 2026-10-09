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

// Data Slider Banner Promosi (Default Fallback jika Supabase belum terhubung)
const DEFAULT_BANNERS = [
  {
    id: "default-1",
    title: "PROMO SPESIAL SHINEMART",
    subtitle: "Diskon hingga 35% Sembako & Kebutuhan Dapur Hemat!",
    description: "Diskon hingga 35% Sembako & Kebutuhan Dapur Hemat!",
    tag: "KATALOG ONLINE",
    badge_text: "KATALOG ONLINE",
    button_text: "Lihat Katalog Produk",
    button_url: "#katalog",
    bgGradient: "linear-gradient(135deg, #38b6ff 0%, #0077d6 100%)",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80",
    sort_order: 1
  },
  {
    id: "default-2",
    title: "BELI BUNDLE LEBIH HEMAT",
    subtitle: "Paket Snack & Minuman Segar Spesial Warna Favorit",
    description: "Paket Snack & Minuman Segar Spesial Warna Favorit",
    tag: "HOT DEAL",
    badge_text: "HOT DEAL",
    button_text: "Lihat Katalog Produk",
    button_url: "#katalog",
    bgGradient: "linear-gradient(135deg, #ff66c4 0%, #d81b8e 100%)",
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=800&auto=format&fit=crop&q=80",
    image_url: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=800&auto=format&fit=crop&q=80",
    sort_order: 2
  },
  {
    id: "default-3",
    title: "GRATIS ONGKIR AREA LOKAL",
    subtitle: "Pesan Multi-Item via WhatsApp, Antar Cepat Dalam 30 Menit!",
    description: "Pesan Multi-Item via WhatsApp, Antar Cepat Dalam 30 Menit!",
    tag: "PESAN VIA WA",
    badge_text: "PESAN VIA WA",
    button_text: "Lihat Katalog Produk",
    button_url: "#katalog",
    bgGradient: "linear-gradient(135deg, #38b6ff 0%, #ff66c4 100%)",
    image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80",
    image_url: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80",
    sort_order: 3
  }
];

const BANNERS = DEFAULT_BANNERS;
let bannersList = [...DEFAULT_BANNERS];
const BANNER_GRADIENT_PALETTES = [
  "linear-gradient(135deg, #38b6ff 0%, #0077d6 100%)",
  "linear-gradient(135deg, #ff66c4 0%, #d81b8e 100%)",
  "linear-gradient(135deg, #38b6ff 0%, #ff66c4 100%)",
  "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
  "linear-gradient(135deg, #e11d48 0%, #be123c 100%)",
  "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"
];

// Application State
let productsList = [];
let cartItems = [];
let activeCategory = "all";
let searchQuery = "";
let currentBannerIndex = 0;
let bannerInterval = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 50;

// Initial Load
document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  initBannerSlider();
  setupEventListeners();
  fetchProductsFromDatabase();
  fetchDynamicPromotionalSections();
});

function mapProductWithPromo(p) {
  const promoInfo = parsePromo(p.stock);
  const originalPrice = Number(p.price) || 0;
  const promoDetails = getPromoDetails(originalPrice, promoInfo.promo);

  return {
    id: p.id,
    name: p.name,
    price: originalPrice,
    category: String(p.category || "sembako").toLowerCase(),
    imageUrl: formatGoogleDriveImageUrl(p.image_url || p.imageUrl || p.image),
    stock: promoInfo.cleanStock || "Ready",
    unit: p.unit || "1 Pcs",
    rawStock: p.stock,
    promo: promoInfo.promo,
    promoDetails: promoDetails
  };
}

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
      const rawCached = JSON.parse(cached);
      productsList = Array.isArray(rawCached) ? rawCached.map(mapProductWithPromo) : DEFAULT_PRODUCTS.map(mapProductWithPromo);
      renderProducts();
      updateCategoryCounts();
    } catch (e) {
      productsList = DEFAULT_PRODUCTS.map(mapProductWithPromo);
    }
  } else {
    productsList = DEFAULT_PRODUCTS.map(mapProductWithPromo);
    renderProducts();
    updateCategoryCounts();
  }

  // Ambil langsung dari Supabase (dengan pagination batching agar bisa mengambil lebih dari batas default 1.000 row)
  const supabaseClient = getSupabaseClient();
  if (supabaseClient) {
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

      if (allData.length > 0) {
        productsList = allData.map(mapProductWithPromo);

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

  const effectivePrice = product.promoDetails && product.promoDetails.hasPromo
    ? product.promoDetails.finalPrice
    : product.price;

  const existingIdx = cartItems.findIndex(item => String(item.id) === String(productId));
  if (existingIdx > -1) {
    cartItems[existingIdx].qty += qty;
  } else {
    cartItems.push({
      id: product.id,
      name: product.name,
      price: effectivePrice,
      originalPrice: product.price,
      promoDetails: product.promoDetails || null,
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
    headerCartBtn.classList.add("scale-110");
    setTimeout(() => headerCartBtn.classList.remove("scale-110"), 200);
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
  } else if (delta > 0) {
    addToCart(productId, delta);
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

    const promoBadge = item.promoDetails && item.promoDetails.hasPromo ? `
      <span class="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-pink-100 text-pink-600 border border-pink-200">
        <i class="fas fa-bolt text-rose-500"></i> ${item.promoDetails.label}
      </span>
    ` : "";

    const priceSubtext = item.promoDetails && item.promoDetails.hasPromo && item.originalPrice !== item.price
      ? `${item.unit || '1 Pcs'} • <span class="line-through text-slate-400">${formatRupiah(item.originalPrice)}</span> <span class="text-rose-600 font-bold">${formatRupiah(item.price)}</span>`
      : `${item.unit || '1 Pcs'} • ${formatRupiah(item.price)}`;

    return `
      <div class="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-sky-50/50 rounded-2xl border border-slate-100 transition-colors">
        <div class="flex items-center gap-3">
          <img src="${item.imageUrl}" alt="${item.name}" class="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
          <div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <h4 class="font-bold text-slate-800 text-xs md:text-sm line-clamp-1">${item.name}</h4>
              ${promoBadge}
            </div>
            <span class="text-[11px] text-slate-400 block">${priceSubtext}</span>
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
    const promoNote = item.promoDetails && item.promoDetails.hasPromo ? ` [PROMO: ${item.promoDetails.label}]` : "";
    itemsText += `${index + 1}. ${item.name}${promoNote} - ${item.qty} x ${formatRupiah(item.price)} = ${formatRupiah(subtotal)}\n`;
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

  const effectivePrice = product.promoDetails && product.promoDetails.hasPromo
    ? product.promoDetails.finalPrice
    : product.price;

  const promoNote = product.promoDetails && product.promoDetails.hasPromo
    ? ` [PROMO: ${product.promoDetails.label} - dari ${formatRupiah(product.price)} jadi ${formatRupiah(effectivePrice)}]`
    : ` - ${formatRupiah(product.price)}`;

  const message = 
`Halo Shinemart, saya mau tanya / pesan barang ini:
• ${product.name} (${product.unit || '1 Pcs'})${promoNote}

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
// Helper normalisasi nama kategori
function normalizeCategoryKey(cat) {
  if (!cat) return "";
  return String(cat).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ==============================================================================
// RENDER SECTION PROMO KHUSUS (1 BARIS HORIZONTAL SCROLL)
// ==============================================================================
function renderPromoSection() {
  const promoSection = document.getElementById("promoSection");
  const promoCarousel = document.getElementById("promoCarouselContainer");
  const promoBadgeCount = document.getElementById("promoBadgeCount");

  if (!promoSection || !promoCarousel) return;

  // Filter semua produk yang memiliki promo aktif
  const promoProducts = productsList.filter(p => p.promoDetails && p.promoDetails.hasPromo);

  if (promoProducts.length === 0) {
    promoSection.classList.add("hidden");
    return;
  }

  promoSection.classList.remove("hidden");
  if (promoBadgeCount) {
    promoBadgeCount.textContent = `${promoProducts.length} Promo`;
  }

  promoCarousel.innerHTML = promoProducts.map((product) => {
    const promo = product.promoDetails;
    const imageSrc = formatGoogleDriveImageUrl(product.imageUrl || product.image);

    let ribbonText = promo.label;
    let ribbonIcon = "fa-bolt";
    let ribbonBg = "bg-gradient-to-r from-pink-500 to-rose-600";

    if (promo.promoType === "percent") {
      ribbonText = `Diskon ${promo.promoValue}%`;
      ribbonIcon = "fa-bolt";
      ribbonBg = "bg-gradient-to-r from-pink-500 to-rose-600";
    } else if (promo.promoType === "b1g1") {
      ribbonText = "Buy 1 Get 1";
      ribbonIcon = "fa-gift";
      ribbonBg = "bg-gradient-to-r from-purple-600 to-pink-600";
    } else if (promo.promoType === "nominal") {
      ribbonText = `Hemat ${formatRupiah(promo.discountAmount)}`;
      ribbonIcon = "fa-tag";
      ribbonBg = "bg-gradient-to-r from-rose-500 to-red-600";
    }

    let priceHtml = "";
    if (promo.promoType === "percent" || promo.promoType === "nominal") {
      priceHtml = `
        <div class="flex flex-col">
          <span class="text-[9px] sm:text-[11px] text-slate-400 line-through font-semibold leading-tight">${formatRupiah(product.price)}</span>
          <span class="text-xs sm:text-base font-black text-rose-600 leading-tight">${formatRupiah(promo.finalPrice)}</span>
        </div>
      `;
    } else if (promo.promoType === "b1g1") {
      priceHtml = `
        <div class="flex flex-col">
          <span class="text-xs sm:text-base font-black text-[#0077d6] leading-tight">${formatRupiah(product.price)}</span>
          <span class="text-[8px] sm:text-[10px] font-extrabold text-purple-700 bg-purple-100 px-1 py-0.5 rounded w-fit mt-0.5">Beli 1 Gratis 1</span>
        </div>
      `;
    } else {
      priceHtml = `<span class="text-xs sm:text-base font-black text-[#0077d6]">${formatRupiah(product.price)}</span>`;
    }

    return `
      <div class="promo-carousel-card shrink-0 bg-white rounded-2xl shadow-sm border-2 border-pink-300 hover:border-pink-500 hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group">
        <div class="product-card-body" onclick="openProductPreview('${product.id}')">
          <div class="product-image-wrap relative">
            <div class="absolute top-1.5 left-1.5 z-10 ${ribbonBg} text-white text-[8px] sm:text-[10px] font-black px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded uppercase shadow-sm flex items-center gap-1">
              <i class="fas ${ribbonIcon} text-yellow-300"></i> ${ribbonText}
            </div>
            <img src="${imageSrc}" alt="${product.name}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <span class="absolute top-1.5 right-1.5 bg-[#38b6ff] text-white text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
              ${product.category}
            </span>
          </div>

          <div class="p-2 sm:p-3">
            <div class="flex items-center justify-between text-[9px] sm:text-[10px] text-slate-500 mb-0.5">
              <span class="capitalize font-bold text-[#0077d6] truncate max-w-[65%]">${product.category}</span>
              <span class="badge-stock px-1 rounded-full text-[8px] sm:text-[9px] shrink-0">${product.stock || 'Ready'}</span>
            </div>

            <h3 class="font-bold text-slate-800 text-[11px] sm:text-xs mb-1 line-clamp-2 leading-tight group-hover:text-pink-600 transition-colors" title="${product.name}">
              ${product.name}
            </h3>

            <p class="text-[9px] sm:text-[10px] text-slate-400 mb-1 truncate">${product.unit || '1 Pcs'}</p>

            <div>
              ${priceHtml}
            </div>
          </div>
        </div>

        <div class="p-2 sm:p-3 pt-0 space-y-1">
          <button onclick="addToCart('${product.id}', 1)" class="w-full py-1.5 px-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 text-white text-[10px] sm:text-xs font-black flex items-center justify-center gap-1 shadow-sm transition active:scale-95">
            <i class="fas fa-cart-plus text-[10px]"></i>
            <span>+ Keranjang</span>
          </button>
          <button onclick="orderSingleItemWA('${product.id}')" class="w-full py-1 px-2 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[9px] sm:text-[10px] font-bold flex items-center justify-center gap-1 transition">
            <i class="fab fa-whatsapp text-emerald-600 text-xs"></i>
            <span class="truncate">Tanya WA</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function scrollPromoCarousel(direction) {
  const container = document.getElementById("promoCarouselContainer");
  if (!container) return;
  const scrollDistance = 240 * direction;
  container.scrollBy({ left: scrollDistance, behavior: "smooth" });
}

// ==============================================================================
// RENDER KATALOG PRODUK REGULER & FILTER
// ==============================================================================
function renderProducts() {
  const container = document.getElementById("productGridContainer");
  const countDisplay = document.getElementById("productCountInfo");
  const emptyState = document.getElementById("emptyStateContainer");
  const paginationContainer = document.getElementById("paginationContainer");

  // Selalu perbarui section promo horizontal
  renderPromoSection();

  if (!container) return;

  const activeNorm = normalizeCategoryKey(activeCategory);

  // Filter produk:
  // - Pisahkan produk yang sedang promo dari katalog reguler (kecuali user sengaja mencari kata 'promo' / 'diskon')
  const isPromoSearch = searchQuery === "promo" || searchQuery === "diskon" || searchQuery === "b1g1";

  let filtered = productsList.filter((item) => {
    const itemNorm = normalizeCategoryKey(item.category);
    const matchesCategory = activeCategory === "all" || itemNorm === activeNorm || itemNorm.includes(activeNorm);

    if (isPromoSearch) {
      return matchesCategory && item.promoDetails && item.promoDetails.hasPromo;
    }

    // Katalog reguler hanya menampilkan produk non-promo agar terpisah jelas dari carousel promo di atas
    const isRegularItem = !(item.promoDetails && item.promoDetails.hasPromo);
    const matchesSearch = item.name.toLowerCase().includes(searchQuery) ||
      item.category.toLowerCase().includes(searchQuery);

    return matchesCategory && matchesSearch && isRegularItem;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / ITEMS_PER_PAGE) || 1;

  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const paginatedProducts = filtered.slice(startIndex, endIndex);

  if (countDisplay) {
    if (totalFiltered > ITEMS_PER_PAGE) {
      countDisplay.textContent = `Menampilkan ${startIndex + 1} - ${endIndex} dari ${totalFiltered} produk pilihan (Halaman ${currentPage}/${totalPages})`;
    } else {
      countDisplay.textContent = `Menampilkan ${totalFiltered} produk pilihan`;
    }
  }

  if (totalFiltered === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    if (paginationContainer) paginationContainer.classList.add("hidden");
    return;
  } else {
    if (emptyState) emptyState.classList.add("hidden");
    if (paginationContainer) paginationContainer.classList.remove("hidden");
  }

  container.innerHTML = paginatedProducts.map((product) => {
    const formattedPrice = formatRupiah(product.price);
    const imageSrc = formatGoogleDriveImageUrl(product.imageUrl || product.image);

    return `
      <div class="product-card rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between group bg-white">
        <div class="product-card-body" onclick="openProductPreview('${product.id}')">
          <div class="product-image-wrap">
            <img src="${imageSrc}" alt="${product.name}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
            <span class="absolute top-2 right-2 bg-[#38b6ff] text-white text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md uppercase shadow-sm">
              ${product.category}
            </span>
          </div>

          <div class="p-2.5 sm:p-4">
            <div class="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 mb-1 gap-1">
              <span class="capitalize font-bold text-[#0077d6] bg-[#e8f7ff] px-1.5 py-0.5 rounded text-[10px] sm:text-xs truncate max-w-[65%]">${product.category}</span>
              <span class="badge-stock px-1.5 py-0.5 rounded-full text-[9px] sm:text-[11px] shrink-0">${product.stock || 'Ready'}</span>
            </div>

            <h3 class="font-bold text-slate-800 text-xs sm:text-base mb-1 group-hover:text-[#38b6ff] transition-colors line-clamp-2 leading-snug sm:leading-normal" title="${product.name}">
              ${product.name}
            </h3>
            
            <p class="text-[10px] sm:text-xs text-slate-400 mb-1.5 sm:mb-2 truncate">${product.unit || '1 Pcs'}</p>

            <div class="mb-2 sm:mb-4">
              <span class="text-sm sm:text-xl font-extrabold text-[#0077d6]">${formattedPrice}</span>
            </div>
          </div>
        </div>

        <div class="p-2.5 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
          <button onclick="addToCart('${product.id}', 1)" class="w-full py-1.5 sm:py-2.5 px-2 sm:px-3 rounded-xl bg-gradient-to-r from-[#ff66c4] to-[#e043a5] hover:from-[#e043a5] text-white text-[11px] sm:text-sm font-extrabold flex items-center justify-center gap-1.5 sm:gap-2 shadow-sm transition">
            <i class="fas fa-cart-plus text-xs sm:text-base"></i>
            <span>+ Keranjang</span>
          </button>
          
          <button onclick="orderSingleItemWA('${product.id}')" class="w-full py-1 sm:py-2 px-2 sm:px-3 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition">
            <i class="fab fa-whatsapp text-emerald-600 text-xs sm:text-sm"></i>
            <span class="truncate">Tanya WA</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  renderPaginationControls(totalPages, totalFiltered, startIndex, endIndex);
}

/**
 * Render tombol navigasi halaman (Pagination)
 */
function renderPaginationControls(totalPages, totalFiltered, startIndex, endIndex) {
  const paginationContainer = document.getElementById("paginationContainer");
  const paginationInfo = document.getElementById("paginationInfo");
  const paginationButtons = document.getElementById("paginationButtons");

  if (!paginationContainer || !paginationButtons) return;

  if (totalFiltered <= ITEMS_PER_PAGE) {
    paginationContainer.classList.add("hidden");
    return;
  }

  paginationContainer.classList.remove("hidden");

  if (paginationInfo) {
    paginationInfo.textContent = `Menampilkan ${startIndex + 1} - ${endIndex} dari ${totalFiltered} produk`;
  }

  let btnsHtml = "";

  // Tombol Prev
  btnsHtml += `
    <button onclick="goToCatalogPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}
      class="px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 ${
        currentPage <= 1
          ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
          : 'bg-white text-slate-700 hover:bg-sky-50 hover:text-[#0077d6] border-slate-300 shadow-sm'
      }">
      <i class="fas fa-chevron-left text-[10px]"></i>
      <span class="hidden sm:inline">Sebelumnya</span>
    </button>
  `;

  // Nomor halaman
  const maxButtonsToShow = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxButtonsToShow - 1);
  if (endPage - startPage < maxButtonsToShow - 1) {
    startPage = Math.max(1, endPage - maxButtonsToShow + 1);
  }

  if (startPage > 1) {
    btnsHtml += `
      <button onclick="goToCatalogPage(1)" class="w-8 h-8 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition">1</button>
    `;
    if (startPage > 2) {
      btnsHtml += `<span class="px-1 text-slate-400 text-xs">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const isActive = i === currentPage;
    btnsHtml += `
      <button onclick="goToCatalogPage(${i})"
        class="w-8 h-8 rounded-xl text-xs font-bold transition ${
          isActive
            ? 'bg-gradient-to-r from-[#38b6ff] to-[#0099ff] text-white shadow-sm shadow-sky-400/30'
            : 'border border-slate-200 bg-white text-slate-700 hover:bg-sky-50 hover:text-[#0077d6]'
        }">
        ${i}
      </button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      btnsHtml += `<span class="px-1 text-slate-400 text-xs">...</span>`;
    }
    btnsHtml += `
      <button onclick="goToCatalogPage(${totalPages})" class="w-8 h-8 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition">${totalPages}</button>
    `;
  }

  // Tombol Next
  btnsHtml += `
    <button onclick="goToCatalogPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}
      class="px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 ${
        currentPage >= totalPages
          ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
          : 'bg-white text-slate-700 hover:bg-sky-50 hover:text-[#0077d6] border-slate-300 shadow-sm'
      }">
      <span class="hidden sm:inline">Selanjutnya</span>
      <i class="fas fa-chevron-right text-[10px]"></i>
    </button>
  `;

  paginationButtons.innerHTML = btnsHtml;
}

/**
 * Pindah ke halaman tertentu dan scroll ke atas katalog
 */
function goToCatalogPage(page) {
  currentPage = page;
  renderProducts();

  const grid = document.getElementById("productGridContainer");
  if (grid) {
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateCategoryCounts() {
  const categoryKeys = [
    { key: "bumbu-rempah", name: "bumbu & rempah" },
    { key: "frozen-food", name: "frozen food" },
    { key: "kebersihan-rumah", name: "kebersihan rumah" },
    { key: "makanan-kaleng-olahan", name: "makanan kaleng & olahan" },
    { key: "makanan-ringan-snack", name: "makanan ringan & snack" },
    { key: "mi-pasta-makanan-instan", name: "mi, pasta & makanan instan" },
    { key: "minuman", name: "minuman" },
    { key: "obat-kesehatan", name: "obat & kesehatan" },
    { key: "perawatan-pribadi", name: "perawatan pribadi" },
    { key: "perawatan-rumah", name: "perawatan rumah" },
    { key: "perlengkapan-rumah-tangga", name: "perlengkapan rumah tangga" },
    { key: "rokok-tembakau", name: "rokok & tembakau" },
    { key: "sembako", name: "sembako" },
    { key: "susu-produk-bayi", name: "susu & produk bayi" },
    { key: "tisu-produk-kertas", name: "tisu & produk kertas" }
  ];

  const totalEl = document.getElementById("count-all");
  if (totalEl) totalEl.textContent = productsList.length;

  categoryKeys.forEach((cat) => {
    const badgeEl = document.getElementById(`count-${cat.key}`);
    if (badgeEl) {
      const targetNorm = normalizeCategoryKey(cat.name);
      const count = productsList.filter((p) => {
        const itemNorm = normalizeCategoryKey(p.category);
        return itemNorm === targetNorm || itemNorm.includes(targetNorm);
      }).length;
      badgeEl.textContent = count;
    }
  });
}

function setupEventListeners() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      currentPage = 1;
      renderProducts();
    });
  }

  const categoryBtns = document.querySelectorAll(".category-tab-btn");
  categoryBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      categoryBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.getAttribute("data-category");
      currentPage = 1;
      renderProducts();
    });
  });
}

// ==============================================================================
// BANNER SLIDER PROMOSI (DINAMIS SUPABASE + AUTOPLAY + FALLBACK)
// ==============================================================================
async function fetchBannersFromDatabase() {
  const supabaseClient = getSupabaseClient();
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("banners")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        bannersList = data.map((b, idx) => ({
          id: b.id,
          title: b.title,
          subtitle: b.description || "",
          description: b.description || "",
          tag: b.badge_text || "KATALOG ONLINE",
          badge_text: b.badge_text || "KATALOG ONLINE",
          button_text: b.button_text || "Lihat Katalog Produk",
          button_url: b.button_url || "#katalog",
          bgGradient: BANNER_GRADIENT_PALETTES[idx % BANNER_GRADIENT_PALETTES.length],
          image: formatGoogleDriveImageUrl(b.image_url),
          image_url: formatGoogleDriveImageUrl(b.image_url),
          sort_order: b.sort_order || idx + 1
        }));
        renderBannerSlider();
        return;
      }
    } catch (err) {
      console.warn("Gagal memuat banner dari Supabase, menggunakan banner default:", err);
    }
  }

  // Gunakan banner default jika tabel belum ada atau kosong
  bannersList = [...DEFAULT_BANNERS];
  renderBannerSlider();
}

function initBannerSlider() {
  // Render awal dengan data lokal / default dahulu agar tidak ada jeda kosong
  renderBannerSlider();
  // Ambil data terbaru secara dinamis dari Supabase
  fetchBannersFromDatabase();
}

function renderBannerSlider() {
  const bannerWrapper = document.getElementById("bannerWrapper");
  const bannerDots = document.getElementById("bannerDots");
  if (!bannerWrapper || !bannerDots || bannersList.length === 0) return;

  currentBannerIndex = 0;

  bannerWrapper.innerHTML = bannersList.map((banner) => {
    const imgSrc = formatGoogleDriveImageUrl(banner.image_url || banner.image);
    return `
      <div class="banner-slide flex-shrink-0 w-full relative rounded-2xl overflow-hidden p-6 md:p-10 text-white min-h-[200px] md:min-h-[260px] flex items-center justify-between" style="background: ${banner.bgGradient}">
        <div class="z-10 max-w-xl">
          <span class="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-extrabold uppercase tracking-wider mb-2 text-white border border-white/30">
            ${banner.badge_text || banner.tag}
          </span>
          <h2 class="text-2xl md:text-4xl font-extrabold mb-2 leading-tight drop-shadow-sm">${banner.title}</h2>
          <p class="text-sm md:text-lg opacity-95 mb-4 font-medium">${banner.description || banner.subtitle}</p>
          <a href="${banner.button_url || '#katalog'}" class="inline-flex items-center gap-2 bg-white text-slate-900 font-bold px-5 py-2.5 rounded-full hover:bg-slate-100 transition shadow-lg text-sm md:text-base">
            <span>${banner.button_text || 'Lihat Katalog Produk'}</span>
            <i class="fas fa-arrow-right text-[#ff66c4]"></i>
          </a>
        </div>
        <div class="w-24 h-24 sm:w-36 sm:h-36 md:w-64 md:h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-white/30 shrink-0 transform md:rotate-2 ml-2">
          <img src="${imgSrc}" alt="${banner.title}" class="w-full h-full object-cover" onerror="if(this.dataset.errored) return; this.dataset.errored='1'; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=800';">
        </div>
      </div>
    `;
  }).join("");

  bannerDots.innerHTML = bannersList.map((_, idx) => `
    <button onclick="goToBanner(${idx})" class="w-3 h-3 rounded-full transition-all duration-300 ${idx === 0 ? 'bg-[#38b6ff] w-8' : 'bg-slate-300'}" id="dot-${idx}" aria-label="Slide ${idx + 1}"></button>
  `).join("");

  updateBannerPosition();
  startBannerAutoPlay();
}

function startBannerAutoPlay() {
  clearInterval(bannerInterval);
  if (bannersList.length <= 1) return;
  bannerInterval = setInterval(() => {
    currentBannerIndex = (currentBannerIndex + 1) % bannersList.length;
    updateBannerPosition();
  }, 4500);
}

function goToBanner(index) {
  if (index < 0 || index >= bannersList.length) return;
  currentBannerIndex = index;
  updateBannerPosition();
  startBannerAutoPlay();
}

function updateBannerPosition() {
  const bannerWrapper = document.getElementById("bannerWrapper");
  if (!bannerWrapper || bannersList.length === 0) return;

  bannerWrapper.style.transform = `translateX(-${currentBannerIndex * 100}%)`;

  bannersList.forEach((_, idx) => {
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

  const isPromo = product.promoDetails && product.promoDetails.hasPromo;
  const promo = product.promoDetails;
  const imageSrc = formatGoogleDriveImageUrl(product.imageUrl || product.image);

  // Populate modal content
  document.getElementById("previewImage").src = imageSrc;
  document.getElementById("previewImage").alt = product.name;
  document.getElementById("previewName").textContent = product.name;
  document.getElementById("previewCategory").textContent = product.category;
  document.getElementById("previewStock").textContent = product.stock || "Ready";
  document.getElementById("previewUnit").textContent = product.unit || "1 Pcs";

  const priceEl = document.getElementById("previewPrice");
  if (priceEl) {
    if (isPromo && promo.promoType === "percent") {
      priceEl.innerHTML = `
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="text-2xl font-black text-rose-600">${formatRupiah(promo.finalPrice)}</span>
          <span class="text-sm text-slate-400 line-through font-semibold">${formatRupiah(product.price)}</span>
          <span class="text-xs font-extrabold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md uppercase">Diskon ${promo.promoValue}%</span>
        </div>
      `;
    } else if (isPromo && promo.promoType === "nominal") {
      priceEl.innerHTML = `
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="text-2xl font-black text-rose-600">${formatRupiah(promo.finalPrice)}</span>
          <span class="text-sm text-slate-400 line-through font-semibold">${formatRupiah(product.price)}</span>
          <span class="text-xs font-extrabold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md uppercase">${promo.label}</span>
        </div>
      `;
    } else if (isPromo && promo.promoType === "b1g1") {
      priceEl.innerHTML = `
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="text-2xl font-black text-[#0077d6]">${formatRupiah(product.price)}</span>
          <span class="text-xs font-extrabold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md uppercase">Buy 1 Get 1 Free</span>
        </div>
      `;
    } else {
      priceEl.textContent = formatRupiah(product.price);
    }
  }

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

/**
 * ==============================================================================
 * DYNAMIC PROMOTIONAL SECTION / CATALOG MANAGER (KLIK INDOMARET STYLE)
 * Mengambil seksi aktif dari Supabase dan me-render carousel bertema di beranda
 * ==============================================================================
 */
let dynamicPromoSections = [];

async function fetchDynamicPromotionalSections() {
  const container = document.getElementById("dynamicPromotionalSectionsContainer");
  if (!container) return;

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    // 1. Ambil data seksi aktif yang diurutkan berdasarkan display_order
    const { data: sections, error: secError } = await supabaseClient
      .from("promotional_sections")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (secError || !sections || sections.length === 0) {
      container.innerHTML = "";
      return;
    }

    // 2. Ambil data relasi items secara aman tanpa bergantung pada foreign-key cache PostgREST
    const sectionIds = sections.map((s) => s.id);
    let items = [];
    try {
      const { data: rawItems, error: itemError } = await supabaseClient
        .from("promotional_section_items")
        .select("id, section_id, product_id, sort_order")
        .in("section_id", sectionIds)
        .order("sort_order", { ascending: true });

      if (!itemError && rawItems) {
        items = rawItems;
      } else if (itemError) {
        console.warn("Info item seksi promo:", itemError);
      }
    } catch (itErr) {
      console.warn("Gagal load item seksi:", itErr);
    }

    // Siapkan peta produk dari database / memory
    const prodMap = new Map((productsList || []).map((p) => [String(p.id), p]));
    const missingProductIds = items
      .map((it) => String(it.product_id))
      .filter((pid) => !prodMap.has(pid));

    if (missingProductIds.length > 0) {
      try {
        const { data: dbProds } = await supabaseClient
          .from("products")
          .select("*")
          .in("id", missingProductIds);
        (dbProds || []).forEach((p) => prodMap.set(String(p.id), p));
      } catch (pErr) {
        console.warn("Gagal mengambil detail produk seksi promo:", pErr);
      }
    }

    // Gabungkan produk ke masing-masing seksi
    const itemsBySection = {};
    items.forEach((it) => {
      if (!itemsBySection[it.section_id]) {
        itemsBySection[it.section_id] = [];
      }
      const p = prodMap.get(String(it.product_id));
      if (p) {
        itemsBySection[it.section_id].push(mapProductWithPromo(p));
      }
    });

    dynamicPromoSections = sections.map((sec) => ({
      ...sec,
      products: itemsBySection[sec.id] || []
    }));

    renderDynamicPromotionalSections();
  } catch (err) {
    console.warn("Error fetchDynamicPromotionalSections:", err);
  }
}

// ==============================================================================
// TEMA GRADASI DINAMIS UNTUK SEKSI PROMO (KLIK INDOMARET STYLE)
// ==============================================================================
const DYNAMIC_SECTION_THEMES = {
  sky: {
    gradient: "linear-gradient(135deg, #dbeafe 0%, #eff6ff 55%, #ffffff 100%)",
    border: "#bfdbfe",
    glowColor: "rgba(56, 182, 255, 0.28)",
    iconBg: "linear-gradient(135deg, #38b6ff, #0077d6)",
    tagBg: "#dbeafe",
    tagText: "#1d4ed8"
  },
  pink: {
    gradient: "linear-gradient(135deg, #fce7f3 0%, #fff1f2 55%, #ffffff 100%)",
    border: "#fbcfe8",
    glowColor: "rgba(255, 102, 196, 0.28)",
    iconBg: "linear-gradient(135deg, #ff66c4, #e043a5)",
    tagBg: "#fce7f3",
    tagText: "#be185d"
  },
  emerald: {
    gradient: "linear-gradient(135deg, #d1fae5 0%, #ecfdf5 55%, #ffffff 100%)",
    border: "#a7f3d0",
    glowColor: "rgba(16, 185, 129, 0.28)",
    iconBg: "linear-gradient(135deg, #10b981, #059669)",
    tagBg: "#d1fae5",
    tagText: "#047857"
  },
  orange: {
    gradient: "linear-gradient(135deg, #ffedd5 0%, #fffbeb 55%, #ffffff 100%)",
    border: "#fed7aa",
    glowColor: "rgba(249, 115, 22, 0.28)",
    iconBg: "linear-gradient(135deg, #f97316, #ea580c)",
    tagBg: "#ffedd5",
    tagText: "#c2410c"
  },
  purple: {
    gradient: "linear-gradient(135deg, #ede9fe 0%, #f5f3ff 55%, #ffffff 100%)",
    border: "#ddd6fe",
    glowColor: "rgba(139, 92, 246, 0.28)",
    iconBg: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    tagBg: "#ede9fe",
    tagText: "#6d28d9"
  }
};

function hexToRgbaApp(hex, alpha = 1) {
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

/**
 * Ekstraksi warna dominan gambar banner untuk gradasi otomatis
 */
function applyBannerColorToSection(cardId, glowId, iconId, imgEl) {
  if (!imgEl) return;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = 16;
    canvas.height = 16;
    ctx.drawImage(imgEl, 0, 0, 16, 16);
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

      const card = document.getElementById(cardId);
      const glow = document.getElementById(glowId);
      const icon = document.getElementById(iconId);
      if (card) {
        card.style.background = `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.22) 0%, rgba(${r}, ${g}, ${b}, 0.05) 55%, #ffffff 100%)`;
        card.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.32)`;
      }
      if (glow) {
        glow.style.background = `rgba(${r}, ${g}, ${b}, 0.35)`;
      }
      if (icon) {
        icon.style.background = `linear-gradient(135deg, rgb(${r}, ${g}, ${b}), rgba(${r}, ${g}, ${b}, 0.8))`;
      }
    }
  } catch (err) {
    // Graceful fallback jika browser memblokir canvas CORS
  }
}

function renderDynamicPromotionalSections() {
  const container = document.getElementById("dynamicPromotionalSectionsContainer");
  if (!container) return;

  if (dynamicPromoSections.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = dynamicPromoSections.map((sec, idx) => {
    const bannerImg = formatGoogleDriveImageUrl(sec.banner_image_url);
    const seeAllLink = sec.see_all_url || "#katalog";
    const safeSecId = String(sec.id).replace(/[^a-zA-Z0-9]/g, "_");
    const carouselId = `sectionCarousel_${safeSecId}`;
    const sectionCardId = `secCard_${safeSecId}`;
    const bannerImgId = `bannerImg_${safeSecId}`;
    const glowId = `glow_${safeSecId}`;
    const iconId = `icon_${safeSecId}`;
    const themeKey = sec.bg_color || "auto";

    // Setup warna awal (Sky blue / preset / hex)
    let initialGradient = "linear-gradient(135deg, #dbeafe 0%, #eff6ff 55%, #ffffff 100%)";
    let initialBorder = "#bfdbfe";
    let initialGlow = "rgba(56, 182, 255, 0.28)";
    let initialIcon = "linear-gradient(135deg, #38b6ff, #0077d6)";

    if (DYNAMIC_SECTION_THEMES[themeKey]) {
      const conf = DYNAMIC_SECTION_THEMES[themeKey];
      initialGradient = conf.gradient;
      initialBorder = conf.border;
      initialGlow = conf.glowColor;
      initialIcon = conf.iconBg;
    } else if (String(themeKey).startsWith("#")) {
      initialGradient = `linear-gradient(135deg, ${hexToRgbaApp(themeKey, 0.22)} 0%, ${hexToRgbaApp(themeKey, 0.05)} 55%, #ffffff 100%)`;
      initialBorder = hexToRgbaApp(themeKey, 0.35);
      initialGlow = hexToRgbaApp(themeKey, 0.32);
      initialIcon = themeKey;
    }

    const productsHtml = sec.products.map((item) => {
      const imgUrl = formatGoogleDriveImageUrl(item.image_url || item.imageUrl);
      const isOutOfStock = (item.stock && item.stock.toLowerCase() === 'habis') || (item.cleanStock && item.cleanStock.toLowerCase() === 'habis');

      // Hitung harga normal & promo
      let priceDisplayHtml = `
        <div class="text-xs sm:text-sm font-extrabold text-[#0077d6]">
          ${formatRupiah(item.price)}
        </div>
      `;
      let discountBadgeHtml = "";

      if (item.hasPromo) {
        if (item.promoType === "percent") {
          discountBadgeHtml = `
            <span class="absolute top-2 left-2 z-10 bg-gradient-to-r from-[#ff66c4] to-[#e043a5] text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm">
              <i class="fas fa-bolt text-yellow-200 mr-0.5"></i> ${item.promoValue}% OFF
            </span>
          `;
          priceDisplayHtml = `
            <div class="flex flex-col">
              <span class="text-[10px] text-slate-400 line-through leading-tight">${formatRupiah(item.price)}</span>
              <span class="text-xs sm:text-sm font-black text-pink-600 leading-tight">${formatRupiah(item.finalPrice)}</span>
            </div>
          `;
        } else if (item.promoType === "nominal") {
          discountBadgeHtml = `
            <span class="absolute top-2 left-2 z-10 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm">
              HEMAT
            </span>
          `;
          priceDisplayHtml = `
            <div class="flex flex-col">
              <span class="text-[10px] text-slate-400 line-through leading-tight">${formatRupiah(item.price)}</span>
              <span class="text-xs sm:text-sm font-black text-emerald-600 leading-tight">${formatRupiah(item.finalPrice)}</span>
            </div>
          `;
        } else if (item.promoType === "b1g1") {
          discountBadgeHtml = `
            <span class="absolute top-2 left-2 z-10 bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm">
              <i class="fas fa-gift mr-0.5"></i> BUY 1 GET 1
            </span>
          `;
        }
      }

      return `
        <div class="w-36 sm:w-44 md:w-48 bg-white rounded-3xl p-3 border border-slate-200/90 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between shrink-0 relative group">
          ${discountBadgeHtml}

          <!-- Gambar Produk -->
          <div class="w-full h-32 sm:h-36 rounded-2xl bg-slate-50 flex items-center justify-center p-2 mb-2.5 overflow-hidden">
            <img src="${imgUrl}" alt="${item.name}" loading="lazy"
              class="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
              onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=500';">
          </div>

          <!-- Info Produk -->
          <div>
            <span class="text-[10px] font-bold text-[#0077d6] bg-sky-50 px-2 py-0.5 rounded-md inline-block uppercase tracking-wider mb-1 line-clamp-1">
              ${item.category || 'PROMO'}
            </span>
            <h4 class="text-xs font-bold text-slate-800 line-clamp-2 leading-snug mb-1 min-h-[32px] group-hover:text-[#0077d6] transition-colors" title="${item.name}">
              ${item.name}
            </h4>
            <p class="text-[10px] text-slate-400 mb-2">${item.unit || '1 Pcs'}</p>

            <!-- Bottom Price & Quick Add Button -->
            <div class="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
              ${priceDisplayHtml}

              ${isOutOfStock ? `
                <span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-xl">Habis</span>
              ` : `
                <button onclick="addToCart('${item.id}', 1)"
                  class="w-8 h-8 rounded-full bg-gradient-to-r from-[#38b6ff] to-[#0099ff] hover:from-[#0099ff] hover:to-[#0077d6] text-white flex items-center justify-center font-black text-sm shadow-sm hover:shadow-sky-400/30 transition-all active:scale-90"
                  title="Tambah ke Keranjang">
                  <i class="fas fa-plus"></i>
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <section class="py-6 px-4 max-w-7xl mx-auto">
        <div id="${sectionCardId}"
          class="rounded-3xl p-4 sm:p-6 border shadow-sm relative overflow-hidden transition-all duration-700 backdrop-blur-sm"
          style="background: ${initialGradient}; border-color: ${initialBorder};">
          
          <!-- Decorative Ambient Glow Effect -->
          <div id="${glowId}" class="absolute -top-16 -left-16 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-40 transition-all duration-700"
            style="background: ${initialGlow};"></div>

          <!-- Header Seksi: Judul & Tombol Lihat Semua -->
          <div class="flex items-center justify-between mb-4 pb-3 border-b border-white/60 sm:border-slate-200/50 relative z-10">
            <div class="flex items-center gap-2.5">
              <div id="${iconId}" class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-white flex items-center justify-center text-sm sm:text-base shadow-sm transition-all duration-500"
                style="background: ${initialIcon};">
                <i class="fas fa-fire text-amber-300"></i>
              </div>
              <div>
                <h3 class="text-base sm:text-xl font-black text-slate-900 tracking-tight leading-none">${sec.title}</h3>
                <span class="text-[10px] sm:text-xs text-slate-500">Koleksi promo pilihan hemat Shinemart</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <a href="${seeAllLink}" class="text-xs sm:text-sm font-extrabold text-[#0077d6] hover:text-[#38b6ff] transition flex items-center gap-1 group bg-white/70 hover:bg-white px-3 py-1.5 rounded-xl border border-white/60 shadow-xs">
                <span>Lihat Semua</span>
                <i class="fas fa-arrow-right text-[10px] group-hover:translate-x-1 transition-transform"></i>
              </a>

              <!-- Tombol Navigasi Desktop -->
              <div class="hidden sm:flex items-center gap-1 pl-2">
                <button onclick="scrollSectionCarousel('${carouselId}', -1)" class="w-7 h-7 rounded-full bg-white/80 hover:bg-white text-slate-600 hover:text-[#0077d6] flex items-center justify-center border border-white/70 shadow-xs transition active:scale-95">
                  <i class="fas fa-chevron-left text-[10px]"></i>
                </button>
                <button onclick="scrollSectionCarousel('${carouselId}', 1)" class="w-7 h-7 rounded-full bg-white/80 hover:bg-white text-slate-600 hover:text-[#0077d6] flex items-center justify-center border border-white/70 shadow-xs transition active:scale-95">
                  <i class="fas fa-chevron-right text-[10px]"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Body: Banner Tema Kiri + Produk Slider Kanan (Klik Indomaret Style) -->
          <div class="flex flex-col lg:flex-row gap-4 items-stretch relative z-10">
            
            <!-- Sisi Kiri: Banner Tema -->
            <a href="${seeAllLink}" class="w-full lg:w-72 xl:w-80 shrink-0 rounded-2xl overflow-hidden shadow-sm border border-slate-200/80 relative group block aspect-[3/4] lg:aspect-auto">
              <img id="${bannerImgId}" src="${bannerImg}" alt="${sec.banner_alt || sec.title}"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onerror="if(this.dataset.errored) return; this.dataset.errored='1'; this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?w=800';">
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent flex flex-col justify-end p-4 text-white">
                <span class="text-[10px] font-extrabold uppercase tracking-widest text-[#38b6ff] bg-slate-900/60 backdrop-blur-md px-2.5 py-1 rounded-full self-start mb-1.5 border border-white/20">
                  Promo Spesial
                </span>
                <span class="text-sm font-black line-clamp-2 leading-snug drop-shadow">${sec.title}</span>
              </div>
            </a>

            <!-- Sisi Kanan: Slider Produk Horizontal -->
            <div class="flex-1 relative overflow-hidden flex items-center">
              <div id="${carouselId}" class="w-full flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-none scroll-smooth" style="scrollbar-width: none; -ms-overflow-style: none;">
                ${productsHtml || `
                  <div class="py-12 px-6 text-center w-full text-slate-400">
                    <i class="fas fa-boxes text-2xl mb-2 text-slate-300"></i>
                    <p class="text-xs font-semibold">Produk promo untuk seksi ini sedang disiapkan.</p>
                  </div>
                `}
              </div>
            </div>

          </div>

        </div>
      </section>
    `;
  }).join("");
}

function scrollSectionCarousel(elementId, direction) {
  const container = document.getElementById(elementId);
  if (container) {
    const scrollAmount = 300 * direction;
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  }
}



/**
 * ==============================================================================
 * SHINEMART ADMIN - PRINTABLE A4 RETAIL FLYER GENERATOR (admin-flyer.js)
 * Mengambil data live dari Supabase, membersihkan caption strip bawah foto
 * secara otomatis, dan merender 4 pilihan layout flyer retail A4 siap cetak.
 * ==============================================================================
 */

const FLYER_STORAGE_BG_KEY = "shinemart_flyer_custom_bg_v1";
const FLYER_STORAGE_CFG_KEY = "shinemart_flyer_config_v1";
const FLYER_STORAGE_TRANSFORMS_KEY = "shinemart_flyer_photo_transforms_v1";

const FLYER_LAYOUTS = {
  bento_16: {
    label: "Bento Paling Murah (16 Produk)",
    slotCount: 16,
    wideSlots: new Set([0, 5]),
    isCompact5: false,
    rows: [
      { cls: "sm-flyer-row sm-flyer-row-bento-1", slots: [0, 1, 2] },
      { cls: "sm-flyer-row sm-flyer-row-bento-2", slots: [3, 4, 5] },
      { cls: "sm-flyer-row sm-flyer-row-five", slots: [6, 7, 8, 9, 10] },
      { cls: "sm-flyer-row sm-flyer-row-five", slots: [11, 12, 13, 14, 15] }
    ]
  },
  spotlight_14: {
    label: "2 Hero Atas + Grid 4×3 (14 Produk)",
    slotCount: 14,
    wideSlots: new Set([0, 1]),
    isCompact5: false,
    rows: [
      { cls: "sm-flyer-row sm-flyer-row-hero-2", slots: [0, 1] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [2, 3, 4, 5] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [6, 7, 8, 9] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [10, 11, 12, 13] }
    ]
  },
  grid_4x4: {
    label: "Katalog Rapi 4×4 (16 Produk)",
    slotCount: 16,
    wideSlots: new Set(),
    isCompact5: false,
    rows: [
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [0, 1, 2, 3] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [4, 5, 6, 7] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [8, 9, 10, 11] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [12, 13, 14, 15] }
    ]
  },
  compact_4x5: {
    label: "Hemat Kertas 4×5 (20 Produk)",
    slotCount: 20,
    wideSlots: new Set(),
    isCompact5: true,
    rows: [
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [0, 1, 2, 3] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [4, 5, 6, 7] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [8, 9, 10, 11] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [12, 13, 14, 15] },
      { cls: "sm-flyer-row sm-flyer-row-four", slots: [16, 17, 18, 19] }
    ]
  }
};

const FLYER_THEMES = {
  classic: { className: "", star1: "#ff4fa3", star2: "#c81e78", stroke: "#ffe600" },
  pink:    { className: "theme-pink", star1: "#38b6ff", star2: "#0077d6", stroke: "#ffe600" },
  red:     { className: "theme-red", star1: "#ef4444", star2: "#b91c1c", stroke: "#ffe600" },
  emerald: { className: "theme-emerald", star1: "#f59e0b", star2: "#d97706", stroke: "#ffffff" }
};

const DEFAULT_FLYER_CONFIG = {
  layoutMode: "bento_16",
  colorTheme: "classic",
  headerHeight: 146,
  showGuide: false,
  showInfoStrip: true,
  cleanPhotoCaption: true,
  zoomPercent: 85,
  stripWebTitle: "shinemart.id",
  stripWebSub: "Cek harga & stok terbaru",
  stripWaTitle: "0851-9896-3411",
  stripWaSub: "Langsung terhubung kasir",
  stripHourTitle: "07.00 - 22.00 WIB",
  stripHourSub: "Jl. Utan Jati No.32A",
  footerText: "*Berlaku di Shinemart Utan Jati, Kalideres - Jakarta Barat • Selama persediaan masih ada • Belanja online di shinemart.id"
};

let flyerInitialized = false;
let flyerConfig = { ...DEFAULT_FLYER_CONFIG };
let flyerCustomBgDataUrl = "";
let flyerSlots = new Array(20).fill(null);
let flyerPhotoTransforms = new Array(20).fill(null);
let flyerActiveSlotIndex = null;
let flyerSelectedSlotIndex = null;
let flyerDirectEventsBound = false;
let flyerCategoryPage = 0;

const flyerCleanedImgCache = new Map();
const flyerCssCropFallbackSet = new Set();

const FLYER_STARBURST_POINTS = (() => {
  const pts = [];
  const spikes = 18;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (Math.PI * i) / spikes;
    const r = i % 2 === 0 ? 49 : 40;
    pts.push(`${(50 + r * Math.cos(angle)).toFixed(1)},${(50 + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(" ");
})();

function getActiveLayoutSpec() {
  return FLYER_LAYOUTS[flyerConfig.layoutMode] || FLYER_LAYOUTS.bento_16;
}

function getDefaultFlyerBackgroundDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" width="794" height="1123">
    <defs>
      <linearGradient id="smBgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#006bc2"/>
        <stop offset="20%" stop-color="#0088ee"/>
        <stop offset="65%" stop-color="#0077d6"/>
        <stop offset="100%" stop-color="#005299"/>
      </linearGradient>
      <radialGradient id="smPinkGlow" cx="50%" cy="10%" r="45%">
        <stop offset="0%" stop-color="#ff66c4" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#ff66c4" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="794" height="1123" fill="url(#smBgGrad)"/>
    <rect width="794" height="420" fill="url(#smPinkGlow)"/>
    <circle cx="40" cy="1080" r="140" fill="#38b6ff" fill-opacity="0.16"/>
    <circle cx="760" cy="960" r="180" fill="#ff66c4" fill-opacity="0.15"/>
    <circle cx="740" cy="40" r="130" fill="#38b6ff" fill-opacity="0.18"/>
    <g opacity="0.14" fill="#ffffff">
      <polygon points="397,85 110,0 185,0"/>
      <polygon points="397,85 260,0 330,0"/>
      <polygon points="397,85 450,0 520,0"/>
      <polygon points="397,85 595,0 675,0"/>
      <polygon points="397,85 794,30 794,95"/>
      <polygon points="397,85 0,30 0,95"/>
    </g>
    <text x="397" y="64" text-anchor="middle" font-family="Segoe UI, Arial" font-size="38" font-weight="900" font-style="italic" fill="#ffe600" stroke="#003966" stroke-width="5" paint-order="stroke">PALING MURAH</text>
    <text x="397" y="96" text-anchor="middle" font-family="Segoe UI, Arial" font-size="15" font-weight="800" fill="#ffffff">SHINEMART MINIMARKET &amp; FROZEN FOOD</text>
    <rect x="277" y="108" width="240" height="24" rx="12" fill="#ffe600"/>
    <text x="397" y="124" text-anchor="middle" font-family="Segoe UI, Arial" font-size="11" font-weight="900" fill="#0f172a">UPLOAD GAMBAR A4 CUSTOM DI PANEL KIRI</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

async function initAdminFlyerTab() {
  loadFlyerSavedState();
  syncFlyerControlInputs();
  applyFlyerVisualSettings();

  if (!Array.isArray(liveSupabaseProducts) || liveSupabaseProducts.length === 0) {
    await fetchAllProductsForFlyer();
  }

  populateFlyerCategoryDropdown();

  if (!flyerInitialized) {
    flyerInitialized = true;
    applyFlyerPreset("promo_mix", 0, true);
  } else {
    renderFlyerBoard();
  }
  bindFlyerDirectCanvasEvents();
}

function loadFlyerSavedState() {
  try {
    const savedCfg = localStorage.getItem(FLYER_STORAGE_CFG_KEY);
    if (savedCfg) {
      flyerConfig = { ...DEFAULT_FLYER_CONFIG, ...JSON.parse(savedCfg) };
    }
    const savedBg = localStorage.getItem(FLYER_STORAGE_BG_KEY);
    if (savedBg) {
      flyerCustomBgDataUrl = savedBg;
    }
    const savedTransforms = localStorage.getItem(FLYER_STORAGE_TRANSFORMS_KEY);
    if (savedTransforms) {
      const parsed = JSON.parse(savedTransforms);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < 20; i++) {
          flyerPhotoTransforms[i] = parsed[i] ? normalizeFlyerTransform(parsed[i]) : null;
        }
      }
    }
  } catch (e) {
    console.warn("Gagal membaca konfigurasi flyer lokal:", e);
  }
}

function normalizeFlyerTransform(t) {
  const scale = Math.min(280, Math.max(40, Math.round(Number(t?.scale) || 100)));
  const x = Math.min(90, Math.max(-90, Math.round(Number(t?.x) || 0)));
  const y = Math.min(90, Math.max(-90, Math.round(Number(t?.y) || 0)));
  return { scale, x, y };
}

function getFlyerSlotTransform(slotIndex) {
  return normalizeFlyerTransform(flyerPhotoTransforms[slotIndex]);
}

function isFlyerTransformCustomized(t) {
  const n = normalizeFlyerTransform(t);
  return n.scale !== 100 || n.x !== 0 || n.y !== 0;
}

function buildFlyerTransformCss(t) {
  const n = normalizeFlyerTransform(t);
  return `translate(${n.x}px, ${n.y}px) scale(${(n.scale / 100).toFixed(2)})`;
}

function saveFlyerPhotoTransforms() {
  try {
    localStorage.setItem(FLYER_STORAGE_TRANSFORMS_KEY, JSON.stringify(flyerPhotoTransforms));
  } catch (e) {
    console.warn("Gagal menyimpan penyesuaian foto flyer:", e);
  }
}

function saveFlyerConfigState() {
  try {
    localStorage.setItem(FLYER_STORAGE_CFG_KEY, JSON.stringify(flyerConfig));
  } catch (e) {
    console.warn("Gagal menyimpan konfigurasi flyer:", e);
  }
}

async function fetchAllProductsForFlyer() {
  const statusEl = document.getElementById("flyerStatusText");
  if (statusEl) statusEl.textContent = "Memuat produk dari Supabase...";

  const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : null;
  if (!client) {
    if (statusEl) statusEl.textContent = "Supabase belum terhubung.";
    return;
  }

  try {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await client
        .from("products")
        .select("*")
        .order("id", { ascending: true })
        .range(from, from + step - 1);
      if (error) throw error;
      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < step) hasMore = false;
        else from += step;
      } else {
        hasMore = false;
      }
    }

    liveSupabaseProducts = allData;
    if (statusEl) statusEl.textContent = `${liveSupabaseProducts.length} produk siap digunakan.`;
  } catch (err) {
    console.warn("Gagal fetch produk flyer:", err);
    if (statusEl) statusEl.textContent = "Gagal mengambil data produk.";
  }
}

function populateFlyerCategoryDropdown() {
  const select = document.getElementById("flyerCategoryFilterSelect");
  if (!select || !Array.isArray(liveSupabaseProducts)) return;

  const currentVal = select.value;
  const catMap = new Map();
  liveSupabaseProducts.forEach((p) => {
    const raw = String(p.category || "Lainnya").trim();
    const key = raw.toLowerCase();
    if (!catMap.has(key)) {
      catMap.set(key, raw);
    }
  });

  const sorted = Array.from(catMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  select.innerHTML = `<option value="__all__">Semua Kategori (${liveSupabaseProducts.length})</option>` +
    sorted.map(([key, label]) => `<option value="${escapeFlyerHtml(key)}">${escapeFlyerHtml(label)}</option>`).join("");

  if (currentVal && Array.from(select.options).some((o) => o.value === currentVal)) {
    select.value = currentVal;
  }
}

function syncFlyerControlInputs() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const setChecked = (id, checked) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
  };

  setVal("flyerLayoutModeSelect", flyerConfig.layoutMode);
  setVal("flyerColorThemeSelect", flyerConfig.colorTheme);
  setVal("flyerHeaderHeightInput", flyerConfig.headerHeight);
  const hhLabel = document.getElementById("flyerHeaderHeightLabel");
  if (hhLabel) hhLabel.textContent = `${flyerConfig.headerHeight}px`;

  setChecked("flyerToggleGuide", flyerConfig.showGuide);
  setChecked("flyerToggleInfoStrip", flyerConfig.showInfoStrip);
  setChecked("flyerToggleCleanPhoto", flyerConfig.cleanPhotoCaption);
  setVal("flyerZoomSelect", String(flyerConfig.zoomPercent));

  setVal("flyerStripWebTitle", flyerConfig.stripWebTitle);
  setVal("flyerStripWebSub", flyerConfig.stripWebSub);
  setVal("flyerStripWaTitle", flyerConfig.stripWaTitle);
  setVal("flyerStripWaSub", flyerConfig.stripWaSub);
  setVal("flyerStripHourTitle", flyerConfig.stripHourTitle);
  setVal("flyerStripHourSub", flyerConfig.stripHourSub);
  setVal("flyerFooterTextInput", flyerConfig.footerText);

  updateFlyerLayoutButtonsActive();
}

function updateFlyerLayoutButtonsActive() {
  document.querySelectorAll("[data-flyer-layout]").forEach((btn) => {
    const mode = btn.getAttribute("data-flyer-layout");
    const active = mode === flyerConfig.layoutMode;
    btn.className = active
      ? "p-2 rounded-xl border-2 border-[#0077d6] bg-sky-50 text-[#0077d6] font-extrabold text-[11px] text-left transition shadow-sm"
      : "p-2 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-slate-600 font-bold text-[11px] text-left transition";
  });
}

function setFlyerLayoutMode(mode) {
  if (!FLYER_LAYOUTS[mode]) return;
  flyerConfig.layoutMode = mode;
  const select = document.getElementById("flyerLayoutModeSelect");
  if (select) select.value = mode;
  updateFlyerLayoutButtonsActive();

  // Jika pindah ke layout 20 slot dan slot 16-19 masih kosong, isi otomatis dari produk yang belum terpakai
  const needed = FLYER_LAYOUTS[mode].slotCount;
  if (Array.isArray(liveSupabaseProducts) && liveSupabaseProducts.length > 0) {
    const usedIds = new Set(flyerSlots.filter(Boolean).map((p) => String(p.id)));
    const extras = liveSupabaseProducts.filter((p) => !usedIds.has(String(p.id)));
    let extraIdx = 0;
    for (let i = 0; i < needed; i++) {
      if (!flyerSlots[i] && extraIdx < extras.length) {
        flyerSlots[i] = extras[extraIdx++];
      }
    }
  }

  saveFlyerConfigState();
  renderFlyerBoard();
}

function applyFlyerVisualSettings() {
  const a4El = document.getElementById("smFlyerA4");
  const headerSlot = document.getElementById("smFlyerHeaderSlot");
  const infoStrip = document.getElementById("smFlyerInfoStrip");
  const footerEl = document.getElementById("smFlyerFooter");
  const zoomWrap = document.getElementById("smFlyerZoomWrap");

  if (a4El) {
    const bgUrl = flyerCustomBgDataUrl || getDefaultFlyerBackgroundDataUrl();
    a4El.style.backgroundImage = `url("${bgUrl}")`;
    a4El.classList.toggle("show-header-guide", !!flyerConfig.showGuide);

    a4El.classList.remove("theme-pink", "theme-red", "theme-emerald");
    const themeSpec = FLYER_THEMES[flyerConfig.colorTheme];
    if (themeSpec && themeSpec.className) {
      a4El.classList.add(themeSpec.className);
    }
  }

  if (headerSlot) {
    headerSlot.style.height = `${flyerConfig.headerHeight}px`;
  }

  if (infoStrip) {
    infoStrip.style.display = flyerConfig.showInfoStrip ? "grid" : "none";
  }

  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  setTxt("smFlyerStripWebTitleView", flyerConfig.stripWebTitle);
  setTxt("smFlyerStripWebSubView", flyerConfig.stripWebSub);
  setTxt("smFlyerStripWaTitleView", flyerConfig.stripWaTitle);
  setTxt("smFlyerStripWaSubView", flyerConfig.stripWaSub);
  setTxt("smFlyerStripHourTitleView", flyerConfig.stripHourTitle);
  setTxt("smFlyerStripHourSubView", flyerConfig.stripHourSub);

  if (footerEl) {
    footerEl.textContent = flyerConfig.footerText;
  }

  if (zoomWrap) {
    const scale = (Number(flyerConfig.zoomPercent) || 85) / 100;
    zoomWrap.style.transform = `scale(${scale})`;
    zoomWrap.style.marginBottom = `${Math.round(1123 * (scale - 1))}px`;
  }
}

function handleFlyerControlChange() {
  const getVal = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  };
  const getChecked = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? el.checked : fallback;
  };

  const prevClean = flyerConfig.cleanPhotoCaption;
  const prevTheme = flyerConfig.colorTheme;
  const prevLayout = flyerConfig.layoutMode;

  flyerConfig.layoutMode = getVal("flyerLayoutModeSelect", flyerConfig.layoutMode);
  flyerConfig.colorTheme = getVal("flyerColorThemeSelect", flyerConfig.colorTheme);
  flyerConfig.headerHeight = Number(getVal("flyerHeaderHeightInput", 146)) || 146;

  const hhLabel = document.getElementById("flyerHeaderHeightLabel");
  if (hhLabel) hhLabel.textContent = `${flyerConfig.headerHeight}px`;

  flyerConfig.showGuide = getChecked("flyerToggleGuide", false);
  flyerConfig.showInfoStrip = getChecked("flyerToggleInfoStrip", true);
  flyerConfig.cleanPhotoCaption = getChecked("flyerToggleCleanPhoto", true);
  flyerConfig.zoomPercent = Number(getVal("flyerZoomSelect", 85)) || 85;

  flyerConfig.stripWebTitle = getVal("flyerStripWebTitle", DEFAULT_FLYER_CONFIG.stripWebTitle);
  flyerConfig.stripWebSub = getVal("flyerStripWebSub", DEFAULT_FLYER_CONFIG.stripWebSub);
  flyerConfig.stripWaTitle = getVal("flyerStripWaTitle", DEFAULT_FLYER_CONFIG.stripWaTitle);
  flyerConfig.stripWaSub = getVal("flyerStripWaSub", DEFAULT_FLYER_CONFIG.stripWaSub);
  flyerConfig.stripHourTitle = getVal("flyerStripHourTitle", DEFAULT_FLYER_CONFIG.stripHourTitle);
  flyerConfig.stripHourSub = getVal("flyerStripHourSub", DEFAULT_FLYER_CONFIG.stripHourSub);
  flyerConfig.footerText = getVal("flyerFooterTextInput", DEFAULT_FLYER_CONFIG.footerText);

  updateFlyerLayoutButtonsActive();
  saveFlyerConfigState();
  applyFlyerVisualSettings();

  if (prevClean !== flyerConfig.cleanPhotoCaption || prevTheme !== flyerConfig.colorTheme || prevLayout !== flyerConfig.layoutMode) {
    renderFlyerBoard();
  }
}

function handleFlyerBgUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const rawDataUrl = ev.target.result;
    const img = new Image();
    img.onload = () => {
      try {
        const maxW = 1488;
        const maxH = 2105;
        let w = img.naturalWidth || maxW;
        let h = img.naturalHeight || maxH;
        const scale = Math.min(1, maxW / w, maxH / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const compressed = canvas.toDataURL("image/jpeg", 0.90);
        flyerCustomBgDataUrl = compressed;
        try {
          localStorage.setItem(FLYER_STORAGE_BG_KEY, compressed);
        } catch (storageErr) {
          console.warn("Gambar terlalu besar untuk localStorage:", storageErr);
        }
      } catch (err) {
        flyerCustomBgDataUrl = rawDataUrl;
      }

      applyFlyerVisualSettings();
      if (typeof showAdminToast === "function") {
        showAdminToast("Background A4 custom berhasil dipasang!", "success");
      }
    };
    img.onerror = () => {
      flyerCustomBgDataUrl = rawDataUrl;
      applyFlyerVisualSettings();
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
}

function resetFlyerCustomBg() {
  flyerCustomBgDataUrl = "";
  const input = document.getElementById("flyerBgFileInput");
  if (input) input.value = "";
  try {
    localStorage.removeItem(FLYER_STORAGE_BG_KEY);
  } catch (e) {}
  applyFlyerVisualSettings();
  if (typeof showAdminToast === "function") {
    showAdminToast("Background dikembalikan ke template default Shinemart.", "success");
  }
}

function applyFlyerPreset(mode, pageDelta = 0, preserveTransforms = false) {
  if (!Array.isArray(liveSupabaseProducts) || liveSupabaseProducts.length === 0) {
    renderFlyerBoard();
    return;
  }

  const slotCount = getActiveLayoutSpec().slotCount;
  let pool = [];

  if (mode === "promo_mix") {
    flyerCategoryPage = 0;
    const promos = liveSupabaseProducts.filter((p) => String(p.stock || "").includes("[PROMO:"));
    const nonPromos = liveSupabaseProducts.filter((p) => !String(p.stock || "").includes("[PROMO:"));
    const sortedNonPromos = [...nonPromos].sort((a, b) => {
      const aSupa = String(a.image_url || "").includes("supabase.co") ? 0 : 1;
      const bSupa = String(b.image_url || "").includes("supabase.co") ? 0 : 1;
      return aSupa - bSupa;
    });
    pool = [...promos, ...sortedNonPromos];
  } else {
    const catVal = document.getElementById("flyerCategoryFilterSelect")?.value || "__all__";
    const filtered = catVal === "__all__"
      ? liveSupabaseProducts
      : liveSupabaseProducts.filter((p) => String(p.category || "").trim().toLowerCase() === catVal);

    const totalPages = Math.max(1, Math.ceil(filtered.length / slotCount));
    flyerCategoryPage = (flyerCategoryPage + pageDelta + totalPages) % totalPages;
    const start = flyerCategoryPage * slotCount;
    pool = filtered.slice(start, start + slotCount);

    const pageBadge = document.getElementById("flyerCategoryPageBadge");
    if (pageBadge) {
      pageBadge.textContent = `Hal ${flyerCategoryPage + 1} / ${totalPages}`;
    }
  }

  for (let i = 0; i < 20; i++) {
    if (i < slotCount) {
      flyerSlots[i] = pool[i] || null;
      if (!preserveTransforms) {
        flyerPhotoTransforms[i] = null;
      }
    }
  }
  if (!preserveTransforms) {
    saveFlyerPhotoTransforms();
  }

  renderFlyerBoard();
}

function cleanFlyerProductImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ src: "", cssCrop: false });
      return;
    }

    if (flyerCleanedImgCache.has(url)) {
      resolve({ src: flyerCleanedImgCache.get(url), cssCrop: false });
      return;
    }

    if (flyerCssCropFallbackSet.has(url)) {
      resolve({ src: url, cssCrop: true });
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          resolve({ src: url, cssCrop: false });
          return;
        }

        const workCanvas = document.createElement("canvas");
        workCanvas.width = w;
        workCanvas.height = h;
        const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        let hasCaptionBar = false;
        let barTop = h;
        const sampleXs = [
          Math.floor(w * 0.03),
          Math.floor(w * 0.15),
          Math.floor(w * 0.5),
          Math.floor(w * 0.85),
          Math.floor(w * 0.97)
        ];

        for (let y = h - 1; y >= Math.floor(h * 0.80); y--) {
          let rowNonWhite = 0;
          let bluePinkHits = 0;
          for (const x of sampleXs) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (!(r > 240 && g > 240 && b > 240)) {
              rowNonWhite++;
            }
            if ((b > 200 && g > 130 && r < 130) || (r > 200 && b > 140 && g < 160)) {
              bluePinkHits++;
            }
          }
          if (bluePinkHits >= 2) {
            hasCaptionBar = true;
            barTop = y;
          } else if (hasCaptionBar && rowNonWhite === 0) {
            break;
          }
        }

        const cropBottom = hasCaptionBar
          ? Math.min(Math.floor(h * 0.875), Math.max(Math.floor(h * 0.75), barTop - 16))
          : h;

        let minX = w, minY = cropBottom, maxX = -1, maxY = -1;
        const stepPx = Math.max(1, Math.floor(Math.min(w, cropBottom) / 250));
        for (let y = 0; y < cropBottom; y += stepPx) {
          for (let x = 0; x < w; x += stepPx) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (r < 232 || g < 232 || b < 232) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX <= minX || maxY <= minY) {
          minX = 0;
          minY = 0;
          maxX = w - 1;
          maxY = cropBottom - 1;
        } else {
          minX = Math.max(0, minX - stepPx * 2);
          minY = Math.max(0, minY - stepPx * 2);
          maxX = Math.min(w - 1, maxX + stepPx * 2);
          maxY = Math.min(cropBottom - 1, maxY + stepPx * 2);
        }

        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const outSize = 480;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = outSize;
        outCanvas.height = outSize;
        const outCtx = outCanvas.getContext("2d");
        outCtx.fillStyle = "#ffffff";
        outCtx.fillRect(0, 0, outSize, outSize);

        const padRatio = 0.92;
        const scale = Math.min((outSize * padRatio) / cw, (outSize * padRatio) / ch);
        const drawW = Math.round(cw * scale);
        const drawH = Math.round(ch * scale);
        const dx = Math.round((outSize - drawW) / 2);
        const dy = Math.round((outSize - drawH) / 2);

        outCtx.drawImage(workCanvas, minX, minY, cw, ch, dx, dy, drawW, drawH);

        const cleanedUrl = outCanvas.toDataURL("image/jpeg", 0.92);
        flyerCleanedImgCache.set(url, cleanedUrl);
        resolve({ src: cleanedUrl, cssCrop: false });
      } catch (err) {
        flyerCssCropFallbackSet.add(url);
        resolve({ src: url, cssCrop: true });
      }
    };
    img.onerror = () => {
      resolve({ src: url, cssCrop: false });
    };
    img.src = url;
  });
}

function splitFlyerProductName(rawName) {
  const cleanName = String(rawName || "").replace(/\(\*\)/g, "").trim();
  const twoWordBrands = ["kapal api", "mama lemon", "teh pucuk", "le minerale", "ayam size", "bumbu racik", "kecap bango"];
  const lower = cleanName.toLowerCase();
  const matchedTwo = twoWordBrands.find((b) => lower.startsWith(b + " "));
  if (matchedTwo) {
    return {
      brand: cleanName.slice(0, matchedTwo.length).toUpperCase(),
      desc: cleanName.slice(matchedTwo.length).trim()
    };
  }
  const spaceIdx = cleanName.indexOf(" ");
  if (spaceIdx > 0) {
    return {
      brand: cleanName.slice(0, spaceIdx).toUpperCase(),
      desc: cleanName.slice(spaceIdx + 1).trim()
    };
  }
  return { brand: cleanName.toUpperCase(), desc: "" };
}

function formatFlyerRetailPrice(num) {
  const formatted = Math.round(Number(num) || 0).toLocaleString("id-ID");
  const lastDot = formatted.lastIndexOf(".");
  if (lastDot > 0) {
    return `<span class="sm-flyer-p-main">${formatted.slice(0, lastDot)}</span><span class="sm-flyer-p-dec">${formatted.slice(lastDot)}</span>`;
  }
  return `<span class="sm-flyer-p-main">${formatted}</span>`;
}

function formatFlyerPlainNumber(num) {
  return Math.round(Number(num) || 0).toLocaleString("id-ID");
}

function buildFlyerStarburstHtml(promoDetails, slotIndex) {
  if (!promoDetails || !promoDetails.hasPromo) return "";

  const theme = FLYER_THEMES[flyerConfig.colorTheme] || FLYER_THEMES.classic;
  let fill1 = theme.star1;
  let fill2 = theme.star2;
  let stroke = theme.stroke;
  let textHtml = "";

  if (promoDetails.promoType === "b1g1") {
    fill1 = "#fbbf24";
    fill2 = "#d97706";
    stroke = "#ffffff";
    textHtml = `<span class="sm-flyer-sb-top">BELI 1</span><span class="sm-flyer-sb-big-sm">GRATIS 1</span>`;
  } else if (promoDetails.promoType === "nominal") {
    textHtml = `<span class="sm-flyer-sb-top">HEMAT</span><span class="sm-flyer-sb-big-sm">Rp ${formatFlyerPlainNumber(promoDetails.discountAmount)}</span>`;
  } else {
    const pct = Math.min(Math.max(Number(promoDetails.promoValue) || 0, 1), 99);
    textHtml = `<span class="sm-flyer-sb-top">HEMAT</span><span class="sm-flyer-sb-big">${pct}%</span>`;
  }

  const gradId = `smFlyerGrad_${slotIndex}`;
  return `
    <div class="sm-flyer-starburst">
      <svg viewBox="0 0 100 100" class="sm-flyer-sb-svg">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${fill1}"/>
            <stop offset="100%" stop-color="${fill2}"/>
          </linearGradient>
        </defs>
        <polygon points="${FLYER_STARBURST_POINTS}" fill="url(#${gradId})" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>
      <div class="sm-flyer-sb-text">${textHtml}</div>
    </div>
  `;
}

function buildFlyerCellHtml(product, slotIndex, isWide) {
  const wideCls = isWide ? "sm-flyer-card-wide" : "";
  if (!product) {
    return `
      <div class="sm-flyer-cell ${wideCls}" onclick="openFlyerSlotPicker(${slotIndex})">
        <div class="sm-flyer-empty-slot">
          <i class="fas fa-plus-circle text-sky-500 text-base"></i>
          <span>Slot #${slotIndex + 1} Kosong<br>Klik untuk pilih</span>
        </div>
      </div>
    `;
  }

  const promoInfo = typeof parsePromo === "function" ? parsePromo(product.stock) : { promo: null };
  const details = typeof getPromoDetails === "function"
    ? getPromoDetails(product.price, promoInfo.promo)
    : { hasPromo: false, promoType: "none", finalPrice: Number(product.price) || 0, originalPrice: Number(product.price) || 0, discountAmount: 0 };

  const { brand, desc } = splitFlyerProductName(product.name);
  const rawImg = typeof formatGoogleDriveImageUrl === "function"
    ? formatGoogleDriveImageUrl(product.image_url || product.imageUrl || product.image)
    : (product.image_url || "");
  const unitRaw = String(product.unit || "Pcs").trim();
  const unitLabel = unitRaw.charAt(0).toUpperCase() + unitRaw.slice(1).toLowerCase();

  const starburstHtml = buildFlyerStarburstHtml(details, slotIndex);
  const b1g1PillHtml = details.promoType === "b1g1"
    ? `<div class="sm-flyer-b1g1-pill"><span>Beli 1</span><b>Gratis 1</b></div>`
    : "";
  const oldPriceHtml = details.hasPromo && details.finalPrice < details.originalPrice
    ? `<span class="sm-flyer-old-p">${formatFlyerPlainNumber(details.originalPrice)}</span>`
    : `<span class="sm-flyer-old-p-normal">Spesial</span>`;

  const t = getFlyerSlotTransform(slotIndex);
  const selectedCls = flyerSelectedSlotIndex === slotIndex ? "is-selected" : "";
  const customBadgeHtml = isFlyerTransformCustomized(t)
    ? `<span id="smFlyerPhotoBadge_${slotIndex}" class="sm-flyer-photo-badge">${t.scale}%</span>`
    : `<span id="smFlyerPhotoBadge_${slotIndex}" class="sm-flyer-photo-badge hidden">100%</span>`;

  return `
    <div id="smFlyerCell_${slotIndex}" data-flyer-slot="${slotIndex}" data-has-product="1" ondblclick="openFlyerSlotPicker(${slotIndex})"
      class="sm-flyer-cell ${wideCls} ${selectedCls}" title="Klik untuk edit foto • Klik 2× untuk ganti produk Slot #${slotIndex + 1}">
      ${customBadgeHtml}
      <div class="sm-flyer-slot-actions">
        <button type="button" class="sm-flyer-slot-action-btn" onclick="event.stopPropagation(); openFlyerSlotPicker(${slotIndex})" title="Ganti produk Slot #${slotIndex + 1}">
          <i class="fas fa-exchange-alt"></i><span>Ganti #${slotIndex + 1}</span>
        </button>
      </div>
      <div class="sm-flyer-cell-title">
        <span class="sm-flyer-t-brand">${escapeFlyerHtml(brand)}</span>
        <span class="sm-flyer-t-desc">${escapeFlyerHtml(desc)}</span>
      </div>
      <div class="sm-flyer-cell-media">
        ${starburstHtml}
        <div id="smFlyerImgWrap_${slotIndex}" class="sm-flyer-img-transform" style="transform: ${buildFlyerTransformCss(t)};">
          <img id="smFlyerImg_${slotIndex}" data-raw-url="${escapeFlyerHtml(rawImg)}" src="${escapeFlyerHtml(rawImg)}" alt="${escapeFlyerHtml(product.name)}" draggable="false">
        </div>
        <div class="sm-flyer-direct-overlay">
          <div class="sm-flyer-crosshair-h"></div>
          <div class="sm-flyer-crosshair-v"></div>
          <span class="sm-flyer-handle" data-handle="nw" title="Tarik sudut untuk ubah ukuran"></span>
          <span class="sm-flyer-handle" data-handle="ne" title="Tarik sudut untuk ubah ukuran"></span>
          <span class="sm-flyer-handle" data-handle="sw" title="Tarik sudut untuk ubah ukuran"></span>
          <span class="sm-flyer-handle" data-handle="se" title="Tarik sudut untuk ubah ukuran"></span>
          <span id="smFlyerLiveHud_${slotIndex}" class="sm-flyer-live-hud">${t.scale}% • X:${t.x} Y:${t.y}</span>
        </div>
      </div>
      <div class="sm-flyer-cell-bottom">
        ${b1g1PillHtml}
        <div class="sm-flyer-price-box">
          <div class="sm-flyer-pb-top">
            <span>${escapeFlyerHtml(unitLabel)}</span>
            ${oldPriceHtml}
          </div>
          <div class="sm-flyer-pb-bot">
            <span class="sm-flyer-pb-rp">Rp</span>
            <div class="sm-flyer-pb-val">${formatFlyerRetailPrice(details.finalPrice)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderFlyerBoard() {
  const board = document.getElementById("smFlyerBoard");
  if (!board) return;

  const layoutSpec = getActiveLayoutSpec();
  board.className = `sm-flyer-board${layoutSpec.isCompact5 ? " is-compact-5" : ""}`;

  board.innerHTML = layoutSpec.rows.map((row) => {
    const cellsHtml = row.slots
      .map((slotIdx) => buildFlyerCellHtml(flyerSlots[slotIdx], slotIdx, layoutSpec.wideSlots.has(slotIdx)))
      .join("");
    return `<div class="${row.cls}">${cellsHtml}</div>`;
  }).join("");

  renderFlyerSlotSummaryList();
  syncFlyerInlineEditorBar();
  bindFlyerDirectCanvasEvents();

  if (flyerConfig.cleanPhotoCaption) {
    const cleanTasks = [];
    for (let i = 0; i < layoutSpec.slotCount; i++) {
      const imgEl = document.getElementById(`smFlyerImg_${i}`);
      if (!imgEl) continue;
      const rawUrl = imgEl.getAttribute("data-raw-url");
      if (!rawUrl) continue;

      cleanTasks.push(
        cleanFlyerProductImage(rawUrl).then(({ src, cssCrop }) => {
          const targetImg = document.getElementById(`smFlyerImg_${i}`);
          if (!targetImg || targetImg.getAttribute("data-raw-url") !== rawUrl) return;
          if (src) targetImg.src = src;
          targetImg.classList.toggle("sm-flyer-css-crop", !!cssCrop);
        })
      );
    }
    await Promise.all(cleanTasks);
  }
}

function renderFlyerSlotSummaryList() {
  const container = document.getElementById("flyerSlotsQuickList");
  if (!container) return;

  const layoutSpec = getActiveLayoutSpec();
  const countLabel = document.getElementById("flyerSlotCountHeading");
  if (countLabel) {
    countLabel.textContent = `Isi Produk (${layoutSpec.slotCount} Slot Flyer)`;
  }

  container.innerHTML = Array.from({ length: layoutSpec.slotCount }, (_, idx) => {
    const p = flyerSlots[idx];
    const isWide = layoutSpec.wideSlots.has(idx);
    const isSelected = flyerSelectedSlotIndex === idx;
    const label = p ? escapeFlyerHtml(p.name) : "<span class='text-slate-400 italic'>Kosong</span>";
    const t = getFlyerSlotTransform(idx);
    const isCustom = p && isFlyerTransformCustomized(t);
    const scaleTagHtml = isCustom
      ? `<span id="flyerQuickBadge_${idx}" class="px-1.5 py-0.5 rounded bg-[#0077d6] text-white text-[9px] font-black shrink-0">${t.scale}%</span>`
      : `<span id="flyerQuickBadge_${idx}" class="hidden"></span>`;
    return `
      <div class="w-full px-2 py-1.5 rounded-lg border transition flex items-center justify-between gap-1.5 text-[11px] ${isSelected ? 'border-[#0077d6] bg-sky-50 ring-1 ring-[#38b6ff]/40' : 'border-slate-200 hover:border-[#38b6ff] hover:bg-sky-50/50'}">
        <button type="button" onclick="${p ? `selectFlyerSlot(${idx}, true)` : `openFlyerSlotPicker(${idx})`}" class="flex items-center gap-1.5 min-w-0 flex-1 text-left">
          <span class="px-1.5 py-0.5 rounded font-black text-[10px] shrink-0 ${isWide ? 'bg-pink-100 text-[#e043a5]' : 'bg-sky-100 text-[#0077d6]'}">#${idx + 1}${isWide ? ' Hero' : ''}</span>
          <span class="truncate font-semibold text-slate-700">${label}</span>
          ${scaleTagHtml}
        </button>
        <button type="button" onclick="openFlyerSlotPicker(${idx})" title="Ganti produk Slot #${idx + 1}" class="p-1 text-slate-400 hover:text-[#0077d6] shrink-0">
          <i class="fas fa-pen text-[10px]"></i>
        </button>
      </div>
    `;
  }).join("");
}

function openFlyerSlotPicker(slotIndex) {
  flyerActiveSlotIndex = slotIndex;
  const modal = document.getElementById("flyerSlotPickerModal");
  const titleEl = document.getElementById("flyerSlotPickerTitle");
  const searchEl = document.getElementById("flyerSlotPickerSearch");
  const promoOnlyEl = document.getElementById("flyerSlotPickerPromoOnly");
  const layoutSpec = getActiveLayoutSpec();

  if (titleEl) {
    const isWide = layoutSpec.wideSlots.has(slotIndex);
    titleEl.textContent = `Pilih Produk untuk Slot #${slotIndex + 1}${isWide ? " (Kotak Hero Lebar)" : ""}`;
  }
  if (searchEl) searchEl.value = "";
  if (promoOnlyEl) promoOnlyEl.checked = false;

  filterFlyerSlotPicker();

  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
  setTimeout(() => searchEl?.focus(), 60);
}

function closeFlyerSlotPicker() {
  const modal = document.getElementById("flyerSlotPickerModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
  flyerActiveSlotIndex = null;
}

function filterFlyerSlotPicker() {
  const listEl = document.getElementById("flyerSlotPickerList");
  if (!listEl) return;

  const q = (document.getElementById("flyerSlotPickerSearch")?.value || "").trim().toLowerCase();
  const promoOnly = !!document.getElementById("flyerSlotPickerPromoOnly")?.checked;

  let filtered = Array.isArray(liveSupabaseProducts) ? liveSupabaseProducts : [];
  if (promoOnly) {
    filtered = filtered.filter((p) => String(p.stock || "").includes("[PROMO:"));
  }
  if (q) {
    filtered = filtered.filter((p) =>
      String(p.name || "").toLowerCase().includes(q) ||
      String(p.category || "").toLowerCase().includes(q)
    );
  }

  const shown = filtered.slice(0, 60);
  if (shown.length === 0) {
    listEl.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">Tidak ada produk yang cocok.</div>`;
    return;
  }

  listEl.innerHTML = shown.map((p) => {
    const promoInfo = typeof parsePromo === "function" ? parsePromo(p.stock) : { promo: null };
    const details = typeof getPromoDetails === "function"
      ? getPromoDetails(p.price, promoInfo.promo)
      : { hasPromo: false, finalPrice: p.price, label: "" };
    const imgUrl = typeof formatGoogleDriveImageUrl === "function"
      ? formatGoogleDriveImageUrl(p.image_url || p.imageUrl || "")
      : (p.image_url || "");
    const badgeHtml = details.hasPromo
      ? `<span class="bg-pink-100 text-[#e043a5] text-[10px] font-black px-2 py-0.5 rounded-full">${escapeFlyerHtml(details.label)}</span>`
      : "";

    return `
      <button type="button" onclick="assignProductToFlyerSlot('${escapeFlyerHtml(String(p.id))}')"
        class="w-full p-2 rounded-xl border border-slate-200 hover:border-[#38b6ff] hover:bg-sky-50/60 transition flex items-center gap-3 text-left">
        <img src="${escapeFlyerHtml(imgUrl)}" alt="" class="w-11 h-11 rounded-lg object-contain bg-white border border-slate-100 shrink-0">
        <div class="min-w-0 flex-1">
          <div class="font-bold text-slate-800 text-xs truncate">${escapeFlyerHtml(p.name)}</div>
          <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
            <span>${escapeFlyerHtml(p.category || "-")}</span>
            <span class="font-extrabold text-[#0077d6]">Rp ${formatFlyerPlainNumber(details.finalPrice)}</span>
            ${badgeHtml}
          </div>
        </div>
        <span class="px-2.5 py-1 bg-[#0077d6] text-white rounded-lg text-[10px] font-bold shrink-0">Pilih</span>
      </button>
    `;
  }).join("");
}

function assignProductToFlyerSlot(productId) {
  if (flyerActiveSlotIndex === null) return;
  const prod = liveSupabaseProducts.find((p) => String(p.id) === String(productId));
  if (!prod) return;

  const targetIdx = flyerActiveSlotIndex;
  flyerSlots[targetIdx] = prod;
  flyerPhotoTransforms[targetIdx] = null;
  flyerSelectedSlotIndex = targetIdx;
  saveFlyerPhotoTransforms();
  closeFlyerSlotPicker();
  renderFlyerBoard();
}

function clearCurrentFlyerSlot() {
  if (flyerActiveSlotIndex === null) return;
  const targetIdx = flyerActiveSlotIndex;
  flyerSlots[targetIdx] = null;
  flyerPhotoTransforms[targetIdx] = null;
  if (flyerSelectedSlotIndex === targetIdx) {
    flyerSelectedSlotIndex = null;
  }
  saveFlyerPhotoTransforms();
  closeFlyerSlotPicker();
  renderFlyerBoard();
}

/* ---------- DIRECT CANVA-STYLE PHOTO RESIZE & DRAG POSITION ---------- */
function applyLiveFlyerSlotTransform(slotIndex) {
  const t = getFlyerSlotTransform(slotIndex);
  const cssTransform = buildFlyerTransformCss(t);

  const boardWrap = document.getElementById(`smFlyerImgWrap_${slotIndex}`);
  if (boardWrap) {
    boardWrap.style.transform = cssTransform;
  }

  const badge = document.getElementById(`smFlyerPhotoBadge_${slotIndex}`);
  if (badge) {
    if (isFlyerTransformCustomized(t)) {
      badge.textContent = `${t.scale}%`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  const quickBadge = document.getElementById(`flyerQuickBadge_${slotIndex}`);
  if (quickBadge) {
    if (isFlyerTransformCustomized(t)) {
      quickBadge.textContent = `${t.scale}%`;
      quickBadge.className = "px-1.5 py-0.5 rounded bg-[#0077d6] text-white text-[9px] font-black shrink-0";
    } else {
      quickBadge.className = "hidden";
    }
  }

  const hud = document.getElementById(`smFlyerLiveHud_${slotIndex}`);
  if (hud) {
    hud.textContent = `${t.scale}% • X:${t.x > 0 ? "+" : ""}${t.x} Y:${t.y > 0 ? "+" : ""}${t.y}`;
  }
}

function syncFlyerInlineEditorBar() {
  const defaultBar = document.getElementById("flyerDefaultStageBar");
  const headerBar = document.getElementById("flyerInlineHeaderBar");
  const navActions = document.getElementById("flyerInlineNavActions");
  const editorBar = document.getElementById("flyerInlineEditorBar");

  const idx = flyerSelectedSlotIndex;
  const prod = idx !== null ? flyerSlots[idx] : null;

  if (!prod) {
    if (defaultBar) { defaultBar.classList.remove("hidden"); defaultBar.classList.add("flex"); }
    if (headerBar) { headerBar.classList.add("hidden"); headerBar.classList.remove("flex"); }
    if (navActions) { navActions.classList.add("hidden"); navActions.classList.remove("flex"); }
    if (editorBar) { editorBar.classList.add("hidden"); editorBar.classList.remove("flex"); }
    return;
  }

  if (defaultBar) { defaultBar.classList.add("hidden"); defaultBar.classList.remove("flex"); }
  if (headerBar) { headerBar.classList.remove("hidden"); headerBar.classList.add("flex"); }
  if (navActions) { navActions.classList.remove("hidden"); navActions.classList.add("flex"); }
  if (editorBar) { editorBar.classList.remove("hidden"); editorBar.classList.add("flex"); }

  const layoutSpec = getActiveLayoutSpec();
  const isWide = layoutSpec.wideSlots.has(idx);
  const badgeEl = document.getElementById("flyerInlineSlotBadge");
  const nameEl = document.getElementById("flyerInlineProductName");
  if (badgeEl) badgeEl.textContent = `#${idx + 1}${isWide ? " Hero" : ""}`;
  if (nameEl) nameEl.textContent = prod.name || `Slot #${idx + 1}`;

  const t = getFlyerSlotTransform(idx);
  const slider = document.getElementById("flyerInlineScaleInput");
  const scaleVal = document.getElementById("flyerInlineScaleVal");
  const coordVal = document.getElementById("flyerInlineCoordVal");

  if (slider) slider.value = t.scale;
  if (scaleVal) scaleVal.textContent = `${t.scale}%`;
  if (coordVal) coordVal.textContent = `X:${t.x > 0 ? "+" : ""}${t.x} Y:${t.y > 0 ? "+" : ""}${t.y}`;

  document.querySelectorAll("[data-flyer-scale-preset]").forEach((btn) => {
    const presetVal = Number(btn.getAttribute("data-flyer-scale-preset"));
    const isMatch = presetVal === t.scale;
    btn.className = isMatch
      ? "px-2 py-1 rounded-lg bg-[#0077d6] border border-[#0077d6] font-extrabold text-white transition shadow-sm"
      : "px-2 py-1 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 font-bold text-slate-600 transition";
  });
}

function selectFlyerSlot(slotIndex, scrollIntoView = false) {
  if (!flyerSlots[slotIndex]) {
    openFlyerSlotPicker(slotIndex);
    return;
  }

  const prevIdx = flyerSelectedSlotIndex;
  flyerSelectedSlotIndex = slotIndex;

  if (prevIdx !== null && prevIdx !== slotIndex) {
    const prevCell = document.getElementById(`smFlyerCell_${prevIdx}`);
    if (prevCell) prevCell.classList.remove("is-selected", "is-adjusting");
  }

  const nextCell = document.getElementById(`smFlyerCell_${slotIndex}`);
  if (nextCell) {
    nextCell.classList.add("is-selected");
    if (scrollIntoView) {
      nextCell.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  syncFlyerInlineEditorBar();
  renderFlyerSlotSummaryList();
}

function deselectFlyerSlot() {
  if (flyerSelectedSlotIndex === null) return;
  const prevCell = document.getElementById(`smFlyerCell_${flyerSelectedSlotIndex}`);
  if (prevCell) prevCell.classList.remove("is-selected", "is-adjusting");
  flyerSelectedSlotIndex = null;
  syncFlyerInlineEditorBar();
  renderFlyerSlotSummaryList();
}

function updateSelectedSlotTransform(updater, persist = true) {
  if (flyerSelectedSlotIndex === null) return;
  const idx = flyerSelectedSlotIndex;
  const current = getFlyerSlotTransform(idx);
  flyerPhotoTransforms[idx] = normalizeFlyerTransform(updater(current));
  applyLiveFlyerSlotTransform(idx);
  syncFlyerInlineEditorBar();
  if (persist) saveFlyerPhotoTransforms();
}

function handleInlineScaleSlider() {
  const scale = Number(document.getElementById("flyerInlineScaleInput")?.value) || 100;
  updateSelectedSlotTransform((t) => ({ ...t, scale }), true);
}

function setSelectedFlyerScale(scale) {
  updateSelectedSlotTransform((t) => ({ ...t, scale }), true);
}

function nudgeSelectedFlyerScale(delta) {
  updateSelectedSlotTransform((t) => ({ ...t, scale: t.scale + delta }), true);
}

function nudgeSelectedFlyerPosition(dx, dy) {
  updateSelectedSlotTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }), true);
}

function centerSelectedFlyerPosition() {
  updateSelectedSlotTransform((t) => ({ ...t, x: 0, y: 0 }), true);
}

function resetSelectedFlyerTransform() {
  if (flyerSelectedSlotIndex === null) return;
  flyerPhotoTransforms[flyerSelectedSlotIndex] = null;
  applyLiveFlyerSlotTransform(flyerSelectedSlotIndex);
  syncFlyerInlineEditorBar();
  saveFlyerPhotoTransforms();
}

function resetAllFlyerPhotoTransforms() {
  flyerPhotoTransforms = new Array(20).fill(null);
  saveFlyerPhotoTransforms();
  renderFlyerBoard();
  if (typeof showAdminToast === "function") {
    showAdminToast("Ukuran & posisi semua foto dikembalikan ke default (100%).", "success");
  }
}

function swapSelectedFlyerProduct() {
  if (flyerSelectedSlotIndex !== null) {
    openFlyerSlotPicker(flyerSelectedSlotIndex);
  }
}

function navigateSelectedFlyerSlot(step) {
  const layoutSpec = getActiveLayoutSpec();
  const slotCount = layoutSpec.slotCount;
  const baseIdx = flyerSelectedSlotIndex !== null ? flyerSelectedSlotIndex : -1;
  for (let offset = 1; offset <= slotCount; offset++) {
    const candidate = (baseIdx + step * offset + slotCount * 2) % slotCount;
    if (flyerSlots[candidate]) {
      selectFlyerSlot(candidate, true);
      return;
    }
  }
}

function bindFlyerDirectCanvasEvents() {
  if (flyerDirectEventsBound) return;
  const board = document.getElementById("smFlyerBoard");
  if (!board) return;
  flyerDirectEventsBound = true;

  board.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest(".sm-flyer-slot-actions")) return;

    const cell = e.target.closest(".sm-flyer-cell[data-has-product='1']");
    if (!cell) return;

    const slotIdx = Number(cell.getAttribute("data-flyer-slot"));
    if (Number.isNaN(slotIdx)) return;

    selectFlyerSlot(slotIdx, false);

    const handleEl = e.target.closest(".sm-flyer-handle");
    const mediaEl = cell.querySelector(".sm-flyer-cell-media");
    const previewScale = Math.max(0.3, (Number(flyerConfig.zoomPercent) || 85) / 100);

    if (handleEl && mediaEl) {
      e.preventDefault();
      e.stopPropagation();
      const rect = mediaEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startDist = Math.max(14, Math.hypot(e.clientX - cx, e.clientY - cy));
      const startScale = getFlyerSlotTransform(slotIdx).scale;
      cell.classList.add("is-adjusting");

      const onMove = (ev) => {
        const currDist = Math.max(8, Math.hypot(ev.clientX - cx, ev.clientY - cy));
        const nextScale = Math.round(startScale * (currDist / startDist));
        updateSelectedSlotTransform((t) => ({ ...t, scale: nextScale }), false);
      };

      const onUp = () => {
        cell.classList.remove("is-adjusting");
        saveFlyerPhotoTransforms();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      return;
    }

    // Pan photo inside card
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startT = getFlyerSlotTransform(slotIdx);
    let dragging = false;

    const onMove = (ev) => {
      const dxScreen = ev.clientX - startClientX;
      const dyScreen = ev.clientY - startClientY;
      if (!dragging && Math.hypot(dxScreen, dyScreen) < 4) return;
      if (!dragging) {
        dragging = true;
        cell.classList.add("is-adjusting");
      }
      const dx = Math.round(dxScreen / previewScale);
      const dy = Math.round(dyScreen / previewScale);
      updateSelectedSlotTransform((t) => ({
        ...t,
        x: startT.x + dx,
        y: startT.y + dy
      }), false);
    };

    const onUp = () => {
      if (dragging) {
        cell.classList.remove("is-adjusting");
        saveFlyerPhotoTransforms();
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  const stage = document.querySelector(".sm-flyer-preview-stage");
  if (stage) {
    stage.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".sm-flyer-cell")) {
        deselectFlyerSlot();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    const flyerSection = document.getElementById("flyerTabSection");
    if (!flyerSection || flyerSection.classList.contains("hidden")) return;
    if (flyerSelectedSlotIndex === null) return;

    const pickerModal = document.getElementById("flyerSlotPickerModal");
    if (pickerModal && !pickerModal.classList.contains("hidden")) return;

    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    const step = e.shiftKey ? 8 : 2;
    if (e.key === "ArrowLeft") { e.preventDefault(); nudgeSelectedFlyerPosition(-step, 0); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nudgeSelectedFlyerPosition(step, 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); nudgeSelectedFlyerPosition(0, -step); }
    else if (e.key === "ArrowDown") { e.preventDefault(); nudgeSelectedFlyerPosition(0, step); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); nudgeSelectedFlyerScale(10); }
    else if (e.key === "-") { e.preventDefault(); nudgeSelectedFlyerScale(-10); }
    else if (e.key === "0") { e.preventDefault(); resetSelectedFlyerTransform(); }
    else if (e.key === "Escape") { deselectFlyerSlot(); }
  });
}

function printFlyerA4() {
  const a4El = document.getElementById("smFlyerA4");
  const hadGuide = a4El && a4El.classList.contains("show-header-guide");
  const prevSelected = flyerSelectedSlotIndex;
  if (prevSelected !== null) deselectFlyerSlot();
  if (hadGuide) a4El.classList.remove("show-header-guide");

  window.print();

  if (hadGuide) {
    setTimeout(() => a4El.classList.add("show-header-guide"), 200);
  }
  if (prevSelected !== null) {
    setTimeout(() => selectFlyerSlot(prevSelected, false), 250);
  }
}

function escapeFlyerHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

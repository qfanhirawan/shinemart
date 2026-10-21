/**
 * ==============================================================================
 * SHINEMART ADMIN - LIVE ORDERS & STORE SETTINGS MODULE (admin-orders.js)
 * Modul Real-time Pesanan Masuk, Checklist Picking, dan Pengaturan Mobile App
 * ==============================================================================
 */

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
    console.warn("[WebAudio] Gagal memutar notifikasi suara:", err);
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
    if (typeof showAdminToast === "function") showAdminToast("Notifikasi suara pesanan aktif", "info");
  } else {
    if (icon) icon.className = "fas fa-volume-mute";
    if (label) label.textContent = "Suara: Mute";
    if (btn) {
      btn.className = "px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-slate-100 text-slate-500 border-slate-300";
    }
    if (typeof showAdminToast === "function") showAdminToast("Notifikasi suara pesanan dimatikan", "info");
  }
}

/**
 * Helper Format Rupiah
 */
function formatOrderRupiah(amount) {
  if (typeof formatRupiah === "function") return formatRupiah(amount);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
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
  const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : (typeof supabase !== "undefined" ? supabase : null);
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
          console.log("[Live Orders Realtime Event]:", payload);
          const indicator = document.getElementById("realtimeLiveIndicator");
          if (indicator) {
            indicator.classList.remove("bg-emerald-100", "text-emerald-800");
            indicator.classList.add("bg-pink-100", "text-pink-800");
            setTimeout(() => {
              indicator.classList.remove("bg-pink-100", "text-pink-800");
              indicator.classList.add("bg-emerald-100", "text-emerald-800");
            }, 1500);
          }

          const isPaid = (payload.new && (payload.new.status === 'PAID' || payload.new.status === 'SETTLEMENT'));
          const wasNotPaid = (!payload.old || (payload.old.status !== 'PAID' && payload.old.status !== 'SETTLEMENT'));

          if (payload.eventType === "INSERT") {
            playOrderBellSound();
            if (typeof showAdminToast === "function") {
              showAdminToast(`🔔 Pesanan Baru Masuk! #${payload.new.order_number || payload.new.id}`, "success");
            }
            await loadAdminOrdersList(true);
          } else if (payload.eventType === "UPDATE") {
            if (isPaid && wasNotPaid) {
              playOrderBellSound();
              if (typeof showAdminToast === "function") {
                showAdminToast(`⚡ Pesanan Lunas! Segera Siapkan #${payload.new.order_number || payload.new.id}`, "success");
              }
            }
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
        console.log("[Orders Realtime Channel Status]:", status);
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
    console.error("[Orders Realtime] Gagal inisialisasi:", err);
  }
}

/**
 * Muat daftar pesanan dari tabel Supabase 'orders'
 */
async function loadAdminOrdersList(silent = false) {
  const container = document.getElementById("adminOrdersContainer");
  const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : null;

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
    console.error("[Orders] Gagal mengambil daftar pesanan:", err);
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
          <span class="font-black text-sm md:text-base text-[#0077d6]">${formatOrderRupiah(order.total_amount || 0)}</span>
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
    if (typeof showAdminToast === "function") showAdminToast("Data pesanan tidak ditemukan!", "error");
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
  if (totalEl) totalEl.textContent = formatOrderRupiah(order.total_amount || 0);

  let items = order.order_items || [];
  if (items.length === 0) {
    const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : null;
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
              <span class="font-bold text-[#0077d6] bg-sky-50 px-1.5 py-0.5 rounded text-[10px]">${qty} pcs</span> &times; ${formatOrderRupiah(price)}
            </div>
          </div>
        </div>
        <div class="text-right font-black text-xs ${isChecked ? 'text-slate-400' : 'text-slate-700'}">
          ${formatOrderRupiah(subtotal)}
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
    if (typeof showAdminToast === "function") showAdminToast("Nomor WhatsApp pelanggan tidak tersedia!", "error");
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
  const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : null;
  if (!client) {
    if (typeof showAdminToast === "function") showAdminToast("Koneksi Supabase tidak tersedia!", "error");
    return;
  }

  const orderId = selectedOrderForModal.id;
  const staffName = localStorage.getItem("shinemart_admin_name") || "Admin Toko (Web)";
  try {
    const { data, error } = await client
      .from("orders")
      .update({ 
        status: newStatus, 
        updated_at: new Date().toISOString(),
        updated_by: staffName
      })
      .eq("id", orderId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error("Gagal mengupdate di Supabase: 0 baris terpengaruh (cek RLS UPDATE policy).");
    }

    if (typeof showAdminToast === "function") {
      showAdminToast(`Status pesanan berhasil diubah menjadi: ${newStatus}`, "success");
    }

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
    console.error("[Orders] Gagal mengupdate status pesanan:", err);
    if (typeof showAdminToast === "function") showAdminToast(`Gagal update status: ${err.message}`, "error");
  }
}

/**
 * Toggle Status Tayang Produk (is_active) di Aplikasi Mobile
 */
async function toggleProductActiveStatus(productId, isActive) {
  const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : null;
  if (!client) {
    if (typeof showAdminToast === "function") showAdminToast("Client Supabase belum siap!", "error");
    return;
  }

  try {
    const { error } = await client
      .from("products")
      .update({ is_active: isActive })
      .eq("id", productId);

    if (error) {
      if (error.message?.includes("is_active") || error.code === "PGRST204") {
        if (typeof showAdminToast === "function") {
          showAdminToast("Kolom is_active belum dibuat di Supabase. Jalankan script mobile_settings.sql di SQL Editor!", "error");
        }
        return;
      }
      throw error;
    }

    if (typeof liveSupabaseProducts !== "undefined") {
      const prod = liveSupabaseProducts.find(p => String(p.id) === String(productId));
      if (prod) prod.is_active = isActive;
    }

    if (typeof showAdminToast === "function") {
      showAdminToast(
        isActive 
          ? `Produk sekarang TAYANG di Mobile App` 
          : `Produk DISEMBUNYIKAN dari Mobile App`, 
        "info"
      );
    }

  } catch (err) {
    console.error("[Products] Gagal mengubah status aktif produk:", err);
    if (typeof showAdminToast === "function") showAdminToast(`Gagal: ${err.message}`, "error");
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
  const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : null;
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
    console.warn("[Store Settings] Gagal memuat:", err);
  }
}

/**
 * Simpan Pengaturan Operasional Toko ke Supabase
 */
async function saveStoreOperationalSettings() {
  const client = typeof getAdminSupabaseClient === "function" ? getAdminSupabaseClient() : null;
  if (!client) {
    if (typeof showAdminToast === "function") showAdminToast("Koneksi Supabase tidak tersedia!", "error");
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
        if (typeof showAdminToast === "function") {
          showAdminToast("Tabel store_settings belum dibuat di Supabase. Jalankan script mobile_settings.sql di SQL Editor!", "error");
        }
        return;
      }
      throw error;
    }

    liveStoreSettings = { ...liveStoreSettings, ...payload };
    updateStoreOpenStatusUI();
    if (typeof showAdminToast === "function") {
      showAdminToast("Pengaturan operasional toko berhasil disimpan!", "success");
    }

  } catch (err) {
    console.error("[Store Settings] Gagal menyimpan:", err);
    if (typeof showAdminToast === "function") showAdminToast(`Gagal menyimpan: ${err.message}`, "error");
  }
}

// Otomatis muat data pesanan & inisialisasi Realtime segera saat script dimuat
(function autoInitLiveOrders() {
  const tryInit = () => {
    if (typeof getAdminSupabaseClient === "function" && getAdminSupabaseClient()) {
      console.log("[Live Orders] Supabase Client siap, memuat data pesanan...");
      loadAdminOrdersList();
      initAdminOrdersRealtime();
      loadStoreOperationalSettings();
    } else {
      setTimeout(tryInit, 200);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInit);
  } else {
    tryInit();
  }
})();

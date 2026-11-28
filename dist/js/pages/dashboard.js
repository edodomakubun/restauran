// Modul halaman Dasbor Restoran Informatif (index.html)
import { el, formatRupiah, formatTimeShort, statusLabel, triggerMicroClass } from '../app-client.js';
import { buildSalesReport, formatDateId, toLocalDateKey } from '../sales-report.js';

const PERIOD_META = {
  daily: { label: 'Omzet Hari Ini', badge: 'Hari Ini' },
  weekly: { label: 'Omzet Minggu Ini', badge: 'Minggu Ini' },
  monthly: { label: 'Omzet Bulan Ini', badge: 'Bulan Ini' },
};

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Tunai', icon: 'bi-cash', cls: 'text-bg-success' },
  { key: 'qris', label: 'QRIS', icon: 'bi-qr-code', cls: 'text-bg-primary' },
  { key: 'transfer', label: 'Transfer', icon: 'bi-bank', cls: 'text-bg-info' },
  { key: 'debit', label: 'Debit', icon: 'bi-credit-card', cls: 'text-bg-secondary' },
];

const supportsSiblingIndex =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-delay: calc(sibling-index() * 0.1s)');

function applySiblingFallback(containerEl) {
  if (supportsSiblingIndex || !containerEl) return;
  [...containerEl.children].forEach((child, index) => {
    child.style.setProperty('--sibling-index', String(index + 1));
  });
}

function getActiveTableOrder(orders, tableNumber) {
  const num = String(tableNumber || '').trim().toLowerCase();
  if (!num) return null;
  return (
    orders.find((o) => {
      if (o.serviceType !== 'dine_in' || o.status === 'cancelled') return false;
      if (String(o.tableNumber || '').trim().toLowerCase() !== num) return false;
      return ['pending', 'cooking', 'ready'].includes(o.status) || (o.status === 'completed' && o.paymentStatus !== 'paid');
    }) || null
  );
}

export function mount(ctx) {
  const { session, signal, navigate, subscribeStore } = ctx;
  let periodMode = 'daily';
  let latestSnap = {
    orders: [],
    menu: [],
    tables: [],
    users: [],
    settings: session.settings || {},
    ordersReady: false,
    menuReady: false,
    tablesReady: false,
    usersReady: false,
  };

  if (session.user.role === 'admin') {
    const quickLinks = document.getElementById('admin-quick-links');
    if (quickLinks) quickLinks.hidden = false;
    document.getElementById('dash-manage-menu-link')?.classList.remove('d-none');
  }

  let hasOrdersRendered = false;
  let prevOrderSigs = new Map();
  let prevTopMenusSig = '';
  let prevTableChipsCount = -1;
  let prevRevenueVal = null;
  let prevOrdersTotal = null;
  let prevUnpaidVal = null;
  let prevOccTables = null;
  let pendingPeriodSwap = false;

  const pingIcon = (id) => {
    triggerMicroClass(document.getElementById(id), 'dash-icon-ping', 500);
  };

  const todayLabelEl = document.getElementById('dash-today-label');
  if (todayLabelEl) {
    todayLabelEl.textContent = formatDateId(toLocalDateKey(new Date()));
  }

  const setTextWithPop = (id, val) => {
    const node = document.getElementById(id);
    if (!node) return;
    const str = String(val);
    if (node.textContent !== str && node.textContent !== '' && node.textContent !== '0' && node.textContent !== '-') {
      triggerMicroClass(node, 'micro-pop', 260);
    }
    node.textContent = str;
  };

  const renderSettings = (s) => {
    if (!s) return;
    const setBadge = (id, allowed) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.textContent = allowed ? 'Diizinkan' : 'Dilarang';
      node.className = `badge ${allowed ? 'text-bg-success' : 'text-bg-secondary'}`;
    };
    setBadge('set-del', s.kasirCanDeleteOrder);
    setBadge('set-edit', s.kasirCanEditWhileCooking);
    setBadge('set-cancel', s.kasirCanCancelWhileCooking);
    setBadge('set-report', s.kasirCanViewReport);

    const revFooter = document.getElementById('dash-revenue-footer');
    if (revFooter) {
      const canOpenReport = session.user.role === 'admin' || Boolean(s.kasirCanViewReport);
      const nextTarget = canOpenReport ? 'report' : 'orders';
      if (revFooter.dataset.target !== nextTarget) {
        revFooter.dataset.target = nextTarget;
        revFooter.setAttribute('href', canOpenReport ? './laporan.html' : './daftar-pesanan.html');
        revFooter.replaceChildren(
          canOpenReport ? 'Buka Laporan Penjualan ' : 'Lihat Daftar Pesanan ',
          el('i', { className: 'bi bi-arrow-right ms-1' })
        );
      }
    }
  };
  renderSettings(session.settings);

  const syncPeriodButtons = () => {
    for (const btn of document.querySelectorAll('.dash-period-btn')) {
      const active = btn.dataset.period === periodMode;
      btn.className = `btn ${active ? 'btn-primary' : 'btn-outline-primary'} dash-period-btn`;
      btn.setAttribute('aria-pressed', String(active));
    }
  };

  const renderAll = () => {
    const snap = latestSnap;
    if (snap.settings) renderSettings(snap.settings);

    const orders = snap.orders || [];
    const menu = snap.menu || [];
    const tables = snap.tables || [];
    const users = snap.users || [];

    const now = new Date();
    const todayKey = toLocalDateKey(now);

    // 1. Omzet Hari Ini, Mingguan & Bulanan
    const repDaily = buildSalesReport(orders, { mode: 'daily', date: todayKey, statusScope: 'non_cancelled' });
    const repWeekly = buildSalesReport(orders, { mode: 'weekly', weekDate: todayKey, statusScope: 'non_cancelled' });
    const repMonthly = buildSalesReport(orders, {
      mode: 'monthly',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      statusScope: 'non_cancelled',
    });

    const activeRep = periodMode === 'weekly' ? repWeekly : periodMode === 'monthly' ? repMonthly : repDaily;
    const pMeta = PERIOD_META[periodMode] || PERIOD_META.daily;

    const revTotal = activeRep.summary.totalRevenue;
    setTextWithPop('stat-period-revenue', formatRupiah(revTotal));
    if ((prevRevenueVal !== null && prevRevenueVal !== revTotal) || pendingPeriodSwap) {
      pingIcon('dash-icon-revenue');
    }
    prevRevenueVal = revTotal;
    const pLabelEl = document.getElementById('stat-period-label');
    const pMetaEl = document.getElementById('stat-period-meta');
    const pCmpEl = document.getElementById('stat-omzet-compare');
    if (pLabelEl) pLabelEl.textContent = pMeta.label;
    if (pMetaEl) {
      pMetaEl.textContent = `${activeRep.summary.totalOrders} transaksi · rata-rata ${formatRupiah(activeRep.summary.avgOrderValue)}`;
    }
    if (pCmpEl) {
      if (periodMode === 'daily') {
        pCmpEl.textContent = `Minggu: ${formatRupiah(repWeekly.summary.totalRevenue)} · Bulan: ${formatRupiah(repMonthly.summary.totalRevenue)}`;
      } else if (periodMode === 'weekly') {
        pCmpEl.textContent = `Hari ini: ${formatRupiah(repDaily.summary.totalRevenue)} · Bulan: ${formatRupiah(repMonthly.summary.totalRevenue)}`;
      } else {
        pCmpEl.textContent = `Hari ini: ${formatRupiah(repDaily.summary.totalRevenue)} · Minggu: ${formatRupiah(repWeekly.summary.totalRevenue)}`;
      }
    }

    // 2. Orderan Hari Ini (Sedang Berjalan & Selesai) + Antrean Dapur Live
    const todayOrders = orders.filter((o) => {
      if (!o.createdAt) return false;
      const dt = new Date(o.createdAt);
      return Number.isFinite(dt.getTime()) && toLocalDateKey(dt) === todayKey;
    });
    const todayActiveCount = todayOrders.filter((o) => ['pending', 'cooking', 'ready'].includes(o.status)).length;
    const todayCompletedCount = todayOrders.filter((o) => o.status === 'completed').length;
    const kitchenOrdersTotal = todayActiveCount + todayCompletedCount;

    setTextWithPop('stat-today-active', todayActiveCount);
    setTextWithPop('stat-today-completed', todayCompletedCount);
    setTextWithPop('stat-pending', orders.filter((o) => o.status === 'pending').length);
    setTextWithPop('stat-cooking', orders.filter((o) => o.status === 'cooking').length);
    setTextWithPop('stat-ready', orders.filter((o) => o.status === 'ready').length);
    if (prevOrdersTotal !== null && prevOrdersTotal !== kitchenOrdersTotal) {
      pingIcon('dash-icon-orders');
    }
    prevOrdersTotal = kitchenOrdersTotal;

    // 3. Tagihan Belum Lunas
    const unpaidOrders = orders.filter((o) => o.status !== 'cancelled' && o.paymentStatus !== 'paid');
    const unpaidTotal = unpaidOrders.reduce(
      (sum, o) => sum + Math.max(0, Number(o.totalAmount || 0) - Number(o.discountAmount || 0)),
      0
    );
    setTextWithPop('stat-unpaid-amount', formatRupiah(unpaidTotal));
    if (prevUnpaidVal !== null && prevUnpaidVal !== unpaidTotal) {
      pingIcon('dash-icon-unpaid');
    }
    prevUnpaidVal = unpaidTotal;
    const unpaidCntEl = document.getElementById('stat-unpaid-count');
    if (unpaidCntEl) {
      unpaidCntEl.textContent =
        unpaidOrders.length > 0 ? `${unpaidOrders.length} pesanan menunggu pembayaran` : 'Semua pesanan aktif sudah lunas';
    }

    // 4. Okupansi Meja Live
    const enrichedTables = tables.map((t) => {
      const activeOrd = getActiveTableOrder(orders, t.number);
      const effectiveStatus = activeOrd ? 'occupied' : t.status || 'available';
      return { ...t, activeOrd, effectiveStatus };
    });
    const occCount = enrichedTables.filter((t) => t.effectiveStatus === 'occupied').length;
    const availCount = enrichedTables.filter((t) => t.effectiveStatus === 'available').length;
    const resCount = enrichedTables.filter((t) => t.effectiveStatus === 'reserved').length;

    if (!snap.tablesReady && enrichedTables.length === 0) {
      setTextWithPop('stat-tables-occupied', '- / -');
      const tblMetaEl = document.getElementById('stat-tables-meta');
      if (tblMetaEl) tblMetaEl.textContent = 'Memuat status meja...';
    } else {
      setTextWithPop('stat-tables-occupied', `${occCount} / ${enrichedTables.length}`);
      const tblMetaEl = document.getElementById('stat-tables-meta');
      if (tblMetaEl) tblMetaEl.textContent = `${availCount} tersedia · ${resCount} reserved`;
      if (prevOccTables !== null && prevOccTables !== occCount) {
        pingIcon('dash-icon-tables');
      }
      prevOccTables = occCount;
    }

    // 5. Tabel Pesanan Terbaru (Real-Time)
    const tbody = document.getElementById('recent-orders-body');
    if (tbody) {
      tbody.replaceChildren();
      if (!snap.ordersReady && orders.length === 0) {
        for (let i = 0; i < 3; i += 1) {
          tbody.appendChild(
            el('tr', { className: 'placeholder-glow' }, [
              el('td', { colSpan: 6 }, [el('span', { className: 'placeholder col-12 rounded' })]),
            ])
          );
        }
      } else if (orders.length === 0) {
        prevOrderSigs.clear();
        if (snap.ordersReady) hasOrdersRendered = true;
        tbody.appendChild(
          el('tr', {}, [
            el('td', {
              colSpan: 6,
              className: 'text-center text-secondary py-4',
              textContent: 'Belum ada pesanan masuk. Klik "Buat Pesanan" untuk memulai.',
            }),
          ])
        );
      } else {
        const nextOrderSigs = new Map();
        for (const ord of orders.slice(0, 8)) {
          const st = statusLabel(ord.status);
          const svc =
            ord.serviceType === 'dine_in' ? `Meja ${ord.tableNumber || '-'}` : 'Dibungkus';
          const totalQty = (ord.items || []).reduce((s, it) => s + Number(it.qty || 0), 0);
          const isPaid = ord.paymentStatus === 'paid';
          const netTotal = Math.max(0, Number(ord.totalAmount || 0) - Number(ord.discountAmount || 0));
          const sig = `${ord.status}|${ord.paymentStatus}|${ord.totalAmount}|${ord.discountAmount}|${ord.isEdited ? 1 : 0}|${totalQty}`;
          nextOrderSigs.set(ord.id, sig);
          let rowAnimClass = '';
          if (hasOrdersRendered) {
            if (!prevOrderSigs.has(ord.id)) {
              rowAnimClass = 'dash-row-enter';
            } else if (prevOrderSigs.get(ord.id) !== sig) {
              rowAnimClass = 'row-flash';
            }
          }

          tbody.appendChild(
            el('tr', rowAnimClass ? { className: rowAnimClass } : {}, [
              el('td', {}, [
                el('div', { className: 'fw-semibold' }, [
                  el('a', {
                    href: `./daftar-pesanan.html?open=${encodeURIComponent(ord.id)}`,
                    className: 'link-primary text-decoration-none',
                    title: 'Buka detail di Daftar Pesanan',
                    textContent: ord.orderCode || ord.id,
                  }),
                  ord.isEdited ? el('span', { className: 'badge text-bg-info ms-1', textContent: 'DIEDIT' }) : null,
                ]),
                el('div', { className: 'text-secondary small', textContent: formatTimeShort(ord.createdAt) }),
              ]),
              el('td', {}, [
                el('div', { className: 'fw-semibold', textContent: ord.customerName || 'Tamu' }),
                el('span', {
                  className: `badge ${ord.serviceType === 'dine_in' ? 'text-bg-primary' : 'text-bg-dark'}`,
                  textContent: svc,
                }),
              ]),
              el('td', { textContent: `${totalQty} item` }),
              el('td', {}, [
                el('div', { className: 'fw-semibold', textContent: formatRupiah(netTotal) }),
                ord.status !== 'cancelled'
                  ? el('span', {
                    className: `badge ${isPaid ? 'text-bg-success' : 'text-bg-warning'}`,
                    textContent: isPaid ? 'Lunas' : 'Belum Bayar',
                  })
                  : null,
              ]),
              el('td', {}, [el('span', { className: `badge ${st.badge}`, textContent: st.text })]),
              el('td', { className: 'text-end' }, [
                ord.status !== 'cancelled'
                  ? el(
                    'button',
                    {
                      type: 'button',
                      className: `btn btn-xs ${isPaid ? 'btn-outline-secondary' : 'btn-primary'}`,
                      onClick: () => navigate(`./pembayaran.html?order=${encodeURIComponent(ord.id)}`, { pushState: true }),
                    },
                    [el('i', { className: `bi ${isPaid ? 'bi-printer' : 'bi-cash-coin'} me-1` }), isPaid ? 'Struk' : 'Bayar']
                  )
                  : el('span', { className: 'text-secondary small', textContent: '-' }),
              ]),
            ])
          );
        }
        prevOrderSigs = nextOrderSigs;
        hasOrdersRendered = true;
      }
    }

    // 6. Top 5 Menu Terlaris sesuai periode terpilih
    const topBadge = document.getElementById('dash-top-period-badge');
    const payBadge = document.getElementById('dash-pay-period-badge');
    if (topBadge) topBadge.textContent = pMeta.badge;
    if (payBadge) payBadge.textContent = pMeta.badge;

    const topMenusEl = document.getElementById('dash-top-menus');
    if (topMenusEl) {
      const top5 = activeRep.menuRows.slice(0, 5);
      const topSig = `${periodMode}|${top5.map((m) => `${m.name}:${m.qty}:${Math.round(m.revenue)}`).join(',')}`;
      if (topSig !== prevTopMenusSig || pendingPeriodSwap) {
        prevTopMenusSig = topSig;
        topMenusEl.replaceChildren();
        if (top5.length === 0) {
          topMenusEl.appendChild(
            el('div', { className: 'text-secondary text-center py-3', textContent: `Belum ada penjualan menu (${pMeta.badge.toLowerCase()}).` })
          );
        } else {
          const maxQty = top5[0].qty || 1;
          top5.forEach((m, i) => {
            const ratio = Math.max(0.06, Math.min(1, m.qty / maxQty));
            topMenusEl.appendChild(
              el('div', { className: 'dash-stagger-item' }, [
                el('div', { className: 'd-flex justify-content-between align-items-center mb-1' }, [
                  el('span', { className: 'fw-semibold text-truncate pe-2', textContent: `${i + 1}. ${m.name}` }),
                  el('span', { className: 'text-secondary flex-shrink-0', textContent: `${m.qty}× · ${formatRupiah(m.revenue)}` }),
                ]),
                el('div', { className: 'report-bar-track', style: 'height: 7px;' }, [
                  el('div', { className: 'dash-bar-fill', style: `--bar-ratio: ${ratio.toFixed(3)};` }),
                ]),
              ])
            );
          });
          applySiblingFallback(topMenusEl);
        }
      }
    }

    // 7. Layanan & Metode Pembayaran sesuai periode terpilih
    const svcMixEl = document.getElementById('dash-service-mix');
    const payMixEl = document.getElementById('dash-payment-mix');
    const periodOrders = orders.filter((o) => {
      if (o.status === 'cancelled' || !o.createdAt) return false;
      const ms = new Date(o.createdAt).getTime();
      return ms >= activeRep.range.startMs && ms <= activeRep.range.endMs;
    });

    if (svcMixEl) {
      const dine = activeRep.summary.dineInCount;
      const take = activeRep.summary.takeAwayCount;
      const totalSvc = Math.max(1, dine + take);
      const dineRatio = dine + take > 0 ? Math.max(0, Math.min(1, dine / totalSvc)) : 0;
      if (svcMixEl.dataset.svcInit !== '1') {
        svcMixEl.dataset.svcInit = '1';
        svcMixEl.replaceChildren(
          el('div', { className: 'd-flex justify-content-between mb-1' }, [
            el('span', {}, [el('i', { className: 'bi bi-shop text-primary me-1' }), 'Makan di Tempat: ', el('strong', { 'data-role': 'dine', textContent: String(dine) })]),
            el('span', {}, [el('i', { className: 'bi bi-bag text-secondary me-1' }), 'Dibungkus: ', el('strong', { 'data-role': 'take', textContent: String(take) })]),
          ]),
          el('div', { className: 'report-bar-track', style: 'height: 7px;' }, [
            el('div', { className: 'dash-bar-fill', 'data-role': 'bar', style: `--bar-ratio: ${dineRatio.toFixed(3)};` }),
          ])
        );
      } else {
        const dineEl = svcMixEl.querySelector('[data-role="dine"]');
        const takeEl = svcMixEl.querySelector('[data-role="take"]');
        const barEl = svcMixEl.querySelector('[data-role="bar"]');
        if (dineEl) dineEl.textContent = String(dine);
        if (takeEl) takeEl.textContent = String(take);
        if (barEl) barEl.style.setProperty('--bar-ratio', dineRatio.toFixed(3));
      }
    }

    if (payMixEl) {
      payMixEl.replaceChildren();
      const paidInPeriod = periodOrders.filter((o) => o.paymentStatus === 'paid');
      const unpaidInPeriod = periodOrders.filter((o) => o.paymentStatus !== 'paid');
      const rows = PAYMENT_METHODS.map((pm) => {
        const matched = paidInPeriod.filter((o) => (o.paymentMethod || 'cash') === pm.key);
        const amt = matched.reduce((s, o) => s + Math.max(0, Number(o.totalAmount || 0) - Number(o.discountAmount || 0)), 0);
        return { ...pm, count: matched.length, amount: amt };
      });
      for (const r of rows) {
        payMixEl.appendChild(
          el('div', { className: 'd-flex justify-content-between align-items-center py-1 dash-stagger-item' }, [
            el('span', {}, [el('i', { className: `bi ${r.icon} me-1 text-secondary` }), `${r.label} (${r.count})`]),
            el('span', { className: 'fw-semibold', textContent: formatRupiah(r.amount) }),
          ])
        );
      }
      const periodDiscount = paidInPeriod.reduce((s, o) => s + Number(o.discountAmount || 0), 0);
      if (periodDiscount > 0) {
        payMixEl.appendChild(
          el('div', { className: 'd-flex justify-content-between align-items-center pt-1 mt-1 border-top text-secondary dash-stagger-item' }, [
            el('span', {}, [el('i', { className: 'bi bi-tag me-1' }), 'Diskon Transaksi Lunas']),
            el('span', { className: 'fw-semibold', textContent: `-${formatRupiah(periodDiscount)}` }),
          ])
        );
      }
      if (unpaidInPeriod.length > 0) {
        const unpAmt = unpaidInPeriod.reduce((s, o) => s + Math.max(0, Number(o.totalAmount || 0) - Number(o.discountAmount || 0)), 0);
        payMixEl.appendChild(
          el('div', { className: 'd-flex justify-content-between align-items-center pt-1 mt-1 border-top text-warning-emphasis dash-stagger-item' }, [
            el('span', {}, [el('i', { className: 'bi bi-hourglass-split me-1' }), `Belum Bayar (${unpaidInPeriod.length})`]),
            el('span', { className: 'fw-semibold', textContent: formatRupiah(unpAmt) }),
          ])
        );
      }
      applySiblingFallback(payMixEl);
    }

    // 8. Pantauan Meja, Menu Habis & Staf Aktif
    const chipsEl = document.getElementById('dash-table-chips');
    if (chipsEl) {
      chipsEl.replaceChildren();
      if (!snap.tablesReady && enrichedTables.length === 0) {
        chipsEl.appendChild(el('span', { className: 'text-secondary', textContent: 'Memuat data meja...' }));
      } else if (enrichedTables.length === 0) {
        prevTableChipsCount = 0;
        chipsEl.appendChild(el('span', { className: 'text-secondary', textContent: 'Belum ada data meja.' }));
      } else {
        const shouldEnterChips = enrichedTables.length !== prevTableChipsCount;
        prevTableChipsCount = enrichedTables.length;
        for (const t of enrichedTables) {
          const badgeCls =
            t.effectiveStatus === 'occupied'
              ? 'text-bg-primary'
              : t.effectiveStatus === 'reserved'
                ? 'text-bg-warning'
                : t.effectiveStatus === 'cleaning'
                  ? 'text-bg-secondary'
                  : 'text-bg-success';
          chipsEl.appendChild(
            el(
              'a',
              {
                href: './meja.html',
                className: `dash-table-chip badge ${badgeCls}${shouldEnterChips ? ' dash-chip-enter' : ''}`,
                title: `Meja ${t.number} (${t.area})`,
                textContent: t.number,
              }
            )
          );
        }
        if (shouldEnterChips) {
          applySiblingFallback(chipsEl);
        }
      }
    }

    const menuHealthEl = document.getElementById('dash-menu-health');
    if (menuHealthEl) {
      if (!snap.menuReady && menu.length === 0) {
        menuHealthEl.replaceChildren(el('div', { className: 'text-secondary small', textContent: 'Memuat ketersediaan menu...' }));
      } else {
        const availMenus = menu.filter((m) => m.isAvailable !== false).length;
        const soldOut = menu.filter((m) => m.isAvailable === false);
        menuHealthEl.replaceChildren(
          el('div', { className: 'd-flex flex-wrap gap-1 mb-1' }, [
            el('span', { className: 'badge text-bg-success', textContent: `${availMenus} Tersedia` }),
            el('span', { className: `badge ${soldOut.length > 0 ? 'text-bg-danger' : 'text-bg-secondary'}`, textContent: `${soldOut.length} Habis` }),
          ]),
          soldOut.length > 0
            ? el('div', {
              className: 'text-danger small',
              textContent: `Habis: ${soldOut.slice(0, 4).map((m) => m.name).join(', ')}${soldOut.length > 4 ? ` (+${soldOut.length - 4} lainnya)` : ''}`,
            })
            : el('div', { className: 'text-secondary small', textContent: 'Semua menu tersedia.' })
        );
      }
    }

    const staffWrap = document.getElementById('dash-staff-wrap');
    const staffEl = document.getElementById('dash-staff-summary');
    if (staffWrap && staffEl && session.user.role === 'admin' && users.length > 0) {
      staffWrap.hidden = false;
      const activeUsers = users.filter((u) => u.isActive !== false);
      const cntAdmin = activeUsers.filter((u) => u.role === 'admin').length;
      const cntKasir = activeUsers.filter((u) => u.role === 'kasir').length;
      const cntChef = activeUsers.filter((u) => u.role === 'chef').length;
      staffEl.replaceChildren(
        el('span', { className: 'badge text-bg-danger', textContent: `Admin: ${cntAdmin}` }),
        el('span', { className: 'badge text-bg-primary', textContent: `Kasir: ${cntKasir}` }),
        el('span', { className: 'badge text-bg-warning', textContent: `Chef: ${cntChef}` })
      );
    } else if (staffWrap) {
      staffWrap.hidden = true;
    }
    pendingPeriodSwap = false;
  };

  for (const btn of document.querySelectorAll('.dash-period-btn')) {
    btn.addEventListener(
      'click',
      () => {
        const nextPeriod = btn.dataset.period || 'daily';
        if (nextPeriod === periodMode) return;
        periodMode = nextPeriod;
        pendingPeriodSwap = true;
        syncPeriodButtons();
        renderAll();
        triggerMicroClass(document.getElementById('stat-period-label'), 'dash-period-swap', 240);
        triggerMicroClass(document.getElementById('dash-top-menus'), 'dash-period-swap', 240);
        triggerMicroClass(document.getElementById('dash-payment-mix'), 'dash-period-swap', 240);
      },
      { signal }
    );
  }

  subscribeStore((snap) => {
    latestSnap = snap;
    renderAll();
  });
}

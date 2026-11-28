// Modul halaman Daftar Pesanan Real-Time (daftar-pesanan.html - Admin & Kasir)
import {
  apiFetch,
  applyOptimisticOrderDelete,
  applyOptimisticOrderPatch,
  el,
  formatOrderDateTimeDetail,
  formatRupiah,
  formatTimeShort,
  showToast,
  statusLabel,
  triggerMicroClass,
} from '../app-client.js';
import { getPeriodRange, toLocalDateKey } from '../sales-report.js';

function formatCookingTimer(startIso, endIso = null) {
  if (!startIso) return '00:00';
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return '00:00';
  const endMs = endIso ? new Date(endIso).getTime() : Date.now();
  const totalSec = Math.max(0, Math.floor(((Number.isFinite(endMs) ? endMs : Date.now()) - startMs) / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${String(hrs).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

function getSectionStatuses(ord) {
  const items = Array.isArray(ord?.items) ? ord.items : [];
  const hasFood = items.some((i) => i.category === 'makanan');
  const hasDrink = items.some((i) => i.category === 'minuman');
  const fallback = ord?.status || 'pending';
  return {
    hasFood,
    hasDrink,
    foodStatus: !hasFood ? 'none' : ord?.foodStatus || fallback,
    drinkStatus: !hasDrink ? 'none' : ord?.drinkStatus || fallback,
  };
}

function kasirOrderPriorityRank(ord) {
  if (ord.status === 'completed') return 0;
  if (ord.status === 'ready') return 1;
  const sec = getSectionStatuses(ord);
  if (sec.foodStatus === 'ready' || sec.drinkStatus === 'ready') return 2;
  if (ord.status === 'cooking') return 3;
  if (ord.status === 'pending') return 4;
  return 5;
}

function sortKasirOrders(list) {
  return list.toSorted((a, b) => {
    const rankDiff = kasirOrderPriorityRank(a) - kasirOrderPriorityRank(b);
    if (rankDiff !== 0) return rankDiff;
    const tA = a.updatedAt || a.createdAt || '';
    const tB = b.updatedAt || b.createdAt || '';
    return tB.localeCompare(tA);
  });
}

const STATUS_VIEW_META = {
  all: {
    title: 'Semua Pesanan',
    hint: 'Menampilkan seluruh pesanan (selesai & siap disajikan di urutan teratas).',
    icon: 'bi-list-check',
    cls: 'bg-body text-body',
    empty: 'Belum ada pesanan masuk.',
  },
  pending: {
    title: 'Pesanan Menunggu',
    hint: 'Pesanan baru yang belum mulai dimasak oleh dapur.',
    icon: 'bi-hourglass-split text-warning',
    cls: 'bg-warning-subtle text-emphasis',
    empty: 'Tidak ada pesanan yang sedang menunggu.',
  },
  cooking: {
    title: 'Sedang Dimasak',
    hint: 'Pesanan sedang diproses oleh Chef / Barista di dapur.',
    icon: 'bi-fire text-primary',
    cls: 'bg-primary-subtle text-emphasis',
    empty: 'Tidak ada pesanan yang sedang dimasak.',
  },
  ready: {
    title: 'Siap Disajikan',
    hint: 'Pesanan sudah siap — klik Selesai setelah diambil atau diantar ke meja.',
    icon: 'bi-check2-circle text-success',
    cls: 'bg-success-subtle text-emphasis',
    empty: 'Tidak ada pesanan yang siap disajikan.',
  },
  completed: {
    title: 'Pesanan Selesai',
    hint: 'Pesanan yang sudah selesai disajikan atau diambil pembeli.',
    icon: 'bi-check2-all text-secondary',
    cls: 'bg-body-secondary text-body',
    empty: 'Belum ada pesanan berstatus selesai.',
  },
  cancelled: {
    title: 'Pesanan Dibatalkan',
    hint: 'Riwayat pesanan yang dibatalkan beserta alasannya.',
    icon: 'bi-x-circle text-danger',
    cls: 'bg-danger-subtle text-emphasis',
    empty: 'Tidak ada pesanan yang dibatalkan.',
  },
};

export function mount(ctx) {
  const { session, signal, navigate, subscribeStore } = ctx;
  let ordersList = [];
  let ordersReady = false;
  let settings = session.settings || {};
  let ordersStatusFilter = 'all';
  let ordersPeriodFilter = 'all';
  const expandedOrderIds = new Set();
  const initialOpenId = new URLSearchParams(globalThis.location.search).get('open');
  let handledOpenParam = false;

  const runOrderGridTransition = (fn) => {
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && typeof document.startViewTransition === 'function') {
      return document.startViewTransition(fn);
    }
    fn();
    return null;
  };

  const scrollExpandedCardIntoView = (orderId) => {
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const grid = document.getElementById('orders-grid');
    if (!grid) return;
    const cardEl = Array.from(grid.querySelectorAll('.order-grid-card.is-expanded')).find(
      (node) => node.dataset.orderId === String(orderId)
    );
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    const vh = globalThis.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= 12 && rect.bottom <= vh - 12) return;
    const block = rect.height > vh - 24 ? 'start' : 'nearest';
    cardEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block, inline: 'nearest' });
  };

  const toggleOrderExpand = (orderId) => {
    const willExpand = !expandedOrderIds.has(orderId);
    const transition = runOrderGridTransition(() => {
      if (expandedOrderIds.has(orderId)) expandedOrderIds.delete(orderId);
      else expandedOrderIds.add(orderId);
      renderOrdersTable();
    });
    if (willExpand) {
      const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const scheduleScroll = () => setTimeout(() => scrollExpandedCardIntoView(orderId), reduceMotion ? 0 : 260);
      if (transition && transition.finished && typeof transition.finished.then === 'function') {
        transition.finished.then(scheduleScroll, scheduleScroll);
      } else {
        scheduleScroll();
      }
    }
  };

  document.addEventListener(
    'click',
    (e) => {
      if (expandedOrderIds.size === 0) return;
      if (e.target instanceof Element && e.target.closest('.order-grid-card, .modal, .modal-backdrop')) {
        return;
      }
      runOrderGridTransition(() => {
        expandedOrderIds.clear();
        renderOrdersTable();
      });
    },
    { signal }
  );

  for (const mId of ['cancelModal', 'deleteModal']) {
    const mEl = document.getElementById(mId);
    mEl?.addEventListener(
      'hide.bs.modal',
      () => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && mEl.contains(active)) {
          active.blur();
        }
      },
      { signal }
    );
  }
  let pendingCancelOrder = null;
  let pendingDeleteOrder = null;

  const cancelModalEl = document.getElementById('cancelModal');
  const deleteModalEl = document.getElementById('deleteModal');
  const cancelModal = cancelModalEl ? new globalThis.bootstrap.Modal(cancelModalEl) : null;
  const deleteModal = deleteModalEl ? new globalThis.bootstrap.Modal(deleteModalEl) : null;

  const canKasirEdit = (ord) => {
    if (session.user.role === 'admin') return ord.status !== 'cancelled' && ord.status !== 'completed';
    if (ord.status === 'pending') return true;
    if (ord.status === 'cooking') return Boolean(settings.kasirCanEditWhileCooking);
    return false;
  };

  const canKasirCancel = (ord) => {
    if (ord.status === 'cancelled' || ord.status === 'completed') return false;
    if (session.user.role === 'admin') return ord.status !== 'ready';
    if (ord.status === 'pending') return true;
    if (ord.status === 'cooking') return Boolean(settings.kasirCanCancelWhileCooking);
    return false;
  };

  const canKasirDelete = () => session.user.role === 'admin' || Boolean(settings.kasirCanDeleteOrder);

  const kasirInFlight = new Set();
  const completeSectionOrOrder = async (ord, section, triggerBtn) => {
    const lockKey = `${ord.id}:${section}`;
    if (kasirInFlight.has(lockKey)) return;
    kasirInFlight.add(lockKey);
    if (triggerBtn) triggerBtn.disabled = true;

    const op = applyOptimisticOrderPatch(ord.id, (copy) => {
      if (section === 'all') {
        copy.status = 'completed';
        if (copy.foodStatus && copy.foodStatus !== 'none') copy.foodStatus = 'completed';
        if (copy.drinkStatus && copy.drinkStatus !== 'none') copy.drinkStatus = 'completed';
        if (Array.isArray(copy.items)) {
          copy.items = copy.items.map((it) => ({ ...it, itemStatus: 'completed' }));
        }
      } else if (section === 'food') {
        copy.foodStatus = 'completed';
        if (Array.isArray(copy.items)) {
          copy.items = copy.items.map((it) => (it.category === 'makanan' ? { ...it, itemStatus: 'completed' } : it));
        }
        if (copy.drinkStatus === 'none' || copy.drinkStatus === 'completed') copy.status = 'completed';
      } else if (section === 'drink') {
        copy.drinkStatus = 'completed';
        if (Array.isArray(copy.items)) {
          copy.items = copy.items.map((it) => (it.category === 'minuman' ? { ...it, itemStatus: 'completed' } : it));
        }
        if (copy.foodStatus === 'none' || copy.foodStatus === 'completed') copy.status = 'completed';
      }
      return copy;
    });

    try {
      const res = await apiFetch(`/api/orders/${ord.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', section }),
      });
      op.commit(res?.order);
      const label = section === 'food' ? 'Makanan ' : section === 'drink' ? 'Minuman ' : 'Pesanan ';
      showToast(`${label}${ord.orderCode} ditandai selesai.`, 'success');
    } catch (err) {
      op.rollback();
      showToast(err.message, 'danger');
    } finally {
      kasirInFlight.delete(lockKey);
    }
  };

  const buildActions = (ord) => {
    const actions = [];
    const sec = getSectionStatuses(ord);
    if (ord.status === 'ready') {
      actions.push(
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn-sm btn-success',
            title: 'Tandai pesanan selesai diambil/disajikan',
            onClick: (e) => completeSectionOrOrder(ord, 'all', e.currentTarget),
          },
          [el('i', { className: 'bi bi-check2-all me-1' }), 'Selesai']
        )
      );
    } else {
      if (sec.foodStatus === 'ready') {
        actions.push(
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-sm btn-outline-success',
              title: 'Tandai bagian Makanan selesai diambil',
              onClick: (e) => completeSectionOrOrder(ord, 'food', e.currentTarget),
            },
            [el('i', { className: 'bi bi-check2 me-1' }), 'Mkn Selesai']
          )
        );
      }
      if (sec.drinkStatus === 'ready') {
        actions.push(
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-sm btn-outline-success',
              title: 'Tandai bagian Minuman selesai diambil',
              onClick: (e) => completeSectionOrOrder(ord, 'drink', e.currentTarget),
            },
            [el('i', { className: 'bi bi-check2 me-1' }), 'Mnm Selesai']
          )
        );
      }
    }

    if (ord.status !== 'cancelled') {
      const isPaid = ord.paymentStatus === 'paid';
      actions.push(
        el(
          'button',
          {
            type: 'button',
            className: `btn btn-sm ${isPaid ? 'btn-outline-secondary' : 'btn-primary'}`,
            title: isPaid ? 'Lihat & cetak struk pembayaran' : 'Proses pembayaran & cetak struk',
            onClick: () => navigate(`./pembayaran.html?order=${encodeURIComponent(ord.id)}`, { pushState: true }),
          },
          [el('i', { className: `bi ${isPaid ? 'bi-printer' : 'bi-cash-coin'} me-1` }), isPaid ? 'Struk' : 'Bayar']
        )
      );
    }

    if (canKasirEdit(ord)) {
      actions.push(
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn-sm btn-outline-primary',
            onClick: () => navigate(`./pesanan.html?edit=${encodeURIComponent(ord.id)}`, { pushState: true }),
          },
          [el('i', { className: 'bi bi-pencil me-1' }), 'Edit']
        )
      );
    }

    if (canKasirCancel(ord)) {
      actions.push(
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn-sm btn-outline-warning',
            onClick: () => {
              pendingCancelOrder = ord;
              document.getElementById('cancel-modal-code').textContent = ord.orderCode;
              document.getElementById('cancel-reason-input').value = '';
              cancelModal?.show();
            },
          },
          [el('i', { className: 'bi bi-x-circle me-1' }), 'Batal']
        )
      );
    }

    if (canKasirDelete()) {
      actions.push(
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn-sm btn-outline-danger',
            onClick: () => {
              pendingDeleteOrder = ord;
              document.getElementById('delete-modal-code').textContent = ord.orderCode;
              deleteModal?.show();
            },
          },
          [el('i', { className: 'bi bi-trash me-1' }), 'Hapus']
        )
      );
    } else {
      actions.push(
        el(
          'span',
          {
            className: 'badge text-bg-light text-secondary border align-self-center',
            title: 'Izin hapus permanen untuk Kasir belum diaktifkan di Pengaturan Admin',
          },
          [el('i', { className: 'bi bi-lock-fill me-1' }), 'Hapus (Izin Admin)']
        )
      );
    }
    return actions;
  };

  const initPeriodInputs = () => {
    const now = new Date();
    const todayKey = toLocalDateKey(now);
    const monthEl = document.getElementById('orders-month-select');
    const yearEl = document.getElementById('orders-year-input');
    const fromEl = document.getElementById('orders-date-from');
    const toEl = document.getElementById('orders-date-to');
    if (monthEl && !monthEl.dataset.init) {
      monthEl.value = String(now.getMonth() + 1);
      monthEl.dataset.init = '1';
    }
    if (yearEl && !yearEl.value) yearEl.value = String(now.getFullYear());
    if (fromEl && !fromEl.value) fromEl.value = todayKey;
    if (toEl && !toEl.value) toEl.value = todayKey;
  };
  initPeriodInputs();

  const filterOrdersByPeriod = (list, period) => {
    if (!period || period === 'all') return list;
    const now = new Date();
    const todayKey = toLocalDateKey(now);
    const monthVal = Number(document.getElementById('orders-month-select')?.value) || now.getMonth() + 1;
    const yearVal = Number(document.getElementById('orders-year-input')?.value) || now.getFullYear();
    const startDateVal = document.getElementById('orders-date-from')?.value || todayKey;
    const endDateVal = document.getElementById('orders-date-to')?.value || startDateVal;
    const range = getPeriodRange({
      mode: period,
      date: todayKey,
      weekDate: todayKey,
      month: monthVal,
      year: yearVal,
      startDate: startDateVal,
      endDate: endDateVal,
    });
    return list.filter((o) => {
      if (!o.createdAt) return false;
      const ms = new Date(o.createdAt).getTime();
      return Number.isFinite(ms) && ms >= range.startMs && ms <= range.endMs;
    });
  };

  const renderOrdersTable = () => {
    const countBadge = document.getElementById('orders-count-badge');
    const readyBadge = document.getElementById('orders-ready-badge');
    const periodOrders = filterOrdersByPeriod(ordersList, ordersPeriodFilter);

    const monthWrap = document.getElementById('orders-month-wrap');
    const calWrap = document.getElementById('orders-calendar-wrap');
    monthWrap?.classList.toggle('d-none', ordersPeriodFilter !== 'monthly');
    calWrap?.classList.toggle('d-none', ordersPeriodFilter !== 'range');

    for (const pBtn of document.querySelectorAll('.orders-period-btn')) {
      const pKey = pBtn.dataset.period || 'all';
      const active = pKey === ordersPeriodFilter;
      pBtn.className = `btn ${active ? 'btn-primary' : 'btn-outline-primary'} orders-period-btn`;
      pBtn.setAttribute('aria-pressed', String(active));
    }

    const statusCounts = {
      all: periodOrders.length,
      pending: 0,
      cooking: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const o of periodOrders) {
      if (statusCounts[o.status] !== undefined) statusCounts[o.status] += 1;
    }

    if (countBadge) countBadge.textContent = String(statusCounts.all);
    if (readyBadge) {
      const nextText = `${statusCounts.ready} Siap`;
      const changed = readyBadge.textContent !== nextText && statusCounts.ready > 0;
      readyBadge.textContent = nextText;
      readyBadge.classList.toggle('d-none', statusCounts.ready === 0);
      if (changed) triggerMicroClass(readyBadge, 'micro-pop', 260);
    }

    for (const btn of document.querySelectorAll('.orders-status-btn')) {
      const stKey = btn.dataset.status || 'all';
      const variant = btn.dataset.variant || 'primary';
      const isActive = stKey === ordersStatusFilter;
      btn.className = `btn btn-sm ${isActive ? `btn-${variant}` : `btn-outline-${variant}`} orders-status-btn`;
      btn.setAttribute('aria-pressed', String(isActive));
      const cntEl = btn.querySelector('[data-status-count]');
      if (cntEl) {
        cntEl.textContent = String(statusCounts[stKey] ?? 0);
        cntEl.className = isActive
          ? 'badge text-bg-light text-dark ms-1'
          : `badge text-bg-${variant === 'primary' && stKey === 'all' ? 'secondary' : variant} ms-1`;
      }
    }

    const grid = document.getElementById('orders-grid');
    const viewHeaderEl = document.getElementById('orders-status-view-header');
    if (!grid) return;
    grid.replaceChildren();

    if (!ordersReady && ordersList.length === 0) {
      if (viewHeaderEl) viewHeaderEl.textContent = 'Memuat daftar pesanan...';
      grid.appendChild(
        el('div', { className: 'card border placeholder-glow mb-0', style: 'grid-column: 1 / -1;' }, [
          el('div', { className: 'card-body p-2' }, [el('span', { className: 'placeholder col-10 rounded' })]),
        ])
      );
      return;
    }

    const statusFilter = ordersStatusFilter || 'all';
    const q = (document.getElementById('orders-search')?.value || '').trim().toLowerCase();

    const filtered = sortKasirOrders(
      periodOrders.filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        if (q) {
          const hay = `${o.orderCode} ${o.customerName} ${o.tableNumber}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
    );

    const viewMeta = STATUS_VIEW_META[statusFilter] || STATUS_VIEW_META.all;
    if (viewHeaderEl) {
      viewHeaderEl.className = `px-2 px-md-3 py-2 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2 small ${viewMeta.cls}`;
      viewHeaderEl.replaceChildren(
        el('div', { className: 'd-flex align-items-center gap-2 fw-semibold' }, [
          el('i', { className: `bi ${viewMeta.icon}` }),
          `${viewMeta.title} (${filtered.length})`,
        ]),
        el('span', { className: 'text-secondary', textContent: viewMeta.hint })
      );
    }

    if (filtered.length === 0) {
      const emptyMsg = q ? 'Tidak ada pesanan yang cocok dengan pencarian.' : viewMeta.empty;
      grid.appendChild(
        el('div', {
          className: 'text-center text-secondary py-4 small',
          style: 'grid-column: 1 / -1;',
          textContent: emptyMsg,
        })
      );
      return;
    }

    filtered.forEach((ord, idx) => {
      const st = statusLabel(ord.status);
      const isExpanded = expandedOrderIds.has(ord.id);
      const tableText =
        ord.serviceType === 'dine_in' ? `Meja ${ord.tableNumber || '-'}` : 'Dibungkus';
      const safeTransitionName = `order-card-${String(ord.id || idx).replace(/[^a-zA-Z0-9_-]/g, '')}`;

      const cookStartIso = ord.cookingStartedAt || ord.updatedAt || ord.createdAt;
      const isCookingNow = ord.status === 'cooking';
      const hasFinishedCookTime = (ord.status === 'ready' || ord.status === 'completed') && Boolean(ord.cookingStartedAt && ord.readyAt);

      const detailSection = isExpanded
        ? el('div', { className: 'order-card-detail mt-2 pt-2 border-top small' }, [
            el('div', { className: 'mb-2' }, [
              el('div', { className: 'fw-semibold text-body' }, [
                el('i', { className: 'bi bi-person me-1 text-secondary' }),
                `Pembeli: ${ord.customerName || 'Tamu'}`,
              ]),
              el('div', { className: 'text-secondary mt-1' }, [
                el('i', { className: 'bi bi-calendar-event me-1' }),
                formatOrderDateTimeDetail(ord.createdAt),
              ]),
              isCookingNow
                ? el('div', { className: 'text-primary fw-semibold mt-1' }, [
                    el('i', { className: 'bi bi-stopwatch me-1' }),
                    'Durasi masak: ',
                    el('span', {
                      className: 'font-monospace',
                      'data-cooking-start': cookStartIso,
                      textContent: formatCookingTimer(cookStartIso),
                    }),
                  ])
                : hasFinishedCookTime
                  ? el('div', { className: 'text-success mt-1' }, [
                      el('i', { className: 'bi bi-stopwatch me-1' }),
                      `Lama dimasak: ${formatCookingTimer(ord.cookingStartedAt, ord.readyAt)}`,
                    ])
                  : null,
            ]),
            ord.notes
              ? el('div', { className: 'alert alert-light border py-1 px-2 mb-2', textContent: `Catatan: ${ord.notes}` })
              : null,
            ord.status === 'cancelled' && ord.cancelReason
              ? el('div', { className: 'alert alert-danger py-1 px-2 mb-2', textContent: `Alasan batal: ${ord.cancelReason}` })
              : null,
            el(
              'div',
              { className: 'list-group mb-2' },
              (ord.items || []).map((it) =>
                el('div', { className: 'list-group-item py-1 px-2 d-flex justify-content-between align-items-start gap-2' }, [
                  el('div', { className: 'min-w-0' }, [
                    el('div', { className: 'fw-semibold text-break' }, [
                      el('span', {
                        className: `badge ${it.category === 'makanan' ? 'text-bg-warning' : 'text-bg-info'} me-1`,
                        textContent: `${it.qty}×`,
                      }),
                      it.name,
                      it.itemStatus === 'ready' && ord.status !== 'ready' && ord.status !== 'completed'
                        ? el('span', { className: 'badge text-bg-success ms-1', textContent: 'Siap' })
                        : null,
                      it.itemStatus === 'completed' && ord.status !== 'completed'
                        ? el('span', { className: 'badge text-bg-secondary ms-1', textContent: 'Diambil' })
                        : null,
                    ]),
                    it.note ? el('div', { className: 'text-secondary fst-italic', textContent: `Catatan: ${it.note}` }) : null,
                  ]),
                  el('span', {
                    className: 'text-secondary text-nowrap fw-semibold',
                    textContent: Number(it.price) > 0 ? formatRupiah(Number(it.price) * Number(it.qty || 1)) : '-',
                  }),
                ])
              )
            ),
            el('div', { className: 'd-flex justify-content-between align-items-center mb-2' }, [
              el('span', { className: 'text-secondary fw-semibold', textContent: 'Total Pesanan' }),
              el('span', { className: 'fw-bold text-primary fs-6', textContent: formatRupiah(ord.totalAmount) }),
            ]),
            el('div', { className: 'd-flex flex-wrap gap-1 pt-2 border-top' }, buildActions(ord)),
          ])
        : null;

      grid.appendChild(
        el(
          'div',
          {
            role: 'button',
            tabIndex: 0,
            'aria-expanded': String(isExpanded),
            'data-order-id': String(ord.id || ''),
            className: `order-grid-card order-status-${ord.status || 'pending'}${isExpanded ? ' is-expanded' : ''}`,
            style: `view-transition-name: ${safeTransitionName};`,
            title: isExpanded ? 'Klik area kartu untuk menciutkan' : 'Klik untuk memperluas detail pesanan',
            onClick: (e) => {
              if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return;
              toggleOrderExpand(ord.id);
            },
            onKeyDown: (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleOrderExpand(ord.id);
              }
            },
          },
          [
            el('div', { className: 'd-flex justify-content-between align-items-start gap-1' }, [
              el('div', { className: 'fw-bold text-break text-body d-flex flex-wrap align-items-center gap-1' }, [
                el('span', { className: 'badge text-bg-light text-secondary border', textContent: `#${idx + 1}` }),
                el('span', { textContent: ord.orderCode || ord.id }),
                ord.isEdited ? el('span', { className: 'badge text-bg-info', textContent: 'DIEDIT' }) : null,
              ]),
              isExpanded
                ? el('i', { className: 'bi bi-arrows-angle-contract text-secondary small flex-shrink-0', title: 'Ciutkan kartu' })
                : null,
            ]),
            el('div', { className: 'small text-secondary mt-1', textContent: `${tableText} · ${ord.customerName || 'Tamu'}` }),
            el('div', { className: 'd-flex flex-wrap gap-1 mt-2' }, [
              el('span', { className: `badge ${st.badge}`, textContent: st.text }),
              isCookingNow
                ? el('span', {
                    className: 'badge text-bg-light text-primary border border-primary-subtle font-monospace',
                    title: 'Durasi memasak berjalan',
                  }, [
                    el('i', { className: 'bi bi-stopwatch me-1' }),
                    el('span', {
                      'data-cooking-start': cookStartIso,
                      textContent: formatCookingTimer(cookStartIso),
                    }),
                  ])
                : null,
              ord.status !== 'cancelled'
                ? el('span', {
                    className: `badge ${ord.paymentStatus === 'paid' ? 'text-bg-success' : 'text-bg-warning'}`,
                    textContent: ord.paymentStatus === 'paid' ? 'Lunas' : 'Belum Bayar',
                  })
                : null,
            ]),
            detailSection,
          ]
        )
      );
    });
  };

  for (const btn of document.querySelectorAll('.orders-status-btn')) {
    btn.addEventListener(
      'click',
      () => {
        ordersStatusFilter = btn.dataset.status || 'all';
        renderOrdersTable();
      },
      { signal }
    );
  }
  for (const pBtn of document.querySelectorAll('.orders-period-btn')) {
    pBtn.addEventListener(
      'click',
      () => {
        ordersPeriodFilter = pBtn.dataset.period || 'all';
        renderOrdersTable();
      },
      { signal }
    );
  }
  for (const inputId of ['orders-month-select', 'orders-year-input', 'orders-date-from', 'orders-date-to']) {
    document.getElementById(inputId)?.addEventListener('change', renderOrdersTable, { signal });
  }
  document.getElementById('orders-search')?.addEventListener('input', renderOrdersTable, { signal });

  document.getElementById('confirm-cancel-btn')?.addEventListener(
    'click',
    async (e) => {
      if (!pendingCancelOrder) return;
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      const targetOrd = pendingCancelOrder;
      const reason = document.getElementById('cancel-reason-input').value.trim() || 'Dibatalkan oleh kasir';
      const op = applyOptimisticOrderPatch(targetOrd.id, (copy) => {
        copy.status = 'cancelled';
        copy.cancelReason = reason;
        return copy;
      });
      document.activeElement?.blur();
      cancelModal?.hide();
      try {
        const res = await apiFetch(`/api/orders/${targetOrd.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled', cancelReason: reason }),
        });
        op.commit(res?.order);
        showToast(`Pesanan ${targetOrd.orderCode} dibatalkan.`, 'warning');
      } catch (err) {
        op.rollback();
        showToast(err.message, 'danger');
      } finally {
        btn.disabled = false;
      }
    },
    { signal }
  );

  document.getElementById('confirm-delete-btn')?.addEventListener(
    'click',
    async (e) => {
      if (!pendingDeleteOrder) return;
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      const targetOrd = pendingDeleteOrder;
      const op = applyOptimisticOrderDelete(targetOrd.id);
      document.activeElement?.blur();
      deleteModal?.hide();
      try {
        await apiFetch(`/api/orders/${targetOrd.id}`, { method: 'DELETE' });
        showToast(`Pesanan ${targetOrd.orderCode} dihapus permanen.`, 'success');
      } catch (err) {
        op.rollback();
        showToast(err.message, 'danger');
      } finally {
        btn.disabled = false;
      }
    },
    { signal }
  );

  const tickCookingTimers = () => {
    for (const node of document.querySelectorAll('#orders-grid [data-cooking-start]')) {
      const iso = node.getAttribute('data-cooking-start');
      if (iso) node.textContent = formatCookingTimer(iso);
    }
  };
  const cookTimerInterval = setInterval(tickCookingTimers, 1000);

  subscribeStore((snap) => {
    ordersList = snap.orders || [];
    ordersReady = Boolean(snap.ordersReady);
    if (snap.settings) settings = snap.settings;
    if (initialOpenId && !handledOpenParam && ordersList.some((o) => o.id === initialOpenId)) {
      handledOpenParam = true;
      ordersStatusFilter = 'all';
      ordersPeriodFilter = 'all';
      expandedOrderIds.add(initialOpenId);
      renderOrdersTable();
      setTimeout(() => scrollExpandedCardIntoView(initialOpenId), 260);
      if (globalThis.location.search.includes('open=')) {
        history.replaceState(null, '', './daftar-pesanan.html');
      }
      return;
    }
    renderOrdersTable();
  });

  return () => {
    clearInterval(cookTimerInterval);
    cancelModal?.dispose();
    deleteModal?.dispose();
  };
}

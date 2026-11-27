// Modul halaman Layar Chef / Kitchen Display System (chef.html)
// Alur dapur: 1 tombol "Mulai Masak" per pesanan -> setelah diklik, setiap item menu makanan & minuman
// memiliki tombol "Selesai Dimasak" / "Selesai Dibuat" masing-masing, disertai bungkus menu panjang + Modal Detail.
import {
  apiFetch,
  applyOptimisticOrderPatch,
  el,
  formatElapsed,
  formatTimeShort,
  showToast,
  statusLabel,
  triggerMicroClass,
} from '../app-client.js';

const INLINE_LIMIT_PER_SECTION = 3;
const INLINE_LIMIT_WHEN_LONG = 2;
const TOTAL_WRAP_THRESHOLD = 5;

function resolveOrderItemsAndSections(ord) {
  const rawItems = Array.isArray(ord?.items) ? ord.items : [];
  const fallback = ord?.status || 'pending';
  const itemsWithIdx = rawItems.map((it, idx) => {
    const catFallback =
      it.category === 'makanan' && ord?.foodStatus
        ? ord.foodStatus
        : it.category === 'minuman' && ord?.drinkStatus
          ? ord.drinkStatus
          : fallback;
    return {
      ...it,
      originalIndex: idx,
      itemStatus: it.itemStatus || catFallback,
    };
  });

  const foods = itemsWithIdx.filter((i) => i.category === 'makanan');
  const drinks = itemsWithIdx.filter((i) => i.category === 'minuman');

  const deriveSection = (group, explicit) => {
    if (group.length === 0) return 'none';
    if (group.every((i) => i.itemStatus === 'cancelled')) return 'cancelled';
    if (group.every((i) => i.itemStatus === 'completed')) return 'completed';
    if (group.every((i) => i.itemStatus === 'ready' || i.itemStatus === 'completed')) return 'ready';
    if (group.some((i) => ['cooking', 'ready', 'completed'].includes(i.itemStatus))) return 'cooking';
    return explicit || 'pending';
  };

  return {
    itemsWithIdx,
    foods,
    drinks,
    foodStatus: deriveSection(foods, ord?.foodStatus),
    drinkStatus: deriveSection(drinks, ord?.drinkStatus),
  };
}

export function mount(ctx) {
  const { session, signal, subscribeStore } = ctx;
  const canCook = session.user.role === 'admin' || session.user.role === 'chef';
  const canCompleteReady = canCook || session.user.role === 'kasir';

  let orders = [];
  let ordersReady = false;
  let activeFilter = 'active';
  let serviceFilter = 'all';
  let sectionFilter = 'all';
  let detailOrderId = null;
  const inFlightKeys = new Set();

  const detailModalEl = document.getElementById('chefDetailModal');
  const detailModal = detailModalEl ? new globalThis.bootstrap.Modal(detailModalEl) : null;
  detailModalEl?.addEventListener(
    'hidden.bs.modal',
    () => {
      detailOrderId = null;
    },
    { signal }
  );

  function deriveOptimisticOrder(ordCopy, payload) {
    const nextStatus = payload.status;
    const section = payload.section || 'all';
    const hasIdx = payload.itemIndex !== undefined && payload.itemIndex !== null;
    const items = Array.isArray(ordCopy.items) ? ordCopy.items : [];
    const fallback = ordCopy.status || 'pending';

    ordCopy.items = items.map((it, idx) => {
      const curr = it.itemStatus || (it.category === 'makanan' ? ordCopy.foodStatus : ordCopy.drinkStatus) || fallback;
      if (hasIdx) {
        return idx === payload.itemIndex ? { ...it, itemStatus: nextStatus } : { ...it, itemStatus: curr };
      }
      const inSection =
        section === 'all' ||
        (section === 'food' && it.category === 'makanan') ||
        (section === 'drink' && it.category === 'minuman');
      if (!inSection) return { ...it, itemStatus: curr };
      if (nextStatus === 'cooking' && (curr === 'ready' || curr === 'completed')) return { ...it, itemStatus: curr };
      return { ...it, itemStatus: nextStatus };
    });

    const secStatus = (cat) => {
      const grp = ordCopy.items.filter((i) => i.category === cat);
      if (grp.length === 0) return 'none';
      if (grp.every((i) => i.itemStatus === 'completed')) return 'completed';
      if (grp.every((i) => i.itemStatus === 'ready' || i.itemStatus === 'completed')) return 'ready';
      if (grp.some((i) => ['cooking', 'ready', 'completed'].includes(i.itemStatus))) return 'cooking';
      return 'pending';
    };

    ordCopy.foodStatus = secStatus('makanan');
    ordCopy.drinkStatus = secStatus('minuman');
    const activeSecs = [ordCopy.foodStatus, ordCopy.drinkStatus].filter((s) => s !== 'none');
    if (activeSecs.every((s) => s === 'completed')) ordCopy.status = 'completed';
    else if (activeSecs.every((s) => s === 'ready' || s === 'completed')) ordCopy.status = 'ready';
    else if (activeSecs.some((s) => ['cooking', 'ready', 'completed'].includes(s))) ordCopy.status = 'cooking';
    else ordCopy.status = 'pending';
    return ordCopy;
  }

  async function updateOrderStatus(ord, payload, toastMsg, triggerBtn = null) {
    const lockKey = `${ord.id}:${payload.itemIndex ?? payload.section ?? 'all'}`;
    if (inFlightKeys.has(lockKey)) return;
    inFlightKeys.add(lockKey);
    if (triggerBtn) triggerBtn.disabled = true;

    const op = applyOptimisticOrderPatch(ord.id, (copy) => deriveOptimisticOrder(copy, payload));
    try {
      const res = await apiFetch(`/api/orders/${ord.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      op.commit(res?.order);
      showToast(toastMsg, 'success');
    } catch (err) {
      op.rollback();
      showToast(err.message, 'danger');
    } finally {
      inFlightKeys.delete(lockKey);
    }
  }

  const buildItemControl = (ord, it) => {
    if (ord.status === 'cancelled' || ord.status === 'pending') return null;

    if (it.itemStatus === 'ready') {
      return el('span', { className: 'badge text-bg-success flex-shrink-0 align-self-center' }, [
        el('i', { className: 'bi bi-check2-circle me-1' }),
        'Siap',
      ]);
    }
    if (it.itemStatus === 'completed') {
      return el('span', { className: 'badge text-bg-secondary flex-shrink-0 align-self-center' }, [
        el('i', { className: 'bi bi-check2-all me-1' }),
        'Diambil',
      ]);
    }

    if (!canCook) {
      return el('span', { className: 'badge text-bg-primary flex-shrink-0 align-self-center', textContent: 'Dimasak' });
    }

    const isFood = it.category === 'makanan';
    return el(
      'button',
      {
        type: 'button',
        className: 'btn btn-xs btn-success fw-semibold flex-shrink-0 chef-item-done-btn',
        onClick: (e) =>
          updateOrderStatus(
            ord,
            { status: 'ready', itemIndex: it.originalIndex },
            `${it.name} (${ord.orderCode}) selesai ${isFood ? 'dimasak' : 'dibuat'}.`,
            e.currentTarget
          ),
      },
      [el('i', { className: 'bi bi-check-lg me-1' }), isFood ? 'Selesai Dimasak' : 'Selesai Dibuat']
    );
  };

  const renderSectionBox = (ord, { title, iconClass, items, pillClass, secStatus, maxItems = Infinity }) => {
    if (items.length === 0) return { node: null, hiddenCount: 0 };
    const st = statusLabel(secStatus);
    const visibleItems = Number.isFinite(maxItems) ? items.slice(0, maxItems) : items;
    const hiddenCount = Math.max(0, items.length - visibleItems.length);
    const stateCls = secStatus === 'ready' ? ' is-ready' : secStatus === 'completed' ? ' is-completed' : '';
    const readyCount = items.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'completed').length;

    const box = el('div', { className: `chef-section-box${stateCls} mb-1` }, [
      el('div', { className: 'd-flex justify-content-between align-items-center gap-1 mb-1' }, [
        el('div', { className: 'small text-uppercase fw-bold text-secondary', style: 'font-size: 0.72rem;' }, [
          el('i', { className: `bi ${iconClass} me-1` }),
          `${title} (${readyCount}/${items.length})`,
        ]),
        el('span', { className: `badge ${st.badge}`, textContent: st.text }),
      ]),
      el(
        'ul',
        { className: 'list-group list-group-flush bg-transparent' },
        visibleItems.map((it) => {
          const isDone = it.itemStatus === 'ready' || it.itemStatus === 'completed';
          return el('li', { className: 'list-group-item bg-transparent px-0 py-1 d-flex align-items-center gap-1' }, [
            el('span', { className: `chef-qty-pill ${pillClass}`, textContent: `${it.qty}×` }),
            el('div', { className: 'chef-item-name flex-grow-1' }, [
              el('div', {
                className: `fw-semibold small lh-sm${isDone ? ' text-decoration-line-through text-secondary' : ''}`,
                textContent: it.name,
              }),
              it.note ? el('div', { className: 'text-danger fst-italic lh-sm', style: 'font-size: 0.75rem;', textContent: `Catatan: ${it.note}` }) : null,
            ]),
            buildItemControl(ord, it),
          ]);
        })
      ),
      hiddenCount > 0
        ? el('div', {
            className: 'chef-more-pill pt-1',
            textContent: `+${hiddenCount} menu ${title.toLowerCase()} lainnya (klik Detail Pesanan)`,
          })
        : null,
    ]);

    return { node: box, hiddenCount };
  };

  const buildTicketMainAction = (ord) => {
    if (ord.status === 'cancelled' || ord.status === 'completed') return null;

    // 1. Saat pesanan baru masuk -> HANYA 1 tombol "Mulai Masak"
    if (ord.status === 'pending') {
      if (canCook) {
        return el(
          'button',
          {
            type: 'button',
            className: 'btn btn-sm btn-primary w-100 fw-semibold chef-action-btn',
            onClick: (e) =>
              updateOrderStatus(
                ord,
                { status: 'cooking', section: 'all' },
                `${ord.orderCode} mulai dimasak — tandai tiap menu saat selesai.`,
                e.currentTarget
              ),
          },
          [el('i', { className: 'bi bi-fire me-1' }), 'Mulai Masak']
        );
      }
      return el('div', {
        className: 'text-center text-secondary small py-1',
        textContent: 'Menunggu Chef / Admin klik Mulai Masak',
      });
    }

    // 2. Setelah semua item menu selesai dimasak/dibuat -> tombol "Selesai / Diambil"
    if (ord.status === 'ready' && canCompleteReady) {
      return el(
        'button',
        {
          type: 'button',
          className: 'btn btn-sm btn-outline-secondary w-100 fw-semibold chef-action-btn',
          onClick: (e) =>
            updateOrderStatus(
              ord,
              { status: 'completed', section: 'all' },
              `Pesanan ${ord.orderCode} selesai / diambil.`,
              e.currentTarget
            ),
        },
        [el('i', { className: 'bi bi-check2-all me-1' }), 'Selesai / Diambil']
      );
    }

    return null;
  };

  const renderDetailModal = (ord) => {
    const bodyEl = document.getElementById('chef-detail-body');
    const codeEl = document.getElementById('chef-detail-code');
    const editedEl = document.getElementById('chef-detail-edited');
    const statusEl = document.getElementById('chef-detail-status');
    if (!bodyEl || !ord) return;

    const st = statusLabel(ord.status);
    if (codeEl) codeEl.textContent = ord.orderCode || ord.id;
    if (editedEl) editedEl.classList.toggle('d-none', !ord.isEdited);
    if (statusEl) {
      statusEl.textContent = st.text;
      statusEl.className = `badge ${st.badge}`;
    }

    const { foods, drinks, foodStatus, drinkStatus } = resolveOrderItemsAndSections(ord);
    const serviceBanner =
      ord.serviceType === 'dine_in'
        ? el('div', {
            className: 'alert alert-primary py-1 px-2 mb-2 chef-service-banner text-center',
            textContent: `MAKAN DI TEMPAT · MEJA ${ord.tableNumber || '-'}`,
          })
        : el('div', {
            className: 'alert alert-dark py-1 px-2 mb-2 chef-service-banner text-center',
            textContent: 'DIBUNGKUS (TAKE AWAY)',
          });

    const foodBox = renderSectionBox(ord, {
      title: 'Makanan',
      iconClass: 'bi-egg-fried',
      items: foods,
      pillClass: 'text-bg-warning',
      secStatus: foodStatus,
      maxItems: Infinity,
    }).node;

    const drinkBox = renderSectionBox(ord, {
      title: 'Minuman',
      iconClass: 'bi-cup-straw',
      items: drinks,
      pillClass: 'text-bg-info',
      secStatus: drinkStatus,
      maxItems: Infinity,
    }).node;

    const modalMainAction = buildTicketMainAction(ord);

    bodyEl.replaceChildren(
      ...[
        serviceBanner,
        el('div', { className: 'd-flex flex-wrap justify-content-between gap-2 small text-secondary mb-2' }, [
          el('span', {}, [el('i', { className: 'bi bi-person me-1' }), ord.customerName || 'Tamu']),
          el('span', {}, [el('i', { className: 'bi bi-clock me-1' }), `${formatTimeShort(ord.createdAt)} (${formatElapsed(ord.createdAt)})`]),
        ]),
        ord.status === 'cancelled'
          ? el('div', { className: 'alert alert-danger py-2 small mb-2' }, [
              el('strong', { textContent: 'PESANAN DIBATALKAN: ' }),
              ord.cancelReason || 'Dibatalkan oleh kasir',
            ])
          : null,
        ord.notes
          ? el('div', { className: 'alert alert-warning py-1 px-2 small mb-2' }, [
              el('i', { className: 'bi bi-chat-left-text me-1' }),
              ord.notes,
            ])
          : null,
        foodBox,
        drinkBox,
        modalMainAction ? el('div', { className: 'pt-2 mt-2 border-top' }, [modalMainAction]) : null,
      ].filter(Boolean)
    );
  };

  const openOrderDetail = (ord) => {
    detailOrderId = ord.id;
    renderDetailModal(ord);
    detailModal?.show();
  };

  const renderTickets = () => {
    const cntPending = document.getElementById('cnt-pending');
    const cntCooking = document.getElementById('cnt-cooking');
    const cntReady = document.getElementById('cnt-ready');
    const cntCancelled = document.getElementById('cnt-cancelled');
    const setStatWithPop = (node, nextVal) => {
      if (!node) return;
      const str = String(nextVal);
      if (node.textContent !== str && node.textContent !== '' && node.textContent !== '0') {
        triggerMicroClass(node, 'micro-pop', 260);
      }
      node.textContent = str;
    };
    setStatWithPop(cntPending, orders.filter((o) => o.status === 'pending').length);
    setStatWithPop(cntCooking, orders.filter((o) => o.status === 'cooking').length);
    setStatWithPop(cntReady, orders.filter((o) => o.status === 'ready').length);
    setStatWithPop(cntCancelled, orders.filter((o) => o.status === 'cancelled').length);

    if (detailOrderId) {
      const currentOrd = orders.find((o) => o.id === detailOrderId);
      if (currentOrd) renderDetailModal(currentOrd);
    }

    const grid = document.getElementById('chef-grid');
    if (!grid) return;
    grid.replaceChildren();

    if (!ordersReady && orders.length === 0) {
      for (let i = 0; i < 3; i += 1) {
        grid.appendChild(
          el('div', { className: 'col-md-6 col-xl-4' }, [
            el('div', { className: 'card placeholder-glow' }, [
              el('div', { className: 'card-body py-4' }, [
                el('span', { className: 'placeholder col-6 mb-2 rounded' }),
                el('span', { className: 'placeholder col-12 mb-2 rounded' }),
                el('span', { className: 'placeholder col-8 rounded' }),
              ]),
            ]),
          ])
        );
      }
      return;
    }

    const filtered = orders.filter((o) => {
      if (serviceFilter !== 'all' && o.serviceType !== serviceFilter) return false;
      const sec = resolveOrderItemsAndSections(o);
      if (sectionFilter === 'food' && sec.foods.length === 0) return false;
      if (sectionFilter === 'drink' && sec.drinks.length === 0) return false;

      if (activeFilter === 'active') {
        if (o.status === 'cancelled') return true;
        return ['pending', 'cooking', 'ready'].includes(sec.foodStatus) || ['pending', 'cooking', 'ready'].includes(sec.drinkStatus);
      }
      if (activeFilter === 'all') return true;
      if (sectionFilter === 'food') return sec.foodStatus === activeFilter;
      if (sectionFilter === 'drink') return sec.drinkStatus === activeFilter;
      return o.status === activeFilter;
    });

    if (filtered.length === 0) {
      grid.appendChild(
        el('div', { className: 'col-12' }, [
          el('div', { className: 'card' }, [
            el('div', {
              className: 'card-body text-center text-secondary py-5',
              textContent: 'Belum ada tiket pesanan pada filter ini.',
            }),
          ]),
        ])
      );
      return;
    }

    for (const ord of filtered) {
      const st = statusLabel(ord.status);
      const { foods, drinks, foodStatus, drinkStatus } = resolveOrderItemsAndSections(ord);
      const totalItems = foods.length + drinks.length;
      const maxPerSection = totalItems > TOTAL_WRAP_THRESHOLD ? INLINE_LIMIT_WHEN_LONG : INLINE_LIMIT_PER_SECTION;

      const serviceBanner =
        ord.serviceType === 'dine_in'
          ? el('div', {
              className: 'alert alert-primary py-1 px-2 mb-1 chef-service-banner text-center',
              textContent: `MAKAN DI TEMPAT · MEJA ${ord.tableNumber || '-'}`,
            })
          : el('div', {
              className: 'alert alert-dark py-1 px-2 mb-1 chef-service-banner text-center',
              textContent: 'DIBUNGKUS (TAKE AWAY)',
            });

      const showFood = sectionFilter === 'all' || sectionFilter === 'food';
      const showDrink = sectionFilter === 'all' || sectionFilter === 'drink';

      const foodRender = showFood
        ? renderSectionBox(ord, {
            title: 'Makanan',
            iconClass: 'bi-egg-fried',
            items: foods,
            pillClass: 'text-bg-warning',
            secStatus: foodStatus,
            maxItems: maxPerSection,
          })
        : { node: null, hiddenCount: foods.length };

      const drinkRender = showDrink
        ? renderSectionBox(ord, {
            title: 'Minuman',
            iconClass: 'bi-cup-straw',
            items: drinks,
            pillClass: 'text-bg-info',
            secStatus: drinkStatus,
            maxItems: maxPerSection,
          })
        : { node: null, hiddenCount: drinks.length };

      const hasHiddenItems = foodRender.hiddenCount > 0 || drinkRender.hiddenCount > 0;
      const showDetailBtn = hasHiddenItems || totalItems > 4;
      const mainActionBtn = buildTicketMainAction(ord);

      const footerControls = [
        showDetailBtn
          ? el(
              'button',
              {
                type: 'button',
                className: 'btn btn-sm btn-outline-info w-100 fw-semibold chef-detail-btn',
                onClick: () => openOrderDetail(ord),
              },
              [el('i', { className: 'bi bi-list-ul me-1' }), `Detail Pesanan (${totalItems} menu)`]
            )
          : null,
        mainActionBtn,
      ].filter(Boolean);

      const ticket = el('div', { className: `card shadow-sm chef-ticket status-${ord.status}` }, [
        el('div', { className: 'card-header d-flex flex-wrap justify-content-between align-items-center gap-1 py-1 px-2' }, [
          el('div', { className: 'd-flex flex-wrap align-items-center gap-1 min-w-0' }, [
            el('span', { className: 'fw-bold fs-6', textContent: ord.orderCode || ord.id }),
            ord.isEdited ? el('span', { className: 'badge text-bg-info badge-edited-pulse', textContent: 'DIEDIT' }) : null,
          ]),
          el('span', { className: `badge ${st.badge}`, textContent: st.text }),
        ]),
        el('div', { className: 'card-body p-2 d-flex flex-column' }, [
          serviceBanner,
          el('div', { className: 'd-flex flex-wrap justify-content-between gap-1 text-secondary mb-1', style: 'font-size: 0.76rem;' }, [
            el('span', {}, [el('i', { className: 'bi bi-person me-1' }), ord.customerName || 'Tamu']),
            el('span', {}, [
              el('i', { className: 'bi bi-clock me-1' }),
              `${formatTimeShort(ord.createdAt)} (${formatElapsed(ord.createdAt)})`,
            ]),
          ]),
          ord.status === 'cancelled'
            ? el('div', { className: 'alert alert-danger py-1 px-2 small mb-1' }, [
                el('strong', { textContent: 'PESANAN DIBATALKAN: ' }),
                ord.cancelReason || 'Dibatalkan oleh kasir',
              ])
            : null,
          ord.notes
            ? el('div', { className: 'alert alert-warning py-1 px-2 small mb-1' }, [
                el('i', { className: 'bi bi-chat-left-text me-1' }),
                ord.notes,
              ])
            : null,
          el('div', { className: 'flex-grow-1' }, [foodRender.node, drinkRender.node]),
          footerControls.length > 0
            ? el('div', { className: 'chef-ticket-actions flex-shrink-0 d-grid gap-1 pt-1 mt-1 border-top' }, footerControls)
            : null,
        ]),
      ]);

      grid.appendChild(el('div', { className: 'col-sm-6 col-lg-4 col-xxl-3' }, [ticket]));
    }
  };

  for (const btn of document.querySelectorAll('.chef-filter')) {
    btn.addEventListener(
      'click',
      () => {
        activeFilter = btn.dataset.filter;
        for (const b of document.querySelectorAll('.chef-filter')) {
          b.className = b.dataset.filter === activeFilter ? 'btn btn-sm btn-primary chef-filter' : 'btn btn-sm btn-outline-primary chef-filter';
        }
        renderTickets();
      },
      { signal }
    );
  }

  document.getElementById('chef-service-filter')?.addEventListener(
    'change',
    (e) => {
      serviceFilter = e.target.value;
      renderTickets();
    },
    { signal }
  );

  document.getElementById('chef-section-filter')?.addEventListener(
    'change',
    (e) => {
      sectionFilter = e.target.value;
      renderTickets();
    },
    { signal }
  );

  subscribeStore((snap) => {
    orders = snap.orders || [];
    ordersReady = Boolean(snap.ordersReady);
    renderTickets();
  });

  const timer = setInterval(renderTickets, 30000);
  return () => {
    clearInterval(timer);
    detailModal?.dispose();
  };
}

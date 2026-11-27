// Modul halaman Daftar Pesanan Real-Time (daftar-pesanan.html - Admin & Kasir)
import {
  apiFetch,
  applyOptimisticOrderDelete,
  applyOptimisticOrderPatch,
  el,
  formatRupiah,
  formatTimeShort,
  showToast,
  statusLabel,
  triggerMicroClass,
} from '../app-client.js';

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

  const renderOrdersTable = () => {
    const countBadge = document.getElementById('orders-count-badge');
    const readyBadge = document.getElementById('orders-ready-badge');
    const statusCounts = {
      all: ordersList.length,
      pending: 0,
      cooking: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const o of ordersList) {
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

    const tbody = document.getElementById('orders-table-body');
    const mobileList = document.getElementById('orders-mobile-list');
    const viewHeaderEl = document.getElementById('orders-status-view-header');
    if (!tbody || !mobileList) return;
    tbody.replaceChildren();
    mobileList.replaceChildren();

    if (!ordersReady && ordersList.length === 0) {
      if (viewHeaderEl) viewHeaderEl.textContent = 'Memuat daftar pesanan...';
      tbody.appendChild(
        el('tr', { className: 'placeholder-glow' }, [
          el('td', { colSpan: 6 }, [el('span', { className: 'placeholder col-12 rounded' })]),
        ])
      );
      mobileList.appendChild(
        el('div', { className: 'card border placeholder-glow mb-0' }, [
          el('div', { className: 'card-body p-2' }, [el('span', { className: 'placeholder col-10 rounded' })]),
        ])
      );
      return;
    }

    const statusFilter = ordersStatusFilter || 'all';
    const q = (document.getElementById('orders-search')?.value || '').trim().toLowerCase();

    const filtered = sortKasirOrders(
      ordersList.filter((o) => {
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
      tbody.appendChild(
        el('tr', {}, [
          el('td', {
            colSpan: 6,
            className: 'text-center text-secondary py-4',
            textContent: emptyMsg,
          }),
        ])
      );
      mobileList.appendChild(
        el('div', {
          className: 'text-center text-secondary py-4 small',
          textContent: emptyMsg,
        })
      );
      return;
    }

    for (const ord of filtered) {
      const st = statusLabel(ord.status);
      const sec = getSectionStatuses(ord);
      const svcText =
        ord.serviceType === 'dine_in' ? `Makan di Tempat · Meja ${ord.tableNumber || '-'}` : 'Dibungkus (Take Away)';
      const svcBadgeClass = ord.serviceType === 'dine_in' ? 'text-bg-primary' : 'text-bg-dark';

      const makeSplitBadges = () => {
        if (!sec.hasFood || !sec.hasDrink || sec.foodStatus === sec.drinkStatus) return null;
        const fSt = statusLabel(sec.foodStatus);
        const dSt = statusLabel(sec.drinkStatus);
        return el('div', { className: 'd-flex flex-wrap gap-1 mt-1' }, [
          el('span', { className: `badge ${fSt.badge}`, textContent: `Mkn: ${fSt.text}` }),
          el('span', { className: `badge ${dSt.badge}`, textContent: `Mnm: ${dSt.text}` }),
        ]);
      };

      const makeItemLines = () =>
        (ord.items || []).map((it) =>
          el('div', { className: 'small text-break' }, [
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
            it.note ? el('span', { className: 'text-secondary fst-italic ms-1', textContent: `(${it.note})` }) : null,
          ])
        );

      tbody.appendChild(
        el('tr', {}, [
          el('td', {}, [
            el('div', { className: 'fw-bold' }, [
              ord.orderCode || ord.id,
              ord.isEdited ? el('span', { className: 'badge text-bg-info ms-1', textContent: 'DIEDIT' }) : null,
            ]),
            el('div', { className: 'text-secondary small', textContent: formatTimeShort(ord.createdAt) }),
          ]),
          el('td', {}, [
            el('div', { className: 'fw-semibold', textContent: ord.customerName || 'Tamu' }),
            el('span', { className: `badge ${svcBadgeClass}`, textContent: svcText }),
            ord.notes ? el('div', { className: 'text-secondary small mt-1', textContent: `Catatan: ${ord.notes}` }) : null,
          ]),
          el('td', {}, makeItemLines()),
          el('td', { className: 'fw-semibold' }, [
            formatRupiah(ord.totalAmount),
            ord.status !== 'cancelled'
              ? el('div', { className: 'mt-1' }, [
                  el('span', {
                    className: `badge ${ord.paymentStatus === 'paid' ? 'text-bg-success' : 'text-bg-warning'}`,
                    textContent: ord.paymentStatus === 'paid' ? 'Lunas' : 'Belum Bayar',
                  }),
                ])
              : null,
          ]),
          el('td', {}, [
            el('span', { className: `badge ${st.badge}`, textContent: st.text }),
            makeSplitBadges(),
            ord.status === 'cancelled' && ord.cancelReason
              ? el('div', { className: 'text-danger small mt-1', textContent: ord.cancelReason })
              : null,
          ]),
          el('td', { className: 'text-end' }, [
            el('div', { className: 'd-inline-flex flex-wrap gap-1 justify-content-end' }, buildActions(ord)),
          ]),
        ])
      );

      mobileList.appendChild(
        el('div', { className: 'card border mb-0' }, [
          el('div', { className: 'card-body p-2' }, [
            el('div', { className: 'd-flex flex-wrap justify-content-between align-items-center gap-1 mb-1' }, [
              el('div', { className: 'fw-bold small' }, [
                ord.orderCode || ord.id,
                ord.isEdited ? el('span', { className: 'badge text-bg-info ms-1', textContent: 'DIEDIT' }) : null,
              ]),
              el('span', { className: `badge ${st.badge}`, textContent: st.text }),
            ]),
            makeSplitBadges(),
            el('div', { className: 'd-flex flex-wrap justify-content-between align-items-center gap-1 small mb-2' }, [
              el('span', { className: 'fw-semibold', textContent: `${ord.customerName || 'Tamu'} · ${formatTimeShort(ord.createdAt)}` }),
              el('span', { className: `badge ${svcBadgeClass}`, textContent: svcText }),
            ]),
            el('div', { className: 'mb-2' }, makeItemLines()),
            ord.notes ? el('div', { className: 'text-secondary small mb-1', textContent: `Catatan: ${ord.notes}` }) : null,
            ord.status === 'cancelled' && ord.cancelReason
              ? el('div', { className: 'text-danger small mb-2', textContent: `Alasan batal: ${ord.cancelReason}` })
              : null,
            el('div', { className: 'd-flex flex-wrap justify-content-between align-items-center gap-2 pt-2 border-top' }, [
              el('span', { className: 'fw-bold text-primary', textContent: formatRupiah(ord.totalAmount) }),
              el('div', { className: 'd-flex flex-wrap gap-1' }, buildActions(ord)),
            ]),
          ]),
        ])
      );
    }
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

  subscribeStore((snap) => {
    ordersList = snap.orders || [];
    ordersReady = Boolean(snap.ordersReady);
    if (snap.settings) settings = snap.settings;
    renderOrdersTable();
  });

  return () => {
    cancelModal?.dispose();
    deleteModal?.dispose();
  };
}

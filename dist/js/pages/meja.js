// Modul halaman Manajemen Meja Real-Time (meja.html - Admin & Kasir)
import { apiFetch, el, formatRupiah, showToast, statusLabel } from '../app-client.js';

function getActiveOrderForTable(orders, tableNumber) {
  const num = String(tableNumber || '').trim().toLowerCase();
  if (!num) return null;
  return (
    orders.find((o) => {
      if (o.serviceType !== 'dine_in') return false;
      if (String(o.tableNumber || '').trim().toLowerCase() !== num) return false;
      if (o.status === 'cancelled') return false;
      const isKitchenActive = ['pending', 'cooking', 'ready'].includes(o.status);
      const isUnpaidCompleted = o.status === 'completed' && o.paymentStatus !== 'paid';
      return isKitchenActive || isUnpaidCompleted;
    }) || null
  );
}

const TABLE_STATE_META = {
  available: { label: 'Tersedia', badge: 'text-bg-success', border: 'border-top border-4 border-success' },
  occupied: { label: 'Terisi', badge: 'text-bg-primary', border: 'border-top border-4 border-primary' },
  reserved: { label: 'Reserved', badge: 'text-bg-warning', border: 'border-top border-4 border-warning' },
  cleaning: { label: 'Dibersihkan', badge: 'text-bg-secondary', border: 'border-top border-4 border-secondary' },
};

export function mount(ctx) {
  const { session, signal, navigate, subscribeStore } = ctx;
  const isAdmin = session.user.role === 'admin';

  let tablesList = [];
  let tablesReady = false;
  let ordersList = [];
  let areaFilter = 'all';

  const modalEl = document.getElementById('tableModal');
  const tableModal = modalEl ? new globalThis.bootstrap.Modal(modalEl) : null;
  const addBtn = document.getElementById('btn-add-table');
  if (isAdmin && addBtn) addBtn.classList.remove('d-none');

  const updateTableStatus = async (tbl, nextStatus) => {
    try {
      await apiFetch(`/api/tables/${tbl.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(`Status Meja ${tbl.number} diubah ke ${TABLE_STATE_META[nextStatus]?.label || nextStatus}.`, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const deleteTable = async (tbl) => {
    if (!globalThis.confirm(`Hapus Meja ${tbl.number}?`)) return;
    try {
      await apiFetch(`/api/tables/${tbl.id}`, { method: 'DELETE' });
      showToast(`Meja ${tbl.number} dihapus.`, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const openModal = (tbl = null) => {
    document.getElementById('table-modal-title').textContent = tbl ? `Edit Meja ${tbl.number}` : 'Tambah Meja Baru';
    document.getElementById('table-edit-id').value = tbl ? tbl.id : '';
    document.getElementById('table-number').value = tbl ? tbl.number : '';
    document.getElementById('table-capacity').value = tbl ? String(tbl.capacity || 4) : '4';
    document.getElementById('table-area').value = tbl ? tbl.area || 'Utama' : 'Utama';
    document.getElementById('table-status').value = tbl ? tbl.status || 'available' : 'available';
    document.getElementById('table-note').value = tbl ? tbl.note || '' : '';
    tableModal?.show();
  };

  const renderTables = () => {
    const grid = document.getElementById('tables-grid');
    if (!grid) return;

    const enriched = tablesList.map((t) => {
      const activeOrder = getActiveOrderForTable(ordersList, t.number);
      const effectiveStatus = activeOrder ? 'occupied' : t.status || 'available';
      return { ...t, activeOrder, effectiveStatus };
    });

    const cntAvail = enriched.filter((t) => t.effectiveStatus === 'available').length;
    const cntOcc = enriched.filter((t) => t.effectiveStatus === 'occupied').length;
    const cntRes = enriched.filter((t) => t.effectiveStatus === 'reserved').length;
    const cntClean = enriched.filter((t) => t.effectiveStatus === 'cleaning').length;
    document.getElementById('tbl-cnt-available').textContent = String(cntAvail);
    document.getElementById('tbl-cnt-occupied').textContent = String(cntOcc);
    document.getElementById('tbl-cnt-reserved').textContent = String(cntRes);
    document.getElementById('tbl-cnt-cleaning').textContent = String(cntClean);

    grid.replaceChildren();
    if (!tablesReady && tablesList.length === 0) {
      grid.appendChild(el('div', { className: 'col-12 text-center text-secondary py-4 small', textContent: 'Memuat daftar meja...' }));
      return;
    }

    const stFilter = document.getElementById('table-status-filter')?.value || 'all';
    const q = (document.getElementById('table-search')?.value || '').trim().toLowerCase();

    const filtered = enriched.filter((t) => {
      if (areaFilter !== 'all' && t.area !== areaFilter) return false;
      if (stFilter !== 'all' && t.effectiveStatus !== stFilter) return false;
      if (q && !`${t.number} ${t.area} ${t.note || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });

    if (filtered.length === 0) {
      grid.appendChild(el('div', { className: 'col-12 text-center text-secondary py-4 small', textContent: 'Tidak ada meja yang cocok.' }));
      return;
    }

    for (const tbl of filtered) {
      const meta = TABLE_STATE_META[tbl.effectiveStatus] || TABLE_STATE_META.available;
      const ord = tbl.activeOrder;

      const bodyChildren = [
        el('div', { className: 'd-flex justify-content-between align-items-start gap-1 mb-1' }, [
          el('div', {}, [
            el('div', { className: 'fw-bold fs-5 lh-1', textContent: `Meja ${tbl.number}` }),
            el('div', { className: 'small text-secondary', textContent: `${tbl.area} · ${tbl.capacity} kursi` }),
          ]),
          el('span', { className: `badge ${meta.badge}`, textContent: meta.label }),
        ]),
      ];

      if (ord) {
        const st = statusLabel(ord.status);
        const isPaid = ord.paymentStatus === 'paid';
        bodyChildren.push(
          el('div', { className: 'border rounded p-2 bg-body-tertiary small mb-2' }, [
            el('div', { className: 'd-flex justify-content-between align-items-center mb-1' }, [
              el('strong', { textContent: ord.orderCode }),
              el('span', { className: `badge ${st.badge}`, textContent: st.text }),
            ]),
            el('div', { className: 'text-truncate', textContent: `Pembeli: ${ord.customerName || 'Tamu'}` }),
            el('div', { className: 'd-flex justify-content-between align-items-center mt-1' }, [
              el('span', { className: 'fw-bold text-primary', textContent: formatRupiah(ord.totalAmount) }),
              el('span', {
                className: `badge ${isPaid ? 'text-bg-success' : 'text-bg-warning'}`,
                textContent: isPaid ? 'Lunas' : 'Belum Bayar',
              }),
            ]),
          ])
        );
      } else if (tbl.note) {
        bodyChildren.push(el('div', { className: 'small text-secondary fst-italic mb-2', textContent: tbl.note }));
      }

      const actionBtns = [];
      if (ord) {
        actionBtns.push(
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-xs btn-success',
              onClick: () => navigate(`./pembayaran.html?order=${encodeURIComponent(ord.id)}`, { pushState: true }),
            },
            [el('i', { className: 'bi bi-cash-coin me-1' }), ord.paymentStatus === 'paid' ? 'Struk' : 'Bayar']
          )
        );
        if (ord.status === 'pending') {
          actionBtns.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-xs btn-outline-primary',
                onClick: () => navigate(`./pesanan.html?edit=${encodeURIComponent(ord.id)}`, { pushState: true }),
              },
              [el('i', { className: 'bi bi-pencil me-1' }), 'Edit']
            )
          );
        }
      } else {
        actionBtns.push(
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-xs btn-primary',
              onClick: () => navigate(`./pesanan.html?table=${encodeURIComponent(tbl.number)}`, { pushState: true }),
            },
            [el('i', { className: 'bi bi-plus-circle me-1' }), 'Buat Pesanan']
          )
        );
        if (tbl.effectiveStatus !== 'reserved') {
          actionBtns.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-xs btn-outline-warning',
                onClick: () => updateTableStatus(tbl, 'reserved'),
              },
              'Reserve'
            )
          );
        }
        if (tbl.effectiveStatus !== 'cleaning') {
          actionBtns.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-xs btn-outline-secondary',
                onClick: () => updateTableStatus(tbl, 'cleaning'),
              },
              'Bersihkan'
            )
          );
        }
        if (tbl.effectiveStatus !== 'available') {
          actionBtns.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-xs btn-outline-success',
                onClick: () => updateTableStatus(tbl, 'available'),
              },
              'Tersedia'
            )
          );
        }
      }

      if (isAdmin) {
        actionBtns.push(
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-xs btn-outline-secondary ms-auto',
              title: 'Edit meja',
              onClick: () => openModal(tbl),
            },
            [el('i', { className: 'bi bi-gear' })]
          )
        );
        if (!ord) {
          actionBtns.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-xs btn-outline-danger',
                title: 'Hapus meja',
                onClick: () => deleteTable(tbl),
              },
              [el('i', { className: 'bi bi-trash' })]
            )
          );
        }
      }

      bodyChildren.push(el('div', { className: 'd-flex flex-wrap gap-1 mt-auto pt-2 border-top' }, actionBtns));

      grid.appendChild(
        el('div', { className: 'col-6 col-md-4 col-xl-3' }, [
          el('div', { className: `card h-100 mb-0 shadow-sm ${meta.border}` }, [
            el('div', { className: 'card-body p-2 d-flex flex-column' }, bodyChildren),
          ]),
        ])
      );
    }
  };

  for (const btn of document.querySelectorAll('.table-area-btn')) {
    btn.addEventListener(
      'click',
      () => {
        areaFilter = btn.dataset.area || 'all';
        for (const b of document.querySelectorAll('.table-area-btn')) {
          b.className = `btn btn-sm ${b.dataset.area === areaFilter ? 'btn-primary' : 'btn-outline-primary'} table-area-btn`;
        }
        renderTables();
      },
      { signal }
    );
  }
  document.getElementById('table-status-filter')?.addEventListener('change', renderTables, { signal });
  document.getElementById('table-search')?.addEventListener('input', renderTables, { signal });
  addBtn?.addEventListener('click', () => openModal(null), { signal });

  document.getElementById('table-form')?.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      const editId = document.getElementById('table-edit-id').value;
      const payload = {
        number: document.getElementById('table-number').value.trim(),
        capacity: Number.parseInt(document.getElementById('table-capacity').value || '4', 10),
        area: document.getElementById('table-area').value,
        status: document.getElementById('table-status').value,
        note: document.getElementById('table-note').value.trim(),
      };
      try {
        if (editId) {
          await apiFetch(`/api/tables/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast(`Meja ${payload.number} diperbarui.`, 'success');
        } else {
          await apiFetch('/api/tables', { method: 'POST', body: JSON.stringify(payload) });
          showToast(`Meja ${payload.number} ditambahkan.`, 'success');
        }
        document.activeElement?.blur();
        tableModal?.hide();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    },
    { signal }
  );

  subscribeStore((snap) => {
    tablesList = snap.tables || [];
    tablesReady = Boolean(snap.tablesReady);
    ordersList = snap.orders || [];
    renderTables();
  });

  return () => {
    tableModal?.dispose();
  };
}

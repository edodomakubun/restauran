// Modul halaman Dasbor Restoran (index.html)
import { el, formatRupiah, statusLabel } from '../app-client.js';

export function mount(ctx) {
  const { session, subscribeStore } = ctx;

  if (session.user.role === 'admin') {
    document.getElementById('admin-quick-links')?.classList.remove('d-none');
  }

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
  };
  renderSettings(session.settings);

  subscribeStore((snap) => {
    if (snap.settings) renderSettings(snap.settings);
    const orders = snap.orders || [];

    const pending = orders.filter((o) => o.status === 'pending').length;
    const cooking = orders.filter((o) => o.status === 'cooking').length;
    const ready = orders.filter((o) => o.status === 'ready').length;
    const revenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((acc, o) => acc + Number(o.totalAmount || 0), 0);

    const pEl = document.getElementById('stat-pending');
    const cEl = document.getElementById('stat-cooking');
    const rEl = document.getElementById('stat-ready');
    const revEl = document.getElementById('stat-revenue');
    if (pEl) pEl.textContent = pending;
    if (cEl) cEl.textContent = cooking;
    if (rEl) rEl.textContent = ready;
    if (revEl) revEl.textContent = formatRupiah(revenue);

    const tbody = document.getElementById('recent-orders-body');
    if (!tbody) return;
    tbody.replaceChildren();

    if (!snap.ordersReady && orders.length === 0) {
      for (let i = 0; i < 3; i += 1) {
        tbody.appendChild(
          el('tr', { className: 'placeholder-glow' }, [
            el('td', { colSpan: 6 }, [el('span', { className: 'placeholder col-12 rounded' })]),
          ])
        );
      }
      return;
    }

    if (orders.length === 0) {
      tbody.appendChild(
        el('tr', {}, [
          el('td', {
            colSpan: 6,
            className: 'text-center text-secondary py-4',
            textContent: 'Belum ada pesanan masuk. Klik "Buat Pesanan" untuk memulai.',
          }),
        ])
      );
      return;
    }

    for (const ord of orders.slice(0, 8)) {
      const st = statusLabel(ord.status);
      const svc =
        ord.serviceType === 'dine_in'
          ? `Makan di Tempat (Meja ${ord.tableNumber || '-'})`
          : 'Dibungkus';
      const totalQty = (ord.items || []).reduce((s, it) => s + Number(it.qty || 0), 0);
      tbody.appendChild(
        el('tr', {}, [
          el('td', { className: 'fw-semibold' }, [
            ord.orderCode || ord.id,
            ord.isEdited ? el('span', { className: 'badge text-bg-info ms-1', textContent: 'DIEDIT' }) : null,
          ]),
          el('td', { textContent: ord.customerName || 'Tamu' }),
          el('td', {}, [
            el('span', {
              className: `badge ${ord.serviceType === 'dine_in' ? 'text-bg-primary' : 'text-bg-dark'}`,
              textContent: svc,
            }),
          ]),
          el('td', { textContent: `${totalQty} item` }),
          el('td', { textContent: formatRupiah(ord.totalAmount) }),
          el('td', {}, [el('span', { className: `badge ${st.badge}`, textContent: st.text })]),
        ])
      );
    }
  });
}

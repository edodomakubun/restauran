// Modul halaman Pengaturan Izin Kasir (pengaturan.html - Admin)
import { apiFetch, showToast } from '../app-client.js';

export function mount(ctx) {
  const { session, signal, subscribeStore } = ctx;

  const applyUI = (s) => {
    if (!s) return;
    const del = document.getElementById('opt-delete');
    const edit = document.getElementById('opt-edit-cooking');
    const cancel = document.getElementById('opt-cancel-cooking');
    const report = document.getElementById('opt-view-report');
    const updatedEl = document.getElementById('settings-updated');
    if (del) del.checked = Boolean(s.kasirCanDeleteOrder);
    if (edit) edit.checked = Boolean(s.kasirCanEditWhileCooking);
    if (cancel) cancel.checked = Boolean(s.kasirCanCancelWhileCooking);
    if (report) report.checked = Boolean(s.kasirCanViewReport);
    if (updatedEl && s.updatedAt) {
      updatedEl.textContent = `Terakhir diperbarui: ${new Date(s.updatedAt).toLocaleString('id-ID')}`;
    }
  };

  const updateOrdersCountUI = (orders) => {
    const count = Array.isArray(orders) ? orders.length : 0;
    const badgeEl = document.getElementById('db-orders-count');
    const modalCountEl = document.getElementById('modal-orders-count');
    const triggerBtn = document.getElementById('btn-delete-all-orders');
    if (badgeEl) badgeEl.textContent = `${count} pesanan`;
    if (modalCountEl) modalCountEl.textContent = String(count);
    if (triggerBtn) triggerBtn.disabled = count === 0;
  };

  if (session.settings) applyUI(session.settings);

  subscribeStore((snap) => {
    if (snap.settings) applyUI(snap.settings);
    if (snap.ordersReady || Array.isArray(snap.orders)) {
      updateOrdersCountUI(snap.orders);
    }
  });

  const modalEl = document.getElementById('deleteAllOrdersModal');
  const deleteAllModal = modalEl ? globalThis.bootstrap?.Modal.getOrCreateInstance(modalEl) : null;
  const confirmBtn = document.getElementById('confirm-delete-all-orders');

  confirmBtn?.addEventListener(
    'click',
    async () => {
      confirmBtn.disabled = true;
      const origHtml = confirmBtn.innerHTML;
      confirmBtn.textContent = 'Menghapus...';
      try {
        const res = await apiFetch('/api/orders', { method: 'DELETE' });
        document.activeElement?.blur();
        deleteAllModal?.hide();
        showToast(`Berhasil menghapus ${res.deletedCount ?? 0} orderan dari database.`, 'success');
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = origHtml;
      }
    },
    { signal }
  );

  document.getElementById('settings-form')?.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      try {
        const updated = await apiFetch('/api/settings', {
          method: 'PUT',
          body: JSON.stringify({
            kasirCanDeleteOrder: document.getElementById('opt-delete').checked,
            kasirCanEditWhileCooking: document.getElementById('opt-edit-cooking').checked,
            kasirCanCancelWhileCooking: document.getElementById('opt-cancel-cooking').checked,
            kasirCanViewReport: document.getElementById('opt-view-report').checked,
          }),
        });
        applyUI(updated.settings);
        showToast('Pengaturan hak akses Kasir berhasil disimpan!', 'success');
      } catch (err) {
        showToast(err.message, 'danger');
      }
    },
    { signal }
  );
}

// Modul halaman Pengaturan Izin Kasir (pengaturan.html - Admin)
import { apiFetch, showToast } from '../app-client.js';

export function mount(ctx) {
  const { session, signal, subscribeStore } = ctx;

  const applyUI = (s) => {
    if (!s) return;
    const del = document.getElementById('opt-delete');
    const edit = document.getElementById('opt-edit-cooking');
    const cancel = document.getElementById('opt-cancel-cooking');
    const updatedEl = document.getElementById('settings-updated');
    if (del) del.checked = Boolean(s.kasirCanDeleteOrder);
    if (edit) edit.checked = Boolean(s.kasirCanEditWhileCooking);
    if (cancel) cancel.checked = Boolean(s.kasirCanCancelWhileCooking);
    if (updatedEl && s.updatedAt) {
      updatedEl.textContent = `Terakhir diperbarui: ${new Date(s.updatedAt).toLocaleString('id-ID')}`;
    }
  };

  if (session.settings) applyUI(session.settings);

  subscribeStore((snap) => {
    if (snap.settings) applyUI(snap.settings);
  });

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

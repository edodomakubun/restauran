// Modul halaman Kelola Akun Staf (pengguna.html - Admin)
import { apiFetch, el, refreshLocalCollections, roleLabel, showToast, triggerMicroClass } from '../app-client.js';

export function mount(ctx) {
  const { session, signal, subscribeStore } = ctx;
  let users = [];
  let usersReady = false;
  let editingUid = null;

  const modalEl = document.getElementById('userModal');
  const userModal = modalEl ? new globalThis.bootstrap.Modal(modalEl) : null;

  const renderTable = () => {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.replaceChildren();

    if (!usersReady && users.length === 0) {
      for (let i = 0; i < 3; i += 1) {
        tbody.appendChild(
          el('tr', { className: 'placeholder-glow' }, [
            el('td', { colSpan: 5 }, [el('span', { className: 'placeholder col-12 rounded' })]),
          ])
        );
      }
      return;
    }

    for (const u of users) {
      const uid = u.uid || u.id;
      const displayName = u.displayName || u.name || '-';
      const rm = roleLabel(u.role);
      const isSelf = uid === session.user.uid;
      tbody.appendChild(
        el('tr', {}, [
          el('td', { className: 'fw-semibold' }, [
            displayName,
            isSelf ? el('span', { className: 'badge text-bg-light border text-secondary ms-1', textContent: 'Anda' }) : null,
          ]),
          el('td', { textContent: u.email }),
          el('td', {}, [el('span', { className: `badge ${rm.badge}`, textContent: rm.text })]),
          el('td', {}, [
            el('span', {
              className: `badge ${u.isActive ? 'text-bg-success' : 'text-bg-secondary'}`,
              textContent: u.isActive ? 'Aktif' : 'Nonaktif',
            }),
          ]),
          el('td', { className: 'text-end' }, [
            el('div', { className: 'd-inline-flex gap-1' }, [
              el(
                'button',
                {
                  type: 'button',
                  className: 'btn btn-xs btn-outline-primary',
                  onClick: () => {
                    editingUid = uid;
                    document.getElementById('user-modal-title').textContent = 'Edit Akun Staf';
                    document.getElementById('u-name').value = u.displayName || u.name || '';
                    document.getElementById('u-email').value = u.email || '';
                    document.getElementById('u-email').disabled = true;
                    document.getElementById('u-role').value = u.role;
                    document.getElementById('u-pass').value = '';
                    document.getElementById('u-pass').required = false;
                    document.getElementById('u-pass-hint').textContent = '(kosongkan jika tidak ubah sandi)';
                    userModal?.show();
                  },
                },
                [el('i', { className: 'bi bi-pencil me-1' }), 'Edit']
              ),
              !isSelf
                ? el(
                    'button',
                    {
                      type: 'button',
                      className: `btn btn-xs ${u.isActive ? 'btn-outline-warning' : 'btn-outline-success'}`,
                      onClick: async (e) => {
                        const row = e.currentTarget.closest('tr');
                        try {
                          await apiFetch(`/api/users/${uid}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ isActive: !u.isActive }),
                          });
                          triggerMicroClass(row, 'row-flash', 550);
                          showToast(`Akun ${displayName} ${u.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`, 'info');
                          await refreshLocalCollections(session.user.role);
                        } catch (err) {
                          showToast(err.message, 'danger');
                        }
                      },
                    },
                    [u.isActive ? 'Nonaktifkan' : 'Aktifkan']
                  )
                : null,
            ]),
          ]),
        ])
      );
    }
  };

  document.getElementById('btn-add-user')?.addEventListener(
    'click',
    () => {
      editingUid = null;
      document.getElementById('user-modal-title').textContent = 'Buat Akun Staf Baru';
      document.getElementById('user-form').reset();
      document.getElementById('u-email').disabled = false;
      document.getElementById('u-pass').required = true;
      document.getElementById('u-pass-hint').textContent = '(min. 6 karakter)';
      userModal?.show();
    },
    { signal }
  );

  document.getElementById('user-form')?.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('u-name').value.trim();
      const email = document.getElementById('u-email').value.trim();
      const role = document.getElementById('u-role').value;
      const password = document.getElementById('u-pass').value;
      try {
        if (editingUid) {
          await apiFetch(`/api/users/${editingUid}`, {
            method: 'PATCH',
            body: JSON.stringify({ displayName, role, ...(password ? { password } : {}) }),
          });
          showToast('Akun staf berhasil diperbarui.', 'success');
        } else {
          await apiFetch('/api/users', {
            method: 'POST',
            body: JSON.stringify({ displayName, email, role, password }),
          });
          showToast('Akun staf baru berhasil dibuat!', 'success');
        }
        document.activeElement?.blur();
        userModal?.hide();
        await refreshLocalCollections(session.user.role);
      } catch (err) {
        showToast(err.message, 'danger');
      }
    },
    { signal }
  );

  subscribeStore((snap) => {
    users = snap.users || [];
    usersReady = Boolean(snap.usersReady);
    renderTable();
  });

  return () => userModal?.dispose();
}

// Modul halaman Kelola Daftar Menu (menu.html - Admin)
import { apiFetch, el, formatRupiah, refreshLocalCollections, renderPagination, showToast } from '../app-client.js';

const MENU_PAGE_SIZE = 10;

export function mount(ctx) {
  const { session, signal, subscribeStore } = ctx;
  let items = [];
  let menuReady = false;
  let menuPage = 1;
  let editingId = null;

  const modalEl = document.getElementById('menuModal');
  const menuModal = modalEl ? new globalThis.bootstrap.Modal(modalEl) : null;

  const renderTable = () => {
    const cat = document.getElementById('filter-cat')?.value || 'all';
    const q = (document.getElementById('search-menu')?.value || '').trim().toLowerCase();
    const tbody = document.getElementById('menu-tbody');
    const countEl = document.getElementById('menu-count');
    const footerEl = document.getElementById('admin-menu-pagination-footer');
    const listEl = document.getElementById('admin-menu-pagination');
    const infoEl = document.getElementById('admin-menu-page-info');
    if (!tbody) return;

    tbody.replaceChildren();
    if (!menuReady && items.length === 0) {
      footerEl?.classList.add('d-none');
      if (countEl) countEl.textContent = '...';
      for (let i = 0; i < 4; i += 1) {
        tbody.appendChild(
          el('tr', { className: 'placeholder-glow' }, [
            el('td', { colSpan: 5 }, [el('span', { className: 'placeholder col-12 rounded' })]),
          ])
        );
      }
      return;
    }

    const filtered = items.filter((m) => {
      if (cat !== 'all' && m.category !== cat) return false;
      if (q && !(m.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
    if (countEl) countEl.textContent = `${filtered.length} menu`;

    if (filtered.length === 0) {
      footerEl?.classList.add('d-none');
      tbody.appendChild(
        el('tr', {}, [el('td', { colSpan: 5, className: 'text-center text-secondary py-4', textContent: 'Tidak ada menu.' })])
      );
      return;
    }

    const pg = renderPagination({
      footerEl,
      listEl,
      infoEl,
      totalItems: filtered.length,
      pageSize: MENU_PAGE_SIZE,
      currentPage: menuPage,
      onPageChange: (nextPage) => {
        menuPage = nextPage;
        renderTable();
      },
      unitLabel: 'menu',
    });
    menuPage = pg.page;
    const pageItems = filtered.slice(pg.startIndex, pg.endIndex);

    for (const m of pageItems) {
      const avail = m.isAvailable !== false;
      tbody.appendChild(
        el('tr', {}, [
          el('td', { className: 'fw-semibold', textContent: m.name }),
          el('td', {}, [
            el('span', {
              className: `badge ${m.category === 'makanan' ? 'text-bg-warning' : 'text-bg-info'}`,
              textContent: m.category === 'makanan' ? 'Makanan' : 'Minuman',
            }),
          ]),
          el('td', { textContent: Number(m.price) > 0 ? formatRupiah(m.price) : 'Tergantung ikan' }),
          el('td', {}, [
            el(
              'button',
              {
                type: 'button',
                className: `btn btn-xs ${avail ? 'btn-success' : 'btn-secondary'}`,
                onClick: async () => {
                  try {
                    await apiFetch(`/api/menu/${m.id}`, {
                      method: 'PUT',
                      body: JSON.stringify({ isAvailable: !avail }),
                    });
                    showToast(`Status "${m.name}" diperbarui.`, 'info');
                    await refreshLocalCollections(session.user.role);
                  } catch (err) {
                    showToast(err.message, 'danger');
                  }
                },
              },
              [avail ? 'Tersedia' : 'Habis']
            ),
          ]),
          el('td', { className: 'text-end' }, [
            el('div', { className: 'd-inline-flex gap-1' }, [
              el(
                'button',
                {
                  type: 'button',
                  className: 'btn btn-xs btn-outline-primary',
                  onClick: () => {
                    editingId = m.id;
                    document.getElementById('menu-modal-title').textContent = 'Edit Menu';
                    document.getElementById('m-name').value = m.name;
                    document.getElementById('m-cat').value = m.category;
                    document.getElementById('m-price').value = m.price;
                    document.getElementById('m-avail').checked = avail;
                    menuModal?.show();
                  },
                },
                [el('i', { className: 'bi bi-pencil me-1' }), 'Edit']
              ),
              el(
                'button',
                {
                  type: 'button',
                  className: 'btn btn-xs btn-outline-danger',
                  onClick: async () => {
                    if (!confirm(`Hapus menu "${m.name}"?`)) return;
                    try {
                      await apiFetch(`/api/menu/${m.id}`, { method: 'DELETE' });
                      showToast(`Menu "${m.name}" dihapus.`, 'success');
                      await refreshLocalCollections(session.user.role);
                    } catch (err) {
                      showToast(err.message, 'danger');
                    }
                  },
                },
                [el('i', { className: 'bi bi-trash me-1' }), 'Hapus']
              ),
            ]),
          ]),
        ])
      );
    }
  };

  document.getElementById('btn-open-add-menu')?.addEventListener(
    'click',
    () => {
      editingId = null;
      document.getElementById('menu-modal-title').textContent = 'Tambah Menu Baru';
      document.getElementById('menu-form').reset();
      document.getElementById('m-price').value = '15000';
      document.getElementById('m-avail').checked = true;
      menuModal?.show();
    },
    { signal }
  );

  document.getElementById('menu-form')?.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('m-name').value.trim(),
        category: document.getElementById('m-cat').value,
        price: Number.parseInt(document.getElementById('m-price').value || '0', 10),
        isAvailable: document.getElementById('m-avail').checked,
      };
      try {
        if (editingId) {
          await apiFetch(`/api/menu/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Menu berhasil diperbarui.', 'success');
        } else {
          await apiFetch('/api/menu', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Menu baru berhasil ditambahkan.', 'success');
        }
        document.activeElement?.blur();
        menuModal?.hide();
        await refreshLocalCollections(session.user.role);
      } catch (err) {
        showToast(err.message, 'danger');
      }
    },
    { signal }
  );

  document.getElementById('filter-cat')?.addEventListener(
    'change',
    () => {
      menuPage = 1;
      renderTable();
    },
    { signal }
  );
  document.getElementById('search-menu')?.addEventListener(
    'input',
    () => {
      menuPage = 1;
      renderTable();
    },
    { signal }
  );

  subscribeStore((snap) => {
    items = snap.menu || [];
    menuReady = Boolean(snap.menuReady);
    renderTable();
  });

  return () => menuModal?.dispose();
}

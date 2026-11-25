// Modul halaman Kasir & Kelola Pesanan (pesanan.html) dengan Wizard 3 Langkah AdminLTE 4,
// Form Menu Manual Collapsible (CardWidget), dan Paginasi Menu (> 10 item).
import {
  apiFetch,
  el,
  formatRupiah,
  formatTimeShort,
  initCollapsibleCard,
  initCollapsiblePanel,
  renderPagination,
  showToast,
  statusLabel,
} from '../app-client.js';

const ORDERS_COLLAPSE_KEY = 'restoran_orders_collapsed';
const CUSTOM_MENU_COLLAPSE_KEY = 'restoran_custom_menu_collapsed';
const MENU_PAGE_SIZE = 10;
const SPICE_TAGS = ['Tidak Pedas', 'Sedang', 'Pedas', 'Extra Pedas'];
const SWEET_TAGS = ['Normal Gula', 'Kurang Gula', 'Tanpa Gula'];

function getQuickNoteGroups(item) {
  const name = String(item?.name || '').toLowerCase();
  if (item?.category === 'minuman') {
    const isHot = name.includes('panas') || name.includes('kopi hitam') || name.includes('kopi gula aren');
    const extras = isHot ? ['Tambah Susu', 'Gelas Terpisah'] : ['Es Normal', 'Es Sedikit', 'Tanpa Es', 'Tambah Susu'];
    return [
      { label: 'Gula', exclusive: true, tags: SWEET_TAGS },
      { label: 'Opsi', exclusive: false, tags: extras },
    ];
  }

  const extras = ['Tanpa Bawang', 'Tanpa Sayur', 'Tanpa MSG', 'Pisah Sambal', 'Pisah Saos'];
  if (/nasi goreng|mie |bihun|bakmie|capcay|kangkung|sawi|toge/.test(name)) {
    extras.push('Tanpa Kecap', 'Tambah Telur', 'Goreng Kering');
  } else if (/bakso|soto|sup|tom yum|kuah/.test(name)) {
    extras.push('Kuah Terpisah', 'Tanpa Seledri');
  } else if (/ayam|bebek|ikan|udang|cumi|kepiting/.test(name)) {
    extras.push('Potong Kecil', 'Goreng Kering');
    if (/ayam|bebek/.test(name)) extras.push('Bagian Dada', 'Bagian Paha');
  } else {
    extras.push('Tambah Telur');
  }

  return [
    { label: 'Pedas', exclusive: true, tags: SPICE_TAGS },
    { label: 'Opsi', exclusive: false, tags: extras },
  ];
}

function parseNoteTokens(note) {
  return String(note || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toggleQuickNoteTag(currentNote, tag, group) {
  const tokens = parseNoteTokens(currentNote);
  const tagLower = tag.toLowerCase();
  const hasTag = tokens.some((t) => t.toLowerCase() === tagLower);

  let nextTokens = tokens;
  if (group?.exclusive) {
    const groupSet = new Set(group.tags.map((g) => g.toLowerCase()));
    nextTokens = tokens.filter((t) => !groupSet.has(t.toLowerCase()));
    if (!hasTag) nextTokens.unshift(tag);
  } else if (hasTag) {
    nextTokens = tokens.filter((t) => t.toLowerCase() !== tagLower);
  } else {
    nextTokens = [...tokens, tag];
  }
  return nextTokens.join(', ');
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
  return [...list].sort((a, b) => {
    const rankDiff = kasirOrderPriorityRank(a) - kasirOrderPriorityRank(b);
    if (rankDiff !== 0) return rankDiff;
    const tA = a.updatedAt || a.createdAt || '';
    const tB = b.updatedAt || b.createdAt || '';
    return tB.localeCompare(tA);
  });
}

export function mount(ctx) {
  const { session, signal, subscribeStore } = ctx;
  let menuList = [];
  let menuReady = false;
  let menuPage = 1;
  let ordersList = [];
  let ordersReady = false;
  let settings = session.settings || {};
  let catFilter = 'all';
  let serviceType = 'dine_in';
  let editingOrderId = null;
  let cart = [];
  const expandedNoteItems = new WeakSet();
  let currentStep = 0;
  let pendingCancelOrder = null;
  let pendingDeleteOrder = null;

  const cancelModalEl = document.getElementById('cancelModal');
  const deleteModalEl = document.getElementById('deleteModal');
  const cancelModal = cancelModalEl ? new globalThis.bootstrap.Modal(cancelModalEl) : null;
  const deleteModal = deleteModalEl ? new globalThis.bootstrap.Modal(deleteModalEl) : null;

  // Inisialisasi panel collapsible (Daftar Pesanan pakai CardWidget, Tulis Menu Manual pakai Collapse datar tanpa card)
  initCollapsibleCard('orders-list-card', ORDERS_COLLAPSE_KEY, globalThis.innerWidth < 768, signal);
  initCollapsiblePanel(
    'custom-menu-collapse',
    'btn-toggle-custom-menu',
    'custom-menu-chevron',
    CUSTOM_MENU_COLLAPSE_KEY,
    true,
    signal
  );

  const steps = Array.from(document.querySelectorAll('#order-wizard-card .wizard-step'));
  const indicators = Array.from(document.querySelectorAll('#wizard-steps li'));
  const prevBtn = document.getElementById('wz-prev');
  const nextBtn = document.getElementById('wz-next');
  const submitBtn = document.getElementById('btn-submit-order');

  const renderWizardSummary = () => {
    const summaryEl = document.getElementById('wz-summary');
    if (!summaryEl) return;
    summaryEl.replaceChildren();

    const customer = (document.getElementById('order-customer')?.value || '').trim() || 'Tamu';
    const tableNum = (document.getElementById('order-table')?.value || '').trim();
    const notes = (document.getElementById('order-notes')?.value || '').trim();
    const total = cart.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0);
    const totalQty = cart.reduce((sum, it) => sum + Number(it.qty || 0), 0);

    const addRow = (label, valueNode) => {
      summaryEl.appendChild(el('dt', { className: 'col-sm-4 text-secondary fw-normal mb-2', textContent: label }));
      summaryEl.appendChild(
        el(
          'dd',
          { className: 'col-sm-8 fw-semibold mb-2' },
          typeof valueNode === 'string' ? [valueNode] : valueNode
        )
      );
    };

    addRow('Pembeli', customer);
    addRow(
      'Layanan',
      serviceType === 'dine_in'
        ? el('span', { className: 'badge text-bg-primary', textContent: `Makan di Tempat · Meja ${tableNum || '-'}` })
        : el('span', { className: 'badge text-bg-dark', textContent: 'Dibungkus (Take Away)' })
    );
    addRow(
      `Daftar Menu (${totalQty} item)`,
      el(
        'div',
        { className: 'd-flex flex-column gap-1' },
        cart.map((it) =>
          el('div', { className: 'small' }, [
            el('span', {
              className: `badge ${it.category === 'makanan' ? 'text-bg-warning' : 'text-bg-info'} me-1`,
              textContent: `${it.qty}×`,
            }),
            `${it.name} — ${formatRupiah(it.price * it.qty)}`,
            it.note ? el('span', { className: 'text-secondary fst-italic ms-1', textContent: `(${it.note})` }) : null,
          ])
        )
      )
    );
    if (notes) addRow('Catatan Dapur', notes);
    addRow('Total Estimasi', el('span', { className: 'fs-5 fw-bold text-primary', textContent: formatRupiah(total) }));
  };

  const showStep = (idx) => {
    currentStep = Math.min(Math.max(0, idx), Math.max(0, steps.length - 1));
    steps.forEach((s, i) => s.classList.toggle('d-none', i !== currentStep));
    indicators.forEach((li, i) => {
      li.classList.toggle('active', i === currentStep);
      li.classList.toggle('completed', i < currentStep);
    });
    if (prevBtn) prevBtn.disabled = currentStep === 0;
    const isLast = currentStep === steps.length - 1;
    if (nextBtn) nextBtn.classList.toggle('d-none', isLast);
    if (submitBtn) submitBtn.classList.toggle('d-none', !isLast);
    if (isLast) renderWizardSummary();
  };

  const validateStep = (idx) => {
    if (idx === 0 && cart.length === 0) {
      showToast('Pilih atau tulis minimal 1 makanan/minuman terlebih dahulu.', 'warning');
      return false;
    }
    if (idx === 1) {
      const tableInput = document.getElementById('order-table');
      tableInput?.classList.remove('is-invalid');
      const tableNumber = (tableInput?.value || '').trim();
      if (serviceType === 'dine_in' && !tableNumber) {
        tableInput?.classList.add('is-invalid');
        tableInput?.focus();
        showToast('Nomor meja wajib diisi untuk layanan Makan di Tempat.', 'warning');
        return false;
      }
    }
    return true;
  };

  prevBtn?.addEventListener(
    'click',
    () => {
      if (currentStep > 0) showStep(currentStep - 1);
    },
    { signal }
  );

  nextBtn?.addEventListener(
    'click',
    () => {
      if (!validateStep(currentStep)) return;
      if (currentStep < steps.length - 1) {
        showStep(currentStep + 1);
      }
    },
    { signal }
  );

  indicators.forEach((li) => {
    li.addEventListener(
      'click',
      () => {
        const target = Number.parseInt(li.dataset.step || '0', 10);
        if (target === currentStep) return;
        if (target < currentStep) {
          showStep(target);
          return;
        }
        // Validasi langkah berurutan jika melompat maju
        for (let s = currentStep; s < target; s += 1) {
          if (!validateStep(s)) return;
        }
        showStep(target);
      },
      { signal }
    );
  });

  const syncServiceButtons = () => {
    const dineBtn = document.getElementById('svc-dine-in');
    const takeBtn = document.getElementById('svc-take-away');
    const tableWrap = document.getElementById('table-number-wrap');
    if (!dineBtn || !takeBtn || !tableWrap) return;
    if (serviceType === 'dine_in') {
      dineBtn.className = 'btn btn-sm btn-primary service-type-btn';
      takeBtn.className = 'btn btn-sm btn-outline-secondary service-type-btn';
      tableWrap.classList.remove('d-none');
    } else {
      dineBtn.className = 'btn btn-sm btn-outline-secondary service-type-btn';
      takeBtn.className = 'btn btn-sm btn-primary service-type-btn';
      tableWrap.classList.add('d-none');
      document.getElementById('order-table')?.classList.remove('is-invalid');
    }
  };

  document.getElementById('svc-dine-in')?.addEventListener(
    'click',
    () => {
      serviceType = 'dine_in';
      syncServiceButtons();
    },
    { signal }
  );
  document.getElementById('svc-take-away')?.addEventListener(
    'click',
    () => {
      serviceType = 'take_away';
      syncServiceButtons();
    },
    { signal }
  );

  const renderCart = () => {
    const wrap = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const badgeEl = document.getElementById('wz-cart-badge');
    if (!wrap || !totalEl) return;
    wrap.replaceChildren();

    const totalQty = cart.reduce((sum, it) => sum + Number(it.qty || 0), 0);
    const total = cart.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0);

    if (badgeEl) badgeEl.textContent = `${totalQty} item · ${formatRupiah(total)}`;

    if (cart.length === 0) {
      wrap.appendChild(
        el('div', {
          className: 'list-group-item text-center text-secondary small py-2',
          textContent: 'Belum ada menu dipilih. Klik menu atau buka "Tulis Menu Manual".',
        })
      );
      totalEl.textContent = 'Rp 0';
      return;
    }

    cart.forEach((item, idx) => {
      const catPill =
        item.category === 'makanan'
          ? el('span', { className: 'badge text-bg-warning me-1', textContent: 'Makanan' })
          : el('span', { className: 'badge text-bg-info me-1', textContent: 'Minuman' });

      const isOptsOpen = expandedNoteItems.has(item);
      const groups = getQuickNoteGroups(item);
      const chipEntries = [];

      const syncChipStates = () => {
        const activeSet = new Set(parseNoteTokens(cart[idx]?.note).map((t) => t.toLowerCase()));
        for (const entry of chipEntries) {
          const active = activeSet.has(entry.tag.toLowerCase());
          entry.btn.className = `btn btn-xs quick-note-chip ${active ? 'btn-primary' : 'btn-outline-secondary'}`;
          entry.btn.setAttribute('aria-pressed', String(active));
        }
      };

      const noteInput = el('input', {
        type: 'text',
        className: 'form-control form-control-sm',
        placeholder: 'Catatan menu (opsional)...',
        value: item.note || '',
        onInput: (e) => {
          cart[idx].note = e.target.value;
          syncChipStates();
        },
      });

      const toggleChevron = el('i', { className: `bi ${isOptsOpen ? 'bi-chevron-up' : 'bi-chevron-down'} ms-1` });
      const toggleBtn = el(
        'button',
        {
          type: 'button',
          className: `btn btn-sm quick-note-toggle ${isOptsOpen ? 'btn-primary' : 'btn-outline-secondary'}`,
          'aria-expanded': String(isOptsOpen),
          title: 'Buka / ciutkan tombol opsi catatan menu',
        },
        [el('i', { className: 'bi bi-sliders2 me-1' }), 'Opsi', toggleChevron]
      );

      const trayEl = el('div', {
        className: `quick-note-tray border rounded p-1 mt-1 bg-body${isOptsOpen ? '' : ' d-none'}`,
      });

      const setTrayOpen = (open) => {
        if (open) expandedNoteItems.add(item);
        else expandedNoteItems.delete(item);
        trayEl.classList.toggle('d-none', !open);
        toggleBtn.className = `btn btn-sm quick-note-toggle ${open ? 'btn-primary' : 'btn-outline-secondary'}`;
        toggleBtn.setAttribute('aria-expanded', String(open));
        toggleChevron.className = `bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'} ms-1`;
      };

      toggleBtn.addEventListener('click', () => setTrayOpen(trayEl.classList.contains('d-none')));

      const collapseBtn = el(
        'button',
        {
          type: 'button',
          className: 'btn btn-link btn-xs p-0 text-secondary text-decoration-none quick-note-collapse-btn',
          onClick: () => setTrayOpen(false),
        },
        ['Ciutkan ', el('i', { className: 'bi bi-chevron-up' })]
      );

      trayEl.appendChild(
        el('div', { className: 'd-flex justify-content-between align-items-center pb-1 border-bottom' }, [
          el('span', { className: 'quick-note-label text-secondary fw-semibold', textContent: 'Catatan Cepat' }),
          collapseBtn,
        ])
      );

      for (const group of groups) {
        const chipNodes = group.tags.map((tag) => {
          const btn = el('button', {
            type: 'button',
            className: 'btn btn-xs quick-note-chip btn-outline-secondary',
            textContent: tag,
            onClick: () => {
              cart[idx].note = toggleQuickNoteTag(cart[idx].note, tag, group);
              noteInput.value = cart[idx].note;
              syncChipStates();
            },
          });
          chipEntries.push({ tag, btn });
          return btn;
        });

        trayEl.appendChild(
          el('div', { className: 'd-flex flex-wrap align-items-center gap-1 mt-1' }, [
            el('span', { className: 'quick-note-label text-secondary fw-semibold me-1', textContent: `${group.label}:` }),
            ...chipNodes,
          ])
        );
      }
      syncChipStates();

      const noteControls = el('div', { className: 'mt-1' }, [
        el('div', { className: 'input-group input-group-sm' }, [noteInput, toggleBtn]),
        trayEl,
      ]);

      const row = el('div', { className: 'list-group-item py-1 px-2' }, [
        el('div', { className: 'd-flex flex-wrap justify-content-between align-items-center gap-1' }, [
          el('div', { className: 'flex-grow-1 min-w-0' }, [
            el('div', { className: 'fw-semibold small text-break' }, [catPill, item.name]),
            el('div', {
              className: 'text-secondary small',
              textContent: `${formatRupiah(item.price)} × ${item.qty} = ${formatRupiah(item.price * item.qty)}`,
            }),
          ]),
          el('div', { className: 'd-flex align-items-center gap-1 flex-shrink-0 ms-auto' }, [
            el('div', { className: 'input-group input-group-sm cart-qty-box', style: 'width: 96px;' }, [
              el('button', {
                type: 'button',
                className: 'btn btn-outline-secondary',
                textContent: '−',
                onClick: () => {
                  if (cart[idx].qty > 1) {
                    cart[idx].qty -= 1;
                  } else {
                    cart.splice(idx, 1);
                  }
                  renderCart();
                },
              }),
              el('span', { className: 'input-group-text bg-body fw-bold justify-content-center flex-grow-1', textContent: String(item.qty) }),
              el('button', {
                type: 'button',
                className: 'btn btn-outline-secondary',
                textContent: '+',
                onClick: () => {
                  cart[idx].qty += 1;
                  renderCart();
                },
              }),
            ]),
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-sm btn-outline-danger',
                ariaLabel: 'Hapus item',
                onClick: () => {
                  cart.splice(idx, 1);
                  renderCart();
                },
              },
              [el('i', { className: 'bi bi-x-lg' })]
            ),
          ]),
        ]),
        noteControls,
      ]);
      wrap.appendChild(row);
    });

    totalEl.textContent = formatRupiah(total);
  };

  const addToCart = (item) => {
    const idx = cart.findIndex(
      (c) =>
        c.name.toLowerCase() === item.name.toLowerCase() &&
        c.category === item.category &&
        (c.note || '') === (item.note || '') &&
        c.price === item.price
    );
    if (idx >= 0) {
      cart[idx].qty += item.qty || 1;
    } else {
      cart.push({
        menuItemId: item.menuItemId || null,
        name: item.name,
        category: item.category,
        qty: item.qty || 1,
        price: Number(item.price || 0),
        note: item.note || '',
      });
    }
    renderCart();
  };

  const renderMenu = () => {
    const grid = document.getElementById('menu-grid');
    const footerEl = document.getElementById('menu-pagination-footer');
    const listEl = document.getElementById('menu-pagination');
    const infoEl = document.getElementById('menu-page-info');
    if (!grid) return;
    grid.replaceChildren();

    if (!menuReady && menuList.length === 0) {
      footerEl?.classList.add('d-none');
      for (let i = 0; i < 8; i += 1) {
        grid.appendChild(
          el('div', { className: 'col-6 col-sm-4 col-xl-3' }, [
            el('div', { className: 'border rounded p-1 px-2 placeholder-glow mb-0 bg-body' }, [
              el('span', { className: 'placeholder col-5 mb-1 rounded' }),
              el('span', { className: 'placeholder col-10 mb-1 rounded' }),
              el('span', { className: 'placeholder col-6 rounded' }),
            ]),
          ])
        );
      }
      return;
    }

    const q = (document.getElementById('menu-search')?.value || '').trim().toLowerCase();
    const filtered = menuList.filter((m) => {
      if (catFilter !== 'all' && m.category !== catFilter) return false;
      if (q && !(m.name || '').toLowerCase().includes(q)) return false;
      return true;
    });

    if (filtered.length === 0) {
      footerEl?.classList.add('d-none');
      grid.appendChild(
        el('div', {
          className: 'col-12 text-center text-secondary py-3',
          textContent: 'Menu tidak ditemukan. Gunakan form "Tulis Menu Manual" di bawah jika perlu.',
        })
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
        renderMenu();
      },
      unitLabel: 'menu',
    });
    menuPage = pg.page;
    const pageItems = filtered.slice(pg.startIndex, pg.endIndex);

    for (const m of pageItems) {
      const avail = m.isAvailable !== false;
      const catBadge =
        m.category === 'makanan'
          ? el('span', { className: 'badge text-bg-warning', textContent: 'Makanan' })
          : el('span', { className: 'badge text-bg-info', textContent: 'Minuman' });

      const card = el(
        'button',
        {
          type: 'button',
          title: m.name,
          className: `menu-pick-tile w-100 h-100 text-start border rounded p-1 px-2 bg-body d-flex flex-column justify-content-between${avail ? '' : ' menu-unavailable'}`,
          onClick: () => {
            if (!avail) {
              showToast(`Menu "${m.name}" sedang ditandai habis.`, 'warning');
              return;
            }
            addToCart({
              menuItemId: m.id,
              name: m.name,
              category: m.category,
              qty: 1,
              price: m.price,
            });
          },
        },
        [
          el('div', { className: 'd-flex justify-content-between align-items-center gap-1 w-100 mb-1' }, [
            catBadge,
            avail
              ? el('span', { className: 'text-primary small fw-bold' }, [el('i', { className: 'bi bi-plus-circle-fill' })])
              : el('span', { className: 'badge text-bg-secondary', textContent: 'Habis' }),
          ]),
          el('div', { className: 'fw-semibold menu-pick-title text-truncate w-100', textContent: m.name }),
          el('div', {
            className: 'text-secondary menu-pick-price',
            textContent: Number(m.price) > 0 ? formatRupiah(m.price) : 'Tergantung ikan',
          }),
        ]
      );
      grid.appendChild(el('div', { className: 'col-6 col-sm-4 col-xl-3' }, [card]));
    }
  };

  const resetCartMode = () => {
    editingOrderId = null;
    cart = [];
    serviceType = 'dine_in';
    syncServiceButtons();
    document.getElementById('order-customer').value = '';
    document.getElementById('order-table').value = '';
    document.getElementById('order-notes').value = '';
    document.getElementById('cart-title').innerHTML = '<i class="bi bi-bag-check me-1"></i> Pesanan Baru';
    document.getElementById('btn-cancel-edit').classList.add('d-none');
    document.getElementById('edit-banner').classList.add('d-none');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="bi bi-send-check me-1"></i> Kirim Pesanan ke Dapur';
    }
    renderCart();
    showStep(0);
  };

  const loadOrderIntoEditor = (ord) => {
    editingOrderId = ord.id;
    serviceType = ord.serviceType || 'dine_in';
    syncServiceButtons();
    document.getElementById('order-customer').value = ord.customerName || '';
    document.getElementById('order-table').value = ord.tableNumber || '';
    document.getElementById('order-notes').value = ord.notes || '';
    cart = (ord.items || []).map((it) => ({ ...it }));
    document.getElementById('cart-title').innerHTML = '<i class="bi bi-pencil-square me-1"></i> Edit Pesanan';
    document.getElementById('edit-order-code').textContent = ord.orderCode || ord.id;
    document.getElementById('btn-cancel-edit').classList.remove('d-none');
    document.getElementById('edit-banner').classList.remove('d-none');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="bi bi-save me-1"></i> Simpan Perubahan Pesanan';
    }
    renderCart();
    showStep(0);
    globalThis.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const renderOrdersTable = () => {
    const countBadge = document.getElementById('orders-count-badge');
    const readyBadge = document.getElementById('orders-ready-badge');
    if (countBadge) countBadge.textContent = String(ordersList.length);
    if (readyBadge) {
      const readyCount = ordersList.filter((o) => o.status === 'ready').length;
      readyBadge.textContent = `${readyCount} Siap`;
      readyBadge.classList.toggle('d-none', readyCount === 0);
    }

    const tbody = document.getElementById('orders-table-body');
    const mobileList = document.getElementById('orders-mobile-list');
    if (!tbody || !mobileList) return;
    tbody.replaceChildren();
    mobileList.replaceChildren();

    if (!ordersReady && ordersList.length === 0) {
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

    const statusFilter = document.getElementById('orders-status-filter')?.value || 'all';
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

    if (filtered.length === 0) {
      tbody.appendChild(
        el('tr', {}, [
          el('td', {
            colSpan: 6,
            className: 'text-center text-secondary py-4',
            textContent: 'Tidak ada pesanan yang cocok.',
          }),
        ])
      );
      mobileList.appendChild(
        el('div', {
          className: 'text-center text-secondary py-4 small',
          textContent: 'Tidak ada pesanan yang cocok.',
        })
      );
      return;
    }

    const completeSectionOrOrder = async (ord, section) => {
      try {
        await apiFetch(`/api/orders/${ord.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'completed', section }),
        });
        const label = section === 'food' ? 'Makanan ' : section === 'drink' ? 'Minuman ' : 'Pesanan ';
        showToast(`${label}${ord.orderCode} ditandai selesai.`, 'success');
      } catch (err) {
        showToast(err.message, 'danger');
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
              onClick: () => completeSectionOrOrder(ord, 'all'),
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
                onClick: () => completeSectionOrOrder(ord, 'food'),
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
                onClick: () => completeSectionOrOrder(ord, 'drink'),
              },
              [el('i', { className: 'bi bi-check2 me-1' }), 'Mnm Selesai']
            )
          );
        }
      }

      if (canKasirEdit(ord)) {
        actions.push(
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-sm btn-outline-primary',
              onClick: () => loadOrderIntoEditor(ord),
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
          el('td', { className: 'fw-semibold', textContent: formatRupiah(ord.totalAmount) }),
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

  for (const btn of document.querySelectorAll('.cat-filter')) {
    btn.addEventListener(
      'click',
      () => {
        catFilter = btn.dataset.cat;
        menuPage = 1;
        for (const b of document.querySelectorAll('.cat-filter')) {
          b.className = b.dataset.cat === catFilter ? 'btn btn-sm btn-primary cat-filter' : 'btn btn-sm btn-outline-primary cat-filter';
        }
        renderMenu();
      },
      { signal }
    );
  }
  document.getElementById('menu-search')?.addEventListener(
    'input',
    () => {
      menuPage = 1;
      renderMenu();
    },
    { signal }
  );
  document.getElementById('orders-status-filter')?.addEventListener('change', renderOrdersTable, { signal });
  document.getElementById('orders-search')?.addEventListener('input', renderOrdersTable, { signal });
  document.getElementById('btn-clear-cart')?.addEventListener(
    'click',
    () => {
      cart = [];
      renderCart();
    },
    { signal }
  );
  document.getElementById('btn-cancel-edit')?.addEventListener('click', resetCartMode, { signal });

  document.getElementById('custom-item-form')?.addEventListener(
    'submit',
    (e) => {
      e.preventDefault();
      const name = document.getElementById('custom-name').value.trim();
      const category = document.getElementById('custom-cat').value;
      const qty = Number.parseInt(document.getElementById('custom-qty').value || '1', 10);
      const price = Number.parseInt(document.getElementById('custom-price').value || '0', 10);
      const note = document.getElementById('custom-note').value.trim();
      if (!name) return;
      addToCart({ name, category, qty: Math.max(1, qty), price: Math.max(0, price), note });
      e.target.reset();
      document.getElementById('custom-qty').value = '1';
      document.getElementById('custom-price').value = '0';
      showToast(`"${name}" ditambahkan ke pesanan.`, 'info');
    },
    { signal }
  );

  submitBtn?.addEventListener(
    'click',
    async () => {
      if (!validateStep(0)) {
        showStep(0);
        return;
      }
      if (!validateStep(1)) {
        showStep(1);
        return;
      }
      const tableNumber = document.getElementById('order-table').value.trim();
      const payload = {
        customerName: document.getElementById('order-customer').value.trim() || 'Tamu',
        serviceType,
        tableNumber: serviceType === 'dine_in' ? tableNumber : '',
        notes: document.getElementById('order-notes').value.trim(),
        items: cart,
      };

      submitBtn.disabled = true;
      try {
        if (editingOrderId) {
          const res = await apiFetch(`/api/orders/${editingOrderId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          showToast(`Pesanan ${res.order.orderCode} berhasil diperbarui & dikirim ke Chef.`, 'success');
        } else {
          const res = await apiFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          showToast(`Pesanan ${res.order.orderCode} terkirim ke Layar Chef!`, 'success');
        }
        resetCartMode();
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        submitBtn.disabled = false;
      }
    },
    { signal }
  );

  document.getElementById('confirm-cancel-btn')?.addEventListener(
    'click',
    async () => {
      if (!pendingCancelOrder) return;
      const reason = document.getElementById('cancel-reason-input').value.trim() || 'Dibatalkan oleh kasir';
      try {
        await apiFetch(`/api/orders/${pendingCancelOrder.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled', cancelReason: reason }),
        });
        showToast(`Pesanan ${pendingCancelOrder.orderCode} dibatalkan.`, 'warning');
        if (editingOrderId === pendingCancelOrder.id) resetCartMode();
        document.activeElement?.blur();
        cancelModal?.hide();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    },
    { signal }
  );

  document.getElementById('confirm-delete-btn')?.addEventListener(
    'click',
    async () => {
      if (!pendingDeleteOrder) return;
      try {
        await apiFetch(`/api/orders/${pendingDeleteOrder.id}`, { method: 'DELETE' });
        showToast(`Pesanan ${pendingDeleteOrder.orderCode} dihapus permanen.`, 'success');
        if (editingOrderId === pendingDeleteOrder.id) resetCartMode();
        document.activeElement?.blur();
        deleteModal?.hide();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    },
    { signal }
  );

  showStep(0);

  subscribeStore((snap) => {
    menuList = snap.menu || [];
    menuReady = Boolean(snap.menuReady);
    ordersList = snap.orders || [];
    ordersReady = Boolean(snap.ordersReady);
    if (snap.settings) settings = snap.settings;
    renderMenu();
    renderOrdersTable();
  });

  return () => {
    cancelModal?.dispose();
    deleteModal?.dispose();
  };
}

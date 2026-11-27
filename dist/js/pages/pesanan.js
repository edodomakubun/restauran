// Modul halaman Kasir Buat & Edit Pesanan (pesanan.html) dengan Wizard 3 Langkah AdminLTE 4,
// Form Menu Manual Collapsible, dan Paginasi Menu.
import {
  apiFetch,
  el,
  formatRupiah,
  initCollapsibleCard,
  initCollapsiblePanel,
  renderPagination,
  showToast,
  statusLabel,
  upsertOrderInStore,
} from '../app-client.js';

const WIZARD_COLLAPSE_KEY = 'restoran_wizard_collapsed';
const CUSTOM_MENU_COLLAPSE_KEY = 'restoran_custom_menu_collapsed';
const MENU_PAGE_SIZE = 12;
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

export function mount(ctx) {
  const { session, signal, navigate, subscribeStore } = ctx;
  const initialQuery = new URLSearchParams(globalThis.location.search);
  const initialFromParam = initialQuery.get('from');
  let editReturnHref = initialFromParam === 'meja' ? './meja.html' : './daftar-pesanan.html';
  let menuList = [];
  let menuReady = false;
  let menuPage = 1;
  let ordersList = [];
  let catFilter = 'all';
  let serviceType = 'dine_in';
  let editingOrderId = null;
  let handledEditParam = false;
  let storeEmissions = 0;
  let missingEditTimer = null;
  let cart = [];
  const expandedNoteItems = new WeakSet();
  const editingPriceItems = new WeakSet();
  let currentStep = 0;

  // Inisialisasi panel collapsible (Wizard pakai CardWidget, Tulis Menu Manual pakai Collapse datar tanpa card)
  initCollapsibleCard('order-wizard-card', WIZARD_COLLAPSE_KEY, false, signal);
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
    if (submitBtn) submitBtn.classList.toggle('d-none', !isLast && !editingOrderId);
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
      dineBtn.className = 'btn btn-xs btn-primary service-type-btn';
      takeBtn.className = 'btn btn-xs btn-outline-secondary service-type-btn';
      tableWrap.classList.remove('d-none');
    } else {
      dineBtn.className = 'btn btn-xs btn-outline-secondary service-type-btn';
      takeBtn.className = 'btn btn-xs btn-primary service-type-btn';
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

    const itemKey = (it) => `${it.category}|${String(it.name || '').trim().toLowerCase()}`;
    const totalByKey = new Map();
    for (const it of cart) {
      const k = itemKey(it);
      totalByKey.set(k, (totalByKey.get(k) || 0) + 1);
    }
    const seenByKey = new Map();

    cart.forEach((item, idx) => {
      const k = itemKey(item);
      const countForKey = totalByKey.get(k) || 1;
      const variantNum = (seenByKey.get(k) || 0) + 1;
      seenByKey.set(k, variantNum);

      const catPill =
        item.category === 'makanan'
          ? el('span', { className: 'badge text-bg-warning me-1', textContent: 'Makanan' })
          : el('span', { className: 'badge text-bg-info me-1', textContent: 'Minuman' });
      const variantBadge =
        countForKey > 1
          ? el('span', {
              className: 'badge text-bg-light text-secondary border ms-1',
              textContent: `#${variantNum}`,
              title: `Varian ke-${variantNum} untuk ${item.name}`,
            })
          : null;
      const kitchenStatusBadge =
        editingOrderId && item.itemStatus && item.itemStatus !== 'pending' && item.itemStatus !== 'cancelled'
          ? el('span', {
              className: `badge ms-1 ${
                item.itemStatus === 'ready'
                  ? 'text-bg-success'
                  : item.itemStatus === 'completed'
                    ? 'text-bg-secondary'
                    : 'text-bg-primary'
              }`,
              textContent:
                item.itemStatus === 'ready'
                  ? 'Siap'
                  : item.itemStatus === 'completed'
                    ? 'Diambil'
                    : 'Dimasak',
              title: 'Status item saat ini di dapur',
            })
          : null;

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
          className: `btn btn-xs quick-note-toggle ${isOptsOpen ? 'btn-primary' : 'btn-outline-secondary'}`,
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
        toggleBtn.className = `btn btn-xs quick-note-toggle ${open ? 'btn-primary' : 'btn-outline-secondary'}`;
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

      const splitOrVariantBtn = el(
        'button',
        {
          type: 'button',
          className: `btn btn-xs ${item.qty > 1 ? 'btn-outline-primary' : 'btn-outline-secondary'}`,
          title:
            item.qty > 1
              ? 'Pisah 1 porsi ke baris baru agar bisa diberi catatan/level pedas berbeda'
              : 'Tambah 1 porsi lagi dengan catatan/opsi berbeda',
          onClick: () => {
            if (cart[idx].qty > 1) {
              cart[idx].qty -= 1;
            }
            const variantItem = {
              menuItemId: item.menuItemId || null,
              name: item.name,
              category: item.category,
              qty: 1,
              price: Number(item.price || 0),
              note: '',
            };
            expandedNoteItems.add(variantItem);
            cart.splice(idx + 1, 0, variantItem);
            renderCart();
          },
        },
        [
          el('i', { className: `bi ${item.qty > 1 ? 'bi-scissors' : 'bi-plus-square-dotted'} me-1` }),
          item.qty > 1 ? 'Pisah' : '+ Varian',
        ]
      );

      const isEditingPrice = editingPriceItems.has(item);
      const priceRow = isEditingPrice
        ? el(
            'form',
            {
              className: 'd-flex flex-wrap align-items-center gap-1 mt-1',
              onSubmit: (e) => {
                e.preventDefault();
                const rawVal = Number.parseInt(e.currentTarget.querySelector('input')?.value || '0', 10);
                cart[idx].price = Number.isFinite(rawVal) && rawVal >= 0 ? rawVal : 0;
                editingPriceItems.delete(item);
                renderCart();
              },
            },
            [
              el('span', { className: 'small text-secondary', textContent: 'Rp' }),
              el('input', {
                type: 'number',
                min: '0',
                step: '500',
                className: 'form-control form-control-sm',
                style: 'width: 96px; padding: 0.12rem 0.35rem; font-size: 0.78rem;',
                value: String(Math.max(0, Number(item.price || 0))),
                ariaLabel: `Harga satuan ${item.name}`,
                onInput: (e) => {
                  const val = Number.parseInt(e.target.value || '0', 10);
                  cart[idx].price = Number.isFinite(val) && val >= 0 ? val : 0;
                  const sumTotal = cart.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
                  const sumQty = cart.reduce((s, it) => s + Number(it.qty || 0), 0);
                  totalEl.textContent = formatRupiah(sumTotal);
                  if (badgeEl) badgeEl.textContent = `${sumQty} item · ${formatRupiah(sumTotal)}`;
                },
              }),
              el('button', { type: 'submit', className: 'btn btn-xs btn-primary', textContent: 'OK' }),
              el('button', {
                type: 'button',
                className: 'btn btn-xs btn-outline-secondary',
                textContent: 'Batal',
                onClick: () => {
                  editingPriceItems.delete(item);
                  renderCart();
                },
              }),
            ]
          )
        : el('div', { className: 'text-secondary small d-flex flex-wrap align-items-center gap-1' }, [
            el('span', {
              textContent:
                Number(item.price) > 0
                  ? `${formatRupiah(item.price)} × ${item.qty} = ${formatRupiah(item.price * item.qty)}`
                  : `Harga belum diset × ${item.qty}`,
            }),
            el(
              'button',
              {
                type: 'button',
                className: `btn btn-link btn-xs p-0 text-decoration-none ${Number(item.price) === 0 ? 'text-primary fw-semibold' : 'text-secondary'}`,
                title: 'Ubah harga satuan menu ini',
                onClick: () => {
                  editingPriceItems.add(item);
                  renderCart();
                },
              },
              Number(item.price) === 0 ? ['Isi Harga'] : [el('i', { className: 'bi bi-pencil' })]
            ),
          ]);

      const row = el('div', { className: 'list-group-item py-1 px-2' }, [
        el('div', { className: 'd-flex flex-wrap justify-content-between align-items-center gap-1' }, [
          el('div', { className: 'flex-grow-1 min-w-0' }, [
            el('div', { className: 'fw-semibold small text-break' }, [catPill, item.name, variantBadge, kitchenStatusBadge]),
            priceRow,
          ]),
          el('div', { className: 'd-flex align-items-center gap-1 flex-shrink-0 ms-auto' }, [
            splitOrVariantBtn,
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
                  if (editingOrderId && (cart[idx].itemStatus === 'ready' || cart[idx].itemStatus === 'completed')) {
                    cart.splice(idx + 1, 0, {
                      menuItemId: item.menuItemId || null,
                      name: item.name,
                      category: item.category,
                      qty: 1,
                      price: Number(item.price || 0),
                      note: item.note || '',
                      itemStatus: 'pending',
                    });
                    renderCart();
                    showToast(`1 porsi baru "${item.name}" ditambahkan ke antrean dapur.`, 'info');
                    return;
                  }
                  cart[idx].qty += 1;
                  renderCart();
                },
              }),
            ]),
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-xs btn-outline-danger',
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
        Number(c.price || 0) === Number(item.price || 0) &&
        c.itemStatus !== 'ready' &&
        c.itemStatus !== 'completed'
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
      for (let i = 0; i < 12; i += 1) {
        grid.appendChild(
          el('div', { className: 'col-6 col-sm-4 col-md-3 col-xl-2' }, [
            el('div', { className: 'border rounded p-1 placeholder-glow mb-0 bg-body' }, [
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
          className: `menu-pick-tile w-100 h-100 text-start border rounded p-1 bg-body d-flex flex-column justify-content-between${avail ? '' : ' menu-unavailable'}`,
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
              ? el('span', { className: 'text-primary small fw-bold', style: 'font-size: 0.72rem;' }, [el('i', { className: 'bi bi-plus-circle-fill' })])
              : el('span', { className: 'badge text-bg-secondary', textContent: 'Habis' }),
          ]),
          el('div', { className: 'fw-semibold menu-pick-title text-truncate w-100', textContent: m.name }),
          el('div', {
            className: 'text-secondary menu-pick-price',
            textContent: Number(m.price) > 0 ? formatRupiah(m.price) : 'Tergantung ikan',
          }),
        ]
      );
      grid.appendChild(el('div', { className: 'col-6 col-sm-4 col-md-3 col-xl-2' }, [card]));
    }
  };

  const resetCartMode = () => {
    editingOrderId = null;
    editReturnHref = './daftar-pesanan.html';
    cart = [];
    serviceType = 'dine_in';
    syncServiceButtons();
    document.getElementById('order-customer').value = '';
    document.getElementById('order-table').value = '';
    document.getElementById('order-table')?.classList.remove('is-invalid');
    document.getElementById('order-notes').value = '';
    document.getElementById('cart-title').innerHTML = '<i class="bi bi-bag-check me-1"></i> Pesanan Baru';
    document.getElementById('btn-cancel-edit').classList.add('d-none');
    document.getElementById('edit-banner').classList.add('d-none');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="bi bi-send-check me-1"></i> Kirim Pesanan ke Dapur';
    }
    renderCart();
    renderTableQuickChips();
    showStep(0);
    if (globalThis.location.search.includes('edit=')) {
      history.replaceState(null, '', './pesanan.html');
    }
  };

  const loadOrderIntoEditor = (ord) => {
    editingOrderId = ord.id;
    serviceType = ord.serviceType || 'dine_in';
    syncServiceButtons();
    const custEl = document.getElementById('order-customer');
    const tableEl = document.getElementById('order-table');
    const notesEl = document.getElementById('order-notes');
    if (custEl) custEl.value = ord.customerName || '';
    if (tableEl) {
      tableEl.value = ord.tableNumber || '';
      tableEl.classList.remove('is-invalid');
    }
    if (notesEl) notesEl.value = ord.notes || '';
    cart = (ord.items || []).map((it) => ({ ...it }));
    document.getElementById('cart-title').innerHTML = '<i class="bi bi-pencil-square me-1"></i> Edit Pesanan';

    const bannerEl = document.getElementById('edit-banner');
    if (bannerEl) {
      const stMeta = statusLabel(ord.status);
      const svcMeta = serviceType === 'dine_in' ? `Meja ${ord.tableNumber || '-'}` : 'Dibungkus';
      bannerEl.replaceChildren(
        el('i', { className: 'bi bi-pencil-square me-1' }),
        'Mengedit ',
        el('strong', { id: 'edit-order-code', textContent: ord.orderCode || ord.id }),
        ` · ${ord.customerName || 'Tamu'} (${svcMeta}) `,
        el('span', { className: `badge ${stMeta.badge} ms-1`, textContent: stMeta.text }),
        ord.paymentStatus === 'paid'
          ? el('span', {
              className: 'ms-1 fw-semibold text-warning-emphasis',
              textContent: '· Sudah Lunas (cek ulang pembayaran bila total berubah)',
            })
          : ' · Ubah menu atau detail lalu klik Simpan Perubahan.'
      );
      bannerEl.classList.remove('d-none');
    }

    document.getElementById('btn-cancel-edit').classList.remove('d-none');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="bi bi-save me-1"></i> Simpan Perubahan Pesanan';
    }
    renderCart();
    renderTableQuickChips();
    showStep(0);
    const wizardCard = document.getElementById('order-wizard-card');
    if (wizardCard?.classList.contains('collapsed-card')) {
      document.getElementById('btn-toggle-wizard')?.click();
    }
    globalThis.scrollTo({ top: 0, behavior: 'smooth' });
  };

  for (const btn of document.querySelectorAll('.cat-filter')) {
    btn.addEventListener(
      'click',
      () => {
        catFilter = btn.dataset.cat;
        menuPage = 1;
        for (const b of document.querySelectorAll('.cat-filter')) {
          b.className = b.dataset.cat === catFilter ? 'btn btn-xs btn-primary cat-filter' : 'btn btn-xs btn-outline-primary cat-filter';
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
      const origSubmitHtml = submitBtn.innerHTML;
      submitBtn.textContent = editingOrderId ? 'Menyimpan...' : 'Mengirim...';
      try {
        const wasEditing = Boolean(editingOrderId);
        const returnHref = editReturnHref;
        if (editingOrderId) {
          const res = await apiFetch(`/api/orders/${editingOrderId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          upsertOrderInStore(res?.order);
          showToast(`Pesanan ${res.order.orderCode} berhasil diperbarui & dikirim ke Chef.`, 'success');
        } else {
          const res = await apiFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          upsertOrderInStore(res?.order);
          showToast(`Pesanan ${res.order.orderCode} terkirim ke Layar Chef!`, 'success');
        }
        resetCartMode();
        if (wasEditing) {
          navigate(returnHref, { pushState: true });
        }
      } catch (err) {
        submitBtn.innerHTML = origSubmitHtml;
        showToast(err.message, 'danger');
      } finally {
        submitBtn.disabled = false;
      }
    },
    { signal }
  );

  showStep(0);

  let tablesList = [];
  const renderTableQuickChips = () => {
    const wrap = document.getElementById('table-quick-chips');
    const tableInput = document.getElementById('order-table');
    if (!wrap || !tableInput) return;
    wrap.replaceChildren();
    if (tablesList.length === 0) return;

    const currentVal = tableInput.value.trim().toLowerCase();
    for (const tbl of tablesList) {
      const isOccupied = ordersList.some(
        (o) =>
          o.id !== editingOrderId &&
          o.serviceType === 'dine_in' &&
          o.status !== 'cancelled' &&
          String(o.tableNumber || '').trim().toLowerCase() === String(tbl.number || '').trim().toLowerCase() &&
          (['pending', 'cooking', 'ready'].includes(o.status) || (o.status === 'completed' && o.paymentStatus !== 'paid'))
      );
      const isSelected = currentVal === String(tbl.number || '').trim().toLowerCase();
      wrap.appendChild(
        el('button', {
          type: 'button',
          className: `btn btn-xs ${isSelected ? 'btn-primary' : isOccupied ? 'btn-outline-secondary' : 'btn-outline-primary'}`,
          title: isOccupied ? `Meja ${tbl.number} sedang terisi` : `Pilih Meja ${tbl.number} (${tbl.area})`,
          textContent: isOccupied ? `${tbl.number} (Isi)` : tbl.number,
          onClick: () => {
            tableInput.value = tbl.number;
            tableInput.classList.remove('is-invalid');
            renderTableQuickChips();
          },
        })
      );
    }
  };
  document.getElementById('order-table')?.addEventListener('input', renderTableQuickChips, { signal });

  const initialTableParam = initialQuery.get('table');
  if (initialTableParam && !initialQuery.get('edit')) {
    serviceType = 'dine_in';
    syncServiceButtons();
    const tableInput = document.getElementById('order-table');
    if (tableInput) tableInput.value = initialTableParam;
  }

  signal?.addEventListener('abort', () => clearTimeout(missingEditTimer), { once: true });

  const tryHandleEditTarget = (snap) => {
    if (handledEditParam) return;
    const editId = new URLSearchParams(globalThis.location.search).get('edit');
    if (!editId) return;

    const target = ordersList.find((o) => o.id === editId);
    if (target) {
      clearTimeout(missingEditTimer);
      const role = session?.user?.role;
      const settings = snap.settings || session?.settings || {};
      const neverEditable =
        target.status === 'cancelled' ||
        target.status === 'completed' ||
        (role !== 'admin' && target.status === 'ready');
      if (neverEditable) {
        handledEditParam = true;
        showToast(
          `Pesanan ${target.orderCode || ''} berstatus "${statusLabel(target.status).text}" sehingga tidak dapat diedit.`,
          'warning'
        );
        resetCartMode();
        return;
      }
      if (role !== 'admin' && target.status === 'cooking') {
        if (!snap.settingsReady && storeEmissions < 2) return;
        if (!settings.kasirCanEditWhileCooking) {
          handledEditParam = true;
          showToast('Admin belum mengizinkan Kasir mengedit pesanan yang sedang dimasak.', 'warning');
          resetCartMode();
          return;
        }
      }
      handledEditParam = true;
      loadOrderIntoEditor(target);
      return;
    }

    if (snap.ordersReady && storeEmissions >= 2) {
      clearTimeout(missingEditTimer);
      handledEditParam = true;
      showToast('Pesanan yang akan diedit tidak ditemukan atau sudah dihapus.', 'warning');
      resetCartMode();
    } else if (!missingEditTimer) {
      missingEditTimer = setTimeout(() => {
        if (!handledEditParam && !signal?.aborted) {
          const stillMissing = !ordersList.some((o) => o.id === editId);
          if (stillMissing) {
            handledEditParam = true;
            showToast('Pesanan yang akan diedit tidak ditemukan atau sudah dihapus.', 'warning');
            resetCartMode();
          }
        }
      }, 2200);
    }
  };

  subscribeStore((snap) => {
    storeEmissions += 1;
    menuList = snap.menu || [];
    menuReady = Boolean(snap.menuReady);
    ordersList = snap.orders || [];
    tablesList = snap.tables || [];
    renderMenu();
    renderTableQuickChips();
    tryHandleEditTarget(snap);
  });
}

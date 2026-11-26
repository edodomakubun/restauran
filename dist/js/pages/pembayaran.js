// Modul halaman Pembayaran & Struk (pembayaran.html - Admin & Kasir)
import {
  apiFetch,
  applyOptimisticOrderPatch,
  el,
  formatRupiah,
  formatTimeShort,
  showToast,
  statusLabel,
} from '../app-client.js';

const METHOD_LABELS = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer Bank',
  debit: 'Kartu Debit',
};

function buildReceiptText(ord, previewOverride = null) {
  const isPaid = ord.paymentStatus === 'paid';
  const discount = previewOverride ? previewOverride.discountAmount : Number(ord.discountAmount || 0);
  const subtotal = Number(ord.totalAmount || 0);
  const netTotal = Math.max(0, subtotal - discount);
  const method = previewOverride ? previewOverride.paymentMethod : ord.paymentMethod || 'cash';
  const paidAmt = previewOverride ? previewOverride.paidAmount : Number(ord.paidAmount || netTotal);
  const changeAmt = previewOverride ? previewOverride.changeAmount : Number(ord.changeAmount || 0);
  const lines = [
    '      Dapur Laris Manis',
    ' Laris Manis untuk yang Manis-Manis',
    '    Struk Pembayaran Resmi',
    '================================',
    `Kode     : ${ord.orderCode || ord.id}`,
    `Waktu    : ${new Date(ord.paidAt || ord.createdAt).toLocaleString('id-ID')}`,
    `Pelanggan: ${ord.customerName || 'Tamu'}`,
    `Layanan  : ${ord.serviceType === 'dine_in' ? `Meja ${ord.tableNumber || '-'}` : 'Dibungkus'}`,
    `Kasir    : ${ord.paidBy || ord.updatedBy || ord.createdBy || '-'}`,
    '--------------------------------',
  ];
  for (const it of ord.items || []) {
    const lineTotal = Number(it.price || 0) * Number(it.qty || 0);
    lines.push(`${it.qty}x ${it.name}`);
    if (it.note) lines.push(`   (${it.note})`);
    lines.push(`   ${formatRupiah(it.price)} x ${it.qty} = ${formatRupiah(lineTotal)}`);
  }
  lines.push('--------------------------------');
  lines.push(`Subtotal : ${formatRupiah(subtotal)}`);
  if (discount > 0) lines.push(`Diskon   : -${formatRupiah(discount)}`);
  lines.push(`TOTAL    : ${formatRupiah(netTotal)}`);
  if (isPaid) {
    lines.push(`Metode   : ${METHOD_LABELS[method] || method}`);
    lines.push(`Dibayar  : ${formatRupiah(paidAmt)}`);
    if (method === 'cash') lines.push(`Kembali  : ${formatRupiah(changeAmt)}`);
    lines.push('Status   : LUNAS');
  } else {
    lines.push('Status   : BELUM BAYAR (PRATINJAU)');
  }
  lines.push('================================');
  lines.push('   Terima kasih atas kunjungan');
  lines.push('             Anda!');
  return lines.join('\n');
}

export function mount(ctx) {
  const { session, signal, subscribeStore } = ctx;

  let ordersList = [];
  let ordersReady = false;
  let filterMode = 'unpaid';
  let selectedOrderId = new URLSearchParams(globalThis.location.search).get('order') || null;
  let paymentMethod = 'cash';
  let isPaying = false;

  const discountEl = document.getElementById('pay-discount');
  const cashInputEl = document.getElementById('pay-cash-input');
  const markCompletedEl = document.getElementById('pay-mark-completed');
  const submitBtn = document.getElementById('btn-submit-payment');

  const getSelectedOrder = () => ordersList.find((o) => o.id === selectedOrderId) || null;

  const syncMethodButtons = () => {
    for (const btn of document.querySelectorAll('.pay-method-btn')) {
      const active = btn.dataset.method === paymentMethod;
      btn.className = `btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'} pay-method-btn`;
    }
    document.getElementById('pay-cash-wrap')?.classList.toggle('d-none', paymentMethod !== 'cash');
  };

  const renderReceipt = (ord, previewOverride = null) => {
    const recEl = document.getElementById('receipt-preview');
    if (!recEl || !ord) return;

    const isPaid = ord.paymentStatus === 'paid';
    const subtotal = Number(ord.totalAmount || 0);
    const discount = previewOverride ? previewOverride.discountAmount : Number(ord.discountAmount || 0);
    const netTotal = Math.max(0, subtotal - discount);
    const method = previewOverride ? previewOverride.paymentMethod : ord.paymentMethod || 'cash';
    const paidAmt = previewOverride ? previewOverride.paidAmount : Number(ord.paidAmount || netTotal);
    const changeAmt = previewOverride ? previewOverride.changeAmount : Number(ord.changeAmount || 0);

    recEl.replaceChildren(
      el('div', { className: 'text-center border-bottom pb-2 mb-2' }, [
        el('div', { className: 'fw-bold fs-5', textContent: 'Dapur Laris Manis' }),
        el('div', { className: 'small fw-semibold', textContent: 'Laris Manis untuk yang Manis-Manis' }),
        el('div', { className: 'small text-secondary', textContent: isPaid ? 'Struk Pembayaran Resmi' : 'Pratinjau Tagihan' }),
      ]),
      el('div', { className: 'small mb-2' }, [
        el('div', { className: 'd-flex justify-content-between' }, [el('span', { textContent: 'Kode' }), el('strong', { textContent: ord.orderCode || ord.id })]),
        el('div', { className: 'd-flex justify-content-between' }, [el('span', { textContent: 'Waktu' }), el('span', { textContent: new Date(ord.paidAt || ord.createdAt).toLocaleString('id-ID') })]),
        el('div', { className: 'd-flex justify-content-between' }, [el('span', { textContent: 'Pelanggan' }), el('span', { textContent: ord.customerName || 'Tamu' })]),
        el('div', { className: 'd-flex justify-content-between' }, [
          el('span', { textContent: 'Layanan' }),
          el('span', { textContent: ord.serviceType === 'dine_in' ? `Meja ${ord.tableNumber || '-'}` : 'Dibungkus' }),
        ]),
        el('div', { className: 'd-flex justify-content-between' }, [
          el('span', { textContent: 'Kasir' }),
          el('span', { textContent: ord.paidBy || session.user.displayName || '-' }),
        ]),
      ]),
      el('div', { className: 'border-top border-bottom py-2 mb-2 d-flex flex-column gap-1 small' }, (ord.items || []).map((it) =>
        el('div', {}, [
          el('div', { className: 'fw-semibold', textContent: `${it.qty}× ${it.name}` }),
          it.note ? el('div', { className: 'text-secondary fst-italic ps-2', textContent: `(${it.note})` }) : null,
          el('div', { className: 'd-flex justify-content-between text-secondary ps-2' }, [
            el('span', { textContent: `${formatRupiah(it.price)} × ${it.qty}` }),
            el('span', { className: 'text-dark', textContent: formatRupiah(Number(it.price || 0) * Number(it.qty || 0)) }),
          ]),
        ])
      )),
      el('div', { className: 'small d-flex flex-column gap-1' }, [
        el('div', { className: 'd-flex justify-content-between' }, [el('span', { textContent: 'Subtotal' }), el('span', { textContent: formatRupiah(subtotal) })]),
        discount > 0
          ? el('div', { className: 'd-flex justify-content-between text-danger' }, [el('span', { textContent: 'Diskon' }), el('span', { textContent: `-${formatRupiah(discount)}` })])
          : null,
        el('div', { className: 'd-flex justify-content-between fw-bold fs-6 border-top pt-1' }, [el('span', { textContent: 'TOTAL' }), el('span', { textContent: formatRupiah(netTotal) })]),
        isPaid
          ? el('div', { className: 'border-top pt-1 mt-1 d-flex flex-column gap-1' }, [
              el('div', { className: 'd-flex justify-content-between' }, [el('span', { textContent: 'Metode' }), el('strong', { textContent: METHOD_LABELS[method] || method })]),
              el('div', { className: 'd-flex justify-content-between' }, [el('span', { textContent: 'Dibayar' }), el('span', { textContent: formatRupiah(paidAmt) })]),
              method === 'cash'
                ? el('div', { className: 'd-flex justify-content-between fw-bold' }, [el('span', { textContent: 'Kembalian' }), el('span', { textContent: formatRupiah(changeAmt) })])
                : null,
              el('div', { className: 'text-center mt-1' }, [el('span', { className: 'badge text-bg-success', textContent: 'LUNAS' })]),
            ])
          : el('div', { className: 'text-center mt-1' }, [el('span', { className: 'badge text-bg-warning', textContent: 'BELUM BAYAR' })]),
      ]),
      el('div', { className: 'text-center small text-secondary border-top pt-2 mt-2' }, 'Terima kasih atas kunjungan Anda!')
    );
  };

  const updateCalculation = () => {
    const ord = getSelectedOrder();
    if (!ord) return;
    const subtotal = Number(ord.totalAmount || 0);
    const disc = Math.min(subtotal, Math.max(0, Number(discountEl?.value || 0)));
    const netTotal = Math.max(0, subtotal - disc);
    const paidAmt = paymentMethod === 'cash' ? Math.max(0, Number(cashInputEl?.value || 0)) : netTotal;
    const changeAmt = paymentMethod === 'cash' ? Math.max(0, paidAmt - netTotal) : 0;

    const netEl = document.getElementById('pay-net-total');
    const chgEl = document.getElementById('pay-change-display');
    if (netEl) netEl.textContent = formatRupiah(netTotal);
    if (chgEl) {
      chgEl.textContent = formatRupiah(changeAmt);
      chgEl.className = `fw-bold fs-5 ${paymentMethod === 'cash' && paidAmt < netTotal ? 'text-danger' : 'text-success'}`;
    }

    if (ord.paymentStatus !== 'paid') {
      renderReceipt(ord, {
        discountAmount: disc,
        paymentMethod,
        paidAmount: paidAmt,
        changeAmount: changeAmt,
      });
    }
  };

  const renderDetailPanel = () => {
    const ord = getSelectedOrder();
    const emptyEl = document.getElementById('pay-empty-state');
    const detailEl = document.getElementById('pay-detail-panel');
    const formCard = document.getElementById('pay-form-card');
    if (!ord) {
      emptyEl?.classList.remove('d-none');
      detailEl?.classList.add('d-none');
      return;
    }
    emptyEl?.classList.add('d-none');
    detailEl?.classList.remove('d-none');

    const isPaid = ord.paymentStatus === 'paid';
    formCard?.classList.toggle('d-none', isPaid);

    if (!isPaid) {
      const st = statusLabel(ord.status);
      const codeEl = document.getElementById('pay-order-code');
      const stEl = document.getElementById('pay-order-status');
      const subEl = document.getElementById('pay-subtotal');
      if (codeEl) codeEl.textContent = ord.orderCode || ord.id;
      if (stEl) {
        stEl.textContent = st.text;
        stEl.className = `badge ${st.badge}`;
      }
      if (subEl) subEl.textContent = formatRupiah(ord.totalAmount);
      if (discountEl) discountEl.value = String(ord.discountAmount || 0);
      if (cashInputEl) cashInputEl.value = String(Math.max(0, Number(ord.totalAmount || 0) - Number(ord.discountAmount || 0)));
      document.getElementById('pay-mark-completed-wrap')?.classList.toggle('d-none', ord.status !== 'ready');
      syncMethodButtons();
      updateCalculation();
    } else {
      renderReceipt(ord);
    }
  };

  const renderOrdersList = () => {
    const validOrders = ordersList.filter((o) => o.status !== 'cancelled');
    const unpaidCount = validOrders.filter((o) => o.paymentStatus !== 'paid').length;
    const paidCount = validOrders.filter((o) => o.paymentStatus === 'paid').length;

    const cntU = document.getElementById('cnt-unpaid');
    const cntP = document.getElementById('cnt-paid');
    const cntA = document.getElementById('cnt-all');
    if (cntU) cntU.textContent = String(unpaidCount);
    if (cntP) cntP.textContent = String(paidCount);
    if (cntA) cntA.textContent = String(validOrders.length);

    for (const btn of document.querySelectorAll('.pay-filter-btn')) {
      const key = btn.dataset.filter;
      const active = key === filterMode;
      const v = key === 'unpaid' ? 'warning' : key === 'paid' ? 'success' : 'primary';
      btn.className = `btn btn-xs ${active ? `btn-${v}` : `btn-outline-${v}`} pay-filter-btn`;
    }

    const wrap = document.getElementById('pay-orders-list');
    if (!wrap) return;
    wrap.replaceChildren();

    if (!ordersReady && ordersList.length === 0) {
      wrap.appendChild(el('div', { className: 'text-center text-secondary py-4 small', textContent: 'Memuat daftar pesanan...' }));
      return;
    }

    const q = (document.getElementById('pay-search')?.value || '').trim().toLowerCase();
    const filtered = validOrders.filter((o) => {
      if (filterMode === 'unpaid' && o.paymentStatus === 'paid') return false;
      if (filterMode === 'paid' && o.paymentStatus !== 'paid') return false;
      if (q) {
        const hay = `${o.orderCode} ${o.customerName} ${o.tableNumber}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      wrap.appendChild(el('div', { className: 'text-center text-secondary py-4 small', textContent: 'Tidak ada pesanan pada filter ini.' }));
      return;
    }

    for (const ord of filtered) {
      const isPaid = ord.paymentStatus === 'paid';
      const isSelected = ord.id === selectedOrderId;
      const st = statusLabel(ord.status);
      const net = Math.max(0, Number(ord.totalAmount || 0) - Number(ord.discountAmount || 0));

      wrap.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: `text-start border rounded py-1 px-2 w-100 bg-body ${isSelected ? 'border-primary border-2 shadow-sm' : ''}`,
            onClick: () => {
              selectedOrderId = ord.id;
              renderOrdersList();
              renderDetailPanel();
            },
          },
          [
            el('div', { className: 'd-flex justify-content-between align-items-center gap-1 mb-1' }, [
              el('span', { className: 'fw-bold small', textContent: ord.orderCode || ord.id }),
              el('div', { className: 'd-flex gap-1' }, [
                el('span', { className: `badge ${st.badge}`, textContent: st.text }),
                el('span', {
                  className: `badge ${isPaid ? 'text-bg-success' : 'text-bg-warning'}`,
                  textContent: isPaid ? `Lunas (${METHOD_LABELS[ord.paymentMethod] || ord.paymentMethod})` : 'Belum Bayar',
                }),
              ]),
            ]),
            el('div', { className: 'd-flex justify-content-between align-items-center small' }, [
              el('span', {
                className: 'text-secondary',
                textContent: `${ord.customerName || 'Tamu'} · ${ord.serviceType === 'dine_in' ? `Meja ${ord.tableNumber || '-'}` : 'Dibungkus'} · ${formatTimeShort(ord.createdAt)}`,
              }),
              el('span', { className: 'fw-bold text-primary', textContent: formatRupiah(net) }),
            ]),
          ]
        )
      );
    }
  };

  for (const btn of document.querySelectorAll('.pay-filter-btn')) {
    btn.addEventListener(
      'click',
      () => {
        filterMode = btn.dataset.filter || 'unpaid';
        renderOrdersList();
      },
      { signal }
    );
  }
  document.getElementById('pay-search')?.addEventListener('input', renderOrdersList, { signal });

  for (const btn of document.querySelectorAll('.pay-method-btn')) {
    btn.addEventListener(
      'click',
      () => {
        paymentMethod = btn.dataset.method || 'cash';
        syncMethodButtons();
        updateCalculation();
      },
      { signal }
    );
  }

  discountEl?.addEventListener('input', updateCalculation, { signal });
  cashInputEl?.addEventListener('input', updateCalculation, { signal });

  for (const btn of document.querySelectorAll('.pay-quick-cash')) {
    btn.addEventListener(
      'click',
      () => {
        const ord = getSelectedOrder();
        if (!ord || !cashInputEl) return;
        const disc = Math.min(Number(ord.totalAmount || 0), Math.max(0, Number(discountEl?.value || 0)));
        const net = Math.max(0, Number(ord.totalAmount || 0) - disc);
        cashInputEl.value = btn.dataset.exact ? String(net) : String(btn.dataset.amount || net);
        updateCalculation();
      },
      { signal }
    );
  }

  submitBtn?.addEventListener(
    'click',
    async () => {
      const ord = getSelectedOrder();
      if (!ord || isPaying) return;
      const subtotal = Number(ord.totalAmount || 0);
      const disc = Math.min(subtotal, Math.max(0, Math.round(Number(discountEl?.value || 0))));
      const net = Math.max(0, subtotal - disc);
      const paidAmt = paymentMethod === 'cash' ? Math.round(Number(cashInputEl?.value || 0)) : net;
      if (paymentMethod === 'cash' && paidAmt < net) {
        showToast('Nominal uang diterima kurang dari total tagihan.', 'warning');
        cashInputEl?.focus();
        return;
      }
      const markCompleted = ord.status === 'ready' && Boolean(markCompletedEl?.checked);

      isPaying = true;
      submitBtn.disabled = true;
      const origHtml = submitBtn.innerHTML;
      submitBtn.textContent = 'Memproses...';

      const op = applyOptimisticOrderPatch(ord.id, (copy) => {
        copy.paymentStatus = 'paid';
        copy.paymentMethod = paymentMethod;
        copy.discountAmount = disc;
        copy.paidAmount = paidAmt;
        copy.changeAmount = paymentMethod === 'cash' ? Math.max(0, paidAmt - net) : 0;
        copy.paidAt = new Date().toISOString();
        copy.paidBy = session.user.displayName || session.user.email;
        if (markCompleted) copy.status = 'completed';
        return copy;
      });

      try {
        const res = await apiFetch(`/api/orders/${ord.id}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            paymentMethod,
            discountAmount: disc,
            paidAmount: paidAmt,
            markCompleted,
          }),
        });
        op.commit(res?.order);
        showToast(`Pembayaran ${ord.orderCode} berhasil! Struk siap dicetak.`, 'success');
      } catch (err) {
        op.rollback();
        showToast(err.message, 'danger');
      } finally {
        isPaying = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    },
    { signal }
  );

  document.getElementById('btn-print-receipt')?.addEventListener(
    'click',
    () => {
      const ord = getSelectedOrder();
      const recEl = document.getElementById('receipt-preview');
      if (!ord || !recEl) return;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        iframe.remove();
        globalThis.print();
        return;
      }

      doc.open();
      doc.write(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Struk ${ord.orderCode || ''}</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 76mm;
    background: #fff;
    color: #000;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.35;
  }
  .receipt-only { width: 100%; padding: 2mm; }
  .text-center { text-align: center; }
  .fw-bold { font-weight: 700; }
  .fw-semibold { font-weight: 600; }
  .fst-italic { font-style: italic; }
  .fs-5 { font-size: 14px; }
  .fs-6 { font-size: 12px; }
  .small { font-size: 10.5px; }
  .text-secondary { color: #333; }
  .text-danger { color: #000; }
  .text-dark { color: #000; }
  .d-flex { display: flex; }
  .flex-column { flex-direction: column; }
  .justify-content-between { justify-content: space-between; }
  .gap-1 { gap: 2px; }
  .ps-2 { padding-left: 8px; }
  .pb-2 { padding-bottom: 6px; }
  .pt-1 { padding-top: 4px; }
  .pt-2 { padding-top: 6px; }
  .py-2 { padding-top: 6px; padding-bottom: 6px; }
  .mb-2 { margin-bottom: 6px; }
  .mt-1 { margin-top: 4px; }
  .mt-2 { margin-top: 6px; }
  .border-top { border-top: 1px dashed #000; }
  .border-bottom { border-bottom: 1px dashed #000; }
  .badge {
    display: inline-block;
    border: 1px solid #000;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 700;
  }
</style>
</head>
<body>
  <div class="receipt-only">${recEl.innerHTML}</div>
</body>
</html>`);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 100);
    },
    { signal }
  );

  document.getElementById('btn-copy-receipt')?.addEventListener(
    'click',
    async () => {
      const ord = getSelectedOrder();
      if (!ord) return;
      try {
        await navigator.clipboard.writeText(buildReceiptText(ord));
        showToast('Teks struk berhasil disalin ke clipboard.', 'success');
      } catch {
        showToast('Gagal menyalin teks struk.', 'warning');
      }
    },
    { signal }
  );

  subscribeStore((snap) => {
    ordersList = snap.orders || [];
    ordersReady = Boolean(snap.ordersReady);
    if (selectedOrderId) {
      const target = getSelectedOrder();
      if (target && target.paymentStatus === 'paid' && filterMode === 'unpaid') {
        filterMode = 'all';
      }
    }
    renderOrdersList();
    renderDetailPanel();
  });
}

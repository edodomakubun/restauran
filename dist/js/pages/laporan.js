// Modul halaman Laporan Penjualan & Ekspor Excel (laporan.html)
import {
  el,
  formatRupiah,
  formatTimeShort,
  renderPagination,
  showToast,
  statusLabel,
} from '../app-client.js';
import { buildSalesReport, toLocalDateKey } from '../sales-report.js';
import { downloadSalesWorkbook } from '../xlsx-export.js';

const TABLE_PAGE_SIZE = 10;

export function mount(ctx) {
  const { signal, subscribeStore } = ctx;

  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const monthAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);

  let orders = [];
  let ordersReady = false;
  let mode = 'daily';
  let statusScope = 'non_cancelled';
  let menuPage = 1;
  let ordersPage = 1;
  let lastReport = null;

  const dateEl = document.getElementById('rep-date');
  const weekDateEl = document.getElementById('rep-week-date');
  const monthEl = document.getElementById('rep-month');
  const monthEndEl = document.getElementById('rep-month-end');
  const monthYearEl = document.getElementById('rep-month-year');
  const yearEl = document.getElementById('rep-year');
  const startEl = document.getElementById('rep-start');
  const endEl = document.getElementById('rep-end');
  const scopeEl = document.getElementById('report-status-scope');

  if (dateEl) dateEl.value = todayKey;
  if (weekDateEl) weekDateEl.value = todayKey;
  if (monthEl) monthEl.value = String(today.getMonth() + 1);
  if (monthEndEl) monthEndEl.value = String(today.getMonth() + 1);
  if (monthYearEl) monthYearEl.value = String(today.getFullYear());
  if (yearEl) yearEl.value = String(today.getFullYear());
  if (startEl) startEl.value = toLocalDateKey(weekAgo);
  if (endEl) endEl.value = todayKey;

  const exportModalEl = document.getElementById('exportExcelModal');
  const exportModal = exportModalEl ? new globalThis.bootstrap.Modal(exportModalEl) : null;

  const syncModeControls = () => {
    for (const btn of document.querySelectorAll('.report-mode-btn')) {
      const active = btn.dataset.mode === mode;
      btn.className = `btn btn-sm ${active ? 'btn-primary' : 'btn-outline-primary'} report-mode-btn`;
    }
    for (const m of ['daily', 'weekly', 'monthly', 'yearly', 'range']) {
      document.getElementById(`ctrl-${m}`)?.classList.toggle('d-none', m !== mode);
    }
  };

  const getOptions = () => {
    const startMonth = Number(monthEl?.value || today.getMonth() + 1);
    const endMonth = Number(monthEndEl?.value || startMonth);
    return {
      mode,
      date: dateEl?.value || todayKey,
      weekDate: weekDateEl?.value || todayKey,
      month: startMonth,
      startMonth,
      endMonth,
      year: Number((mode === 'monthly' ? monthYearEl?.value : yearEl?.value) || today.getFullYear()),
      startDate: startEl?.value || todayKey,
      endDate: endEl?.value || todayKey,
      statusScope,
    };
  };

  const renderReport = () => {
    const report = buildSalesReport(orders, getOptions());
    lastReport = report;

    const labelEl = document.getElementById('rep-period-label');
    if (labelEl) labelEl.textContent = report.range.label;

    const s = report.summary;
    const revEl = document.getElementById('kpi-revenue');
    const ordEl = document.getElementById('kpi-orders');
    const canEl = document.getElementById('kpi-cancelled');
    const itemEl = document.getElementById('kpi-items');
    const avgEl = document.getElementById('kpi-avg');
    const svcEl = document.getElementById('kpi-service');
    if (revEl) revEl.textContent = formatRupiah(s.totalRevenue);
    if (ordEl) ordEl.textContent = String(s.totalOrders);
    if (canEl) canEl.textContent = s.cancelledOrders > 0 ? `(${s.cancelledOrders} batal)` : '';
    if (itemEl) itemEl.textContent = String(s.totalItemsSold);
    if (avgEl) avgEl.textContent = formatRupiah(s.avgOrderValue);
    if (svcEl) svcEl.textContent = `Meja: ${s.dineInCount} · Bungkus: ${s.takeAwayCount}`;

    const menuCnt = document.getElementById('tab-menu-cnt');
    const ordCnt = document.getElementById('tab-orders-cnt');
    if (menuCnt) menuCnt.textContent = String(report.menuRows.length);
    if (ordCnt) ordCnt.textContent = String(report.orderRows.length);

    // 1. Rekap Periode (grafik batang + tabel)
    const barsWrap = document.getElementById('period-bars');
    const periodBody = document.getElementById('period-table-body');
    const periodFoot = document.getElementById('period-table-foot');

    const activeRows = report.periodRows.filter((r) => r.orderCount > 0 || report.mode !== 'daily');
    const displayRows = mode === 'daily' ? report.periodRows.filter((r) => r.orderCount > 0) : report.periodRows;

    if (barsWrap) {
      barsWrap.replaceChildren();
      const nonZero = report.periodRows.filter((r) => r.revenue > 0);
      const maxRev = nonZero.reduce((m, r) => Math.max(m, r.revenue), 0);
      if (nonZero.length === 0) {
        barsWrap.appendChild(
          el('div', {
            className: 'text-center text-secondary small py-2',
            textContent: ordersReady ? 'Belum ada transaksi pada periode ini.' : 'Memuat data penjualan...',
          })
        );
      } else {
        for (const r of nonZero.slice(0, 16)) {
          const pct = maxRev > 0 ? Math.max(3, Math.round((r.revenue / maxRev) * 100)) : 0;
          barsWrap.appendChild(
            el('div', { className: 'd-flex align-items-center gap-2 small' }, [
              el('span', { className: 'text-secondary text-truncate', style: 'width: 110px;', textContent: r.label }),
              el('div', { className: 'report-bar-track flex-grow-1' }, [
                el('div', { className: 'report-bar-fill', style: `width: ${pct}%;` }),
              ]),
              el('span', { className: 'fw-semibold text-end', style: 'min-width: 95px;', textContent: formatRupiah(r.revenue) }),
            ])
          );
        }
      }
    }

    if (periodBody && periodFoot) {
      periodBody.replaceChildren();
      periodFoot.replaceChildren();
      const rowsToShow = displayRows.length > 0 ? displayRows : activeRows;
      if (rowsToShow.length === 0) {
        periodBody.appendChild(
          el('tr', {}, [
            el('td', { colSpan: 4, className: 'text-center text-secondary py-3', textContent: 'Belum ada transaksi pada tanggal ini.' }),
          ])
        );
      } else {
        for (const r of rowsToShow) {
          periodBody.appendChild(
            el('tr', { className: r.orderCount === 0 ? 'text-secondary opacity-75' : '' }, [
              el('td', { textContent: r.label }),
              el('td', { className: 'text-end', textContent: String(r.orderCount) }),
              el('td', { className: 'text-end', textContent: String(r.itemsSold) }),
              el('td', { className: 'text-end fw-semibold', textContent: formatRupiah(r.revenue) }),
            ])
          );
        }
        periodFoot.appendChild(
          el('tr', {}, [
            el('td', { textContent: 'TOTAL' }),
            el('td', { className: 'text-end', textContent: String(s.totalOrders) }),
            el('td', { className: 'text-end', textContent: String(s.totalItemsSold) }),
            el('td', { className: 'text-end text-primary', textContent: formatRupiah(s.totalRevenue) }),
          ])
        );
      }
    }

    // 2. Menu Terlaris
    const menuBody = document.getElementById('menu-report-body');
    const menuPgFooter = document.getElementById('menu-report-pg-footer');
    const menuPgList = document.getElementById('menu-report-pg');
    const menuPgInfo = document.getElementById('menu-report-pg-info');
    if (menuBody) {
      menuBody.replaceChildren();
      if (report.menuRows.length === 0) {
        menuPgFooter?.classList.add('d-none');
        menuBody.appendChild(
          el('tr', {}, [el('td', { colSpan: 7, className: 'text-center text-secondary py-3', textContent: 'Belum ada data menu terjual.' })])
        );
      } else {
        const pg = renderPagination({
          footerEl: menuPgFooter,
          listEl: menuPgList,
          infoEl: menuPgInfo,
          totalItems: report.menuRows.length,
          pageSize: TABLE_PAGE_SIZE,
          currentPage: menuPage,
          onPageChange: (next) => {
            menuPage = next;
            renderReport();
          },
          unitLabel: 'menu',
        });
        menuPage = pg.page;
        report.menuRows.slice(pg.startIndex, pg.endIndex).forEach((m, i) => {
          menuBody.appendChild(
            el('tr', {}, [
              el('td', { textContent: String(pg.startIndex + i + 1) }),
              el('td', { className: 'fw-semibold', textContent: m.name }),
              el('td', {}, [
                el('span', {
                  className: `badge ${m.category === 'minuman' ? 'text-bg-info' : 'text-bg-warning'}`,
                  textContent: m.category === 'minuman' ? 'Minuman' : 'Makanan',
                }),
              ]),
              el('td', { className: 'text-end', textContent: formatRupiah(m.unitPrice) }),
              el('td', { className: 'text-end fw-semibold', textContent: String(m.qty) }),
              el('td', { className: 'text-end fw-semibold', textContent: formatRupiah(m.revenue) }),
              el('td', { className: 'text-end text-secondary', textContent: `${m.sharePct}%` }),
            ])
          );
        });
      }
    }

    // 3. Detail Transaksi
    const ordBody = document.getElementById('orders-report-body');
    const ordPgFooter = document.getElementById('orders-report-pg-footer');
    const ordPgList = document.getElementById('orders-report-pg');
    const ordPgInfo = document.getElementById('orders-report-pg-info');
    if (ordBody) {
      ordBody.replaceChildren();
      if (report.orderRows.length === 0) {
        ordPgFooter?.classList.add('d-none');
        ordBody.appendChild(
          el('tr', {}, [el('td', { colSpan: 6, className: 'text-center text-secondary py-3', textContent: 'Belum ada transaksi pada periode ini.' })])
        );
      } else {
        const pg = renderPagination({
          footerEl: ordPgFooter,
          listEl: ordPgList,
          infoEl: ordPgInfo,
          totalItems: report.orderRows.length,
          pageSize: TABLE_PAGE_SIZE,
          currentPage: ordersPage,
          onPageChange: (next) => {
            ordersPage = next;
            renderReport();
          },
          unitLabel: 'transaksi',
        });
        ordersPage = pg.page;
        for (const o of report.orderRows.slice(pg.startIndex, pg.endIndex)) {
          const st = statusLabel(o.status);
          ordBody.appendChild(
            el('tr', {}, [
              el('td', {}, [
                el('div', { className: 'fw-bold small', textContent: o.orderCode }),
                el('div', { className: 'text-secondary small', textContent: formatTimeShort(o.createdAt) }),
              ]),
              el('td', { textContent: o.customerName }),
              el('td', {}, [
                el('span', {
                  className: `badge ${o.serviceType === 'dine_in' ? 'text-bg-primary' : 'text-bg-dark'}`,
                  textContent: o.serviceType === 'dine_in' ? `Meja ${o.tableNumber}` : 'Dibungkus',
                }),
              ]),
              el('td', { className: 'small', textContent: o.itemsSummary }),
              el('td', {}, [el('span', { className: `badge ${st.badge}`, textContent: st.text })]),
              el('td', { className: 'text-end fw-semibold', textContent: formatRupiah(o.totalAmount) }),
            ])
          );
        }
      }
    }
  };

  for (const btn of document.querySelectorAll('.report-mode-btn')) {
    btn.addEventListener(
      'click',
      () => {
        mode = btn.dataset.mode || 'daily';
        menuPage = 1;
        ordersPage = 1;
        syncModeControls();
        renderReport();
      },
      { signal }
    );
  }

  for (const inputEl of [dateEl, weekDateEl, monthEl, monthEndEl, monthYearEl, yearEl, startEl, endEl, scopeEl]) {
    inputEl?.addEventListener(
      'change',
      () => {
        statusScope = scopeEl?.value || 'non_cancelled';
        menuPage = 1;
        ordersPage = 1;
        renderReport();
      },
      { signal }
    );
  }

  document.getElementById('btn-today')?.addEventListener(
    'click',
    () => {
      if (dateEl) dateEl.value = todayKey;
      renderReport();
    },
    { signal }
  );
  document.getElementById('btn-this-week')?.addEventListener(
    'click',
    () => {
      if (weekDateEl) weekDateEl.value = todayKey;
      renderReport();
    },
    { signal }
  );
  document.getElementById('btn-last-week')?.addEventListener(
    'click',
    () => {
      if (weekDateEl) weekDateEl.value = toLocalDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7));
      renderReport();
    },
    { signal }
  );
  document.getElementById('btn-last-7')?.addEventListener(
    'click',
    () => {
      if (startEl) startEl.value = toLocalDateKey(weekAgo);
      if (endEl) endEl.value = todayKey;
      renderReport();
    },
    { signal }
  );
  document.getElementById('btn-last-30')?.addEventListener(
    'click',
    () => {
      if (startEl) startEl.value = toLocalDateKey(monthAgo);
      if (endEl) endEl.value = todayKey;
      renderReport();
    },
    { signal }
  );

  const MONTH_LABELS = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  const openExportModal = () => {
    const opts = getOptions();
    const targetYear = opts.year || today.getFullYear();
    const infoEl = document.getElementById('exp-period-info');
    const yearElLabel = document.getElementById('exp-year-label');
    const gridEl = document.getElementById('exp-months-grid');
    if (infoEl && lastReport) infoEl.textContent = `${lastReport.range.modeLabel}: ${lastReport.range.label}`;
    if (yearElLabel) yearElLabel.textContent = String(targetYear);
    if (!gridEl) return;

    const countsByMonth = new Array(13).fill(0);
    for (const o of orders) {
      if (!o?.createdAt) continue;
      if (o.status === 'cancelled') continue;
      if (statusScope === 'completed_only' && o.status !== 'completed') continue;
      const dt = new Date(o.createdAt);
      if (dt.getFullYear() === targetYear) {
        countsByMonth[dt.getMonth() + 1] += 1;
      }
    }

    const sM = Math.min(opts.startMonth, opts.endMonth);
    const eM = Math.max(opts.startMonth, opts.endMonth);
    gridEl.replaceChildren();
    MONTH_LABELS.forEach((mName, idx) => {
      const mNum = idx + 1;
      const cnt = countsByMonth[mNum];
      const defaultChecked =
        mode === 'yearly' || (mode === 'monthly' && mNum >= sM && mNum <= eM);
      const cbId = `exp-month-${mNum}`;
      gridEl.appendChild(
        el('div', { className: 'col-6 col-sm-4' }, [
          el('label', { className: 'border rounded px-2 py-1 d-flex align-items-center justify-content-between gap-1 small bg-body w-100', htmlFor: cbId, style: 'cursor:pointer;' }, [
            el('span', { className: 'd-flex align-items-center gap-1' }, [
              el('input', {
                type: 'checkbox',
                id: cbId,
                className: 'form-check-input mt-0 exp-month-cb',
                value: String(mNum),
                dataset: { hasData: cnt > 0 ? '1' : '0' },
                checked: defaultChecked,
              }),
              mName,
            ]),
            cnt > 0
              ? el('span', { className: 'badge text-bg-success', textContent: String(cnt) })
              : el('span', { className: 'text-secondary', style: 'font-size:0.7rem;', textContent: '0' }),
          ]),
        ])
      );
    });
    exportModal?.show();
  };

  document.getElementById('exp-sel-all')?.addEventListener(
    'click',
    () => {
      for (const cb of document.querySelectorAll('.exp-month-cb')) cb.checked = true;
    },
    { signal }
  );
  document.getElementById('exp-sel-active')?.addEventListener(
    'click',
    () => {
      for (const cb of document.querySelectorAll('.exp-month-cb')) {
        cb.checked = cb.dataset.hasData === '1';
      }
    },
    { signal }
  );
  document.getElementById('exp-sel-none')?.addEventListener(
    'click',
    () => {
      for (const cb of document.querySelectorAll('.exp-month-cb')) cb.checked = false;
    },
    { signal }
  );

  document.getElementById('btn-export-xlsx')?.addEventListener(
    'click',
    () => {
      if (!lastReport) return;
      openExportModal();
    },
    { signal }
  );

  document.getElementById('confirm-export-xlsx')?.addEventListener(
    'click',
    () => {
      const selectedMonths = Array.from(document.querySelectorAll('.exp-month-cb:checked')).map((cb) =>
        Number(cb.value)
      );
      const exportReport = buildSalesReport(orders, {
        ...getOptions(),
        includeMonths: selectedMonths,
      });
      document.activeElement?.blur();
      exportModal?.hide();
      downloadSalesWorkbook(exportReport);
      const extraInfo = selectedMonths.length > 0 ? ` (+${selectedMonths.length} sheet bulan)` : '';
      showToast(`File Excel Laporan-${exportReport.range.fileSlug}.xlsx berhasil diunduh${extraInfo}.`, 'success');
    },
    { signal }
  );

  syncModeControls();

  subscribeStore((snap) => {
    orders = snap.orders || [];
    ordersReady = Boolean(snap.ordersReady);
    renderReport();
  });

  return () => {
    exportModal?.dispose();
  };
}

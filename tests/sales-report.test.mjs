import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSalesReport, getPeriodRange } from '../dist/js/sales-report.js';
import { buildWorkbookBytes } from '../dist/js/xlsx-export.js';

const SAMPLE_ORDERS = [
  {
    id: 'o1',
    orderCode: 'ORD-20261126-001',
    createdAt: new Date(2026, 10, 26, 10, 15, 0).toISOString(),
    customerName: 'Andi',
    serviceType: 'dine_in',
    tableNumber: '01',
    status: 'completed',
    totalAmount: 45000,
    items: [
      { name: 'Nasi Goreng', category: 'makanan', qty: 1, price: 25000 },
      { name: 'Es Teh Manis', category: 'minuman', qty: 2, price: 10000 },
    ],
  },
  {
    id: 'o2',
    orderCode: 'ORD-20261126-002',
    createdAt: new Date(2026, 10, 26, 12, 30, 0).toISOString(),
    customerName: 'Budi',
    serviceType: 'take_away',
    tableNumber: '',
    status: 'cooking',
    totalAmount: 35000,
    items: [{ name: 'Ikan Bakar', category: 'makanan', qty: 1, price: 35000 }],
  },
  {
    id: 'o3',
    orderCode: 'ORD-20261126-003',
    createdAt: new Date(2026, 10, 26, 13, 0, 0).toISOString(),
    customerName: 'Cici',
    serviceType: 'dine_in',
    tableNumber: '03',
    status: 'cancelled',
    totalAmount: 20000,
    items: [{ name: 'Nasi Goreng', category: 'makanan', qty: 1, price: 20000 }],
  },
  {
    id: 'o4',
    orderCode: 'ORD-20261124-001',
    createdAt: new Date(2026, 10, 24, 19, 0, 0).toISOString(),
    customerName: 'Deni',
    serviceType: 'dine_in',
    tableNumber: '05',
    status: 'completed',
    totalAmount: 50000,
    items: [{ name: 'Ikan Bakar', category: 'makanan', qty: 1, price: 50000 }],
  },
];

test('getPeriodRange computes daily, weekly, monthly, yearly, and custom range bounds', () => {
  const daily = getPeriodRange({ mode: 'daily', date: '2026-11-26' });
  assert.equal(daily.buckets.length, 24);
  assert.equal(daily.startKey, '2026-11-26');

  const weekly = getPeriodRange({ mode: 'weekly', weekDate: '2026-11-26' }); // Thursday
  assert.equal(weekly.startKey, '2026-11-23'); // Monday
  assert.equal(weekly.endKey, '2026-11-29'); // Sunday
  assert.equal(weekly.buckets.length, 7);

  const monthly = getPeriodRange({ mode: 'monthly', month: 11, year: 2026 });
  assert.equal(monthly.buckets.length, 30);

  const yearly = getPeriodRange({ mode: 'yearly', year: 2026 });
  assert.equal(yearly.buckets.length, 12);

  const range = getPeriodRange({ mode: 'range', startDate: '2026-11-24', endDate: '2026-11-26' });
  assert.equal(range.buckets.length, 3);
});

test('buildSalesReport aggregates KPIs, cancelled count, statusScope, and menu rankings', () => {
  const nonCancelled = buildSalesReport(SAMPLE_ORDERS, {
    mode: 'daily',
    date: '2026-11-26',
    statusScope: 'non_cancelled',
  });
  assert.equal(nonCancelled.summary.totalOrders, 2);
  assert.equal(nonCancelled.summary.cancelledOrders, 1);
  assert.equal(nonCancelled.summary.totalRevenue, 80000);
  assert.equal(nonCancelled.summary.totalItemsSold, 4);
  assert.equal(nonCancelled.menuRows[0].name, 'Ikan Bakar');

  const completedOnly = buildSalesReport(SAMPLE_ORDERS, {
    mode: 'daily',
    date: '2026-11-26',
    statusScope: 'completed_only',
  });
  assert.equal(completedOnly.summary.totalOrders, 1);
  assert.equal(completedOnly.summary.totalRevenue, 45000);

  const weekly = buildSalesReport(SAMPLE_ORDERS, {
    mode: 'weekly',
    weekDate: '2026-11-26',
    statusScope: 'non_cancelled',
  });
  assert.equal(weekly.summary.totalOrders, 3);
  assert.equal(weekly.summary.totalRevenue, 130000);
});

test('buildWorkbookBytes produces valid PKZIP OOXML .xlsx with 3 sheets and SUM formulas', () => {
  const report = buildSalesReport(SAMPLE_ORDERS, {
    mode: 'weekly',
    weekDate: '2026-11-26',
    statusScope: 'non_cancelled',
  });
  const bytes = buildWorkbookBytes(report);
  // PKZIP local file header signature: 0x50 0x4B 0x03 0x04
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);

  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('xl/worksheets/sheet1.xml'));
  assert.ok(text.includes('xl/worksheets/sheet2.xml'));
  assert.ok(text.includes('xl/worksheets/sheet3.xml'));
  assert.ok(text.includes('<f>SUM('));
  assert.ok(text.includes('LAPORAN PENJUALAN RESTOORDER'));

  // Yearly mode includes 3 summary sheets + 12 monthly sheets = 15 sheets
  const yearlyReport = buildSalesReport(SAMPLE_ORDERS, {
    mode: 'yearly',
    year: 2026,
    statusScope: 'non_cancelled',
  });
  const yearlyBytes = buildWorkbookBytes(yearlyReport);
  const yearlyText = new TextDecoder().decode(yearlyBytes);
  assert.ok(yearlyText.includes('xl/worksheets/sheet15.xml'));
  assert.ok(yearlyText.includes('name="Januari"'));
  assert.ok(yearlyText.includes('name="Desember"'));

  // Multi-month range + custom includeMonths generates sheets only for selected months
  const multiMonth = buildSalesReport(SAMPLE_ORDERS, {
    mode: 'monthly',
    startMonth: 10,
    endMonth: 11,
    year: 2026,
    includeMonths: [11],
  });
  assert.equal(multiMonth.range.isMultiMonth, true);
  assert.equal(multiMonth.periodRows.length, 2);
  const multiBytes = buildWorkbookBytes(multiMonth);
  const multiText = new TextDecoder().decode(multiBytes);
  assert.ok(multiText.includes('xl/worksheets/sheet4.xml'));
  assert.ok(!multiText.includes('xl/worksheets/sheet5.xml'));
  assert.ok(multiText.includes('name="November"'));
});

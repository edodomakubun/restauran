// Mesin agregasi laporan penjualan (Harian, Mingguan, Bulanan, Tahunan, Rentang Hari)
// Modul murni tanpa ketergantungan DOM agar dapat dipakai di browser & diuji unit di Node.js.

const MONTH_NAMES = [
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

const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toLocalDateKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function parseLocalDateKey(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDateId(key) {
  const dt = parseLocalDateKey(key);
  return `${dt.getDate()} ${SHORT_MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function getWeekBounds(refDateKey) {
  const dt = parseLocalDateKey(refDateKey);
  const dow = dt.getDay(); // 0=Min .. 6=Sab
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + diffToMon);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return {
    startKey: toLocalDateKey(mon),
    endKey: toLocalDateKey(sun),
  };
}

export function getPeriodRange(options = {}) {
  const todayKey = toLocalDateKey(new Date());
  const mode = ['daily', 'weekly', 'monthly', 'yearly', 'range'].includes(options.mode) ? options.mode : 'daily';

  if (mode === 'daily') {
    const dateKey = options.date || todayKey;
    const dt = parseLocalDateKey(dateKey);
    const startMs = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0).getTime();
    const endMs = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 23, 59, 59, 999).getTime();
    const buckets = [];
    for (let h = 0; h < 24; h += 1) {
      buckets.push({ key: pad2(h), label: `${pad2(h)}:00` });
    }
    return {
      mode,
      modeLabel: 'Harian',
      startKey: dateKey,
      endKey: dateKey,
      startMs,
      endMs,
      label: formatDateId(dateKey),
      fileSlug: `Harian-${dateKey}`,
      buckets,
    };
  }

  if (mode === 'weekly') {
    const { startKey, endKey } = getWeekBounds(options.weekDate || todayKey);
    const startDt = parseLocalDateKey(startKey);
    const endDt = parseLocalDateKey(endKey);
    const startMs = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate(), 0, 0, 0, 0).getTime();
    const endMs = new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate(), 23, 59, 59, 999).getTime();
    const buckets = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate() + i);
      const k = toLocalDateKey(d);
      buckets.push({ key: k, label: `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${SHORT_MONTH_NAMES[d.getMonth()]}` });
    }
    return {
      mode,
      modeLabel: 'Mingguan',
      startKey,
      endKey,
      startMs,
      endMs,
      label: `${formatDateId(startKey)} – ${formatDateId(endKey)}`,
      fileSlug: `Mingguan-${startKey}_sd_${endKey}`,
      buckets,
    };
  }

  if (mode === 'monthly') {
    const now = new Date();
    const year = Number(options.year) || now.getFullYear();
    let startMonth = Math.min(12, Math.max(1, Number(options.startMonth || options.month) || now.getMonth() + 1));
    let endMonth = Math.min(12, Math.max(1, Number(options.endMonth || options.month) || startMonth));
    if (startMonth > endMonth) {
      const tmp = startMonth;
      startMonth = endMonth;
      endMonth = tmp;
    }
    const isMultiMonth = startMonth !== endMonth;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const startKey = `${year}-${pad2(startMonth)}-01`;
    const endKey = `${year}-${pad2(endMonth)}-${pad2(lastDay)}`;
    const startMs = new Date(year, startMonth - 1, 1, 0, 0, 0, 0).getTime();
    const endMs = new Date(year, endMonth - 1, lastDay, 23, 59, 59, 999).getTime();
    const buckets = [];
    if (isMultiMonth) {
      for (let m = startMonth; m <= endMonth; m += 1) {
        buckets.push({ key: `${year}-${pad2(m)}`, label: `${MONTH_NAMES[m - 1]} ${year}` });
      }
    } else {
      for (let d = 1; d <= lastDay; d += 1) {
        const k = `${year}-${pad2(startMonth)}-${pad2(d)}`;
        buckets.push({ key: k, label: `${pad2(d)} ${SHORT_MONTH_NAMES[startMonth - 1]}` });
      }
    }
    return {
      mode,
      isMultiMonth,
      startMonth,
      endMonth,
      year,
      modeLabel: isMultiMonth ? 'Rentang Bulan' : 'Bulanan',
      startKey,
      endKey,
      startMs,
      endMs,
      label: isMultiMonth
        ? `${MONTH_NAMES[startMonth - 1]} – ${MONTH_NAMES[endMonth - 1]} ${year}`
        : `${MONTH_NAMES[startMonth - 1]} ${year}`,
      fileSlug: isMultiMonth
        ? `Bulanan-${year}-${pad2(startMonth)}_sd_${pad2(endMonth)}`
        : `Bulanan-${year}-${pad2(startMonth)}`,
      buckets,
    };
  }

  if (mode === 'yearly') {
    const year = Number(options.year) || new Date().getFullYear();
    const startKey = `${year}-01-01`;
    const endKey = `${year}-12-31`;
    const startMs = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    const endMs = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
    const buckets = MONTH_NAMES.map((mName, idx) => ({
      key: `${year}-${pad2(idx + 1)}`,
      label: `${mName} ${year}`,
    }));
    return {
      mode,
      modeLabel: 'Tahunan',
      startKey,
      endKey,
      startMs,
      endMs,
      label: `Tahun ${year}`,
      fileSlug: `Tahunan-${year}`,
      buckets,
    };
  }

  // mode === 'range'
  let sKey = options.startDate || todayKey;
  let eKey = options.endDate || sKey;
  if (sKey > eKey) {
    const tmp = sKey;
    sKey = eKey;
    eKey = tmp;
  }
  const sDt = parseLocalDateKey(sKey);
  const eDt = parseLocalDateKey(eKey);
  const startMs = new Date(sDt.getFullYear(), sDt.getMonth(), sDt.getDate(), 0, 0, 0, 0).getTime();
  const endMs = new Date(eDt.getFullYear(), eDt.getMonth(), eDt.getDate(), 23, 59, 59, 999).getTime();
  const buckets = [];
  const cursor = new Date(sDt.getFullYear(), sDt.getMonth(), sDt.getDate());
  let guard = 0;
  while (cursor.getTime() <= endMs && guard < 366) {
    const k = toLocalDateKey(cursor);
    buckets.push({ key: k, label: `${pad2(cursor.getDate())} ${SHORT_MONTH_NAMES[cursor.getMonth()]}` });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return {
    mode: 'range',
    modeLabel: 'Rentang Hari',
    startKey: sKey,
    endKey: eKey,
    startMs,
    endMs,
    label: sKey === eKey ? formatDateId(sKey) : `${formatDateId(sKey)} – ${formatDateId(eKey)}`,
    fileSlug: `Rentang-${sKey}_sd_${eKey}`,
    buckets,
  };
}

function getBucketKeyForDate(dt, range) {
  if (range.mode === 'daily') return pad2(dt.getHours());
  if (range.mode === 'yearly' || range.isMultiMonth) return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
  return toLocalDateKey(dt);
}

const STATUS_LABELS_ID = {
  pending: 'Menunggu',
  cooking: 'Sedang Dimasak',
  ready: 'Siap Disajikan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export function buildSalesReport(orders, options = {}) {
  const range = getPeriodRange(options);
  const statusScope = options.statusScope === 'completed_only' ? 'completed_only' : 'non_cancelled';
  const statusScopeLabel = statusScope === 'completed_only' ? 'Hanya Pesanan Selesai' : 'Semua Pesanan Non-Batal';

  const bucketMap = new Map();
  for (const b of range.buckets) {
    bucketMap.set(b.key, { key: b.key, label: b.label, orderCount: 0, itemsSold: 0, revenue: 0 });
  }

  let cancelledOrders = 0;
  let totalOrders = 0;
  let totalRevenue = 0;
  let totalItemsSold = 0;
  let dineInCount = 0;
  let dineInRevenue = 0;
  let takeAwayCount = 0;
  let takeAwayRevenue = 0;

  const menuMap = new Map();
  const orderRows = [];

  for (const ord of Array.isArray(orders) ? orders : []) {
    if (!ord?.createdAt) continue;
    const dt = new Date(ord.createdAt);
    const ms = dt.getTime();
    if (!Number.isFinite(ms) || ms < range.startMs || ms > range.endMs) continue;

    if (ord.status === 'cancelled') {
      cancelledOrders += 1;
      continue;
    }
    if (statusScope === 'completed_only' && ord.status !== 'completed') {
      continue;
    }

    const amount = Number(ord.totalAmount || 0);
    const items = Array.isArray(ord.items) ? ord.items : [];
    const orderQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);

    totalOrders += 1;
    totalRevenue += amount;
    totalItemsSold += orderQty;

    if (ord.serviceType === 'take_away') {
      takeAwayCount += 1;
      takeAwayRevenue += amount;
    } else {
      dineInCount += 1;
      dineInRevenue += amount;
    }

    const bKey = getBucketKeyForDate(dt, range);
    let bucket = bucketMap.get(bKey);
    if (!bucket) {
      bucket = { key: bKey, label: bKey, orderCount: 0, itemsSold: 0, revenue: 0 };
      bucketMap.set(bKey, bucket);
    }
    bucket.orderCount += 1;
    bucket.itemsSold += orderQty;
    bucket.revenue += amount;

    for (const it of items) {
      const name = String(it.name || 'Menu').trim();
      const cat = it.category === 'minuman' ? 'minuman' : 'makanan';
      const qty = Number(it.qty || 0);
      const unitPrice = Number(it.price || 0);
      const lineRev = unitPrice * qty;
      const mKey = `${cat}|${name.toLowerCase()}`;
      let entry = menuMap.get(mKey);
      if (!entry) {
        entry = { name, category: cat, unitPrice, qty: 0, revenue: 0 };
        menuMap.set(mKey, entry);
      }
      entry.qty += qty;
      entry.revenue += lineRev;
      if (entry.unitPrice !== unitPrice && entry.qty > 0) {
        entry.unitPrice = Math.round(entry.revenue / entry.qty);
      }
    }

    orderRows.push({
      id: ord.id,
      orderCode: ord.orderCode || ord.id || '-',
      createdAt: ord.createdAt,
      customerName: ord.customerName || 'Tamu',
      serviceType: ord.serviceType || 'dine_in',
      serviceLabel: ord.serviceType === 'take_away' ? 'Dibungkus' : 'Makan di Tempat',
      tableNumber: ord.serviceType === 'dine_in' ? ord.tableNumber || '-' : '-',
      status: ord.status,
      statusLabel: STATUS_LABELS_ID[ord.status] || ord.status,
      itemCount: orderQty,
      itemsSummary: items.map((it) => `${it.qty}× ${it.name}`).join(', '),
      totalAmount: amount,
    });
  }

  orderRows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const menuRows = Array.from(menuMap.values())
    .map((m) => ({
      ...m,
      sharePct: totalRevenue > 0 ? Number(((m.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name));

  const periodRows = Array.from(bucketMap.values());

  let monthlyReports = null;
  if (!options._skipMonthly) {
    const yearNum = Number(options.year) || new Date().getFullYear();
    let targetMonths = null;
    if (Array.isArray(options.includeMonths)) {
      targetMonths = options.includeMonths
        .map((m) => Number(m))
        .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    } else if (range.mode === 'yearly') {
      targetMonths = MONTH_NAMES.map((_, i) => i + 1);
    } else if (range.mode === 'monthly' && range.isMultiMonth) {
      targetMonths = [];
      for (let m = range.startMonth; m <= range.endMonth; m += 1) targetMonths.push(m);
    }

    if (targetMonths && targetMonths.length > 0) {
      monthlyReports = targetMonths.map((mNum) => ({
        monthNumber: mNum,
        monthName: MONTH_NAMES[mNum - 1],
        report: buildSalesReport(orders, {
          mode: 'monthly',
          month: mNum,
          year: yearNum,
          statusScope,
          _skipMonthly: true,
        }),
      }));
    }
  }

  return {
    range,
    statusScope,
    statusScopeLabel,
    generatedAt: new Date().toISOString(),
    summary: {
      totalOrders,
      cancelledOrders,
      totalRevenue,
      totalItemsSold,
      avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      dineInCount,
      dineInRevenue,
      takeAwayCount,
      takeAwayRevenue,
    },
    periodRows,
    menuRows,
    orderRows,
    monthlyReports,
  };
}

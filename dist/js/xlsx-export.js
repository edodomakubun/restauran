// Generator file Excel OpenXML (.xlsx) murni tanpa ketergantungan eksternal (bekerja offline & di Node.js).
// Menghasilkan workbook 3 sheet: Ringkasan & Periode, Rekap Menu, dan Detail Transaksi
// dengan banner judul merged, zebra striping, perataan teks/angka, auto-filter, dan freeze header yang rapi.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBytes(files) {
  const enc = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const dataBytes = typeof file.content === 'string' ? enc.encode(file.content) : file.content;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHdr = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHdr.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHdr.set(nameBytes, 30);

    localChunks.push(localHdr, dataBytes);

    const centralHdr = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHdr.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHdr.set(nameBytes, 46);

    centralChunks.push(centralHdr);
    offset += localHdr.length + size;
  }

  const centralSize = centralChunks.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const ch of localChunks) {
    out.set(ch, pos);
    pos += ch.length;
  }
  for (const ch of centralChunks) {
    out.set(ch, pos);
    pos += ch.length;
  }
  out.set(eocd, pos);
  return out;
}

function xmlEscape(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetters(colIdx) {
  let n = colIdx + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function renderCell(ref, cell) {
  const styleAttr = cell.s !== undefined ? ` s="${cell.s}"` : '';
  if (cell.f) {
    return `<c r="${ref}"${styleAttr}><f>${xmlEscape(cell.f)}</f></c>`;
  }
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    return `<c r="${ref}"${styleAttr}><v>${cell.v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${xmlEscape(cell.v ?? '')}</t></is></c>`;
}

function buildWorksheetXml({ rows, colWidths, rowHeights = {}, merges = [], freezeRow = 0, autoFilter = '', tabSelected = false }) {
  const colsXml = colWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const tabAttr = tabSelected ? ' tabSelected="1"' : '';
  const sheetViews =
    freezeRow > 0
      ? `<sheetViews><sheetView${tabAttr} workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freezeRow + 1}" sqref="A${freezeRow + 1}"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView${tabAttr} workbookViewId="0"/></sheetViews>`;

  const rowsXml = rows
    .map((row, rIdx) => {
      const rNum = rIdx + 1;
      const ht = rowHeights[rNum];
      const htAttr = ht ? ` ht="${ht}" customHeight="1"` : '';
      if (!row || row.length === 0) return `<row r="${rNum}"${htAttr}/>`;
      const cellsXml = row
        .map((cell, cIdx) => {
          if (cell === null || cell === undefined) return '';
          return renderCell(`${colLetters(cIdx)}${rNum}`, typeof cell === 'object' ? cell : { v: cell });
        })
        .join('');
      return `<row r="${rNum}"${htAttr}>${cellsXml}</row>`;
    })
    .join('');

  const mergeXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
      : '';

  const filterXml = autoFilter ? `<autoFilter ref="${autoFilter}"/>` : '';

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    sheetViews +
    `<sheetFormatPr defaultRowHeight="19"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowsXml}</sheetData>` +
    filterXml +
    mergeXml +
    `</worksheet>`
  );
}

// Style indices (cellXfs):
//  0: default
//  1: banner title (bold 13pt white, #1E3A8A navy fill, left+vcenter)
//  2: banner subtitle (italic 10pt #334155, #EFF6FF soft blue fill, left+vcenter)
//  3: table header (bold 10.5pt white, #1D4ED8 blue fill, center+vcenter, thin border)
//  4: body text left (even row white, thin border, vcenter)
//  5: body text center (even row white, thin border, vcenter)
//  6: body integer right (even row white, thin border, vcenter)
//  7: body Rupiah right (even row white, thin border, vcenter)
//  8: body percent right (even row white, thin border, vcenter)
//  9: zebra text left (#F8FAFC fill, thin border, vcenter)
// 10: zebra text center (#F8FAFC fill, thin border, vcenter)
// 11: zebra integer right (#F8FAFC fill, thin border, vcenter)
// 12: zebra Rupiah right (#F8FAFC fill, thin border, vcenter)
// 13: zebra percent right (#F8FAFC fill, thin border, vcenter)
// 14: total label (bold, #E2E8F0 fill, thin border, vcenter)
// 15: total integer (bold, #E2E8F0 fill, thin border, right+vcenter)
// 16: total Rupiah (bold, #DBEAFE fill, thin border, right+vcenter)
// 17: body text wrap left (even row white, wrapText=1, thin border, vcenter)
// 18: zebra text wrap left (#F8FAFC fill, wrapText=1, thin border, vcenter)
// 19: KPI highlight label (bold, #EFF6FF fill, thin border, vcenter)
// 20: KPI highlight Rupiah (bold, #EFF6FF fill, thin border, right+vcenter)
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="&quot;Rp &quot;#,##0"/>
    <numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><i/><sz val="10"/><color rgb="FF334155"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="21">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="3" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="3" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildSheet1Xml(report) {
  const s = report.summary;
  const rows = [
    [{ v: '  LAPORAN PENJUALAN RESTOORDER', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }],
    [
      { v: `  Tipe: ${report.range.modeLabel} · Periode: ${report.range.label} · Status: ${report.statusScopeLabel} · Ekspor: ${new Date(report.generatedAt).toLocaleString('id-ID')}`, s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
    ],
    [],
    [{ v: 'RINGKASAN PENJUALAN', s: 3 }, { v: '', s: 3 }, { v: 'NILAI', s: 3 }],
    [{ v: 'Total Omzet (Rp)', s: 19 }, { v: '', s: 19 }, { v: s.totalRevenue, s: 20 }],
    [{ v: 'Jumlah Transaksi Valid', s: 4 }, { v: '', s: 4 }, { v: s.totalOrders, s: 6 }],
    [{ v: 'Pesanan Dibatalkan', s: 9 }, { v: '', s: 9 }, { v: s.cancelledOrders, s: 11 }],
    [{ v: 'Total Porsi Terjual', s: 4 }, { v: '', s: 4 }, { v: s.totalItemsSold, s: 6 }],
    [{ v: 'Rata-rata Nilai Transaksi (Rp)', s: 9 }, { v: '', s: 9 }, { v: s.avgOrderValue, s: 12 }],
    [{ v: `Makan di Tempat (${s.dineInCount} order)`, s: 4 }, { v: '', s: 4 }, { v: s.dineInRevenue, s: 7 }],
    [{ v: `Dibungkus / Take Away (${s.takeAwayCount} order)`, s: 9 }, { v: '', s: 9 }, { v: s.takeAwayRevenue, s: 12 }],
    [],
    [
      { v: 'No', s: 3 },
      { v: 'Periode', s: 3 },
      { v: 'Jumlah Order', s: 3 },
      { v: 'Porsi Terjual', s: 3 },
      { v: 'Total Omzet (Rp)', s: 3 },
    ],
  ];

  const rowHeights = { 1: 28, 2: 20, 4: 24, 13: 24 };
  const merges = ['A1:E1', 'A2:E2', 'A4:B4', 'A5:B5', 'A6:B6', 'A7:B7', 'A8:B8', 'A9:B9', 'A10:B10', 'A11:B11'];

  const dataStartRow = rows.length + 1;
  report.periodRows.forEach((p, idx) => {
    const z = idx % 2 === 1;
    rows.push([
      { v: idx + 1, s: z ? 10 : 5 },
      { v: p.label, s: z ? 9 : 4 },
      { v: p.orderCount, s: z ? 11 : 6 },
      { v: p.itemsSold, s: z ? 11 : 6 },
      { v: p.revenue, s: z ? 12 : 7 },
    ]);
  });
  const dataEndRow = rows.length;
  if (report.periodRows.length > 0) {
    rows.push([
      { v: '', s: 14 },
      { v: 'TOTAL', s: 14 },
      { f: `SUM(C${dataStartRow}:C${dataEndRow})`, s: 15 },
      { f: `SUM(D${dataStartRow}:D${dataEndRow})`, s: 15 },
      { f: `SUM(E${dataStartRow}:E${dataEndRow})`, s: 16 },
    ]);
    rowHeights[rows.length] = 22;
  }

  return buildWorksheetXml({
    rows,
    colWidths: [8, 34, 18, 18, 24],
    rowHeights,
    merges,
    freezeRow: 0,
    tabSelected: true,
  });
}

function buildSheet2Xml(report) {
  const rows = [
    [{ v: `  REKAP PENJUALAN PER MENU (${report.range.label})`, s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }],
    [{ v: `  Cakupan: ${report.statusScopeLabel} · Total ${report.menuRows.length} jenis menu terjual`, s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }],
    [],
    [
      { v: 'No', s: 3 },
      { v: 'Nama Menu', s: 3 },
      { v: 'Kategori', s: 3 },
      { v: 'Harga Satuan (Rp)', s: 3 },
      { v: 'Qty Terjual', s: 3 },
      { v: 'Total Omzet (Rp)', s: 3 },
      { v: 'Kontribusi (%)', s: 3 },
    ],
  ];
  const rowHeights = { 1: 28, 2: 20, 4: 24 };
  const dataStart = rows.length + 1;
  report.menuRows.forEach((m, idx) => {
    const z = idx % 2 === 1;
    rows.push([
      { v: idx + 1, s: z ? 10 : 5 },
      { v: m.name, s: z ? 9 : 4 },
      { v: m.category === 'minuman' ? 'Minuman' : 'Makanan', s: z ? 10 : 5 },
      { v: Number(m.unitPrice || 0), s: z ? 12 : 7 },
      { v: m.qty, s: z ? 11 : 6 },
      { v: m.revenue, s: z ? 12 : 7 },
      { v: m.sharePct, s: z ? 13 : 8 },
    ]);
  });
  const dataEnd = rows.length;
  if (report.menuRows.length > 0) {
    rows.push([
      { v: '', s: 14 },
      { v: 'TOTAL', s: 14 },
      { v: '', s: 14 },
      { v: '', s: 14 },
      { f: `SUM(E${dataStart}:E${dataEnd})`, s: 15 },
      { f: `SUM(F${dataStart}:F${dataEnd})`, s: 16 },
      { v: 100, s: 8 },
    ]);
    rowHeights[rows.length] = 22;
  }
  return buildWorksheetXml({
    rows,
    colWidths: [7, 36, 14, 19, 14, 22, 16],
    rowHeights,
    merges: ['A1:G1', 'A2:G2'],
    freezeRow: 4,
    autoFilter: report.menuRows.length > 0 ? `A4:G${dataEnd}` : '',
  });
}

function buildSheet3Xml(report) {
  const rows = [
    [
      { v: `  DETAIL TRANSAKSI (${report.range.label})`, s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
    ],
    [
      { v: `  Cakupan: ${report.statusScopeLabel} · Total ${report.orderRows.length} transaksi`, s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
    ],
    [],
    [
      { v: 'No', s: 3 },
      { v: 'Kode Pesanan', s: 3 },
      { v: 'Tanggal & Waktu', s: 3 },
      { v: 'Pelanggan', s: 3 },
      { v: 'Layanan', s: 3 },
      { v: 'No. Meja', s: 3 },
      { v: 'Status', s: 3 },
      { v: 'Rincian Menu', s: 3 },
      { v: 'Total (Rp)', s: 3 },
    ],
  ];
  const rowHeights = { 1: 28, 2: 20, 4: 24 };
  const dataStart = rows.length + 1;
  report.orderRows.forEach((o, idx) => {
    const z = idx % 2 === 1;
    rows.push([
      { v: idx + 1, s: z ? 10 : 5 },
      { v: o.orderCode, s: z ? 10 : 5 },
      { v: new Date(o.createdAt).toLocaleString('id-ID'), s: z ? 10 : 5 },
      { v: o.customerName, s: z ? 9 : 4 },
      { v: o.serviceLabel, s: z ? 10 : 5 },
      { v: o.tableNumber, s: z ? 10 : 5 },
      { v: o.statusLabel, s: z ? 10 : 5 },
      { v: o.itemsSummary, s: z ? 18 : 17 },
      { v: o.totalAmount, s: z ? 12 : 7 },
    ]);
  });
  const dataEnd = rows.length;
  if (report.orderRows.length > 0) {
    rows.push([
      { v: '', s: 14 },
      { v: 'TOTAL', s: 14 },
      { v: '', s: 14 },
      { v: '', s: 14 },
      { v: '', s: 14 },
      { v: '', s: 14 },
      { v: '', s: 14 },
      { v: `${report.orderRows.length} transaksi`, s: 14 },
      { f: `SUM(I${dataStart}:I${dataEnd})`, s: 16 },
    ]);
    rowHeights[rows.length] = 22;
  }
  return buildWorksheetXml({
    rows,
    colWidths: [6, 21, 22, 20, 18, 11, 16, 46, 20],
    rowHeights,
    merges: ['A1:I1', 'A2:I2'],
    freezeRow: 4,
    autoFilter: report.orderRows.length > 0 ? `A4:I${dataEnd}` : '',
  });
}

function buildMonthlySheetXml(monthName, mReport) {
  const s = mReport.summary;
  const rows = [
    [
      { v: `  LAPORAN BULAN ${monthName.toUpperCase()} (${mReport.range.label})`, s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
      { v: '', s: 1 },
    ],
    [
      {
        v: `  Omzet: Rp ${s.totalRevenue.toLocaleString('id-ID')} · Transaksi: ${s.totalOrders} (${s.cancelledOrders} batal) · Porsi: ${s.totalItemsSold}`,
        s: 2,
      },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
      { v: '', s: 2 },
    ],
    [],
    [
      { v: 'No', s: 3 },
      { v: 'Nama Menu', s: 3 },
      { v: 'Kategori', s: 3 },
      { v: 'Harga Satuan (Rp)', s: 3 },
      { v: 'Qty Terjual', s: 3 },
      { v: 'Total Omzet (Rp)', s: 3 },
      { v: 'Kontribusi (%)', s: 3 },
    ],
  ];
  const rowHeights = { 1: 28, 2: 20, 4: 24 };
  const merges = ['A1:G1', 'A2:G2'];

  if (mReport.menuRows.length === 0) {
    rows.push([{ v: 'Belum ada transaksi pada bulan ini.', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }]);
    merges.push('A5:G5');
  } else {
    const menuStart = rows.length + 1;
    mReport.menuRows.forEach((m, idx) => {
      const z = idx % 2 === 1;
      rows.push([
        { v: idx + 1, s: z ? 10 : 5 },
        { v: m.name, s: z ? 9 : 4 },
        { v: m.category === 'minuman' ? 'Minuman' : 'Makanan', s: z ? 10 : 5 },
        { v: Number(m.unitPrice || 0), s: z ? 12 : 7 },
        { v: m.qty, s: z ? 11 : 6 },
        { v: m.revenue, s: z ? 12 : 7 },
        { v: m.sharePct, s: z ? 13 : 8 },
      ]);
    });
    const menuEnd = rows.length;
    rows.push([
      { v: '', s: 14 },
      { v: 'TOTAL MENU', s: 14 },
      { v: '', s: 14 },
      { v: '', s: 14 },
      { f: `SUM(E${menuStart}:E${menuEnd})`, s: 15 },
      { f: `SUM(F${menuStart}:F${menuEnd})`, s: 16 },
      { v: 100, s: 8 },
    ]);
    rowHeights[rows.length] = 22;
  }

  return buildWorksheetXml({
    rows,
    colWidths: [7, 36, 14, 19, 14, 22, 16],
    rowHeights,
    merges,
    freezeRow: 4,
    autoFilter: mReport.menuRows.length > 0 ? `A4:G${rows.length - 1}` : '',
  });
}

export function buildWorkbookBytes(report) {
  const sheets = [
    { name: 'Ringkasan & Periode', xml: buildSheet1Xml(report) },
    { name: 'Rekap Menu', xml: buildSheet2Xml(report) },
    { name: 'Detail Transaksi', xml: buildSheet3Xml(report) },
  ];

  if (Array.isArray(report.monthlyReports) && report.monthlyReports.length > 0) {
    for (const m of report.monthlyReports) {
      sheets.push({
        name: m.monthName.slice(0, 31),
        xml: buildMonthlySheetXml(m.monthName, m.report),
      });
    }
  }

  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n');

  const workbookSheets = sheets
    .map((sh, i) => `    <sheet name="${xmlEscape(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('\n');

  const sheetRels = sheets
    .map(
      (_, i) =>
        `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n');

  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheetOverrides}
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${workbookSheets}
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', content: STYLES_XML },
    ...sheets.map((sh, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: sh.xml,
    })),
  ];

  return buildZipBytes(files);
}

export function buildXlsxBlob(report) {
  const bytes = buildWorkbookBytes(report);
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadSalesWorkbook(report, filename) {
  const blob = buildXlsxBlob(report);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `Laporan-Penjualan-${report.range.fileSlug}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

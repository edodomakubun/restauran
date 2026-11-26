// Penyimpanan sementara untuk Mode Pengembangan Lokal (sebelum proyek Firebase dibuat).
// Tidak menyimpan handle I/O lintas request (hanya JSON murni) agar patuh pada aturan isolasi Cloudflare Workers.

export const DEFAULT_MENU_ITEMS = [
  // Best Seller
  { id: 'menu-1', name: 'Bakso Abang-Abang', category: 'makanan', price: 15000, isAvailable: true },
  { id: 'menu-2', name: 'Bakso Laris Manis', category: 'makanan', price: 20000, isAvailable: true },
  { id: 'menu-3', name: 'Bakso Tenis', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-4', name: 'Nasi Bebek Bakar', category: 'makanan', price: 60000, isAvailable: true },
  { id: 'menu-5', name: 'Nasi Bebek Lalapan', category: 'makanan', price: 55000, isAvailable: true },
  { id: 'menu-6', name: 'Nasi Bebek Rica-Rica', category: 'makanan', price: 60000, isAvailable: true },
  { id: 'menu-7', name: 'Tempe Mendoan', category: 'makanan', price: 15000, isAvailable: true },
  { id: 'menu-8', name: 'Kulit Ayam Crispy', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-9', name: 'Chicken Steak', category: 'makanan', price: 50000, isAvailable: true },
  { id: 'menu-10', name: 'Sapo Tahu', category: 'makanan', price: 50000, isAvailable: true },
  { id: 'menu-11', name: 'Sapo Tahu Hotplate', category: 'makanan', price: 60000, isAvailable: true },
  // Aneka Snack
  { id: 'menu-12', name: 'Kentang Goreng', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-13', name: 'Laris Manis Platter', category: 'makanan', price: 40000, isAvailable: true },
  // Aneka Nasi
  { id: 'menu-14', name: 'Nasi Putih', category: 'makanan', price: 10000, isAvailable: true },
  { id: 'menu-15', name: 'Nasi Goreng Biasa', category: 'makanan', price: 15000, isAvailable: true },
  { id: 'menu-16', name: 'Nasi Goreng Ayam', category: 'makanan', price: 20000, isAvailable: true },
  { id: 'menu-17', name: 'Nasi Goreng Seafood', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-18', name: 'Nasi Goreng Viral', category: 'makanan', price: 30000, isAvailable: true },
  { id: 'menu-19', name: 'Nasi Goreng Ikan Asin', category: 'makanan', price: 20000, isAvailable: true },
  { id: 'menu-20', name: 'Nasi Goreng Laris Manis', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-21', name: 'Nasi Goreng Cumi', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-22', name: 'Nasi Goreng Teri', category: 'makanan', price: 20000, isAvailable: true },
  { id: 'menu-23', name: 'Nasi Capcay', category: 'makanan', price: 45000, isAvailable: true },
  { id: 'menu-24', name: 'Nasi Goreng Capcay', category: 'makanan', price: 45000, isAvailable: true },
  { id: 'menu-25', name: 'Nasi Goreng Sapi', category: 'makanan', price: 30000, isAvailable: true },
  { id: 'menu-26', name: 'Nasi Goreng Ayam Crispy', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-27', name: 'Nasi Goreng Hongkong', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-28', name: 'Nasi Goreng Spesial', category: 'makanan', price: 30000, isAvailable: true },
  // Aneka Mie & Bihun
  { id: 'menu-29', name: 'Mie Goreng Ayam', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-30', name: 'Mie Goreng Spesial', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-31', name: 'Mie Goreng Bakso', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-32', name: 'Mie Goreng Seafood', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-33', name: 'Bihun Goreng Ayam', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-34', name: 'Bihun Goreng Seafood', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-35', name: 'Mie Kuah Ayam', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-36', name: 'Mie Kuah Ayam Spesial', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-37', name: 'Bakmie Rica', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-38', name: 'Mie Ayam Biasa', category: 'makanan', price: 20000, isAvailable: true },
  { id: 'menu-39', name: 'Mie Ayam Bakso', category: 'makanan', price: 25000, isAvailable: true },
  // Aneka Ayam
  { id: 'menu-40', name: 'Nasi Lalapan Mini', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-41', name: 'Nasi Lalapan Jumbo', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-42', name: 'Nasi Ayam Geprek', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-43', name: 'Sayap Ayam Goreng', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-44', name: 'Nasi Ayam Bakar Mini', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-45', name: 'Nasi Ayam Bakar Jumbo', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-46', name: 'Ayam Goreng Tepung', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-47', name: 'Ayam Asam Manis', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-48', name: 'Ayam Saus Mentega', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-49', name: 'Ayam Geprek Telur Asin', category: 'makanan', price: 45000, isAvailable: true },
  { id: 'menu-50', name: 'Ayam Saus Rica', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-51', name: 'Ayam Lada Hitam', category: 'makanan', price: 35000, isAvailable: true },
  // Sup & Soto
  { id: 'menu-52', name: 'Sup Ayam Jagung', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-53', name: 'Sup Ayam', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-54', name: 'Sup Asparagus', category: 'makanan', price: 30000, isAvailable: true },
  { id: 'menu-55', name: 'Nasi Soto Ayam', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-56', name: 'Tom Yum', category: 'makanan', price: 50000, isAvailable: true },
  // Aneka Ikan
  { id: 'menu-57', name: 'Ikan Goreng Tepung', category: 'makanan', price: 0, isAvailable: true },
  { id: 'menu-58', name: 'Ikan Asam Manis', category: 'makanan', price: 0, isAvailable: true },
  { id: 'menu-59', name: 'Ikan Telur Asin', category: 'makanan', price: 0, isAvailable: true },
  { id: 'menu-60', name: 'Ikan Saus Mentega', category: 'makanan', price: 0, isAvailable: true },
  { id: 'menu-61', name: 'Ikan Saus Rica', category: 'makanan', price: 0, isAvailable: true },
  { id: 'menu-62', name: 'Ikan Lada Hitam', category: 'makanan', price: 0, isAvailable: true },
  { id: 'menu-63', name: 'Ikan Bakar Saos Padang', category: 'makanan', price: 0, isAvailable: true },
  { id: 'menu-64', name: 'Ikan Kuah Bening', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-65', name: 'Ikan Kuah Kuning', category: 'makanan', price: 35000, isAvailable: true },
  // Aneka Udang
  { id: 'menu-66', name: 'Udang Goreng Crispy', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-67', name: 'Udang Asam Manis', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-68', name: 'Udang Telur Asin', category: 'makanan', price: 55000, isAvailable: true },
  { id: 'menu-69', name: 'Udang Saus Mentega', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-70', name: 'Udang Rica-Rica', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-71', name: 'Udang Lada Hitam', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-72', name: 'Udang Saus Padang', category: 'makanan', price: 40000, isAvailable: true },
  { id: 'menu-73', name: 'Udang Bakar Laris Manis', category: 'makanan', price: 45000, isAvailable: true },
  // Aneka Cumi
  { id: 'menu-74', name: 'Cumi Goreng Tepung', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-75', name: 'Cumi Asam Manis', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-76', name: 'Cumi Telur Asin', category: 'makanan', price: 45000, isAvailable: true },
  { id: 'menu-77', name: 'Cumi Saus Mentega', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-78', name: 'Cumi Lada Hitam', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-79', name: 'Cumi Saus Rica', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-80', name: 'Cumi Saus Padang', category: 'makanan', price: 35000, isAvailable: true },
  // Aneka Kepiting
  { id: 'menu-81', name: 'Kepiting Asam Manis', category: 'makanan', price: 50000, isAvailable: true },
  { id: 'menu-82', name: 'Kepiting Rica-Rica', category: 'makanan', price: 50000, isAvailable: true },
  { id: 'menu-83', name: 'Kepiting Saus Padang', category: 'makanan', price: 50000, isAvailable: true },
  // Aneka Sayuran
  { id: 'menu-84', name: 'Cah Kangkung Polos', category: 'makanan', price: 20000, isAvailable: true },
  { id: 'menu-85', name: 'Cah Kangkung Terasi', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-86', name: 'Cah Kangkung Ikan Asin', category: 'makanan', price: 30000, isAvailable: true },
  { id: 'menu-87', name: 'Cah Kangkung Spesial', category: 'makanan', price: 30000, isAvailable: true },
  { id: 'menu-88', name: 'Cah Sawi', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-89', name: 'Cah Toge Ikan Asin', category: 'makanan', price: 25000, isAvailable: true },
  { id: 'menu-90', name: 'Capcay Kuah', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-91', name: 'Capcay Goreng', category: 'makanan', price: 35000, isAvailable: true },
  { id: 'menu-92', name: 'Fuyunghai', category: 'makanan', price: 40000, isAvailable: true },
  // Aneka Minuman - Dingin
  { id: 'menu-93', name: 'Air Mineral', category: 'minuman', price: 5000, isAvailable: true },
  { id: 'menu-94', name: 'Es Teh Tawar', category: 'minuman', price: 5000, isAvailable: true },
  { id: 'menu-95', name: 'Es Teh Tawar Jumbo', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-96', name: 'Es Teh Manis', category: 'minuman', price: 5000, isAvailable: true },
  { id: 'menu-97', name: 'Es Teh Manis Jumbo', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-98', name: 'Sirup Orange', category: 'minuman', price: 8000, isAvailable: true },
  { id: 'menu-99', name: 'Susu Sirup', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-100', name: 'Es Nutrisari', category: 'minuman', price: 8000, isAvailable: true },
  { id: 'menu-101', name: 'Es Nutrisari Susu', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-102', name: 'Es Jeruk Murni', category: 'minuman', price: 15000, isAvailable: true },
  { id: 'menu-103', name: 'Es Kelapa Muda', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-104', name: 'Es Kelapa Muda Sirup', category: 'minuman', price: 15000, isAvailable: true },
  { id: 'menu-105', name: 'Es Kelapa Muda Susu', category: 'minuman', price: 15000, isAvailable: true },
  { id: 'menu-106', name: 'Es Kelapa Muda Susu Sirup', category: 'minuman', price: 15000, isAvailable: true },
  { id: 'menu-107', name: 'Es Kelapa Muda Gula Merah', category: 'minuman', price: 15000, isAvailable: true },
  { id: 'menu-108', name: 'Susu Jos', category: 'minuman', price: 10000, isAvailable: true },
  // Aneka Minuman - Panas & Kopi
  { id: 'menu-109', name: 'Teh Tawar Panas', category: 'minuman', price: 5000, isAvailable: true },
  { id: 'menu-110', name: 'Teh Tawar Panas Jumbo', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-111', name: 'Teh Manis Panas', category: 'minuman', price: 5000, isAvailable: true },
  { id: 'menu-112', name: 'Teh Manis Panas Jumbo', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-113', name: 'Kopi Hitam', category: 'minuman', price: 10000, isAvailable: true },
  { id: 'menu-114', name: 'Kopi Gula Aren', category: 'minuman', price: 10000, isAvailable: true },
  // Aneka Minuman - Jus
  { id: 'menu-115', name: 'Jus Sirsak', category: 'minuman', price: 20000, isAvailable: true },
  { id: 'menu-116', name: 'Jus Mangga', category: 'minuman', price: 20000, isAvailable: true },
  { id: 'menu-117', name: 'Jus Alpukat', category: 'minuman', price: 20000, isAvailable: true },
  { id: 'menu-118', name: 'Jus Naga', category: 'minuman', price: 20000, isAvailable: true },
  // Aneka Minuman - Spesial
  { id: 'menu-119', name: 'Es Kacang Merah', category: 'minuman', price: 25000, isAvailable: true },
];

export const DEFAULT_SETTINGS = {
  id: 'restaurant',
  kasirCanDeleteOrder: false,
  kasirCanEditWhileCooking: false,
  kasirCanCancelWhileCooking: false,
  kasirCanViewReport: false,
  updatedAt: '2026-11-25T00:00:00.000Z',
};

const DEFAULT_USERS = [
  {
    id: 'uid-admin-1',
    uid: 'uid-admin-1',
    email: 'admin@restoran.local',
    password: 'admin123',
    displayName: 'Admin Restoran',
    role: 'admin',
    isActive: true,
    createdAt: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'uid-kasir-1',
    uid: 'uid-kasir-1',
    email: 'kasir@restoran.local',
    password: 'kasir123',
    displayName: 'Kasir Utama',
    role: 'kasir',
    isActive: true,
    createdAt: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'uid-chef-1',
    uid: 'uid-chef-1',
    email: 'chef@restoran.local',
    password: 'chef123',
    displayName: 'Chef Dapur',
    role: 'chef',
    isActive: true,
    createdAt: '2026-11-25T00:00:00.000Z',
  },
];

export const DEFAULT_TABLES = [
  { id: 'tbl-01', number: '01', area: 'Utama', capacity: 4, status: 'available', note: '' },
  { id: 'tbl-02', number: '02', area: 'Utama', capacity: 4, status: 'available', note: '' },
  { id: 'tbl-03', number: '03', area: 'Utama', capacity: 4, status: 'available', note: '' },
  { id: 'tbl-04', number: '04', area: 'Utama', capacity: 4, status: 'available', note: '' },
  { id: 'tbl-05', number: '05', area: 'Utama', capacity: 6, status: 'available', note: '' },
  { id: 'tbl-06', number: '06', area: 'Utama', capacity: 6, status: 'available', note: '' },
  { id: 'tbl-vip1', number: 'VIP-1', area: 'VIP', capacity: 8, status: 'available', note: '' },
  { id: 'tbl-vip2', number: 'VIP-2', area: 'VIP', capacity: 10, status: 'available', note: '' },
];

export function createLocalStore() {
  const now = new Date().toISOString();
  const state = {
    revision: 1,
    seq: 1,
    settings: { ...DEFAULT_SETTINGS },
    users: DEFAULT_USERS.map((u) => ({ ...u })),
    menuItems: DEFAULT_MENU_ITEMS.map((m) => ({ ...m, createdAt: now, updatedAt: now })),
    tables: DEFAULT_TABLES.map((t) => ({ ...t, createdAt: now, updatedAt: now })),
    orders: [],
  };

  const bump = () => {
    state.revision += 1;
    return state.revision;
  };

  return {
    getRevision: () => state.revision,
    nextSequence: () => {
      const n = state.seq;
      state.seq += 1;
      return n;
    },

    authenticate(email, password) {
      const user = state.users.find(
        (u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase()
      );
      if (!user || user.password !== password) return null;
      const { password: _p, ...safeUser } = user;
      return safeUser;
    },

    getUser(uid) {
      const u = state.users.find((x) => x.uid === uid || x.id === uid);
      if (!u) return null;
      const { password: _p, ...safe } = u;
      return safe;
    },

    listUsers() {
      return state.users.map(({ password: _p, ...safe }) => ({ ...safe }));
    },

    createUser({ email, password, displayName, role }) {
      if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('Email sudah terdaftar.');
      }
      const uid = `uid-${crypto.randomUUID().slice(0, 8)}`;
      const rec = {
        id: uid,
        uid,
        email,
        password,
        displayName,
        role,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.users.push(rec);
      bump();
      const { password: _p, ...safe } = rec;
      return safe;
    },

    updateUser(uid, updates) {
      const idx = state.users.findIndex((u) => u.uid === uid || u.id === uid);
      if (idx === -1) return null;
      const curr = state.users[idx];
      state.users[idx] = {
        ...curr,
        ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
        ...(updates.role !== undefined ? { role: updates.role } : {}),
        ...(updates.isActive !== undefined ? { isActive: Boolean(updates.isActive) } : {}),
        ...(updates.password ? { password: updates.password } : {}),
        updatedAt: new Date().toISOString(),
      };
      bump();
      const { password: _p, ...safe } = state.users[idx];
      return safe;
    },

    getSettings() {
      return { ...state.settings };
    },

    updateSettings(patch) {
      state.settings = {
        ...state.settings,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      bump();
      return { ...state.settings };
    },

    listMenu() {
      return state.menuItems.map((m) => ({ ...m }));
    },

    createMenu(item) {
      const rec = {
        id: `menu-${crypto.randomUUID().slice(0, 8)}`,
        ...item,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.menuItems.push(rec);
      bump();
      return { ...rec };
    },

    updateMenu(id, patch) {
      const idx = state.menuItems.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      state.menuItems[idx] = {
        ...state.menuItems[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      bump();
      return { ...state.menuItems[idx] };
    },

    deleteMenu(id) {
      const idx = state.menuItems.findIndex((m) => m.id === id);
      if (idx === -1) return false;
      state.menuItems.splice(idx, 1);
      bump();
      return true;
    },

    listOrders() {
      return state.orders
        .map((o) => ({ ...o, items: o.items.map((it) => ({ ...it })) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },

    getOrder(id) {
      const o = state.orders.find((x) => x.id === id);
      return o ? { ...o, items: o.items.map((it) => ({ ...it })) } : null;
    },

    createOrder(order) {
      const rec = {
        id: `ord-${crypto.randomUUID().slice(0, 8)}`,
        ...order,
      };
      state.orders.unshift(rec);
      bump();
      return { ...rec, items: rec.items.map((it) => ({ ...it })) };
    },

    updateOrder(id, patch) {
      const idx = state.orders.findIndex((x) => x.id === id);
      if (idx === -1) return null;
      state.orders[idx] = {
        ...state.orders[idx],
        ...patch,
      };
      bump();
      return {
        ...state.orders[idx],
        items: state.orders[idx].items.map((it) => ({ ...it })),
      };
    },

    deleteOrder(id) {
      const idx = state.orders.findIndex((x) => x.id === id);
      if (idx === -1) return false;
      state.orders.splice(idx, 1);
      bump();
      return true;
    },

    deleteAllOrders() {
      const count = state.orders.length;
      state.orders.length = 0;
      bump();
      return count;
    },

    listTables() {
      return state.tables
        .map((t) => ({ ...t }))
        .sort((a, b) => String(a.number).localeCompare(String(b.number), 'id', { numeric: true }));
    },

    createTable(table) {
      const nowIso = new Date().toISOString();
      const rec = {
        id: `tbl-${crypto.randomUUID().slice(0, 8)}`,
        number: table.number,
        area: table.area || 'Utama',
        capacity: Number(table.capacity || 4),
        status: table.status || 'available',
        note: table.note || '',
        updatedBy: table.updatedBy || '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.tables.push(rec);
      bump();
      return { ...rec };
    },

    updateTable(id, patch) {
      const idx = state.tables.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      state.tables[idx] = {
        ...state.tables[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      bump();
      return { ...state.tables[idx] };
    },

    deleteTable(id) {
      const idx = state.tables.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      state.tables.splice(idx, 1);
      bump();
      return true;
    },
  };
}

let singletonStore = null;

export function getSharedLocalStore() {
  if (!singletonStore) {
    singletonStore = createLocalStore();
  }
  return singletonStore;
}

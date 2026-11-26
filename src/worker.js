import { signLocalJwt, verifyFirebaseIdToken, verifyLocalJwt } from './auth-verify.js';
import { FirebaseAdminRest } from './firebase-admin-rest.js';
import {
  DEFAULT_MENU_ITEMS,
  DEFAULT_SETTINGS,
  DEFAULT_TABLES,
  getSharedLocalStore,
} from './local-dev-store.js';

const VALID_ROLES = new Set(['admin', 'kasir', 'chef']);
const VALID_CATEGORIES = new Set(['makanan', 'minuman']);
const VALID_SERVICE_TYPES = new Set(['dine_in', 'take_away']);
const VALID_STATUSES = new Set(['pending', 'cooking', 'ready', 'completed', 'cancelled']);
const VALID_SECTIONS = new Set(['food', 'drink', 'all']);

function resolveSectionStatuses(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const fallback = VALID_STATUSES.has(order?.status) ? order.status : 'pending';
  const normalizedItems = items.map((it) => {
    const catFallback =
      it.category === 'makanan' && VALID_STATUSES.has(order?.foodStatus)
        ? order.foodStatus
        : it.category === 'minuman' && VALID_STATUSES.has(order?.drinkStatus)
          ? order.drinkStatus
          : fallback;
    const itemStatus = VALID_STATUSES.has(it?.itemStatus) ? it.itemStatus : catFallback;
    return { ...it, itemStatus };
  });

  const foodItems = normalizedItems.filter((it) => it.category === 'makanan');
  const drinkItems = normalizedItems.filter((it) => it.category === 'minuman');

  const deriveGroupStatus = (groupItems, explicitStatus) => {
    if (groupItems.length === 0) return 'none';
    const hasExplicitItemStatus = groupItems.some((it) => VALID_STATUSES.has(it.itemStatus));
    if (!hasExplicitItemStatus && VALID_STATUSES.has(explicitStatus)) return explicitStatus;
    const statuses = groupItems.map((it) => it.itemStatus);
    if (statuses.every((s) => s === 'cancelled')) return 'cancelled';
    if (statuses.every((s) => s === 'completed')) return 'completed';
    if (statuses.every((s) => s === 'ready' || s === 'completed')) return 'ready';
    if (statuses.some((s) => s === 'cooking' || s === 'ready' || s === 'completed')) return 'cooking';
    return 'pending';
  };

  return {
    items: normalizedItems,
    hasFood: foodItems.length > 0,
    hasDrink: drinkItems.length > 0,
    foodStatus: deriveGroupStatus(foodItems, order?.foodStatus),
    drinkStatus: deriveGroupStatus(drinkItems, order?.drinkStatus),
  };
}

function computeOverallOrderStatus(foodStatus, drinkStatus, fallback = 'pending') {
  const active = [foodStatus, drinkStatus].filter((s) => s && s !== 'none');
  if (active.length === 0) return VALID_STATUSES.has(fallback) ? fallback : 'pending';
  if (active.every((s) => s === 'cancelled')) return 'cancelled';
  if (active.every((s) => s === 'completed')) return 'completed';
  if (active.every((s) => s === 'ready' || s === 'completed')) return 'ready';
  if (active.some((s) => s === 'cooking' || s === 'ready' || s === 'completed')) return 'cooking';
  return 'pending';
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function errorResponse(message, status = 400, code = 'BAD_REQUEST') {
  return jsonResponse({ error: message, code }, status);
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

function isFirebaseConfigured(env) {
  return Boolean(
    env?.FIREBASE_PROJECT_ID &&
      (env?.FIREBASE_WEB_API_KEY || (env?.FIREBASE_CLIENT_EMAIL && env?.FIREBASE_PRIVATE_KEY))
  );
}

function sanitizeOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Pesanan harus memiliki minimal 1 menu makanan atau minuman.' };
  }
  const cleaned = [];
  let totalAmount = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') {
      return { error: 'Format item pesanan tidak valid.' };
    }
    const name = String(raw.name || '').trim();
    const category = String(raw.category || '').trim().toLowerCase();
    const qty = Number(raw.qty);
    const price = Number(raw.price ?? 0);
    const note = String(raw.note || '').trim().slice(0, 200);
    const menuItemId = raw.menuItemId ? String(raw.menuItemId) : null;

    if (!name) {
      return { error: 'Nama menu pada setiap item wajib diisi.' };
    }
    if (!VALID_CATEGORIES.has(category)) {
      return { error: `Kategori "${category}" tidak valid. Gunakan makanan atau minuman.` };
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      return { error: `Jumlah untuk "${name}" harus bilangan bulat antara 1 dan 999.` };
    }
    if (!Number.isFinite(price) || price < 0) {
      return { error: `Harga untuk "${name}" tidak valid.` };
    }
    const roundedPrice = Math.round(price);
    totalAmount += roundedPrice * qty;
    cleaned.push({
      menuItemId,
      name: name.slice(0, 120),
      category,
      qty,
      price: roundedPrice,
      note,
    });
  }
  return { items: cleaned, totalAmount };
}

function formatOrderCode(seq) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `ORD-${y}${m}${day}-${String(seq).padStart(3, '0')}`;
}

function createFirestoreAdapter(env, fetchImpl, userBearerToken = null) {
  const fb = new FirebaseAdminRest(env, fetchImpl, userBearerToken);
  return {
    mode: 'firebase',
    getRevision: async () => Date.now(),

    async getUser(uid) {
      return fb.getDocument('users', uid);
    },

    async listUsers() {
      const list = await fb.listDocuments('users');
      return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    },

    async createUser({ email, password, displayName, role }) {
      const authRes = await fb.createAuthUser({ email, password, displayName });
      const uid = authRes.localId;
      const now = new Date().toISOString();
      const profile = {
        uid,
        email,
        displayName,
        role,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      await fb.setDocument('users', uid, profile);
      return { id: uid, ...profile };
    },

    async updateUser(uid, updates) {
      const curr = await fb.getDocument('users', uid);
      if (!curr) return null;
      const authUpdates = {};
      if (updates.displayName !== undefined) authUpdates.displayName = updates.displayName;
      if (updates.isActive !== undefined) authUpdates.disableUser = !updates.isActive;
      if (updates.password) authUpdates.password = updates.password;
      if (Object.keys(authUpdates).length > 0) {
        await fb.updateAuthUser(uid, authUpdates);
      }
      const next = {
        uid: curr.uid || uid,
        email: curr.email,
        displayName: updates.displayName ?? curr.displayName,
        role: updates.role ?? curr.role,
        isActive: updates.isActive ?? curr.isActive,
        createdAt: curr.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await fb.setDocument('users', uid, next);
      return { id: uid, ...next };
    },

    async getSettings() {
      const doc = await fb.getDocument('settings', 'restaurant');
      if (!doc) {
        await fb.setDocument('settings', 'restaurant', DEFAULT_SETTINGS);
        return { ...DEFAULT_SETTINGS };
      }
      return doc;
    },

    async updateSettings(patch) {
      const curr = await this.getSettings();
      const next = {
        kasirCanDeleteOrder:
          patch.kasirCanDeleteOrder !== undefined
            ? Boolean(patch.kasirCanDeleteOrder)
            : Boolean(curr.kasirCanDeleteOrder),
        kasirCanEditWhileCooking:
          patch.kasirCanEditWhileCooking !== undefined
            ? Boolean(patch.kasirCanEditWhileCooking)
            : Boolean(curr.kasirCanEditWhileCooking),
        kasirCanCancelWhileCooking:
          patch.kasirCanCancelWhileCooking !== undefined
            ? Boolean(patch.kasirCanCancelWhileCooking)
            : Boolean(curr.kasirCanCancelWhileCooking),
        kasirCanViewReport:
          patch.kasirCanViewReport !== undefined
            ? Boolean(patch.kasirCanViewReport)
            : Boolean(curr.kasirCanViewReport),
        updatedAt: new Date().toISOString(),
      };
      await fb.setDocument('settings', 'restaurant', next);
      return { id: 'restaurant', ...next };
    },

    async listMenu() {
      const items = await fb.listDocuments('menu_items');
      if (items.length === 0) {
        const now = new Date().toISOString();
        const seeded = [];
        for (const item of DEFAULT_MENU_ITEMS) {
          const payload = {
            name: item.name,
            category: item.category,
            price: item.price,
            isAvailable: item.isAvailable,
            createdAt: now,
            updatedAt: now,
          };
          const created = await fb.createDocument('menu_items', payload, item.id);
          seeded.push(created);
        }
        return seeded;
      }
      return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },

    async createMenu(item) {
      const now = new Date().toISOString();
      return fb.createDocument('menu_items', { ...item, createdAt: now, updatedAt: now });
    },

    async updateMenu(id, patch) {
      const curr = await fb.getDocument('menu_items', id);
      if (!curr) return null;
      const next = {
        name: patch.name ?? curr.name,
        category: patch.category ?? curr.category,
        price: patch.price ?? curr.price,
        isAvailable: patch.isAvailable !== undefined ? Boolean(patch.isAvailable) : Boolean(curr.isAvailable),
        createdAt: curr.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return fb.setDocument('menu_items', id, next);
    },

    async deleteMenu(id) {
      const curr = await fb.getDocument('menu_items', id);
      if (!curr) return false;
      await fb.deleteDocument('menu_items', id);
      return true;
    },

    async listOrders() {
      const list = await fb.listDocuments('orders');
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },

    async getOrder(id) {
      return fb.getDocument('orders', id);
    },

    async createOrder(order) {
      const existing = await fb.listRecentOrders(40);
      const todayPrefix = formatOrderCode(0).slice(0, 13);
      let maxSeq = 0;
      for (const o of existing) {
        if (typeof o.orderCode === 'string' && o.orderCode.startsWith(todayPrefix)) {
          const n = Number.parseInt(o.orderCode.slice(todayPrefix.length), 10);
          if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
        }
      }
      const code = formatOrderCode(maxSeq + 1);
      return fb.createDocument('orders', { ...order, orderCode: code });
    },

    async updateOrder(id, patch) {
      const curr = await fb.getDocument('orders', id);
      if (!curr) return null;
      const next = { ...curr, ...patch };
      delete next.id;
      return fb.setDocument('orders', id, next);
    },

    async deleteOrder(id) {
      const curr = await fb.getDocument('orders', id);
      if (!curr) return false;
      await fb.deleteDocument('orders', id);
      return true;
    },

    async deleteAllOrders() {
      const docs = await fb.listDocuments('orders', 500);
      if (docs.length === 0) return 0;
      return fb.deleteDocumentsBatch('orders', docs.map((d) => d.id));
    },

    async listTables() {
      const items = await fb.listDocuments('tables');
      if (items.length === 0) {
        const now = new Date().toISOString();
        const seeded = [];
        for (const tbl of DEFAULT_TABLES) {
          const created = await fb.createDocument(
            'tables',
            {
              number: tbl.number,
              area: tbl.area,
              capacity: tbl.capacity,
              status: tbl.status,
              note: '',
              createdAt: now,
              updatedAt: now,
            },
            tbl.id
          );
          seeded.push(created);
        }
        return seeded;
      }
      return items.sort((a, b) => String(a.number).localeCompare(String(b.number), 'id', { numeric: true }));
    },

    async createTable(table) {
      const now = new Date().toISOString();
      return fb.createDocument('tables', { ...table, createdAt: now, updatedAt: now });
    },

    async updateTable(id, patch) {
      const curr = await fb.getDocument('tables', id);
      if (!curr) return null;
      const next = {
        number: patch.number ?? curr.number,
        area: patch.area ?? curr.area,
        capacity: patch.capacity ?? curr.capacity,
        status: patch.status ?? curr.status,
        note: patch.note ?? curr.note ?? '',
        updatedBy: patch.updatedBy ?? curr.updatedBy ?? '',
        createdAt: curr.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return fb.setDocument('tables', id, next);
    },

    async deleteTable(id) {
      const curr = await fb.getDocument('tables', id);
      if (!curr) return false;
      await fb.deleteDocument('tables', id);
      return true;
    },
  };
}

function createLocalAdapter(store) {
  return {
    mode: 'local',
    getRevision: async () => store.getRevision(),
    authenticate: (email, password) => store.authenticate(email, password),
    getUser: async (uid) => store.getUser(uid),
    listUsers: async () => store.listUsers(),
    createUser: async (data) => store.createUser(data),
    updateUser: async (uid, updates) => store.updateUser(uid, updates),
    getSettings: async () => store.getSettings(),
    updateSettings: async (patch) => store.updateSettings(patch),
    listMenu: async () => store.listMenu(),
    createMenu: async (item) => store.createMenu(item),
    updateMenu: async (id, patch) => store.updateMenu(id, patch),
    deleteMenu: async (id) => store.deleteMenu(id),
    listOrders: async () => store.listOrders(),
    getOrder: async (id) => store.getOrder(id),
    createOrder: async (order) => {
      const code = formatOrderCode(store.nextSequence());
      return store.createOrder({ ...order, orderCode: code });
    },
    updateOrder: async (id, patch) => store.updateOrder(id, patch),
    deleteOrder: async (id) => store.deleteOrder(id),
    deleteAllOrders: async () => store.deleteAllOrders(),
    listTables: async () => store.listTables(),
    createTable: async (table) => store.createTable(table),
    updateTable: async (id, patch) => store.updateTable(id, patch),
    deleteTable: async (id) => store.deleteTable(id),
  };
}

export function createWorkerHandler(options = {}) {
  return async function handleRequest(request, env = {}, _ctx = {}) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (!path.startsWith('/api/')) {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return env.ASSETS.fetch(request);
      }
      return errorResponse('Static assets binding tidak tersedia.', 404, 'NOT_FOUND');
    }

    const useFirebase = isFirebaseConfigured(env) && !options.forceLocal;
    const store = options.localStore || getSharedLocalStore();
    const authHeaderPre = request.headers.get('Authorization') || '';
    const bearerMatchPre = authHeaderPre.match(/^Bearer\s+(.+)$/i);
    const userBearerToken = bearerMatchPre ? bearerMatchPre[1].trim() : null;
    const adapter =
      options.adapter ||
      (useFirebase
        ? createFirestoreAdapter(env, options.fetchImpl || globalThis.fetch.bind(globalThis), userBearerToken)
        : createLocalAdapter(store));
    const localSecret = env.LOCAL_AUTH_SECRET || 'restoran-dev-local-secret-change-in-prod';

    try {
      // Publik: informasi konfigurasi mode (Firebase vs Lokal Dev)
      if (method === 'GET' && path === '/api/health') {
        return jsonResponse({ ok: true, mode: adapter.mode });
      }

      if (method === 'GET' && path === '/api/config') {
        if (useFirebase) {
          return jsonResponse({
            mode: 'firebase',
            firebaseConfig: {
              apiKey: env.FIREBASE_WEB_API_KEY || '',
              authDomain: env.FIREBASE_AUTH_DOMAIN || `${env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
              projectId: env.FIREBASE_PROJECT_ID,
              appId: env.FIREBASE_APP_ID || '',
            },
          });
        }
        return jsonResponse({ mode: 'local' });
      }

      // Login Mode Lokal Dev
      if (method === 'POST' && path === '/api/auth/login') {
        if (adapter.mode !== 'local') {
          return errorResponse('Gunakan Firebase Authentication di mode produksi.', 400, 'FIREBASE_MODE');
        }
        const body = await readJson(request);
        if (!body || !body.email || !body.password) {
          return errorResponse('Email dan kata sandi wajib diisi.', 400);
        }
        const user = adapter.authenticate(body.email, body.password);
        if (!user) {
          return errorResponse('Email atau kata sandi salah.', 401, 'INVALID_CREDENTIALS');
        }
        if (!user.isActive) {
          return errorResponse('Akun Anda sedang dinonaktifkan oleh Admin.', 403, 'USER_DISABLED');
        }
        const now = Math.floor(Date.now() / 1000);
        const token = await signLocalJwt(
          { sub: user.uid, role: user.role, email: user.email, iat: now, exp: now + 60 * 60 * 12 },
          localSecret
        );
        const settings = await adapter.getSettings();
        return jsonResponse({ token, user, settings, mode: adapter.mode });
      }

      // Semua endpoint /api/* berikutnya wajib autentikasi Bearer token
      const authHeader = request.headers.get('Authorization') || '';
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch) {
        return errorResponse('Silakan masuk terlebih dahulu.', 401, 'UNAUTHORIZED');
      }
      const token = tokenMatch[1].trim();

      let tokenPayload;
      try {
        if (useFirebase) {
          const verifyFn = options.verifyFirebaseToken || verifyFirebaseIdToken;
          tokenPayload = await verifyFn(
            token,
            env.FIREBASE_PROJECT_ID,
            options.fetchImpl || globalThis.fetch.bind(globalThis)
          );
        } else {
          tokenPayload = await verifyLocalJwt(token, localSecret);
        }
      } catch (err) {
        return errorResponse(err.message || 'Token autentikasi tidak valid.', 401, 'INVALID_TOKEN');
      }

      const rawUser = await adapter.getUser(tokenPayload.sub);
      if (!rawUser || !rawUser.isActive || !VALID_ROLES.has(rawUser.role)) {
        return errorResponse('Akun staf tidak ditemukan atau sedang nonaktif.', 403, 'FORBIDDEN');
      }
      const currentUser = {
        ...rawUser,
        uid: rawUser.uid || rawUser.id || tokenPayload.sub,
        displayName: rawUser.displayName || rawUser.name || rawUser.email,
      };

      // GET /api/me
      if (method === 'GET' && path === '/api/me') {
        const settings = await adapter.getSettings();
        return jsonResponse({ user: currentUser, settings, mode: adapter.mode });
      }

      // GET / PUT /api/settings
      if (path === '/api/settings') {
        if (method === 'GET') {
          return jsonResponse({ settings: await adapter.getSettings() });
        }
        if (method === 'PUT') {
          if (currentUser.role !== 'admin') {
            return errorResponse('Hanya Admin yang dapat mengubah pengaturan izin.', 403, 'FORBIDDEN');
          }
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);
          const patch = {};
          for (const key of [
            'kasirCanDeleteOrder',
            'kasirCanEditWhileCooking',
            'kasirCanCancelWhileCooking',
            'kasirCanViewReport',
          ]) {
            if (body[key] !== undefined) patch[key] = Boolean(body[key]);
          }
          const updated = await adapter.updateSettings(patch);
          return jsonResponse({ settings: updated });
        }
      }

      // Menu Routes (/api/menu & /api/menu/:id)
      if (path === '/api/menu') {
        if (method === 'GET') {
          let items = await adapter.listMenu();
          const cat = url.searchParams.get('category');
          if (cat && VALID_CATEGORIES.has(cat)) {
            items = items.filter((m) => m.category === cat);
          }
          return jsonResponse({ items });
        }
        if (method === 'POST') {
          if (currentUser.role !== 'admin') {
            return errorResponse('Hanya Admin yang dapat menambah daftar menu.', 403, 'FORBIDDEN');
          }
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);
          const name = String(body.name || '').trim();
          const category = String(body.category || '').trim().toLowerCase();
          const price = Number(body.price);
          if (!name) return errorResponse('Nama menu wajib diisi.', 400);
          if (!VALID_CATEGORIES.has(category)) {
            return errorResponse('Kategori menu harus makanan atau minuman.', 400);
          }
          if (!Number.isFinite(price) || price < 0) {
            return errorResponse('Harga menu tidak valid.', 400);
          }
          const created = await adapter.createMenu({
            name: name.slice(0, 120),
            category,
            price: Math.round(price),
            isAvailable: body.isAvailable !== undefined ? Boolean(body.isAvailable) : true,
          });
          return jsonResponse({ item: created }, 201);
        }
      }

      const menuMatch = path.match(/^\/api\/menu\/([^/]+)$/);
      if (menuMatch) {
        const menuId = decodeURIComponent(menuMatch[1]);
        if (currentUser.role !== 'admin') {
          return errorResponse('Hanya Admin yang dapat mengubah daftar menu.', 403, 'FORBIDDEN');
        }
        if (method === 'PUT') {
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);
          const patch = {};
          if (body.name !== undefined) {
            const n = String(body.name).trim();
            if (!n) return errorResponse('Nama menu tidak boleh kosong.', 400);
            patch.name = n.slice(0, 120);
          }
          if (body.category !== undefined) {
            const c = String(body.category).trim().toLowerCase();
            if (!VALID_CATEGORIES.has(c)) return errorResponse('Kategori menu tidak valid.', 400);
            patch.category = c;
          }
          if (body.price !== undefined) {
            const p = Number(body.price);
            if (!Number.isFinite(p) || p < 0) return errorResponse('Harga menu tidak valid.', 400);
            patch.price = Math.round(p);
          }
          if (body.isAvailable !== undefined) {
            patch.isAvailable = Boolean(body.isAvailable);
          }
          const updated = await adapter.updateMenu(menuId, patch);
          if (!updated) return errorResponse('Menu tidak ditemukan.', 404, 'NOT_FOUND');
          return jsonResponse({ item: updated });
        }
        if (method === 'DELETE') {
          const ok = await adapter.deleteMenu(menuId);
          if (!ok) return errorResponse('Menu tidak ditemukan.', 404, 'NOT_FOUND');
          return jsonResponse({ deleted: true, id: menuId });
        }
      }

      // GET / POST /api/tables
      if (path === '/api/tables') {
        if (method === 'GET') {
          const tables = await adapter.listTables();
          return jsonResponse({ tables });
        }
        if (method === 'POST') {
          if (currentUser.role !== 'admin') {
            return errorResponse('Hanya Admin yang dapat menambah meja.', 403, 'FORBIDDEN');
          }
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);
          const number = String(body.number || '').trim().slice(0, 20);
          const area = String(body.area || 'Utama').trim().slice(0, 40) || 'Utama';
          const capacity = Number(body.capacity ?? 4);
          const status = String(body.status || 'available').trim();
          if (!number) return errorResponse('Nomor meja wajib diisi.', 400);
          if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
            return errorResponse('Kapasitas meja harus antara 1 dan 50 kursi.', 400);
          }
          if (!['available', 'reserved', 'cleaning'].includes(status)) {
            return errorResponse('Status meja tidak valid.', 400);
          }
          const created = await adapter.createTable({
            number,
            area,
            capacity,
            status,
            note: String(body.note || '').trim().slice(0, 200),
            updatedBy: currentUser.displayName || currentUser.email,
          });
          return jsonResponse({ table: created }, 201);
        }
      }

      const tableMatch = path.match(/^\/api\/tables\/([^/]+)$/);
      if (tableMatch) {
        const tableId = decodeURIComponent(tableMatch[1]);
        if (method === 'PUT') {
          if (currentUser.role !== 'admin' && currentUser.role !== 'kasir') {
            return errorResponse('Hanya Admin atau Kasir yang dapat mengubah meja.', 403, 'FORBIDDEN');
          }
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);
          if (
            currentUser.role !== 'admin' &&
            (body.number !== undefined || body.area !== undefined || body.capacity !== undefined)
          ) {
            return errorResponse('Hanya Admin yang dapat mengubah nomor, area, atau kapasitas meja.', 403, 'FORBIDDEN');
          }
          const patch = { updatedBy: currentUser.displayName || currentUser.email };
          if (body.number !== undefined) {
            const n = String(body.number).trim().slice(0, 20);
            if (!n) return errorResponse('Nomor meja tidak boleh kosong.', 400);
            patch.number = n;
          }
          if (body.area !== undefined) {
            patch.area = String(body.area).trim().slice(0, 40) || 'Utama';
          }
          if (body.capacity !== undefined) {
            const c = Number(body.capacity);
            if (!Number.isInteger(c) || c < 1 || c > 50) {
              return errorResponse('Kapasitas meja harus antara 1 dan 50 kursi.', 400);
            }
            patch.capacity = c;
          }
          if (body.status !== undefined) {
            const s = String(body.status).trim();
            if (!['available', 'reserved', 'cleaning'].includes(s)) {
              return errorResponse('Status meja tidak valid.', 400);
            }
            patch.status = s;
          }
          if (body.note !== undefined) {
            patch.note = String(body.note).trim().slice(0, 200);
          }
          const updated = await adapter.updateTable(tableId, patch);
          if (!updated) return errorResponse('Meja tidak ditemukan.', 404, 'NOT_FOUND');
          return jsonResponse({ table: updated });
        }
        if (method === 'DELETE') {
          if (currentUser.role !== 'admin') {
            return errorResponse('Hanya Admin yang dapat menghapus meja.', 403, 'FORBIDDEN');
          }
          const ok = await adapter.deleteTable(tableId);
          if (!ok) return errorResponse('Meja tidak ditemukan.', 404, 'NOT_FOUND');
          return jsonResponse({ deleted: true, id: tableId });
        }
      }

      // User Management Routes (/api/users & /api/users/:uid) - Admin only
      if (path === '/api/users') {
        if (currentUser.role !== 'admin') {
          return errorResponse('Hanya Admin yang dapat mengelola akun staf.', 403, 'FORBIDDEN');
        }
        if (method === 'GET') {
          return jsonResponse({ users: await adapter.listUsers() });
        }
        if (method === 'POST') {
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);
          const email = String(body.email || '').trim().toLowerCase();
          const password = String(body.password || '');
          const displayName = String(body.displayName || '').trim();
          const role = String(body.role || '').trim().toLowerCase();

          if (!email || !email.includes('@')) return errorResponse('Format email tidak valid.', 400);
          if (password.length < 6) {
            return errorResponse('Kata sandi minimal 6 karakter.', 400);
          }
          if (!displayName) return errorResponse('Nama lengkap wajib diisi.', 400);
          if (!VALID_ROLES.has(role)) {
            return errorResponse('Peran harus admin, kasir, atau chef.', 400);
          }
          try {
            const created = await adapter.createUser({ email, password, displayName, role });
            return jsonResponse({ user: created }, 201);
          } catch (err) {
            return errorResponse(err.message || 'Gagal membuat akun.', 400);
          }
        }
      }

      const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch) {
        const targetUid = decodeURIComponent(userMatch[1]);
        if (currentUser.role !== 'admin') {
          return errorResponse('Hanya Admin yang dapat mengubah akun staf.', 403, 'FORBIDDEN');
        }
        if (method === 'PATCH') {
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);
          const updates = {};
          if (body.displayName !== undefined) {
            const dn = String(body.displayName).trim();
            if (!dn) return errorResponse('Nama lengkap tidak boleh kosong.', 400);
            updates.displayName = dn;
          }
          if (body.role !== undefined) {
            const r = String(body.role).trim().toLowerCase();
            if (!VALID_ROLES.has(r)) return errorResponse('Peran tidak valid.', 400);
            if (targetUid === currentUser.uid && r !== 'admin') {
              return errorResponse('Admin tidak dapat menurunkan perannya sendiri.', 400);
            }
            updates.role = r;
          }
          if (body.isActive !== undefined) {
            if (targetUid === currentUser.uid && !body.isActive) {
              return errorResponse('Anda tidak dapat menonaktifkan akun sendiri.', 400);
            }
            updates.isActive = Boolean(body.isActive);
          }
          if (body.password) {
            if (String(body.password).length < 6) {
              return errorResponse('Kata sandi minimal 6 karakter.', 400);
            }
            updates.password = String(body.password);
          }
          const updated = await adapter.updateUser(targetUid, updates);
          if (!updated) return errorResponse('Akun staf tidak ditemukan.', 404, 'NOT_FOUND');
          return jsonResponse({ user: updated });
        }
      }

      // Orders Routes (/api/orders, /api/orders/:id, /api/orders/:id/status)
      if (path === '/api/orders') {
        if (method === 'GET') {
          const rev = await adapter.getRevision();
          const sinceRev = url.searchParams.get('sinceRev');
          if (sinceRev !== null && Number(sinceRev) === rev) {
            return jsonResponse({ unchanged: true, revision: rev });
          }
          let orders = await adapter.listOrders();
          const status = url.searchParams.get('status');
          if (status && VALID_STATUSES.has(status)) {
            orders = orders.filter((o) => o.status === status);
          }
          const settings = await adapter.getSettings();
          return jsonResponse({ orders, revision: rev, settings });
        }
        if (method === 'POST') {
          if (currentUser.role !== 'admin' && currentUser.role !== 'kasir') {
            return errorResponse('Hanya Kasir atau Admin yang dapat membuat pesanan.', 403, 'FORBIDDEN');
          }
          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);

          const serviceType = String(body.serviceType || '').trim();
          if (!VALID_SERVICE_TYPES.has(serviceType)) {
            return errorResponse('Tipe layanan harus dine_in (Makan di Tempat) atau take_away (Dibungkus).', 400);
          }
          const tableNumber =
            serviceType === 'dine_in' ? String(body.tableNumber || '').trim().slice(0, 20) : '';
          if (serviceType === 'dine_in' && !tableNumber) {
            return errorResponse('Nomor meja wajib diisi untuk pesanan Makan di Tempat.', 400);
          }

          const parsed = sanitizeOrderItems(body.items);
          if (parsed.error) return errorResponse(parsed.error, 400);

          const now = new Date().toISOString();
          const hasFood = parsed.items.some((it) => it.category === 'makanan');
          const hasDrink = parsed.items.some((it) => it.category === 'minuman');
          const initialItems = parsed.items.map((it) => ({ ...it, itemStatus: 'pending' }));
          const created = await adapter.createOrder({
            customerName: String(body.customerName || 'Tamu').trim().slice(0, 80) || 'Tamu',
            serviceType,
            tableNumber,
            notes: String(body.notes || '').trim().slice(0, 300),
            status: 'pending',
            foodStatus: hasFood ? 'pending' : 'none',
            drinkStatus: hasDrink ? 'pending' : 'none',
            cancelReason: '',
            isEdited: false,
            totalAmount: parsed.totalAmount,
            paymentStatus: 'unpaid',
            paymentMethod: '',
            discountAmount: 0,
            paidAmount: 0,
            changeAmount: 0,
            paidAt: '',
            paidBy: '',
            items: initialItems,
            createdBy: currentUser.displayName || currentUser.email,
            createdByUid: currentUser.uid,
            updatedBy: currentUser.displayName || currentUser.email,
            createdAt: now,
            updatedAt: now,
          });
          return jsonResponse({ order: created, revision: await adapter.getRevision() }, 201);
        }

        if (method === 'DELETE') {
          if (currentUser.role !== 'admin') {
            return errorResponse('Hanya Admin yang dapat menghapus semua pesanan di database.', 403, 'FORBIDDEN');
          }
          const deletedCount = await adapter.deleteAllOrders();
          return jsonResponse({ deleted: true, deletedCount, revision: await adapter.getRevision() });
        }
      }

      const orderPayMatch = path.match(/^\/api\/orders\/([^/]+)\/pay$/);
      if (orderPayMatch && method === 'POST') {
        if (currentUser.role !== 'admin' && currentUser.role !== 'kasir') {
          return errorResponse('Hanya Admin atau Kasir yang dapat memproses pembayaran.', 403, 'FORBIDDEN');
        }
        const orderId = decodeURIComponent(orderPayMatch[1]);
        const body = await readJson(request);
        if (!body) return errorResponse('Body JSON tidak valid.', 400);

        const paymentMethod = String(body.paymentMethod || '').trim().toLowerCase();
        if (!['cash', 'qris', 'transfer', 'debit'].includes(paymentMethod)) {
          return errorResponse('Metode pembayaran harus cash, qris, transfer, atau debit.', 400);
        }

        const existing = await adapter.getOrder(orderId);
        if (!existing) return errorResponse('Pesanan tidak ditemukan.', 404, 'NOT_FOUND');
        if (existing.status === 'cancelled') {
          return errorResponse('Pesanan yang dibatalkan tidak dapat dibayar.', 400);
        }

        const totalAmount = Number(existing.totalAmount || 0);
        const rawDiscount = Number(body.discountAmount ?? 0);
        if (!Number.isFinite(rawDiscount) || rawDiscount < 0 || rawDiscount > totalAmount) {
          return errorResponse('Diskon tidak valid atau melebihi total tagihan.', 400);
        }
        const discountAmount = Math.round(rawDiscount);
        const netTotal = Math.max(0, totalAmount - discountAmount);

        let paidAmount = netTotal;
        let changeAmount = 0;
        if (paymentMethod === 'cash') {
          const rawPaid = Number(body.paidAmount ?? 0);
          if (!Number.isFinite(rawPaid) || rawPaid < netTotal) {
            return errorResponse('Nominal uang diterima kurang dari total tagihan.', 400);
          }
          paidAmount = Math.round(rawPaid);
          changeAmount = Math.max(0, paidAmount - netTotal);
        }

        const now = new Date().toISOString();
        const patch = {
          paymentStatus: 'paid',
          paymentMethod,
          discountAmount,
          paidAmount,
          changeAmount,
          paidAt: now,
          paidBy: currentUser.displayName || currentUser.email,
          updatedBy: currentUser.displayName || currentUser.email,
          updatedAt: now,
        };

        if (body.markCompleted === true && existing.status === 'ready') {
          patch.status = 'completed';
          const currSec = resolveSectionStatuses(existing);
          if (currSec.foodStatus !== 'none') patch.foodStatus = 'completed';
          if (currSec.drinkStatus !== 'none') patch.drinkStatus = 'completed';
          patch.items = currSec.items.map((it) => ({ ...it, itemStatus: 'completed' }));
        }

        const updated = await adapter.updateOrder(orderId, patch);
        return jsonResponse({ order: updated, revision: await adapter.getRevision() });
      }

      const orderStatusMatch = path.match(/^\/api\/orders\/([^/]+)\/status$/);
      if (orderStatusMatch && method === 'PATCH') {
        const orderId = decodeURIComponent(orderStatusMatch[1]);
        const body = await readJson(request);
        if (!body) return errorResponse('Body JSON tidak valid.', 400);

        const nextStatus = String(body.status || '').trim();
        if (!VALID_STATUSES.has(nextStatus)) {
          return errorResponse('Status pesanan tidak valid.', 400);
        }
        const section = body.section !== undefined ? String(body.section).trim().toLowerCase() : 'all';
        if (!VALID_SECTIONS.has(section)) {
          return errorResponse('Bagian pesanan harus food, drink, atau all.', 400);
        }
        const hasItemIndex = body.itemIndex !== undefined && body.itemIndex !== null;
        const itemIndex = hasItemIndex ? Number(body.itemIndex) : -1;

        const existing = await adapter.getOrder(orderId);
        if (!existing) return errorResponse('Pesanan tidak ditemukan.', 404, 'NOT_FOUND');

        const currSections = resolveSectionStatuses(existing);
        if (hasItemIndex) {
          if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= currSections.items.length) {
            return errorResponse('Indeks item pesanan tidak valid.', 400);
          }
          if (nextStatus === 'cancelled') {
            return errorResponse('Pembatalan berlaku untuk keseluruhan pesanan.', 400);
          }
        } else {
          if (section === 'food' && currSections.foodStatus === 'none') {
            return errorResponse('Pesanan ini tidak memiliki item makanan.', 400);
          }
          if (section === 'drink' && currSections.drinkStatus === 'none') {
            return errorResponse('Pesanan ini tidak memiliki item minuman.', 400);
          }
        }

        const settings = currentUser.role === 'kasir' ? await adapter.getSettings() : {};

        if (nextStatus === 'cancelled') {
          if (currentUser.role !== 'admin' && currentUser.role !== 'kasir') {
            return errorResponse('Chef tidak dapat membatalkan pesanan; hubungi Kasir atau Admin.', 403, 'FORBIDDEN');
          }
          if (currentUser.role === 'kasir') {
            if (existing.status === 'ready' || existing.status === 'completed') {
              return errorResponse('Pesanan yang sudah siap/selesai tidak dapat dibatalkan oleh Kasir.', 403, 'FORBIDDEN');
            }
            if (existing.status === 'cooking' && !settings.kasirCanCancelWhileCooking) {
              return errorResponse(
                'Admin belum mengizinkan Kasir membatalkan pesanan yang sedang dimasak.',
                403,
                'PERMISSION_DENIED_BY_SETTINGS'
              );
            }
          }
        } else if (nextStatus === 'cooking' || nextStatus === 'ready') {
          if (currentUser.role !== 'admin' && currentUser.role !== 'chef') {
            return errorResponse('Hanya Chef atau Admin yang dapat memperbarui status dapur.', 403, 'FORBIDDEN');
          }
        } else if (nextStatus === 'completed') {
          if (!VALID_ROLES.has(currentUser.role)) {
            return errorResponse('Akses ditolak.', 403, 'FORBIDDEN');
          }
          if (currentUser.role === 'kasir') {
            const targetCurr = hasItemIndex
              ? currSections.items[itemIndex].itemStatus
              : section === 'food'
                ? currSections.foodStatus
                : section === 'drink'
                  ? currSections.drinkStatus
                  : existing.status;
            if (targetCurr !== 'ready') {
              return errorResponse('Kasir hanya dapat menyelesaikan menu/pesanan yang sudah Siap Disajikan.', 403, 'FORBIDDEN');
            }
          }
        }

        const nextItems = currSections.items.map((it, idx) => {
          if (hasItemIndex) {
            return idx === itemIndex ? { ...it, itemStatus: nextStatus } : it;
          }
          if (nextStatus === 'cancelled') {
            return { ...it, itemStatus: 'cancelled' };
          }
          if (section === 'food' && it.category !== 'makanan') return it;
          if (section === 'drink' && it.category !== 'minuman') return it;
          if (nextStatus === 'cooking' && (it.itemStatus === 'ready' || it.itemStatus === 'completed')) {
            return it;
          }
          if (nextStatus === 'ready' && it.itemStatus === 'completed') {
            return it;
          }
          return { ...it, itemStatus: nextStatus };
        });

        const derived = resolveSectionStatuses({ ...existing, items: nextItems });
        const overallStatus =
          nextStatus === 'cancelled'
            ? 'cancelled'
            : computeOverallOrderStatus(derived.foodStatus, derived.drinkStatus, nextStatus);

        const updated = await adapter.updateOrder(orderId, {
          items: nextItems,
          status: overallStatus,
          foodStatus: nextStatus === 'cancelled' && derived.hasFood ? 'cancelled' : derived.foodStatus,
          drinkStatus: nextStatus === 'cancelled' && derived.hasDrink ? 'cancelled' : derived.drinkStatus,
          cancelReason:
            nextStatus === 'cancelled'
              ? String(body.cancelReason || 'Dibatalkan oleh kasir').trim().slice(0, 250)
              : existing.cancelReason || '',
          updatedBy: currentUser.displayName || currentUser.email,
          updatedAt: new Date().toISOString(),
        });
        return jsonResponse({ order: updated, revision: await adapter.getRevision() });
      }

      const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
      if (orderMatch) {
        const orderId = decodeURIComponent(orderMatch[1]);
        const existing = await adapter.getOrder(orderId);
        if (!existing) return errorResponse('Pesanan tidak ditemukan.', 404, 'NOT_FOUND');

        if (method === 'PUT') {
          if (currentUser.role !== 'admin' && currentUser.role !== 'kasir') {
            return errorResponse('Hanya Kasir atau Admin yang dapat mengedit pesanan.', 403, 'FORBIDDEN');
          }
          const settings = currentUser.role === 'kasir' ? await adapter.getSettings() : {};
          if (currentUser.role === 'kasir') {
            if (existing.status === 'ready' || existing.status === 'completed' || existing.status === 'cancelled') {
              return errorResponse(
                'Pesanan yang sudah siap, selesai, atau dibatalkan tidak dapat diedit.',
                403,
                'FORBIDDEN'
              );
            }
            if (existing.status === 'cooking' && !settings.kasirCanEditWhileCooking) {
              return errorResponse(
                'Admin belum mengizinkan Kasir mengedit pesanan yang sedang dimasak.',
                403,
                'PERMISSION_DENIED_BY_SETTINGS'
              );
            }
          }

          const body = await readJson(request);
          if (!body) return errorResponse('Body JSON tidak valid.', 400);

          const serviceType = String(body.serviceType || existing.serviceType).trim();
          if (!VALID_SERVICE_TYPES.has(serviceType)) {
            return errorResponse('Tipe layanan tidak valid.', 400);
          }
          const tableNumber =
            serviceType === 'dine_in'
              ? String(body.tableNumber ?? existing.tableNumber ?? '').trim().slice(0, 20)
              : '';
          if (serviceType === 'dine_in' && !tableNumber) {
            return errorResponse('Nomor meja wajib diisi untuk pesanan Makan di Tempat.', 400);
          }

          const parsed = sanitizeOrderItems(body.items);
          if (parsed.error) return errorResponse(parsed.error, 400);

          const prevSections = resolveSectionStatuses(existing);
          const defaultNewItemStatus = existing.status === 'cooking' ? 'cooking' : 'pending';
          const prevPool = prevSections.items.map((prevIt) => {
            const baseKey = `${prevIt.category}|${String(prevIt.name || '').toLowerCase()}`;
            const noteKey = `${baseKey}|${String(prevIt.note || '').trim().toLowerCase()}`;
            return { baseKey, noteKey, itemStatus: prevIt.itemStatus, used: false };
          });
          const resolvedStatuses = new Array(parsed.items.length).fill(null);

          // Pass 1: cocokkan item identik (kategori + nama + catatan) agar status per-menu tidak tertukar
          parsed.items.forEach((it, idx) => {
            if (VALID_STATUSES.has(it.itemStatus)) {
              resolvedStatuses[idx] = it.itemStatus;
              return;
            }
            const baseKey = `${it.category}|${String(it.name || '').toLowerCase()}`;
            const noteKey = `${baseKey}|${String(it.note || '').trim().toLowerCase()}`;
            const match = prevPool.find((p) => !p.used && p.noteKey === noteKey);
            if (match) {
              match.used = true;
              resolvedStatuses[idx] = match.itemStatus;
            }
          });

          // Pass 2: cocokkan sisa item dengan nama menu sama (mis. kasir mengubah catatan item lama)
          parsed.items.forEach((it, idx) => {
            if (resolvedStatuses[idx]) return;
            const baseKey = `${it.category}|${String(it.name || '').toLowerCase()}`;
            const match = prevPool.find((p) => !p.used && p.baseKey === baseKey);
            if (match) {
              match.used = true;
              resolvedStatuses[idx] = match.itemStatus;
            }
          });

          const nextItems = parsed.items.map((it, idx) => ({
            ...it,
            itemStatus: VALID_STATUSES.has(resolvedStatuses[idx]) ? resolvedStatuses[idx] : defaultNewItemStatus,
          }));
          const derived = resolveSectionStatuses({ ...existing, items: nextItems });
          const nextOverall = computeOverallOrderStatus(derived.foodStatus, derived.drinkStatus, existing.status);

          const updated = await adapter.updateOrder(orderId, {
            customerName:
              String(body.customerName ?? existing.customerName ?? 'Tamu').trim().slice(0, 80) || 'Tamu',
            serviceType,
            tableNumber,
            notes: String(body.notes ?? existing.notes ?? '').trim().slice(0, 300),
            items: nextItems,
            totalAmount: parsed.totalAmount,
            status: nextOverall,
            foodStatus: derived.foodStatus,
            drinkStatus: derived.drinkStatus,
            isEdited: true,
            updatedBy: currentUser.displayName || currentUser.email,
            updatedAt: new Date().toISOString(),
          });
          return jsonResponse({ order: updated, revision: await adapter.getRevision() });
        }

        if (method === 'DELETE') {
          if (currentUser.role !== 'admin' && currentUser.role !== 'kasir') {
            return errorResponse('Chef tidak dapat menghapus pesanan.', 403, 'FORBIDDEN');
          }
          if (currentUser.role === 'kasir') {
            const settings = currentUser.role === 'kasir' ? await adapter.getSettings() : {};
            if (!settings.kasirCanDeleteOrder) {
              return errorResponse(
                'Admin belum mengizinkan Kasir menghapus pesanan permanen. Gunakan fitur Batalkan Pesanan atau minta izin Admin.',
                403,
                'PERMISSION_DENIED_BY_SETTINGS'
              );
            }
          }
          await adapter.deleteOrder(orderId);
          return jsonResponse({ deleted: true, id: orderId, revision: await adapter.getRevision() });
        }
      }

      return errorResponse('Endpoint API tidak ditemukan.', 404, 'NOT_FOUND');
    } catch (err) {
      return errorResponse(err.message || 'Terjadi kesalahan internal pada server.', 500, 'INTERNAL_ERROR');
    }
  };
}

const defaultHandler = createWorkerHandler();

export default {
  fetch(request, env, ctx) {
    return defaultHandler(request, env, ctx);
  },
};

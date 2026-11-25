import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalStore } from '../src/local-dev-store.js';
import { createWorkerHandler } from '../src/worker.js';

function makeApp() {
  const localStore = createLocalStore();
  const handler = createWorkerHandler({ localStore, forceLocal: true });
  const env = { LOCAL_AUTH_SECRET: 'test-secret-key' };

  async function req(method, path, body = null, token = null) {
    const headers = {};
    if (body !== null) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const request = new Request(`http://localhost:8080${path}`, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
    });
    const res = await handler(request, env, {});
    const json = await res.json();
    return { status: res.status, json };
  }

  async function login(email, password) {
    const { status, json } = await req('POST', '/api/auth/login', { email, password });
    assert.equal(status, 200);
    return json.token;
  }

  return { req, login };
}

test('Unauthenticated requests return 401 and public config returns local mode', async () => {
  const { req } = makeApp();
  const cfg = await req('GET', '/api/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.json.mode, 'local');

  const unauth = await req('GET', '/api/orders');
  assert.equal(unauth.status, 401);
});

test('Role-based access control across Admin, Kasir, and Chef', async () => {
  const { req, login } = makeApp();
  const adminToken = await login('admin@restoran.local', 'admin123');
  const kasirToken = await login('kasir@restoran.local', 'kasir123');
  const chefToken = await login('chef@restoran.local', 'chef123');

  // Chef cannot create orders or manage menu/users/settings
  const chefOrder = await req(
    'POST',
    '/api/orders',
    {
      serviceType: 'take_away',
      items: [{ name: 'Nasi Goreng', category: 'makanan', qty: 1, price: 25000 }],
    },
    chefToken
  );
  assert.equal(chefOrder.status, 403);

  // Kasir cannot manage menu, users, or settings
  assert.equal(
    (await req('POST', '/api/menu', { name: 'Bakmi', category: 'makanan', price: 20000 }, kasirToken)).status,
    403
  );
  assert.equal(
    (await req('PUT', '/api/settings', { kasirCanDeleteOrder: true }, kasirToken)).status,
    403
  );
  assert.equal((await req('GET', '/api/users', null, kasirToken)).status, 403);

  // Admin can create a new menu item and a new staff account
  const newMenu = await req(
    'POST',
    '/api/menu',
    { name: 'Rendang Daging', category: 'makanan', price: 42000, isAvailable: true },
    adminToken
  );
  assert.equal(newMenu.status, 201);
  assert.equal(newMenu.json.item.name, 'Rendang Daging');

  const newKasir = await req(
    'POST',
    '/api/users',
    { email: 'kasir2@restoran.local', password: 'password123', displayName: 'Kasir Dua', role: 'kasir' },
    adminToken
  );
  assert.equal(newKasir.status, 201);

  const newKasirToken = await login('kasir2@restoran.local', 'password123');
  assert.ok(newKasirToken);
});

test('Order lifecycle: create (dine-in/take-away), edit, chef progress, cancel, delete & admin permission toggles', async () => {
  const { req, login } = makeApp();
  const adminToken = await login('admin@restoran.local', 'admin123');
  const kasirToken = await login('kasir@restoran.local', 'kasir123');
  const chefToken = await login('chef@restoran.local', 'chef123');

  // Dine-in requires tableNumber
  const badDineIn = await req(
    'POST',
    '/api/orders',
    {
      serviceType: 'dine_in',
      tableNumber: '',
      items: [{ name: 'Soto Ayam', category: 'makanan', qty: 1, price: 24000 }],
    },
    kasirToken
  );
  assert.equal(badDineIn.status, 400);

  // Kasir creates take_away order with food + drink
  const created = await req(
    'POST',
    '/api/orders',
    {
      customerName: 'Budi',
      serviceType: 'take_away',
      notes: 'Pedas sedang',
      items: [
        { name: 'Nasi Goreng Spesial', category: 'makanan', qty: 2, price: 28000 },
        { name: 'Es Teh Manis', category: 'minuman', qty: 2, price: 6000 },
      ],
    },
    kasirToken
  );
  assert.equal(created.status, 201);
  assert.equal(created.json.order.totalAmount, 68000);
  assert.equal(created.json.order.status, 'pending');
  const orderId = created.json.order.id;

  // Kasir edits order while pending -> sets isEdited = true and switches to dine_in
  const edited = await req(
    'PUT',
    `/api/orders/${orderId}`,
    {
      customerName: 'Budi Santoso',
      serviceType: 'dine_in',
      tableNumber: '07',
      items: [
        { name: 'Nasi Goreng Spesial', category: 'makanan', qty: 3, price: 28000 },
        { name: 'Es Jeruk Segar', category: 'minuman', qty: 1, price: 9000 },
      ],
    },
    kasirToken
  );
  assert.equal(edited.status, 200);
  assert.equal(edited.json.order.isEdited, true);
  assert.equal(edited.json.order.totalAmount, 93000);
  assert.equal(edited.json.order.tableNumber, '07');

  // By default, kasir cannot delete permanently
  const deniedDel = await req('DELETE', `/api/orders/${orderId}`, null, kasirToken);
  assert.equal(deniedDel.status, 403);

  // Chef starts cooking
  const cooking = await req(
    'PATCH',
    `/api/orders/${orderId}/status`,
    { status: 'cooking' },
    chefToken
  );
  assert.equal(cooking.status, 200);
  assert.equal(cooking.json.order.status, 'cooking');

  // By default, kasir cannot edit or cancel while cooking
  const deniedEditCook = await req(
    'PUT',
    `/api/orders/${orderId}`,
    {
      serviceType: 'dine_in',
      tableNumber: '07',
      items: [{ name: 'Nasi Goreng Spesial', category: 'makanan', qty: 1, price: 28000 }],
    },
    kasirToken
  );
  assert.equal(deniedEditCook.status, 403);

  const deniedCancelCook = await req(
    'PATCH',
    `/api/orders/${orderId}/status`,
    { status: 'cancelled', cancelReason: 'Salah input' },
    kasirToken
  );
  assert.equal(deniedCancelCook.status, 403);

  // Admin enables kasir delete + edit/cancel while cooking in Settings
  const setRes = await req(
    'PUT',
    '/api/settings',
    {
      kasirCanDeleteOrder: true,
      kasirCanEditWhileCooking: true,
      kasirCanCancelWhileCooking: true,
    },
    adminToken
  );
  assert.equal(setRes.status, 200);
  assert.equal(setRes.json.settings.kasirCanDeleteOrder, true);

  // Now Kasir CAN edit, cancel, and delete!
  const allowedCancel = await req(
    'PATCH',
    `/api/orders/${orderId}/status`,
    { status: 'cancelled', cancelReason: 'Tamu batal' },
    kasirToken
  );
  assert.equal(allowedCancel.status, 200);
  assert.equal(allowedCancel.json.order.status, 'cancelled');

  const allowedDel = await req('DELETE', `/api/orders/${orderId}`, null, kasirToken);
  assert.equal(allowedDel.status, 200);
  assert.equal(allowedDel.json.deleted, true);
});

test('Kitchen per-item workflow: single Mulai Masak then per-menu Selesai Dimasak/Dibuat updates status', async () => {
  const { req, login } = makeApp();
  const kasirToken = await login('kasir@restoran.local', 'kasir123');
  const chefToken = await login('chef@restoran.local', 'chef123');

  // Mixed food (2 items) + drink (2 items) order starts pending
  const mixed = await req(
    'POST',
    '/api/orders',
    {
      customerName: 'Sari',
      serviceType: 'dine_in',
      tableNumber: '12',
      items: [
        { name: 'Nasi Goreng Biasa', category: 'makanan', qty: 1, price: 15000 },
        { name: 'Ayam Goreng Tepung', category: 'makanan', qty: 1, price: 35000 },
        { name: 'Es Kelapa Muda', category: 'minuman', qty: 1, price: 10000 },
        { name: 'Es Kacang Merah', category: 'minuman', qty: 1, price: 25000 },
      ],
    },
    kasirToken
  );
  assert.equal(mixed.status, 201);
  assert.equal(mixed.json.order.status, 'pending');
  assert.deepEqual(
    mixed.json.order.items.map((i) => i.itemStatus),
    ['pending', 'pending', 'pending', 'pending']
  );
  const id = mixed.json.order.id;

  // Chef clicks single "Mulai Masak" -> all items become cooking
  const startCook = await req('PATCH', `/api/orders/${id}/status`, { status: 'cooking', section: 'all' }, chefToken);
  assert.equal(startCook.status, 200);
  assert.equal(startCook.json.order.status, 'cooking');
  assert.deepEqual(
    startCook.json.order.items.map((i) => i.itemStatus),
    ['cooking', 'cooking', 'cooking', 'cooking']
  );

  // Chef marks 1 food item (idx 0) & 1 drink item (idx 2) ready -> sections still cooking
  const r0 = await req('PATCH', `/api/orders/${id}/status`, { status: 'ready', itemIndex: 0 }, chefToken);
  assert.equal(r0.status, 200);
  assert.equal(r0.json.order.items[0].itemStatus, 'ready');
  assert.equal(r0.json.order.foodStatus, 'cooking');
  assert.equal(r0.json.order.status, 'cooking');

  const r2 = await req('PATCH', `/api/orders/${id}/status`, { status: 'ready', itemIndex: 2 }, chefToken);
  assert.equal(r2.status, 200);
  assert.equal(r2.json.order.drinkStatus, 'cooking');

  // Chef finishes second drink (idx 3) -> drinkStatus becomes ready while foodStatus stays cooking!
  const r3 = await req('PATCH', `/api/orders/${id}/status`, { status: 'ready', itemIndex: 3 }, chefToken);
  assert.equal(r3.status, 200);
  assert.equal(r3.json.order.drinkStatus, 'ready');
  assert.equal(r3.json.order.foodStatus, 'cooking');
  assert.equal(r3.json.order.status, 'cooking');

  // Kasir completes ready drink section while food is still cooking
  const kasirDoneDrink = await req('PATCH', `/api/orders/${id}/status`, { status: 'completed', section: 'drink' }, kasirToken);
  assert.equal(kasirDoneDrink.status, 200);
  assert.equal(kasirDoneDrink.json.order.drinkStatus, 'completed');
  assert.equal(kasirDoneDrink.json.order.status, 'cooking');

  // Chef finishes remaining food item (idx 1) -> overall order becomes ready
  const r1 = await req('PATCH', `/api/orders/${id}/status`, { status: 'ready', itemIndex: 1 }, chefToken);
  assert.equal(r1.status, 200);
  assert.equal(r1.json.order.foodStatus, 'ready');
  assert.equal(r1.json.order.status, 'ready');

  // Kasir completes overall order -> completed
  const allDone = await req('PATCH', `/api/orders/${id}/status`, { status: 'completed', section: 'all' }, kasirToken);
  assert.equal(allDone.status, 200);
  assert.equal(allDone.json.order.status, 'completed');

  // Drink-only order has foodStatus = 'none'
  const drinkOnly = await req(
    'POST',
    '/api/orders',
    {
      serviceType: 'take_away',
      items: [{ name: 'Es Jeruk Murni', category: 'minuman', qty: 1, price: 15000 }],
    },
    kasirToken
  );
  assert.equal(drinkOnly.status, 201);
  assert.equal(drinkOnly.json.order.foodStatus, 'none');
  assert.equal(drinkOnly.json.order.drinkStatus, 'pending');
});

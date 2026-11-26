// Klien terpadu Sistem Restoran: mendukung Mode Dev Lokal & Mode Firebase
// Dilengkapi Background Realtime Store, Snapshot Cache, Pre-warm Login, PWA & Fullscreen Helper

const TOKEN_STORAGE_KEY = 'restoran_auth_token';
const USER_STORAGE_KEY = 'restoran_auth_user';
const CONFIG_SESSION_KEY = 'restoran_runtime_config';
const SNAPSHOT_SESSION_KEY = 'restoran_store_snapshot_v1';
const SOUND_STORAGE_KEY = 'restoran_sound_enabled';
const FULLSCREEN_PREF_KEY = 'restoran_fullscreen_pref';
const FIREBASE_SDK_VERSION = '11.6.1';

const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('restoran_sync') : null;

let cachedConfig = null;
let firebaseCtx = null;
let isLoggingOut = false;
let sharedAudioCtx = null;

function getAudioContext() {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

if (typeof document !== 'undefined') {
  const unlockAudio = () => {
    getAudioContext();
  };
  document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { once: true, passive: true });
}

export function registerServiceWorker() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

export function isSoundEnabled() {
  try {
    const val = localStorage.getItem(SOUND_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Abaikan jika storage diblokir
  }
}

export function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

export function formatTimeShort(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

export function formatElapsed(iso) {
  if (!iso) return '0 mnt';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} dtk`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} mnt`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} j ${mins % 60} mnt`;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'className') {
      node.className = v;
    } else if (k === 'textContent') {
      node.textContent = v;
    } else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) {
        node.dataset[dk] = dv;
      }
    } else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) {
      node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  const arr = Array.isArray(children) ? children : [children];
  for (const child of arr) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

export function showToast(message, variant = 'primary') {
  let container = document.getElementById('app-toast-container');
  if (!container) {
    container = el('div', {
      id: 'app-toast-container',
      className: 'toast-container position-fixed bottom-0 end-0 p-3 app-toast-container',
    });
    document.body.appendChild(container);
  }
  const toastEl = el(
    'div',
    {
      className: `toast align-items-center text-bg-${variant} border-0`,
      role: 'alert',
      'aria-live': 'assertive',
      'aria-atomic': 'true',
    },
    [
      el('div', { className: 'd-flex' }, [
        el('div', { className: 'toast-body', textContent: message }),
        el('button', {
          type: 'button',
          className: 'btn-close btn-close-white me-2 m-auto',
          'data-bs-dismiss': 'toast',
          'aria-label': 'Tutup',
        }),
      ]),
    ]
  );
  container.appendChild(toastEl);
  if (globalThis.bootstrap?.Toast) {
    const t = new globalThis.bootstrap.Toast(toastEl, { delay: 3200 });
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    t.show();
  } else {
    setTimeout(() => toastEl.remove(), 3500);
  }
}

export function setTopProgress(active) {
  if (typeof document === 'undefined') return;
  let bar = document.getElementById('app-top-progress');
  if (!bar && active) {
    bar = el('div', { id: 'app-top-progress', className: 'app-top-progress' });
    document.body.appendChild(bar);
  }
  if (bar) {
    bar.classList.toggle('is-active', Boolean(active));
  }
}

const CHIME_PATTERNS = {
  new: [
    { freq: 587.33, delay: 0, dur: 0.18, wave: 'sine', vol: 0.16 },
    { freq: 880.0, delay: 0.14, dur: 0.26, wave: 'sine', vol: 0.18 },
  ],
  cooking: [
    { freq: 329.63, delay: 0, dur: 0.14, wave: 'triangle', vol: 0.15 },
    { freq: 392.0, delay: 0.13, dur: 0.2, wave: 'triangle', vol: 0.16 },
  ],
  ready: [
    { freq: 523.25, delay: 0, dur: 0.14, wave: 'sine', vol: 0.16 },
    { freq: 659.25, delay: 0.12, dur: 0.14, wave: 'sine', vol: 0.17 },
    { freq: 783.99, delay: 0.24, dur: 0.3, wave: 'sine', vol: 0.19 },
  ],
  completed: [
    { freq: 783.99, delay: 0, dur: 0.13, wave: 'sine', vol: 0.14 },
    { freq: 1046.5, delay: 0.12, dur: 0.24, wave: 'sine', vol: 0.15 },
  ],
  edited: [
    { freq: 698.46, delay: 0, dur: 0.11, wave: 'sine', vol: 0.14 },
    { freq: 698.46, delay: 0.13, dur: 0.16, wave: 'sine', vol: 0.15 },
  ],
  cancel: [
    { freq: 440.0, delay: 0, dur: 0.16, wave: 'triangle', vol: 0.15 },
    { freq: 329.63, delay: 0.15, dur: 0.24, wave: 'triangle', vol: 0.16 },
  ],
  welcome_in: [
    { freq: 523.25, delay: 0, dur: 0.18, wave: 'sine', vol: 0.14 },
    { freq: 659.25, delay: 0.12, dur: 0.18, wave: 'sine', vol: 0.15 },
    { freq: 783.99, delay: 0.24, dur: 0.2, wave: 'sine', vol: 0.16 },
    { freq: 1046.5, delay: 0.36, dur: 0.38, wave: 'sine', vol: 0.17 },
  ],
  welcome_out: [
    { freq: 783.99, delay: 0, dur: 0.14, wave: 'sine', vol: 0.13 },
    { freq: 1046.5, delay: 0.1, dur: 0.26, wave: 'sine', vol: 0.15 },
  ],
};

export function playChime(type = 'new') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = CHIME_PATTERNS[type] || CHIME_PATTERNS.new;
    const playNotes = () => {
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = n.wave || 'sine';
        osc.frequency.value = n.freq;
        const start = ctx.currentTime + n.delay;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(n.vol || 0.15, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + n.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + n.dur + 0.02);
      }
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(playNotes).catch(() => {});
    } else {
      playNotes();
    }
  } catch {
    // Abaikan jika autoplay diblokir
  }
}

export function createOrderNotifier(onEvent) {
  let snapshot = new Map();
  let initialized = false;

  return (orders) => {
    const list = orders || [];
    if (initialized) {
      let played = false;
      for (const o of list) {
        const prev = snapshot.get(o.id);
        let event = null;
        if (!prev) {
          event = { type: 'new', order: o, message: `Pesanan baru masuk: ${o.orderCode}`, variant: 'primary' };
        } else if (prev.status !== o.status) {
          if (o.status === 'cooking') {
            event = { type: 'cooking', order: o, message: `Pesanan ${o.orderCode} sedang dimasak.`, variant: 'info' };
          } else if (o.status === 'ready') {
            event = { type: 'ready', order: o, message: `Pesanan ${o.orderCode} SIAP SAJI!`, variant: 'success' };
          } else if (o.status === 'completed') {
            event = { type: 'completed', order: o, message: `Pesanan ${o.orderCode} selesai.`, variant: 'secondary' };
          } else if (o.status === 'cancelled') {
            event = { type: 'cancel', order: o, message: `Pesanan ${o.orderCode} dibatalkan.`, variant: 'danger' };
          }
        } else if (prev.updatedAt !== o.updatedAt && o.isEdited) {
          event = { type: 'edited', order: o, message: `Pesanan ${o.orderCode} diedit.`, variant: 'info' };
        }

        if (event) {
          if (!played && isSoundEnabled()) {
            playChime(event.type);
            played = true;
          }
          onEvent?.(event);
          break;
        }
      }
    }
    snapshot = new Map(list.map((o) => [o.id, { status: o.status, updatedAt: o.updatedAt }]));
    initialized = true;
  };
}

export function bindFullscreenEnhancement() {
  if (typeof document === 'undefined' || document.documentElement.dataset.fsBound) return;
  document.documentElement.dataset.fsBound = '1';

  const getFsEl = () =>
    document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;

  const requestFs = () => {
    const root = document.documentElement;
    if (getFsEl()) return Promise.resolve();
    try {
      if (root.requestFullscreen) return root.requestFullscreen();
      if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
        return Promise.resolve();
      }
    } catch {
      // Abaikan jika browser butuh gesture pengguna
    }
    return Promise.reject(new Error('NO_GESTURE'));
  };

  let isPageUnloading = false;
  globalThis.addEventListener('beforeunload', () => {
    isPageUnloading = true;
  });
  globalThis.addEventListener('pagehide', () => {
    isPageUnloading = true;
  });

  const syncIcons = () => {
    const isFs = Boolean(getFsEl());
    for (const btn of document.querySelectorAll('[data-lte-toggle="fullscreen"]')) {
      btn.setAttribute('aria-pressed', isFs ? 'true' : 'false');
      const maxIcon = btn.querySelector('[data-lte-icon="maximize"]');
      const minIcon = btn.querySelector('[data-lte-icon="minimize"]');
      if (maxIcon) {
        maxIcon.style.display = '';
        maxIcon.classList.toggle('d-none', isFs);
      }
      if (minIcon) {
        minIcon.style.display = '';
        minIcon.classList.toggle('d-none', !isFs);
      }
    }
  };

  // Capture phase: simpan preferensi layar penuh & fallback jika perlu
  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-lte-toggle="fullscreen"]') : null;
    if (!btn) return;
    const willEnter = !getFsEl();
    try {
      localStorage.setItem(FULLSCREEN_PREF_KEY, willEnter ? '1' : '0');
    } catch {
      // Abaikan
    }
    const root = document.documentElement;
    const supported = Boolean(
      document.fullscreenEnabled || document.webkitFullscreenEnabled || root.requestFullscreen || root.webkitRequestFullscreen
    );
    if (!supported) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showToast('Browser ini membatasi Layar Penuh otomatis. Gunakan "Tambahkan ke Layar Utama" untuk mode aplikasi penuh.', 'info');
      return;
    }
    if (!document.fullscreenEnabled && root.webkitRequestFullscreen) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (getFsEl()) {
        (document.webkitExitFullscreen || document.exitFullscreen)?.call(document);
      } else {
        root.webkitRequestFullscreen();
      }
    }
  }, true);

  const onFsChange = () => {
    syncIcons();
    if (!getFsEl() && !isPageUnloading) {
      try {
        localStorage.setItem(FULLSCREEN_PREF_KEY, '0');
      } catch {
        // Abaikan
      }
    }
  };

  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  syncIcons();

  // Jika pengguna sebelumnya mengaktifkan layar penuh (mis. di halaman login),
  // pulihkan otomatis di halaman tujuan (langsung atau pada ketukan/klik pertama)
  let wantsFs = false;
  try {
    wantsFs = localStorage.getItem(FULLSCREEN_PREF_KEY) === '1';
  } catch {
    wantsFs = false;
  }
  if (wantsFs && !getFsEl()) {
    Promise.resolve(requestFs()).catch(() => {
      const restoreOnGesture = (ev) => {
        if (ev?.target instanceof Element && ev.target.closest('[data-lte-toggle="fullscreen"]')) return;
        let stillWants = false;
        try {
          stillWants = localStorage.getItem(FULLSCREEN_PREF_KEY) === '1';
        } catch {
          stillWants = false;
        }
        if (stillWants && !getFsEl()) {
          Promise.resolve(requestFs()).catch(() => {});
        }
      };
      document.addEventListener('pointerdown', restoreOnGesture, { capture: true, once: true });
      document.addEventListener('keydown', restoreOnGesture, { capture: true, once: true });
    });
  }
}

export async function getRuntimeConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = sessionStorage.getItem(CONFIG_SESSION_KEY);
    if (raw) {
      cachedConfig = JSON.parse(raw);
      return cachedConfig;
    }
  } catch {
    // Abaikan jika sessionStorage tidak tersedia
  }
  const res = await fetch('/api/config', { cache: 'no-store' });
  cachedConfig = await res.json();
  try {
    sessionStorage.setItem(CONFIG_SESSION_KEY, JSON.stringify(cachedConfig));
  } catch {
    // Abaikan jika sessionStorage diblokir
  }
  return cachedConfig;
}

async function ensureFirebase() {
  if (firebaseCtx) return firebaseCtx;
  const cfg = await getRuntimeConfig();
  if (cfg.mode !== 'firebase' || !cfg.firebaseConfig?.apiKey) {
    return null;
  }
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
  ]);
  const app = initializeApp(cfg.firebaseConfig);
  const auth = authMod.getAuth(app);
  let db;
  try {
    if (fsMod.initializeFirestore && fsMod.persistentLocalCache && fsMod.persistentMultipleTabManager) {
      db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({
          tabManager: fsMod.persistentMultipleTabManager(),
        }),
      });
    } else {
      db = fsMod.getFirestore(app);
    }
  } catch {
    db = fsMod.getFirestore(app);
  }
  firebaseCtx = { app, auth, db, authMod, fsMod };
  return firebaseCtx;
}

export async function getAuthToken() {
  const cfg = await getRuntimeConfig();
  if (cfg.mode === 'firebase') {
    const fb = await ensureFirebase();
    const user = fb?.auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

// ============================================================================
// Persistent Background Realtime Store + Pre-warm Snapshot Cache
// ============================================================================

function loadSessionSnapshot() {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveSessionSnapshot(state) {
  try {
    sessionStorage.setItem(
      SNAPSHOT_SESSION_KEY,
      JSON.stringify({
        orders: state.orders,
        menu: state.menu,
        users: state.users,
        settings: state.settings,
        ordersReady: state.ordersReady,
        menuReady: state.menuReady,
        usersReady: state.usersReady,
        settingsReady: state.settingsReady,
        ts: Date.now(),
      })
    );
  } catch {
    // Abaikan jika kuota sessionStorage penuh
  }
}

const initialSnap = typeof sessionStorage !== 'undefined' ? loadSessionSnapshot() : null;

const sharedStore = {
  orders: Array.isArray(initialSnap?.orders) ? initialSnap.orders : [],
  menu: Array.isArray(initialSnap?.menu) ? initialSnap.menu : [],
  tables: Array.isArray(initialSnap?.tables) ? initialSnap.tables : [],
  users: Array.isArray(initialSnap?.users) ? initialSnap.users : [],
  settings: initialSnap?.settings || null,
  ordersReady: Boolean(initialSnap?.ordersReady),
  menuReady: Boolean(initialSnap?.menuReady),
  tablesReady: Boolean(initialSnap?.tablesReady),
  usersReady: Boolean(initialSnap?.usersReady),
  settingsReady: Boolean(initialSnap?.settingsReady),
  started: false,
  startedRole: null,
  unsubs: [],
  listeners: new Set(),
};

let globalOrderNotifier = null;

function emitStoreUpdate() {
  saveSessionSnapshot(sharedStore);
  const snap = getStoreSnapshot();
  for (const fn of sharedStore.listeners) {
    try {
      fn(snap);
    } catch {
      // Jangan sampai satu halaman menghambat listener lain
    }
  }
}

export function getStoreSnapshot() {
  return {
    orders: sharedStore.orders,
    menu: sharedStore.menu,
    tables: sharedStore.tables,
    users: sharedStore.users,
    settings: sharedStore.settings,
    ordersReady: sharedStore.ordersReady,
    menuReady: sharedStore.menuReady,
    tablesReady: sharedStore.tablesReady,
    usersReady: sharedStore.usersReady,
    settingsReady: sharedStore.settingsReady,
  };
}

export function subscribeStore(listener, signal = null) {
  sharedStore.listeners.add(listener);
  // Langsung kirim data yang sudah ada secara sinkron (0ms)
  listener(getStoreSnapshot());
  const unsub = () => sharedStore.listeners.delete(listener);
  if (signal) {
    signal.addEventListener('abort', unsub, { once: true });
  }
  return unsub;
}

export function stopRealtimeStore() {
  for (const fn of sharedStore.unsubs) {
    try {
      fn();
    } catch {
      // Abaikan
    }
  }
  sharedStore.unsubs = [];
  sharedStore.started = false;
  sharedStore.startedRole = null;
  globalOrderNotifier = null;
}

export async function preloadAllData(role, settingsFromMe = null) {
  if (settingsFromMe) {
    sharedStore.settings = settingsFromMe;
    sharedStore.settingsReady = true;
  }
  const cfg = await getRuntimeConfig();

  const work = (async () => {
    if (cfg.mode === 'firebase') {
      const fb = await ensureFirebase();
      if (!fb) return;
      const { collection, doc, getDoc, getDocs, orderBy, query } = fb.fsMod;
      const tasks = [
        getDocs(query(collection(fb.db, 'orders'), orderBy('createdAt', 'desc'))).then((snap) => {
          sharedStore.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          sharedStore.ordersReady = true;
        }),
        getDocs(collection(fb.db, 'menu_items')).then((snap) => {
          sharedStore.menu = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          sharedStore.menuReady = true;
        }),
        getDoc(doc(fb.db, 'settings', 'restaurant')).then((snap) => {
          if (snap.exists()) {
            sharedStore.settings = { id: snap.id, ...snap.data() };
            sharedStore.settingsReady = true;
          }
        }),
      ];
      if (role === 'admin') {
        tasks.push(
          getDocs(collection(fb.db, 'users')).then((snap) => {
            sharedStore.users = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
            sharedStore.usersReady = true;
          })
        );
      }
      await Promise.allSettled(tasks);
      emitStoreUpdate();
      return;
    }

    // Mode dev lokal
    const tasks = [
      apiFetch('/api/orders').then((res) => {
        sharedStore.orders = res.orders || [];
        sharedStore.ordersReady = true;
        if (res.settings) {
          sharedStore.settings = res.settings;
          sharedStore.settingsReady = true;
        }
      }),
      apiFetch('/api/menu').then((res) => {
        sharedStore.menu = res.items || [];
        sharedStore.menuReady = true;
      }),
      apiFetch('/api/tables').then((res) => {
        sharedStore.tables = res.tables || [];
        sharedStore.tablesReady = true;
      }),
    ];
    if (role === 'admin') {
      tasks.push(
        apiFetch('/api/users').then((res) => {
          sharedStore.users = res.users || [];
          sharedStore.usersReady = true;
        })
      );
    }
    await Promise.allSettled(tasks);
    emitStoreUpdate();
  })();

  // Timeout pengaman maks 350ms agar redirect login terasa instan
  await Promise.race([work, new Promise((r) => setTimeout(r, 350))]);
}

export function upsertOrderInStore(order) {
  if (!order?.id) return;
  const idx = sharedStore.orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) {
    sharedStore.orders[idx] = order;
  } else {
    sharedStore.orders = [order, ...sharedStore.orders];
  }
  sharedStore.ordersReady = true;
  emitStoreUpdate();
}

export function applyOptimisticOrderPatch(orderId, updaterFn) {
  const idx = sharedStore.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) {
    return { commit: (srv) => upsertOrderInStore(srv), rollback: () => {} };
  }
  const prevSnapshot = structuredClone(sharedStore.orders[idx]);
  const nextOrder = updaterFn(structuredClone(prevSnapshot));
  if (nextOrder) {
    sharedStore.orders[idx] = nextOrder;
    emitStoreUpdate();
  }
  return {
    commit: (serverOrder) => {
      if (serverOrder) upsertOrderInStore(serverOrder);
    },
    rollback: () => {
      const currIdx = sharedStore.orders.findIndex((o) => o.id === orderId);
      if (currIdx >= 0) {
        sharedStore.orders[currIdx] = prevSnapshot;
        emitStoreUpdate();
      }
    },
  };
}

export function applyOptimisticOrderDelete(orderId) {
  const idx = sharedStore.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return { rollback: () => {} };
  const removed = sharedStore.orders[idx];
  sharedStore.orders = sharedStore.orders.filter((o) => o.id !== orderId);
  emitStoreUpdate();
  return {
    rollback: () => {
      if (!sharedStore.orders.some((o) => o.id === orderId)) {
        const copy = [...sharedStore.orders];
        copy.splice(Math.min(idx, copy.length), 0, removed);
        sharedStore.orders = copy;
        emitStoreUpdate();
      }
    },
  };
}

export async function refreshLocalCollections(role = null) {
  const cfg = await getRuntimeConfig();
  if (cfg.mode === 'firebase') return;
  const tasks = [
    apiFetch('/api/menu').then((res) => {
      sharedStore.menu = res.items || [];
      sharedStore.menuReady = true;
    }),
    apiFetch('/api/tables').then((res) => {
      sharedStore.tables = res.tables || [];
      sharedStore.tablesReady = true;
    }),
  ];
  if (role === 'admin') {
    tasks.push(
      apiFetch('/api/users').then((res) => {
        sharedStore.users = res.users || [];
        sharedStore.usersReady = true;
      })
    );
  }
  await Promise.allSettled(tasks);
  emitStoreUpdate();
}

export async function startRealtimeStore(session) {
  const role = session?.user?.role;
  if (session?.settings) {
    sharedStore.settings = session.settings;
    sharedStore.settingsReady = true;
  }
  if (sharedStore.started && sharedStore.startedRole === role) {
    return;
  }
  stopRealtimeStore();
  sharedStore.started = true;
  sharedStore.startedRole = role;

  if (!globalOrderNotifier) {
    globalOrderNotifier = createOrderNotifier((ev) => {
      showToast(ev.message, ev.variant);
    });
  }

  const cfg = await getRuntimeConfig();

  if (cfg.mode === 'firebase') {
    const fb = await ensureFirebase();
    if (!fb) return;
    const { collection, doc, onSnapshot, orderBy, query } = fb.fsMod;

    // 1. Orders realtime
    sharedStore.unsubs.push(
      onSnapshot(
        query(collection(fb.db, 'orders'), orderBy('createdAt', 'desc')),
        (snap) => {
          sharedStore.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          sharedStore.ordersReady = true;
          globalOrderNotifier?.(sharedStore.orders);
          emitStoreUpdate();
        },
        () => {}
      )
    );

    // 2. Menu realtime
    sharedStore.unsubs.push(
      onSnapshot(
        collection(fb.db, 'menu_items'),
        (snap) => {
          sharedStore.menu = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          sharedStore.menuReady = true;
          emitStoreUpdate();
        },
        () => {}
      )
    );

    // 3. Settings realtime
    sharedStore.unsubs.push(
      onSnapshot(
        doc(fb.db, 'settings', 'restaurant'),
        (snap) => {
          if (snap.exists()) {
            sharedStore.settings = { id: snap.id, ...snap.data() };
            sharedStore.settingsReady = true;
            emitStoreUpdate();
          }
        },
        () => {}
      )
    );

    // 4. Tables realtime
    sharedStore.unsubs.push(
      onSnapshot(
        collection(fb.db, 'tables'),
        (snap) => {
          sharedStore.tables = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'id', { numeric: true }));
          sharedStore.tablesReady = true;
          emitStoreUpdate();
        },
        () => {}
      )
    );

    // 5. Users realtime (khusus Admin)
    if (role === 'admin') {
      sharedStore.unsubs.push(
        onSnapshot(
          collection(fb.db, 'users'),
          (snap) => {
            sharedStore.users = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
            sharedStore.usersReady = true;
            emitStoreUpdate();
          },
          () => {}
        )
      );
    }
    return;
  }

  // Mode dev lokal: BroadcastChannel + polling ringan latar belakang
  let stopped = false;
  let lastRev = -1;

  const pull = async (force = false) => {
    if (stopped || isLoggingOut) return;
    try {
      const qs = !force && lastRev >= 0 ? `?sinceRev=${lastRev}` : '';
      const res = await apiFetch(`/api/orders${qs}`);
      if (stopped || isLoggingOut || res.unchanged) return;
      lastRev = res.revision;
      sharedStore.orders = res.orders || [];
      sharedStore.ordersReady = true;
      if (res.settings) {
        sharedStore.settings = res.settings;
        sharedStore.settingsReady = true;
      }
      globalOrderNotifier?.(sharedStore.orders);
      if (force || !sharedStore.menuReady || !sharedStore.tablesReady) {
        await refreshLocalCollections(role);
      } else {
        await refreshLocalCollections(role);
      }
    } catch {
      // Abaikan error sementara saat polling latar belakang
    }
  };

  void pull(true);
  const timer = setInterval(() => void pull(false), 1500);
  const onBc = () => void pull(true);
  if (syncChannel) syncChannel.addEventListener('message', onBc);

  sharedStore.unsubs.push(() => {
    stopped = true;
    clearInterval(timer);
    if (syncChannel) syncChannel.removeEventListener('message', onBc);
  });
}

export async function loginWithEmailPassword(email, password) {
  const cfg = await getRuntimeConfig();
  if (cfg.mode === 'firebase') {
    const fb = await ensureFirebase();
    await fb.authMod.signInWithEmailAndPassword(fb.auth, email, password);
    const me = await apiFetch('/api/me');
    const normalizedUser = {
      ...me.user,
      displayName: me.user.displayName || me.user.name || me.user.email,
    };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
    await preloadAllData(normalizedUser.role, me.settings);
    return { ...me, user: normalizedUser };
  }

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Gagal masuk.');
  }
  const normalizedUser = {
    ...data.user,
    displayName: data.user.displayName || data.user.name || data.user.email,
  };
  localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
  await preloadAllData(normalizedUser.role, data.settings);
  return { ...data, user: normalizedUser };
}

export async function logout() {
  isLoggingOut = true;
  stopRealtimeStore();
  const cfg = await getRuntimeConfig();
  if (cfg.mode === 'firebase') {
    const fb = await ensureFirebase();
    if (fb) await fb.authMod.signOut(fb.auth);
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  try {
    sessionStorage.removeItem(SNAPSHOT_SESSION_KEY);
  } catch {
    // Abaikan
  }
  globalThis.location.replace('./login.html');
}

export function homePageForRole(role) {
  if (role === 'kasir') return './pesanan.html';
  if (role === 'chef') return './chef.html';
  return './index.html';
}

export async function apiFetch(path, options = {}) {
  const token = await getAuthToken();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    try {
      sessionStorage.removeItem(SNAPSHOT_SESSION_KEY);
    } catch {
      // Abaikan
    }
    const p = globalThis.location.pathname;
    if (!p.endsWith('/login.html') && !p.endsWith('/login')) {
      globalThis.location.replace('./login.html');
    }
    throw new Error(data.error || 'Sesi berakhir. Silakan masuk kembali.');
  }
  if (!res.ok) {
    throw new Error(data.error || `Permintaan gagal (${res.status}).`);
  }
  if (options.method && options.method.toUpperCase() !== 'GET' && syncChannel) {
    syncChannel.postMessage({ type: 'data_changed', path, ts: Date.now() });
  }
  return data;
}

export function notifyLocalSync() {
  if (syncChannel) {
    syncChannel.postMessage({ type: 'data_changed', ts: Date.now() });
  }
}

export async function requireAuth(allowedRoles = ['admin', 'kasir', 'chef']) {
  const cfg = await getRuntimeConfig();
  if (cfg.mode === 'firebase') {
    const fb = await ensureFirebase();
    await new Promise((resolve) => {
      const unsub = fb.authMod.onAuthStateChanged(fb.auth, () => {
        unsub();
        resolve();
      });
    });
    if (!fb.auth.currentUser) {
      localStorage.removeItem(USER_STORAGE_KEY);
      globalThis.location.replace('./login.html');
      return null;
    }
  } else if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
    localStorage.removeItem(USER_STORAGE_KEY);
    globalThis.location.replace('./login.html');
    return null;
  }

  const cachedUser = (() => {
    try {
      const u = JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || 'null');
      return u && u.role ? u : null;
    } catch {
      return null;
    }
  })();

  const syncSessionFromServer = async () => {
    const session = await apiFetch('/api/me');
    const normalizedUser = {
      ...session.user,
      displayName: session.user.displayName || session.user.name || session.user.email,
    };
    const { settings, mode } = session;
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
    if (settings) {
      sharedStore.settings = settings;
      sharedStore.settingsReady = true;
      emitStoreUpdate();
    }
    if (!allowedRoles.includes(normalizedUser.role)) {
      globalThis.location.replace(homePageForRole(normalizedUser.role));
      return null;
    }
    return { user: normalizedUser, settings, mode };
  };

  if (cachedUser) {
    if (!allowedRoles.includes(cachedUser.role)) {
      globalThis.location.replace(homePageForRole(cachedUser.role));
      return null;
    }
    document.documentElement.classList.remove('auth-pending');
    document.body.style.visibility = 'visible';
    // Validasi & segarkan sesi di latar belakang tanpa memblokir render awal
    syncSessionFromServer().catch(() => {
      localStorage.removeItem(USER_STORAGE_KEY);
      globalThis.location.replace('./login.html');
    });
    return { user: cachedUser, settings: sharedStore.settings || {}, mode: cfg.mode };
  }

  try {
    const res = await syncSessionFromServer();
    if (!res) return null;
    document.documentElement.classList.remove('auth-pending');
    document.body.style.visibility = 'visible';
    return res;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    globalThis.location.replace('./login.html');
    return null;
  }
}

export function roleLabel(role) {
  if (role === 'admin') return { text: 'Admin', badge: 'text-bg-danger' };
  if (role === 'kasir') return { text: 'Kasir', badge: 'text-bg-primary' };
  return { text: 'Chef', badge: 'text-bg-warning' };
}

export function statusLabel(status) {
  const map = {
    pending: { text: 'Menunggu', badge: 'text-bg-warning' },
    cooking: { text: 'Sedang Dimasak', badge: 'text-bg-primary' },
    ready: { text: 'Siap Disajikan', badge: 'text-bg-success' },
    completed: { text: 'Selesai', badge: 'text-bg-secondary' },
    cancelled: { text: 'Dibatalkan', badge: 'text-bg-danger' },
  };
  return map[status] || { text: status, badge: 'text-bg-secondary' };
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dasbor Restoran', shortLabel: 'Dasbor', href: './index.html', icon: 'bi-speedometer2', roles: ['admin', 'kasir'] },
  { header: 'OPERASIONAL', roles: ['admin', 'kasir'] },
  { id: 'meja', label: 'Manajemen Meja', shortLabel: 'Meja', href: './meja.html', icon: 'bi-grid-3x3-gap', roles: ['admin', 'kasir'] },
  { id: 'pesanan', label: 'Buat Pesanan', shortLabel: 'Kasir', href: './pesanan.html', icon: 'bi-receipt-cutoff', roles: ['admin', 'kasir'] },
  { id: 'daftar-pesanan', label: 'Daftar Pesanan', shortLabel: 'Daftar', href: './daftar-pesanan.html', icon: 'bi-list-check', roles: ['admin', 'kasir'] },
  { id: 'chef', label: 'Layar Chef (Dapur)', shortLabel: 'Chef', href: './chef.html', icon: 'bi-fire', roles: ['admin', 'kasir', 'chef'] },
  { id: 'pembayaran', label: 'Pembayaran & Struk', shortLabel: 'Bayar', href: './pembayaran.html', icon: 'bi-cash-coin', roles: ['admin', 'kasir'] },
  { header: 'LAPORAN & ADMIN', roles: ['admin'] },
  { id: 'laporan', label: 'Laporan Penjualan', shortLabel: 'Laporan', href: './laporan.html', icon: 'bi-bar-chart-line', roles: ['admin', 'kasir'], requiresSetting: 'kasirCanViewReport' },
  { id: 'menu', label: 'Kelola Daftar Menu', shortLabel: 'Menu', href: './menu.html', icon: 'bi-journal-richtext', roles: ['admin'] },
  { id: 'pengguna', label: 'Kelola Akun Staf', shortLabel: 'Staf', href: './pengguna.html', icon: 'bi-people-fill', roles: ['admin'] },
  { id: 'pengaturan', label: 'Pengaturan Izin Kasir', shortLabel: 'Izin', href: './pengaturan.html', icon: 'bi-sliders', roles: ['admin'] },
  { header: 'BANTUAN', roles: ['admin', 'kasir', 'chef'] },
  { id: 'panduan', label: 'Panduan Pengguna', shortLabel: 'Panduan', href: './panduan.html', icon: 'bi-book-half', roles: ['admin', 'kasir', 'chef'] },
  { id: 'developer', label: 'Developer', shortLabel: 'Dev', href: './developer.html', icon: 'bi-person-workspace', roles: ['admin', 'kasir', 'chef'] },
];

export function renderMobileBottomNav(activeId, user) {
  const nav = document.getElementById('mobile-bottom-nav');
  if (!nav || !user?.role) return;

  let items = [];
  if (user.role === 'admin') {
    items = [
      { id: 'dashboard', label: 'Dasbor', href: './index.html', icon: 'bi-speedometer2' },
      { id: 'pesanan', label: 'Kasir', href: './pesanan.html', icon: 'bi-receipt-cutoff' },
      { id: 'chef', label: 'Chef', href: './chef.html', icon: 'bi-fire' },
      { id: 'menu', label: 'Menu', href: './menu.html', icon: 'bi-journal-richtext' },
      { id: 'more', label: 'Lainnya', href: '#menu-sidebar', icon: 'bi-grid' },
    ];
  } else if (user.role === 'kasir') {
    items = [
      { id: 'meja', label: 'Meja', href: './meja.html', icon: 'bi-grid-3x3-gap' },
      { id: 'pesanan', label: 'Kasir', href: './pesanan.html', icon: 'bi-receipt-cutoff' },
      { id: 'daftar-pesanan', label: 'Daftar', href: './daftar-pesanan.html', icon: 'bi-list-check' },
      { id: 'pembayaran', label: 'Bayar', href: './pembayaran.html', icon: 'bi-cash-coin' },
      { id: 'more', label: 'Lainnya', href: '#menu-sidebar', icon: 'bi-grid' },
    ];
  } else {
    items = [
      { id: 'chef', label: 'Layar Chef', href: './chef.html', icon: 'bi-fire' },
    ];
  }

  nav.replaceChildren();
  document.body.classList.add('has-mobile-nav');

  for (const it of items) {
    if (it.id === 'more') {
      const isMoreActive = activeId === 'pengguna' || activeId === 'pengaturan';
      nav.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: `mobile-bottom-item${isMoreActive ? ' active' : ''}`,
            onClick: () => {
              document.querySelector('[data-lte-toggle="sidebar"]')?.click();
            },
          },
          [el('i', { className: `bi ${it.icon}` }), el('span', { textContent: it.label })]
        )
      );
      continue;
    }

    nav.appendChild(
      el(
        'a',
        {
          href: it.href,
          className: `mobile-bottom-item${it.id === activeId ? ' active' : ''}`,
          dataset: { navId: it.id },
        },
        [el('i', { className: `bi ${it.icon}` }), el('span', { textContent: it.label })]
      )
    );
  }
}

export function renderAppChrome(activeId, session) {
  const { user, mode } = session;
  const navEl = document.getElementById('navigation');
  if (navEl) {
    navEl.replaceChildren();
    for (const item of NAV_ITEMS) {
      if (!item.roles.includes(user.role)) continue;
      if (item.requiresSetting && user.role === 'kasir') {
        const activeSettings = session?.settings || sharedStore.settings || {};
        if (!activeSettings[item.requiresSetting]) continue;
      }
      if (item.header) {
        navEl.appendChild(el('li', { className: 'nav-header', textContent: item.header }));
        continue;
      }
      const isActive = item.id === activeId;
      const link = el(
        'a',
        {
          href: item.soon ? '#' : item.href,
          className: `nav-link${isActive ? ' active' : ''}${item.soon ? ' opacity-75' : ''}`,
          onClick: item.soon
            ? (e) => {
                e.preventDefault();
                showToast(`Modul "${item.label}" akan diaktifkan pada fase berikutnya.`, 'info');
              }
            : undefined,
        },
        [
          el('i', { className: `nav-icon bi ${item.icon}` }),
          el('p', {}, [
            item.label,
            item.soon ? el('span', { className: 'nav-badge badge text-bg-secondary', textContent: 'Segera' }) : null,
          ]),
        ]
      );
      navEl.appendChild(el('li', { className: 'nav-item' }, [link]));
    }
  }

  renderMobileBottomNav(activeId, user);

  const brandLink = document.querySelector('.sidebar-brand .brand-link');
  if (brandLink) {
    brandLink.setAttribute('href', homePageForRole(user.role));
  }

  const userNameEl = document.getElementById('nav-user-name');
  const userRoleEl = document.getElementById('nav-user-role');
  const rMeta = roleLabel(user.role);

  if (userNameEl) userNameEl.textContent = user.displayName || user.name || user.email;
  if (userRoleEl) {
    userRoleEl.textContent = rMeta.text;
    userRoleEl.className = `badge ${rMeta.badge}`;
  }

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  const soundToggle = document.getElementById('sound-toggle');
  if (soundToggle) {
    soundToggle.checked = isSoundEnabled();
    if (!soundToggle.dataset.bound) {
      soundToggle.dataset.bound = '1';
      soundToggle.addEventListener('change', () => {
        setSoundEnabled(soundToggle.checked);
        if (soundToggle.checked) {
          playChime('new');
          showToast('Notifikasi suara diaktifkan.', 'info');
        } else {
          showToast('Notifikasi suara dimatikan.', 'secondary');
        }
      });
    }
  }

  bindFullscreenEnhancement();
}

function activeIdFromPath() {
  const path = globalThis.location?.pathname || '';
  if (path.endsWith('/pesanan.html') || path.endsWith('/pesanan')) return 'pesanan';
  if (path.endsWith('/daftar-pesanan.html') || path.endsWith('/daftar-pesanan')) return 'daftar-pesanan';
  if (path.endsWith('/meja.html') || path.endsWith('/meja')) return 'meja';
  if (path.endsWith('/pembayaran.html') || path.endsWith('/pembayaran')) return 'pembayaran';
  if (path.endsWith('/laporan.html') || path.endsWith('/laporan')) return 'laporan';
  if (path.endsWith('/panduan.html') || path.endsWith('/panduan')) return 'panduan';
  if (path.endsWith('/developer.html') || path.endsWith('/developer')) return 'developer';
  if (path.endsWith('/chef.html') || path.endsWith('/chef')) return 'chef';
  if (path.endsWith('/menu.html') || path.endsWith('/menu')) return 'menu';
  if (path.endsWith('/pengguna.html') || path.endsWith('/pengguna')) return 'pengguna';
  if (path.endsWith('/pengaturan.html') || path.endsWith('/pengaturan')) return 'pengaturan';
  return 'dashboard';
}

function hydrateChromeFromCache() {
  if (typeof document === 'undefined') return;
  const p = globalThis.location?.pathname || '';
  if (p.endsWith('/login.html') || p.endsWith('/login')) {
    bindFullscreenEnhancement();
    return;
  }
  try {
    const rawUser = localStorage.getItem(USER_STORAGE_KEY);
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    if (!user || !user.role) return;
    let mode = 'firebase';
    try {
      const rawCfg = sessionStorage.getItem(CONFIG_SESSION_KEY);
      if (rawCfg) mode = JSON.parse(rawCfg)?.mode || mode;
    } catch {
      // Abaikan
    }
    renderAppChrome(activeIdFromPath(), { user, mode });
  } catch {
    // Abaikan cache rusak
  }
}

if (typeof document !== 'undefined') {
  registerServiceWorker();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateChromeFromCache, { once: true });
  } else {
    hydrateChromeFromCache();
  }
}

// Kompatibilitas mundur: gunakan shared realtime store
export async function subscribeOrdersAndSettings(onData, _onError, signal = null) {
  return subscribeStore(
    (snap) => {
      onData({ orders: snap.orders || [], settings: snap.settings || null });
    },
    signal
  );
}

// Pembantu CardWidget AdminLTE 4 (data-lte-toggle="card-collapse") dengan simpan preferensi
export function initCollapsibleCard(cardId, storageKey, defaultCollapsed = false, signal = null) {
  const card = document.getElementById(cardId);
  if (!card) return null;

  let savedCollapse = null;
  try {
    savedCollapse = localStorage.getItem(storageKey);
  } catch {
    // Abaikan jika storage diblokir
  }
  const shouldCollapse = savedCollapse !== null ? savedCollapse === '1' : Boolean(defaultCollapsed);
  card.classList.toggle('collapsed-card', shouldCollapse);
  const bodyEl = card.querySelector(':scope > .card-body');
  if (bodyEl) bodyEl.style.display = shouldCollapse ? 'none' : '';

  card.addEventListener(
    'collapsed.lte.card-widget',
    () => {
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        // Abaikan
      }
    },
    { signal }
  );
  card.addEventListener(
    'expanded.lte.card-widget',
    () => {
      try {
        localStorage.setItem(storageKey, '0');
      } catch {
        // Abaikan
      }
    },
    { signal }
  );
  return card;
}

// Pembantu panel Bootstrap Collapse datar (tanpa .card bersarang)
export function initCollapsiblePanel(collapseId, toggleBtnId, chevronId, storageKey, defaultCollapsed = true, signal = null) {
  const collapseEl = document.getElementById(collapseId);
  const toggleBtn = document.getElementById(toggleBtnId);
  const chevronEl = document.getElementById(chevronId);
  if (!collapseEl) return null;

  let saved = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    // Abaikan
  }
  const isCollapsed = saved !== null ? saved === '1' : Boolean(defaultCollapsed);
  collapseEl.classList.toggle('show', !isCollapsed);
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  if (chevronEl) chevronEl.className = isCollapsed ? 'bi bi-plus-lg' : 'bi bi-dash-lg';

  collapseEl.addEventListener(
    'shown.bs.collapse',
    () => {
      if (chevronEl) chevronEl.className = 'bi bi-dash-lg';
      try {
        localStorage.setItem(storageKey, '0');
      } catch {}
    },
    { signal }
  );
  collapseEl.addEventListener(
    'hidden.bs.collapse',
    () => {
      if (chevronEl) chevronEl.className = 'bi bi-plus-lg';
      try {
        localStorage.setItem(storageKey, '1');
      } catch {}
    },
    { signal }
  );
  return collapseEl;
}

// Pembantu paginasi Bootstrap 5 / AdminLTE 4 (tampil otomatis bila totalItems > pageSize)
export function renderPagination({
  footerEl,
  listEl,
  infoEl,
  totalItems,
  pageSize = 10,
  currentPage = 1,
  onPageChange,
  unitLabel = 'menu',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  if (!footerEl || !listEl) {
    return { page: safePage, totalPages, startIndex, endIndex };
  }

  if (totalItems <= pageSize) {
    footerEl.classList.add('d-none');
    listEl.replaceChildren();
    if (infoEl) infoEl.textContent = '';
    return { page: 1, totalPages: 1, startIndex: 0, endIndex: totalItems };
  }

  footerEl.classList.remove('d-none');
  if (infoEl) {
    infoEl.textContent = `Menampilkan ${startIndex + 1}–${endIndex} dari ${totalItems} ${unitLabel}`;
  }

  listEl.replaceChildren();

  const makePageItem = (label, targetPage, { disabled = false, active = false, ariaLabel = '' } = {}) => {
    const li = el('li', { className: `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}` });
    const btn = el(
      'button',
      {
        type: 'button',
        className: 'page-link',
        textContent: label,
        disabled,
        'aria-label': ariaLabel || `Halaman ${targetPage}`,
        onClick: () => {
          if (!disabled && targetPage !== safePage) onPageChange?.(targetPage);
        },
      }
    );
    li.appendChild(btn);
    return li;
  };

  listEl.appendChild(makePageItem('«', safePage - 1, { disabled: safePage <= 1, ariaLabel: 'Sebelumnya' }));
  for (let p = 1; p <= totalPages; p += 1) {
    listEl.appendChild(makePageItem(String(p), p, { active: p === safePage }));
  }
  listEl.appendChild(makePageItem('»', safePage + 1, { disabled: safePage >= totalPages, ariaLabel: 'Berikutnya' }));

  return { page: safePage, totalPages, startIndex, endIndex };
}

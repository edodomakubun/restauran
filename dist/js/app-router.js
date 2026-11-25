// App-Shell SPA Router: perpindahan halaman instan (< 5ms dari prefetch cache)
// tanpa full-page reload, menjaga koneksi realtime Firestore & AudioContext tetap hidup.

import {
  getStoreSnapshot,
  homePageForRole,
  renderAppChrome,
  requireAuth,
  setTopProgress,
  showToast,
  startRealtimeStore,
  subscribeStore,
} from './app-client.js';

const PAGE_LOADERS = {
  dashboard: () => import('./pages/dashboard.js'),
  pesanan: () => import('./pages/pesanan.js'),
  chef: () => import('./pages/chef.js'),
  menu: () => import('./pages/menu.js'),
  pengguna: () => import('./pages/pengguna.js'),
  pengaturan: () => import('./pages/pengaturan.js'),
};

const ROUTE_META = {
  'index.html': { id: 'dashboard', roles: ['admin', 'kasir'], href: './index.html' },
  '': { id: 'dashboard', roles: ['admin', 'kasir'], href: './index.html' },
  'pesanan.html': { id: 'pesanan', roles: ['admin', 'kasir'], href: './pesanan.html' },
  'chef.html': { id: 'chef', roles: ['admin', 'kasir', 'chef'], href: './chef.html' },
  'menu.html': { id: 'menu', roles: ['admin'], href: './menu.html' },
  'pengguna.html': { id: 'pengguna', roles: ['admin'], href: './pengguna.html' },
  'pengaturan.html': { id: 'pengaturan', roles: ['admin'], href: './pengaturan.html' },
};

const fragmentCache = new Map();
let activeSession = null;
let currentPageId = null;
let currentController = null;
let currentCleanup = null;
let isNavigating = false;

function resolveRoute(hrefOrUrl) {
  try {
    const u = new URL(hrefOrUrl, globalThis.location.href);
    if (u.origin !== globalThis.location.origin) return null;
    const filename = u.pathname.split('/').pop() || '';
    const meta = ROUTE_META[filename];
    if (!meta) return null;
    return { ...meta, url: u.pathname + u.search + u.hash, pathname: u.pathname };
  } catch {
    return null;
  }
}

async function fetchPageFragment(href) {
  const key = resolveRoute(href)?.pathname || href;
  if (fragmentCache.has(key)) {
    return fragmentCache.get(key);
  }
  const res = await fetch(href, { cache: 'default' });
  if (!res.ok) throw new Error(`Gagal memuat halaman (${res.status}).`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const mainEl = doc.querySelector('main.app-main');
  const modalsEl = doc.getElementById('app-page-modals');
  const footerEl = doc.querySelector('footer.app-footer');
  if (!mainEl) throw new Error('Struktur halaman tidak valid.');

  const frag = {
    title: doc.title || document.title,
    mainHtml: mainEl.innerHTML,
    modalsHtml: modalsEl ? modalsEl.innerHTML : '',
    footerHtml: footerEl ? footerEl.innerHTML : '',
  };
  fragmentCache.set(key, frag);
  return frag;
}

function cacheCurrentDocument(pageId) {
  const mainEl = document.querySelector('main.app-main');
  const modalsEl = document.getElementById('app-page-modals');
  const footerEl = document.querySelector('footer.app-footer');
  if (!mainEl) return;
  fragmentCache.set(globalThis.location.pathname, {
    title: document.title,
    mainHtml: mainEl.innerHTML,
    modalsHtml: modalsEl ? modalsEl.innerHTML : '',
    footerHtml: footerEl ? footerEl.innerHTML : '',
    pageId,
  });
}

function prefetchAllowedPages(role) {
  const run = () => {
    const uniqueHrefs = new Set();
    for (const meta of Object.values(ROUTE_META)) {
      if (meta.roles.includes(role)) uniqueHrefs.add(meta.href);
    }
    for (const href of uniqueHrefs) {
      fetchPageFragment(href).catch(() => {});
      const meta = resolveRoute(href);
      if (meta && PAGE_LOADERS[meta.id]) {
        PAGE_LOADERS[meta.id]().catch(() => {});
      }
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 250);
  }
}

function closeOpenModalsAndMobileSidebar() {
  for (const modalEl of document.querySelectorAll('.modal.show')) {
    const inst = globalThis.bootstrap?.Modal?.getInstance(modalEl);
    inst?.hide();
  }
  for (const backdrop of document.querySelectorAll('.modal-backdrop')) {
    backdrop.remove();
  }
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');

  // Tutup sidebar drawer di layar mobile/tablet bila sedang terbuka
  if (globalThis.innerWidth < 992 && document.body.classList.contains('sidebar-open')) {
    document.querySelector('[data-lte-toggle="sidebar"]')?.click();
  }
}

function teardownCurrentPage() {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch {
      // Abaikan error pembersihan
    }
    currentCleanup = null;
  }
}

async function mountPageModule(pageId) {
  teardownCurrentPage();
  currentPageId = pageId;
  currentController = new AbortController();

  const mod = await PAGE_LOADERS[pageId]();
  const ctx = {
    session: activeSession,
    signal: currentController.signal,
    navigate: navigateTo,
    getSnapshot: getStoreSnapshot,
    subscribeStore: (fn) => subscribeStore(fn, currentController.signal),
  };
  const cleanup = await mod.mount(ctx);
  if (typeof cleanup === 'function') {
    currentCleanup = cleanup;
  }
}

export async function navigateTo(href, { pushState = true } = {}) {
  const target = resolveRoute(href);
  if (!target) {
    globalThis.location.href = href;
    return;
  }
  if (!activeSession) {
    globalThis.location.href = target.href;
    return;
  }
  if (!target.roles.includes(activeSession.user.role)) {
    showToast('Anda tidak memiliki izin membuka halaman tersebut.', 'warning');
    const fallback = homePageForRole(activeSession.user.role);
    if (fallback !== target.href) return navigateTo(fallback, { pushState: true });
    return;
  }

  if (target.pathname === globalThis.location.pathname && currentPageId === target.id && pushState) {
    closeOpenModalsAndMobileSidebar();
    return;
  }
  if (isNavigating) return;
  isNavigating = true;

  let progressTimer = setTimeout(() => setTopProgress(true), 120);
  try {
    const frag = await fetchPageFragment(target.href);
    closeOpenModalsAndMobileSidebar();
    teardownCurrentPage();

    if (pushState && target.url !== globalThis.location.pathname + globalThis.location.search) {
      history.pushState({ pageId: target.id }, '', target.href);
    }

    document.title = frag.title;
    renderAppChrome(target.id, activeSession);

    const mainEl = document.querySelector('main.app-main');
    if (mainEl) {
      mainEl.classList.remove('app-view-enter');
      mainEl.innerHTML = frag.mainHtml;
      void mainEl.offsetWidth;
      mainEl.classList.add('app-view-enter');
    }

    let modalsEl = document.getElementById('app-page-modals');
    if (!modalsEl) {
      modalsEl = document.createElement('div');
      modalsEl.id = 'app-page-modals';
      document.body.appendChild(modalsEl);
    }
    modalsEl.innerHTML = frag.modalsHtml || '';

    const footerEl = document.querySelector('footer.app-footer');
    if (footerEl && frag.footerHtml) {
      footerEl.innerHTML = frag.footerHtml;
    }

    await mountPageModule(target.id);
    globalThis.scrollTo({ top: 0, behavior: 'instant' });
  } catch {
    globalThis.location.href = target.href;
  } finally {
    clearTimeout(progressTimer);
    setTopProgress(false);
    isNavigating = false;
  }
}

function bindGlobalRouterEvents() {
  if (document.documentElement.dataset.routerBound) return;
  document.documentElement.dataset.routerBound = '1';

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || anchor.hasAttribute('download') || anchor.target === '_blank') return;

    const target = resolveRoute(anchor.href);
    if (!target) return;
    e.preventDefault();
    void navigateTo(anchor.href, { pushState: true });
  });

  globalThis.addEventListener('popstate', () => {
    void navigateTo(globalThis.location.href, { pushState: false });
  });
}

export async function initAppShell({ pageId, allowedRoles }) {
  cacheCurrentDocument(pageId);

  const session = await requireAuth(allowedRoles);
  if (!session) return;
  activeSession = session;

  renderAppChrome(pageId, session);
  bindGlobalRouterEvents();

  // Jalankan 4 listener realtime di latar belakang secara non-blocking
  void startRealtimeStore(session);

  // Pasang halaman aktif saat ini langsung (instan dari cache snapshot bila ada)
  await mountPageModule(pageId);

  // Prefetch semua halaman lain yang diizinkan di latar belakang
  prefetchAllowedPages(session.user.role);
}

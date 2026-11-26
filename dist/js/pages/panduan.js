// Modul halaman Panduan Pengguna (panduan.html - Admin, Kasir, Chef)
import { roleLabel } from '../app-client.js';

export function mount(ctx) {
  const { session } = ctx;
  const role = session?.user?.role || 'kasir';
  const rl = roleLabel(role);
  const badgeEl = document.getElementById('guide-role-badge');
  if (badgeEl) {
    badgeEl.textContent = `Peran Anda: ${rl.text}`;
    badgeEl.className = `badge ${rl.badge}`;
  }
}

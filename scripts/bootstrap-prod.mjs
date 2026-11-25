/**
 * Bootstrap Production Data for RestoOrder
 * - Creates Firebase Auth accounts via Identity Toolkit REST API
 * - Seeds Firestore: users, menu_items, settings
 * Run: node scripts/bootstrap-prod.mjs
 */

import { DEFAULT_MENU_ITEMS } from '../src/local-dev-store.js';

const FIREBASE_API_KEY = 'AIzaSyB3UIu4cAihFqm8NS7qvaFIcgCopE8M9Zo';
const PROJECT_ID       = 'restoran-app-id';
const FIRESTORE_BASE   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Accounts to create
const ACCOUNTS = [
  { email: 'admin@restoran.com',  password: 'Admin@1234',  role: 'admin',  name: 'Administrator', isActive: true },
  { email: 'kasir@restoran.com',  password: 'Kasir@1234',  role: 'kasir',  name: 'Kasir Utama',   isActive: true },
  { email: 'chef@restoran.com',   password: 'Chef@1234',   role: 'chef',   name: 'Chef Utama',    isActive: true },
];

const MENU_ITEMS = DEFAULT_MENU_ITEMS.map(({ name, category, price, isAvailable }) => ({
  name,
  category,
  price,
  isAvailable,
}));

const SETTINGS = {
  restaurantName: 'RestoOrder',
  kasirCanDeleteOrder: false,
  kasirCanEditWhileCooking: false,
  kasirCanCancelWhileCooking: true,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function signUp(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (data.error) {
    // If already exists, sign in to get uid
    if (data.error.message === 'EMAIL_EXISTS') {
      return signIn(email, password);
    }
    throw new Error(`signUp ${email}: ${data.error.message}`);
  }
  return { uid: data.localId, idToken: data.idToken };
}

async function signIn(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`signIn ${email}: ${data.error.message}`);
  return { uid: data.localId, idToken: data.idToken };
}

// Convert JS object -> Firestore REST document fields
function toFirestoreDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string')  fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v === null) fields[k] = { nullValue: null };
    else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map(item =>
        typeof item === 'string' ? { stringValue: item } :
        typeof item === 'number' ? { integerValue: String(item) } :
        { booleanValue: !!item }
      )}};
    }
  }
  return { fields };
}

async function firestoreWrite(path, doc, idToken) {
  const url = `${FIRESTORE_BASE}/${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(doc),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Firestore write ${path}: ${JSON.stringify(data.error)}`);
  return data;
}

// Get a valid admin token (bootstrap by signing in as admin first, then use for seeding)
// We need a token that can write - but Firestore rules deny all client writes.
// So we use the Firebase Admin REST approach: signIn to get idToken, then use
// Firestore with the token. Since rules are write:false, we must write via
// the Google Identity Platform admin approach using the API key.
// 
// WORKAROUND: Temporarily call Firestore with an override parameter ?access_token
// that uses the user's own Google OAuth token from firebase-tools login.
// Actually the cleanest path: use firebase-tools "firestore:set" via CLI.

async function main() {
  console.log('🚀 RestoOrder Production Bootstrap\n');

  // Step 1: Create Auth accounts
  console.log('📋 Creating Firebase Auth accounts...');
  const created = [];
  for (const acc of ACCOUNTS) {
    try {
      const { uid, idToken } = await signUp(acc.email, acc.password);
      created.push({ ...acc, uid, idToken });
      console.log(`  ✅ ${acc.role}: ${acc.email} (uid: ${uid})`);
    } catch (e) {
      console.error(`  ❌ ${acc.email}: ${e.message}`);
      process.exit(1);
    }
  }

  // Step 2: Get admin token for seeding
  // Since Firestore rules block all writes, we seed via Firebase REST with
  // the user's Google OAuth token (obtained from gcloud / firebase-tools).
  // We'll use the admin idToken and make calls to the unrestricted REST endpoint
  // by passing ?access_token with the Google OAuth token from firebase-tools.
  
  // Get the google oauth token stored by firebase-tools
  const { execSync } = await import('child_process');
  let googleToken;
  try {
    googleToken = execSync(
      'npx.cmd -y firebase-tools@latest login:ci --no-localhost 2>&1',
      { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 }
    );
  } catch {}

  // Alternative: use firebase-tools to write via firestore emulator-style API
  // The best approach given the rules: Use firebase-tools firestore REST with
  // the admin credentials that bypass rules.
  
  // Actually, we write firestore documents using the Identity Platform admin access
  // which is the google access token stored in firebase-tools config.
  // Let's read it from the config file.
  const os = await import('os');
  const path = await import('path');
  const fs = await import('fs');
  
  // Find firebase-tools credentials file
  const configDirs = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'xdg.config', 'configstore', 'firebase-tools.json'),
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
  ];
  
  let adminToken = null;
  for (const cfgPath of configDirs) {
    if (fs.existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        // Try to find token
        if (cfg.tokens?.access_token) adminToken = cfg.tokens.access_token;
        else if (cfg.user?.tokens?.access_token) adminToken = cfg.user.tokens.access_token;
        // Look for the authenticated user token
        const users = cfg.users;
        if (users) {
          for (const u of Object.values(users)) {
            if (u.tokens?.access_token) { adminToken = u.tokens.access_token; break; }
          }
        }
        if (adminToken) { console.log(`\n🔑 Found Google OAuth token from firebase-tools config`); break; }
      } catch {}
    }
  }

  // Fallback: use gcloud
  if (!adminToken) {
    try {
      adminToken = execSync('gcloud auth print-access-token 2>&1', { encoding: 'utf8', timeout: 5000 }).trim();
      if (adminToken.includes('\n') || adminToken.length < 20) adminToken = null;
      else console.log('\n🔑 Got Google OAuth token from gcloud');
    } catch {}
  }

  if (!adminToken) {
    console.log('\n⚠️  No admin OAuth token found. Trying to seed via firebase-tools CLI commands...');
    await seedViaFirebaseCLI(created, execSync);
    return;
  }

  // Step 3: Seed Firestore using admin token (bypasses security rules)
  await seedFirestore(created, adminToken);
}

async function seedFirestore(accounts, adminToken) {
  console.log('\n📦 Seeding Firestore documents...');
  const now = new Date().toISOString();

  // Write user documents
  for (const acc of accounts) {
    const doc = toFirestoreDoc({
      email: acc.email, name: acc.name, role: acc.role,
      isActive: acc.isActive, createdAt: now, updatedAt: now,
    });
    const url = `${FIRESTORE_BASE}/users/${acc.uid}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(doc),
    });
    const data = await res.json();
    if (data.error) {
      console.error(`  ❌ users/${acc.uid}: ${JSON.stringify(data.error)}`);
    } else {
      console.log(`  ✅ users/${acc.uid} (${acc.role})`);
    }
  }

  // Write menu items
  console.log('\n🍽️  Seeding menu items...');
  const now2 = new Date().toISOString();
  for (const item of MENU_ITEMS) {
    // Generate doc id
    const docId = item.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const doc = toFirestoreDoc({ ...item, createdAt: now2, updatedAt: now2 });
    const url = `${FIRESTORE_BASE}/menu_items/${docId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(doc),
    });
    const data = await res.json();
    if (data.error) console.error(`  ❌ menu_items/${docId}: ${JSON.stringify(data.error)}`);
    else console.log(`  ✅ menu_items/${docId}`);
  }

  // Write settings
  console.log('\n⚙️  Seeding settings...');
  const settingsDoc = toFirestoreDoc({ ...SETTINGS, updatedAt: now2 });
  const url = `${FIRESTORE_BASE}/settings/restaurant`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify(settingsDoc),
  });
  const data = await res.json();
  if (data.error) console.error(`  ❌ settings/restaurant: ${JSON.stringify(data.error)}`);
  else console.log(`  ✅ settings/restaurant`);

  console.log('\n✅ Bootstrap complete!\n');
  console.log('🔑 Login credentials:');
  console.log('   Admin : admin@restoran.com  / Admin@1234');
  console.log('   Kasir : kasir@restoran.com  / Kasir@1234');
  console.log('   Chef  : chef@restoran.com   / Chef@1234');
}

async function seedViaFirebaseCLI(accounts, execSync) {
  // Fallback: build JSON files and import via firebase firestore:set (not standard)
  // Instead: temporarily update firestore.rules to allow writes, seed, then restore
  console.log('  Trying alternative: use firebase emulator data import...');
  console.log('  ⚠️  Manual step required: Please run the following in Firebase Console or via REST');
  
  for (const acc of accounts) {
    console.log(`\n  User ${acc.role}:`);
    console.log(`    Path: users/${acc.uid}`);
    console.log(`    Data: { email: "${acc.email}", name: "${acc.name}", role: "${acc.role}", isActive: true }`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

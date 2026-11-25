// Client REST ringan untuk Firebase Firestore & Identity Toolkit.
// Mendukung dua mode otorisasi:
// 1. Service Account JWT (jika FIREBASE_CLIENT_EMAIL & FIREBASE_PRIVATE_KEY diset)
// 2. Keyless User ID Token + Web API Key (jika org policy membatasi pembuatan Service Account Key)
import { uint8ArrayToBase64Url } from './auth-verify.js';

function pemToArrayBuffer(pem) {
  const normalized = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(normalized);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

export function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number.parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((v) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

export function docToObject(doc) {
  if (!doc || !doc.name) return null;
  const id = doc.name.split('/').pop();
  const obj = { id };
  for (const [k, v] of Object.entries(doc.fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

export class FirebaseAdminRest {
  constructor(env, fetchImpl = null, userBearerToken = null) {
    this.projectId = env.FIREBASE_PROJECT_ID;
    this.webApiKey = env.FIREBASE_WEB_API_KEY || '';
    this.clientEmail = env.FIREBASE_CLIENT_EMAIL || '';
    this.privateKey = env.FIREBASE_PRIVATE_KEY || '';
    this.userBearerToken = userBearerToken;
    // Bind fetch to globalThis to avoid "Illegal invocation" in Cloudflare Workers
    this.fetch = fetchImpl ? fetchImpl.bind(globalThis) : globalThis.fetch.bind(globalThis);
  }

  get hasServiceAccount() {
    return Boolean(this.clientEmail && this.privateKey);
  }

  async getAccessToken() {
    if (!this.hasServiceAccount) {
      if (!this.userBearerToken) {
        throw new Error('Token pengguna Firebase tidak tersedia.');
      }
      return this.userBearerToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const enc = new TextEncoder();
    const headerB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claimB64 = uint8ArrayToBase64Url(
      enc.encode(
        JSON.stringify({
          iss: this.clientEmail,
          scope:
            'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
          aud: 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
        })
      )
    );
    const signingInput = `${headerB64}.${claimB64}`;
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(this.privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
    const assertion = `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(sig))}`;

    const res = await this.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`Gagal memperoleh Google OAuth token (${res.status}).`);
    }
    const data = await res.json();
    return data.access_token;
  }

  get baseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  async request(url, options = {}) {
    const token = await this.getAccessToken();
    const res = await this.fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Firestore REST error ${res.status}: ${txt}`);
    }
    return res.status === 204 ? {} : res.json();
  }

  async getDocument(collection, docId) {
    const doc = await this.request(`${this.baseUrl}/${collection}/${encodeURIComponent(docId)}`);
    return docToObject(doc);
  }

  async listDocuments(collection, pageSize = 200) {
    const data = await this.request(`${this.baseUrl}/${collection}?pageSize=${pageSize}`);
    if (!data || !Array.isArray(data.documents)) return [];
    return data.documents.map(docToObject);
  }

  async setDocument(collection, docId, payload) {
    const fields = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    const doc = await this.request(`${this.baseUrl}/${collection}/${encodeURIComponent(docId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
    return docToObject(doc);
  }

  async createDocument(collection, payload, docId = null) {
    const fields = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    const qs = docId ? `?documentId=${encodeURIComponent(docId)}` : '';
    const doc = await this.request(`${this.baseUrl}/${collection}${qs}`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
    return docToObject(doc);
  }

  async deleteDocument(collection, docId) {
    await this.request(`${this.baseUrl}/${collection}/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    });
  }

  async createAuthUser({ email, password, displayName }) {
    if (this.hasServiceAccount) {
      const url = `https://identitytoolkit.googleapis.com/v1/projects/${this.projectId}/accounts`;
      return this.request(url, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          displayName,
          emailVerified: true,
          disabled: false,
        }),
      });
    }

    if (!this.webApiKey) {
      throw new Error('FIREBASE_WEB_API_KEY belum diset untuk membuat akun baru.');
    }
    // Gunakan Identity Toolkit SignUp publik (tidak memerlukan Service Account key)
    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(this.webApiKey)}`;
    const res = await this.fetch(signUpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || 'Gagal mendaftarkan akun di Firebase Auth.';
      throw new Error(msg === 'EMAIL_EXISTS' ? 'Email sudah terdaftar di Firebase Auth.' : msg);
    }
    if (displayName && data.idToken) {
      await this.fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(this.webApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: data.idToken, displayName, returnSecureToken: false }),
        }
      );
    }
    return data;
  }

  async updateAuthUser(uid, updates) {
    if (!this.hasServiceAccount) {
      // Di mode keyless, perubahan role/displayName/isActive langsung tersimpan & ditegakkan via Firestore users/{uid}.
      return { localId: uid };
    }
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${this.projectId}/accounts:update`;
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify({
        localId: uid,
        ...updates,
      }),
    });
  }
}

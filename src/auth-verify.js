// Verifikasi token autentikasi untuk mode Firebase (RS256 JWK) dan mode Dev Lokal (HMAC-SHA256)

const GOOGLE_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function base64UrlToUint8Array(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Format token tidak valid.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64)));
  return {
    header,
    payload,
    signingInput: `${headerB64}.${payloadB64}`,
    signature: base64UrlToUint8Array(sigB64),
  };
}

export async function signLocalJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  return `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(sig))}`;
}

export async function verifyLocalJwt(token, secret) {
  const { header, payload, signingInput, signature } = decodeJwt(token);
  if (header.alg !== 'HS256') {
    throw new Error('Algoritma token tidak didukung.');
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify('HMAC', key, signature, enc.encode(signingInput));
  if (!ok) {
    throw new Error('Tanda tangan token tidak valid.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('Sesi telah berakhir. Silakan masuk kembali.');
  }
  return payload;
}

async function fetchGoogleJwks(fetchImpl = fetch) {
  const res = await fetchImpl(GOOGLE_JWK_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) {
    throw new Error(`Gagal mengambil Google JWK (${res.status}).`);
  }
  const data = await res.json();
  return Array.isArray(data.keys) ? data.keys : [];
}

export async function verifyFirebaseIdToken(token, projectId, fetchImpl = fetch) {
  const { header, payload, signingInput, signature } = decodeJwt(token);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Header Firebase ID Token tidak valid.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error('Audience token tidak cocok dengan FIREBASE_PROJECT_ID.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Issuer token tidak valid.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('UID pengguna pada token kosong.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('Firebase ID Token telah kedaluwarsa.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) {
    throw new Error('Waktu terbit token tidak valid.');
  }

  const keys = await fetchGoogleJwks(fetchImpl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Kunci publik Google (kid) tidak ditemukan.');
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    new TextEncoder().encode(signingInput)
  );
  if (!ok) {
    throw new Error('Tanda tangan Firebase ID Token tidak valid.');
  }
  return payload;
}

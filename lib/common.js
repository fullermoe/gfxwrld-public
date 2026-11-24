// Shared helpers for every archive source.
export const UA = 'GFXWRLD-Public-Archive/0.8 (+https://gfxwrld.com)';
const TIMEOUT_MS = 8000;

export async function getJson(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

export const first = (v) => (Array.isArray(v) ? v[0] : v) || '';

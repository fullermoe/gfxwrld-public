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

// Does the text mention every word of the search, as a whole word? Plurals
// count either way ("rose" finds "roses"), but word stems do not: "boxing"
// must not find "box".
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function mentions(text, q) {
  const hay = String(text || '').toLowerCase();
  const words = String(q || '').toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return true;
  return words.every((w) => {
    const bases = [w, w.replace(/s$/, ''), w.replace(/es$/, '')];
    const forms = [...new Set(bases.flatMap((b) => [b, b + 's', b + 'es']))].filter((f) => f.length >= 3).map(escapeRe);
    return new RegExp('\\b(' + forms.join('|') + ')\\b').test(hay);
  });
}

// Sort a museum's own label into a plain group. Mirrors the groups the page
// uses for its Type filter.
export function artKind(type) {
  const t = String(type || '').toLowerCase();
  if (!t) return 'unknown';
  if (/print|engrav|etch|woodcut|woodblock|lithograph|mezzotint|aquatint|poster/.test(t)) return 'print';
  if (/draw|chalk|graphite|charcoal|pastel|watercolor|pen and|ink/.test(t)) return 'drawing';
  if (/paint|oil on|tempera/.test(t)) return 'painting';
  if (/photo|gelatin|albumen|daguerre/.test(t)) return 'photo';
  return 'object';
}

// How useful a result is likely to be to someone making a graphic: flat art
// that names the subject comes first, objects and loose matches last.
const KIND_SCORE = { print: 3, drawing: 3, painting: 1, photo: 1, unknown: 1, object: 0 };
export function score(item, q) {
  return (mentions(item.title, q) ? 2 : 0) + KIND_SCORE[artKind(item.type)];
}

// The same work can come back from two archives (or twice from one). Keep the
// first copy: same image file, or same title by the same named maker. Makers
// are compared by name only, since one museum writes "Albrecht Dürer" and
// another "Albrecht Dürer (German, 1471-1528)".
const plain = (s) => String(s || '').split('(')[0].normalize('NFD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => {
    const keys = [it.image || it.thumb];
    if (plain(it.maker)) keys.push(plain(it.title) + '|' + plain(it.maker));
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

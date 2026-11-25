// GFXWRLD public archive search.
// Queries archive APIs in parallel and returns one common record shape.
// Only public domain / CC0 items are returned.
// Add &summary=1 to any search to get per-source status without the items.
import met from '../lib/met.js';
import aic from '../lib/aic.js';
import cma from '../lib/cma.js';
import europeana from '../lib/europeana.js';
import wikimedia from '../lib/wikimedia.js';
import smithsonian from '../lib/smithsonian.js';
import { score, dedupe } from '../lib/common.js';

const MAX_PAGE = 8;

const SOURCES = {
  'The Met': met,
  'Art Institute of Chicago': aic,
  'Cleveland Museum of Art': cma,
  Smithsonian: smithsonian,
  Europeana: europeana,
  'Wikimedia Commons': wikimedia,
};

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim().slice(0, 80);
  if (!q) {
    res.status(400).json({ error: 'Missing search term (q).' });
    return;
  }
  const summaryOnly = Boolean(req.query && req.query.summary);
  const dbg = summaryOnly ? {} : null;
  const perSource = 12;
  const page = Math.min(MAX_PAGE, Math.max(0, parseInt((req.query && req.query.page) || '0', 10) || 0));
  const results = await Promise.all(
    Object.entries(SOURCES).map(async ([name, fn]) => {
      const t = Date.now();
      try {
        const items = await fn(q, perSource, dbg, page);
        return { name, ok: true, count: items.length, ms: Date.now() - t, items };
      } catch (e) {
        return { name, ok: false, count: 0, ms: Date.now() - t, error: String((e && e.message) || e), items: [] };
      }
    })
  );
  const sources = results.map(({ items: _omit, ...s }) => s);
  if (summaryOnly) {
    res.status(200).json({
      q,
      sources,
      debug: dbg,
      sample: results.map((s) => s.items.slice(0, 3).map((i) => ({ title: i.title, date: i.date, rights: i.rights }))),
    });
    return;
  }
  // Interleave so no single archive fills the first screen.
  const mixed = [];
  for (let i = 0; i < perSource; i++) {
    for (const s of results) if (s.items[i]) mixed.push(s.items[i]);
  }
  const unique = dedupe(mixed);
  // Best first: flat art that names the subject, then the rest. The sort is
  // stable, so within a tier the archives stay mixed.
  const items = unique.map((it) => ({ it, s: score(it, q) })).sort((a, b) => b.s - a.s).map((x) => x.it);
  const more = page < MAX_PAGE && results.some((s) => s.count > 0);
  // A full answer is kept for a day. One with an archive missing is kept only
  // briefly, so a rate-limited archive comes back on its own.
  const healthy = results.every((s) => s.ok);
  res.setHeader('Cache-Control', healthy ? 's-maxage=86400, stale-while-revalidate=604800' : 's-maxage=120, stale-while-revalidate=600');
  res.status(200).json({ q, page, more, sources, items });
}

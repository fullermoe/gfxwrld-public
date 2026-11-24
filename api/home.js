// Home page crates: a fixed set of categories, each with real images pulled
// from the archives. The result is cached at the edge so ordinary visits do
// not call the museums at all.
// The Met is left out here on purpose: it starts refusing requests (HTTP 403)
// after roughly 40 calls in a few seconds, and one crate costs it 10. It stays
// in search, where a single query fits under that limit.
// Add ?debug=1 to see which source failed for which crate (not cached).
import aic from '../lib/aic.js';
import cma from '../lib/cma.js';
import wikimedia from '../lib/wikimedia.js';
import { score, dedupe } from '../lib/common.js';

const CRATES = [
  { label: 'Skulls', q: 'skull' },
  { label: 'Snakes', q: 'snake' },
  { label: 'Eagles', q: 'eagle' },
  { label: 'Tigers', q: 'tiger' },
  { label: 'Roses', q: 'roses' },
  { label: 'Botanical', q: 'botanical' },
  { label: 'Angels', q: 'angel' },
  { label: 'Devils', q: 'devil' },
  { label: 'Boxing', q: 'boxing' },
  { label: 'Horses', q: 'horse' },
  { label: 'Samurai', q: 'samurai' },
  { label: 'Anatomy', q: 'anatomy' },
];

// Wikimedia Commons is the fallback: it only reaches a cover when the two
// museums are short on a subject.
const SOURCES = { cma, aic, wikimedia };
// Ask each archive for more than a crate shows, then keep its best few: flat
// art that names the subject first, so a cover is a print of an angel and not
// a tea set that happens to be filed under one.
const FETCH = 12;
const PER_SOURCE = 4;
const BATCH = 4;

async function loadCrate(c) {
  const errors = {};
  const lists = await Promise.all(
    Object.entries(SOURCES).map(([name, fn]) =>
      fn(c.q, FETCH)
        .then((list) => list.map((it) => ({ it, s: score(it, c.q) })).sort((a, b) => b.s - a.s).map((x) => x.it).slice(0, PER_SOURCE))
        .catch((e) => {
          errors[name] = String((e && e.message) || e);
          return [];
        })
    )
  );
  const mixed = [];
  for (let i = 0; i < PER_SOURCE; i++) for (const l of lists) if (l[i]) mixed.push(l[i]);
  mixed.sort((a, b) => score(b, c.q) - score(a, c.q));
  return {
    label: c.label,
    q: c.q,
    full: lists.slice(0, 2).some((l) => l.length > 0),
    errors,
    counts: lists.map((l) => l.length),
    // Up to 8: the page shows 4 and keeps the rest as spares for failed images.
    items: dedupe(mixed).slice(0, 8).map((it) => ({ title: it.title, source: it.source, thumb: it.thumb })),
  };
}

export default async function handler(req, res) {
  const crates = [];
  for (let i = 0; i < CRATES.length; i += BATCH) {
    crates.push(...(await Promise.all(CRATES.slice(i, i + BATCH).map(loadCrate))));
  }
  if (req.query && req.query.debug) {
    res.status(200).json(crates.map(({ label, counts, errors }) => ({ label, counts, errors })));
    return;
  }
  const shown = crates.filter((c) => c.items.length >= 4);
  // Only keep a load for a day when every source answered for most crates.
  const healthy = shown.filter((c) => c.full).length >= Math.ceil(CRATES.length * 0.75);
  res.setHeader('Cache-Control', healthy ? 's-maxage=86400, stale-while-revalidate=604800' : 's-maxage=60');
  res.status(200).json({ healthy, crates: shown.map(({ full, errors, counts, ...c }) => c) });
}

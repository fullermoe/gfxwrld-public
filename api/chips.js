// Suggested searches shown as chips under the search box: looks and subjects
// worth digging into, each with a small image pulled from the archives.
// Cached at the edge for a day, like the crates.
import aic from '../lib/aic.js';
import cma from '../lib/cma.js';
import { score } from '../lib/common.js';

const CHIPS = [
  { label: 'Woodblock prints', q: 'woodblock' },
  { label: 'Engravings', q: 'engraving' },
  { label: 'Skeletons', q: 'skeleton' },
  { label: 'Posters', q: 'poster' },
  { label: 'Dragons', q: 'dragon' },
  { label: 'Insects', q: 'insect' },
  { label: 'Coats of arms', q: 'coat of arms' },
  { label: 'Playing cards', q: 'playing cards' },
  { label: 'Masks', q: 'mask' },
  { label: 'Moon', q: 'moon' },
  { label: 'Ships', q: 'ship' },
  { label: 'Birds', q: 'bird' },
  { label: 'Maps', q: 'map' },
  { label: 'Alphabets', q: 'alphabet' },
];
const BATCH = 5;

async function one(c) {
  const lists = await Promise.all([cma, aic].map((fn) => fn(c.q, 6).catch(() => [])));
  const best = lists.flat().map((it) => ({ it, s: score(it, c.q) })).sort((a, b) => b.s - a.s)[0];
  return { label: c.label, q: c.q, thumb: best ? best.it.thumb : null };
}

export default async function handler(req, res) {
  const chips = [];
  for (let i = 0; i < CHIPS.length; i += BATCH) chips.push(...(await Promise.all(CHIPS.slice(i, i + BATCH).map(one))));
  const withImage = chips.filter((c) => c.thumb).length;
  res.setHeader('Cache-Control', withImage >= CHIPS.length * 0.75 ? 's-maxage=86400, stale-while-revalidate=604800' : 's-maxage=60');
  res.status(200).json({ chips });
}

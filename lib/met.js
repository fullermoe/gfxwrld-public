import { getJson } from './common.js';

// The Met: search returns ids only, so each object is fetched separately.
// Search moved to /v1.1 on 2026-10-01 (paged); object records stay on /v1.
// isPublicDomain is not a search filter, so it is checked on each record.
// The Met refuses requests (HTTP 403) after roughly 40 calls in a few seconds,
// and one search here costs about 37. This source should move to the index.
const SEARCH_LIMIT = 40;

// Object records do not change, so they are remembered for as long as this
// server instance lives. After a refusal the Met is left alone for a while.
const seen = new Map();
let restUntil = 0;
async function object(base, id) {
  if (seen.has(id)) return seen.get(id);
  const o = await getJson(`${base}/v1/objects/${id}`).catch((e) => {
    if (/HTTP 403/.test(String(e && e.message))) restUntil = Date.now() + 30000;
    return undefined;
  });
  if (o === undefined) return null;
  if (seen.size > 5000) seen.clear();
  seen.set(id, o);
  return o;
}

export default async function met(q, n, dbg, page = 0) {
  if (Date.now() < restUntil) throw new Error('resting after rate limit');
  const base = 'https://collectionapi.metmuseum.org/public/collection';
  const s = await getJson(`${base}/v1.1/search?hasImages=true&limit=${SEARCH_LIMIT}&offset=${page * SEARCH_LIMIT}&q=${encodeURIComponent(q)}`).catch((e) => {
    if (/HTTP 403/.test(String(e && e.message))) restUntil = Date.now() + 30000;
    throw e;
  });
  const ids = (s.objectIDs || []).slice(0, n * 3);
  // Fetch in two batches and stop early once there are enough usable records.
  const usable = (o) => o && o.isPublicDomain && o.primaryImageSmall;
  let objs = await Promise.all(ids.slice(0, n + 6).map((id) => object(base, id)));
  if (objs.filter(usable).length < n && ids.length > n + 6 && Date.now() >= restUntil) {
    objs = objs.concat(await Promise.all(ids.slice(n + 6).map((id) => object(base, id))));
  }
  return objs
    .filter((o) => o && o.isPublicDomain && o.primaryImageSmall)
    .slice(0, n)
    .map((o) => ({
      id: 'met-' + o.objectID,
      source: 'The Met',
      title: o.title || 'Untitled',
      maker: o.artistDisplayName || '',
      date: o.objectDate || '',
      type: o.classification || o.objectName || '',
      thumb: o.primaryImageSmall,
      image: o.primaryImage || o.primaryImageSmall,
      width: null,
      height: null,
      rights: 'CC0',
      link: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
    }));
}

import { getJson } from './common.js';

// The Met: search returns ids only, so each object is fetched separately.
// Search moved to /v1.1 on 2026-10-01 (paged); object records stay on /v1.
// isPublicDomain is not a search filter, so it is checked on each record.
// The Met refuses requests (HTTP 403) after roughly 40 calls in a few seconds,
// and one search here costs about 37. This source should move to the index.
const SEARCH_LIMIT = 40;

export default async function met(q, n, dbg, page = 0) {
  const base = 'https://collectionapi.metmuseum.org/public/collection';
  const s = await getJson(`${base}/v1.1/search?hasImages=true&limit=${SEARCH_LIMIT}&offset=${page * SEARCH_LIMIT}&q=${encodeURIComponent(q)}`);
  const ids = (s.objectIDs || []).slice(0, n * 3);
  const objs = await Promise.all(ids.map((id) => getJson(`${base}/v1/objects/${id}`).catch(() => null)));
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

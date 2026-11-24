import { getJson, num, UA } from './common.js';

// Art Institute of Chicago: search by relevance, then keep only public domain
// records. When nothing matches, the API still returns a generic listing with
// scores near zero (real matches score in the tens), so low scores are dropped.
// Images: 843px wide is the size the museum documents and caches. Its image
// server also refuses requests that carry a referrer, which is why the site
// sends Referrer-Policy: no-referrer (see vercel.json).
const MIN_SCORE = 1;

export default async function aic(q, n) {
  const fields = 'id,title,artist_title,date_display,image_id,classification_title,thumbnail,is_public_domain';
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&limit=${n * 3}&fields=${fields}`;
  const s = await getJson(url, { 'AIC-User-Agent': UA });
  const iiif = (s.config && s.config.iiif_url) || 'https://www.artic.edu/iiif/2';
  return (s.data || [])
    .filter((o) => typeof o._score !== 'number' || o._score >= MIN_SCORE)
    .filter((o) => o.image_id && o.is_public_domain === true)
    .slice(0, n)
    .map((o) => {
      const src = `${iiif}/${o.image_id}/full/843,/0/default.jpg`;
      return {
        id: 'aic-' + o.id,
        source: 'Art Institute of Chicago',
        title: o.title || 'Untitled',
        maker: o.artist_title || '',
        date: o.date_display || '',
        type: o.classification_title || '',
        thumb: src,
        image: src,
        width: o.thumbnail ? num(o.thumbnail.width) : null,
        height: o.thumbnail ? num(o.thumbnail.height) : null,
        rights: 'CC0',
        link: `https://www.artic.edu/artworks/${o.id}`,
      };
    });
}

import { getJson, num, mentions } from './common.js';

// Cleveland Museum of Art: cc0=1 limits results to open access works.
export default async function cma(q, n, dbg, page = 0) {
  const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&cc0=1&has_image=1&limit=${n * 2}&skip=${page * n * 2}`;
  const s = await getJson(url);
  return (s.data || [])
    .filter((o) => o.share_license_status === 'CC0' && o.images && o.images.web && o.images.web.url)
    // The museum's search matches word stems ("boxing" finds paint boxes), so
    // the record itself has to mention the search words.
    .filter((o) => mentions([o.title, o.tombstone, o.description, o.did_you_know, o.type].join(' '), q))
    .slice(0, n)
    .map((o) => {
      const big = o.images.print || o.images.web;
      return {
        id: 'cma-' + o.id,
        source: 'Cleveland Museum of Art',
        title: o.title || 'Untitled',
        maker: (o.creators && o.creators[0] && o.creators[0].description) || '',
        date: o.creation_date || '',
        type: o.type || '',
        thumb: o.images.web.url,
        image: big.url,
        width: num(big.width),
        height: num(big.height),
        rights: 'CC0',
        link: o.url || '',
      };
    });
}

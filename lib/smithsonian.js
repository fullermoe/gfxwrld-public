import { getJson, num, mentions } from './common.js';

// Smithsonian Open Access: one search across the Smithsonian's museums.
// Most of its 5 million records are natural history specimens (fish in jars,
// pinned insects), which would bury the art. The search is limited to the
// museums and libraries that hold art, design, prints and printed matter.
// Only images the Smithsonian marks CC0 are kept; that is checked on each
// image, not just on the record.
const UNITS = ['SAAM', 'NPG', 'CHNDM', 'FSG', 'HMSG', 'NMAfA', 'NMAH', 'NPM', 'SIL', 'NASM', 'ACM', 'NMAI', 'AAA'];
const NAMES = {
  SAAM: 'Smithsonian American Art Museum', NPG: 'National Portrait Gallery', CHNDM: 'Cooper Hewitt', FSG: 'National Museum of Asian Art',
  HMSG: 'Hirshhorn Museum', NMAfA: 'National Museum of African Art', NMAH: 'National Museum of American History', NPM: 'National Postal Museum',
  SIL: 'Smithsonian Libraries', NASM: 'National Air and Space Museum', ACM: 'Anacostia Community Museum', NMAI: 'National Museum of the American Indian', AAA: 'Archives of American Art',
};
const text = (list) => ((list || [])[0] && (list[0].content || list[0])) || '';

export default async function smithsonian(q, n, dbg, page = 0) {
  const key = process.env.SMITHSONIAN_API_KEY;
  if (!key) throw new Error('No API key set');
  const rows = n * 3;
  const words = q.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
  const query = `(${words}) AND online_media_type:"Images" AND media_usage:"CC0" AND unit_code:(${UNITS.join(' OR ')})`;
  const params = new URLSearchParams({ api_key: key, q: query, rows: String(rows), start: String(page * rows) });
  const s = await getJson('https://api.si.edu/openaccess/api/v1.0/search?' + params.toString());
  const all = (s.response && s.response.rows) || [];
  const out = [];
  for (const r of all) {
    const c = r.content || {};
    const d = c.descriptiveNonRepeating || {};
    const f = c.freetext || {};
    const media = ((d.online_media && d.online_media.media) || []).find((m) => m.type === 'Images' && m.usage && m.usage.access === 'CC0' && (m.idsId || m.thumbnail));
    if (!media) continue;
    const kind = text(f.objectType) || ((c.indexedStructured && c.indexedStructured.object_type) || [])[0] || '';
    if (!mentions([r.title, kind, text(f.topic), text(f.notes)].join(' '), q)) continue;
    const ids = media.idsId ? 'https://ids.si.edu/ids/deliveryService?id=' + encodeURIComponent(media.idsId) : null;
    const big = (media.resources || []).find((x) => /high-resolution jpeg/i.test(x.label || '') && x.url);
    out.push({
      id: 'si-' + String(r.id || '').replace(/[^a-zA-Z0-9]+/g, '-'),
      source: 'Smithsonian',
      via: NAMES[r.unitCode] || (d.data_source || ''),
      title: (r.title || 'Untitled').slice(0, 140),
      maker: String(text(f.name)).slice(0, 80),
      date: String(text(f.date)).slice(0, 40),
      type: String(kind),
      thumb: ids ? ids + '&max=800' : media.thumbnail,
      image: (big && big.url) || (ids ? ids + '&max=4000' : media.content || media.thumbnail),
      width: big ? num(big.width) : null,
      height: big ? num(big.height) : null,
      rights: 'CC0',
      link: d.record_link || d.guid || '',
    });
    if (out.length >= n) break;
  }
  if (dbg) dbg.smithsonian = { total: s.response && s.response.rowCount, returned: all.length, kept: out.length, units: [...new Set(all.map((r) => r.unitCode))] };
  return out;
}

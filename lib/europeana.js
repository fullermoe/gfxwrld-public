import { getJson, first } from './common.js';

// Europeana: one search across thousands of European museums and libraries.
// reusability=open also includes attribution licences (CC BY, CC BY-SA), so
// results are narrowed again to public domain mark and CC0 only.
const isPublicDomain = (rights) => /creativecommons\.org\/publicdomain\/(mark|zero)\//i.test(first(rights));

export default async function europeana(q, n, dbg) {
  const key = process.env.EUROPEANA_API_KEY;
  if (!key) throw new Error('No API key set');
  const params = new URLSearchParams({
    wskey: key,
    query: q,
    reusability: 'open',
    media: 'true',
    thumbnail: 'true',
    rows: String(n * 4),
    profile: 'standard',
  });
  params.append('qf', 'TYPE:IMAGE');
  const s = await getJson('https://api.europeana.eu/record/v2/search.json?' + params.toString());
  const all = s.items || [];
  if (dbg) dbg.europeana = { total: s.totalResults, returned: all.length };
  return all
    .filter((o) => isPublicDomain(o.rights) && first(o.edmPreview))
    .slice(0, n)
    .map((o) => ({
      id: 'eur-' + String(o.id || '').replace(/^\//, '').replace(/\//g, '-'),
      source: 'Europeana',
      via: first(o.dataProvider),
      title: first(o.title) || 'Untitled',
      maker: first(o.dcCreator),
      date: first(o.year),
      type: '',
      thumb: first(o.edmPreview),
      image: first(o.edmIsShownBy) || first(o.edmPreview),
      width: null,
      height: null,
      rights: /zero/i.test(first(o.rights)) ? 'CC0' : 'Public domain',
      link: o.guid || first(o.edmIsShownAt),
    }));
}

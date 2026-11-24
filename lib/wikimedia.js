import { getJson } from './common.js';

// Wikimedia Commons: licences vary file by file, so three checks are applied.
// 1. The search only asks for files whose structured data says public domain
//    (P6216=Q19652) or CC0 (P275=Q6938433).
// 2. Each result's own licence label must also read public domain or CC0.
// 3. The work must carry a date no later than OLDEST_ALLOWED. Commons also
//    holds modern photos that people released as CC0, including photos of
//    living people. Those are legal to use but are not what this tool is for,
//    so anything recent or undated is left out.
// Some Commons files are public domain in the US only; the record page says so.
const OLDEST_ALLOWED = 1930;
const SEARCH_LIMIT = 50; // the API's ceiling for this kind of search

const strip = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const meta = (ii, key) => strip(ii.extmetadata && ii.extmetadata[key] && ii.extmetadata[key].value);
const cleanName = (t) => String(t || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');

// Commons appends machine-readable text to some dates ("circa 1630date QS:P571,+1630...").
// Keep only the part a person would read.
function cleanDate(text) {
  return String(text || '').split(/date QS:/i)[0].trim().slice(0, 40);
}

// The latest four-digit year mentioned in a date string, or null if there is none.
export function latestYear(text) {
  const years = (String(text || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || []).map(Number);
  return years.length ? Math.max(...years) : null;
}

export default async function wikimedia(q, n, dbg) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(SEARCH_LIMIT),
    gsrsearch: `${q} filetype:bitmap haswbstatement:P6216=Q19652|P275=Q6938433`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '800',
    iiextmetadatafilter: 'LicenseShortName|Artist|DateTimeOriginal|ObjectName',
  });
  const s = await getJson('https://commons.wikimedia.org/w/api.php?' + params.toString());
  const pages = Object.values((s.query && s.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const candidates = pages
    .map((pg) => ({ pg, ii: (pg.imageinfo || [])[0] }))
    .filter(({ ii }) => ii && ii.thumburl && /image\/(jpeg|png)/.test(ii.mime || ''))
    .filter(({ ii }) => /public domain|cc0|^pd\b/i.test(meta(ii, 'LicenseShortName')));
  const old = candidates.filter(({ ii }) => {
    const y = latestYear(meta(ii, 'DateTimeOriginal'));
    return y !== null && y <= OLDEST_ALLOWED;
  });
  if (dbg) dbg.wikimedia = { returned: pages.length, licensed: candidates.length, oldEnough: old.length };
  return old.slice(0, n).map(({ pg, ii }) => ({
    id: 'wmc-' + pg.pageid,
    source: 'Wikimedia Commons',
    title: (meta(ii, 'ObjectName') || cleanName(pg.title)).slice(0, 140),
    maker: meta(ii, 'Artist').slice(0, 80),
    date: cleanDate(meta(ii, 'DateTimeOriginal')),
    type: '',
    thumb: ii.thumburl,
    image: ii.url,
    width: ii.width || null,
    height: ii.height || null,
    rights: /cc0/i.test(meta(ii, 'LicenseShortName')) ? 'CC0' : 'Public domain',
    link: ii.descriptionurl || '',
  }));
}

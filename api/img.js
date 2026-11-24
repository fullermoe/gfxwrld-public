// Image pass-through for the background remover. A browser will not let a page
// read the pixels of an image from another site, so the remover loads images
// through this address instead. Only the archives' own image hosts are allowed,
// so this cannot be used to fetch anything else.
import { Readable } from 'node:stream';
import { UA } from '../lib/common.js';

const ALLOWED = new Set([
  'images.metmuseum.org',
  'www.artic.edu',
  'openaccess-cdn.clevelandart.org',
  'api.europeana.eu',
  'ids.si.edu',
  'smithsonian-open-access.s3-us-west-2.amazonaws.com',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
]);
const MAX_BYTES = 40 * 1024 * 1024;
export const isAllowedImage = (u) => u.protocol === 'https:' && ALLOWED.has(u.hostname);

export default async function handler(req, res) {
  let u;
  try {
    u = new URL(String((req.query && req.query.u) || ''));
  } catch (e) {
    res.status(400).json({ error: 'Bad image address.' });
    return;
  }
  if (!isAllowedImage(u)) {
    res.status(400).json({ error: 'Image host not allowed.' });
    return;
  }
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: AbortSignal.timeout(25000) });
    const type = r.headers.get('content-type') || '';
    const size = Number(r.headers.get('content-length') || 0);
    if (!r.ok || !type.startsWith('image/') || !r.body) {
      res.status(502).json({ error: 'The archive did not return an image.' });
      return;
    }
    if (size > MAX_BYTES) {
      res.status(413).json({ error: 'Image too large.' });
      return;
    }
    res.setHeader('Content-Type', type);
    // dl=1 saves the file instead of showing it. The name is reduced to plain
    // characters so nothing unexpected can be put in the header.
    if (req.query && req.query.dl) {
      const ext = type.includes('png') ? 'png' : type.includes('gif') ? 'gif' : 'jpg';
      const name = String(req.query.name || 'gfxwrld-archive').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'gfxwrld-archive';
      res.setHeader('Content-Disposition', `attachment; filename="${name}.${ext}"`);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
  } catch (e) {
    res.status(502).json({ error: 'Could not reach the archive.' });
  }
}

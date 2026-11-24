// Pixel size of an archive image, for archives that do not report it.
// Only the first part of the file is read: the size is stored near the start.
import { UA } from '../lib/common.js';
import { isAllowedImage } from './img.js';

const HEAD_BYTES = 262144;

function readSize(b) {
  // PNG: width and height sit at fixed positions after the signature.
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  // JPEG: walk the segments until a start-of-frame marker.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

export default async function handler(req, res) {
  let u;
  try { u = new URL(String((req.query && req.query.u) || '')); } catch (e) { res.status(400).json({ error: 'Bad image address.' }); return; }
  if (!isAllowedImage(u)) { res.status(400).json({ error: 'Image host not allowed.' }); return; }
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'image/*', Range: 'bytes=0-' + (HEAD_BYTES - 1) }, signal: AbortSignal.timeout(12000) });
    if (!r.ok || !r.body) { res.status(502).json({ error: 'The archive did not return an image.' }); return; }
    // Total file size: from Content-Range when the archive honoured the range.
    const range = r.headers.get('content-range') || '';
    const total = Number((range.match(/\/(\d+)$/) || [])[1] || (r.status === 200 ? r.headers.get('content-length') : 0)) || null;
    const chunks = [];
    let got = 0;
    const reader = r.body.getReader();
    while (got < HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      got += value.length;
    }
    reader.cancel().catch(() => {});
    const size = readSize(Buffer.concat(chunks)) || { width: null, height: null };
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
    res.status(200).json({ ...size, bytes: total });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach the archive.' });
  }
}

// Background remover for the result panel.
// It removes the background of a scan: the background becomes see-through and
// what was printed on it stays, in its own colours or as a single ink colour.
// All of the work happens in the visitor's browser; nothing is uploaded or stored.
// Works best on prints, engravings and drawings. It does not cut a subject out
// of a painting or a photo.
(() => {
  const PREVIEW_MAX = 900;
  const EXPORT_MAX = 4000;
  const INKS = { Black: [0, 0, 0], White: [241, 241, 241], Lime: [220, 239, 111] };
  // The preview backdrop that shows each ink best.
  const BACK_FOR_INK = { Original: 'Grid', Black: 'White', White: 'Black', Lime: 'Black' };
  const el = (tag, props = {}, kids = []) => { const n = Object.assign(document.createElement(tag), props); kids.forEach((k) => n.append(k)); return n; };
  const ORIGIN = document.currentScript ? new URL(document.currentScript.src).origin : '';
  const proxied = (u) => ORIGIN + '/api/img?u=' + encodeURIComponent(u);
  let job = 0;

  function load(url, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, c.width, c.height);
        try { resolve(ctx.getImageData(0, 0, c.width, c.height)); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Image did not load'));
      img.src = proxied(url);
    });
  }

  // Measure the image: how bright the background is, how dark the art is, and
  // the background's actual colour (old pages are cream or brown, not white).
  // `invert` is for light art on a dark background, where the roles swap.
  function measure(d, invert) {
    const hist = new Uint32Array(256);
    let total = 0;
    const lumAt = (i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    for (let i = 0; i < d.length; i += 16) { hist[lumAt(i) | 0]++; total++; }
    const at = (frac) => { let run = 0; for (let v = 0; v < 256; v++) { run += hist[v]; if (run >= total * frac) return v; } return 255; };
    const dark = at(0.04), light = at(0.9);
    // Average the pixels that sit at the background's brightness.
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const l = lumAt(i);
      if (invert ? l <= dark + 6 : l >= light - 6) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    }
    const back = n ? [r / n, g / n, b / n] : (invert ? [0, 0, 0] : [255, 255, 255]);
    return { dark, light, range: Math.max(1, light - dark), back };
  }

  function knock(src, o) {
    const d = src.data;
    const out = new ImageData(src.width, src.height);
    const p = out.data;
    const { light, dark, range, back } = measure(d, o.invert);
    const cut = o.cutoff / 100;
    const keep = o.ink === 'Original';
    const [r, g, b] = keep ? [0, 0, 0] : INKS[o.ink];
    const backLum = (back[0] * 299 + back[1] * 587 + back[2] * 114) / 1000;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      let t;
      if (keep) {
        // How far this pixel is from the background, by brightness or by
        // colour, whichever is larger. Colour matters for light inks: a pale
        // yellow is nearly as bright as the page but clearly a different colour.
        const byColour = Math.max(Math.abs(d[i] - back[0]), Math.abs(d[i + 1] - back[1]), Math.abs(d[i + 2] - back[2]));
        t = Math.max(Math.abs(lum - backLum), byColour) / range;
      } else {
        t = o.invert ? (lum - dark) / range : (light - lum) / range;
      }
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const a = o.mode === 'Hard' ? (t > cut ? 1 : 0) : (t <= cut ? 0 : (t - cut) / (1 - cut));
      if (keep && a > 0) {
        // Each pixel is the art mixed with the background showing through.
        // Take the background's share back out so the colours come up clean
        // on any shirt colour, without the page's tint.
        const m = Math.max(a, 0.15);
        for (let c = 0; c < 3; c++) {
          const v = (d[i + c] - (1 - m) * back[c]) / m;
          p[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      } else { p[i] = r; p[i + 1] = g; p[i + 2] = b; }
      p[i + 3] = Math.round(a * (d[i + 3] / 255) * 255);
    }
    if (o.mode === 'Halftone') halftone(out);
    return out;
  }

  // Turn the soft ink into a screen of dots, the way a tonal image is printed
  // in one colour: darker areas get bigger dots. The dot grid is turned 45
  // degrees and its spacing follows the image size, so a preview and the full
  // size file look the same.
  function halftone(img) {
    const w = img.width, h = img.height, p = img.data;
    const tone = new Float32Array(w * h);
    for (let i = 0, j = 3; i < tone.length; i++, j += 4) tone[i] = p[j] / 255;
    const cell = Math.max(4, Math.round(Math.max(w, h) / 120));
    const k = Math.SQRT1_2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Position on the turned grid, then the centre of the dot this pixel belongs to.
        const u = (x + y) * k, v = (y - x) * k;
        const cu = (Math.floor(u / cell) + 0.5) * cell, cv = (Math.floor(v / cell) + 0.5) * cell;
        let cx = Math.round((cu - cv) * k), cy = Math.round((cu + cv) * k);
        cx = cx < 0 ? 0 : cx >= w ? w - 1 : cx; cy = cy < 0 ? 0 : cy >= h ? h - 1 : cy;
        const radius = Math.sqrt(tone[cy * w + cx]) * cell * 0.74;
        const dist = Math.hypot(u - cu, v - cv);
        const a = radius - dist + 0.5; // half a pixel of softening on the dot edge
        p[(y * w + x) * 4 + 3] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
      }
    }
  }

  // A row of pick-one buttons. Returns the element and a way to set it from code.
  function seg(label, values, current, onPick) {
    const row = el('div');
    const buttons = values.map((v) => {
      const b = el('button', { type: 'button', textContent: v });
      b.addEventListener('click', () => { set(v); onPick(v); });
      return b;
    });
    const set = (v) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === v)));
    set(current);
    buttons.forEach((b) => row.append(b));
    return { node: el('div', { className: 'seg' }, [el('span', { textContent: label }), row]), set };
  }

  function mount(it) {
    const panel = document.getElementById('detail');
    const orig = panel && panel.querySelector('img');
    if (!orig) return;
    const mine = ++job;
    const o = { mode: 'Soft', cutoff: 25, ink: 'Original', back: BACK_FOR_INK.Original, invert: false };
    let src = null;

    const canvas = el('canvas');
    const stage = el('div', { className: 'cutstage', hidden: true }, [canvas]);
    const status = el('p', { className: 'cutstatus' });
    status.setAttribute('aria-live', 'polite');

    const draw = () => {
      stage.dataset.back = o.back;
      if (!src || mine !== job) return;
      const out = knock(src, o);
      canvas.width = out.width; canvas.height = out.height;
      canvas.getContext('2d').putImageData(out, 0, 0);
    };

    const range = el('input', { type: 'range', min: '5', max: '90', value: String(o.cutoff) });
    range.addEventListener('input', () => { o.cutoff = Number(range.value); draw(); });
    const inv = el('input', { type: 'checkbox' });
    inv.addEventListener('change', () => { o.invert = inv.checked; draw(); });
    const save = el('button', { type: 'button', className: 'btn p', textContent: 'Download PNG' });

    save.addEventListener('click', async () => {
      save.disabled = true;
      status.textContent = 'Preparing the full size file';
      let big = src;
      try { big = await load(it.image, EXPORT_MAX); } catch (e) { /* fall back to the preview size */ }
      const out = knock(big, o);
      const c = document.createElement('canvas');
      c.width = out.width; c.height = out.height;
      c.getContext('2d').putImageData(out, 0, 0);
      c.toBlob((blob) => {
        save.disabled = false;
        if (!blob) { status.textContent = 'Could not make the file. Try again.'; return; }
        const a = el('a', { href: URL.createObjectURL(blob), download: 'gfxwrld-' + it.id + '-cut.png' });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        status.textContent = 'Saved ' + out.width + ' x ' + out.height + ' px, transparent PNG';
      }, 'image/png');
    });

    const backSeg = seg('Preview on', ['Grid', 'Black', 'White'], o.back, (v) => { o.back = v; draw(); });
    const inkSeg = seg('Colour', ['Original', ...Object.keys(INKS)], o.ink, (v) => { o.ink = v; o.back = BACK_FOR_INK[v]; backSeg.set(o.back); draw(); });
    const tools = el('div', { className: 'cuttools', hidden: true }, [
      seg('Style', ['Soft', 'Hard', 'Halftone'], o.mode, (v) => { o.mode = v; draw(); }).node,
      el('label', { className: 'rng' }, ['How much background to remove', range]),
      inkSeg.node,
      backSeg.node,
      el('label', { className: 'chk' }, [inv, 'Background is dark']),
      save,
      status,
    ]);

    const tabOrig = el('button', { type: 'button', textContent: 'Original' });
    const tabCut = el('button', { type: 'button', textContent: 'Remove background' });
    const show = async (cut) => {
      tabOrig.setAttribute('aria-pressed', String(!cut));
      tabCut.setAttribute('aria-pressed', String(cut));
      orig.hidden = cut; stage.hidden = !cut; tools.hidden = !cut;
      if (!cut || src) { draw(); return; }
      status.textContent = 'Loading the image';
      try {
        src = await load(it.thumb, PREVIEW_MAX);
        status.textContent = '';
        draw();
      } catch (e) {
        status.textContent = 'This image cannot be processed here. Use Open full image instead.';
        save.disabled = true;
      }
    };
    tabOrig.addEventListener('click', () => show(false));
    tabCut.addEventListener('click', () => show(true));
    tabOrig.setAttribute('aria-pressed', 'true');
    tabCut.setAttribute('aria-pressed', 'false');

    orig.before(el('div', { className: 'cuttabs' }, [tabOrig, tabCut]));
    orig.after(stage, tools);
  }

  document.addEventListener('gfx:detail', (e) => mount(e.detail.item));
})();

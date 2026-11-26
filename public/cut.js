// Crop and background remover for the result panel.
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

  // Copy part of an image. `r` is the crop box as fractions of the width and
  // height, so one box fits the preview and the full size file alike.
  function cropData(img, r) {
    if (!r) return img;
    const x = Math.round(r.x * img.width), y = Math.round(r.y * img.height);
    const w = Math.max(1, Math.min(img.width - x, Math.round(r.w * img.width)));
    const h = Math.max(1, Math.min(img.height - y, Math.round(r.h * img.height)));
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(img, 0, 0);
    return ctx.getImageData(x, y, w, h);
  }

  function saveCanvas(data, name, status, done) {
    const c = document.createElement('canvas');
    c.width = data.width; c.height = data.height;
    c.getContext('2d').putImageData(data, 0, 0);
    c.toBlob((blob) => {
      done();
      if (!blob) { status.textContent = 'Could not make the file. Try again.'; return; }
      const a = el('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      status.textContent = 'Saved ' + data.width + ' x ' + data.height + ' px PNG';
    }, 'image/png');
  }

  // Width over height. Shirt front is a 12 x 16 inch print area.
  const RATIOS = { Free: 0, '1:1': 1, '4:5': 4 / 5, '2:3': 2 / 3, 'Shirt front': 3 / 4 };

  function mount(it) {
    const panel = document.getElementById('detail');
    const orig = panel && panel.querySelector('img');
    if (!orig) return;
    const mine = ++job;
    // The amount removed is fixed at the setting that gave a usable result on the
    // most images in testing, so there is nothing to adjust.
    const o = { mode: 'Soft', cutoff: 25, ink: 'Original', back: BACK_FOR_INK.Original, invert: false };
    let src = null, srcCanvas = null;
    // The crop box, as fractions of the image. null means the whole image.
    let region = null, cropKey = '', cropped = null;
    const area = () => {
      const key = region ? [region.x, region.y, region.w, region.h].join() : '';
      if (key !== cropKey || !cropped) { cropKey = key; cropped = cropData(src, region); }
      return cropped;
    };
    const ensure = async (status) => {
      if (src) return true;
      status.textContent = 'Loading the image';
      try {
        src = await load(it.thumb, PREVIEW_MAX);
        srcCanvas = document.createElement('canvas');
        srcCanvas.width = src.width; srcCanvas.height = src.height;
        srcCanvas.getContext('2d').putImageData(src, 0, 0);
        status.textContent = '';
        return true;
      } catch (e) {
        status.textContent = 'This image cannot be processed here. Use Download image instead.';
        return false;
      }
    };
    // The full size file, loaded once when the first download is asked for.
    let bigP = null;
    const big = () => (bigP = bigP || load(it.image, EXPORT_MAX).catch(() => src));

    /* Remove background */
    const canvas = el('canvas');
    const stage = el('div', { className: 'cutstage', hidden: true }, [canvas]);
    const status = el('p', { className: 'cutstatus' });
    status.setAttribute('aria-live', 'polite');

    const draw = () => {
      stage.dataset.back = o.back;
      if (!src || mine !== job) return;
      const out = knock(area(), o);
      canvas.width = out.width; canvas.height = out.height;
      canvas.getContext('2d').putImageData(out, 0, 0);
    };

    const inv = el('input', { type: 'checkbox' });
    inv.addEventListener('change', () => { o.invert = inv.checked; draw(); });
    const save = el('button', { type: 'button', className: 'btn p', textContent: 'Download PNG' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      status.textContent = 'Preparing the full size file';
      const full = await big();
      saveCanvas(knock(cropData(full, region), o), 'gfxwrld-' + it.id + '-cut.png', status, () => { save.disabled = false; });
    });
    const cropNote = el('p', { className: 'cutstatus', hidden: true, textContent: 'Working on your crop only.' });

    const backSeg = seg('Preview on', ['Grid', 'Black', 'White'], o.back, (v) => { o.back = v; draw(); });
    const inkSeg = seg('Colour', ['Original', ...Object.keys(INKS)], o.ink, (v) => { o.ink = v; o.back = BACK_FOR_INK[v]; backSeg.set(o.back); draw(); });
    const tools = el('div', { className: 'cuttools', hidden: true }, [
      cropNote,
      seg('Style', ['Soft', 'Hard', 'Halftone'], o.mode, (v) => { o.mode = v; draw(); }).node,
      inkSeg.node,
      backSeg.node,
      el('label', { className: 'chk' }, [inv, 'Background is dark']),
      save,
      status,
    ]);

    /* Crop */
    const cc = el('canvas', { className: 'cropcanvas' });
    const cstage = el('div', { className: 'cropstage', hidden: true }, [cc]);
    const cstatus = el('p', { className: 'cutstatus' });
    cstatus.setAttribute('aria-live', 'polite');
    const readout = el('p', { className: 'cropsize' });
    let ratio = 0, flipped = false;
    // The box in preview pixels while it is being edited.
    let box = null;
    const W = () => src.width, H = () => src.height;
    const toRegion = () => {
      const whole = box.x <= 0.5 && box.y <= 0.5 && box.w >= W() - 1 && box.h >= H() - 1;
      region = whole ? null : { x: box.x / W(), y: box.y / H(), w: box.w / W(), h: box.h / H() };
      cropNote.hidden = !region;
    };
    const fullSize = () => {
      const fw = it.width || W(), fh = it.height || H();
      const s = Math.min(1, EXPORT_MAX / Math.max(fw, fh));
      return [fw * s, fh * s];
    };
    const showSize = () => {
      const [fw, fh] = fullSize();
      const w = Math.round(fw * box.w / W()), h = Math.round(fh * box.h / H());
      readout.textContent = w + ' x ' + h + ' px. Prints ' + (w / 300).toFixed(1) + ' x ' + (h / 300).toFixed(1) + ' in at 300 dpi';
    };
    // The largest box of the chosen shape, centred.
    const fitBox = () => {
      const r = ratio && (flipped ? 1 / ratio : ratio);
      let w = W(), h = H();
      if (r) { if (w / h > r) w = h * r; else h = w / r; }
      box = { x: (W() - w) / 2, y: (H() - h) / 2, w, h };
    };
    const paint = () => {
      if (!src || mine !== job) return;
      cc.width = W(); cc.height = H();
      const g = cc.getContext('2d');
      g.drawImage(srcCanvas, 0, 0);
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillRect(0, 0, W(), box.y);
      g.fillRect(0, box.y + box.h, W(), H() - box.y - box.h);
      g.fillRect(0, box.y, box.x, box.h);
      g.fillRect(box.x + box.w, box.y, W() - box.x - box.w, box.h);
      const px = W() / (cc.getBoundingClientRect().width || W());
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = px;
      for (let i = 1; i < 3; i++) {
        g.beginPath(); g.moveTo(box.x + box.w * i / 3, box.y); g.lineTo(box.x + box.w * i / 3, box.y + box.h); g.stroke();
        g.beginPath(); g.moveTo(box.x, box.y + box.h * i / 3); g.lineTo(box.x + box.w, box.y + box.h * i / 3); g.stroke();
      }
      g.strokeStyle = '#dcef6f';
      g.lineWidth = 2 * px;
      g.strokeRect(box.x, box.y, box.w, box.h);
      g.fillStyle = '#dcef6f';
      const k = 12 * px;
      [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].forEach(([x, y]) => g.fillRect(x - k / 2, y - k / 2, k, k));
      showSize();
    };

    // Dragging: a corner resizes from the opposite corner, inside the box moves
    // it, and outside the box starts a new one. Pointer events cover mouse,
    // touch and pen.
    let drag = null;
    const at = (e) => {
      const b = cc.getBoundingClientRect();
      return { x: (e.clientX - b.left) * W() / b.width, y: (e.clientY - b.top) * H() / b.height, px: W() / b.width };
    };
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    cc.addEventListener('pointerdown', (e) => {
      if (!box) return;
      const p = at(e);
      const reach = 22 * p.px;
      const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]];
      const hit = corners.findIndex(([x, y]) => Math.abs(p.x - x) < reach && Math.abs(p.y - y) < reach);
      if (hit >= 0) {
        const [ox, oy] = corners[3 - hit];
        drag = { kind: 'size', ax: ox, ay: oy };
      } else if (p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h) {
        drag = { kind: 'move', dx: p.x - box.x, dy: p.y - box.y };
      } else {
        drag = { kind: 'size', ax: clamp(p.x, 0, W()), ay: clamp(p.y, 0, H()), fresh: true };
      }
      cc.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    cc.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = at(e);
      if (drag.kind === 'move') {
        box.x = clamp(p.x - drag.dx, 0, W() - box.w);
        box.y = clamp(p.y - drag.dy, 0, H() - box.h);
      } else {
        const r = ratio && (flipped ? 1 / ratio : ratio);
        const sx = p.x >= drag.ax ? 1 : -1, sy = p.y >= drag.ay ? 1 : -1;
        const maxW = sx > 0 ? W() - drag.ax : drag.ax, maxH = sy > 0 ? H() - drag.ay : drag.ay;
        let w = Math.abs(p.x - drag.ax), h = Math.abs(p.y - drag.ay);
        if (r) {
          w = Math.max(w, h * r); h = w / r;
          if (w > maxW) { w = maxW; h = w / r; }
          if (h > maxH) { h = maxH; w = h * r; }
        } else { w = Math.min(w, maxW); h = Math.min(h, maxH); }
        const min = 12 * p.px;
        if (w < min || h < min) { if (drag.fresh) return; w = Math.max(w, min); h = r ? w / r : Math.max(h, min); }
        box = { x: sx > 0 ? drag.ax : drag.ax - w, y: sy > 0 ? drag.ay : drag.ay - h, w, h };
      }
      paint();
    });
    const end = () => { if (drag) { drag = null; toRegion(); } };
    cc.addEventListener('pointerup', end);
    cc.addEventListener('pointercancel', end);

    const flip = el('button', { type: 'button', className: 'btn g small', textContent: 'Turn sideways', disabled: true });
    const shapeSeg = seg('Shape', Object.keys(RATIOS), 'Free', (v) => {
      ratio = RATIOS[v]; flipped = false; flip.disabled = !ratio || ratio === 1;
      fitBox(); toRegion(); paint();
    });
    flip.addEventListener('click', () => { flipped = !flipped; fitBox(); toRegion(); paint(); });
    const reset = el('button', { type: 'button', className: 'btn g small', textContent: 'Reset' });
    reset.addEventListener('click', () => { ratio = 0; flipped = false; flip.disabled = true; shapeSeg.set('Free'); fitBox(); toRegion(); paint(); });
    const csave = el('button', { type: 'button', className: 'btn p', textContent: 'Download crop' });
    csave.addEventListener('click', async () => {
      csave.disabled = true;
      cstatus.textContent = 'Preparing the full size file';
      const full = await big();
      saveCanvas(cropData(full, region), 'gfxwrld-' + it.id + '-crop.png', cstatus, () => { csave.disabled = false; });
    });
    const toCut = el('button', { type: 'button', className: 'btn g', textContent: 'Remove background from crop' });
    const ctools = el('div', { className: 'cuttools', hidden: true }, [
      readout,
      shapeSeg.node,
      el('div', { className: 'croprow' }, [flip, reset]),
      csave,
      toCut,
      cstatus,
    ]);

    /* Tabs */
    const tabOrig = el('button', { type: 'button', textContent: 'Original' });
    const tabCrop = el('button', { type: 'button', textContent: 'Crop' });
    const tabCut = el('button', { type: 'button', textContent: 'Remove bg' });
    tabCut.setAttribute('aria-label', 'Remove background');
    const show = async (view) => {
      [[tabOrig, 'orig'], [tabCrop, 'crop'], [tabCut, 'cut']].forEach(([t, v]) => t.setAttribute('aria-pressed', String(v === view)));
      orig.hidden = view !== 'orig';
      cstage.hidden = ctools.hidden = view !== 'crop';
      stage.hidden = tools.hidden = view !== 'cut';
      if (view === 'orig') return;
      const ok = await ensure(view === 'crop' ? cstatus : status);
      if (!ok) { save.disabled = csave.disabled = toCut.disabled = true; return; }
      if (!box) fitBox();
      if (view === 'crop') paint(); else draw();
    };
    toCut.addEventListener('click', () => show('cut'));
    tabOrig.addEventListener('click', () => show('orig'));
    tabCrop.addEventListener('click', () => show('crop'));
    tabCut.addEventListener('click', () => show('cut'));
    tabOrig.setAttribute('aria-pressed', 'true');
    tabCrop.setAttribute('aria-pressed', 'false');
    tabCut.setAttribute('aria-pressed', 'false');

    orig.before(el('div', { className: 'cuttabs' }, [tabOrig, tabCrop, tabCut]));
    orig.after(cstage, ctools, stage, tools);
  }

  document.addEventListener('gfx:detail', (e) => mount(e.detail.item));
})();

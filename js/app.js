/*
 * Texture Designer - UI layer
 * Builds the control panel from a schema, keeps `params` in sync, and drives
 * live preview, seamless tiling preview, and PNG export.
 */
(function () {
  'use strict';

  // ----------------------------------------------------------- default params
  const params = {
    resolution: 512,
    seed: 1842,
    pattern: 'flagstone',
    density: 7,
    irregularity: 0.85,
    groutWidth: 0.07,
    groutDepth: 0.55,
    bevel: 0.35,
    heightVariation: 0.12,
    stoneColor: '#8d8474',
    groutColor: '#3a352e',
    colorVariation: 0.28,
    surfaceRoughness: 0.55,
    roughnessScale: 28,
    // moss
    mossOn: true, mossAmount: 0.32, mossColor: '#5e7038', mossScale: 5, mossEdgeBias: 0.75,
    // dirt
    dirtOn: true, dirtAmount: 0.35, dirtColor: '#2c241c', dirtScale: 4,
    // cracks
    cracksOn: false, cracksAmount: 0.45,
    // speckle
    speckleOn: true, speckleAmount: 0.18,
    // lighting
    lightAngle: 135, lightElevation: 42, relief: 1.0, ambient: 0.38
  };

  // presets tweak a subset of params on top of current values
  const presets = {
    'Mossy Flagstone': {
      pattern: 'flagstone', density: 5, irregularity: 0.9, groutWidth: 0.12, groutDepth: 0.6,
      bevel: 0.45, stoneColor: '#867d6c', groutColor: '#332f28', colorVariation: 0.3,
      mossOn: true, mossAmount: 0.6, mossEdgeBias: 0.8, dirtOn: true, dirtAmount: 0.4, cracksOn: false
    },
    'Cobblestone': {
      pattern: 'cobblestone', density: 9, irregularity: 0.75, groutWidth: 0.14, groutDepth: 0.65,
      bevel: 0.7, heightVariation: 0.22, stoneColor: '#7c7468', groutColor: '#2e2a24',
      colorVariation: 0.35, mossOn: true, mossAmount: 0.3, dirtOn: true, dirtAmount: 0.35, cracksOn: false
    },
    'Cracked Slate': {
      pattern: 'flagstone', density: 4, irregularity: 0.6, groutWidth: 0.07, groutDepth: 0.45,
      bevel: 0.25, stoneColor: '#5b5d63', groutColor: '#26262a', colorVariation: 0.22,
      mossOn: false, dirtOn: true, dirtAmount: 0.3, cracksOn: true, cracksAmount: 0.6
    },
    'Brick Path': {
      pattern: 'brick', density: 8, groutWidth: 0.1, groutDepth: 0.5, bevel: 0.3,
      heightVariation: 0.1, stoneColor: '#9c5a44', groutColor: '#46413a', colorVariation: 0.3,
      mossOn: true, mossAmount: 0.25, dirtOn: true, dirtAmount: 0.3, cracksOn: false
    },
    'Hex Pavers': {
      pattern: 'hex', density: 7, groutWidth: 0.07, groutDepth: 0.5, bevel: 0.3,
      heightVariation: 0.08, stoneColor: '#9a9384', groutColor: '#3c372f', colorVariation: 0.22,
      mossOn: true, mossAmount: 0.3, mossEdgeBias: 0.85, dirtOn: true, dirtAmount: 0.3,
      cracksOn: false, speckleOn: true
    },
    'Stone Tiles': {
      pattern: 'square', density: 5, groutWidth: 0.06, groutDepth: 0.4, bevel: 0.2,
      heightVariation: 0.05, stoneColor: '#b8b0a2', groutColor: '#4a463f', colorVariation: 0.15,
      mossOn: false, dirtOn: true, dirtAmount: 0.2, cracksOn: false, speckleOn: true
    }
  };

  // ----------------------------------------------------------------- schema
  // Each control maps to a key in `params`. type: range | color | select | toggle
  const schema = [
    {
      title: 'Tile', controls: [
        { key: 'resolution', label: 'Resolution', type: 'select',
          options: [['256', 256], ['512', 512], ['1024', 1024]] },
        { key: 'seed', label: 'Seed', type: 'seed' }
      ]
    },
    {
      title: 'Pattern', controls: [
        { key: 'pattern', label: 'Stone shape', type: 'select', options: [
          ['Flagstone', 'flagstone'], ['Cobblestone', 'cobblestone'],
          ['Hexagon', 'hex'], ['Brick', 'brick'], ['Square tiles', 'square'] ] },
        { key: 'density', label: 'Stone count', type: 'range', min: 2, max: 16, step: 1 },
        { key: 'irregularity', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'groutWidth', label: 'Mortar width', type: 'range', min: 0, max: 0.3, step: 0.005 },
        { key: 'groutDepth', label: 'Mortar depth', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'bevel', label: 'Edge bevel', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'heightVariation', label: 'Height variation', type: 'range', min: 0, max: 0.5, step: 0.01 }
      ]
    },
    {
      title: 'Surface', controls: [
        { key: 'stoneColor', label: 'Stone colour', type: 'color' },
        { key: 'groutColor', label: 'Mortar colour', type: 'color' },
        { key: 'colorVariation', label: 'Colour variation', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'surfaceRoughness', label: 'Roughness', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'roughnessScale', label: 'Roughness scale', type: 'range', min: 4, max: 64, step: 1 }
      ]
    },
    {
      title: 'Moss', toggle: 'mossOn', controls: [
        { key: 'mossAmount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'mossColor', label: 'Colour', type: 'color' },
        { key: 'mossScale', label: 'Patch scale', type: 'range', min: 2, max: 16, step: 1 },
        { key: 'mossEdgeBias', label: 'Grow in cracks', type: 'range', min: 0, max: 1, step: 0.01 }
      ]
    },
    {
      title: 'Dirt & stains', toggle: 'dirtOn', controls: [
        { key: 'dirtAmount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01 },
        { key: 'dirtColor', label: 'Colour', type: 'color' },
        { key: 'dirtScale', label: 'Patch scale', type: 'range', min: 2, max: 16, step: 1 }
      ]
    },
    {
      title: 'Cracks', toggle: 'cracksOn', controls: [
        { key: 'cracksAmount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01 }
      ]
    },
    {
      title: 'Speckle', toggle: 'speckleOn', controls: [
        { key: 'speckleAmount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01 }
      ]
    },
    {
      title: 'Lighting', controls: [
        { key: 'lightAngle', label: 'Light angle', type: 'range', min: 0, max: 360, step: 1 },
        { key: 'lightElevation', label: 'Light height', type: 'range', min: 5, max: 90, step: 1 },
        { key: 'relief', label: 'Relief strength', type: 'range', min: 0, max: 3, step: 0.05 },
        { key: 'ambient', label: 'Ambient light', type: 'range', min: 0, max: 1, step: 0.01 }
      ]
    }
  ];

  // ----------------------------------------------------------------- DOM refs
  const tileCanvas = document.createElement('canvas'); // full-res working canvas
  let mainCanvas, tileView, controlsEl, statusEl;
  const inputRefs = {}; // key -> {el, valueEl}

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // -------------------------------------------------------------- build UI
  function buildControls() {
    controlsEl.innerHTML = '';
    schema.forEach(section => {
      const sec = el('div', 'section');
      const head = el('div', 'section-head');
      const titleWrap = el('div', 'section-title');

      if (section.toggle) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'section-toggle';
        cb.checked = !!params[section.toggle];
        cb.addEventListener('change', () => {
          params[section.toggle] = cb.checked;
          sec.classList.toggle('disabled', !cb.checked);
          scheduleRender();
        });
        titleWrap.appendChild(cb);
        inputRefs[section.toggle] = { el: cb };
      }
      titleWrap.appendChild(el('span', null, section.title));
      head.appendChild(titleWrap);
      sec.appendChild(head);

      const body = el('div', 'section-body');
      section.controls.forEach(c => body.appendChild(buildControl(c)));
      sec.appendChild(body);
      if (section.toggle && !params[section.toggle]) sec.classList.add('disabled');
      controlsEl.appendChild(sec);
    });
  }

  function buildControl(c) {
    const row = el('div', 'control');
    if (c.type === 'seed') {
      row.classList.add('seed-row');
      const lab = el('label', null, c.label);
      const wrap = el('div', 'seed-wrap');
      const input = document.createElement('input');
      input.type = 'number';
      input.value = params.seed;
      input.addEventListener('change', () => {
        params.seed = parseInt(input.value, 10) || 0;
        scheduleRender();
      });
      const btn = el('button', 'mini-btn', 'Randomise');
      btn.addEventListener('click', () => {
        params.seed = Math.floor(Math.random() * 100000);
        input.value = params.seed;
        scheduleRender();
      });
      inputRefs[c.key] = { el: input };
      wrap.appendChild(input); wrap.appendChild(btn);
      row.appendChild(lab); row.appendChild(wrap);
      return row;
    }

    if (c.type === 'select') {
      const lab = el('label', null, c.label);
      const sel = document.createElement('select');
      c.options.forEach(([txt, val]) => {
        const o = document.createElement('option');
        o.value = String(val); o.textContent = txt;
        if (String(params[c.key]) === String(val)) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        const raw = sel.value;
        params[c.key] = isNaN(Number(raw)) || c.key === 'pattern' ? raw : Number(raw);
        scheduleRender();
      });
      inputRefs[c.key] = { el: sel };
      row.appendChild(lab); row.appendChild(sel);
      return row;
    }

    if (c.type === 'color') {
      const lab = el('label', null, c.label);
      const input = document.createElement('input');
      input.type = 'color';
      input.value = params[c.key];
      input.addEventListener('input', () => {
        params[c.key] = input.value;
        scheduleRender();
      });
      inputRefs[c.key] = { el: input };
      row.appendChild(lab); row.appendChild(input);
      return row;
    }

    // range
    const top = el('div', 'control-top');
    const lab = el('label', null, c.label);
    const valEl = el('span', 'value', fmt(params[c.key]));
    top.appendChild(lab); top.appendChild(valEl);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = c.min; input.max = c.max; input.step = c.step;
    input.value = params[c.key];
    input.addEventListener('input', () => {
      params[c.key] = Number(input.value);
      valEl.textContent = fmt(params[c.key]);
      scheduleRender();
    });
    inputRefs[c.key] = { el: input, valueEl: valEl };
    row.appendChild(top); row.appendChild(input);
    return row;
  }

  function fmt(v) {
    if (typeof v !== 'number') return v;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  function buildPresets(container) {
    Object.keys(presets).forEach(name => {
      const b = el('button', 'preset-btn', name);
      b.addEventListener('click', () => applyPreset(name));
      container.appendChild(b);
    });
  }

  function applyPreset(name) {
    Object.assign(params, presets[name]);
    syncInputs();
    render();
  }

  // push params back into the DOM inputs (after preset / randomise)
  function syncInputs() {
    Object.keys(inputRefs).forEach(key => {
      const ref = inputRefs[key];
      if (!ref) return;
      if (ref.el.type === 'checkbox') {
        ref.el.checked = !!params[key];
        const sec = ref.el.closest('.section');
        if (sec) sec.classList.toggle('disabled', !params[key]);
      } else {
        ref.el.value = params[key];
      }
      if (ref.valueEl) ref.valueEl.textContent = fmt(params[key]);
    });
  }

  // -------------------------------------------------------------- rendering
  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) cancelAnimationFrame(renderTimer);
    statusEl.textContent = 'Generating...';
    renderTimer = requestAnimationFrame(() => {
      // double rAF so the status text paints before the heavy sync work
      requestAnimationFrame(render);
    });
  }

  function render() {
    const t0 = performance.now();
    TD.generate(params, tileCanvas);

    // main single-tile view
    mainCanvas.width = tileCanvas.width;
    mainCanvas.height = tileCanvas.height;
    mainCanvas.getContext('2d').drawImage(tileCanvas, 0, 0);

    // seamless tiling view (3x3)
    drawTiling();

    const ms = (performance.now() - t0).toFixed(0);
    statusEl.textContent = params.resolution + '\u00d7' + params.resolution + '  \u00b7  ' + ms + ' ms';
  }

  function drawTiling() {
    const ctx = tileView.getContext('2d');
    const size = tileView.width;
    const n = 3;
    const cell = size / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.drawImage(tileCanvas, x * cell, y * cell, cell, cell);
      }
    }
  }

  // -------------------------------------------------------------- export
  function exportPNG() {
    const link = document.createElement('a');
    link.download = 'path-texture-' + params.pattern + '-' + params.seed + '.png';
    link.href = tileCanvas.toDataURL('image/png');
    link.click();
  }

  // -------------------------------------------------------------- init
  function init() {
    mainCanvas = document.getElementById('main-canvas');
    tileView = document.getElementById('tile-canvas');
    controlsEl = document.getElementById('controls');
    statusEl = document.getElementById('status');

    buildControls();
    buildPresets(document.getElementById('presets'));
    document.getElementById('export-btn').addEventListener('click', exportPNG);
    document.getElementById('randomize-all').addEventListener('click', () => {
      params.seed = Math.floor(Math.random() * 100000);
      syncInputs();
      render();
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

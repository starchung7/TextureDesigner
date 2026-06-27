/*
 * Texture Designer - procedural texture engine
 * Generates seamlessly tileable stone-path textures.
 *
 * Pipeline (all operations wrap around tile edges so the result tiles cleanly):
 *   1. Pattern  -> stone cells + grout valleys (Voronoi or grid based)
 *   2. Height   -> relief map (stones raised, grout recessed, bevels, cracks)
 *   3. Albedo   -> base colour with per-stone variation + overlay effects
 *   4. Lighting -> directional shading derived from the height map (gives 3D look)
 *
 * Exposed as the global `TD` namespace (classic script, works over file://).
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- math utils
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function fract(x) { return x - Math.floor(x); }

  // integer hash -> [0,1)
  function hashi(i) {
    i = i | 0;
    i = (i ^ 61) ^ (i >>> 16);
    i = (i + (i << 3)) | 0;
    i = i ^ (i >>> 4);
    i = Math.imul(i, 0x27d4eb2d);
    i = i ^ (i >>> 15);
    return (i >>> 0) / 4294967296;
  }
  function hash2(x, y, seed) {
    return hashi((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791));
  }

  // ------------------------------------------------------- tileable value noise
  // freq must be an integer so the lattice wraps across [0,1).
  function vnoise(x, y, freq, seed) {
    const fx = x * freq, fy = y * freq;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ix0 = ((ix % freq) + freq) % freq;
    const iy0 = ((iy % freq) + freq) % freq;
    const ix1 = (ix0 + 1) % freq;
    const iy1 = (iy0 + 1) % freq;
    const v00 = hash2(ix0, iy0, seed);
    const v10 = hash2(ix1, iy0, seed);
    const v01 = hash2(ix0, iy1, seed);
    const v11 = hash2(ix1, iy1, seed);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
  }

  // fractal brownian motion (sum of tileable octaves) -> [0,1]
  function fbm(x, y, baseFreq, octaves, seed) {
    let sum = 0, amp = 0.5, f = baseFreq, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * vnoise(x, y, f, seed + o * 1013);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  // -------------------------------------------------------- tileable Voronoi
  // Returns nearest (f1) and second-nearest (f2) distances plus the wrapped
  // cell coordinates of the nearest feature point (for per-stone randomness).
  function voronoi(x, y, freq, jitter, seed) {
    const fx = x * freq, fy = y * freq;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let f1 = 1e9, f2 = 1e9, cellX = 0, cellY = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = ix + ox, gy = iy + oy;
        const wx = ((gx % freq) + freq) % freq;
        const wy = ((gy % freq) + freq) % freq;
        const jx = hash2(wx, wy, seed);
        const jy = hash2(wx, wy, seed + 7919);
        const px = gx + 0.5 + (jx - 0.5) * jitter;
        const py = gy + 0.5 + (jy - 0.5) * jitter;
        const dx = px - fx, dy = py - fy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
          f2 = f1; f1 = d; cellX = wx; cellY = wy;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return { f1: f1, f2: f2, cellX: cellX, cellY: cellY };
  }

  // ------------------------------------------------------- tileable hex grid
  // Regular hexagons via a (slightly stretched) offset lattice. Distances are
  // measured toroidally so the result always tiles. Returns f1/f2 in cell units
  // plus the wrapped cell coordinates of the nearest hex centre.
  function hexCell(u, v, cols) {
    let rows = Math.round(cols / 0.8660254); // sqrt(3)/2 -> ~regular hexes
    if (rows % 2) rows++;                     // even rows needed to wrap in y
    const dxu = 1 / cols, dyu = 1 / rows;
    const fx = u / dxu, fy = v / dyu;
    const jy = Math.floor(fy);
    let f1 = 1e9, f2 = 1e9, cX = 0, cY = 0;
    for (let oy = -1; oy <= 1; oy++) {
      const ry = jy + oy;
      const offset = (((ry % 2) + 2) % 2) === 1 ? 0.5 : 0; // shift odd rows
      const ci0 = Math.round(fx - offset);
      for (let ox = -1; ox <= 1; ox++) {
        const ci = ci0 + ox;
        let ddx = (ci + offset) * dxu - u; ddx -= Math.round(ddx);
        let ddy = ry * dyu - v; ddy -= Math.round(ddy);
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < f1) {
          f2 = f1; f1 = d;
          cX = ((ci % cols) + cols) % cols;
          cY = ((ry % rows) + rows) % rows;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return { f1: f1 * cols, f2: f2 * cols, cellX: cX, cellY: cY };
  }

  // ----------------------------------------------------------- colour helpers
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ----------------------------------------------------------- main generator
  function generate(params, outCanvas) {
    const W = params.resolution | 0;
    const H = W;
    const seed = params.seed | 0;
    const isVoronoi = params.pattern === 'flagstone' || params.pattern === 'cobblestone';
    const domed = params.pattern === 'cobblestone';

    const stoneRGB = hexToRgb(params.stoneColor);
    const groutRGB = hexToRgb(params.groutColor);
    const mossRGB = hexToRgb(params.mossColor);
    const dirtRGB = hexToRgb(params.dirtColor);

    const groutLevel = 1 - params.groutDepth;          // base height of mortar
    const bevelWidth = Math.max(0.0008, params.bevel * 0.12);
    const groutW = Math.max(0.001, params.groutWidth * 0.5);

    const heightArr = new Float32Array(W * H);
    const albedo = new Float32Array(W * H * 3);

    // --- pass 1: build height + albedo ------------------------------------
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const idx = y * W + x;

        // pattern -> stoneShape (0 grout .. 1 stone interior), border distance,
        // and per-cell random values
        let stoneShape, border, cellR1, cellR2, cellR3;

        if (isVoronoi) {
          const vo = voronoi(u, v, params.density, params.irregularity, seed);
          border = vo.f2 - vo.f1; // gap to neighbour, in cell units (density independent)
          cellR1 = hash2(vo.cellX, vo.cellY, seed + 101);
          cellR2 = hash2(vo.cellX, vo.cellY, seed + 211);
          cellR3 = hash2(vo.cellX, vo.cellY, seed + 333);
        } else if (params.pattern === 'hex') {
          const hx = hexCell(u, v, params.density);
          border = hx.f2 - hx.f1;
          cellR1 = hash2(hx.cellX, hx.cellY, seed + 101);
          cellR2 = hash2(hx.cellX, hx.cellY, seed + 211);
          cellR3 = hash2(hx.cellX, hx.cellY, seed + 333);
        } else {
          // grid based (brick / square)
          const isBrick = params.pattern === 'brick';
          // bricks are wider than tall (running bond): fewer columns, more rows
          const cols = isBrick ? Math.max(1, Math.round(params.density / 2)) : params.density;
          const rows = params.density;
          const ry = v * rows;
          const row = Math.floor(ry);
          const offset = params.pattern === 'brick' ? (row % 2) * 0.5 : 0;
          const rx = u * cols + offset;
          const col = Math.floor(rx);
          const fxp = rx - col;       // 0..1 within cell
          const fyp = ry - row;
          // distance to nearest cell edge in cell units (0..0.5), density independent
          border = Math.min(Math.min(fxp, 1 - fxp), Math.min(fyp, 1 - fyp));
          const wcol = ((col % cols) + cols) % cols;
          const wrow = ((row % rows) + rows) % rows;
          cellR1 = hash2(wcol, wrow, seed + 101);
          cellR2 = hash2(wcol, wrow, seed + 211);
          cellR3 = hash2(wcol, wrow, seed + 333);
        }

        stoneShape = smoothstep(groutW, groutW + bevelWidth, border);
        if (domed) stoneShape = Math.sin(stoneShape * Math.PI * 0.5); // bulge

        // --- height ---
        const surf = fbm(u, v, Math.max(1, Math.round(params.roughnessScale)), 4, seed + 555);
        const stoneTop = 1 + (cellR1 - 0.5) * params.heightVariation;
        let h = lerp(groutLevel, stoneTop, stoneShape);
        h += (surf - 0.5) * params.surfaceRoughness * 0.18 * (0.4 + 0.6 * stoneShape);

        // cracks (thin recessed lines that wander across stones)
        let crackDark = 0;
        if (params.cracksOn && stoneShape > 0.3) {
          const crackFreq = Math.max(2, Math.round(params.density * 3));
          const cv = voronoi(u, v, crackFreq, 1.0, seed + 9001);
          const cb = (cv.f2 - cv.f1);
          const cn = fbm(u, v, 6, 3, seed + 4242);
          const line = 1 - smoothstep(0.0, 0.05, cb);
          const mask = line * smoothstep(1 - params.cracksAmount, 1, cn);
          h -= mask * 0.25;
          crackDark = mask;
        }

        heightArr[idx] = h;

        // --- albedo ---
        // per-stone colour: brightness + small per-channel hue jitter
        const bright = 1 + (cellR1 - 0.5) * params.colorVariation * 1.1;
        const hueJ = (cellR2 - 0.5) * params.colorVariation * 60;
        let sr = clamp(stoneRGB[0] * bright + hueJ, 0, 255);
        let sg = clamp(stoneRGB[1] * bright, 0, 255);
        let sb = clamp(stoneRGB[2] * bright - hueJ, 0, 255);
        // fine grain on stone surface
        const grain = (surf - 0.5) * 60 * params.surfaceRoughness;
        sr = clamp(sr + grain, 0, 255);
        sg = clamp(sg + grain, 0, 255);
        sb = clamp(sb + grain, 0, 255);

        // grout colour with a touch of noise
        const gn = (fbm(u, v, 8, 2, seed + 77) - 0.5) * 30;
        let gr = clamp(groutRGB[0] + gn, 0, 255);
        let gg = clamp(groutRGB[1] + gn, 0, 255);
        let gb = clamp(groutRGB[2] + gn, 0, 255);

        let r = lerp(gr, sr, stoneShape);
        let g = lerp(gg, sg, stoneShape);
        let b = lerp(gb, sb, stoneShape);

        // --- overlay: dirt / stains (prefers grout & low areas) ---
        if (params.dirtOn) {
          const dn = fbm(u + 13.3, v - 5.1, Math.max(1, Math.round(params.dirtScale)), 4, seed + 1234);
          let dmask = smoothstep(0.55, 0.85, dn) * params.dirtAmount;
          dmask *= lerp(1, 0.45, stoneShape); // more in the cracks/grout
          r = lerp(r, dirtRGB[0], dmask);
          g = lerp(g, dirtRGB[1], dmask);
          b = lerp(b, dirtRGB[2], dmask);
        }

        // --- overlay: moss (grows in grout & damp low spots) ---
        if (params.mossOn) {
          const mn = fbm(u - 7.7, v + 9.2, Math.max(1, Math.round(params.mossScale)), 4, seed + 2468);
          const mn2 = fbm(u * 1.0 + 31.0, v + 17.0, Math.max(2, Math.round(params.mossScale * 3)), 3, seed + 8642);
          let mmask = smoothstep(0.5, 0.78, mn) * params.mossAmount;
          mmask *= lerp(1, (1 - stoneShape), params.mossEdgeBias); // edge bias toward grout
          mmask *= (0.6 + 0.4 * mn2); // break up with finer detail
          mmask = clamp(mmask, 0, 1);
          const mb = 0.75 + 0.5 * mn2; // moss brightness variation
          r = lerp(r, mossRGB[0] * mb, mmask);
          g = lerp(g, mossRGB[1] * mb, mmask);
          b = lerp(b, mossRGB[2] * mb, mmask);
          heightArr[idx] += mmask * 0.04; // moss adds slight bumpiness
        }

        // --- overlay: speckle grain ---
        if (params.speckleOn) {
          const sp = (hash2(x * 2 + 1, y * 2 + 1, seed + 31) - 0.5) * 110 * params.speckleAmount;
          r = clamp(r + sp, 0, 255);
          g = clamp(g + sp, 0, 255);
          b = clamp(b + sp, 0, 255);
        }

        // darken cracks in albedo
        if (crackDark > 0) {
          const f = 1 - crackDark * 0.55;
          r *= f; g *= f; b *= f;
        }

        albedo[idx * 3] = r;
        albedo[idx * 3 + 1] = g;
        albedo[idx * 3 + 2] = b;
      }
    }

    // --- pass 2: lighting from height map (wrapped neighbours) -------------
    const out = outCanvas;
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const ang = params.lightAngle * Math.PI / 180;
    const elev = params.lightElevation * Math.PI / 180;
    const lx = Math.cos(ang) * Math.cos(elev);
    const ly = Math.sin(ang) * Math.cos(elev);
    const lz = Math.sin(elev);
    const relief = params.relief * 2.0;
    const amb = params.ambient;

    for (let y = 0; y < H; y++) {
      const yU = (y - 1 + H) % H;
      const yD = (y + 1) % H;
      for (let x = 0; x < W; x++) {
        const xL = (x - 1 + W) % W;
        const xR = (x + 1) % W;
        const idx = y * W + x;

        const hL = heightArr[y * W + xL];
        const hR = heightArr[y * W + xR];
        const hU = heightArr[yU * W + x];
        const hD = heightArr[yD * W + x];

        let nx = (hL - hR) * relief;
        let ny = (hU - hD) * relief;
        let nz = 1.0;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= inv; ny *= inv; nz *= inv;

        let diff = nx * lx + ny * ly + nz * lz;
        if (diff < 0) diff = 0;
        let shade = amb + (1 - amb) * diff;

        // subtle specular highlight on raised stone faces
        const spec = Math.pow(diff, 18) * 0.25;

        const o = idx * 4;
        data[o] = clamp(albedo[idx * 3] * shade + spec * 255, 0, 255);
        data[o + 1] = clamp(albedo[idx * 3 + 1] * shade + spec * 255, 0, 255);
        data[o + 2] = clamp(albedo[idx * 3 + 2] * shade + spec * 255, 0, 255);
        data[o + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return out;
  }

  global.TD = { generate: generate };
})(window);

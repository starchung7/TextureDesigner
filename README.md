# Texture Designer

A browser-based tool for designing **seamlessly tileable** stone-path textures for
your interactive portfolio. Everything is generated procedurally in the browser,
so you can dial in a look and export a PNG that tiles perfectly across a floor or
pathway.

## Run it

No build step, no server required. Just open the file:

```
index.html
```

Double-click it (or drag it into a browser). It runs entirely client-side from
`file://`.

> Tip: if your browser is strict about local files, serve the folder instead:
> `npx http-server .` or `python -m http.server`, then open the shown URL.

## What it does

- **Seamless tiling** — every layer (noise, stone cells, mortar, effects, lighting)
  wraps around the tile edges, so the texture repeats with no visible seams.
- **Live preview** — a single tile plus a 3×3 seamless preview update as you tweak.
- **PNG export** — download the current tile at 256 / 512 / 1024 px.

### Patterns

- **Flagstone** — irregular fitted stones
- **Cobblestone** — smaller, rounded/domed stones
- **Hexagon** — regular hex pavers
- **Brick** — running-bond brick layout
- **Square tiles** — regular grid

### Overlay effects (toggle each on/off)

- **Moss** — grows in the mortar / low spots (with a "grow in cracks" bias)
- **Dirt & stains** — grime that settles into the grout
- **Cracks** — thin recessed fractures across the stones
- **Speckle** — fine mineral grain

Plus full control over stone/mortar colours, colour variation, surface roughness,
edge bevel, per-stone height variation, and a directional **lighting** rig (angle,
height, relief strength, ambient) that gives the texture its 3D relief.

## How it works

The engine (`js/texture.js`) builds two maps per pixel — a **height** map and an
**albedo** (colour) map — using tileable value noise and a toroidal (wrap-around)
Voronoi/grid pattern. A second pass derives surface normals from the height map and
applies directional lighting, which produces the beveled, recessed-mortar relief.

## Files

```
index.html        markup + layout
styles.css        dark UI theme
js/texture.js     procedural generation engine (TD.generate)
js/app.js         schema-driven controls, preview, export
```

## Using the textures

Export a PNG and use it as a tiling/repeating material. In CSS:

```css
.path { background-image: url("path-texture-flagstone-1842.png"); background-repeat: repeat; }
```

In Three.js, load it as a texture and set `wrapS = wrapT = THREE.RepeatWrapping`.

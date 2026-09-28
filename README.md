# Nortiqa Lab — site redesign

A redesign of a company site, built as eight static pages with **no
dependencies, no build step and no framework**. The hero is a WebGL scene
written against the raw API — 697 lines of it — and the whole thing opens from
the filesystem with a double click.

## Production status

This redesign is the live public site at `https://nortiqalab.com`. Production
serves the static files through the `nortiqa-newweb` container. The production
branch removes the preview `noindex` directive and publishes `robots.txt` and
`sitemap.xml` for normal indexing.

The commit tagged `prod-nortiqalab-2026-09-29-1` was verified file by file
against the deployed site on 2026-09-29. Deployments must originate from this
repository and preserve a recoverable backup and an auditable commit reference.

## Why it is built this way

A brochure site does not need a toolchain. It needs to load fast, keep working
in five years, and be editable by whoever inherits it. So: plain HTML, one
stylesheet, seven JavaScript modules, and fonts served from the repo.

2,254 lines of hand-written JavaScript:

| Module | Lines | What it draws |
|---|---|---|
| `scene.js` | 697 | The WebGL hero: a grid of tiles on a polished plane, one lit in gold, following the cursor |
| `haz.js` | 325 | Light beams over the grid |
| `tablero.js` | 227 | The method boards |
| `volanta.js` | 188 | The terminal strapline in the hero |
| `onda.js` | 157 | The background wave |
| `terminal.js` | 153 | The architecture terminal |
| `marcas.js` | 80 | Logo carousel |

## The interesting problems

### You cannot measure GPU headroom with frame rate

`requestAnimationFrame` is gated by vsync: it delivers a frame every 16.7 ms
whether the GPU spent 2 ms or 15. Reading a steady 60 fps therefore says
nothing about how much capacity is left, and **any adaptive-quality controller
that raises quality while watching fps is raising blind** until it overshoots.

So quality is not derived from fps. The scene gets a fixed budget:

```js
const PRESUPUESTO = 620000;   // pixels per frame the scene may spend

const base = Math.sqrt(PRESUPUESTO / (width * dpr * height * dpr));
escala = Math.min(0.85, base) * calidad;
```

The render scale falls out of the budget, which makes it resolution
independent — a 4K panel is four times the work of a laptop at the same
fraction, so the same constant automatically buys a smaller scale there. The
controller on top of it (`calidad`) is only allowed to **reduce**.

### The cursor has to be raycast, because the geometry is not in the DOM

The grid lives in a shader. Nothing about it exists as an element, so there is
no `elementFromPoint` to ask. Finding the tile under the pointer means
replicating the shader's camera in JavaScript and projecting a ray onto the
plane.

Which creates the failure this code is arranged to avoid: **the camera is
defined exactly once**, in a single object whose values are injected into the
GLSL when the shader is built and read by the raycast. Two copies that drift
produce a scene where the lit tile sits slightly off from the mouse, and
nothing in the output says why.

### No ES modules, on purpose

The site has to open over `file://`, and browsers block module imports there as
a cross-origin request. Classic scripts with `defer` instead — the constraint
is the reason, not an oversight.

## Third-party assets

Everything not written here is declared in `source-manifest.json` with its
license and a sha256: Hanken Grotesk and JetBrains Mono (OFL 1.1), Lucide icons
(ISC), Simple Icons and gilbarbara logos (CC0). Fonts are served from
`assets/fonts/`, so the site makes no third-party requests at runtime.

## Running it

Clone and open `index.html`. There is nothing to install and nothing to build.

## Use

The code is published to be read. The brand — name, palette, logotype and copy —
belongs to Nortiqa Lab and is not offered for reuse.

Source comments are in Spanish, the language the site and its team work in.

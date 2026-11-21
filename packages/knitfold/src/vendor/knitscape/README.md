# knitscape's yarn simulation, in lattice (and knitfold)

(knitfold's copy is lattice's `packages/lattice/vendor/knitscape`, the parts
it needs to lay out and relax a yarn without drawing it: the topology, the
layout, the relaxation, the spline. knitfold draws the yarn flat, in 2d.)

Hannah Twigg-Smith's
[knitscape](https://github.com/knitscape/knitscape), `unified` branch, at
`fdcfd1810cd04fa47605b67abfebde70582c72da`: its contact-node topology
(knitbit's), the yarn relaxation, and the noodle and fibre renderers (with
the ambient occlusion and fibres she ported from chainstitch). MIT, as
`LICENSE` here says.

the folders are hers: `shared/` is her `shared/`, `knitbit/simulation/` her
`knitbit/src/simulation/`. it was typescript; the types were stripped
(node's `stripTypeScriptTypes`, then prettier as it comes), so it's her code,
comments and all, and can be diffed against hers.

what lattice changed, besides imports (`@shared/…` to relative paths, with
`.js`):

- `shared/opData.js`: only `Op` and `BACK_OPS` (hers makes chart symbols as
  it loads, `Path2D`s, which a worker hasn't got)
- `shared/simulation/fiber.js`: `FiberYarn`'s constructor assigns `gl` and
  `radius` itself (typescript's parameter properties don't strip)
- `knitbit/simulation/topology.js`: a program with `castOn: false` starts
  from empty needles (hers always has a loop on every front needle to start)
- `shared/simulation/renderer.js`: `createNoodleRenderer()`, a renderer for
  each canvas (hers is the module's, one a page), with a `destroy()`
- `shared/simulation/relaxationDriver.js`: a renderer of its own, and the
  worker made by `options.createWorker(url)` if it's given (lattice's
  `moduleWorker`, for when the package is from another origin)
- `shared/simulation/spline.js`: the distances between control points are
  at least `MIN_SPAN`, so a point given twice running doesn't make NaN (and
  the fibre renderer, given one, draws nothing)

knitfold's copy has the laying out and relaxing (topology, layout,
relaxation, spline), and the renderer (renderer, fiber, ambientOcclusion,
webgl, camera, mat4), as lattice has them, but for one thing:

- `shared/simulation/renderer.js`: `setBackground([r, g, b])`, the colour
  it clears to (hers is a dark grey), so the yarn's on knitfold's paper
- `shared/simulation/camera.js`: `pan(dx, dy)`, moving it as a right-drag
  would (knitfold scrolls with it), `zoom(factor, toward)` (knitfold's pinch:
  hers is for a mouse wheel, and a trackpad's pinch barely moves it), and `rayAt(x, y, aspect)`, the ray
  through a point of the canvas (to find which block a click's on), and
  `distance` and `fov`; `renderer.camera` gives it out
- `shared/simulation/renderer.js` and `fiber.js`: `setYarnColor(index,
  colour)`, a yarn recoloured where it is (knitfold's picked block's line)
- `shared/simulation/camera.js`: `turnAround()` (knitfold's flip) and
  `azimuth`; `renderer.js`: its light on whichever side the camera is, the
  front's or the back's (hers is always the front's, so the back's dark)

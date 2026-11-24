# knitfold

knit a scarf in blocks of code, in patchwork. a scarf's a stack of blocks;
each block's a little program, run for every stitch the way
[tixy](https://tixy.land) runs for every dot, that says which technique
that stitch is: `f` front, `g` garter, `s` seed, `r` reverse, `r1` `r2` `r3`
ribs, `sl` slip (or `true` for a purl); and `t`, the time, for fun (the
chart moves; what's knitted is `t` at 0). knitfold makes the scarf's knitout (`.k`) for the
kniterate. the picked block's a chart on the left, over its code (each
block's code is its own .js, in patchwork's file tool); the whole scarf's in
the middle in yarn, settled as knitscape settles it, plated if you like; the
toolbar's down the right.

- [`packages/knitfold`](packages/knitfold): the package. a `knitfold`
  datatype and tool (installable in any patchwork), the site's frame, and
  its themes (paper and night, and chee.party's). solid 2, bundled into the
  package (patchwork's import map has solid 1); built with vite into its
  `dist`.
- `src/main.ts`, `vite.config.ts`: the site, which boots patchwork with
  pkg-base's packages and knitfold's.

```
pnpm install
pnpm dev     # builds knitfold, rebuilds it as it changes, and serves the site
pnpm test
pnpm build
```

a block (or a few, the first knitted first) as a knitout.js pattern for
lattice, that writes the .k knitfold would:

```
cd packages/knitfold
node scripts/lattice.ts tiger.js --colour '#ff48b0' > tiger.knitout.js
pbpaste | node scripts/lattice.ts - --width 48 --height 96 | pbcopy
```

## who made it

- **the yarn** is Hannah Twigg-Smith's
  [knitscape](https://github.com/knitscape/knitscape): its contact-node
  topology and its yarn relaxation (MIT), carried over from lattice, in
  `packages/knitfold/src/vendor/knitscape`.
- **the techniques** and idea comes from work by [Agnes Cameron](http://agnescameron.info/)
- **the colours** are riso inks on paper, and [chee.party](https://chee.party)'s;
  **Jost** is indestructible type's and **Fraunces** undercase type's (OFL),
  as lattice has them.
- **the icons** are [phosphor](https://phosphoricons.com)'s bold ones (MIT),
  and the toolbar's after skitch's, in lattice.

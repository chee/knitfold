# knitout.js

`evalJS.js` is lattice's copy (packages/knitoutjs/core/vendor in
lattice.patchwork.inkandswitch.com): the knitout frontend's `Writer`, and the
knitout live visualizer's way of running a knitout.js pattern, with lattice's
changes (each op's `;!source:` line, its globals, its errors' lines). knitfold
runs its knitout.js blocks with it. one change of knitfold's own, marked
`//knitfold:`: `options.globals` can be a function of the knitout library, so a
block's `k` is a writer made with it. its licence:

from the knitout live visualizer, https://github.com/textiles-lab/knitout-live-visualizer,
by way of https://github.com/agnescameron/knitout-visualizer-kniterate

```
MIT License

Copyright (c) 2018-2019

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

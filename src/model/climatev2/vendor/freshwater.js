// Not from the upstream repository: chaos-machine's own, under the same GPL-3.0 licence as the vendored files.
//
// The fresh water the sea takes in (mm per Earth month, on the core grid): its own rain less its evaporation, and the
// rivers — the land's rain less its evaporation, carried downhill to the coast and spread out as a plume of light
// water over the sea beyond. Where it is large the surface is fresh and light over salty water below: a barrier layer
// (Lukas & Lindstrom 1991; Vinayachandran, Murty & Ramesh Babu 2002), which the ocean stage reads.

import { gaussianSmooth } from './circulation.js';

// A river's fresh water spreads over the sea: the Ganges–Brahmaputra's low-salinity water covers the northern Bay of
// Bengal some 500–800 km from the delta (Vinayachandran et al. 2002; Akhil et al. 2014), the Amazon's farther
const PLUME_KM = 500;

// The rivers' water on the sea. Each land cell drains to the neighbour it was reached from in a priority flood from the
// coast (Barnes, Lehman & Mulla 2014): taken lowest first, so the water runs downhill, keeps to its side of each divide
// and crosses a flat or fills a pit toward its outlet; the coast's sea takes it, and the plume spreads it.
function riverRunoff(grid, landFrac, meanKm, runoff) {
    const { w, h, size } = grid;
    const land = (c) => landFrac[c] >= 0.5;
    const neighbours = (c) => {
        const j = (c / w) | 0, i = c - j * w, out = [];
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!dj && !di) continue;
            const jj = j + dj;
            if (jj < 0 || jj >= h) continue;
            out.push(jj * w + (((i + di) % w) + w) % w);
        }
        return out;
    };
    // (a binary heap of cells by their filled height)
    const heap = [], filled = new Float64Array(size).fill(Infinity);
    const push = (c) => {
        heap.push(c);
        for (let k = heap.length - 1; k > 0;) { const p = (k - 1) >> 1; if (filled[heap[p]] <= filled[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            for (let k = 0; ;) {
                const l = 2 * k + 1, r = l + 1;
                let m = k;
                if (l < heap.length && filled[heap[l]] < filled[heap[m]]) m = l;
                if (r < heap.length && filled[heap[r]] < filled[heap[m]]) m = r;
                if (m === k) break;
                [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
            }
        }
        return top;
    };
    const downstream = new Int32Array(size).fill(-1), visited = [];
    for (let c = 0; c < size; c++) if (!land(c)) { filled[c] = -Infinity; push(c); }
    while (heap.length) {
        const c = pop();
        if (land(c)) visited.push(c);
        for (const q of neighbours(c)) {
            if (!land(q) || filled[q] !== Infinity) continue;
            filled[q] = Math.max(meanKm[q], filled[c]);
            downstream[q] = c;
            push(q);
        }
    }
    const flow = new Float64Array(size), area = Float64Array.from({ length: size }, (_, c) => grid.rowArea[(c / w) | 0]);
    for (const c of visited) flow[c] = Math.max(0, runoff[c]) * area[c] * landFrac[c];
    const mouth = new Float64Array(size);
    // (the last reached first: every cell's water is in before it is handed on)
    for (let k = visited.length - 1; k >= 0; k--) {
        const c = visited[k], to = downstream[c];
        if (to < 0) continue;
        if (land(to)) flow[to] += flow[c]; else mouth[to] += flow[c];
    }
    const sea = Float64Array.from({ length: size }, (_, c) => (land(c) ? 0 : area[c])), tmp = new Float64Array(size);
    gaussianSmooth(grid, mouth, tmp, PLUME_KM);
    gaussianSmooth(grid, sea, tmp, PLUME_KM);
    const out = new Float64Array(size);
    for (let c = 0; c < size; c++) out[c] = !land(c) && sea[c] > 0 ? mouth[c] / sea[c] : 0;
    return out;
}

// P and E: the rain stage's rain and evaporation (K anchors × the core grid, mm a month of the planet's year)
export function seaFreshwater({ grid, surface, P, E, K, yearScale }) {
    const size = grid.size, pBar = new Float64Array(size), eBar = new Float64Array(size);
    for (let k = 0; k < K; k++) for (let c = 0; c < size; c++) { pBar[c] += P[k * size + c] / K; eBar[c] += E[k * size + c] / K; }
    const net = Float64Array.from(pBar, (p, c) => (p - eBar[c]) / yearScale);
    const rivers = riverRunoff(grid, surface.landFrac, surface.meanKm, net);
    const sea = (c) => surface.landFrac[c] < 0.5;
    return {
        total: Float64Array.from(net, (x, c) => (sea(c) ? x + rivers[c] : 0)),
        rivers: Float64Array.from(rivers, (x, c) => (sea(c) ? x : 0)),
        rain: Float64Array.from(pBar, (x, c) => (sea(c) ? x / yearScale : 0)),
        evaporation: Float64Array.from(eBar, (x, c) => (sea(c) ? x / yearScale : 0)),
    };
}

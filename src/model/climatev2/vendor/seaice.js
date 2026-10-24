// Not from the upstream repository: chaos-machine's own, under the same GPL-3.0 licence as the vendored files.
//
// The polar seas through the year, stepped month by month — the surface and sea-ice energy budget that the energy
// balance's harmonics (one heat store per place for the whole year) cannot carry. Each sea column holds an enthalpy
// E (J/m²): open water above seawater's freezing point T_f, E = C_w·(T − T_f), or sea ice h = −E/ICE_LATENT thick.
// Its surface:
//   • open water stores the heat (C_w);
//   • growing ice has no store at its surface — its temperature is where the air's balance meets the heat conducted
//     up through the ice from the water at T_f below, k·(T_f − T)/h (through its leads too), and the ice thickens by
//     what is conducted;
//   • melting ice holds its surface at 0 °C, and whatever reaches it melts it.
// The currents' heat enters the water, or the ice from below. (Wagner & Eisenman 2015, after Eisenman & Wettlaufer
// 2009; Semtner 1976's zero-layer ice.) The air's heat transport is implicit, solved with the surface each month on a
// coarser grid (SEA_ICE_GRID_DEG), the seas outside the polar ones held at the energy balance's own temperatures —
// so the polar seas, the land around them and the warmer seas agree each round (temperature.js pins its polar seas
// to these).

import { LatLonGrid, coarsenField, refineField } from './grid.js';
import { HelmholtzSolver } from './solver.js';

const SEA_ICE_GRID_DEG = 3;
const ICE_K = 2;                // W/m/K: sea ice's conductivity (Maykut & Untersteiner 1971: 2.03)
const SEA_FREEZE_C = -1.8;      // °C: where seawater freezes (salinity ≈ 34; UNESCO 1983) — the ice's base and the open
                                // water's coldest; its surface melts at 0 °C
const ICE_LATENT = 3.06e8;      // J/m³: ice's latent heat per volume, ρ_ice L_f = 917 × 3.34e5
const ICE_THIN_M = 0.05;        // m: thinner ice conducts as this (the thin-ice limit of k/h)
const ICE_SUBSTEPS = 30;        // the ice's own steps a month (about daily)
const MELT_PASSES = 3;          // solves a month at most to settle which ice is melting
// The pack is never whole: leads and the thin ice that refreezes them (1–2 % open water and 5–10 % thin ice in the
// Arctic winter, more in the Antarctic: Maykut 1982; Lindsay & Rothrock 1995) pass most of the ocean's heat to the
// winter air. So the pack conducts as LEAD_SHARE of thin ice beside the rest at its thickness, k/h per area.
const LEAD_SHARE = 0.05;
const conducts = (h) => (1 - LEAD_SHARE) * ICE_K / h + LEAD_SHARE * ICE_K / ICE_THIN_M;
const ONSET_C = 2;              // °C: a sea joins the polar seas where its coldest month is below this
const PIN = 1e6;                // W/m²/K: a temperature held — the seas outside, a melting surface at 0 °C
const SPIN_FRESH = 4;           // years stepped from a first guess …
const SPIN_WARM = 2;            // … and from the previous round's columns

/**
 * The polar seas' year. In (on the energy balance's grid g, NT sample times a year, sample-major): T (°C, the energy
 * balance's temperatures), F (W/m², each place's heating but the outgoing B·T and the currents'), q (W/m², the
 * currents' heat), landFrac; B, D, Dx (the energy balance's), uBar/vBar/gamma (its wind carrying, or null), Cw
 * (J/m²/K, the sea's mixed layer), H0 (m, ice thick enough to cover the sea), yearSeconds; E (the previous round's
 * columns on the coarse grid, or null). Out: { E, T (NT × G: the polar seas' surface temperatures), ice (NT × G:
 * their ice cover), weight (G: how much each place is one of them, 0–1), coarse grid's size }.
 */
export function polarSeas({ g, NT, T, F, q, landFrac, B, D, Dx, uBar, vBar, gamma, Cw, H0, yearSeconds, E }) {
    const ratio = Math.max(1, Math.round(SEA_ICE_GRID_DEG / g.step)), gc = new LatLonGrid(g.step * ratio, g.radiusM), G = g.size, Gc = gc.size;
    const sample = (field, k) => coarsenField(g, gc, ratio, field.subarray(k * G, (k + 1) * G));
    const Tc = [], Fc = [], qc = [];
    for (let k = 0; k < NT; k++) { Tc.push(sample(T, k)); Fc.push(sample(F, k)); qc.push(sample(q, k)); }
    const seaShare = coarsenField(g, gc, ratio, Float64Array.from(landFrac, (f) => 1 - f));
    const fresh = !(E && E.length === Gc);
    if (fresh) E = new Float64Array(Gc);
    const inR = new Uint8Array(Gc);
    for (let c = 0; c < Gc; c++) {
        let lo = Infinity; for (let k = 0; k < NT; k++) lo = Math.min(lo, Tc[k][c]);
        inR[c] = seaShare[c] >= 0.5 && (lo < ONSET_C || (!fresh && E[c] < 0)) ? 1 : 0;
        // (a first guess starts open, its water at the year's mean — or at freezing: the winters grow what ice they will)
        if (fresh) { let mean = 0; for (let k = 0; k < NT; k++) mean += Tc[k][c] / NT; E[c] = Cw * Math.max(0, mean - SEA_FREEZE_C); }
    }
    const solver = new HelmholtzSolver(gc, D, Dx);
    const uC = uBar && gamma ? coarsenField(g, gc, ratio, uBar) : null, vC = uBar && gamma ? coarsenField(g, gc, ratio, vBar) : null;
    const dt = yearSeconds / NT, years = fresh ? SPIN_FRESH : SPIN_WARM;
    const sr = new Float64Array(Gc), rhs = new Float64Array(Gc), Ts = new Float64Array(Gc), zero = new Float64Array(Gc), AT = new Float64Array(Gc), ATi = new Float64Array(Gc);
    const melt = new Uint8Array(Gc), Tout = new Float64Array(NT * Gc), iceOut = new Float64Array(NT * Gc);
    for (let y = 0; y < years; y++) for (let k = 0; k < NT; k++) {
        const k1 = (k + 1) % NT;
        const step = (pass) => {
            for (let c = 0; c < Gc; c++) {
                const Fm = (Fc[k][c] + Fc[k1][c]) / 2, qm = (qc[k][c] + qc[k1][c]) / 2;
                if (!inR[c]) { sr[c] = PIN; rhs[c] = PIN * Tc[k1][c]; continue; }
                if (pass === 0) melt[c] = 0;
                if (melt[c]) { sr[c] = PIN; rhs[c] = 0; }
                else if (E[c] >= 0) { sr[c] = Cw / dt + B; rhs[c] = Cw / dt * (SEA_FREEZE_C + E[c] / Cw) + Fm + qm; }
                else { const h = Math.max(ICE_THIN_M, -E[c] / ICE_LATENT); sr[c] = B + conducts(h); rhs[c] = Fm + conducts(h) * SEA_FREEZE_C; }
            }
            solver.setOperator(sr, zero, uC, vC, gamma);
            solver.solve(rhs, zero, Ts, zero.slice(), { tol: 1e-6 });
        };
        // (ice whose balance would warm its surface past freezing melts instead — held at 0 °C, solved again; and a
        // surface held so that turns out to be losing heat is not melting after all, and is let go)
        step(0);
        for (let pass = 1; pass <= MELT_PASSES; pass++) {
            let changed = false;
            if (pass > 1) solver.apply(Ts, zero, AT, ATi);
            for (let c = 0; c < Gc; c++) {
                if (!inR[c] || E[c] >= 0) continue;
                const Fm = (Fc[k][c] + Fc[k1][c]) / 2;
                if (!melt[c] && Ts[c] > 0) { melt[c] = 1; changed = true; }
                else if (melt[c] && pass > 1 && Fm + sr[c] * Ts[c] - AT[c] < 0) { melt[c] = 0; changed = true; }
            }
            if (!changed) break;
            step(pass);
        }
        // (what the air carries in: the operator less the column's own part, σT − A·T)
        solver.apply(Ts, zero, AT, ATi);
        for (let c = 0; c < Gc; c++) {
            if (!inR[c]) continue;
            const Fm = (Fc[k][c] + Fc[k1][c]) / 2, qm = (qc[k][c] + qc[k1][c]) / 2;
            if (E[c] >= 0 && !melt[c]) { E[c] = Cw * (Ts[c] - SEA_FREEZE_C); continue; }
            // (the ice through the month, day by day at the surface as solved: growing, it conducts k·T/h as it
            // thickens — thin ice fast, thick ice slowly, Stefan's law; melting at 0 °C, it takes what reaches it, Q —
            // its sunlight and what the air carries in — until it is gone, open water at freezing: the month was solved
            // with its surface at 0 °C)
            const Q = Fm + sr[c] * Ts[c] - AT[c], Tsurf = melt[c] ? 0 : Math.min(0, Ts[c]);
            for (let d = 0; d < ICE_SUBSTEPS && E[c] < 0; d++) {
                const h = Math.max(ICE_THIN_M, -E[c] / ICE_LATENT);
                E[c] = Math.min(0, E[c] + dt / ICE_SUBSTEPS * (melt[c] ? Q + qm : conducts(h) * (Tsurf - SEA_FREEZE_C) + qm));
            }
            Ts[c] = Tsurf;
        }
        if (y === years - 1) for (let c = 0; c < Gc; c++) {
            Tout[k1 * Gc + c] = Ts[c];
            const x = Math.min(1, Math.max(0, -E[c] / ICE_LATENT) / H0);
            iceOut[k1 * Gc + c] = inR[c] ? x * x * (3 - 2 * x) : 0;
        }
    }
    const outT = new Float64Array(NT * G), ice = new Float64Array(NT * G), weight = new Float64Array(G);
    for (let k = 0; k < NT; k++) {
        refineField(gc, g, ratio, Tout.subarray(k * Gc, (k + 1) * Gc), outT, k * G);
        refineField(gc, g, ratio, iceOut.subarray(k * Gc, (k + 1) * Gc), ice, k * G);
    }
    refineField(gc, g, ratio, Float64Array.from(inR), weight, 0);
    return { E, T: outT, ice, weight, coarse: Gc };
}

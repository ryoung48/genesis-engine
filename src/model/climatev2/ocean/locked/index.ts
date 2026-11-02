import type {
	LockedOcean,
	LockedOceanParams,
} from "@/model/climatev2/ocean/locked/types"

const MONTHS = 12
const SAMPLES = 12
// Without the Coriolis force to turn it, the sea's surface drifts downwind at a few hundredths of the wind's speed
// (Wu 1983: ≈ 3.5 % of the 10 m wind; 3 % the common rule)
const WIND_DRIFT = 0.03

// The currents of a locked planet's sea, downwind to its substellar point, and the heat they carry (the surface
// balance's ocean share, temperature.js), as the year's means
function estimate({
	ctx,
	circulation,
	temperature,
}: LockedOceanParams): LockedOcean {
	const G = ctx.grid.size
	const u = new Float32Array(G)
	const v = new Float32Array(G)
	const qflux = new Float32Array(G)
	const surf = temperature.lockedSurf
	for (let c = 0; c < G; c++) {
		if (ctx.surface.landFrac[c] >= 0.5) continue
		for (let m = 0; m < MONTHS; m++) {
			u[c] += (WIND_DRIFT * circulation.u[m * G + c]) / MONTHS
			v[c] += (WIND_DRIFT * circulation.v[m * G + c]) / MONTHS
		}
		if (surf)
			for (let s = 0; s < SAMPLES; s++)
				qflux[c] += surf.oceanQ[s * G + c] / SAMPLES
	}
	return { u, v, qflux, monthly: null }
}

export const CLIMATEV2_LOCKED_OCEAN = { estimate }

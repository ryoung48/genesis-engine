import type {
	LockedDeck,
	LockedDeckParams,
	LockedDeckRadiation,
	LockedDeckRadiationParams,
} from "@/model/climatev2/clouds/locked/types"
import { coarsenField } from "@/model/climatev2/vendor/grid.js"
import { lockedSunAt, orbitOf } from "@/model/climatev2/vendor/insolation.js"

const MONTHS = 12
// The substellar deck against Yang, Cowan & Abbot 2013 (CAM3, 1:1 locked, an M-star, no ocean currents; Table 1): a
// locked planet's albedo 0.45–0.47 at 1200–1400 W/m² (a hotter star's higher still) — this gives 0.47 on the locked
// Earth at 1 bar (climatev2-locked-budget diagnostic) — and its clouds' greenhouse 20–30 W/m² in the global mean —
// a longwave share of 0.32 gives 25 W/m² (0.5 gave 39)
const DECK_ALBEDO = 0.3
const DECK_LONGWAVE_SHARE = 0.32
const LAND_MOISTURE = 0.4
const WET_REFERENCE_C = 25
const MAGNUS_A = 17.67
const MAGNUS_B = 243.5

const vaporRatio = (c: number) => {
	const t = Math.max(-80, Math.min(60, c))
	return Math.exp(
		(MAGNUS_A * t) / (t + MAGNUS_B) -
			(MAGNUS_A * WET_REFERENCE_C) / (WET_REFERENCE_C + MAGNUS_B),
	)
}

function estimate({ ctx, temperatureMonthly }: LockedDeckParams): LockedDeck {
	const { grid, surface, options } = ctx
	const G = grid.size
	const orbit = orbitOf(options)
	const deck = new Float32Array(MONTHS * G)
	const q = new Float64Array(G)
	const mu = new Float64Array(G)
	for (let m = 0; m < MONTHS; m++) {
		lockedSunAt(grid.lat, grid.lon, orbit, m + 0.5, q, mu)
		for (let c = 0; c < G; c++) {
			const land = surface.landFrac[c]
			const supply = 1 - land * (1 - LAND_MOISTURE)
			deck[m * G + c] = Math.min(
				1,
				mu[c] * supply * vaporRatio(temperatureMonthly[m * G + c]),
			)
		}
	}
	return { deck }
}

function radiation({
	core,
	grid: g,
	ratio,
	orbit,
	clouds,
}: LockedDeckRadiationParams): LockedDeckRadiation {
	const G = g.size
	const out = {
		land: new Float64Array(MONTHS * G),
		sea: new Float64Array(MONTHS * G),
		landLongwave: new Float64Array(MONTHS * G),
		seaLongwave: new Float64Array(MONTHS * G),
	}
	const q = new Float64Array(G)
	for (let m = 0; m < MONTHS; m++) {
		lockedSunAt(g.lat, g.lon, orbit, m + 0.5, q, null)
		const deck = coarsenField(
			core,
			g,
			ratio,
			clouds.deck.subarray(m * core.size, (m + 1) * core.size),
		)
		for (let c = 0; c < G; c++) {
			const albedo = DECK_ALBEDO * deck[c]
			out.land[m * G + c] = albedo
			out.sea[m * G + c] = albedo
			const longwave = DECK_LONGWAVE_SHARE * albedo * q[c]
			out.landLongwave[m * G + c] = longwave
			out.seaLongwave[m * G + c] = longwave
		}
	}
	return out
}

export const CLIMATEV2_LOCKED_CLOUDS = { estimate, radiation }

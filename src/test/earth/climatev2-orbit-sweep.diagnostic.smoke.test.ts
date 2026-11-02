import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import type { PlanetClimateResult } from "@/model/climatev2/vendor/climate.js"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import type { ClimateOrbit } from "@/model/climatev2/vendor/insolation.js"
import { KOPPEN_CLASSES } from "@/model/climatev2/vendor/koppen.js"
import type { GenesisWorld } from "@/model/pipelines/types"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

const EARTH_AREA_MKM2 = 510.1
const GROUPS = ["A", "B", "C", "D", "E"]
const ICE_BANDS = [
	[75, 90],
	[60, 75],
	[45, 60],
	[30, 45],
	[15, 30],
	[0, 15],
	[-15, 0],
	[-30, -15],
	[-45, -30],
	[-60, -45],
	[-75, -60],
	[-90, -75],
] as const

// Worldbuilding Pasta 2026, "Climate Explorations: Planet Size": ExoPlaSim on Earth's terrain at Earth's surface
// pressure, radius from Fortney et al. 2007 (a third iron core), the starlight that keeps each near 15 °C (14.1–15.8)
const EXOPLASIM_WORLDS = [
	{ mass: 0.1, radius: 0.489, gravity: 0.418, sunlight: 0.904 },
	{ mass: 0.25, radius: 0.661, gravity: 0.572, sunlight: 0.932 },
	{ mass: 0.5, radius: 0.82, gravity: 0.743, sunlight: 0.965 },
	{ mass: 1, radius: 1, gravity: 1, sunlight: 1 },
	{ mass: 2, radius: 1.213, gravity: 1.359, sunlight: 1.035 },
	{ mass: 4, radius: 1.447, gravity: 1.91, sunlight: 1.079 },
	{ mass: 10, radius: 1.795, gravity: 3.105, sunlight: 1.131 },
] as const

// Worldbuilding Pasta 2025, "Climate Explorations: Pressure": ExoPlaSim on Earth's terrain with N₂ varied (O₂ and CO₂
// at Earth's partial pressures), the starlight that keeps each near 15 °C (14.1–15.9). Its global precipitation against
// 1 bar's: 200, 145, 117, 100, 81, 61, 42 %
const EXOPLASIM_PRESSURES = [
	{ bar: 0.1, sunlight: 1.356 },
	{ bar: 0.25, sunlight: 1.185 },
	{ bar: 0.5, sunlight: 1.069 },
	{ bar: 1, sunlight: 1 },
	{ bar: 2, sunlight: 0.943 },
	{ bar: 4, sunlight: 0.912 },
	{ bar: 10, sunlight: 0.911 },
] as const

function sweeps(base: ClimateOrbit) {
	const earthHours = 23.93447232
	const runs: { knob: string; value: number; orbit: ClimateOrbit }[] = []
	for (const value of [0, 0.0167, 0.05, 0.1, 0.2, 0.3])
		runs.push({
			knob: "eccentricity",
			value,
			orbit: { ...base, eccentricity: value },
		})
	for (const value of [0.1, 0.3])
		runs.push({
			knob: "eccentricity, perihelion in July",
			value,
			orbit: {
				...base,
				eccentricity: value,
				perihelion: base.perihelion + 180,
			},
		})
	for (const value of [6, 12, earthHours, 48, 96, 240])
		runs.push({
			knob: "sidereal day (h)",
			value,
			orbit: {
				...base,
				rotationRateRadS: base.rotationRateRadS * (earthHours / value),
			},
		})
	for (const value of [6, 12, earthHours, 48, 96, 240, 720, 2400])
		runs.push({
			knob: "day length (h)",
			value,
			orbit: {
				...base,
				rotationRateRadS: base.rotationRateRadS * (earthHours / value),
				solarDayScale: value / earthHours,
			},
		})
	for (const value of [0.25, 0.5, 1, 2, 4])
		runs.push({
			knob: "year (Earth years)",
			value,
			orbit: { ...base, yearScale: value },
		})
	for (const value of [0, 5, 15, 23.5, 30, 35, 40, 45, 60, 75, 90])
		runs.push({
			knob: "axial tilt (°)",
			value,
			orbit: { ...base, tiltDeg: value },
		})
	for (const value of [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2])
		runs.push({
			knob: "orbital distance (AU)",
			value,
			orbit: { ...base, sunScale: base.sunScale / value ** 2 },
		})
	for (const value of [0.8, 0.9, 0.95, 1, 1.05, 1.1, 1.2])
		runs.push({
			knob: "star luminosity (× Sol)",
			value,
			orbit: { ...base, sunScale: base.sunScale * value },
		})
	for (const world of EXOPLASIM_WORLDS) {
		const size = {
			...base,
			radiusScale: world.radius,
			gravityScale: world.gravity,
		}
		runs.push({ knob: "planet mass (M⊕)", value: world.mass, orbit: size })
		runs.push({
			knob: "planet mass (M⊕), ExoPlaSim's sunlight",
			value: world.mass,
			orbit: { ...size, sunScale: base.sunScale * world.sunlight },
		})
	}
	for (const world of EXOPLASIM_PRESSURES) {
		const air = { ...base, pressureScale: world.bar }
		runs.push({ knob: "surface pressure (bar)", value: world.bar, orbit: air })
		runs.push({
			knob: "surface pressure (bar), ExoPlaSim's sunlight",
			value: world.bar,
			orbit: { ...air, sunScale: base.sunScale * world.sunlight },
		})
	}
	for (const value of [0.5, 0.75, 1, 1.25, 1.5])
		runs.push({
			knob: "planet radius (R⊕), Earth's density",
			value,
			orbit: { ...base, radiusScale: value, gravityScale: value },
		})
	const only = process.env.SWEEP_KNOBS?.split("|")
	const values = process.env.SWEEP_VALUES?.split(",").map(Number)
	return runs.filter(
		(run) =>
			(!only || only.some((k) => run.knob.startsWith(k))) &&
			(!values || values.some((v) => Math.abs(v - run.value) < 1e-6)),
	)
}

function round(params: { value: number; digits: number }) {
	const { value, digits } = params
	return Number(value.toFixed(digits))
}

function summarize(params: {
	result: PlanetClimateResult
	landAmp: Float32Array
	landHot: Float32Array
	landCold: Float32Array
}) {
	const { result, landAmp, landHot, landCold } = params
	const { grid, surface, months, stages, cell } = result
	const { w, h, size } = grid
	const landFrac = surface.landFrac
	const annual = new Float64Array(size)
	const amp = new Float64Array(size)
	let globalT = 0
	let globalP = 0
	const warmest = new Float64Array(size)
	const coldest = new Float64Array(size)
	for (let c = 0; c < size; c++) {
		let lo = Infinity
		let hi = -Infinity
		for (let m = 0; m < 12; m++) {
			const t = months.T[m * size + c]
			annual[c] += t / 12
			lo = Math.min(lo, t)
			hi = Math.max(hi, t)
			globalP += grid.rowArea[(c / w) | 0] * months.P[m * size + c]
		}
		amp[c] = hi - lo
		warmest[c] = hi
		coldest[c] = lo
		globalT += grid.rowArea[(c / w) | 0] * annual[c]
	}
	const band = (p: {
		from: number
		to: number
		field: Float64Array
		surfaceKind: "all" | "land" | "sea"
	}) => {
		let s = 0
		let a = 0
		for (let j = 0; j < h; j++) {
			const la = grid.lat[j]
			if (la < p.from || la > p.to) continue
			for (let i = 0; i < w; i++) {
				const c = j * w + i
				const share =
					p.surfaceKind === "all"
						? 1
						: p.surfaceKind === "land"
							? landFrac[c]
							: 1 - landFrac[c]
				s += grid.rowArea[j] * share * p.field[c]
				a += grid.rowArea[j] * share
			}
		}
		return a > 0 ? s / a : Number.NaN
	}
	const monthField = (m: number) =>
		Float64Array.from(months.T.subarray(m * size, (m + 1) * size))
	const jan = monthField(0)
	const jul = monthField(6)
	const meanOf = (a: Float64Array, b: Float64Array) =>
		Float64Array.from(a, (v, c) => (v + b[c]) / 2)
	const solstices = meanOf(monthField(5), monthField(11))
	const equinoxes = meanOf(monthField(2), monthField(8))
	const highLand = (field: Float64Array) =>
		(band({ from: 45, to: 90, field, surfaceKind: "land" }) +
			band({ from: -90, to: -45, field, surfaceKind: "land" })) /
		2
	const tropics = band({ from: -10, to: 10, field: annual, surfaceKind: "all" })
	const poles =
		(band({ from: 70, to: 90, field: annual, surfaceKind: "all" }) +
			band({ from: -90, to: -70, field: annual, surfaceKind: "all" })) /
		2

	const belts = stages.circulation.belts
	let hadley = 0
	let itczMin = Infinity
	let itczMax = -Infinity
	for (const b of belts) {
		hadley += (b.hiN - b.hiS) / 2 / belts.length
		itczMin = Math.min(itczMin, b.itcz)
		itczMax = Math.max(itczMax, b.itcz)
	}
	const u = stages.circulation.u
	const uG = u.length / 12
	const uRows = uG / w
	const uZonal = new Float64Array(uRows)
	for (let m = 0; m < 12; m++)
		for (let c = 0; c < uG; c++) uZonal[(c / w) | 0] += u[m * uG + c] / (12 * w)
	const jet = (p: { north: boolean }) => {
		let best = { lat: Number.NaN, speed: -Infinity }
		for (let j = 0; j < uRows; j++) {
			const la = 90 - ((j + 0.5) * 180) / uRows
			if (p.north ? la < 15 || la > 80 : la > -15 || la < -80) continue
			if (uZonal[j] > best.speed) best = { lat: la, speed: uZonal[j] }
		}
		return best
	}
	let trades = 0
	let tradeRows = 0
	for (let j = 0; j < uRows; j++) {
		const la = 90 - ((j + 0.5) * 180) / uRows
		if (Math.abs(la) <= 15) {
			trades += uZonal[j]
			tradeRows++
		}
	}
	let jetsN = 0
	for (let j = 1; j < uRows - 1; j++) {
		const la = 90 - ((j + 0.5) * 180) / uRows
		if (la < 20 || la > 85) continue
		if (
			uZonal[j] > 0.5 &&
			uZonal[j] >= uZonal[j - 1] &&
			uZonal[j] > uZonal[j + 1]
		)
			jetsN++
	}
	let wind = 0
	for (let m = 0; m < 12; m++)
		for (let c = 0; c < uG; c++)
			wind +=
				(grid.rowArea[(c / w) | 0] *
					Math.hypot(u[m * uG + c], stages.circulation.v[m * uG + c])) /
				12
	const dtrLand = stages.temperature.diurnal?.land
	const dtrAnnual = new Float64Array(size)
	if (dtrLand)
		for (let m = 0; m < 12; m++)
			for (let c = 0; c < size; c++) dtrAnnual[c] += dtrLand[m * size + c] / 12
	const dayWind2 = stages.temperature.dayWind2
	const dayWindAnnual = new Float64Array(size)
	if (dayWind2)
		for (let m = 0; m < 12; m++)
			for (let c = 0; c < size; c++)
				dayWindAnnual[c] += dayWind2[m * size + c] / 12
	const jetN = jet({ north: true })
	const jetS = jet({ north: false })

	const seaIce = stages.temperature.seaIce
	const ice = { N: [] as number[], S: [] as number[] }
	if (seaIce.length === 12 * size)
		for (let m = 0; m < 12; m++) {
			let n = 0
			let s = 0
			for (let c = 0; c < size; c++) {
				const a =
					grid.rowArea[(c / w) | 0] *
					EARTH_AREA_MKM2 *
					(1 - landFrac[c]) *
					seaIce[m * size + c]
				if (grid.lat[(c / w) | 0] > 0) n += a
				else s += a
			}
			ice.N.push(n)
			ice.S.push(s)
		}

	const iceBands = ICE_BANDS.map(([from, to]) => {
		const months = Array.from({ length: 12 }, () => ({ ice: 0, sea: 0 }))
		let snow = 0
		let land = 0
		for (let c = 0; c < size; c++) {
			const la = grid.lat[(c / w) | 0]
			if (la < from || la >= to) continue
			const a = grid.rowArea[(c / w) | 0]
			land += a * landFrac[c]
			snow += a * landFrac[c] * stages.temperature.iceFrac[c]
			if (seaIce.length === 12 * size)
				for (let m = 0; m < 12; m++) {
					months[m].sea += a * (1 - landFrac[c])
					months[m].ice += a * (1 - landFrac[c]) * seaIce[m * size + c]
				}
		}
		const cover = months.map((m) => (m.sea > 0 ? (100 * m.ice) / m.sea : 0))
		return {
			band: `${from}..${to}`,
			seaIceMaxPct: round({ value: Math.max(...cover), digits: 1 }),
			seaIceMinPct: round({ value: Math.min(...cover), digits: 1 }),
			landSnowYearPct: round({
				value: land > 0 ? (100 * snow) / land : 0,
				digits: 1,
			}),
		}
	})

	const arcticSea = Array.from({ length: 12 }, () => ({ t: 0, a: 0 }))
	for (let c = 0; c < size; c++) {
		if (grid.lat[(c / w) | 0] < 75 || landFrac[c] > 0.1) continue
		const a = grid.rowArea[(c / w) | 0]
		for (let m = 0; m < 12; m++) {
			arcticSea[m].t += a * months.T[m * size + c]
			arcticSea[m].a += a
		}
	}
	const sheets = { N: 0, S: 0 }
	for (let c = 0; c < size; c++) {
		if (stages.temperature.iceFrac[c] < 0.95) continue
		const a = grid.rowArea[(c / w) | 0] * EARTH_AREA_MKM2 * landFrac[c]
		if (grid.lat[(c / w) | 0] > 0) sheets.N += a
		else sheets.S += a
	}

	const groups = new Map<string, number>(GROUPS.map((g) => [g, 0]))
	let landCells = 0
	let ampNH = 0
	let ampNHn = 0
	let ampTrop = 0
	let ampTropN = 0
	for (let r = 0; r < cell.koppen.length; r++) {
		if (!Number.isFinite(cell.tAnnual[r])) continue
		landCells++
		const g = KOPPEN_CLASSES[cell.koppen[r]].code[0]
		groups.set(g, (groups.get(g) ?? 0) + 1)
		const la = cell.lat[r]
		if (la >= 40 && la <= 70) {
			ampNH += landAmp[r]
			ampNHn++
		}
		if (Math.abs(la) <= 15) {
			ampTrop += landAmp[r]
			ampTropN++
		}
	}
	const pct = (n: number) => round({ value: (100 * n) / landCells, digits: 1 })
	const hot: number[] = []
	const cold: number[] = []
	let polarSummer = 0
	let polarN = 0
	for (let r = 0; r < cell.koppen.length; r++) {
		if (!Number.isFinite(cell.tAnnual[r])) continue
		hot.push(landHot[r])
		cold.push(landCold[r])
		if (Math.abs(cell.lat[r]) >= 60) {
			polarSummer += landHot[r]
			polarN++
		}
	}
	hot.sort((a, b) => a - b)
	cold.sort((a, b) => a - b)
	const at = (list: number[], q: number) =>
		list[Math.min(list.length - 1, Math.floor(q * list.length))]
	return {
		globalTC: round({ value: globalT, digits: 2 }),
		tropicsTC: round({ value: tropics, digits: 2 }),
		polesTC: round({ value: poles, digits: 2 }),
		equatorPoleC: round({ value: tropics - poles, digits: 2 }),
		equatorSolsticeC: round({
			value: band({ from: -10, to: 10, field: solstices, surfaceKind: "all" }),
			digits: 1,
		}),
		equatorEquinoxC: round({
			value: band({ from: -10, to: 10, field: equinoxes, surfaceKind: "all" }),
			digits: 1,
		}),
		highLandSummerC: round({ value: highLand(warmest), digits: 1 }),
		highLandWinterC: round({ value: highLand(coldest), digits: 1 }),
		southPoleSummerC: round({
			value: band({ from: -90, to: -80, field: warmest, surfaceKind: "land" }),
			digits: 1,
		}),
		landAmp40to70NC: round({ value: ampNH / ampNHn, digits: 2 }),
		landAmpTropicsC: round({ value: ampTrop / ampTropN, digits: 2 }),
		seaAmp40to70NC: round({
			value: band({ from: 40, to: 70, field: amp, surfaceKind: "sea" }),
			digits: 2,
		}),
		seaAmp40to70SC: round({
			value: band({ from: -70, to: -40, field: amp, surfaceKind: "sea" }),
			digits: 2,
		}),
		nhJulMinusJanC: round({
			value:
				band({ from: 30, to: 70, field: jul, surfaceKind: "all" }) -
				band({ from: 30, to: 70, field: jan, surfaceKind: "all" }),
			digits: 2,
		}),
		shJanMinusJulC: round({
			value:
				band({ from: -70, to: -30, field: jan, surfaceKind: "all" }) -
				band({ from: -70, to: -30, field: jul, surfaceKind: "all" }),
			digits: 2,
		}),
		globalPMmYr: round({ value: globalP, digits: 0 }),
		hadleyHalfWidthDeg: round({ value: hadley, digits: 1 }),
		beltsYearDeg: {
			itcz: round({
				value: belts.reduce((s, b) => s + b.itcz, 0) / belts.length,
				digits: 2,
			}),
			hiN: round({
				value: belts.reduce((s, b) => s + b.hiN, 0) / belts.length,
				digits: 2,
			}),
			hiS: round({
				value: belts.reduce((s, b) => s + b.hiS, 0) / belts.length,
				digits: 2,
			}),
		},
		beltsMonthlyDeg: belts.map((b) => [
			round({ value: b.hiS, digits: 1 }),
			round({ value: b.itcz, digits: 1 }),
			round({ value: b.hiN, digits: 1 }),
		]),
		itczRangeDeg: round({ value: itczMax - itczMin, digits: 1 }),
		jetNLatDeg: round({ value: jetN.lat, digits: 1 }),
		jetNMs: round({ value: jetN.speed, digits: 2 }),
		jetSLatDeg: round({ value: jetS.lat, digits: 1 }),
		jetSMs: round({ value: jetS.speed, digits: 2 }),
		tradesMs: round({ value: trades / tradeRows, digits: 2 }),
		jetsN,
		surfaceWindMs: round({ value: wind, digits: 2 }),
		landDtrC: round({
			value: band({ from: -90, to: 90, field: dtrAnnual, surfaceKind: "land" }),
			digits: 2,
		}),
		landDtrTropicsC: round({
			value: band({ from: -30, to: 30, field: dtrAnnual, surfaceKind: "land" }),
			digits: 2,
		}),
		dayWindRmsMs: round({
			value: Math.sqrt(
				band({ from: -90, to: 90, field: dayWindAnnual, surfaceKind: "all" }),
			),
			digits: 2,
		}),
		landHotP99C: round({ value: at(hot, 0.99), digits: 1 }),
		landColdP1C: round({ value: at(cold, 0.01), digits: 1 }),
		polarLandSummerC: round({
			value: polarN ? polarSummer / polarN : Number.NaN,
			digits: 1,
		}),
		seaIceNMaxMkm2: round({ value: Math.max(...ice.N), digits: 2 }),
		seaIceNMinMkm2: round({ value: Math.min(...ice.N), digits: 2 }),
		seaIceSMaxMkm2: round({ value: Math.max(...ice.S), digits: 2 }),
		seaIceSMinMkm2: round({ value: Math.min(...ice.S), digits: 2 }),
		arcticSeaMonthlyC: arcticSea.map((m) =>
			round({ value: m.a > 0 ? m.t / m.a : Number.NaN, digits: 1 }),
		),
		landIceNMkm2: round({ value: sheets.N, digits: 2 }),
		landIceSMkm2: round({ value: sheets.S, digits: 2 }),
		budget: stages.temperature.budget,
		iceBands,
		koppenPct: Object.fromEntries(
			GROUPS.map((g) => [g, pct(groups.get(g) ?? 0)]),
		),
	}
}

function runOne(params: { world: GenesisWorld; orbit: ClimateOrbit }) {
	const { world, orbit } = params
	const landAmp = new Float32Array(world.mesh.numRegions)
	const landHot = new Float32Array(world.mesh.numRegions)
	const landCold = new Float32Array(world.mesh.numRegions)
	const t0 = performance.now()
	const result = planetClimate(
		{
			xyz: world.mesh.r_xyz,
			elevKm: world.elevation_km,
			axes: "z-up",
			land: world.isLand,
		},
		{
			...orbit,
			seed: world.params.seed,
			greenhouseWm2: Number(process.env.SWEEP_GREENHOUSE_WM2 ?? 0),
			onCell: (...cell) => {
				const [r, T12] = cell
				let lo = Infinity
				let hi = -Infinity
				for (let m = 0; m < 12; m++) {
					lo = Math.min(lo, T12[m])
					hi = Math.max(hi, T12[m])
				}
				landAmp[r] = hi - lo
				landHot[r] = hi
				landCold[r] = lo
			},
		},
	)
	return {
		seconds: round({ value: (performance.now() - t0) / 1000, digits: 1 }),
		...summarize({ result, landAmp, landHot, landCold }),
	}
}

describe("climatev2 orbit sweep (diagnostic)", () => {
	it(
		"runs each orbit knob in isolation on Earth's terrain",
		{ timeout: 1_800_000 },
		() => {
			const world = CLIMATE_EARTH.importWorld()
			const base = CLIMATEV2_ORBIT.fromParams(world.params)
			const rows = sweeps(base).map((run) => {
				const stats = runOne({ world, orbit: run.orbit })
				console.log(`${run.knob} = ${run.value}: ${JSON.stringify(stats)}`)
				return { knob: run.knob, value: run.value, ...stats }
			})
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = path.join("stats", "climate", `${stamp}-orbit-sweep`)
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(
				path.join(dir, "results.json"),
				JSON.stringify({ base, rows }, null, 2),
			)
			expect(rows.length).toBeGreaterThan(0)
		},
	)
})

import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { PHYSICAL_CELLS_WIND } from "@/model/climate/weather/wind/full/physical-cells"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale } from "./assets"

// Earth-like equator-pole surface contrast and global mean, for the unit-level
// check below -- representative values, not read from a generated world.
const EARTH_DELTA_THETA_K = 40
const EARTH_THETA0_K = 288

describe("physical cell structure reacts to rotation rate", () => {
	it("Hadley width widens and band count shrinks as rotation slows (pure function)", () => {
		const hoursPerDaySweep = [12, 24, 48, 96, 192, 384, 768]
		const rows = hoursPerDaySweep.map((hoursPerDay) => {
			const omega = (2 * Math.PI) / (hoursPerDay * 3600)
			const row = PHYSICAL_CELLS_WIND.boundaryRowDeg({
				omega,
				planetRadiusM: DEFAULT_WORLD_PARAMS.planetRadiusKm * 1000,
				deltaThetaK: EARTH_DELTA_THETA_K,
				theta0K: EARTH_THETA0_K,
			})
			return { hoursPerDay, hadleyWidthDeg: row[0], bandCount: row.length }
		})
		console.table(rows)

		for (let i = 1; i < rows.length; i++) {
			expect(rows[i].hadleyWidthDeg).toBeGreaterThanOrEqual(
				rows[i - 1].hadleyWidthDeg - 1e-6,
			)
			expect(rows[i].bandCount).toBeLessThanOrEqual(rows[i - 1].bandCount)
		}

		// Sanity: Earth rotation should land in a physically reasonable range,
		// not exactly the empirically-fit hadleyWidth(24)=30deg (Held-Hou is a
		// simplified theory), but the same ballpark.
		const earth = rows.find((r) => r.hoursPerDay === 24)
		expect(earth?.hadleyWidthDeg).toBeGreaterThan(15)
		expect(earth?.hadleyWidthDeg).toBeLessThan(45)

		// Rhines signature: beta vanishes toward the pole, so extratropical
		// band widths widen poleward into one broad polar cap (a
		// deformation-radius tiling would narrow instead).
		const earthRow = PHYSICAL_CELLS_WIND.boundaryRowDeg({
			omega: (2 * Math.PI) / (24 * 3600),
			planetRadiusM: DEFAULT_WORLD_PARAMS.planetRadiusKm * 1000,
			deltaThetaK: EARTH_DELTA_THETA_K,
			theta0K: EARTH_THETA0_K,
		})
		const widths = earthRow.map((v, i) => (i === 0 ? v : v - earthRow[i - 1]))
		for (let i = 2; i < widths.length; i++) {
			expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1] - 1e-6)
		}

		// Earth must recover the classic 3-belt structure: one Hadley
		// boundary plus two extratropical ones (subtropical ridge,
		// subpolar trough), not a staircase of narrow jets.
		expect(earthRow.length).toBe(3)
	})

	it("gradient-reversal count (cell count proxy) is non-increasing as rotation slows", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")

		const build = (hoursPerDay: number) =>
			IMPORT_HEIGHTMAP.importGenesisWorld({
				params: {
					seed: 14963991,
					numPoints: DEFAULT_WORLD_PARAMS.numPoints,
					jitter: DEFAULT_WORLD_PARAMS.jitter,
					grayscale: earth.grayscale,
					imageWidth: earth.width,
					imageHeight: earth.height,
					coastlineMask: coastline.grayscale,
					maskWidth: coastline.width,
					maskHeight: coastline.height,
					lakeMask: lake.grayscale,
					lakeMaskWidth: lake.width,
					lakeMaskHeight: lake.height,
					terrainWarp: 0,
					smoothing: 0,
					hydraulicErosion: 0,
					thermalErosion: 0,
					ridgeSharpening: 0,
					glacialErosion: 0,
					seaLevel: DEFAULT_WORLD_PARAMS.seaLevel,
					volcanism: 1,
					craters: 0,
					maxElevation: DEFAULT_WORLD_PARAMS.maxElevation,
					planetRadiusKm: DEFAULT_WORLD_PARAMS.planetRadiusKm,
					obliquity: DEFAULT_WORLD_PARAMS.obliquity,
					eccentricity: DEFAULT_WORLD_PARAMS.eccentricity,
					spectralClass: DEFAULT_WORLD_PARAMS.spectralClass,
					starSubtype: DEFAULT_WORLD_PARAMS.starSubtype,
					orbitalDistanceAU: DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
					daysPerYear: DEFAULT_WORLD_PARAMS.daysPerYear,
					hoursPerDay,
					substellarLon: DEFAULT_WORLD_PARAMS.substellarLon,
					perihelion: DEFAULT_WORLD_PARAMS.perihelion,
					pressure: DEFAULT_WORLD_PARAMS.pressure,
				},
			})

		const reversalsAt = (hoursPerDay: number) => {
			const world = build(hoursPerDay)
			const N = world.mesh.numRegions
			const { latDeg } = RAIN.getClimateGeometry(world.mesh)
			const { pressure } = PHYSICAL_CELLS_WIND.computeWindVectors({
				mesh: world.mesh,
				climate: world.climate,
				elevation_km: world.elevation_km,
				params: world.params,
				month: 6,
				surface: {
					vegetation: world.vegetation,
					topography: world.topography,
					slopeScore: world.slopeScore,
					oceanDist: world.oceanDist,
				},
			})
			const BINS = 18
			const sum = new Float64Array(BINS)
			const cnt = new Int32Array(BINS)
			for (let r = 0; r < N; r++) {
				const b = Math.max(
					0,
					Math.min(BINS - 1, Math.floor((latDeg[r] + 90) / (180 / BINS))),
				)
				sum[b] += pressure[r]
				cnt[b]++
			}
			const nh: number[] = []
			for (let b = 9; b < BINS; b++) nh.push(cnt[b] > 0 ? sum[b] / cnt[b] : NaN)
			const diffs = nh.slice(1).map((v, i) => v - nh[i])
			let reversals = 0
			let prev = 0
			for (const d of diffs) {
				const s = d > 0.02 ? 1 : d < -0.02 ? -1 : prev
				if (prev !== 0 && s !== 0 && s !== prev) reversals++
				if (s !== 0) prev = s
			}
			return reversals
		}

		const sweep = [24, 150, 700].map((hoursPerDay) => ({
			hoursPerDay,
			reversals: reversalsAt(hoursPerDay),
		}))
		console.table(sweep)

		for (let i = 1; i < sweep.length; i++) {
			expect(sweep[i].reversals).toBeLessThanOrEqual(sweep[i - 1].reversals)
		}
		expect(sweep[0].reversals).toBeGreaterThanOrEqual(2)
		expect(sweep[sweep.length - 1].reversals).toBeLessThanOrEqual(1)
	})
})

import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale } from "./assets"

// Sanity: a slow rotator (or extreme tilt) should collapse the
// Hadley/Ferrel/polar template to a single equator-to-pole cell -- zonal-mean
// pressure rising monotonically from the tropical trough to the pole, with no
// mid-latitude ridge.
describe("cell collapse for slow rotators", () => {
	it("zonal-mean pressure profile: multi-cell at 24h, single-cell when slow", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")

		const build = (hoursPerDay: number, obliquity: number) =>
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
					obliquity,
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

		const profile = (hoursPerDay: number, obliquity: number, label: string) => {
			const world = build(hoursPerDay, obliquity)
			const N = world.mesh.numRegions
			const { latDeg } = RAIN.getClimateGeometry(world.mesh)
			const { pressure } = WIND.computeWindVectors({
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
			const BINS = 18 // 10-degree bands
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
			const zm: number[] = []
			for (let b = 0; b < BINS; b++)
				zm.push(cnt[b] > 0 ? sum[b] / cnt[b] : Number.NaN)
			const nh = zm.slice(9) // 0..90, 10-degree bands
			// Meridional-gradient sign reversals: a multi-cell profile
			// (trough -> subtropical ridge -> polar trough -> ...) has several,
			// a single collapsed cell has one.
			const diffs = nh.slice(1).map((v, i) => v - nh[i])
			let reversals = 0
			let prev = 0
			for (const d of diffs) {
				const s = d > 0.02 ? 1 : d < -0.02 ? -1 : prev
				if (prev !== 0 && s !== 0 && s !== prev) reversals++
				if (s !== 0) prev = s
			}
			console.log(
				`SLOWROT ${label}: NH zonal-mean pressure [eq..pole] = [${nh
					.map((v) => v.toFixed(2))
					.join(", ")}] | gradientReversals=${reversals}`,
			)
			return { nh, reversals }
		}

		const fast = profile(24, 23.4, "24h / 23.4deg (Earth)")
		const slow = profile(700, 23.4, "700h / 23.4deg (slow rotator)")
		const tilt = profile(24, 80, "24h / 80deg (extreme tilt)")

		// Earth keeps a multi-cell profile (ridge + trough reversals).
		expect(fast.reversals).toBeGreaterThanOrEqual(2)
		// Slow rotator and extreme tilt collapse to a single cell (one reversal).
		expect(slow.reversals).toBeLessThanOrEqual(1)
		expect(tilt.reversals).toBeLessThanOrEqual(1)
	})
})

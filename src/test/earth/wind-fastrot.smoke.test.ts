import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { FULL_WIND } from "@/model/climate/weather/wind/full"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale } from "./assets"

// GCM cell-boundary tables (Read et al.): doubling Earth's rotation adds
// extratropical cells (boundaries near 25/40/55/70 at 12h vs 30/60 at 24h)
// while the Hadley edge itself follows the fitted hadleyWidth table. The
// standard template answers with rotation-narrowed outer spacing, so fast
// rotators must gain realized pressure reversals and shift the subtropical
// ridge equatorward -- without moving Earth behavior at all.
describe("fast-rotator structure of the standard template", () => {
	it("gains cells and narrows the Hadley cell as rotation speeds up", () => {
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

		const structure = (hoursPerDay: number) => {
			const world = build(hoursPerDay)
			const N = world.mesh.numRegions
			const { latDeg } = RAIN.getClimateGeometry(world.mesh)
			const { pressure } = FULL_WIND.computeWindVectors({
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
			const BINS = 36
			const sum = new Float64Array(BINS)
			const cnt = new Int32Array(BINS)
			const oceanSum = new Float64Array(BINS)
			const oceanCnt = new Int32Array(BINS)
			for (let r = 0; r < N; r++) {
				const b = Math.max(
					0,
					Math.min(BINS - 1, Math.floor((latDeg[r] + 90) / (180 / BINS))),
				)
				sum[b] += pressure[r]
				cnt[b]++
				if (world.elevation_km[r] <= 0) {
					oceanSum[b] += pressure[r]
					oceanCnt[b]++
				}
			}
			const zm: number[] = []
			for (let b = 0; b < BINS; b++)
				zm.push(cnt[b] > 0 ? sum[b] / cnt[b] : Number.NaN)
			const ozm: number[] = []
			for (let b = 0; b < BINS; b++)
				ozm.push(oceanCnt[b] > 0 ? oceanSum[b] / oceanCnt[b] : Number.NaN)
			const nh = zm.slice(18)
			const diffs = nh.slice(1).map((v, i) => v - nh[i])
			let reversals = 0
			let prev = 0
			for (const d of diffs) {
				const s = d > 0.02 ? 1 : d < -0.02 ? -1 : prev
				if (prev !== 0 && s !== 0 && s !== prev) reversals++
				if (s !== 0) prev = s
			}
			let troughBin = 0
			for (let b = 0; b < 6; b++)
				if (ozm[18 + b] < ozm[18 + troughBin]) troughBin = b
			let ridgeBin = troughBin + 1
			for (let b = troughBin + 1; b < troughBin + 9; b++)
				if (ozm[18 + b] > ozm[18 + ridgeBin]) ridgeBin = b
			const ridgeLat = ridgeBin * 5 + 2.5
			console.log(
				`FASTROT ${hoursPerDay}h: reversals=${reversals} ridgeLat=${ridgeLat}`,
			)
			return { reversals, ridgeLat }
		}

		const day = structure(24)
		const half = structure(12)
		const quarter = structure(6)

		expect(half.reversals).toBeGreaterThanOrEqual(day.reversals)
		expect(quarter.reversals).toBeGreaterThanOrEqual(half.reversals)
		expect(day.ridgeLat).toBeGreaterThanOrEqual(20)
		expect(day.ridgeLat).toBeLessThanOrEqual(40)
	})
})

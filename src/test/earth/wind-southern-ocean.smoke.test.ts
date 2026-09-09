import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// Model vs observed surface wind SPEED over open ocean, by latitude band.
// The Southern Ocean (40-60S) is the windiest belt on Earth; check whether
// the model reproduces that, with the NH westerlies as a control.
describe("ocean wind speed by band", () => {
	it("reports model vs observed ocean wind speed, Southern Ocean vs elsewhere", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const realWindU = loadEarthMonthlyRaster("earth-real-wind-u")
		const realWindV = loadEarthMonthlyRaster("earth-real-wind-v")

		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
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
				realWindUMonthly: realWindU.monthly,
				realWindVMonthly: realWindV.monthly,
				realWindWidth: realWindU.width,
				realWindHeight: realWindU.height,
				realWindMonths: realWindU.months,
				realWindScale: realWindU.scale,
				realWindNoData: realWindU.nodata,
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
				hoursPerDay: DEFAULT_WORLD_PARAMS.hoursPerDay,
				substellarLon: DEFAULT_WORLD_PARAMS.substellarLon,
				perihelion: DEFAULT_WORLD_PARAMS.perihelion,
				pressure: DEFAULT_WORLD_PARAMS.pressure,
			},
		})

		const N = world.mesh.numRegions
		const { latDeg } = RAIN.getClimateGeometry(world.mesh)
		const topo = world.topography
		const isOcean = (r: number) => topo[r] === CLASSIFICATION.topoOcean

		const bands: Array<{ label: string; lo: number; hi: number }> = [
			{ label: "60-75N Arctic-coastal", lo: 60, hi: 75 },
			{ label: "40-60N westerlies", lo: 40, hi: 60 },
			{ label: "10-30N trades", lo: 10, hi: 30 },
			{ label: "10-30S trades", lo: -30, hi: -10 },
			{ label: "40-60S westerlies (Southern Ocean)", lo: -60, hi: -40 },
			{ label: "60-75S Antarctic-coastal", lo: -75, hi: -60 },
		]

		const annualObs = (r: number) => {
			// mean of monthly observed |wind| at region r
			let s = 0
			let c = 0
			for (let m = 0; m < 12; m++) {
				const u = world.observedWind?.real_u_monthly?.[m * N + r]
				const v = world.observedWind?.real_v_monthly?.[m * N + r]
				if (
					u !== undefined &&
					v !== undefined &&
					Number.isFinite(u) &&
					Number.isFinite(v)
				) {
					s += Math.hypot(u, v)
					c++
				}
			}
			return c > 0 ? s / c : Number.NaN
		}

		// annual-mean model wind speed
		const model = WIND.computeWindVectors({
			mesh: world.mesh,
			climate: world.climate,
			elevation_km: world.elevation_km,
			params: world.params,
			surface: {
				vegetation: world.vegetation,
				topography: world.topography,
				slopeScore: world.slopeScore,
				oceanDist: world.oceanDist,
			},
		})

		const ratioByLabel: Record<string, number> = {}
		for (const b of bands) {
			let mSum = 0
			let oSum = 0
			let n = 0
			for (let r = 0; r < N; r++) {
				if (!isOcean(r)) continue
				const lat = latDeg[r]
				if (lat < b.lo || lat >= b.hi) continue
				const o = annualObs(r)
				if (!Number.isFinite(o)) continue
				mSum += model.windSpeed[r]
				oSum += o
				n++
			}
			const d = Math.max(1, n)
			const ratio = mSum / Math.max(1e-6, oSum)
			ratioByLabel[b.label] = ratio
			console.log(
				`SOCEAN ${b.label}: n=${n} model=${(mSum / d).toFixed(1)} m/s  ` +
					`obs=${(oSum / d).toFixed(1)} m/s  ratio=${ratio.toFixed(2)}`,
			)
		}

		// The Southern Ocean should not be anemic: at least half of observed,
		// and windier than the trades (it is the strongest surface belt on
		// Earth). NH westerlies stay in a sane range.
		expect(ratioByLabel["40-60S westerlies (Southern Ocean)"]).toBeGreaterThan(
			0.5,
		)
		expect(ratioByLabel["40-60S westerlies (Southern Ocean)"]).toBeGreaterThan(
			ratioByLabel["10-30S trades"],
		)
		expect(ratioByLabel["40-60N westerlies"]).toBeGreaterThan(0.7)
		expect(ratioByLabel["40-60N westerlies"]).toBeLessThan(1.4)
	})
})

import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// Subtropical west coasts (eastern flank of the ocean subtropical high) have a
// strongly alongshore-equatorward real surface wind. This measures how much of
// that the model produces, model vs observed.
describe("west-coast alongshore wind", () => {
	it("reports the equatorward alongshore component on subtropical west coasts", () => {
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
		const { latDeg, regionBin } = RAIN.getClimateGeometry(world.mesh)
		const topo = world.topography
		const isLand = (r: number) =>
			topo[r] !== CLASSIFICATION.topoOcean &&
			topo[r] !== CLASSIFICATION.topoLake

		const lonBins = regionBin.reduce((m, v) => Math.max(m, v), 0) + 1
		const latBins = 60
		const latBinOf = (lat: number) =>
			Math.max(
				0,
				Math.min(latBins - 1, Math.floor(((lat + 90) / 180) * latBins)),
			)
		const land = new Float32Array(lonBins * latBins)
		const cells = new Float32Array(lonBins * latBins)
		for (let r = 0; r < N; r++) {
			const idx = latBinOf(latDeg[r]) * lonBins + regionBin[r]
			cells[idx]++
			if (isLand(r)) land[idx]++
		}
		const landFrac = (lb: number, xb: number) => {
			const x = ((xb % lonBins) + lonBins) % lonBins
			const i = lb * lonBins + x
			return cells[i] > 0 ? land[i] / cells[i] : 0
		}
		const isWestCoast = (r: number) => {
			if (!isLand(r)) return false
			const a = Math.abs(latDeg[r])
			if (a < 18 || a > 45) return false
			const lb = latBinOf(latDeg[r])
			const xb = regionBin[r]
			const oceanWest =
				landFrac(lb, xb - 1) < 0.35 ||
				landFrac(lb, xb - 2) < 0.35 ||
				landFrac(lb, xb - 3) < 0.35
			const landEast = landFrac(lb, xb + 1) > 0.5 || landFrac(lb, xb + 2) > 0.5
			return oceanWest && landEast && landFrac(lb, xb) > 0.4
		}
		const westCoast: number[] = []
		for (let r = 0; r < N; r++) if (isWestCoast(r)) westCoast.push(r)

		const summarize = (label: string, u: Float32Array, v: Float32Array) => {
			let n = 0
			let meridFrac = 0
			let equatorward = 0
			for (const r of westCoast) {
				const speed = Math.hypot(u[r], v[r])
				if (speed < 1e-9) continue
				n++
				meridFrac += Math.abs(v[r]) / speed
				equatorward += (-Math.sign(latDeg[r]) * v[r]) / speed
			}
			const d = Math.max(1, n)
			console.log(
				`WESTCOAST ${label}: n=${n} meridFrac=${(meridFrac / d).toFixed(3)} ` +
					`equatorward=${(equatorward / d).toFixed(3)}`,
			)
			return equatorward / d
		}

		let modelJanJul = 0
		for (const m of [0, 6]) {
			const model = WIND.computeWindVectors({
				mesh: world.mesh,
				climate: world.climate,
				elevation_km: world.elevation_km,
				params: world.params,
				month: m,
				surface: {
					vegetation: world.vegetation,
					topography: world.topography,
					slopeScore: world.slopeScore,
					oceanDist: world.oceanDist,
				},
			})
			const obs = WIND.observedWindVectorsForMonth({
				observedWind: world.observedWind,
				numRegions: N,
				month: m,
			})
			console.log(`--- month ${m} ---`)
			modelJanJul += summarize("model", model.windU, model.windV)
			summarize("obs  ", obs.windU, obs.windV)
		}

		// Both months should be net equatorward (the pre-fix model was
		// poleward in July).
		expect(modelJanJul).toBeGreaterThan(0.1)
		expect(westCoast.length).toBeGreaterThan(0)
	})
})

import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { FULL_WIND } from "@/model/climate/weather/wind/full"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// The eastern-boundary term must help upwelling west coasts (California:
// equatorward alongshore in July) WITHOUT reversing monsoon west coasts
// (western India: onshore-poleward SW monsoon in July).
describe("upwelling vs monsoon west coasts", () => {
	it("California stays equatorward, western India stays onshore-poleward (July)", () => {
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
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
		const topo = world.topography
		const isLand = (r: number) =>
			topo[r] !== CLASSIFICATION.topoOcean &&
			topo[r] !== CLASSIFICATION.topoLake

		const model = FULL_WIND.computeWindVectors({
			mesh: world.mesh,
			climate: world.climate,
			elevation_km: world.elevation_km,
			params: world.params,
			month: 6, // July
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
			month: 6,
		})

		const box = (
			label: string,
			latLo: number,
			latHi: number,
			lonLo: number,
			lonHi: number,
			u: Float32Array,
			v: Float32Array,
		) => {
			let n = 0
			let equatorward = 0
			let poleward = 0
			let onshore = 0
			for (let r = 0; r < N; r++) {
				if (!isLand(r)) continue
				if (latDeg[r] < latLo || latDeg[r] > latHi) continue
				if (lonDeg[r] < lonLo || lonDeg[r] > lonHi) continue
				const s = Math.hypot(u[r], v[r])
				if (s < 1e-9) continue
				n++
				equatorward += (-Math.sign(latDeg[r]) * v[r]) / s
				poleward += (Math.sign(latDeg[r]) * v[r]) / s
				onshore += u[r] / s // west coast: +u = eastward = onshore
			}
			const d = Math.max(1, n)
			console.log(
				`MONUP ${label}: n=${n} equatorward=${(equatorward / d).toFixed(2)} ` +
					`poleward=${(poleward / d).toFixed(2)} onshore=${(onshore / d).toFixed(2)}`,
			)
			return { n, equatorward: equatorward / d, poleward: poleward / d }
		}

		console.log("--- California (28-42N, 128-114W) ---")
		const calM = box("model", 28, 42, -128, -114, model.windU, model.windV)
		box("obs  ", 28, 42, -128, -114, obs.windU, obs.windV)
		console.log("--- western India (9-21N, 70-77E) ---")
		const indM = box("model", 8, 22, 66, 78, model.windU, model.windV)
		box("obs  ", 8, 22, 66, 78, obs.windU, obs.windV)

		expect(calM.n).toBeGreaterThan(0)
		expect(indM.n).toBeGreaterThan(0)
		// California: net equatorward alongshore.
		expect(calM.equatorward).toBeGreaterThan(0.1)
		// Western India: the summer monsoon is poleward, not equatorward -- the
		// eastern-boundary term must not have flipped it.
		expect(indM.poleward).toBeGreaterThan(0)
	})
})

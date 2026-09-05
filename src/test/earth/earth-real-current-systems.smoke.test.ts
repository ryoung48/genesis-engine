import { describe, expect, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { OCEAN_CURRENTS } from "@/model/climate/ocean/currents"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"
import type {
	OceanCurrentFit,
	OceanCurrentReport,
	OceanCurrentWindow,
} from "./types"

const COASTAL_SYSTEMS = [
	{ label: "Kuroshio (warm)", lat: [28, 40], lon: [138, 165], sign: 1 },
	{ label: "Brazil (warm)", lat: [-38, -24], lon: [-52, -38], sign: 1 },
	{ label: "Agulhas (warm)", lat: [-40, -28], lon: [18, 38], sign: 1 },
	{ label: "Humboldt (cold)", lat: [-22, -5], lon: [-85, -74], sign: -1 },
	{ label: "Benguela (cold)", lat: [-30, -14], lon: [4, 16], sign: -1 },
	{ label: "California (cold)", lat: [25, 42], lon: [-132, -120], sign: -1 },
	{ label: "Canary (cold)", lat: [15, 32], lon: [-25, -11], sign: -1 },
]

const UNRESOLVED = [
	{ label: "N Atlantic Drift (warm)", lat: [52, 65], lon: [-25, 5] },
	{ label: "Gulf Stream (warm)", lat: [32, 44], lon: [-75, -50] },
	{ label: "Labrador (cold)", lat: [50, 62], lon: [-58, -44] },
	{ label: "Oyashio (cold)", lat: [42, 54], lon: [148, 168] },
]

describe("named warm and cold current systems against OISST", () => {
	it("reports each heuristic system without asserting physical-current accuracy", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const realWindU = loadEarthMonthlyRaster("earth-real-wind-u")
		const realWindV = loadEarthMonthlyRaster("earth-real-wind-v")
		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed: 14963991,
				numPoints: 12000,
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
				volcanism: 1,
				craters: 0,
			},
		})
		const { mesh, oceanCurrents } = world
		const raster = loadEarthMonthlyRaster("earth-real-sst-anomaly")
		const observed = OBSERVED_EARTH.sampleMonthlyFloatRaster({
			mesh,
			raster: raster.monthly,
			rasterW: raster.width,
			rasterH: raster.height,
			months: raster.months,
			scale: raster.scale,
			nodata: raster.nodata,
		})
		const n = mesh.numRegions
		const currents = oceanCurrents!
		const measure = (region: OceanCurrentWindow): OceanCurrentFit => {
			let modeled = 0,
				truth = 0,
				count = 0
			for (let r = 0; r < n; r++) {
				if (world.isLand[r]) continue
				const x = mesh.r_xyz[3 * r],
					y = mesh.r_xyz[3 * r + 1],
					z = mesh.r_xyz[3 * r + 2]
				const lat = (Math.asin(z) * 180) / Math.PI
				const lon = (Math.atan2(y, x) * 180) / Math.PI
				if (lat < region.lat[0] || lat > region.lat[1]) continue
				if (lon < region.lon[0] || lon > region.lon[1]) continue
				for (let month = 0; month < 12; month++) {
					const i = month * n + r
					if (!Number.isFinite(observed[i])) continue
					modeled +=
						currents.sstMonthly[i] * OCEAN_CURRENTS.sstAnomalySaturationC
					truth += observed[i]
					count++
				}
			}
			return {
				modeled: modeled / count,
				observed: truth / count,
				count,
			}
		}
		const report = ({ label, fit }: OceanCurrentReport) =>
			process.stdout.write(
				`${label.padEnd(26)} n=${String(fit.count).padStart(4)} modeled=${fit.modeled.toFixed(2).padStart(6)} observed=${fit.observed.toFixed(2).padStart(6)} recovered=${((fit.modeled / fit.observed) * 100).toFixed(0).padStart(4)}%
`,
			)

		for (const region of [...UNRESOLVED, ...COASTAL_SYSTEMS]) {
			const fit = measure(region)
			report({ label: region.label, fit })
			expect(fit.count).toBeGreaterThan(100)
			expect(Number.isFinite(fit.modeled + fit.observed)).toBe(true)
		}
	})
})

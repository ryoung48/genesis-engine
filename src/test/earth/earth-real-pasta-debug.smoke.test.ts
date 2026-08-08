import { describe, expect, it } from "vitest"
import { PASTA } from "@/model/climate/classification/pasta"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "./assets"

// Southern Italy bounding box (Calabria/Sicily/Puglia range).
const LAT_LO = 37.5
const LAT_HI = 41.5
const LON_LO = 13.5
const LON_HI = 18.5

describe("Real-input pasta climate: southern Italy", () => {
	it("scans southern Italy for tropical-rainforest misclassifications", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const riverLines = loadEarthRiverLines()
		const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
		const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
		const realDtr = loadEarthMonthlyRaster("earth-real-dtr")
		const realElevation = loadEarthElevationRaster()

		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed: 14963991,
				grayscale: earth.grayscale,
				imageWidth: earth.width,
				imageHeight: earth.height,
				coastlineMask: coastline.grayscale,
				maskWidth: coastline.width,
				maskHeight: coastline.height,
				lakeMask: lake.grayscale,
				lakeMaskWidth: lake.width,
				lakeMaskHeight: lake.height,
				riverLines,
				realClimateMonthly: realClimate.monthly,
				realClimateWidth: realClimate.width,
				realClimateHeight: realClimate.height,
				realClimateMonths: realClimate.months,
				realClimateScale: realClimate.scale,
				realClimateNoData: realClimate.nodata,
				realPrecipMonthly: realPrecip.monthly,
				realPrecipWidth: realPrecip.width,
				realPrecipHeight: realPrecip.height,
				realPrecipMonths: realPrecip.months,
				realPrecipScale: realPrecip.scale,
				realPrecipNoData: realPrecip.nodata,
				realDtrMonthly: realDtr.monthly,
				realDtrWidth: realDtr.width,
				realDtrHeight: realDtr.height,
				realDtrMonths: realDtr.months,
				realDtrScale: realDtr.scale,
				realDtrNoData: realDtr.nodata,
				realElevationRaster: realElevation.raster,
				realElevationWidth: realElevation.width,
				realElevationHeight: realElevation.height,
				realElevationScale: realElevation.scale,
				realElevationNoData: realElevation.nodata,
				terrainWarp: 0,
				smoothing: 0,
				hydraulicErosion: 0,
				thermalErosion: 0,
				ridgeSharpening: 0,
				glacialErosion: 0,
			},
		})

		const N = world.mesh.numRegions
		expect(world.realPastaClimate).toBeDefined()
		const zones = world.realPastaClimate!
		const realTemp = world.climate.real_temperature_monthly!
		const realRain = world.rainfall.real_monthly!

		const hits: {
			r: number
			lat: number
			lon: number
			zone: string
			name: string
		}[] = []

		for (let r = 0; r < N; r++) {
			if (!world.isLand[r]) continue
			const z = world.mesh.r_xyz[r * 3 + 2]
			const y = world.mesh.r_xyz[r * 3 + 1]
			const x = world.mesh.r_xyz[r * 3]
			const latDeg = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
			const lonDeg = (Math.atan2(y, x) * 180) / Math.PI
			if (
				latDeg < LAT_LO ||
				latDeg > LAT_HI ||
				lonDeg < LON_LO ||
				lonDeg > LON_HI
			)
				continue
			const zoneCode = zones[r]
			const label = PASTA.pastaLabels[zoneCode]
			hits.push({
				r,
				lat: latDeg,
				lon: lonDeg,
				zone: label,
				name: PASTA.pastaClimateName(zoneCode),
			})
		}

		console.info(`Scanned ${hits.length} southern-Italy land regions`)
		const tropical = hits.filter((h) => h.zone.startsWith("TU"))
		console.info(`Tropical-rainforest-family hits: ${tropical.length}`)
		for (const h of tropical.slice(0, 10)) {
			const r = h.r
			console.info(
				`region ${r} @ (${h.lat.toFixed(2)}, ${h.lon.toFixed(2)}) -> ${h.zone} (${h.name})`,
			)
			console.info(
				"  gdd/gint/minT/maxT",
				world.pastaDebug?.gdd[r],
				world.pastaDebug?.gint[r],
				world.pastaDebug?.minT[r],
				world.pastaDebug?.maxT[r],
			)
			console.info(
				"  real monthly temp (C)",
				Array.from({ length: 12 }, (_, m) => realTemp[m * N + r].toFixed(1)),
			)
			console.info(
				"  real monthly rain (mm)",
				Array.from({ length: 12 }, (_, m) => realRain[m * N + r].toFixed(0)),
			)
		}

		// Also dump the overall zone distribution for context.
		const counts = new Map<string, number>()
		for (const h of hits) counts.set(h.zone, (counts.get(h.zone) ?? 0) + 1)
		console.info("Zone distribution over region:", Object.fromEntries(counts))
	}, 600_000)
})

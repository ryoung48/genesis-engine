import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { NODE_PNG } from "@/model/shared/node-png"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"

const HEIGHTMAP_DIR = join(process.cwd(), "public", "heightmap")

function loadGrayscale(filename: string) {
	const buffer = readFileSync(join(HEIGHTMAP_DIR, filename))
	return NODE_PNG.decodePng(buffer)
}

function loadRealClimate(prefix: string) {
	const meta = JSON.parse(
		readFileSync(join(HEIGHTMAP_DIR, `${prefix}.json`), "utf8"),
	) as {
		bin: string
		width: number
		height: number
		months: number
		scale: number
		nodata: number
	}
	const bin = readFileSync(join(HEIGHTMAP_DIR, meta.bin))
	const monthly = new Int16Array(
		bin.buffer,
		bin.byteOffset,
		bin.byteLength / Int16Array.BYTES_PER_ELEMENT,
	)
	return {
		monthly,
		width: meta.width,
		height: meta.height,
		months: meta.months,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

describe("real Earth wind debug", () => {
	it("attaches observedWind that varies by month", () => {
		const earth = loadGrayscale("earth.png")
		const coastline = loadGrayscale("coastline-mask.png")
		const lake = loadGrayscale("lake-mask.png")
		const realWindU = loadRealClimate("earth-real-wind-u")
		const realWindV = loadRealClimate("earth-real-wind-v")

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
			},
		})

		console.log("observedWind present:", !!world.observedWind)
		console.log(
			"real_u_monthly length:",
			world.observedWind?.real_u_monthly?.length,
		)
		const N = world.mesh.numRegions
		console.log("numRegions:", N)
		const u = world.observedWind?.real_u_monthly
		if (u) {
			for (const m of [0, 3, 6, 9]) {
				let sum = 0
				for (let r = 0; r < N; r++) sum += u[m * N + r]
				console.log(`month ${m} mean u:`, sum / N)
			}
		}
		expect(world.observedWind?.real_u_monthly).toBeDefined()
	})
})

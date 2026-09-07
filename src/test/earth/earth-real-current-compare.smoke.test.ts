import { describe, expect, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { OCEAN_CURRENTS } from "@/model/climate/ocean/currents"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import type { GenesisParams } from "@/model/pipelines/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

describe("restored heuristic ocean model", () => {
	it("reports OISST error and restores the original land-only thermal influence", () => {
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
		const raster = loadEarthMonthlyRaster("earth-real-sst-anomaly")
		const observed = OBSERVED_EARTH.sampleMonthlyFloatRaster({
			mesh: world.mesh,
			raster: raster.monthly,
			rasterW: raster.width,
			rasterH: raster.height,
			months: raster.months,
			scale: raster.scale,
			nodata: raster.nodata,
		})
		const currents = world.oceanCurrents!
		const n = world.mesh.numRegions
		expect(OCEAN_CURRENTS.sstAnomalySaturationC).toBe(9)
		expect(currents.sstMonthly.length).toBe(n * 12)
		const climate = {
			...world.climate,
			temperature_monthly: new Float32Array(n * 12).fill(10),
			temperature_avg: new Float32Array(n).fill(10),
		}
		OCEAN_CURRENTS.applySSTToClimate({
			mesh: world.mesh,
			climate,
			oceanCurrents: currents,
			isLocked: false,
		})
		let count = 0,
			squared = 0,
			northAtlantic = 0,
			northCount = 0
		for (let r = 0; r < n; r++) {
			let mean = 0
			const lat = (Math.asin(world.mesh.r_xyz[3 * r + 2]) * 180) / Math.PI
			const lon =
				(Math.atan2(world.mesh.r_xyz[3 * r + 1], world.mesh.r_xyz[3 * r]) *
					180) /
				Math.PI
			for (let m = 0; m < 12; m++) {
				const i = m * n + r,
					value = currents.sstMonthly[i]
				expect(Number.isFinite(value)).toBe(true)
				expect(Math.abs(value)).toBeLessThanOrEqual(1)
				mean += value / 12
				expect(climate.temperature_monthly[i]).toBeCloseTo(10 + value * 9, 4)
				if (!world.isLand[r] && Number.isFinite(observed[i])) {
					squared += (value * 9 - observed[i]) ** 2
					count++
					if (lat >= 52 && lat <= 65 && lon >= -25 && lon <= 5) {
						northAtlantic += value * 9
						northCount++
					}
				}
			}
			expect(currents.sst[r]).toBeCloseTo(mean, 5)
		}
		expect(count).toBeGreaterThan(1000)
		expect(northCount).toBeGreaterThan(100)
		expect(northAtlantic / northCount).toBeGreaterThan(0.5)
		const lockedParams: GenesisParams = {
			...world.params,
			tideLock: { type: "solar", target: 0 },
			substellarLon: 0,
			eccentricity: 0,
			obliquity: 0,
		}
		const locked = OCEAN_CURRENTS.computeSST({
			mesh: world.mesh,
			isLand: world.isLand,
			landmarks: world.landmarks!,
			distCoast: new Float32Array(n),
			monthlyTEQ: [],
			eastAdv: new Float32Array(n),
			westAdv: new Float32Array(n),
			params: lockedParams,
		})
		climate.temperature_monthly.fill(10)
		OCEAN_CURRENTS.applySSTToClimate({
			mesh: world.mesh,
			climate,
			oceanCurrents: locked,
			isLocked: true,
		})
		for (let i = 0; i < n * 12; i++) {
			const r = i % n
			expect(locked.sstMonthly[i]).toBeCloseTo(locked.sst[r], 5)
			expect(climate.temperature_monthly[i]).toBeCloseTo(
				10 + locked.sstMonthly[i] * 6 * 0.68,
				4,
			)
		}
		for (const params of [world.params, lockedParams]) {
			const display = OCEAN_CURRENTS.buildOceanCurrentGrid({
				mesh: world.mesh,
				isLand: world.isLand,
				oceanCurrents: params === lockedParams ? locked : currents,
				month: 0,
				params,
			})
			expect(display.u.every(Number.isFinite)).toBe(true)
			expect(display.v.every(Number.isFinite)).toBe(true)
			expect(display.speed.some((value) => value > 0)).toBe(true)
		}
		process.stdout.write(
			`Heuristic OISST anomaly RMSE=${Math.sqrt(squared / count).toFixed(3)} C; North Atlantic anomaly=${(northAtlantic / northCount).toFixed(3)} C\n`,
		)
	})
})

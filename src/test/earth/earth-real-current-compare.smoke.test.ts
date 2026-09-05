import { describe, expect, it } from "vitest"
import { OCEAN_CURRENTS } from "@/model/climate/ocean/currents"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

describe("wind-driven ocean circulation against Earth climatology", () => {
	it("compares monthly vectors and SST with GODAS and OISST", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const world = IMPORT_HEIGHTMAP.importGenesisWorld({ params: {
			...DEFAULT_WORLD_PARAMS, seed: 14963991, numPoints: 12000,
			grayscale: earth.grayscale, imageWidth: earth.width, imageHeight: earth.height,
			coastlineMask: coastline.grayscale, maskWidth: coastline.width, maskHeight: coastline.height,
			lakeMask: lake.grayscale, lakeMaskWidth: lake.width, lakeMaskHeight: lake.height,
			terrainWarp: 0, smoothing: 0, hydraulicErosion: 0, thermalErosion: 0, ridgeSharpening: 0, glacialErosion: 0, volcanism: 1, craters: 0,
		} })
		const sample = (name: string) => {
			const raster = loadEarthMonthlyRaster(name)
			return OBSERVED_EARTH.sampleMonthlyFloatRaster({ mesh: world.mesh, raster: raster.monthly, rasterW: raster.width, rasterH: raster.height, months: raster.months, scale: raster.scale, nodata: raster.nodata })
		}
		const observedU = sample("earth-real-current-u"), observedV = sample("earth-real-current-v"), observedSst = sample("earth-real-sst-anomaly")
		const modeled = world.oceanCurrents!
		const baseline = { ...world.climate, temperature_monthly: world.climate.temperature_monthly.map((t,i) => t-modeled.temperatureDeltaMonthly[i]), temperature_monthly_nolapse: world.climate.temperature_monthly_nolapse.map((t,i) => t-modeled.temperatureDeltaMonthly[i]), temperature_avg: world.climate.temperature_avg.slice() }
		const n = world.mesh.numRegions
		for (let r = 0; r < n; r++) { let sum = 0; for (let m = 0; m < 12; m++) sum += baseline.temperature_monthly[m*n+r]; baseline.temperature_avg[r] = sum/12 }
		const observedForced = OCEAN_CURRENTS.computeSST({ mesh: world.mesh, isLand: world.isLand, landmarks: world.landmarks, climate: baseline, elevation_km: world.elevation_km, params: world.params, wind: { u: sample("earth-real-wind-u"), v: sample("earth-real-wind-v") } })
		for (const [label, currents] of [["modeled wind",modeled], ["observed wind",observedForced]] as const) {
			let count = 0, squared = 0, zeroSquared = 0, cosine = 0, directional = 0, speedSum = 0, observedSpeedSum = 0, sstSquared = 0, sstZero = 0, sstCount = 0, maxSpeed = 0
			for (let i = 0; i < observedU.length; i++) {
				if (!currents.ocean[i%n]) { expect(currents.uMonthly[i]).toBe(0); expect(currents.vMonthly[i]).toBe(0); continue }
				const u = currents.uMonthly[i], v = currents.vMonthly[i]
				expect(Number.isFinite(u+v+currents.temperatureDeltaMonthly[i])).toBe(true)
				const speed = Math.hypot(u,v), observedSpeed = Math.hypot(observedU[i],observedV[i])
				maxSpeed = Math.max(maxSpeed,speed)
				if (Number.isFinite(observedSpeed)) {
					count++; squared += (u-observedU[i])**2+(v-observedV[i])**2; zeroSquared += observedSpeed**2; speedSum += speed; observedSpeedSum += observedSpeed
					if (speed > 0.02 && observedSpeed > 0.02) { cosine += (u*observedU[i]+v*observedV[i])/(speed*observedSpeed); directional++ }
				}
				if (Number.isFinite(observedSst[i])) { sstCount++; sstSquared += (currents.sstMonthly[i]*OCEAN_CURRENTS.sstAnomalySaturationC-observedSst[i])**2; sstZero += observedSst[i]**2 }
			}
			console.log(label, { vectorRMSE: Math.sqrt(squared/count), restingOceanRMSE: Math.sqrt(zeroSquared/count), directionCosine: cosine/directional, meanSpeed: speedSum/count, observedMeanSpeed: observedSpeedSum/count, maxSpeed, sstRMSE: Math.sqrt(sstSquared/sstCount), zonalSstRMSE: Math.sqrt(sstZero/sstCount), spinupYears: currents.spinupYears, cycleError: currents.circulationCycleError, heatCycleError: currents.heatCycleError })
			expect(count).toBeGreaterThan(10000)
			expect(maxSpeed).toBeLessThan(5)
			expect(currents.heatCycleError).toBeLessThan(0.02)
		}
	})
})

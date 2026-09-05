import { describe, expect, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { OCEAN_CURRENTS } from "@/model/climate/ocean/currents"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

const LAT_BANDS = [
	{ label: "0-5 (equatorial)", lo: 0, hi: 5 },
	{ label: "5-15 (tropics)", lo: 5, hi: 15 },
	{ label: "15-30 (subtropics)", lo: 15, hi: 30 },
	{ label: "30-45 (midlatitude)", lo: 30, hi: 45 },
	{ label: "45-60 (southern ocean)", lo: 45, hi: 60 },
	{ label: "60-90 (polar)", lo: 60, hi: 90 },
]

describe("wind-driven ocean circulation against Earth climatology", () => {
	it("compares monthly vectors and SST with GODAS and OISST", () => {
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
		const sample = (name: string) => {
			const raster = loadEarthMonthlyRaster(name)
			return OBSERVED_EARTH.sampleMonthlyFloatRaster({
				mesh: world.mesh,
				raster: raster.monthly,
				rasterW: raster.width,
				rasterH: raster.height,
				months: raster.months,
				scale: raster.scale,
				nodata: raster.nodata,
			})
		}
		const observedU = sample("earth-real-current-u"),
			observedV = sample("earth-real-current-v"),
			observedSst = sample("earth-real-sst-anomaly")
		// The pipeline forces an Earth import's currents with the observed wind
		// field, so this measures the ocean model alone.
		const currents = world.oceanCurrents!
		const n = world.mesh.numRegions
		const bands = LAT_BANDS.map((band) => ({
			band,
			count: 0,
			squared: 0,
			zeroSquared: 0,
			cosine: 0,
			directional: 0,
			speed: 0,
			observedSpeed: 0,
			sstSquared: 0,
			sstZero: 0,
			sstCount: 0,
		}))
		let maxSpeed = 0
		for (let i = 0; i < observedU.length; i++) {
			const r = i % n
			if (!currents.ocean[r]) {
				expect(currents.uMonthly[i]).toBe(0)
				expect(currents.vMonthly[i]).toBe(0)
				continue
			}
			const u = currents.uMonthly[i],
				v = currents.vMonthly[i]
			expect(Number.isFinite(u + v + currents.temperatureDeltaMonthly[i])).toBe(
				true,
			)
			const speed = Math.hypot(u, v),
				observedSpeed = Math.hypot(observedU[i], observedV[i])
			maxSpeed = Math.max(maxSpeed, speed)
			const latitude = Math.abs(
				(Math.asin(world.mesh.r_xyz[3 * r + 2]) * 180) / Math.PI,
			)
			const bucket = bands.find(
				({ band }) => latitude >= band.lo && latitude < band.hi,
			)
			if (!bucket) continue
			if (Number.isFinite(observedSpeed)) {
				bucket.count++
				bucket.squared += (u - observedU[i]) ** 2 + (v - observedV[i]) ** 2
				bucket.zeroSquared += observedSpeed ** 2
				bucket.speed += speed
				bucket.observedSpeed += observedSpeed
				if (speed > 0.02 && observedSpeed > 0.02) {
					bucket.cosine +=
						(u * observedU[i] + v * observedV[i]) / (speed * observedSpeed)
					bucket.directional++
				}
			}
			if (Number.isFinite(observedSst[i])) {
				bucket.sstCount++
				bucket.sstSquared +=
					(currents.sstMonthly[i] * OCEAN_CURRENTS.sstAnomalySaturationC -
						observedSst[i]) **
					2
				bucket.sstZero += observedSst[i] ** 2
			}
		}
		const total = bands.reduce(
			(sum, bucket) => ({
				count: sum.count + bucket.count,
				squared: sum.squared + bucket.squared,
				zeroSquared: sum.zeroSquared + bucket.zeroSquared,
				cosine: sum.cosine + bucket.cosine,
				directional: sum.directional + bucket.directional,
				speed: sum.speed + bucket.speed,
				observedSpeed: sum.observedSpeed + bucket.observedSpeed,
				sstSquared: sum.sstSquared + bucket.sstSquared,
				sstZero: sum.sstZero + bucket.sstZero,
				sstCount: sum.sstCount + bucket.sstCount,
			}),
			{
				count: 0,
				squared: 0,
				zeroSquared: 0,
				cosine: 0,
				directional: 0,
				speed: 0,
				observedSpeed: 0,
				sstSquared: 0,
				sstZero: 0,
				sstCount: 0,
			},
		)
		for (const bucket of [
			...bands.map((entry) => ({ label: entry.band.label, ...entry })),
			{ label: "global", ...total },
		])
			process.stdout.write(
				`${bucket.label.padEnd(22)} speed=${(bucket.speed / bucket.count).toFixed(4)} observed=${(bucket.observedSpeed / bucket.count).toFixed(4)} cosine=${(bucket.cosine / bucket.directional).toFixed(3)} vectorRMSE=${Math.sqrt(bucket.squared / bucket.count).toFixed(4)} restingRMSE=${Math.sqrt(bucket.zeroSquared / bucket.count).toFixed(4)} sstRMSE=${Math.sqrt(bucket.sstSquared / bucket.sstCount).toFixed(3)} zonalSstRMSE=${Math.sqrt(bucket.sstZero / bucket.sstCount).toFixed(3)}
`,
			)
		process.stdout.write(
			`maxSpeed=${maxSpeed.toFixed(3)} cycleError=${currents.circulationCycleError.toExponential(2)} heatCycleError=${currents.heatCycleError.toExponential(2)}
`,
		)
		expect(total.count).toBeGreaterThan(10000)
		expect(maxSpeed).toBeLessThan(5)
		expect(currents.heatCycleError).toBeLessThan(0.02)
		// Skill, not agreement: the model has to beat the two null hypotheses --
		// a motionless ocean for the vectors, and a purely zonal SST for the heat
		// transport. Thresholds carry a little headroom over measured values.
		expect(Math.sqrt(total.squared / total.count)).toBeLessThan(
			Math.sqrt(total.zeroSquared / total.count),
		)
		expect(total.cosine / total.directional).toBeGreaterThan(0.65)
		expect(Math.sqrt(total.sstSquared / total.sstCount)).toBeLessThan(
			Math.sqrt(total.sstZero / total.sstCount),
		)
		// The Southern Ocean and the polar cap still sit level with the zonal
		// baseline: both want a sea-ice treatment the model does not have yet.
		for (const bucket of bands.slice(0, 4))
			expect([
				bucket.band.label,
				Math.sqrt(bucket.sstSquared / bucket.sstCount) <
					Math.sqrt(bucket.sstZero / bucket.sstCount),
			]).toEqual([bucket.band.label, true])
	})
})

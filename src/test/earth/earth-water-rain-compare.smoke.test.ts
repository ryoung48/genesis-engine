import { describe, expect, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { WATER_RAIN } from "@/model/climate/precipitation/water-rain"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
} from "./assets"

describe("standalone water-rain model against observed Earth precipitation", () => {
	it("reports monthly land, ocean, and global errors without precipitation input", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const elevation = loadEarthElevationRaster()
		const temperature = loadEarthMonthlyRaster("earth-real-temperature")
		const precipitation = loadEarthMonthlyRaster("earth-real-precipitation")
		const sst = loadEarthMonthlyRaster("earth-real-sst")
		const sstAnomaly = loadEarthMonthlyRaster("earth-real-sst-anomaly")
		const windU = loadEarthMonthlyRaster("earth-real-wind-u")
		const windV = loadEarthMonthlyRaster("earth-real-wind-v")
		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				seed: 14_963_991,
				numPoints: 20_000,
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
				realClimateMonthly: temperature.monthly,
				realClimateWidth: temperature.width,
				realClimateHeight: temperature.height,
				realClimateMonths: temperature.months,
				realClimateScale: temperature.scale,
				realClimateNoData: temperature.nodata,
				realPrecipMonthly: precipitation.monthly,
				realPrecipWidth: precipitation.width,
				realPrecipHeight: precipitation.height,
				realPrecipMonths: precipitation.months,
				realPrecipScale: precipitation.scale,
				realPrecipNoData: precipitation.nodata,
				realWindUMonthly: windU.monthly,
				realWindVMonthly: windV.monthly,
				realWindWidth: windU.width,
				realWindHeight: windU.height,
				realWindMonths: windU.months,
				realWindScale: windU.scale,
				realWindNoData: windU.nodata,
				realElevationRaster: elevation.raster,
				realElevationWidth: elevation.width,
				realElevationHeight: elevation.height,
				realElevationScale: elevation.scale,
				realElevationNoData: elevation.nodata,
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
		const airTemperatureMonthlyC = world.climate.real_temperature_monthly
		const observedPrecipitationMonthlyMm = world.rainfall.real_monthly
		const currentRainMonthlyMm = world.rainfall.monthly
		const windUMonthlyMs = world.observedWind?.real_u_monthly
		const windVMonthlyMs = world.observedWind?.real_v_monthly
		if (
			!airTemperatureMonthlyC ||
			!observedPrecipitationMonthlyMm ||
			!windUMonthlyMs ||
			!windVMonthlyMs
		) {
			throw new Error("Earth import is missing standalone rain forcing")
		}
		const seaSurfaceTemperatureMonthlyC =
			OBSERVED_EARTH.sampleMonthlyFloatRaster({
				mesh: world.mesh,
				raster: sst.monthly,
				rasterW: sst.width,
				rasterH: sst.height,
				months: sst.months,
				scale: sst.scale,
				nodata: sst.nodata,
			})
		const seaSurfaceTemperatureAnomalyMonthlyC =
			OBSERVED_EARTH.sampleMonthlyFloatRaster({
				mesh: world.mesh,
				raster: sstAnomaly.monthly,
				rasterW: sstAnomaly.width,
				rasterH: sstAnomaly.height,
				months: sstAnomaly.months,
				scale: sstAnomaly.scale,
				nodata: sstAnomaly.nodata,
			})
		const N = world.mesh.numRegions
		for (let index = 0; index < seaSurfaceTemperatureMonthlyC.length; index++) {
			if (!Number.isFinite(seaSurfaceTemperatureMonthlyC[index]))
				seaSurfaceTemperatureMonthlyC[index] = airTemperatureMonthlyC[index]
			if (!Number.isFinite(seaSurfaceTemperatureAnomalyMonthlyC[index]))
				seaSurfaceTemperatureAnomalyMonthlyC[index] = 0
		}
		const zonalSeaSurfaceTemperatureMonthlyC = new Float32Array(
			seaSurfaceTemperatureMonthlyC,
		)
		for (
			let index = 0;
			index < zonalSeaSurfaceTemperatureMonthlyC.length;
			index++
		)
			zonalSeaSurfaceTemperatureMonthlyC[index] -=
				seaSurfaceTemperatureAnomalyMonthlyC[index]
		const permanentWater = new Uint8Array(N)
		for (let r = 0; r < N; r++) permanentWater[r] = world.isLand[r] ? 0 : 1

		const inputs = {
			mesh: world.mesh,
			planet: {
				radiusKm: world.params.planetRadiusKm,
				surfacePressurePa: (world.params.pressure ?? 1) * 100_000,
				freezingPointC: 0,
				monthDays: new Float32Array([
					31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
				]),
			},
			forcing: {
				elevationKm: world.elevation_km,
				permanentWater,
				airTemperatureMonthlyC,
				seaSurfaceTemperatureMonthlyC,
				windUMonthlyMs,
				windVMonthlyMs,
			},
			parameters: WATER_RAIN.PORTABLE_PRIOR_PARAMETERS,
		}
		const priorStartedMs = performance.now()
		const priorResult = WATER_RAIN.simulate(inputs)
		const priorElapsedMs = performance.now() - priorStartedMs
		let calibrationObserved = 0
		let calibrationModeled = 0
		for (const month of [0, 2, 4, 6, 8, 10]) {
			for (let r = 0; r < N; r++) {
				const index = month * N + r
				const observed = observedPrecipitationMonthlyMm[index]
				if (!Number.isFinite(observed)) continue
				const weight = world.mesh.regionArea[r]
				calibrationObserved += observed * weight
				calibrationModeled += priorResult.precipitationMonthlyMm[index] * weight
			}
		}
		const amountFitMultiplier = calibrationObserved / calibrationModeled
		const calibratedParameters = {
			...WATER_RAIN.PORTABLE_PRIOR_PARAMETERS,
			exchangeCoefficient:
				WATER_RAIN.PORTABLE_PRIOR_PARAMETERS.exchangeCoefficient *
				amountFitMultiplier,
		}
		const calibratedStartedMs = performance.now()
		const result = WATER_RAIN.simulate({
			...inputs,
			parameters: calibratedParameters,
		})
		const calibratedElapsedMs = performance.now() - calibratedStartedMs
		const noSstAnomalyResult = WATER_RAIN.simulate({
			...inputs,
			forcing: {
				...inputs.forcing,
				seaSurfaceTemperatureMonthlyC: zonalSeaSurfaceTemperatureMonthlyC,
			},
			parameters: calibratedParameters,
		})
		const monthlyRows = []
		const currentRainMonthlyRows = []
		let totalWeight = 0
		let totalObserved = 0
		let totalModeled = 0
		let totalPriorModeled = 0
		let totalCurrentRainModeled = 0
		let totalAbsoluteError = 0
		let totalSquaredError = 0
		let totalPriorAbsoluteError = 0
		let totalPriorSquaredError = 0
		let totalCurrentRainAbsoluteError = 0
		let totalCurrentRainSquaredError = 0
		let weightedObservedSquared = 0
		let weightedModeledSquared = 0
		let weightedObservedModeled = 0
		let weightedCurrentRainSquared = 0
		let weightedObservedCurrentRain = 0
		let noSstAnomalyModeled = 0
		let noSstAnomalyAbsoluteError = 0
		let noSstAnomalySquaredError = 0
		let weightedNoSstAnomalySquared = 0
		let weightedObservedNoSstAnomaly = 0
		let landTotalWeight = 0
		let landTotalObserved = 0
		let landTotalModeled = 0
		let landTotalAbsoluteError = 0
		let landTotalSquaredError = 0
		let landTotalPriorModeled = 0
		let landTotalPriorAbsoluteError = 0
		let landTotalPriorSquaredError = 0
		let landTotalCurrentRainModeled = 0
		let landTotalCurrentRainAbsoluteError = 0
		let landTotalCurrentRainSquaredError = 0
		let validationWeight = 0
		let validationObserved = 0
		let validationModeled = 0
		let validationAbsoluteError = 0
		let validationSquaredError = 0
		for (let month = 0; month < 12; month++) {
			let landWeight = 0
			let landObserved = 0
			let landModeled = 0
			let landAbsoluteError = 0
			let landCurrentRainModeled = 0
			let landCurrentRainAbsoluteError = 0
			let oceanWeight = 0
			let oceanObserved = 0
			let oceanModeled = 0
			let oceanAbsoluteError = 0
			let oceanCurrentRainModeled = 0
			let oceanCurrentRainAbsoluteError = 0
			for (let r = 0; r < N; r++) {
				const index = month * N + r
				const observed = observedPrecipitationMonthlyMm[index]
				if (!Number.isFinite(observed)) continue
				const modeled = result.precipitationMonthlyMm[index]
				const priorModeled = priorResult.precipitationMonthlyMm[index]
				const currentRainModeled = currentRainMonthlyMm[index]
				const noSstAnomalyModeledValue =
					noSstAnomalyResult.precipitationMonthlyMm[index]
				const weight = world.mesh.regionArea[r]
				const absoluteError = Math.abs(modeled - observed)
				const priorAbsoluteError = Math.abs(priorModeled - observed)
				const currentRainAbsoluteError = Math.abs(currentRainModeled - observed)
				totalWeight += weight
				totalObserved += observed * weight
				totalModeled += modeled * weight
				totalPriorModeled += priorModeled * weight
				totalCurrentRainModeled += currentRainModeled * weight
				totalAbsoluteError += absoluteError * weight
				totalSquaredError += (modeled - observed) ** 2 * weight
				totalPriorAbsoluteError += priorAbsoluteError * weight
				totalPriorSquaredError += (priorModeled - observed) ** 2 * weight
				totalCurrentRainAbsoluteError += currentRainAbsoluteError * weight
				totalCurrentRainSquaredError +=
					(currentRainModeled - observed) ** 2 * weight
				noSstAnomalyModeled += noSstAnomalyModeledValue * weight
				noSstAnomalyAbsoluteError +=
					Math.abs(noSstAnomalyModeledValue - observed) * weight
				noSstAnomalySquaredError +=
					(noSstAnomalyModeledValue - observed) ** 2 * weight
				weightedObservedSquared += observed * observed * weight
				weightedModeledSquared += modeled * modeled * weight
				weightedObservedModeled += observed * modeled * weight
				weightedCurrentRainSquared +=
					currentRainModeled * currentRainModeled * weight
				weightedObservedCurrentRain += observed * currentRainModeled * weight
				weightedNoSstAnomalySquared +=
					noSstAnomalyModeledValue * noSstAnomalyModeledValue * weight
				weightedObservedNoSstAnomaly +=
					observed * noSstAnomalyModeledValue * weight
				if (month % 2 === 1) {
					validationWeight += weight
					validationObserved += observed * weight
					validationModeled += modeled * weight
					validationAbsoluteError += absoluteError * weight
					validationSquaredError += (modeled - observed) ** 2 * weight
				}
				if (world.isLand[r]) {
					landWeight += weight
					landObserved += observed * weight
					landModeled += modeled * weight
					landAbsoluteError += absoluteError * weight
					landCurrentRainModeled += currentRainModeled * weight
					landCurrentRainAbsoluteError += currentRainAbsoluteError * weight
					landTotalWeight += weight
					landTotalObserved += observed * weight
					landTotalModeled += modeled * weight
					landTotalAbsoluteError += absoluteError * weight
					landTotalSquaredError += (modeled - observed) ** 2 * weight
					landTotalPriorModeled += priorModeled * weight
					landTotalPriorAbsoluteError += priorAbsoluteError * weight
					landTotalPriorSquaredError += (priorModeled - observed) ** 2 * weight
					landTotalCurrentRainModeled += currentRainModeled * weight
					landTotalCurrentRainAbsoluteError += currentRainAbsoluteError * weight
					landTotalCurrentRainSquaredError +=
						(currentRainModeled - observed) ** 2 * weight
				} else {
					oceanWeight += weight
					oceanObserved += observed * weight
					oceanModeled += modeled * weight
					oceanAbsoluteError += absoluteError * weight
					oceanCurrentRainModeled += currentRainModeled * weight
					oceanCurrentRainAbsoluteError += currentRainAbsoluteError * weight
				}
			}
			monthlyRows.push({
				month: month + 1,
				landObservedMm: Number((landObserved / landWeight).toFixed(1)),
				landModeledMm: Number((landModeled / landWeight).toFixed(1)),
				landMaeMm: Number((landAbsoluteError / landWeight).toFixed(1)),
				oceanObservedMm: Number((oceanObserved / oceanWeight).toFixed(1)),
				oceanModeledMm: Number((oceanModeled / oceanWeight).toFixed(1)),
				oceanMaeMm: Number((oceanAbsoluteError / oceanWeight).toFixed(1)),
			})
			currentRainMonthlyRows.push({
				month: month + 1,
				landObservedMm: Number((landObserved / landWeight).toFixed(1)),
				landCurrentRainMm: Number(
					(landCurrentRainModeled / landWeight).toFixed(1),
				),
				landMaeMm: Number(
					(landCurrentRainAbsoluteError / landWeight).toFixed(1),
				),
				oceanObservedMm: Number((oceanObserved / oceanWeight).toFixed(1)),
				oceanCurrentRainMm: Number(
					(oceanCurrentRainModeled / oceanWeight).toFixed(1),
				),
				oceanMaeMm: Number(
					(oceanCurrentRainAbsoluteError / oceanWeight).toFixed(1),
				),
			})
		}
		const observedMean = totalObserved / totalWeight
		const modeledMean = totalModeled / totalWeight
		const observedVariance =
			weightedObservedSquared / totalWeight - observedMean * observedMean
		const modeledVariance =
			weightedModeledSquared / totalWeight - modeledMean * modeledMean
		const covariance =
			weightedObservedModeled / totalWeight - observedMean * modeledMean
		const spatialTemporalCorrelation =
			covariance / Math.sqrt(observedVariance * modeledVariance)
		const currentRainMean = totalCurrentRainModeled / totalWeight
		const currentRainVariance =
			weightedCurrentRainSquared / totalWeight -
			currentRainMean * currentRainMean
		const currentRainCovariance =
			weightedObservedCurrentRain / totalWeight - observedMean * currentRainMean
		const currentRainSpatialTemporalCorrelation =
			currentRainCovariance / Math.sqrt(observedVariance * currentRainVariance)
		const noSstAnomalyMean = noSstAnomalyModeled / totalWeight
		const noSstAnomalyVariance =
			weightedNoSstAnomalySquared / totalWeight -
			noSstAnomalyMean * noSstAnomalyMean
		const noSstAnomalyCovariance =
			weightedObservedNoSstAnomaly / totalWeight -
			observedMean * noSstAnomalyMean
		const noSstAnomalyCorrelation =
			noSstAnomalyCovariance /
			Math.sqrt(observedVariance * noSstAnomalyVariance)
		console.info("Standalone water-rain literature-prior parameters")
		console.table(WATER_RAIN.PORTABLE_PRIOR_PARAMETERS)
		console.info(
			"Earth amount calibration: exchangeCoefficient fitted on Jan/Mar/May/Jul/Sep/Nov only",
			{
				amountFitMultiplier: Number(amountFitMultiplier.toFixed(4)),
				fittedExchangeCoefficient: Number(
					calibratedParameters.exchangeCoefficient.toPrecision(6),
				),
				heldOutMonths: "Feb/Apr/Jun/Aug/Oct/Dec",
			},
		)
		console.info("Standalone water-rain calibrated monthly comparison")
		console.table(monthlyRows)
		console.info("Current production rain model monthly baseline")
		console.table(currentRainMonthlyRows)
		console.info("Standalone water-rain prior global comparison", {
			cells: N,
			elapsedMs: Number(priorElapsedMs.toFixed(0)),
			maxTransportSteps: Math.max(...priorResult.transportSteps),
			maxRemainingMoistureFraction: Number(
				Math.max(...priorResult.remainingMoistureFraction).toExponential(3),
			),
			observedMeanMonthlyMm: Number(observedMean.toFixed(1)),
			modeledMeanMonthlyMm: Number(
				(totalPriorModeled / totalWeight).toFixed(1),
			),
			maeMm: Number((totalPriorAbsoluteError / totalWeight).toFixed(1)),
			rmseMm: Number(
				Math.sqrt(totalPriorSquaredError / totalWeight).toFixed(1),
			),
		})
		console.info("Standalone water-rain calibrated global comparison", {
			cells: N,
			elapsedMs: Number(calibratedElapsedMs.toFixed(0)),
			maxTransportSteps: Math.max(...result.transportSteps),
			maxRemainingMoistureFraction: Number(
				Math.max(...result.remainingMoistureFraction).toExponential(3),
			),
			observedMeanMonthlyMm: Number(observedMean.toFixed(1)),
			modeledMeanMonthlyMm: Number(modeledMean.toFixed(1)),
			biasMm: Number((modeledMean - observedMean).toFixed(1)),
			maeMm: Number((totalAbsoluteError / totalWeight).toFixed(1)),
			rmseMm: Number(Math.sqrt(totalSquaredError / totalWeight).toFixed(1)),
			spatialTemporalCorrelation: Number(spatialTemporalCorrelation.toFixed(3)),
			maxWaterBudgetResidualFraction: Number(
				Math.max(
					...result.waterBudgetResidualFraction.map(Math.abs),
				).toExponential(3),
			),
		})
		console.info("Current production rain model all-cell baseline", {
			observedMeanMonthlyMm: Number(observedMean.toFixed(1)),
			modeledMeanMonthlyMm: Number(currentRainMean.toFixed(1)),
			biasMm: Number((currentRainMean - observedMean).toFixed(1)),
			maeMm: Number((totalCurrentRainAbsoluteError / totalWeight).toFixed(1)),
			rmseMm: Number(
				Math.sqrt(totalCurrentRainSquaredError / totalWeight).toFixed(1),
			),
			spatialTemporalCorrelation: Number(
				currentRainSpatialTemporalCorrelation.toFixed(3),
			),
		})
		console.info("Warm/cold-current SST anomaly ablation", {
			withSstAnomaly: {
				meanMm: Number(modeledMean.toFixed(1)),
				maeMm: Number((totalAbsoluteError / totalWeight).toFixed(1)),
				rmseMm: Number(Math.sqrt(totalSquaredError / totalWeight).toFixed(1)),
				correlation: Number(spatialTemporalCorrelation.toFixed(3)),
			},
			withoutSstAnomaly: {
				meanMm: Number(noSstAnomalyMean.toFixed(1)),
				maeMm: Number((noSstAnomalyAbsoluteError / totalWeight).toFixed(1)),
				rmseMm: Number(
					Math.sqrt(noSstAnomalySquaredError / totalWeight).toFixed(1),
				),
				correlation: Number(noSstAnomalyCorrelation.toFixed(3)),
			},
		})
		console.info("Current production rain model land-only baseline", {
			observedMeanMonthlyMm: Number(
				(landTotalObserved / landTotalWeight).toFixed(1),
			),
			modeledMeanMonthlyMm: Number(
				(landTotalCurrentRainModeled / landTotalWeight).toFixed(1),
			),
			maeMm: Number(
				(landTotalCurrentRainAbsoluteError / landTotalWeight).toFixed(1),
			),
			rmseMm: Number(
				Math.sqrt(landTotalCurrentRainSquaredError / landTotalWeight).toFixed(
					1,
				),
			),
		})
		console.info("Land-only model scorecard", {
			currentProductionRain: {
				observedMeanMm: Number(
					(landTotalObserved / landTotalWeight).toFixed(1),
				),
				modeledMeanMm: Number(
					(landTotalCurrentRainModeled / landTotalWeight).toFixed(1),
				),
				maeMm: Number(
					(landTotalCurrentRainAbsoluteError / landTotalWeight).toFixed(1),
				),
				rmseMm: Number(
					Math.sqrt(landTotalCurrentRainSquaredError / landTotalWeight).toFixed(
						1,
					),
				),
			},
			standalonePortablePrior: {
				observedMeanMm: Number(
					(landTotalObserved / landTotalWeight).toFixed(1),
				),
				modeledMeanMm: Number(
					(landTotalPriorModeled / landTotalWeight).toFixed(1),
				),
				maeMm: Number(
					(landTotalPriorAbsoluteError / landTotalWeight).toFixed(1),
				),
				rmseMm: Number(
					Math.sqrt(landTotalPriorSquaredError / landTotalWeight).toFixed(1),
				),
			},
			standaloneEarthAmountFit: {
				observedMeanMm: Number(
					(landTotalObserved / landTotalWeight).toFixed(1),
				),
				modeledMeanMm: Number((landTotalModeled / landTotalWeight).toFixed(1)),
				maeMm: Number((landTotalAbsoluteError / landTotalWeight).toFixed(1)),
				rmseMm: Number(
					Math.sqrt(landTotalSquaredError / landTotalWeight).toFixed(1),
				),
			},
		})
		console.info("Held-out even-month comparison", {
			observedMeanMonthlyMm: Number(
				(validationObserved / validationWeight).toFixed(1),
			),
			modeledMeanMonthlyMm: Number(
				(validationModeled / validationWeight).toFixed(1),
			),
			maeMm: Number((validationAbsoluteError / validationWeight).toFixed(1)),
			rmseMm: Number(
				Math.sqrt(validationSquaredError / validationWeight).toFixed(1),
			),
		})

		expect(result.precipitationMonthlyMm.length).toBe(12 * N)
		expect(currentRainMonthlyMm.length).toBe(12 * N)
		expect(
			Math.max(...result.waterBudgetResidualFraction.map(Math.abs)),
		).toBeLessThan(0.01)
	})
})

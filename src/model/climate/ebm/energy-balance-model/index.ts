import { ALBEDO } from "@/model/climate/ebm/albedo"
import type { EBMConfig } from "@/model/climate/ebm/config"
import { CONSTANTS } from "@/model/climate/ebm/constants"
import type {
	RunModelParams,
	StepTemperatureParams,
} from "@/model/climate/ebm/energy-balance-model/types"
import { INSOLATION } from "@/model/climate/ebm/insolation"
import { UTILS } from "@/model/climate/ebm/utils"
import { TIME } from "@/model/shared/time"

export class EnergyBalanceModel {
	lats: number[] = []
	lats_deg: number[] = []
	sin_lats: number[] = []
	lat_bounds: number[] = []
	sin_lat_bounds: number[] = []
	dx: number[] = []
	heat_capacity: number[] = []
	insolation: number[][] = []
	daylightHours: number[][] = []
	temperature: number[][] = []
	temperature_avg: number[] = []
	temperature_min: number[] = []
	temperature_max: number[] = []
	albedo: number[][] = []
	olr: number[][] = []
	land_fraction: number[] = []

	config: EBMConfig

	lowerCoef: number[] = []
	upperCoef: number[] = []

	olrTRef = 288
	olrA = 0
	olrB = 0
	equilibriumGuess = 288
	internalHeatFlux = 0

	constructor(config: EBMConfig) {
		this.config = config
	}

	private computeDiffusionCoefficients(): void {
		const { grid, time, planet } = CONSTANTS.embConstants
		const hoursPerDay = this.config.time?.HOURS_PER_DAY || time.HOURS_PER_DAY
		const rotationFactor = Math.pow(hoursPerDay / TIME.hoursPerDay, 0.5)
		const radiusRatio =
			planet.EARTH_RADIUS / (this.config.radius || planet.EARTH_RADIUS)
		const radiusFactor = radiusRatio * radiusRatio
		const pressureFactor = Math.pow(this.config.pressure ?? 1.0, 0.5)
		const diffuser = (latDeg: number) => {
			const absLat = Math.abs(latDeg)
			return (
				(0.1 + 0.5 * Math.exp(-Math.pow((absLat - 45) / 25, 2))) *
				radiusFactor *
				pressureFactor *
				rotationFactor
			)
		}

		this.lowerCoef = new Array(grid.NUM_LAT).fill(0)
		this.upperCoef = new Array(grid.NUM_LAT).fill(0)

		for (let k = 1; k < grid.NUM_LAT; k++) {
			const xBoundary = 0.5 * (this.sin_lats[k] + this.sin_lats[k - 1])
			const cos2LatBoundary = 1 - xBoundary * xBoundary
			const dBar =
				0.5 *
				cos2LatBoundary *
				(diffuser(this.lats_deg[k]) + diffuser(this.lats_deg[k - 1]))
			const sinDiff = this.sin_lats[k] - this.sin_lats[k - 1]
			const boundaryCoef = Math.abs(sinDiff) > 0 ? dBar / sinDiff : 0

			if (Math.abs(this.dx[k - 1]) > 0) {
				this.upperCoef[k - 1] += boundaryCoef / this.dx[k - 1]
			}
			if (Math.abs(this.dx[k]) > 0) {
				this.lowerCoef[k] += boundaryCoef / this.dx[k]
			}
		}
	}

	private computeGreenhouseOLR(): void {
		const { stellar: defaultStellar, surface } = CONSTANTS.embConstants
		const stellar = this.config.stellar || defaultStellar
		const greenhouseFactor =
			this.config.greenhouseFactor ?? surface.GREENHOUSE_FACTOR
		const s0 =
			stellar.SIGMA *
			stellar.T_SUN ** 4 *
			((stellar.R_SUN * stellar.R_SUN) / (stellar.AU * stellar.AU))
		const albedoEstimate = this.config.albedo ?? surface.ALBEDO.BASE
		const internalHeatTempK = this.config.internalHeatTempK ?? 0
		this.internalHeatFlux = stellar.SIGMA * internalHeatTempK ** 4
		const meanSolarFlux = (s0 * (1 - albedoEstimate)) / 4
		const blackbodyTemp =
			((meanSolarFlux + this.internalHeatFlux) / stellar.SIGMA) ** 0.25

		this.olrTRef = blackbodyTemp
		this.olrB = (4 * stellar.SIGMA * this.olrTRef ** 3) / (1 + greenhouseFactor)
		this.olrA = (stellar.SIGMA * this.olrTRef ** 4) / (1 + greenhouseFactor)
		this.equilibriumGuess = this.olrTRef * (1 + greenhouseFactor / 4)
	}

	private seedPerLatitudeEquilibrium(): void {
		const { grid, surface } = CONSTANTS.embConstants
		const albedoEstimate = this.config.albedo ?? surface.ALBEDO.BASE
		const lower = new Array(grid.NUM_LAT)
		const diag = new Array(grid.NUM_LAT)
		const upper = new Array(grid.NUM_LAT)
		const rhs = new Array(grid.NUM_LAT)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			const meanAbsorbed =
				UTILS.meanOf(this.insolation[i]) * (1 - albedoEstimate) +
				this.internalHeatFlux
			lower[i] = -this.lowerCoef[i]
			upper[i] = -this.upperCoef[i]
			diag[i] = this.olrB + this.lowerCoef[i] + this.upperCoef[i]
			rhs[i] = meanAbsorbed - this.olrA + this.olrB * this.olrTRef
		}
		const meanTemps = UTILS.solveTridiagonal({ lower, diag, upper, rhs })
		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.temperature[i].fill(meanTemps[i])
		}
	}

	stepTemperature(params: StepTemperatureParams): void {
		const { tIdx, dt, lower, diag, upper } = params
		const { grid, time } = CONSTANTS.embConstants
		const nextIdx = (tIdx + 1) % time.DAYS_PER_YEAR
		const rhs = new Array(grid.NUM_LAT).fill(0)

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const absorbed =
				this.insolation[i][tIdx] * (1 - this.albedo[i][tIdx]) +
				this.internalHeatFlux
			this.olr[i][tIdx] =
				this.olrA + this.olrB * (this.temperature[i][tIdx] - this.olrTRef)

			rhs[i] =
				this.heat_capacity[i] * this.temperature[i][tIdx] +
				dt * absorbed -
				dt * this.olrA +
				dt * this.olrB * this.olrTRef
		}

		const newTemps = UTILS.solveTridiagonal({ lower, diag, upper, rhs })
		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.temperature[i][nextIdx] = newTemps[i]
		}

		ALBEDO.update({
			albedo: this.albedo,
			temperature: this.temperature,
			time: nextIdx,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
			iceAlbedoFeedback: this.config.iceAlbedoFeedback,
			pressure: this.config.pressure,
		})
	}

	initModel() {
		const { grid, thermal } = CONSTANTS.embConstants
		const pressure = this.config.pressure ?? 1.0
		const pressureCapFactor = Math.pow(pressure, 0.7)
		this.land_fraction = this.config.landFraction || ALBEDO.landFraction()

		this.computeGreenhouseOLR()

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const lat = -Math.PI / 2 + (Math.PI * i) / (grid.NUM_LAT - 1)
			this.lats.push(lat)
			this.lats_deg.push(UTILS.radiansToDegrees(lat))
			this.sin_lats.push(Math.sin(lat))
		}

		for (let i = 0; i < grid.NUM_LAT + 1; i++) {
			const latBound = -Math.PI / 2 + (Math.PI * i) / grid.NUM_LAT
			this.lat_bounds.push(latBound)
			this.sin_lat_bounds.push(Math.sin(latBound))
		}

		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.dx.push(this.sin_lat_bounds[i + 1] - this.sin_lat_bounds[i])
			this.heat_capacity.push(
				(thermal.LAND_HEAT_CAPACITY * this.land_fraction[i] +
					thermal.OCEAN_HEAT_CAPACITY * (1 - this.land_fraction[i])) *
					pressureCapFactor,
			)
			this.temperature.push(
				new Array(CONSTANTS.embConstants.time.DAYS_PER_YEAR).fill(0),
			)
			this.albedo.push(
				new Array(CONSTANTS.embConstants.time.DAYS_PER_YEAR).fill(0),
			)
			this.olr.push(
				new Array(CONSTANTS.embConstants.time.DAYS_PER_YEAR).fill(0),
			)
		}

		this.computeDiffusionCoefficients()

		const { _insolation, _daylight_hours } = INSOLATION.compute({
			lats: this.lats,
			orbital: this.config.orbital,
			stellarOverride: this.config.stellar,
		})
		this.insolation = _insolation
		this.daylightHours = _daylight_hours

		this.seedPerLatitudeEquilibrium()

		ALBEDO.update({
			albedo: this.albedo,
			temperature: this.temperature,
			time: 0,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
			iceAlbedoFeedback: this.config.iceAlbedoFeedback,
			pressure: this.config.pressure,
		})
	}

	runModel(params: RunModelParams): void {
		const { years, dtDays } = params
		this.initModel()
		const { grid, time } = CONSTANTS.embConstants
		const yearLengthDays =
			this.config.time?.YEAR_LENGTH_DAYS || time.DAYS_PER_YEAR
		const secondsPerSampleDay =
			(yearLengthDays / time.DAYS_PER_YEAR) * TIME.secondsPerDay
		const dt = dtDays * secondsPerSampleDay
		const stepsPerDay = Math.floor(1 / dtDays)
		const totalSteps = time.DAYS_PER_YEAR * stepsPerDay * years
		let lastTemp = this.temperature.map((row) => row.map(() => 0))

		const lower = new Array(grid.NUM_LAT)
		const diag = new Array(grid.NUM_LAT)
		const upper = new Array(grid.NUM_LAT)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			lower[i] = -dt * this.lowerCoef[i]
			upper[i] = -dt * this.upperCoef[i]
			diag[i] =
				this.heat_capacity[i] +
				dt * (this.lowerCoef[i] + this.upperCoef[i]) +
				dt * this.olrB
		}

		for (let step = 0; step < totalSteps; step++) {
			const day = Math.floor(step / stepsPerDay)
			const tIdx = day % time.DAYS_PER_YEAR
			if (step % Math.floor(totalSteps / 10) === 0) {
				let delta = 0
				for (let i = 0; i < grid.NUM_LAT; i++) {
					for (let j = 0; j < time.DAYS_PER_YEAR; j++) {
						delta += Math.abs(lastTemp[i][j] - this.temperature[i][j])
					}
				}
				lastTemp = this.temperature.map((row) => row.slice())
				if (delta < 5) break
			}
			this.stepTemperature({ tIdx, dt, lower, diag, upper })
		}

		for (const row of this.temperature) {
			for (let i = 0; i < row.length; i++) {
				row[i] = UTILS.kelvinToCelsius(Number.isNaN(row[i]) ? 0 : row[i])
			}
		}

		const seismologyTotalHeatingK = this.config.seismologyTotalHeatingK ?? 0
		if (seismologyTotalHeatingK > 0) {
			const seismology4 = seismologyTotalHeatingK ** 4
			for (const row of this.temperature) {
				for (let i = 0; i < row.length; i++) {
					const kelvin = UTILS.celsiusToKelvin(row[i])
					row[i] = UTILS.kelvinToCelsius((kelvin ** 4 + seismology4) ** 0.25)
				}
			}
		}

		this.temperature_avg = this.temperature.map((row) => UTILS.meanOf(row))
		this.temperature_min = this.temperature.map((row) => UTILS.minOf(row))
		this.temperature_max = this.temperature.map((row) => UTILS.maxOf(row))
	}
}

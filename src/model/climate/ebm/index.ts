import { ALBEDO } from "./albedo"
import { EMB_CONSTANTS } from "./constants"
import { INSOLATION } from "./insolation"

/* eslint-disable camelcase */

interface EBMConfig {
	orbital: typeof EMB_CONSTANTS.orbital
	stellar?: typeof EMB_CONSTANTS.stellar
	landFraction?: number[]
	radius?: number
	pressure?: number
	insolationFactor?: number
	time?: {
		YEAR_LENGTH_DAYS?: number
		HOURS_PER_DAY?: number
	}
}

const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)
const kelvinToCelsius = (kelvin: number) => kelvin - 273.15

function meanOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let sum = 0
	for (const value of values) sum += value
	return sum / values.length
}

function minOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] < result) result = values[i]
	}
	return result
}

function maxOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] > result) result = values[i]
	}
	return result
}

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

	constructor(config: EBMConfig) {
		this.config = config
	}

	heatDiffusion(tIdx: number): number[] {
		const { grid, time, planet } = EMB_CONSTANTS
		const hoursPerDay = this.config.time?.HOURS_PER_DAY || time.HOURS_PER_DAY
		const rotationFactor = Math.pow(hoursPerDay / 24, 0.5)
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

		const currentTemp = this.temperature.map((row) => row[tIdx])
		const fluxSN = new Array(grid.NUM_LAT + 1).fill(0)
		for (let i = 1; i < grid.NUM_LAT; i++) {
			const effectiveD = diffuser(this.lats_deg[i])
			const xBoundary = 0.5 * (this.sin_lats[i] + this.sin_lats[i - 1])
			const dTdx =
				Math.abs(this.sin_lats[i] - this.sin_lats[i - 1]) > 0
					? (currentTemp[i] - currentTemp[i - 1]) /
						(this.sin_lats[i] - this.sin_lats[i - 1])
					: 0
			const cos2LatBoundary = 1 - xBoundary * xBoundary
			fluxSN[i] = -effectiveD * cos2LatBoundary * dTdx
		}

		const fluxNS = new Array(grid.NUM_LAT + 1).fill(0)
		for (let i = 0; i < grid.NUM_LAT - 1; i++) {
			const effectiveD = diffuser(this.lats_deg[i])
			const xBoundary = 0.5 * (this.sin_lats[i + 1] + this.sin_lats[i])
			const dTdx =
				Math.abs(this.sin_lats[i + 1] - this.sin_lats[i]) > 0
					? (currentTemp[i] - currentTemp[i + 1]) /
						(this.sin_lats[i] - this.sin_lats[i + 1])
					: 0
			const cos2LatBoundary = 1 - xBoundary * xBoundary
			fluxNS[i + 1] = -effectiveD * cos2LatBoundary * dTdx
		}

		const flux = new Array(grid.NUM_LAT + 1).fill(0)
		for (let i = 0; i <= grid.NUM_LAT; i++) {
			flux[i] = 0.5 * (fluxSN[i] + fluxNS[i])
		}

		return new Array(grid.NUM_LAT)
			.fill(0)
			.map((_, i) =>
				Math.abs(this.dx[i]) > 0 ? -(flux[i + 1] - flux[i]) / this.dx[i] : 0,
			)
	}

	stepTemperature(tIdx: number, dt: number): void {
		const { grid, surface, time } = EMB_CONSTANTS
		const pressure = this.config.pressure ?? 1.0
		const olrA = surface.OLR_A + 15 * Math.log(1 / pressure)
		const olrB = surface.OLR_B * Math.pow(1 / pressure, 0.15)
		const nextIdx = (tIdx + 1) % time.DAYS_PER_YEAR
		const absorbed = new Array(grid.NUM_LAT).fill(0)

		for (let i = 0; i < grid.NUM_LAT; i++) {
			absorbed[i] = this.insolation[i][tIdx] * (1 - this.albedo[i][tIdx])
			this.olr[i][tIdx] =
				olrA + olrB * (this.temperature[i][tIdx] - surface.OLR_T_REF)
		}

		const diffTerm = this.heatDiffusion(tIdx)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			const dTdt =
				(absorbed[i] - this.olr[i][tIdx] + diffTerm[i]) / this.heat_capacity[i]
			this.temperature[i][nextIdx] = this.temperature[i][tIdx] + dTdt * dt
		}

		ALBEDO.update({
			albedo: this.albedo,
			lats_deg: this.lats_deg,
			temperature: this.temperature,
			land_fraction: this.land_fraction,
			time: nextIdx,
			orbital: this.config.orbital,
		})
	}

	initModel() {
		const { grid, thermal } = EMB_CONSTANTS
		const pressure = this.config.pressure ?? 1.0
		const pressureCapFactor = Math.pow(pressure, 0.7)
		this.land_fraction = this.config.landFraction || ALBEDO.landFraction()

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const lat = -Math.PI / 2 + (Math.PI * i) / (grid.NUM_LAT - 1)
			this.lats.push(lat)
			this.lats_deg.push(radiansToDegrees(lat))
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
				new Array(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(288),
			)
			this.albedo.push(new Array(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0))
			this.olr.push(new Array(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0))
		}

		const { _insolation, _daylight_hours } = INSOLATION.compute(
			this.lats,
			this.config.orbital,
			this.config.stellar,
		)
		this.insolation = _insolation
		this.daylightHours = _daylight_hours

		ALBEDO.update({
			albedo: this.albedo,
			lats_deg: this.lats_deg,
			temperature: this.temperature,
			land_fraction: this.land_fraction,
			time: 0,
			orbital: this.config.orbital,
		})
	}

	runModel(years: number, dtDays: number): void {
		this.initModel()
		const { grid, time } = EMB_CONSTANTS
		const secondsPerDay = 24 * 3600
		const yearLengthDays =
			this.config.time?.YEAR_LENGTH_DAYS || time.DAYS_PER_YEAR
		const secondsPerSampleDay =
			(yearLengthDays / time.DAYS_PER_YEAR) * secondsPerDay
		const dt = dtDays * secondsPerSampleDay
		const stepsPerDay = Math.floor(1 / dtDays)
		const totalSteps = time.DAYS_PER_YEAR * stepsPerDay * years
		let lastTemp = this.temperature.map((row) => row.map(() => 0))

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
			this.stepTemperature(tIdx, dt)
		}

		for (const row of this.temperature) {
			for (let i = 0; i < row.length; i++) {
				row[i] = kelvinToCelsius(Number.isNaN(row[i]) ? 0 : row[i])
			}
		}

		this.temperature_avg = this.temperature.map((row) => meanOf(row))
		this.temperature_min = this.temperature.map((row) => minOf(row))
		this.temperature_max = this.temperature.map((row) => maxOf(row))

		const insolMul = this.config.insolationFactor ?? 1
		if (insolMul !== 1) {
			for (let i = 0; i < this.insolation.length; i++) {
				for (let j = 0; j < this.insolation[i].length; j++) {
					this.insolation[i][j] *= insolMul
				}
			}
		}
	}
}

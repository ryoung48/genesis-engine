import * as d3 from "d3"
import { range } from "d3"

import { MATH } from "../../utilities/math"
import { ALBEDO } from "./albedo"
import { EMB_CONSTANTS } from "./constants"
import { INSOLATION } from "./insolation"

/* eslint-disable camelcase */

export interface EBMConfig {
	orbital: typeof EMB_CONSTANTS.orbital
	stellar?: typeof EMB_CONSTANTS.stellar
	landFraction?: number[]
	radius?: number // planet radius in meters
	time?: {
		YEAR_LENGTH_DAYS?: number
		HOURS_PER_DAY?: number
	}
}

export class EnergyBalanceModel {
	// Create latitude grid (in radians and degrees) and sin(lat)
	lats: number[] = []
	lats_deg: number[] = []
	sin_lats: number[] = []

	// For cell boundaries in sin(latitude) space
	lat_bounds: number[] = []
	sin_lat_bounds: number[] = []
	dx: number[] = []
	heat_capacity: number[] = []

	// Allocate 2D arrays: dimensions [NUM_LAT][DAYS_PER_YEAR]
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
		const { grid, time, planet } = EMB_CONSTANTS // Use constants for grid/time as they are structural
		const hoursPerDay = this.config.time?.HOURS_PER_DAY || time.HOURS_PER_DAY
		const earthDayHours = 24.0
		const rotationFactor = Math.pow(earthDayHours / hoursPerDay, 0.5)
		const radiusRatio = planet.EARTH_RADIUS / (this.config.radius || planet.EARTH_RADIUS)
		const radiusFactor = radiusRatio * radiusRatio // D scales as 1/R²

		const diffuser = (latDeg: number) => {
			const absLat = Math.abs(latDeg)
			return (0.1 + 0.5 * Math.exp(-Math.pow((absLat - 45) / 25, 2))) * radiusFactor
		}

		const T: number[] = this.temperature.map((row) => row[tIdx])

		const fluxSN: number[] = new Array(grid.NUM_LAT + 1).fill(0)
		for (let i = 1; i < grid.NUM_LAT; i++) {
			const effectiveD = diffuser(this.lats_deg[i]) * rotationFactor
			const xBoundary = 0.5 * (this.sin_lats[i] + this.sin_lats[i - 1])
			const dTdx =
				Math.abs(this.sin_lats[i] - this.sin_lats[i - 1]) > 0
					? (T[i] - T[i - 1]) / (this.sin_lats[i] - this.sin_lats[i - 1])
					: 0
			const cos2LatBoundary = 1.0 - xBoundary * xBoundary
			fluxSN[i] = -effectiveD * cos2LatBoundary * dTdx
		}
		fluxSN[0] = 0.0
		fluxSN[grid.NUM_LAT] = 0.0

		const fluxNS: number[] = new Array(grid.NUM_LAT + 1).fill(0)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			const effectiveD = diffuser(this.lats_deg[i]) * rotationFactor
			const xBoundary = 0.5 * (this.sin_lats[i + 1] + this.sin_lats[i])
			const dTdx =
				Math.abs(this.sin_lats[i + 1] - this.sin_lats[i]) > 0
					? (T[i] - T[i + 1]) / (this.sin_lats[i] - this.sin_lats[i + 1])
					: 0
			const cos2LatBoundary = 1.0 - xBoundary * xBoundary
			fluxNS[i + 1] = -effectiveD * cos2LatBoundary * dTdx
		}
		fluxNS[0] = 0.0
		fluxNS[grid.NUM_LAT] = 0.0

		const flux: number[] = new Array(grid.NUM_LAT + 1).fill(0)
		for (let i = 0; i <= grid.NUM_LAT; i++) {
			flux[i] = 0.5 * (fluxSN[i] + fluxNS[i])
		}
		const diffTerm: number[] = new Array(grid.NUM_LAT).fill(0)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			diffTerm[i] =
				Math.abs(this.dx[i]) > 0 ? -(flux[i + 1] - flux[i]) / this.dx[i] : 0
		}
		return diffTerm
	}

	stepTemperature(tIdx: number, dt: number): void {
		const { grid, surface, time } = EMB_CONSTANTS
		const nextIdx = (tIdx + 1) % time.DAYS_PER_YEAR
		const absorbed: number[] = new Array(grid.NUM_LAT).fill(0)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			absorbed[i] = this.insolation[i][tIdx] * (1 - this.albedo[i][tIdx])
		}

		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.olr[i][tIdx] =
				surface.OLR_A +
				surface.OLR_B * (this.temperature[i][tIdx] - surface.OLR_T_REF)
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
		const { grid, time, thermal } = EMB_CONSTANTS

		// Use provided land fraction or calculate default
		this.land_fraction = this.config.landFraction || ALBEDO.landFraction()

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const lat = -Math.PI / 2 + (Math.PI * i) / (grid.NUM_LAT - 1)
			this.lats.push(lat)
			this.lats_deg.push(MATH.conversion.angles.degrees(lat))
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
				thermal.LAND_HEAT_CAPACITY * this.land_fraction[i] +
					thermal.OCEAN_HEAT_CAPACITY * (1 - this.land_fraction[i]),
			)
			this.temperature.push(new Array(time.DAYS_PER_YEAR).fill(288.0))
			this.albedo.push(new Array(time.DAYS_PER_YEAR).fill(0))
			this.olr.push(new Array(time.DAYS_PER_YEAR).fill(0))
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
		const yearLengthDays = this.config.time?.YEAR_LENGTH_DAYS || time.DAYS_PER_YEAR
		const secondsPerSampleDay = (yearLengthDays / time.DAYS_PER_YEAR) * secondsPerDay
		const dt = dtDays * secondsPerSampleDay
		const stepsPerDay = Math.floor(1.0 / dtDays)
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
				if (delta < 5) {
					break
				}
			}
			this.stepTemperature(tIdx, dt)
		}
		for (const i in this.temperature) {
			for (const j in this.temperature[i]) {
				this.temperature[i][j] = MATH.conversion.temperature.kelvin.celsius(
					isNaN(this.temperature[i][j]) ? 0 : this.temperature[i][j],
				)
			}
		}
		this.temperature_avg = this.temperature.map((row) => d3.mean(row) ?? 0)
		this.temperature_min = this.temperature.map((row) => d3.min(row) ?? 0)
		this.temperature_max = this.temperature.map((row) => d3.max(row) ?? 0)
	}
}

// Singleton wrapper for backward compatibility
let defaultInstance: EnergyBalanceModel | null = null
let _cachedWorldId: string | undefined = undefined

const scales = {
	heat: {
		daily: [d3.scaleLinear()],
		avg: d3.scaleLinear(),
		min: d3.scaleLinear(),
		max: d3.scaleLinear(),
	},
	daylight: {
		daily: [d3.scaleLinear()],
	},
}

export const EBM = {
	constants: EMB_CONSTANTS,
	get model() {
		// Check if we need to re-initialize because world changed
		if (window.world?.id !== _cachedWorldId || !defaultInstance) {
			_cachedWorldId = window.world?.id

			const world = window.world
			const config: EBMConfig = {
				orbital: { ...EMB_CONSTANTS.orbital },
				stellar: { ...EMB_CONSTANTS.stellar },
			}

			if (world) {
				if (world.obliquity !== undefined)
					config.orbital.OBLIQUITY = world.obliquity
				if (world.eccentricity !== undefined)
					config.orbital.ECCENTRICITY = world.eccentricity
				if (world.perihelion !== undefined)
					config.orbital.PERIHELION = world.perihelion
				if (world.tSun !== undefined && config.stellar)
					config.stellar.T_SUN = world.tSun
				if (world.daysPerYear !== undefined || world.hoursPerDay !== undefined)
					config.time = {
						YEAR_LENGTH_DAYS: world.daysPerYear,
						HOURS_PER_DAY: world.hoursPerDay,
					}
				if (world.radius !== undefined)
					config.radius = world.radius * 1000 // km to meters
			}

			defaultInstance = new EnergyBalanceModel(config)
			defaultInstance.runModel(30, 0.5)

			const { time } = EMB_CONSTANTS
			const {
				temperature_avg,
				temperature,
				temperature_min,
				temperature_max,
				daylightHours,
				lats_deg,
			} = defaultInstance

			scales.heat.avg = d3.scaleLinear().domain(lats_deg).range(temperature_avg)
			scales.heat.daily = range(time.DAYS_PER_YEAR).map((dayIdx) =>
				d3
					.scaleLinear()
					.domain(lats_deg)
					.range(lats_deg.map((_, i) => temperature[i][dayIdx])),
			)
			scales.heat.min = d3.scaleLinear().domain(lats_deg).range(temperature_min)
			scales.heat.max = d3.scaleLinear().domain(lats_deg).range(temperature_max)
			scales.daylight.daily = range(time.DAYS_PER_YEAR).map((dayIdx) =>
				d3
					.scaleLinear()
					.domain(lats_deg)
					.range(lats_deg.map((_, i) => daylightHours[i][dayIdx])),
			)
		}

		return {
			heat: defaultInstance!.temperature,
			heatW: [[0]],
			land: defaultInstance!.land_fraction,
			lats: defaultInstance!.lats_deg,
			insolation: defaultInstance!.insolation,
			scales,
			ice: [[0]],
			minHeat: defaultInstance!.temperature_min,
			maxHeat: defaultInstance!.temperature_max,
			daylightHours: defaultInstance!.daylightHours,
		}
	},
}

import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import type {
	RunModelParams,
	StepTemperatureParams,
} from "@/model/climate/temperature/ebm/energy-balance-model/types"
import { INSOLATION } from "@/model/climate/temperature/ebm/insolation"
import type {
	PoiseColumnTerms,
	PoiseColumnTermsParams,
	PoiseConfig,
	PoiseResult,
	PoiseRunParams,
} from "@/model/climate/temperature/ebm/poise/types"
import { SEASONAL_SURFACE } from "@/model/climate/temperature/ebm/seasonal-surface"
import { UTILS } from "@/model/climate/temperature/ebm/utils"
import type { Matrix2x2 } from "@/model/climate/temperature/ebm/utils/types"
import { TIME } from "@/model/shared/time"

// Planck reference temperature for the fixed linear OLR law (POISE fdOLRsms09
// linearization): OLR = planckA + planckB * (T - 273.15).
const PLANCK_REF_K = 273.15

// POISE advances coupled thermal and ice state across many substeps. This class
// keeps that mutable state isolated to one integration run.
class PoiseEnergyBalanceModel {
	private currentLand: number[] = []
	private currentOcean: number[] = []
	private iceMass: number[] = []
	ice_mass_balance: number[][] = []
	ice_mass: number[][] = []
	converged = false
	yearsRun = 0
	private get latitudeCount() {
		return this.config.discretization.latitudeCount
	}
	private get samplesPerYear() {
		return this.config.discretization.samplesPerYear
	}
	lats: number[] = []
	lats_deg: number[] = []
	sin_lats: number[] = []
	lat_bounds: number[] = []
	sin_lat_bounds: number[] = []
	dx: number[] = []
	insolation: number[][] = []
	daylightHours: number[][] = []
	declination: number[] = []
	temperature: number[][] = []
	temperature_avg: number[] = []
	temperature_min: number[] = []
	temperature_max: number[] = []
	land_fraction: number[] = []
	heat_capacity_land: number[] = []
	heat_capacity_ocean: number[] = []
	temperature_land: number[][] = []
	temperature_ocean: number[][] = []
	albedo_land: number[][] = []
	albedo_ocean: number[][] = []
	olr_land: number[][] = []
	olr_ocean: number[][] = []

	config: PoiseConfig

	lowerCoef: number[] = []
	upperCoef: number[] = []

	private olrA = 0
	private olrB = 0

	constructor(config: PoiseConfig) {
		this.config = config
	}

	private computeDiffusionCoefficients(): void {
		const { time, planet } = CONSTANTS.embConstants
		const hoursPerDay = this.config.time?.HOURS_PER_DAY || time.HOURS_PER_DAY
		const rotationFactor = Math.pow(hoursPerDay / TIME.hoursPerDay, 0.5)
		const radiusRatio =
			planet.EARTH_RADIUS / (this.config.radius || planet.EARTH_RADIUS)
		const radiusFactor = radiusRatio * radiusRatio
		const pressureFactor = Math.pow(this.config.pressure ?? 1.0, 0.5)
		const diffuser =
			this.config.seasonalSurface.diffusion *
			radiusFactor *
			pressureFactor *
			rotationFactor

		this.lowerCoef = new Array(this.latitudeCount).fill(0)
		this.upperCoef = new Array(this.latitudeCount).fill(0)

		for (let k = 1; k < this.latitudeCount; k++) {
			const xBoundary = this.sin_lat_bounds[k]
			const cos2LatBoundary = 1 - xBoundary * xBoundary
			const dBar = cos2LatBoundary * diffuser
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
		this.olrA = this.config.seasonalSurface.planckA
		this.olrB = this.config.seasonalSurface.planckB
	}

	private zenithOffsetForDay(dayIdx: number): number[] {
		const declination = this.declination[dayIdx]
		return this.lats.map((lat) => {
			const zenith = Math.abs(lat - declination)
			const sinZenith = Math.sin(zenith)
			return (0.08 * (3 * sinZenith * sinZenith - 1)) / 2
		})
	}

	private static readonly MIN_LAND_WATER_FRACTION = 0.1

	private buildColumnTerms(params: PoiseColumnTermsParams): PoiseColumnTerms {
		const { tIdx, dt, heatCapacity, temperature, albedo, olr } = params
		const diagSelf = new Array(this.latitudeCount)
		const rhs = new Array(this.latitudeCount)

		for (let i = 0; i < this.latitudeCount; i++) {
			const absorbed = this.insolation[i][tIdx] * (1 - albedo[i][tIdx])
			olr[i][tIdx] = this.olrA + this.olrB * (temperature[i] - PLANCK_REF_K)
			diagSelf[i] =
				heatCapacity[i] +
				dt * (this.lowerCoef[i] + this.upperCoef[i]) +
				dt * this.olrB
			rhs[i] =
				heatCapacity[i] * temperature[i] +
				dt * absorbed -
				dt * this.olrA +
				dt * this.olrB * PLANCK_REF_K
		}

		return { diagSelf, rhs }
	}

	private stepTemperature(params: StepTemperatureParams): void {
		const { tIdx, dt, lower, upper } = params
		const nu = this.config.landWaterCoupling

		const land = this.buildColumnTerms({
			tIdx,
			dt,
			heatCapacity: this.heat_capacity_land,
			temperature: this.currentLand,
			albedo: this.albedo_land,
			olr: this.olr_land,
		})
		const water = this.buildColumnTerms({
			tIdx,
			dt,
			heatCapacity: this.heat_capacity_ocean,
			temperature: this.currentOcean,
			albedo: this.albedo_ocean,
			olr: this.olr_ocean,
		})

		const diag: Matrix2x2[] = new Array(this.latitudeCount)
		const rhsLand = new Array(this.latitudeCount)
		const rhsWater = new Array(this.latitudeCount)
		for (let i = 0; i < this.latitudeCount; i++) {
			const landFrac = Math.min(
				1 - PoiseEnergyBalanceModel.MIN_LAND_WATER_FRACTION,
				Math.max(
					PoiseEnergyBalanceModel.MIN_LAND_WATER_FRACTION,
					this.land_fraction[i],
				),
			)
			const waterFrac = 1 - landFrac
			const nuLand = nu / landFrac
			const nuWater = nu / waterFrac

			diag[i] = {
				a: land.diagSelf[i] + dt * nuLand,
				b: -dt * nuLand,
				c: -dt * nuWater,
				d: water.diagSelf[i] + dt * nuWater,
			}
			rhsLand[i] = land.rhs[i]
			rhsWater[i] = water.rhs[i]
		}

		const solved = UTILS.solveBlockTridiagonal2x2({
			lowerLand: lower,
			lowerWater: lower,
			diag,
			upperLand: upper,
			upperWater: upper,
			rhsLand,
			rhsWater,
		})
		const seasonal = this.config.seasonalSurface
		const snowball = solved.water.every((temperature) => temperature <= 271.15)
		for (let i = 0; i < this.latitudeCount; i++) {
			const ice = SEASONAL_SURFACE.step({
				temperatureK: solved.land[i],
				iceMass: this.iceMass[i],
				dt,
				snowball,
				config: seasonal,
			})
			solved.land[i] = ice.temperatureK
			this.iceMass[i] = ice.iceMass
			this.ice_mass_balance[i][tIdx] += ice.massBalance * dt
			this.ice_mass[i][tIdx] = ice.iceMass
			this.temperature_land[i][tIdx] = solved.land[i]
			this.temperature_ocean[i][tIdx] = solved.water[i]
		}
		this.currentLand = solved.land
		this.currentOcean = solved.water
	}

	private updateAlbedo(tIdx: number) {
		const seasonal = this.config.seasonalSurface
		// POISE carries the previous step's zenith correction within each year.
		const zenithOffset = this.zenithOffsetForDay(Math.max(0, tIdx - 1))
		for (let i = 0; i < this.latitudeCount; i++) {
			this.albedo_land[i][tIdx] = SEASONAL_SURFACE.albedo({
				temperatureK: this.currentLand[i],
				iceMass: this.iceMass[i],
				baseAlbedo: seasonal.landAlbedo,
				iceAlbedo: seasonal.iceAlbedo,
				zenithOffset: zenithOffset[i],
			})
			this.albedo_ocean[i][tIdx] = SEASONAL_SURFACE.albedo({
				temperatureK: this.currentOcean[i],
				iceMass: 0,
				baseAlbedo: seasonal.waterAlbedo,
				iceAlbedo: seasonal.iceAlbedo,
				zenithOffset: zenithOffset[i],
			})
		}
	}

	private initModel() {
		if (
			!Number.isInteger(this.latitudeCount) ||
			this.latitudeCount < 2 ||
			!Number.isInteger(this.samplesPerYear) ||
			this.samplesPerYear < 1
		) {
			throw new Error(
				"EBM requires at least two latitudes and one seasonal sample",
			)
		}
		const cycleYears = this.config.seasonalSurface.iceResetYears
		if (!Number.isInteger(cycleYears) || cycleYears < 1)
			throw new Error("Ice reset years must be a positive integer")
		if (
			this.config.landFraction &&
			(this.config.landFraction.length !== this.latitudeCount ||
				this.config.landFraction.some(
					(fraction) =>
						!Number.isFinite(fraction) || fraction < 0 || fraction > 1,
				))
		) {
			throw new Error(
				"Land fractions must match the latitude grid and lie between zero and one",
			)
		}
		for (const values of [
			this.lats,
			this.lats_deg,
			this.sin_lats,
			this.lat_bounds,
			this.sin_lat_bounds,
			this.dx,
			this.heat_capacity_land,
			this.heat_capacity_ocean,
			this.temperature,
			this.temperature_land,
			this.temperature_ocean,
			this.albedo_land,
			this.albedo_ocean,
			this.olr_land,
			this.olr_ocean,
			this.ice_mass,
			this.ice_mass_balance,
		])
			values.length = 0
		this.iceMass = new Array(this.latitudeCount).fill(0)
		this.converged = false
		this.yearsRun = 0
		const pressure = this.config.pressure ?? 1.0
		const pressureCapFactor = Math.pow(pressure, 0.7)
		this.land_fraction =
			this.config.landFraction ?? new Array(this.latitudeCount).fill(0.34)

		this.computeGreenhouseOLR()

		for (let i = 0; i < this.latitudeCount; i++) {
			const lat =
				this.config.discretization.latitudeGrid === "equal-area"
					? Math.asin(-1 + (2 * i + 1) / this.latitudeCount)
					: -Math.PI / 2 + (Math.PI * i) / (this.latitudeCount - 1)
			this.lats.push(lat)
			this.lats_deg.push(UTILS.radiansToDegrees(lat))
			this.sin_lats.push(Math.sin(lat))
		}

		for (let i = 0; i < this.latitudeCount + 1; i++) {
			const latBound =
				this.config.discretization.latitudeGrid === "equal-area"
					? Math.asin(-1 + (2 * i) / this.latitudeCount)
					: i === 0
						? -Math.PI / 2
						: i === this.latitudeCount
							? Math.PI / 2
							: (this.lats[i - 1] + this.lats[i]) / 2
			this.lat_bounds.push(latBound)
			this.sin_lat_bounds.push(Math.sin(latBound))
		}

		const daysPerYear = this.samplesPerYear
		for (let i = 0; i < this.latitudeCount; i++) {
			this.dx.push(this.sin_lat_bounds[i + 1] - this.sin_lat_bounds[i])
			this.heat_capacity_land.push(
				this.config.seasonalSurface.landHeatCapacity * pressureCapFactor,
			)
			this.heat_capacity_ocean.push(
				this.config.seasonalSurface.waterHeatCapacity * pressureCapFactor,
			)
			this.temperature.push(new Array(daysPerYear).fill(0))
			this.temperature_land.push(new Array(daysPerYear).fill(0))
			this.temperature_ocean.push(new Array(daysPerYear).fill(0))
			this.albedo_land.push(new Array(daysPerYear).fill(0))
			this.albedo_ocean.push(new Array(daysPerYear).fill(0))
			this.olr_land.push(new Array(daysPerYear).fill(0))
			this.olr_ocean.push(new Array(daysPerYear).fill(0))
			this.ice_mass.push(new Array(daysPerYear).fill(0))
			this.ice_mass_balance.push(new Array(daysPerYear).fill(0))
		}

		this.computeDiffusionCoefficients()

		const { _insolation, _daylight_hours, _declination } = INSOLATION.compute({
			lats: this.lats,
			orbital: this.config.orbital,
			stellarOverride: this.config.stellar,
			sampleCount: this.config.discretization.insolationDays,
			startSolarLongitudeDegrees:
				this.config.discretization.startSolarLongitudeDegrees,
		})
		const forcingDays = [...Array(daysPerYear).keys()].map((i) =>
			Math.floor((i * _declination.length) / daysPerYear),
		)
		this.insolation = _insolation.map((row) =>
			forcingDays.map((day) => row[day]),
		)
		this.daylightHours = _daylight_hours.map((row) =>
			forcingDays.map((day) => row[day]),
		)
		this.declination = forcingDays.map((day) => _declination[day])

		for (const row of [...this.temperature_land, ...this.temperature_ocean])
			row.fill(288)
		this.currentLand = this.temperature_land.map((row) => row[0])
		this.currentOcean = this.temperature_ocean.map((row) => row[0])
	}

	runModel(params: RunModelParams): void {
		const { years, dtDays } = params
		if (
			!Number.isInteger(years) ||
			years < 1 ||
			!Number.isFinite(dtDays) ||
			dtDays <= 0
		) {
			throw new Error("EBM requires integer years >= 1 and finite dtDays > 0")
		}
		this.initModel()
		const samples = this.samplesPerYear
		const secondsPerSample =
			((this.config.time?.YEAR_LENGTH_DAYS ??
				CONSTANTS.embConstants.time.DAYS_PER_YEAR) *
				TIME.secondsPerDay) /
			samples
		const stepsPerSample = Math.max(
			1,
			Math.ceil(
				CONSTANTS.embConstants.time.DAYS_PER_YEAR / samples / dtDays - 1e-12,
			),
		)
		const dt = secondsPerSample / stepsPerSample
		const lower = this.lowerCoef.map((value) => -dt * value)
		const upper = this.upperCoef.map((value) => -dt * value)
		const cycleYears = this.config.seasonalSurface.iceResetYears
		let lastTempLand = this.temperature_land.map((row) => row.slice())
		let lastTempOcean = this.temperature_ocean.map((row) => row.slice())
		for (let year = 0; year < years; year++) {
			if (year % cycleYears === 0) this.iceMass.fill(0)
			for (let tIdx = 0; tIdx < samples; tIdx++) {
				for (const row of this.ice_mass_balance) row[tIdx] = 0
				for (let substep = 0; substep < stepsPerSample; substep++) {
					this.updateAlbedo(tIdx)
					this.stepTemperature({ tIdx, dt, lower, upper })
				}
				for (const row of this.ice_mass_balance) row[tIdx] /= secondsPerSample
			}
			this.yearsRun = year + 1
			if (this.yearsRun % cycleYears !== 0) continue
			let delta = 0
			for (let i = 0; i < this.latitudeCount; i++) {
				for (let j = 0; j < samples; j++) {
					delta = Math.max(
						delta,
						Math.abs(lastTempLand[i][j] - this.temperature_land[i][j]),
						Math.abs(lastTempOcean[i][j] - this.temperature_ocean[i][j]),
					)
				}
			}
			if (delta < 0.001) {
				this.converged = true
				break
			}
			lastTempLand = this.temperature_land.map((row) => row.slice())
			lastTempOcean = this.temperature_ocean.map((row) => row.slice())
		}

		for (const row of [...this.temperature_land, ...this.temperature_ocean]) {
			for (let i = 0; i < row.length; i++) {
				if (!Number.isFinite(row[i]))
					throw new Error("EBM produced non-finite temperature")
				row[i] = UTILS.kelvinToCelsius(row[i])
			}
		}

		for (let i = 0; i < this.latitudeCount; i++) {
			const landFrac = this.land_fraction[i]
			for (let d = 0; d < this.samplesPerYear; d++) {
				this.temperature[i][d] =
					landFrac * this.temperature_land[i][d] +
					(1 - landFrac) * this.temperature_ocean[i][d]
			}
		}

		this.temperature_avg = this.temperature.map((row) => UTILS.meanOf(row))
		this.temperature_min = this.temperature.map((row) => UTILS.minOf(row))
		this.temperature_max = this.temperature.map((row) => UTILS.maxOf(row))
	}
}

const earthClimate = {
	orbital: { OBLIQUITY: 23.44, ECCENTRICITY: 0.0167, PERIHELION: 102.94719 },
	stellar: {
		SIGMA: 5.670367e-8,
		T_SUN: (3.846e26 / (4 * Math.PI * 6.9634e8 ** 2 * 5.670367e-8)) ** 0.25,
		R_SUN: 6.9634e8,
		AU: 1.00000011 * 1.495978707e11,
	},
	time: { YEAR_LENGTH_DAYS: 3.155815248432e7 / 86400, HOURS_PER_DAY: 24 },
	discretization: {
		latitudeCount: 150,
		latitudeGrid: "equal-area",
		samplesPerYear: 60,
		insolationDays: 365,
		startSolarLongitudeDegrees: -90,
	},
	landFraction: new Array(150).fill(0.34),
	landWaterCoupling: 0.8,
	seasonalSurface: {
		planckA: 203.3,
		planckB: 2.09,
		diffusion: 0.58,
		landAlbedo: 0.363,
		waterAlbedo: 0.263,
		iceAlbedo: 0.6,
		landHeatCapacity: 1.55e7,
		waterHeatCapacity: 4.428e6 * 70,
		iceDepositionRate: 2.25e-5,
		ablationFactor: 2.3,
		iceResetYears: 4,
	},
} satisfies PoiseConfig

const pipeline = {
	...earthClimate,
	seasonalSurface: {
		...earthClimate.seasonalSurface,
		iceAlbedo: 0.45,
		ablationFactor: 3.5,
	},
} satisfies PoiseConfig

function run(params: PoiseRunParams): PoiseResult {
	const model = new PoiseEnergyBalanceModel(params.config)
	model.runModel({ years: params.years, dtDays: params.dtDays })
	return {
		latsDeg: model.lats_deg,
		temperature: model.temperature,
		temperatureAvg: model.temperature_avg,
		insolation: model.insolation,
		declination: model.declination,
		converged: model.converged,
		yearsRun: model.yearsRun,
	}
}

export const POISE = { earthClimate, pipeline, run }

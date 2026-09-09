import { ALBEDO } from "@/model/climate/temperature/ebm/albedo"
import type { EBMConfig } from "@/model/climate/temperature/ebm/config"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import type {
	RunModelParams,
	StepTemperatureParams,
} from "@/model/climate/temperature/ebm/energy-balance-model/types"
import { GREENHOUSE_MOISTURE } from "@/model/climate/temperature/ebm/greenhouse-moisture"
import { INSOLATION } from "@/model/climate/temperature/ebm/insolation"
import { UTILS } from "@/model/climate/temperature/ebm/utils"
import type { Matrix2x2 } from "@/model/climate/temperature/ebm/utils/types"
import { TIME } from "@/model/shared/time"

export class EnergyBalanceModel {
	lats: number[] = []
	lats_deg: number[] = []
	sin_lats: number[] = []
	lat_bounds: number[] = []
	sin_lat_bounds: number[] = []
	dx: number[] = []
	insolation: number[][] = []
	daylightHours: number[][] = []
	/** Solar declination (radians) per day of year -- used only for the
	 * zenith-angle albedo correction below. */
	declination: number[] = []
	/** Land-fraction-weighted blend of temperature_land/temperature_ocean --
	 * the only field external callers should read. Populated once runModel()
	 * finishes; empty/unused mid-run. */
	temperature: number[][] = []
	temperature_avg: number[] = []
	temperature_min: number[] = []
	temperature_max: number[] = []
	land_fraction: number[] = []

	/** Land and ocean within a latitude band are simulated as two independent
	 * thermal columns, not one land-fraction-blended average. A blended
	 * column freezes (and ice-albedo-locks) as soon as the BAND MEAN dips
	 * below the ice threshold, even in bands that are mostly open ocean --
	 * which erases the real mechanism (ocean thermal inertia keeping water
	 * open through a long polar night) that high-obliquity climate studies
	 * rely on to avoid a runaway snowball. Each column gets its own heat
	 * capacity and its own ice/albedo state; only the FINAL output blends
	 * them back into one number per band. */
	heat_capacity_land: number[] = []
	heat_capacity_ocean: number[] = []
	temperature_land: number[][] = []
	temperature_ocean: number[][] = []
	albedo_land: number[][] = []
	albedo_ocean: number[][] = []
	olr_land: number[][] = []
	olr_ocean: number[][] = []

	config: EBMConfig

	lowerCoef: number[] = []
	upperCoef: number[] = []

	olrTRef = 288
	olrA = 0
	olrB = 0
	equilibriumGuess = 288
	internalHeatFlux = 0
	private sigma = 5.67e-8
	private baseGreenhouseFactor = 0

	constructor(config: EBMConfig) {
		this.config = config
	}

	private static readonly DIFFUSION_COEFFICIENT = 0.5

	private computeDiffusionCoefficients(): void {
		const { grid, time, planet } = CONSTANTS.embConstants
		const hoursPerDay = this.config.time?.HOURS_PER_DAY || time.HOURS_PER_DAY
		const rotationFactor = Math.pow(hoursPerDay / TIME.hoursPerDay, 0.5)
		const radiusRatio =
			planet.EARTH_RADIUS / (this.config.radius || planet.EARTH_RADIUS)
		const radiusFactor = radiusRatio * radiusRatio
		const pressureFactor = Math.pow(this.config.pressure ?? 1.0, 0.5)
		const diffuser =
			EnergyBalanceModel.DIFFUSION_COEFFICIENT *
			radiusFactor *
			pressureFactor *
			rotationFactor

		this.lowerCoef = new Array(grid.NUM_LAT).fill(0)
		this.upperCoef = new Array(grid.NUM_LAT).fill(0)

		for (let k = 1; k < grid.NUM_LAT; k++) {
			const xBoundary = 0.5 * (this.sin_lats[k] + this.sin_lats[k - 1])
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
		this.sigma = stellar.SIGMA
		this.baseGreenhouseFactor = greenhouseFactor
	}

	// Cold/dry columns trap less longwave than the planet-wide greenhouseFactor
	// assumes (see greenhouse-moisture's module doc) -- re-derive local A/B
	// around the SAME global olrTRef but with a temperature-scaled effective
	// greenhouseFactor, using that column's own previous-step temperature as
	// the moisture proxy. Falls back to the plain global olrA/olrB when
	// iceAlbedoFeedback is off (real Sol bodies fit their greenhouseFactor
	// directly against known behavior; layering more synthetic feedback on
	// top would fight that fit, same reasoning as iceAlbedoFeedback itself).
	private localOlrCoefficients(temperatureK: number): {
		olrA: number
		olrB: number
	} {
		if ((this.config.iceAlbedoFeedback ?? true) === false) {
			return { olrA: this.olrA, olrB: this.olrB }
		}
		const g =
			this.baseGreenhouseFactor *
			GREENHOUSE_MOISTURE.moistureGreenhouseMultiplier(temperatureK)
		return {
			olrA: (this.sigma * this.olrTRef ** 4) / (1 + g),
			olrB: (4 * this.sigma * this.olrTRef ** 3) / (1 + g),
		}
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
		// Equilibrium here is a pure conduction/radiation balance -- it doesn't
		// depend on heat capacity, so land and ocean columns start from the
		// same seed (heat capacity only affects how fast/slow each column
		// responds afterward, which is exactly the point of splitting them).
		const meanTemps = UTILS.solveTridiagonal({ lower, diag, upper, rhs })
		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.temperature_land[i].fill(meanTemps[i])
			this.temperature_ocean[i].fill(meanTemps[i])
		}
	}

	// VPlanet POISE's seasonal albedo correction (fvAlbedoSeasonal): surfaces
	// reflect more at low sun angles (grazing incidence), so ice-free albedo
	// isn't flat across the year -- it wobbles with solar geometry. `zenith`
	// here is their simplified noon-zenith proxy (|lat - declination|), not a
	// true zenith angle, matching what they actually use.
	private zenithOffsetForDay(dayIdx: number): number[] {
		const declination = this.declination[dayIdx]
		return this.lats.map((lat) => {
			const zenith = Math.abs(lat - declination)
			const sinZenith = Math.sin(zenith)
			return (0.08 * (3 * sinZenith * sinZenith - 1)) / 2
		})
	}

	// Land and water fractions are clamped away from the extremes before
	// dividing -- a latitude band that's 100% ocean (or 100% land) would
	// otherwise blow up its own coupling coefficient (see thermal.
	// LAND_WATER_COUPLING's comment for why the coupling is scaled by
	// 1/fraction in the first place).
	private static readonly MIN_LAND_WATER_FRACTION = 0.1

	// Builds the same diag/rhs terms stepColumn used to compute standalone --
	// heat capacity stays dt-unscaled while diffusion/OLR (and, in
	// stepTemperature, the land/water coupling) are all dt-scaled flux terms.
	private buildColumnTerms(params: {
		tIdx: number
		dt: number
		heatCapacity: readonly number[]
		temperature: number[][]
		albedo: number[][]
		olr: number[][]
	}): { diagSelf: number[]; rhs: number[] } {
		const { tIdx, dt, heatCapacity, temperature, albedo, olr } = params
		const { grid } = CONSTANTS.embConstants
		const diagSelf = new Array(grid.NUM_LAT)
		const rhs = new Array(grid.NUM_LAT)

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const absorbed =
				this.insolation[i][tIdx] * (1 - albedo[i][tIdx]) + this.internalHeatFlux
			// Local A/B derived from THIS column's own previous-step
			// temperature -- land and ocean at the same latitude can end up
			// with different effective greenhouse strength once one is
			// colder/dryer than the other.
			const { olrA, olrB } = this.localOlrCoefficients(temperature[i][tIdx])
			olr[i][tIdx] = olrA + olrB * (temperature[i][tIdx] - this.olrTRef)
			diagSelf[i] =
				heatCapacity[i] +
				dt * (this.lowerCoef[i] + this.upperCoef[i]) +
				dt * olrB
			rhs[i] =
				heatCapacity[i] * temperature[i][tIdx] +
				dt * absorbed -
				dt * olrA +
				dt * olrB * this.olrTRef
		}

		return { diagSelf, rhs }
	}

	stepTemperature(params: StepTemperatureParams): void {
		const { tIdx, dt, lower, upper } = params
		const { grid, time, thermal } = CONSTANTS.embConstants
		const nextIdx = (tIdx + 1) % time.DAYS_PER_YEAR
		const nu = this.config.landWaterCoupling ?? thermal.LAND_WATER_COUPLING

		const land = this.buildColumnTerms({
			tIdx,
			dt,
			heatCapacity: this.heat_capacity_land,
			temperature: this.temperature_land,
			albedo: this.albedo_land,
			olr: this.olr_land,
		})
		const water = this.buildColumnTerms({
			tIdx,
			dt,
			heatCapacity: this.heat_capacity_ocean,
			temperature: this.temperature_ocean,
			albedo: this.albedo_ocean,
			olr: this.olr_ocean,
		})

		const diag: Matrix2x2[] = new Array(grid.NUM_LAT)
		const rhsLand = new Array(grid.NUM_LAT)
		const rhsWater = new Array(grid.NUM_LAT)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			const landFrac = Math.min(
				1 - EnergyBalanceModel.MIN_LAND_WATER_FRACTION,
				Math.max(
					EnergyBalanceModel.MIN_LAND_WATER_FRACTION,
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
		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.temperature_land[i][nextIdx] = solved.land[i]
			this.temperature_ocean[i][nextIdx] = solved.water[i]
		}

		const zenithOffset = this.zenithOffsetForDay(nextIdx)
		ALBEDO.update({
			albedo: this.albedo_land,
			temperature: this.temperature_land,
			time: nextIdx,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
			iceAlbedoFeedback: this.config.iceAlbedoFeedback,
			pressure: this.config.pressure,
			zenithOffset,
		})
		ALBEDO.update({
			albedo: this.albedo_ocean,
			temperature: this.temperature_ocean,
			time: nextIdx,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
			iceAlbedoFeedback: this.config.iceAlbedoFeedback,
			pressure: this.config.pressure,
			zenithOffset,
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

		const daysPerYear = CONSTANTS.embConstants.time.DAYS_PER_YEAR
		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.dx.push(this.sin_lat_bounds[i + 1] - this.sin_lat_bounds[i])
			this.heat_capacity_land.push(
				thermal.LAND_HEAT_CAPACITY * pressureCapFactor,
			)
			this.heat_capacity_ocean.push(
				thermal.OCEAN_HEAT_CAPACITY * pressureCapFactor,
			)
			this.temperature.push(new Array(daysPerYear).fill(0))
			this.temperature_land.push(new Array(daysPerYear).fill(0))
			this.temperature_ocean.push(new Array(daysPerYear).fill(0))
			this.albedo_land.push(new Array(daysPerYear).fill(0))
			this.albedo_ocean.push(new Array(daysPerYear).fill(0))
			this.olr_land.push(new Array(daysPerYear).fill(0))
			this.olr_ocean.push(new Array(daysPerYear).fill(0))
		}

		this.computeDiffusionCoefficients()

		const { _insolation, _daylight_hours, _declination } = INSOLATION.compute({
			lats: this.lats,
			orbital: this.config.orbital,
			stellarOverride: this.config.stellar,
		})
		this.insolation = _insolation
		this.daylightHours = _daylight_hours
		this.declination = _declination

		this.seedPerLatitudeEquilibrium()

		const initialZenithOffset = this.zenithOffsetForDay(0)
		ALBEDO.update({
			albedo: this.albedo_land,
			temperature: this.temperature_land,
			time: 0,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
			iceAlbedoFeedback: this.config.iceAlbedoFeedback,
			pressure: this.config.pressure,
			zenithOffset: initialZenithOffset,
		})
		ALBEDO.update({
			albedo: this.albedo_ocean,
			temperature: this.temperature_ocean,
			time: 0,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
			iceAlbedoFeedback: this.config.iceAlbedoFeedback,
			pressure: this.config.pressure,
			zenithOffset: initialZenithOffset,
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
		let lastTempLand = this.temperature_land.map((row) => row.map(() => 0))
		let lastTempOcean = this.temperature_ocean.map((row) => row.map(() => 0))

		const lower = new Array(grid.NUM_LAT)
		const upper = new Array(grid.NUM_LAT)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			lower[i] = -dt * this.lowerCoef[i]
			upper[i] = -dt * this.upperCoef[i]
		}

		// Land and ocean each converge (or fail to) at their own pace -- a
		// thin land column responds almost immediately, while a deep ocean
		// column can take many simulated years to stop drifting. Both must
		// settle before the run is considered converged.
		for (let step = 0; step < totalSteps; step++) {
			const day = Math.floor(step / stepsPerDay)
			const tIdx = day % time.DAYS_PER_YEAR
			if (step % Math.floor(totalSteps / 10) === 0) {
				let delta = 0
				for (let i = 0; i < grid.NUM_LAT; i++) {
					for (let j = 0; j < time.DAYS_PER_YEAR; j++) {
						delta += Math.abs(lastTempLand[i][j] - this.temperature_land[i][j])
						delta += Math.abs(
							lastTempOcean[i][j] - this.temperature_ocean[i][j],
						)
					}
				}
				lastTempLand = this.temperature_land.map((row) => row.slice())
				lastTempOcean = this.temperature_ocean.map((row) => row.slice())
				if (delta < 5) break
			}
			this.stepTemperature({ tIdx, dt, lower, upper })
		}

		for (const row of this.temperature_land) {
			for (let i = 0; i < row.length; i++) {
				row[i] = UTILS.kelvinToCelsius(Number.isNaN(row[i]) ? 0 : row[i])
			}
		}
		for (const row of this.temperature_ocean) {
			for (let i = 0; i < row.length; i++) {
				row[i] = UTILS.kelvinToCelsius(Number.isNaN(row[i]) ? 0 : row[i])
			}
		}

		const seismologyTotalHeatingK = this.config.seismologyTotalHeatingK ?? 0
		if (seismologyTotalHeatingK > 0) {
			const seismology4 = seismologyTotalHeatingK ** 4
			for (const row of [...this.temperature_land, ...this.temperature_ocean]) {
				for (let i = 0; i < row.length; i++) {
					const kelvin = UTILS.celsiusToKelvin(row[i])
					row[i] = UTILS.kelvinToCelsius((kelvin ** 4 + seismology4) ** 0.25)
				}
			}
		}

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const landFrac = this.land_fraction[i]
			for (let d = 0; d < time.DAYS_PER_YEAR; d++) {
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

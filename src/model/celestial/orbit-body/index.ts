export type * from "./types"

import { HOURS_PER_DAY } from "@/model/shared"
import type {
	DensityFromMassAndDiameterInput,
	MassFromDensityInput,
} from "./types"

export const EARTH_DIAMETER_KM = 12_742
export const EARTH_MASS_KG = 5.973886146404331e24
export const EARTH_RADIUS_M = (EARTH_DIAMETER_KM * 1000) / 2
// Earth's real mean density. It keeps generated Earth-sized bodies at one
// Earth mass when moon mechanics derive mass from a radius.
export const EARTH_MEAN_DENSITY_KG_M3 = 5515
export const SOLAR_DIAMETER_KM = 1_391_400
export const SOLAR_MASS_KG = 1.989e30
export const ASTRONOMICAL_UNIT_M = 1.496e11
export const GRAVITATIONAL_CONSTANT_M3_KG_S2 = 6.674e-11
const ROCKY_SIZE_DIAMETER_BANDS_KM = [
	[400, 800],
	[1000, 2000],
	[2800, 3600],
	[4000, 5600],
	[5600, 7200],
	[7200, 8800],
	[8800, 10400],
	[10400, 12000],
	[12000, 13600],
	[13600, 15200],
	[15200, 16800],
	[16800, 18400],
	[18400, 20000],
	[20000, 21600],
	[21600, 23199],
	[23200, 24800],
] as const

export const ORBIT_BODY = {
	sizeClassToRockyDiameterRangeKm(sizeClass: number): [number, number] {
		const boundedSizeClass = Math.max(
			0,
			Math.min(sizeClass, ROCKY_SIZE_DIAMETER_BANDS_KM.length - 1),
		)
		const [minKm, maxKm] = ROCKY_SIZE_DIAMETER_BANDS_KM[boundedSizeClass]!
		return [minKm, maxKm]
	},

	estimateRockySizeClassFromDiameterKm(diameterKm: number): number {
		for (
			let sizeClass = 0;
			sizeClass < ROCKY_SIZE_DIAMETER_BANDS_KM.length;
			sizeClass++
		) {
			const [minKm, maxKm] = ROCKY_SIZE_DIAMETER_BANDS_KM[sizeClass]!
			const isLastBand = sizeClass === ROCKY_SIZE_DIAMETER_BANDS_KM.length - 1
			if (
				diameterKm >= minKm &&
				(diameterKm < maxKm || (isLastBand && diameterKm <= maxKm))
			) {
				return sizeClass
			}
		}

		let closestSizeClass = 0
		let closestDelta = Number.POSITIVE_INFINITY
		for (
			let sizeClass = 0;
			sizeClass < ROCKY_SIZE_DIAMETER_BANDS_KM.length;
			sizeClass++
		) {
			const [minKm, maxKm] = ROCKY_SIZE_DIAMETER_BANDS_KM[sizeClass]!
			const midpointKm = (minKm + maxKm) / 2
			const delta = Math.abs(diameterKm - midpointKm)
			if (delta < closestDelta) {
				closestDelta = delta
				closestSizeClass = sizeClass
			}
		}
		return closestSizeClass
	},

	computeEarthRelativeDensity({
		massKg,
		diameterKm,
	}: DensityFromMassAndDiameterInput): number {
		const diameterEarths = diameterKm / EARTH_DIAMETER_KM
		const massEarths = massKg / EARTH_MASS_KG
		return massEarths / diameterEarths ** 3
	},

	massKgFromEarthRelativeDensity({
		diameterKm,
		densityEarthRelative,
	}: MassFromDensityInput): number {
		const diameterEarths = diameterKm / EARTH_DIAMETER_KM
		const massEarths = densityEarthRelative * diameterEarths ** 3
		return massEarths * EARTH_MASS_KG
	},

	computeGravityG({
		massKg,
		diameterKm,
	}: DensityFromMassAndDiameterInput): number {
		const massEarths = massKg / EARTH_MASS_KG
		const diameterEarths = diameterKm / EARTH_DIAMETER_KM
		return massEarths / diameterEarths ** 2
	},

	computeSolarDayHours(params: {
		siderealDayHours: number
		orbitalPeriodDays: number
		retrograde: boolean
	}): number | null {
		const { siderealDayHours, orbitalPeriodDays, retrograde } = params
		if (!(siderealDayHours > 0) || !(orbitalPeriodDays > 0)) return null

		const siderealCyclesPerHour = 1 / siderealDayHours
		const orbitalCyclesPerHour = 1 / (orbitalPeriodDays * HOURS_PER_DAY)
		const solarCyclesPerHour = retrograde
			? siderealCyclesPerHour + orbitalCyclesPerHour
			: siderealCyclesPerHour - orbitalCyclesPerHour

		if (Math.abs(solarCyclesPerHour) < 1e-9) return Number.POSITIVE_INFINITY
		if (solarCyclesPerHour <= 0) return Number.POSITIVE_INFINITY

		return 1 / solarCyclesPerHour
	},

	inferRetrogradeRotationFromAxialTiltDeg(axialTiltDeg: number): boolean {
		return axialTiltDeg > 90
	},
}

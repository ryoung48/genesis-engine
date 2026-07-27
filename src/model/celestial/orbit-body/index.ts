import type {
	DensityFromMassAndDiameterInput,
	MassFromDensityInput,
} from "@/model/celestial/orbit-body/types"
import { TIME } from "@/model/shared/time"

const earthDiameterKm = 12_742
const earthMassKg = 5.973886146404331e24
const earthRadiusM = (earthDiameterKm * 1000) / 2
// Earth's real mean density. It keeps generated Earth-sized bodies at one
// Earth mass when moon mechanics derive mass from a radius.
const earthMeanDensityKgM3 = 5515
const solarDiameterKm = 1_391_400
const solarMassKg = 1.989e30
const astronomicalUnitM = 1.496e11
const gravitationalConstantM3KgS2 = 6.674e-11
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
		const diameterEarths = diameterKm / earthDiameterKm
		const massEarths = massKg / earthMassKg
		return massEarths / diameterEarths ** 3
	},

	massKgFromEarthRelativeDensity({
		diameterKm,
		densityEarthRelative,
	}: MassFromDensityInput): number {
		const diameterEarths = diameterKm / earthDiameterKm
		const massEarths = densityEarthRelative * diameterEarths ** 3
		return massEarths * earthMassKg
	},

	computeGravityG({
		massKg,
		diameterKm,
	}: DensityFromMassAndDiameterInput): number {
		const massEarths = massKg / earthMassKg
		const diameterEarths = diameterKm / earthDiameterKm
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
		const orbitalCyclesPerHour = 1 / (orbitalPeriodDays * TIME.hoursPerDay)
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
	earthDiameterKm,
	earthMassKg,
	earthRadiusM,
	earthMeanDensityKgM3,
	solarDiameterKm,
	solarMassKg,
	astronomicalUnitM,
	gravitationalConstantM3KgS2,
}

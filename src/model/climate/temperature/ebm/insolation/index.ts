import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import type { InsolationComputeParams } from "@/model/climate/temperature/ebm/insolation/types"
import { TIME } from "@/model/shared/time"

function clampAcosInput(value: number): number {
	return Math.max(-1, Math.min(1, value))
}

export const INSOLATION = {
	compute: (params: InsolationComputeParams) => {
		const { lats, orbital, stellarOverride } = params
		const { time, stellar: defaultStellar, grid } = CONSTANTS.embConstants
		const stellar = stellarOverride || defaultStellar
		const _insolation: number[][] = new Array(grid.NUM_LAT)
			.fill(0)
			.map(() => new Array(time.DAYS_PER_YEAR).fill(0))
		const _daylight_hours: number[][] = new Array(grid.NUM_LAT)
			.fill(0)
			.map(() => new Array(time.DAYS_PER_YEAR).fill(0))
		const _declination: number[] = new Array(time.DAYS_PER_YEAR).fill(0)
		const obliquityRad = (orbital.OBLIQUITY * Math.PI) / 180
		const perihelionRad = (orbital.PERIHELION * Math.PI) / 180
		const PI = Math.PI
		const longP = perihelionRad + PI
		const ecc = orbital.ECCENTRICITY
		const equinoxOffsetRad = (40 * 2 * Math.PI) / time.DAYS_PER_YEAR
		let trueL = -equinoxOffsetRad
		let trueA = trueL - longP

		while (trueA < 0) trueA += 2 * PI

		const calcEccFromTrue = (p: {
			trueAnomaly: number
			eccentricity: number
		}): number => {
			const { trueAnomaly, eccentricity } = p
			const acosInput = clampAcosInput(
				(eccentricity + Math.cos(trueAnomaly)) /
					(1 + eccentricity * Math.cos(trueAnomaly)),
			)
			if (trueAnomaly > PI) {
				return 2 * PI - Math.acos(acosInput)
			}
			return Math.acos(acosInput)
		}

		let eccA = calcEccFromTrue({ trueAnomaly: trueA, eccentricity: ecc })
		let meanL = eccA - ecc * Math.sin(eccA) + longP
		const s0 =
			stellar.SIGMA *
			Math.pow(stellar.T_SUN, 4) *
			(Math.pow(stellar.R_SUN, 2) / Math.pow(stellar.AU, 2))

		for (let day = 0; day < time.DAYS_PER_YEAR; day++) {
			if (day !== 0) {
				meanL += (2 * PI) / time.DAYS_PER_YEAR
				const meanA = meanL - longP
				eccA = meanA
				for (let iter = 0; iter < 10; iter++) {
					eccA = meanA + ecc * Math.sin(eccA)
				}
				while (eccA >= 2 * PI) eccA -= 2 * PI
				while (eccA < 0) eccA += 2 * PI
				const trueAnomalyInput = clampAcosInput(
					(Math.cos(eccA) - ecc) / (1 - ecc * Math.cos(eccA)),
				)
				trueA =
					eccA > PI
						? 2 * PI - Math.acos(trueAnomalyInput)
						: Math.acos(trueAnomalyInput)
				trueL = trueA + longP
			}

			while (trueL > 2 * PI) trueL -= 2 * PI
			while (trueL < 0) trueL += 2 * PI

			const astroDist = (1 - ecc * ecc) / (1 + ecc * Math.cos(trueA))
			const declination = Math.asin(Math.sin(obliquityRad) * Math.sin(trueL))
			const sinDeclination = Math.sin(declination)
			const cosDeclination = Math.cos(declination)
			_declination[day] = declination

			for (let i = 0; i < grid.NUM_LAT; i++) {
				const lat = lats[i]
				const cosH0 = -Math.tan(lat) * Math.tan(declination)
				const sConst = s0 / (astroDist * astroDist)

				if (cosH0 <= -1) {
					_insolation[i][day] = sConst * Math.sin(lat) * sinDeclination
					_daylight_hours[i][day] = TIME.hoursPerDay
				} else if (cosH0 >= 1) {
					_insolation[i][day] = 0
					_daylight_hours[i][day] = 0
				} else {
					const hourAngle = Math.acos(cosH0)
					_daylight_hours[i][day] =
						(2 * hourAngle * TIME.hoursPerDay) / (2 * Math.PI)
					_insolation[i][day] =
						(sConst *
							(hourAngle * Math.sin(lat) * sinDeclination +
								Math.cos(lat) * cosDeclination * Math.sin(hourAngle))) /
						PI
				}

				_insolation[i][day] = Math.floor(_insolation[i][day])
			}
		}

		return { _insolation, _daylight_hours, _declination }
	},
}

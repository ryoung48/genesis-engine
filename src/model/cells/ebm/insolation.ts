import { EMB_CONSTANTS } from "./constants"

/* eslint-disable camelcase */
export const INSOLATION = {
	compute: (
		lats: number[],
		orbital: typeof EMB_CONSTANTS.orbital,
		stellarOverride?: typeof EMB_CONSTANTS.stellar,
	) => {
		const { time, stellar: defaultStellar, grid } = EMB_CONSTANTS
		const stellar = stellarOverride || defaultStellar
		const _insolation: number[][] = new Array(grid.NUM_LAT)
			.fill(0)
			.map(() => new Array(time.DAYS_PER_YEAR).fill(0))
		const _daylight_hours: number[][] = new Array(grid.NUM_LAT)
			.fill(0)
			.map(() => new Array(time.DAYS_PER_YEAR).fill(0))
		// Convert degrees to radians
		const obliquityRad = (orbital.OBLIQUITY * Math.PI) / 180
		const perihelionRad = (orbital.PERIHELION * Math.PI) / 180
		const PI = Math.PI

		// Calculate longitude of pericenter relative to direction of planet at spring equinox
		const longP = perihelionRad + PI

		// Calculate eccentricity
		const ecc = orbital.ECCENTRICITY

		// Initialize variables

		const equinoxOffsetRad = (40 * 2 * Math.PI) / time.DAYS_PER_YEAR
		let trueL = 0 - equinoxOffsetRad // Start at the appropriate offset from spring equinox
		let trueA = trueL - longP

		// Normalize true anomaly
		while (trueA < 0.0) {
			trueA += 2 * PI
		}

		// Calculate eccentric anomaly from true anomaly
		const calcEccFromTrue = (
			trueAnomaly: number,
			eccentricity: number,
		): number => {
			let eccAnomaly: number

			if (trueAnomaly > PI) {
				eccAnomaly =
					2 * PI -
					Math.acos(
						(eccentricity + Math.cos(trueAnomaly)) /
							(1 + eccentricity * Math.cos(trueAnomaly)),
					)
			} else {
				eccAnomaly = Math.acos(
					(eccentricity + Math.cos(trueAnomaly)) /
						(1 + eccentricity * Math.cos(trueAnomaly)),
				)
			}

			return eccAnomaly
		}

		// Calculate eccentric anomaly and mean longitude
		let eccA = calcEccFromTrue(trueA, ecc)
		let meanL = eccA - ecc * Math.sin(eccA) + longP

		const s0 =
			stellar.SIGMA *
			Math.pow(stellar.T_SUN, 4) *
			(Math.pow(stellar.R_SUN, 2) / Math.pow(stellar.AU, 2))

		// Loop through each day of the year
		for (let day = 0; day < time.DAYS_PER_YEAR; day++) {
			if (day !== 0) {
				// Update mean longitude for this day
				meanL = meanL + (2 * PI) / time.DAYS_PER_YEAR

				// Calculate mean anomaly
				const meanA = meanL - longP

				// Solve Kepler's equation to find eccentric anomaly
				// Initialize with mean anomaly
				eccA = meanA

				// Iterate to solve Kepler's equation
				for (let iter = 0; iter < 10; iter++) {
					eccA = meanA + ecc * Math.sin(eccA)
				}

				// Normalize eccentric anomaly
				while (eccA >= 2 * PI) {
					eccA -= 2 * PI
				}
				while (eccA < 0.0) {
					eccA += 2 * PI
				}

				// Calculate true anomaly from eccentric anomaly
				if (eccA > PI) {
					trueA =
						2 * PI -
						Math.acos((Math.cos(eccA) - ecc) / (1.0 - ecc * Math.cos(eccA)))
				} else {
					trueA = Math.acos(
						(Math.cos(eccA) - ecc) / (1.0 - ecc * Math.cos(eccA)),
					)
				}

				// Update true longitude
				trueL = trueA + longP
			}

			// Normalize true longitude
			while (trueL > 2 * PI) {
				trueL -= 2 * PI
			}
			while (trueL < 0.0) {
				trueL += 2 * PI
			}

			// Calculate planet-star distance (in units of semi-major axis)
			const astroDist = (1.0 - ecc * ecc) / (1.0 + ecc * Math.cos(trueA))

			// Calculate solar declination for this day
			const declination = Math.asin(Math.sin(obliquityRad) * Math.sin(trueL))
			const sinDeclination = Math.sin(declination)
			const cosDeclination = Math.cos(declination)

			// Calculate daily insolation for each latitude
			for (let i = 0; i < grid.NUM_LAT; i++) {
				const lat = lats[i]
				const cosH0 = -Math.tan(lat) * Math.tan(declination)

				// Solar constant adjusted for distance
				const sConst = s0 / (astroDist * astroDist)

				if (cosH0 <= -1) {
					// Polar day: sun always above horizon
					_insolation[i][day] = sConst * Math.sin(lat) * sinDeclination
					_daylight_hours[i][day] = 24
				} else if (cosH0 >= 1) {
					// Polar night: sun always below horizon
					_insolation[i][day] = 0
					_daylight_hours[i][day] = 0
				} else {
					// Regular day/night cycle
					const hourAngle = Math.acos(cosH0)
					_daylight_hours[i][day] = (2 * hourAngle * 24) / (2 * Math.PI)
					_insolation[i][day] =
						(sConst *
							(hourAngle * Math.sin(lat) * sinDeclination +
								Math.cos(lat) * cosDeclination * Math.sin(hourAngle))) /
						PI
				}

				// Rounding for consistency
				_insolation[i][day] = Math.floor(_insolation[i][day])
			}
		}
		return { _insolation, _daylight_hours }
	},
}

import type {
	MoonPrecessedBodyParams,
	MoonPrecessedParams,
	MoonPrecessionRates,
	MoonPrecessionRatesParams,
	PlanetOblatenessParams,
} from "@/model/celestial/moons/mechanics/precession/types"
import type { KeplerElements } from "@/model/celestial/moons/mechanics/types"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"

const SERIES_M_LIMIT = 0.1
const K2_FLUID = 0.94
const RAD = Math.PI / 180

function oblateness({
	planetRadiusM,
	planetMassKg,
	spinRateRadS,
}: PlanetOblatenessParams): number {
	const q =
		(spinRateRadS * spinRateRadS * planetRadiusM ** 3) /
		(ORBIT_BODY.gravitationalConstantM3KgS2 * planetMassKg)
	return (K2_FLUID * q) / 3
}

function rates({
	moon,
	semiMajorAxisM,
	planetRadiusM,
	planetMassKg,
	spinRateRadS,
	obliquityDeg,
	yearDays,
}: MoonPrecessionRatesParams): MoonPrecessionRates {
	if (!(moon.orbitalPeriodDays > 0 && yearDays > 0 && semiMajorAxisM > 0))
		return { nodeRadPerDay: 0, apsisRadPerDay: 0 }
	const n = (2 * Math.PI) / moon.orbitalPeriodDays
	const m = moon.orbitalPeriodDays / yearDays
	const cosI = Math.cos(moon.inclinationDeg * RAD)
	const series = m <= SERIES_M_LIMIT
	const node =
		n *
		cosI *
		(-0.75 * m ** 2 + (series ? (9 / 32) * m ** 3 + (273 / 128) * m ** 4 : 0))
	const apsis =
		n *
		cosI *
		(0.75 * m ** 2 + (series ? (225 / 32) * m ** 3 + (4071 / 128) * m ** 4 : 0))
	const node0 = moon.longitudeOfAscendingNodeDeg * RAD
	const inc = moon.inclinationDeg * RAD
	const tilt = obliquityDeg * RAD
	const cosEq =
		Math.cos(node0) * Math.sin(inc) * Math.sin(tilt) +
		Math.cos(inc) * Math.cos(tilt)
	const j2 = oblateness({ planetRadiusM, planetMassKg, spinRateRadS })
	const p = semiMajorAxisM * (1 - moon.eccentricity ** 2)
	const scale = n * j2 * (planetRadiusM / p) ** 2
	const nodeJ2 = -1.5 * scale * cosEq
	const apsisJ2 = nodeJ2 + 0.75 * scale * (5 * cosEq * cosEq - 1)
	return {
		nodeRadPerDay: node + nodeJ2,
		apsisRadPerDay: apsis + apsisJ2,
	}
}

function elements({ moon, rates: r, t }: MoonPrecessedParams): KeplerElements {
	return {
		orbitalPeriodDays: moon.orbitalPeriodDays,
		eccentricity: moon.eccentricity,
		inclinationDeg: moon.inclinationDeg,
		longitudeOfAscendingNodeDeg:
			moon.longitudeOfAscendingNodeDeg + (r.nodeRadPerDay * t) / RAD,
		longitudeOfPerihelionDeg:
			moon.longitudeOfPerihelionDeg + (r.apsisRadPerDay * t) / RAD,
		meanAnomalyAtEpochDeg:
			moon.meanAnomalyAtEpochDeg - (r.apsisRadPerDay * t) / RAD,
	}
}

function at(input: MoonPrecessedBodyParams): MoonBody {
	return { ...input.moon, ...elements(input) }
}

export const MOON_PRECESSION = { rates, elements, at, oblateness }

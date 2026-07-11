import { describe, it } from "vitest"
import { EMB_CONSTANTS } from "./constants"
import { EnergyBalanceModel } from "./index"

// Re-fits every Sol body's greenhouseFactor now that ice-albedo feedback is
// disabled in albedo.ts (see luna-repro/earth-refit) -- using the exact same
// full runModel(30, 0.5) bisection as earth-refit.smoke.test.ts, so every
// fitted value in sol-system.ts is consistent with the model as it exists
// today, not just Earth's.

const EARTH_RADIUS_M = EMB_CONSTANTS.planet.EARTH_RADIUS

function estimateGasGiantInternalHeatTempK(
	massEarths: number,
	ageGyr: number,
): number {
	return (113.6 * massEarths ** 0.25) / ageGyr
}

interface BodyCase {
	name: string
	auAU: number
	tiltDeg: number
	eccentricity: number
	diameterEarths: number
	pressureBar: number
	albedo: number
	hydrosphereFraction: number
	massEarths?: number
	targetC: number
	loGuess: number
	hiGuess: number
}

const SOL_STAR_AGE_GYR = 4.6

const CASES: BodyCase[] = [
	{
		name: "Venus",
		auAU: 0.723,
		tiltDeg: 177.36,
		eccentricity: 0.0068,
		diameterEarths: 0.9495,
		pressureBar: 92,
		albedo: 0.76,
		hydrosphereFraction: 0,
		targetC: 463.85,
		loGuess: 0,
		hiGuess: 20,
	},
	{
		name: "Mars",
		auAU: 1.524,
		tiltDeg: 25.19,
		eccentricity: 0.0934,
		diameterEarths: 0.532,
		pressureBar: 0.006,
		albedo: 0.25,
		hydrosphereFraction: 0.1,
		targetC: -63,
		loGuess: 0,
		hiGuess: 1,
	},
	{
		name: "Jupiter",
		auAU: 5.2,
		tiltDeg: 3.13,
		eccentricity: 0.049,
		diameterEarths: 11.209,
		pressureBar: 4200,
		albedo: 0.503,
		hydrosphereFraction: 1,
		massEarths: 317.83,
		targetC: -108,
		loGuess: 0,
		hiGuess: 5,
	},
	{
		name: "Saturn",
		auAU: 9.58,
		tiltDeg: 26.73,
		eccentricity: 0.0565,
		diameterEarths: 9.449,
		pressureBar: 2600,
		albedo: 0.342,
		hydrosphereFraction: 1,
		massEarths: 95.16,
		targetC: -139,
		loGuess: 0,
		hiGuess: 5,
	},
	{
		name: "Uranus",
		auAU: 19.22,
		tiltDeg: 97.8,
		eccentricity: 0.0464,
		diameterEarths: 4.007,
		pressureBar: 1300,
		albedo: 0.3,
		hydrosphereFraction: 1,
		massEarths: 14.54,
		targetC: -197,
		loGuess: 0,
		hiGuess: 5,
	},
	{
		name: "Neptune",
		auAU: 30.047,
		tiltDeg: 28.32,
		eccentricity: 0.009,
		diameterEarths: 3.883,
		pressureBar: 1500,
		albedo: 0.29,
		hydrosphereFraction: 1,
		massEarths: 17.15,
		targetC: -201,
		loGuess: 0,
		hiGuess: 10,
	},
	{
		name: "Pluto",
		auAU: 39.482,
		tiltDeg: 119.6,
		eccentricity: 0.248,
		diameterEarths: 0.186,
		pressureBar: 0.03,
		albedo: 0.72,
		hydrosphereFraction: 0.8,
		targetC: -229,
		loGuess: 0,
		hiGuess: 100,
	},
	{
		name: "Titan",
		auAU: 9.58,
		tiltDeg: 0.3,
		eccentricity: 0.0288,
		diameterEarths: 0.404,
		pressureBar: 1.45,
		albedo: 0.22,
		hydrosphereFraction: 0.4,
		targetC: -179.5,
		loGuess: 0,
		hiGuess: 3,
	},
]

function buildConfig(body: BodyCase, greenhouseFactor: number) {
	const internalHeatTempK = body.massEarths
		? estimateGasGiantInternalHeatTempK(body.massEarths, SOL_STAR_AGE_GYR)
		: 0
	return {
		orbital: {
			OBLIQUITY: body.tiltDeg,
			ECCENTRICITY: body.eccentricity,
			PERIHELION: 90,
		},
		stellar: {
			...EMB_CONSTANTS.stellar,
			AU: body.auAU * EMB_CONSTANTS.stellar.AU,
		},
		radius: body.diameterEarths * EARTH_RADIUS_M,
		pressure: body.pressureBar,
		albedo: body.albedo,
		landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(
			1 - body.hydrosphereFraction,
		),
		greenhouseFactor,
		internalHeatTempK,
		iceAlbedoFeedback: false,
	}
}

function areaWeightedMean(model: EnergyBalanceModel): number {
	let totalWeightedTemp = 0
	let totalArea = 0
	for (let i = 0; i < model.lats_deg.length; i++) {
		const latAvg =
			model.temperature[i].reduce((a, b) => a + b, 0) /
			model.temperature[i].length
		const areaWeight = model.dx[i]
		totalWeightedTemp += latAvg * areaWeight
		totalArea += areaWeight
	}
	return totalWeightedTemp / totalArea
}

describe("Sol bodies greenhouseFactor refit (ice-albedo feedback disabled)", () => {
	for (const body of CASES) {
		it(`bisects ${body.name}'s greenhouseFactor against its real ~${body.targetC}C target`, () => {
			let lo = body.loGuess
			let hi = body.hiGuess
			let bestG = hi
			let bestTemp = 0

			for (let iter = 0; iter < 40; iter++) {
				const mid = (lo + hi) / 2
				const model = new EnergyBalanceModel(buildConfig(body, mid))
				model.runModel(30, 0.5)
				const avg = areaWeightedMean(model)
				bestG = mid
				bestTemp = avg
				if (avg < body.targetC) {
					lo = mid
				} else {
					hi = mid
				}
			}

			console.log(
				`${body.name}: fitted greenhouseFactor = ${bestG}, avgTemp = ${bestTemp}`,
			)
		})
	}
})

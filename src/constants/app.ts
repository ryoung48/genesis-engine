import { LoadingStep } from "../types/app"

export const LOADING_STEPS: LoadingStep[] = [
	{ name: "Generating Continents", progress: 15 },
	{ name: "Raising Mountains", progress: 35 },
	{ name: "Simulating Climate", progress: 55 },
	{ name: "Dividing Territories", progress: 70 },
	{ name: "Writing History", progress: 90 },
	{ name: "Rendering World", progress: 100 },
]

export const catchupDelay = 300

export const EARTH_DEFAULTS = {
	obliquity: 23.5,
	eccentricity: 0.017,
	perihelion: 102,
	sunTempFactor: 1.0,
	landFraction: 0.3,
	radiusFactor: 1.0,
}

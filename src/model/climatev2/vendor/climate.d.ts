import type { CirculationResult } from "./circulation.js"
import type { LockedDeck } from "../clouds/locked/types"
import type { CloudFields } from "../clouds/types"
import type { ClimateSurface, TemperatureStageResult } from "./core.js"
import type { DiurnalRanges } from "./diurnal.js"
import type { LatLonGrid } from "./grid.js"
import type { ClimateOrbit } from "./insolation.js"
import type { OceanResult } from "./ocean.js"

export interface PlanetClimateInput {
	xyz: Float32Array | Float64Array
	elevKm: Float32Array
	axes: "y-up" | "z-up"
	land: Uint8Array
}

export interface PlanetClimateOptions extends ClimateOrbit {
	seed: number
	greenhouseWm2: number
	onCell: (r: number, T12: Float64Array, P12: Float64Array) => void
}

export interface ClimateBudget {
	sunWm2: number
	air: number
	vary: number
	ground: number
	snowIce: number
	cloud: number
	cloudLongwaveWm2: number
	cryoWm2: {
		snowN: number
		seaN: number
		sheetN: number
		snowS: number
		seaS: number
		sheetS: number
		sheetShareN: number
		sheetShareS: number
	}
	rowLat: number[]
	rowSurface: (number | null)[]
	rowAlbedo: (number | null)[]
	rowNetWm2: number[]
}

export function lockedClimate(
	input: PlanetClimateInput,
	options: PlanetClimateOptions,
): Omit<PlanetClimateResult, "stages"> & {
	stages: Omit<PlanetClimateResult["stages"], "clouds"> & { clouds: LockedDeck }
}

export interface PlanetClimateResult {
	grid: LatLonGrid
	surface: ClimateSurface
	anchorMonths: number[]
	months: { T: Float32Array; P: Float32Array }
	cell: {
		koppen: Uint8Array
		tAnnual: Float32Array
		pAnnual: Float32Array
		lat: Float32Array
		lon: Float32Array
	}
	stages: {
		clouds: CloudFields
		temperature: TemperatureStageResult & {
			iceFrac: Float32Array
			diurnal: DiurnalRanges | null
			dayHeating: Float32Array | null
			dayWind2: Float32Array | null
			landSun: { down: Float32Array; taken: Float32Array }
			budget: ClimateBudget
		}
		circulation: CirculationResult
		ocean: OceanResult
		rain: { r: Float32Array }
	}
	timing: { stage: string; ms: number }[]
}

export function planetClimate(
	input: PlanetClimateInput,
	options: PlanetClimateOptions,
): PlanetClimateResult

import { describe, it } from "vitest"
import {
	getStarDiameterSol,
	getStarTemperatureK,
	isValidSpectralClass,
	type MainSequenceClass,
} from "@/model/celestial/star/star-types"
import { EMB_CONSTANTS } from "./constants"
import { estimateGreenhouseFactor } from "./greenhouse-estimate"
import { EnergyBalanceModel } from "./index"

// Mirrors src/ui/hooks/useEbmPreview.ts exactly, for the Luna
// regularPreviewConfig reported to produce a discontinuity at the equator.
const config = {
	obliquity: 6.7,
	eccentricity: 0.017,
	perihelion: 102,
	spectralClass: "G",
	starSubtype: 2,
	orbitalDistanceAU: 1,
	hoursPerDay: 708.1670121409535,
	daysPerYear: 12.36996336996337,
	landFraction: 1,
	radius: 1737,
	pressure: 0,
	albedo: 0.12,
	greenhouseFactor: 0,
}

describe("Luna EBM repro", () => {
	it("reproduces (or not) the reported equator discontinuity", () => {
		const cls: MainSequenceClass = isValidSpectralClass(config.spectralClass)
			? config.spectralClass
			: "G"
		const T_star = getStarTemperatureK(cls, config.starSubtype)
		const R_star_m =
			getStarDiameterSol(cls, config.starSubtype) * EMB_CONSTANTS.stellar.R_SUN
		const d_m = config.orbitalDistanceAU * EMB_CONSTANTS.stellar.AU

		const modelConfig = {
			orbital: {
				OBLIQUITY: config.obliquity,
				ECCENTRICITY: config.eccentricity,
				PERIHELION: config.perihelion,
			},
			stellar: {
				...EMB_CONSTANTS.stellar,
				T_SUN: T_star,
				R_SUN: R_star_m,
				AU: d_m,
			},
			time: {
				HOURS_PER_DAY: config.hoursPerDay,
				YEAR_LENGTH_DAYS: config.daysPerYear,
			},
			landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(
				config.landFraction,
			),
			radius: config.radius * 1000,
			pressure: config.pressure,
			albedo: config.albedo,
			greenhouseFactor:
				config.greenhouseFactor ?? estimateGreenhouseFactor(config.pressure),
		}

		const model = new EnergyBalanceModel(modelConfig)
		model.runModel(30, 0.5)

		function meanOf(values: readonly number[]): number {
			let sum = 0
			for (const v of values) sum += v
			return sum / values.length
		}

		const rowMeans = model.temperature.map((row) => meanOf(row))
		console.log("lats_deg:", JSON.stringify(model.lats_deg))
		console.log("rowMeans:", JSON.stringify(rowMeans))

		// Print deltas between consecutive latitude bands to spot discontinuities
		for (let i = 1; i < rowMeans.length; i++) {
			const delta = rowMeans[i] - rowMeans[i - 1]
			console.log(
				`lat ${model.lats_deg[i - 1].toFixed(2)} -> ${model.lats_deg[i].toFixed(2)}: delta = ${delta.toFixed(3)}`,
			)
		}
	})
})

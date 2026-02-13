import { Cell } from "../types"
import { WIND } from "../wind"

export const months = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]

export const WEATHER = {
	rain: {
		month: (params: { cell: Cell; month: number }) => {
			const { cell } = params
			return cell.rain.monthly[params.month]
		},
		annual: (cell: Cell) =>
			months.reduce(
				(sum, _, month) => sum + WEATHER.rain.month({ cell, month }),
				0,
			),
		describe: (rainfall: number, key: "monthly" | "annual") => {
			if (rainfall > WEATHER.rain.scale[key].saturated) return "saturated"
			if (rainfall > WEATHER.rain.scale[key].humid) return "humid"
			if (rainfall > WEATHER.rain.scale[key].wet) return "wet"
			if (rainfall > WEATHER.rain.scale[key].moist) return "moist"
			if (rainfall > WEATHER.rain.scale[key].moderate) return "moderate"
			if (rainfall > WEATHER.rain.scale[key].low) return "low"
			if (rainfall > WEATHER.rain.scale[key].dry) return "dry"
			if (rainfall > WEATHER.rain.scale[key].arid) return "arid"
			return "parched"
		},
		scale: {
			monthly: {
				parched: 0,
				arid: 10,
				dry: 30,
				low: 60,
				moderate: 100,
				moist: 125,
				wet: 150,
				humid: 175,
				saturated: 200,
			},
			annual: {
				parched: 62.5,
				arid: 125,
				dry: 250,
				low: 500,
				moderate: 750,
				moist: 1000,
				wet: 1500,
				humid: 2000,
				saturated: 3000,
			},
		},
	},
}

export { WIND }

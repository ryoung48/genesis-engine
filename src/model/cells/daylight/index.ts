import { interpolatePurples, mean, scaleLinear } from "d3"

import { TIME } from "../../utilities/time"
import { EBM } from "../ebm"
import { DailyDaylightParams, MonthlyDaylightParams } from "./types"

const scale = scaleLinear([0, 24], [1, 0])

export const DAYLIGHT = {
	daily: ({ cell, dayIdx }: DailyDaylightParams): number => {
		const scale = EBM.model.scales.daylight.daily[dayIdx]
		return scale(cell.y)
	},
	color: (hours: number): string => interpolatePurples(scale(hours)),
	monthly: {
		mean: ({ cell, month }: MonthlyDaylightParams): number =>
			mean(
				TIME.month
					.days(month)
					.map((day) => DAYLIGHT.daily({ cell, dayIdx: day })),
			),
	},
}

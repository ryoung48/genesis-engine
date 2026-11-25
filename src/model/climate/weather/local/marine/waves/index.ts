import { OCEAN_WAVES } from "@/model/climate/ocean/waves"
import type {
	MarineSeaState,
	MarineWaves,
	MarineWavesParams,
} from "@/model/climate/weather/local/marine/waves/types"

const DOUGLAS_BANDS: [number, MarineSeaState][] = [
	[0.1, "calm"],
	[0.5, "smooth"],
	[1.25, "slight"],
	[2.5, "moderate"],
	[4, "rough"],
	[6, "veryRough"],
	[9, "high"],
	[14, "veryHigh"],
]

function seaState(heightM: number): MarineSeaState {
	for (const [upper, state] of DOUGLAS_BANDS) if (heightM < upper) return state
	return "phenomenal"
}

function waves({ field, sea, ice, values }: MarineWavesParams): MarineWaves {
	if (
		OCEAN_WAVES.iceCovered({
			ice,
			temperatureNormalC: values.temperatureNormalC,
		})
	)
		return { heightM: 0, state: "iceCovered", fromDeg: null, fetchKm: 0 }
	const fetchKm = OCEAN_WAVES.fetch({
		field,
		sea,
		windU: values.windU,
		windV: values.windV,
	})
	const heightM = OCEAN_WAVES.height({
		windSpeedMs: values.windSpeedMs,
		fetchKm,
		gravityMs2: field.gravityMs2,
	})
	return {
		heightM,
		state: seaState(heightM),
		fromDeg: values.windDirectionDeg,
		fetchKm,
	}
}

export const MARINE_WAVES = { waves, seaState }

import type { LocalWeatherValues } from "@/model/climate/weather/local/types"
import type {
	WeatherCloudDescription,
	WeatherPhenomenon,
} from "@/model/climate/weather/local/vocabulary/types"

const phenomena: WeatherPhenomenon[] = [
	"clear skies",
	"cloudy",
	"dew",
	"thin mist",
	"mist",
	"fog",
	"drizzle",
	"spattering rain",
	"pelting rain",
	"rain shower",
	"thunderstorm",
	"quiet downpour",
	"sleet",
	"cold surface",
	"thin frost",
	"frost",
	"rime",
	"ice fog",
	"dusting",
	"tiny flakes",
	"ice crystals",
	"snow flurry",
	"snowfall",
	"blizzard",
	"sand storm",
	"dust storm",
]
const cloudDescriptions: WeatherCloudDescription[] = [
	"clear skies",
	"haze",
	"cirrus clouds",
	"altostratus clouds",
	"stratus clouds",
	"altocumulus clouds",
	"cumulus clouds",
	"nimbus clouds",
]
function inventory(): WeatherPhenomenon[] {
	return [...phenomena]
}
function clouds(): WeatherCloudDescription[] {
	return [...cloudDescriptions]
}
function describeAll(values: LocalWeatherValues): WeatherPhenomenon[] {
	return values.dominant ? [values.dominant] : []
}
function cloud(values: LocalWeatherValues): WeatherCloudDescription | null {
	return values.cloudDescription
}
export const WEATHER_VOCABULARY = { inventory, clouds, describeAll, cloud }

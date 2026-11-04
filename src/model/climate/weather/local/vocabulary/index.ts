import type { LocalWeatherValues } from "@/model/climate/weather/local/types"
import type {
	WeatherCloudDescription,
	WeatherPhenomenon,
} from "@/model/climate/weather/local/vocabulary/types"

const phenomena: WeatherPhenomenon[] = [
	"clear skies",
	"cloudy",
	"dew",
	"frost",
	"mist",
	"fog",
	"freezing fog",
	"ice fog",
	"ice crystals",
	"haze",
	"drizzle",
	"freezing drizzle",
	"light rain",
	"moderate rain",
	"heavy rain",
	"light showers",
	"rain showers",
	"freezing rain",
	"rain and snow",
	"thunderstorm",
	"hail",
	"tornado",
	"thundersnow",
	"light snow",
	"moderate snow",
	"heavy snow",
	"snow showers",
	"heavy snow showers",
	"drifting snow",
	"blizzard",
	"blowing sand",
	"blowing dust",
	"sand storm",
	"dust storm",
	"tropical storm",
	"hurricane",
]
const cloudDescriptions: WeatherCloudDescription[] = [
	"clear skies",
	"cirrus clouds",
	"altostratus clouds",
	"stratus clouds",
	"altocumulus clouds",
	"stratocumulus clouds",
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

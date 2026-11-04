import type {
	CategoryWeatherCloudsParams,
	CloudGenus,
	CloudOccurrence,
	EstimatedWeatherClouds,
	RepresentativeCloudParams,
	WeatherCloudCategory,
} from "@/model/climate/weather/local/clouds/types"
import type { WeatherPhenomenon } from "@/model/climate/weather/local/vocabulary/types"

const genera: CloudGenus[] = [
	"cirrus",
	"altostratus",
	"altocumulus",
	"stratocumulus",
	"stratus",
	"nimbostratus",
	"cumulus",
	"cumulonimbus",
]
const STORM_CELLS: WeatherPhenomenon[] = [
	"thunderstorm",
	"hail",
	"tornado",
	"thundersnow",
	"tropical storm",
	"hurricane",
]

function fromCategory({
	category,
	cover,
	phenomenon,
}: CategoryWeatherCloudsParams): EstimatedWeatherClouds {
	if (cover === null || category === null) return { cover: null, clouds: null }
	if (category === "clear skies") return { cover, clouds: [] }
	const genus: CloudGenus =
		category === "nimbus clouds"
			? STORM_CELLS.includes(phenomenon)
				? "cumulonimbus"
				: "nimbostratus"
			: category === "cirrus clouds"
				? "cirrus"
				: category === "altostratus clouds"
					? "altostratus"
					: category === "stratus clouds"
						? "stratus"
						: category === "altocumulus clouds"
							? "altocumulus"
							: category === "stratocumulus clouds"
								? "stratocumulus"
								: "cumulus"
	const layer =
		genus === "cumulonimbus"
			? "deep"
			: genus === "cirrus"
				? "high"
				: genus === "altostratus" ||
						genus === "altocumulus" ||
						genus === "nimbostratus"
					? "middle"
					: "low"
	return { cover, clouds: [{ genus, cover, layer, estimated: true }] }
}
function representative({
	cloudCover,
	clouds,
}: RepresentativeCloudParams): WeatherCloudCategory {
	if (cloudCover === null || clouds === null) return "unavailable"
	if (cloudCover === 0 || (cloudCover <= 0.25 && !clouds.length)) return "clear"
	const dominant = clouds
		.filter((cloud) => cloud.cover > 0)
		.reduce<CloudOccurrence | null>(
			(best, cloud) =>
				!best ||
				cloud.cover > best.cover ||
				(cloud.cover === best.cover && cloud.genus < best.genus)
					? cloud
					: best,
			null,
		)
	return dominant?.genus ?? "unavailable"
}
function categories(): WeatherCloudCategory[] {
	return [...genera, "clear", "unavailable"]
}
export const WEATHER_CLOUDS = { fromCategory, representative, categories }

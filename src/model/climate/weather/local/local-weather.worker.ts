import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_OUTLOOK } from "@/model/climate/weather/local/outlook"
import type {
	WeatherHour,
	WeatherMonth,
} from "@/model/climate/weather/local/outlook/types"
import type {
	LocalWeatherWorkerScope,
	WeatherContext,
	WeatherSnapshot,
} from "@/model/climate/weather/local/types"

let context: WeatherContext | null = null
const cache = new Map<string, WeatherSnapshot>()
const hours = new Map<string, WeatherHour[]>()
const months = new Map<number, WeatherMonth[]>()
const scope = self as unknown as LocalWeatherWorkerScope

scope.onmessage = (event) => {
	const request = event.data
	const { revision, requestId } = request
	try {
		if (request.type === "dispose") {
			context = null
			cache.clear()
			hours.clear()
			months.clear()
			return
		}
		if (request.type === "init") {
			context = request.context
			cache.clear()
			hours.clear()
			months.clear()
			scope.postMessage({ type: "initialized", revision, requestId })
			return
		}
		if (!context || context.revision !== revision) return
		if (request.type === "snapshot") {
			const key = `${request.province}:${request.instant.seconds}`
			const snapshot =
				cache.get(key) ??
				LOCAL_WEATHER.sampleProvince({
					context,
					province: request.province,
					instant: request.instant,
				})
			const query = {
				context,
				province: request.province,
				instant: request.instant,
			}
			const hourly = hours.get(key) ?? WEATHER_OUTLOOK.hourly(query)
			const monthly =
				months.get(request.province) ?? WEATHER_OUTLOOK.monthly(query)
			cache.delete(key)
			cache.set(key, snapshot)
			hours.delete(key)
			hours.set(key, hourly)
			months.set(request.province, monthly)
			if (cache.size > 256) {
				const oldest = cache.keys().next().value as string
				cache.delete(oldest)
				hours.delete(oldest)
			}
			if (months.size > 256) months.delete(months.keys().next().value as number)
			scope.postMessage({
				type: "snapshot",
				revision,
				requestId,
				snapshot,
				outlook: { hourly, monthly },
			})
		}
	} catch (error) {
		scope.postMessage({
			type: "error",
			revision,
			requestId,
			message: error instanceof Error ? error.message : String(error),
		})
	}
}

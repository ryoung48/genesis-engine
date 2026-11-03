import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type {
	LocalWeatherRequest,
	LocalWeatherResponse,
} from "@/model/climate/weather/local/types"
import { WIND } from "@/model/climate/weather/wind"
import type {
	CreateWeatherClientParams,
	PendingWeatherRequest,
	WeatherClient,
	WeatherClientQuery,
} from "@/ui/genesis/view/local-weather-client/types"

export function createWeatherClient({
	world,
	revision,
	representatives,
}: CreateWeatherClientParams): WeatherClient {
	let worker: Worker | null = null
	let initialized: Promise<void> | null = null
	let disposed = false
	let nextId = 0
	const pending = new Map<number, PendingWeatherRequest>()
	function fail(error: Error) {
		for (const item of pending.values()) item.reject(error)
		pending.clear()
	}
	function send(request: LocalWeatherRequest): Promise<LocalWeatherResponse> {
		return new Promise((resolve, reject) => {
			if (disposed || !worker) {
				reject(
					new Error(
						disposed ? "Weather worker disposed" : "Weather worker unavailable",
					),
				)
				return
			}
			pending.set(request.requestId, { resolve, reject })
			worker.postMessage(request)
		})
	}
	async function initialize() {
		await new Promise((resolve) => window.setTimeout(resolve, 0))
		if (disposed) throw new Error("Weather worker disposed")
		let source = world
		if (!world.windMonthly) {
			const N = world.mesh.numRegions
			const u = new Float32Array(12 * N)
			const v = new Float32Array(12 * N)
			for (let month = 0; month < 12; month++) {
				if (disposed) throw new Error("Weather worker disposed")
				const wind = WIND.computeWindVectors({
					mesh: world.mesh,
					climate: world.climate,
					elevation_km: world.elevation_km,
					params: world.params,
					month,
					surface: {
						vegetation: world.vegetation,
						topography: world.topography,
						oceanDist: world.oceanDist,
					},
				})
				for (let r = 0; r < N; r++) {
					u[month * N + r] = wind.windU[r] * wind.windSpeed[r]
					v[month * N + r] = wind.windV[r] * wind.windSpeed[r]
				}
				await new Promise((resolve) => window.setTimeout(resolve, 0))
			}
			source = { ...world, windMonthly: { u, v } }
		}
		const instant = WEATHER_CLOCK.resolve({
			params: world.params,
			elapsedYears: 0,
			manual: null,
		})
		const context = await LOCAL_WEATHER.createContext({
			world: source,
			revision,
			representatives,
			yearSeconds: instant.yearSeconds,
		})
		if (disposed) throw new Error("Weather worker disposed")
		worker = new Worker(
			new URL(
				"../../../../model/climate/weather/local/local-weather.worker.ts",
				import.meta.url,
			),
			{ type: "module" },
		)
		worker.onmessage = (event: MessageEvent<LocalWeatherResponse>) => {
			const result = event.data
			if (result.revision !== revision || disposed) return
			const item = pending.get(result.requestId)
			pending.delete(result.requestId)
			if (result.type === "error") item?.reject(new Error(result.message))
			else item?.resolve(result)
		}
		worker.onerror = (event) => {
			fail(new Error(event.message || "Weather worker failed"))
			worker?.terminate()
			worker = null
		}
		await send({ type: "init", context, revision, requestId: ++nextId })
	}
	async function request(
		query: WeatherClientQuery,
	): Promise<LocalWeatherResponse> {
		initialized ??= initialize()
		await initialized
		return send({
			type: "snapshot",
			revision,
			requestId: ++nextId,
			province: query.province,
			instant: query.instant,
		})
	}
	function dispose() {
		disposed = true
		worker?.terminate()
		worker = null
		fail(new Error("Weather worker disposed"))
	}
	return { request, dispose }
}

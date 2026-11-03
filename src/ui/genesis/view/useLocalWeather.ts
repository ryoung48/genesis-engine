import { useEffect, useRef, useState } from "react"
import { createWeatherClient } from "@/ui/genesis/view/local-weather-client"
import type {
	LocalWeatherDisplayState,
	UseLocalWeatherParams,
	WeatherClient,
} from "@/ui/genesis/view/local-weather-client/types"

export function useLocalWeather({
	world,
	instant,
	selectedProvince,
	representatives,
}: UseLocalWeatherParams) {
	const [state, setState] = useState<LocalWeatherDisplayState>({
		world: null,
		seconds: null,
		selected: null,
		outlook: null,
		loading: false,
		error: null,
	})
	const revision = useRef(0)
	const client = useRef<WeatherClient | null>(null)
	const running = useRef(false)
	const latest = useRef<UseLocalWeatherParams | null>(null)
	useEffect(() => {
		const generation = ++revision.current
		const service = world
			? createWeatherClient({ world, revision: generation, representatives })
			: null
		client.current = service
		setState({
			world,
			seconds: null,
			selected: null,
			outlook: null,
			loading: false,
			error: null,
		})
		return () => {
			++revision.current
			service?.dispose()
			client.current = null
		}
	}, [world, representatives])
	useEffect(() => {
		latest.current = { world, instant, selectedProvince, representatives }
		async function pump() {
			if (running.current) return
			running.current = true
			try {
				while (latest.current) {
					const next = latest.current
					latest.current = null
					const service = client.current
					const generation = revision.current
					if (
						!next.world ||
						!next.instant ||
						next.selectedProvince === null ||
						!service
					)
						continue
					setState((previous) => ({ ...previous, loading: true, error: null }))
					try {
						const response = await service.request({
							instant: next.instant,
							province: next.selectedProvince,
						})
						if (
							latest.current ||
							generation !== revision.current ||
							response.type !== "snapshot"
						)
							continue
						setState({
							world: next.world,
							seconds: next.instant.seconds,
							selected: response.snapshot,
							outlook: response.outlook,
							loading: false,
							error: null,
						})
					} catch (error) {
						if (!latest.current && generation === revision.current)
							setState((previous) => ({
								...previous,
								loading: false,
								error: error instanceof Error ? error.message : String(error),
							}))
					}
				}
			} finally {
				running.current = false
			}
		}
		void pump()
	}, [world, instant, selectedProvince, representatives])
	const matches =
		state.world === world &&
		state.seconds === instant?.seconds &&
		state.selected?.province === selectedProvince
	return {
		selected: matches ? state.selected : null,
		outlook: matches ? state.outlook : null,
		loading:
			selectedProvince !== null &&
			instant !== null &&
			(state.loading || (!matches && !state.error)),
		error: state.error,
	}
}

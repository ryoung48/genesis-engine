import { useEffect, useRef, useState } from "react"
import { BENCH_API } from "@/bench/api"
import type { WeatherBenchDetail, WeatherBenchRun } from "@/bench/weather/types"
import { BENCH_REQUEST } from "@/ui/bench/request"
import type {
	WeatherBenchLoad,
	WeatherBenchPayload,
	WeatherBenchSelection,
} from "@/ui/bench/weather/types"
import { WEATHER_BENCH_VIEW } from "@/ui/bench/weather/view"

const API = BENCH_API.weather
export function useWeatherBench() {
	const [catalog, setCatalog] = useState<WeatherBenchLoad<WeatherBenchRun[]>>({
		value: [],
		error: "",
		loading: true,
	})
	const [selection, setSelection] = useState<WeatherBenchSelection>({
		currentId: "",
		baselineId: "",
	})
	const [data, setData] = useState<WeatherBenchLoad<WeatherBenchPayload>>({
		value: null,
		error: "",
		loading: false,
	})
	const [revision, setRevision] = useState(0)
	const latestSeen = useRef("")
	useEffect(() => {
		const controller = new AbortController()
		setCatalog((previous) => ({ ...previous, error: "", loading: true }))
		BENCH_REQUEST.json<WeatherBenchRun[]>({
			url: `${API}?revision=${revision}`,
			signal: controller.signal,
		})
			.then((runs) => {
				if (controller.signal.aborted) return
				setCatalog({ value: runs, error: "", loading: false })
				const previousLatest = latestSeen.current
				latestSeen.current = runs[0]?.id ?? ""
				setSelection((previous) => {
					const retained = runs.some((run) => run.id === previous.currentId)
					const followingLatest =
						!previous.currentId || previous.currentId === previousLatest
					const currentId =
						retained && !followingLatest
							? previous.currentId
							: (runs[0]?.id ?? "")
					const candidates = WEATHER_BENCH_VIEW.candidates({ runs, currentId })
					const baselineId =
						retained && currentId === previous.currentId
							? candidates.some((run) => run.id === previous.baselineId)
								? previous.baselineId
								: ""
							: WEATHER_BENCH_VIEW.defaultBaseline({ runs, currentId })
					return { currentId, baselineId }
				})
			})
			.catch((error: Error) => {
				if (!controller.signal.aborted)
					setCatalog({ value: [], error: error.message, loading: false })
			})
		return () => controller.abort()
	}, [revision])
	useEffect(() => {
		const runs = catalog.value ?? []
		const current = runs.find((run) => run.id === selection.currentId)
		if (!current) return
		const controller = new AbortController()
		const baseline = WEATHER_BENCH_VIEW.candidates({
			runs,
			currentId: current.id,
		}).find((run) => run.id === selection.baselineId)
		setData({ value: null, error: "", loading: true })
		Promise.all([
			BENCH_REQUEST.json<WeatherBenchDetail>({
				url: `${API}/${encodeURIComponent(current.id)}`,
				signal: controller.signal,
			}),
			baseline
				? BENCH_REQUEST.json<WeatherBenchDetail>({
						url: `${API}/${encodeURIComponent(baseline.id)}`,
						signal: controller.signal,
					})
				: Promise.resolve(null),
		])
			.then(([current, baseline]) => {
				if (!controller.signal.aborted)
					setData({ value: { current, baseline }, error: "", loading: false })
			})
			.catch((error: Error) => {
				if (!controller.signal.aborted)
					setData({ value: null, error: error.message, loading: false })
			})
		return () => controller.abort()
	}, [catalog.value, selection.currentId, selection.baselineId])
	const runs = catalog.value ?? []
	return {
		runs,
		selection,
		data: data.value,
		loading: catalog.loading || data.loading,
		error: catalog.error || data.error,
		baselines: WEATHER_BENCH_VIEW.candidates({
			runs,
			currentId: selection.currentId,
		}),
		refresh: () => setRevision((value) => value + 1),
		selectCurrent: (currentId: string) =>
			setSelection({
				currentId,
				baselineId: WEATHER_BENCH_VIEW.defaultBaseline({ runs, currentId }),
			}),
		selectBaseline: (baselineId: string) =>
			setSelection((previous) => ({ ...previous, baselineId })),
	}
}

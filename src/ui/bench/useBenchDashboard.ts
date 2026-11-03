import { useEffect, useState } from "react"
import { BENCH_API } from "@/bench/api"
import type { BenchRunDetail, BenchRunSummary } from "@/bench/types"
import { BENCH_REQUEST } from "@/ui/bench/request"

const API = BENCH_API.history
const LIVE_REFRESH_MS = 5000
const RUN_LIST_REFRESH_MS = 30000

function defaultBaseline(params: {
	runs: BenchRunSummary[]
	currentId: string
}): string {
	const index = params.runs.findIndex((run) => run.id === params.currentId)
	const current = params.runs[index]
	if (!current) return ""
	const older = params.runs.slice(index + 1)
	return (
		(older.find((run) => run.years === current.years) ?? older[0])?.id ?? ""
	)
}

export function useBenchDashboard(diffEnabled: boolean) {
	const [runs, setRuns] = useState<BenchRunSummary[]>([])
	const [currentId, setCurrentId] = useState("")
	const [baselineId, setBaselineId] = useState("")
	const [details, setDetails] = useState<Record<string, BenchRunDetail>>({})
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		BENCH_REQUEST.json<BenchRunSummary[]>({ url: API, signal: null })
			.then((list) => {
				setRuns(list)
				const first = list[0]?.id ?? ""
				setCurrentId(first)
				setBaselineId(defaultBaseline({ runs: list, currentId: first }))
				if (!first) setLoading(false)
			})
			.catch((e: Error) => {
				setError(e.message)
				setLoading(false)
			})
	}, [])

	useEffect(() => {
		const wanted = [currentId, diffEnabled ? baselineId : ""].filter(
			(id) => id && !details[id],
		)
		if (!wanted.length) {
			if (currentId) setLoading(false)
			return
		}
		setLoading(true)
		let cancelled = false
		Promise.all(
			wanted.map((id) =>
				BENCH_REQUEST.json<BenchRunDetail>({
					url: `${API}/${encodeURIComponent(id)}`,
					signal: null,
				}),
			),
		)
			.then((loaded) => {
				if (cancelled) return
				setDetails((prev) => ({
					...prev,
					...Object.fromEntries(loaded.map((d) => [d.run.id, d])),
				}))
				setLoading(false)
			})
			.catch((e: Error) => {
				if (cancelled) return
				setError(e.message)
				setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [currentId, baselineId, diffEnabled, details])

	const liveRun = Boolean(details[currentId] && !details[currentId].complete)

	useEffect((): (() => void) | undefined => {
		if (!liveRun) return
		const timer = setInterval((): void => {
			BENCH_REQUEST.json<BenchRunDetail>({
				url: `${API}/${encodeURIComponent(currentId)}`,
				signal: null,
			})
				.then((detail) =>
					setDetails((prev) => ({ ...prev, [detail.run.id]: detail })),
				)
				.catch((): null => null)
		}, LIVE_REFRESH_MS)
		return () => clearInterval(timer)
	}, [currentId, liveRun])

	useEffect((): (() => void) | undefined => {
		const timer = setInterval((): void => {
			BENCH_REQUEST.json<BenchRunSummary[]>({ url: API, signal: null })
				.then(setRuns)
				.catch((): null => null)
		}, RUN_LIST_REFRESH_MS)
		return () => clearInterval(timer)
	}, [])

	const selectCurrent = (id: string) => {
		setCurrentId(id)
		setBaselineId(defaultBaseline({ runs, currentId: id }))
	}

	return {
		runs,
		currentId,
		baselineId,
		current: details[currentId] ?? null,
		baseline: diffEnabled ? (details[baselineId] ?? null) : null,
		error,
		loading,
		selectCurrent,
		selectBaseline: setBaselineId,
	}
}

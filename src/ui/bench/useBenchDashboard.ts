import { useEffect, useState } from "react"
import type { BenchRunDetail, BenchRunSummary } from "@/bench/types"

const API = "/api/bench/runs"
const LIVE_REFRESH_MS = 5000
const RUN_LIST_REFRESH_MS = 30000

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(await response.text())
	return response.json()
}

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
		fetchJson<BenchRunSummary[]>(API)
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
				fetchJson<BenchRunDetail>(`${API}/${encodeURIComponent(id)}`),
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
			fetchJson<BenchRunDetail>(`${API}/${encodeURIComponent(currentId)}`)
				.then((detail) =>
					setDetails((prev) => ({ ...prev, [detail.run.id]: detail })),
				)
				.catch((): null => null)
		}, LIVE_REFRESH_MS)
		return () => clearInterval(timer)
	}, [currentId, liveRun])

	useEffect((): (() => void) | undefined => {
		const timer = setInterval((): void => {
			fetchJson<BenchRunSummary[]>(API)
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

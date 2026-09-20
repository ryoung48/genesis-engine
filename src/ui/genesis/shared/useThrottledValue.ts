import { useEffect, useRef, useState } from "react"

export const SCENE_REBUILD_THROTTLE_MS = 250

interface ThrottledValueParams<T> {
	value: T
	intervalMs: number
	resetKey: unknown
}

export function useThrottledValue<T>({
	value,
	intervalMs,
	resetKey,
}: ThrottledValueParams<T>): T {
	const [throttled, setThrottled] = useState(value)
	const latestRef = useRef(value)
	latestRef.current = value
	const lastCommitRef = useRef(0)
	const timerRef = useRef<number | null>(null)
	const resetKeyRef = useRef(resetKey)

	// biome-ignore lint/correctness/useExhaustiveDependencies: the effect must react to every new value; the refs hold the latest value and timer state.
	useEffect(() => {
		const commit = () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current)
			timerRef.current = null
			lastCommitRef.current = performance.now()
			setThrottled(latestRef.current)
		}
		if (resetKeyRef.current !== resetKey) {
			resetKeyRef.current = resetKey
			commit()
			return
		}
		const elapsed = performance.now() - lastCommitRef.current
		if (elapsed >= intervalMs) {
			commit()
			return
		}
		if (timerRef.current === null)
			timerRef.current = window.setTimeout(commit, intervalMs - elapsed)
	}, [value, intervalMs, resetKey])

	useEffect(
		() => () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current)
		},
		[],
	)

	return resetKeyRef.current === resetKey ? throttled : value
}

import { useEffect, useRef, useState } from "react"

// "coming from" convention: negate u/v to get the source direction
// Nation focus is anchored on a representative seed province, so province
// count is only a rough proxy for framing. Use a slow logarithmic curve:
// single-province minors need a much tighter view than the default point
// focus, while large nations should pull back only moderately instead of
// hitting the far-out cap early.
// Focusing on a single province (as opposed to a whole nation) should use
// the same tight framing as a single-province nation -- the unscaled
// default (distanceScale 1) is tuned for the far-out nation case and looks
// much too zoomed-out for one province.

export function usePlaybackSampledValue<T>(
	value: T,
	delayMs: number,
	enabled: boolean,
): T {
	const [sampledValue, setSampledValue] = useState(value)
	const latestValueRef = useRef(value)
	latestValueRef.current = value

	useEffect(() => {
		if (!enabled) {
			setSampledValue(value)
			return
		}
		const timer = window.setInterval(() => {
			setSampledValue(latestValueRef.current)
		}, delayMs)
		return () => window.clearInterval(timer)
	}, [delayMs, enabled, value])

	return enabled ? sampledValue : value
}

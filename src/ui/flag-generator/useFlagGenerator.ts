import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { createFlagBatch } from "@/ui/flag-generator/samples"
import type { FlagQueryUpdate } from "@/ui/flag-generator/types"
import { FLAG_GENERATOR } from "@/ui/heraldry/simple"

export function useFlagGenerator() {
	const [params, setParams] = useSearchParams()
	const seed = params.get("seed") ?? "flags-1"
	const pattern =
		FLAG_GENERATOR.patterns.find(
			(entry) => entry.value === params.get("pattern"),
		)?.value ?? "all"
	const hue =
		FLAG_GENERATOR.hues.find((entry) => entry.value === params.get("hue"))
			?.value ?? "random"
	const previews = useMemo(
		() => createFlagBatch({ seed, pattern, hue }),
		[seed, pattern, hue],
	)

	function updateQuery({ key, value }: FlagQueryUpdate) {
		setParams(
			(previous) => {
				const next = new URLSearchParams(previous)
				next.delete("mode")
				next.set(key, value)
				return next
			},
			{ replace: true },
		)
	}

	function setSeed(value: string) {
		updateQuery({ key: "seed", value })
	}

	function resample() {
		setSeed(crypto.randomUUID())
	}

	function setPattern(value: string) {
		updateQuery({ key: "pattern", value })
	}

	function setHue(value: string) {
		updateQuery({ key: "hue", value })
	}

	return {
		seed,
		pattern,
		hue,
		previews,
		setSeed,
		resample,
		setPattern,
		setHue,
	}
}

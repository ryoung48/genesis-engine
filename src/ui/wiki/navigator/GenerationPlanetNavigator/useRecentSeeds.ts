import { useCallback, useEffect, useRef, useState } from "react"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { RecentSeed } from "@/ui/wiki/navigator/GenerationPlanetNavigator/types"

const STORAGE_KEY = "genesis:recentSeeds"
const MAX_RECENT_SEEDS = 20

function latestDistinctSeeds(entries: RecentSeed[]): RecentSeed[] {
	const seeds = new Map<number, RecentSeed>()
	for (const entry of entries) {
		if (entry.numeric === SOL_DATA.solSeed) continue
		if (!seeds.has(entry.numeric)) seeds.set(entry.numeric, entry)
		if (seeds.size === MAX_RECENT_SEEDS) break
	}
	return Array.from(seeds.values())
}

function loadRecentSeeds(): RecentSeed[] {
	try {
		const saved: unknown = JSON.parse(
			window.localStorage.getItem(STORAGE_KEY) ?? "[]",
		)
		if (!Array.isArray(saved)) return []

		return latestDistinctSeeds(
			saved.filter(
				(entry) =>
					typeof entry?.label === "string" &&
					entry.label.trim() &&
					Number.isFinite(entry.numeric),
			),
		)
	} catch {
		return []
	}
}

export function useRecentSeeds(initialSeed: RecentSeed) {
	const [startingSeed] = useState(initialSeed)
	const [recentSeeds, setRecentSeeds] = useState(loadRecentSeeds)
	const inMemorySeeds = useRef(recentSeeds)

	const rememberSeed = useCallback((seed: RecentSeed) => {
		const next = latestDistinctSeeds([
			seed,
			...loadRecentSeeds(),
			...inMemorySeeds.current,
		])
		inMemorySeeds.current = next
		setRecentSeeds(next)
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
		} catch {
			// Keep the current tab's history available if storage is blocked or full.
		}
	}, [])

	useEffect(() => {
		if (
			!inMemorySeeds.current.some(
				(entry) => entry.numeric === startingSeed.numeric,
			)
		) {
			rememberSeed(startingSeed)
		}
	}, [rememberSeed, startingSeed])

	return { recentSeeds, rememberSeed }
}

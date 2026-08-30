import { useEffect, useMemo, useState } from "react"
import type { RawOrganizationReference } from "@/model/history/earth/data-source/types"
import { DATE } from "@/model/history/earth/date"
import { HERITAGES } from "@/model/history/earth/reference/heritages"
import { ORGANIZATIONS } from "@/model/history/earth/reference/organizations"
import { RELIGION_GROUPS } from "@/model/history/earth/reference/religion-groups"
import { HISTORY } from "@/model/history/record"
import type { HistoryState } from "@/model/history/record/types"
import { FRAME } from "@/model/history/world-frame"
import type { GenesisProvinces } from "@/model/society/types"

/**
 * Owns the earth-history engine lifecycle and scrubber time for an
 * Earth-imported world. Only fetches event data (multi-MB JSON) when
 * `isEarthImport` is true, per docs/earth-history-plan.md ("Gated entirely
 * on world.isEarthImport"). Returns null engine/frame until data loads or
 * when the world has no EU4 raw-id mapping (non-raster-import worlds).
 */
export function useEarthHistoryTimeline(
	provinces: GenesisProvinces | null | undefined,
	isEarthImport: boolean,
) {
	const [state, setState] = useState<HistoryState | null>(null)
	const [selectedTimeMs, setSelectedTimeMs] = useState(
		DATE.earthHistoryDefaultStartTimeMs,
	)
	const [loading, setLoading] = useState(false)
	const [organizationReference, setOrganizationReference] = useState<Map<
		string,
		RawOrganizationReference
	> | null>(null)
	const [religionColorById, setReligionColorById] = useState<Map<
		string,
		[number, number, number]
	> | null>(null)
	const [religionNameById, setReligionNameById] = useState<Map<
		string,
		string
	> | null>(null)
	const [cultureNameById, setCultureNameById] = useState<Map<
		string,
		string
	> | null>(null)
	const [cultureColorById, setCultureColorById] = useState<Map<
		string,
		[number, number, number]
	> | null>(null)

	useEffect(() => {
		if (!isEarthImport) return
		ORGANIZATIONS.getOrganizationReferenceIndex().then(setOrganizationReference)
		RELIGION_GROUPS.getReligionIndex().then((index) => {
			const scaled = new Map<string, [number, number, number]>()
			const names = new Map<string, string>()
			for (const group of index.groups) {
				for (const religion of group.religions) {
					scaled.set(religion.id, [
						religion.color[0] / 255,
						religion.color[1] / 255,
						religion.color[2] / 255,
					])
					names.set(religion.id, religion.name)
				}
			}
			setReligionColorById(scaled)
			setReligionNameById(names)
		})
		HERITAGES.getHeritageIndex().then((index) => {
			const names = new Map<string, string>()
			const colors = new Map<string, [number, number, number]>()
			for (const heritage of index.heritages) {
				for (const culture of heritage.cultures) {
					names.set(culture.id, culture.name)
					if (culture.color) {
						colors.set(culture.id, [
							culture.color[0] / 255,
							culture.color[1] / 255,
							culture.color[2] / 255,
						])
					}
				}
			}
			setCultureNameById(names)
			setCultureColorById(colors)
		})
	}, [isEarthImport])

	useEffect(() => {
		if (!isEarthImport || !provinces?.realIds) {
			setState(null)
			return
		}
		let cancelled = false
		setLoading(true)
		HISTORY.loadEarthState({ provinces })
			.then((result) => {
				if (!cancelled) {
					setState(result?.state ?? null)
					setSelectedTimeMs(
						result
							? Math.min(
									Math.max(
										DATE.earthHistoryDefaultStartTimeMs,
										result.state.record.minTimeMs,
									),
									result.state.record.maxTimeMs,
								)
							: DATE.earthHistoryDefaultStartTimeMs,
					)
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
		// Only re-create when the world's province set actually changes, not on
		// every render -- realIds identity is stable per generated world.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isEarthImport, provinces?.realIds, provinces])

	const query = useMemo(() => {
		if (!state) return null
		const frame = HISTORY.frameAt({ state, timeMs: selectedTimeMs })
		return { frame, renderInputs: FRAME.toRenderInputs({ frame }) }
	}, [state, selectedTimeMs])

	return {
		state,
		loading,
		selectedTimeMs,
		setSelectedTimeMs,
		query,
		nations: state?.record.nations ?? null,
		religionColorById,
		religionNameById,
		cultureNameById,
		cultureColorById,
		// Province name/wasteland flag live on engine.provinceMeta -- merged
		// into provinces.json's base fields rather than a separate fetch,
		// since they're keyed by the same raw EU4 province id as everything
		// else there (see scripts/build-eu4-history-events.py).
		provinceMeta: state?.provinceMeta ?? null,
		organizationReference,
		// Bound the slider to where real converted data actually exists
		// (mostly ~year 2 to present) rather than geo-explorer's full
		// 2..9999 Extended-Timeline-mod range, which is almost entirely
		// empty for us and made the slider impractical to scrub. Falls back
		// to the full range while the engine is still loading.
		minTimeMs: state ? state.record.minTimeMs : DATE.earthHistoryMinTimeMs,
		maxTimeMs: state ? state.record.maxTimeMs : DATE.earthHistoryMaxTimeMs,
		formatLabel: DATE.formatHistoryTimeMs,
	}
}

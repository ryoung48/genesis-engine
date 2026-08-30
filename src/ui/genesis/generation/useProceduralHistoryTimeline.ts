import { useMemo, useState } from "react"
import { HISTORY } from "@/model/history/record"
import type { HistoryState } from "@/model/history/record/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RELIGION } from "@/model/history/sim/religion"
import { FRAME } from "@/model/history/world-frame"
import type { PartitionRow } from "@/model/history/world-frame/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { ReligionMapMode } from "@/ui/genesis/shared/map-modes"

// Procedural counterpart of useEarthHistoryTimeline. Builds the single static
// initial-conditions HistoryState for a procedurally generated world on the
// main thread and returns the SAME bundle shape the Earth hook does -- a
// HistoryState + query + the culture/religion colour and name side-maps keyed
// by PartitionRow.key -- so the unified history rendering path (useMapColoring
// -> computeEarthHistoryRegionColors, the label overrides, the hover override)
// consumes either mode with no branching. No time evolution yet:
// minTimeMs === maxTimeMs.
const PROCEDURAL_START_TIME_MS = 800 * 365 * 86_400_000

function nameMap(rows: PartitionRow[]): Map<string, string> {
	return new Map(rows.map((row) => [row.key, row.name]))
}

function colorMap(rows: PartitionRow[]): Map<string, [number, number, number]> {
	return new Map(
		rows.map((row) => [
			row.key,
			[row.color[0] / 255, row.color[1] / 255, row.color[2] / 255] as [
				number,
				number,
				number,
			],
		]),
	)
}

export function useProceduralHistoryTimeline(
	world: SerializedGenesisWorld | null,
	religionMode: ReligionMapMode,
) {
	const isProcedural =
		!!world && !world.isEarthImport && !!world.provinces && !!world.nations

	const state = useMemo<HistoryState | null>(() => {
		if (!isProcedural || !world) return null
		return SIM_RECORD.buildProceduralState({
			world,
			startTimeMs: PROCEDURAL_START_TIME_MS,
			provinceCoords: undefined,
		})
		// world identity is stable per generated world.
	}, [isProcedural, world])

	const [selectedTimeMs, setSelectedTimeMs] = useState(PROCEDURAL_START_TIME_MS)

	const query = useMemo(() => {
		if (!state) return null
		const frame = HISTORY.frameAt({ state, timeMs: selectedTimeMs })
		return { frame, renderInputs: FRAME.toRenderInputs({ frame }) }
	}, [state, selectedTimeMs])

	const cultureNameById = useMemo(
		() => (state ? nameMap(state.record.cultures) : null),
		[state],
	)
	const religionNameById = useMemo(
		() => (state ? nameMap(state.record.religions) : null),
		[state],
	)
	const cultureColorById = useMemo(
		() => (state ? colorMap(state.record.cultures) : null),
		[state],
	)
	const religionColorById = useMemo(() => {
		if (!state) return null
		if (religionMode !== "types" || !world?.religionTypes) {
			return colorMap(state.record.religions)
		}
		// Types submode: swap in each religion's type-family colour, keyed by
		// the same PartitionRow.key, so the renderer stays mode-agnostic.
		const types = world.religionTypes
		return new Map(
			state.record.religions.map((row) => {
				const typeIdx = types[row.id] ?? -1
				const color =
					typeIdx >= 0
						? (RELIGION.religionTypeColors[typeIdx] ??
							RELIGION.religionTypeColors[0])
						: ([row.color[0] / 255, row.color[1] / 255, row.color[2] / 255] as [
								number,
								number,
								number,
							])
				return [
					row.key,
					[color[0], color[1], color[2]] as [number, number, number],
				]
			}),
		)
	}, [state, religionMode, world?.religionTypes])

	return {
		state,
		selectedTimeMs,
		setSelectedTimeMs,
		query,
		nations: state?.record.nations ?? null,
		minTimeMs: state?.record.minTimeMs ?? PROCEDURAL_START_TIME_MS,
		maxTimeMs: state?.record.maxTimeMs ?? PROCEDURAL_START_TIME_MS,
		cultureColorById,
		religionColorById,
		cultureNameById,
		religionNameById,
	}
}

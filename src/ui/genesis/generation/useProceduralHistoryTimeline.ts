import { useEffect, useMemo, useState } from "react"
import { HISTORY } from "@/model/history/record"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RELIGION } from "@/model/history/sim/religion"
import { FRAME } from "@/model/history/world-frame"
import type { PartitionRow } from "@/model/history/world-frame/types"
import type { HistoryTimelineInput } from "@/ui/genesis/generation/types"

const PROCEDURAL_START_TIME_MS = (STATE.defaultStartYear - 2) * 365 * 86_400_000
const PROCEDURAL_ENGINE_START_TIME_MS =
	STATE.defaultStartYear * 365 * 86_400_000

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

export function useProceduralHistoryTimeline({
	world,
	religionMode,
	journalTransactionsRef,
	journalVersion,
}: HistoryTimelineInput) {
	const isProcedural =
		!!world && !world.isEarthImport && !!world.provinces && !!world.nations

	const [recordVersion, setRecordVersion] = useState(0)
	const session = useMemo(() => {
		if (!isProcedural || !world) return null
		const next = SIM_RECORD.buildProceduralState({
			world,
			startTimeMs: PROCEDURAL_ENGINE_START_TIME_MS,
		})
		return {
			state: next,
			translator: SIM_RECORD.createTranslator({ state: next, world }),
			progress: { journalVersion: -1 },
		}
	}, [isProcedural, world])
	const state = session?.state ?? null
	useEffect(() => {
		if (!session) return
		const { state: sessionState, translator, progress } = session
		if (progress.journalVersion === journalVersion) return
		progress.journalVersion = journalVersion
		const transactions = journalTransactionsRef.current
		if (transactions.length === 0) return
		const previousMax = sessionState.record.maxTimeMs
		SIM_RECORD.consumeJournal({ translator, transactions })
		setSelectedTimeMs((time) =>
			time >= previousMax ? sessionState.record.maxTimeMs : time,
		)
		setRecordVersion((version) => version + 1)
	}, [session, journalTransactionsRef, journalVersion])

	const [selectedTimeMs, setSelectedTimeMs] = useState(PROCEDURAL_START_TIME_MS)

	// biome-ignore lint/correctness/useExhaustiveDependencies: recordVersion signals in-place record appends that frameAt cannot observe.
	const query = useMemo(() => {
		if (!state) return null
		const frame = HISTORY.frameAt({ state, timeMs: selectedTimeMs })
		return { frame, renderInputs: FRAME.toRenderInputs({ frame }) }
	}, [state, selectedTimeMs, recordVersion])

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
		recordVersion,
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

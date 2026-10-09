import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { HISTORY } from "@/model/history/record"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RELIGION_DOCTRINE } from "@/model/history/sim/religion/doctrine"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import type { ReligionWikiDataInput } from "@/ui/genesis/view/types"
import {
	religionGroupLabel,
	religionOptionLabel,
} from "@/ui/genesis/wiki-bridge/religion-labels"
import { buildReligionWikiData } from "@/ui/genesis/wiki-bridge/useReligionWikiData"
import { ReligionWikiPage } from "@/ui/wiki/religion/ReligionWikiPage"

describe("religion wiki", () => {
	it("renders all religion data and resolves only supported keys", () => {
		const { generated, engine } = HISTORY_RUN.createEngine({
			seed: 14963991,
			era: "lateMedieval",
			numPoints: 12000,
		})
		const world = generated as unknown as SerializedGenesisWorld
		const state = SIM_RECORD.buildProceduralState({
			world,
			startTimeMs: engine.time,
		})
		const frame = HISTORY.frameAt({ state, timeMs: engine.time })
		const selectReligion = vi.fn(),
			selectNation = vi.fn()
		const input: ReligionWikiDataInput = {
			world,
			frame,
			selectedWikiReligionId: null,
			setSelectedWikiReligionId: selectReligion,
			setSelectedWikiNationId: selectNation,
		}
		const doctrine = world.religionDoctrine!,
			width = RELIGION_DOCTRINE.groups.length
		let violations = 0
		for (const row of frame.religions) {
			const result = buildReligionWikiData({
					...input,
					selectedWikiReligionId: row.id,
				}),
				data = result.data
			if (!data || result.selection.resolve(row.key) !== row.id) {
				violations++
				continue
			}
			if (
				data.color !== `rgb(${row.color[0]}, ${row.color[1]}, ${row.color[2]})`
			)
				violations++
			const html = renderToStaticMarkup(
				createElement(ReligionWikiPage, { religion: data }),
			)
			if (
				data.stats.length !== width ||
				html.includes(">Provinces<") ||
				html.includes(">Doctrines<") ||
				data.virtues.length !== 3 ||
				data.sins.length !== 3
			)
				violations++
			let differences = 0
			for (let group = 0; group < width; group++) {
				const definition = RELIGION_DOCTRINE.groups[group],
					family = world.religionFamilies![row.id]
				const differs =
					doctrine.options[row.id * width + group] !==
					doctrine.familyOptions[family * width + group]
				if (differs) differences++
				const option = religionOptionLabel({
					group: definition.name,
					option: definition.options[doctrine.options[row.id * width + group]],
				})
				if (
					data.stats[group].label !== religionGroupLabel(definition.name) ||
					data.stats[group].value !==
						(differs ? `${option} · differs` : option) ||
					Boolean(data.stats[group].valueHelp) !== differs ||
					!html.includes(`>${data.stats[group].label}<`)
				)
					violations++
			}
			if ((html.match(/ · differs/g) ?? []).length !== differences) violations++
			for (const sibling of data.siblings) {
				const siblingId = result.selection.resolve(sibling.key)
				if (
					siblingId === null ||
					world.religionFamilies![siblingId] !== world.religionFamilies![row.id]
				)
					violations++
				sibling.onClick()
				if (selectReligion.mock.lastCall?.[0] !== siblingId) violations++
			}
			for (const nation of data.nations) {
				nation.onClick()
				if (selectNation.mock.lastCall?.[0] !== Number(nation.key)) violations++
			}
			if (
				buildReligionWikiData({
					...input,
					world: { ...world, religionDoctrine: undefined },
				}).selection.resolve(row.key) !== null
			)
				violations++
		}
		expect(violations).toBe(0)
		expect(
			buildReligionWikiData({
				...input,
				selectedWikiReligionId: doctrine.virtues.length,
			}).data,
		).toBeNull()
		const last = frame.religions.at(-1)!
		expect(
			buildReligionWikiData({
				...input,
				world: {
					...world,
					religionDoctrine: {
						...doctrine,
						options: new Uint8Array(last.id * width),
					},
				},
			}).selection.resolve(last.key),
		).toBeNull()
	})
})

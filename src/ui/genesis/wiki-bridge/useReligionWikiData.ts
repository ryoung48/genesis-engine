import { useMemo } from "react"
import { RELIGION } from "@/model/history/sim/religion"
import { RELIGION_DOCTRINE } from "@/model/history/sim/religion/doctrine"
import { TEXT } from "@/model/shared/text"
import type { ReligionWikiDataInput } from "@/ui/genesis/view/types"
import {
	religionGroupLabel,
	religionOptionLabel,
} from "@/ui/genesis/wiki-bridge/religion-labels"
import { rgb255ToCss } from "@/ui/wiki/nation/timeline-formatting"
import type { ReligionWikiData } from "@/ui/wiki/religion/types"
export function useReligionWikiData(input: ReligionWikiDataInput) {
	const {
		world,
		frame,
		selectedWikiReligionId,
		setSelectedWikiReligionId,
		setSelectedWikiNationId,
	} = input
	return useMemo(
		() =>
			buildReligionWikiData({
				world,
				frame,
				selectedWikiReligionId,
				setSelectedWikiReligionId,
				setSelectedWikiNationId,
			}),
		[
			world,
			frame,
			selectedWikiReligionId,
			setSelectedWikiReligionId,
			setSelectedWikiNationId,
		],
	)
}
export function buildReligionWikiData(input: ReligionWikiDataInput) {
	const { world, frame, selectedWikiReligionId: id } = input
	const doctrine = world?.religionDoctrine
	const width = RELIGION_DOCTRINE.groups.length
	const resolve = (key: string): number | null => {
		const row = frame?.religions.find((row) => row.key === key)
		return doctrine &&
			row &&
			row.id >= 0 &&
			row.id < doctrine.options.length / width
			? row.id
			: null
	}
	const forKey = (key: string): (() => void) | undefined => {
		const id = resolve(key)
		return id === null ? undefined : () => input.setSelectedWikiReligionId(id)
	}
	const selection = {
		forKey,
		selectKey: (key: string) => forKey(key)?.(),
		resolve,
		select: (id: number) => input.setSelectedWikiReligionId(id),
	}
	if (
		!frame ||
		!doctrine ||
		!world?.religionFamilies ||
		!world.religionTypes ||
		id === null ||
		id < 0 ||
		id >= doctrine.options.length / width
	)
		return { data: null, selection }
	const row = frame.religions.find((row) => row.id === id)
	if (!row) return { data: null, selection }
	const family = world.religionFamilies[id]
	const siblings = frame.religions
		.filter((row) => world.religionFamilies![row.id] === family)
		.sort((a, b) => a.id - b.id)
	const holdings = new Map<number, number>()
	let provinces = 0
	for (let province = 0; province < frame.provinceReligion.length; province++)
		if (frame.provinceReligion[province] === id) {
			provinces++
			const nation = frame.provinceNation[province]
			if (nation >= 0) holdings.set(nation, (holdings.get(nation) ?? 0) + 1)
		}
	const data: ReligionWikiData = {
		name: row.name,
		color: rgb255ToCss([...row.color]),
		typeName: RELIGION.religionTypeNames[world.religionTypes[id]],
		familyName: `${siblings[0].name} family`,
		siblings: siblings
			.filter((sibling) => sibling.id !== id)
			.map((sibling) => ({
				key: sibling.key,
				name: sibling.name,
				color: rgb255ToCss([...sibling.color]),
				dimmed: false,
				title: sibling.name,
				onClick: () => selection.select(sibling.id),
			})),
		doctrines: RELIGION_DOCTRINE.groups.map((group, index) => ({
			group: religionGroupLabel(group.name),
			option: religionOptionLabel({
				group: group.name,
				option: group.options[doctrine.options[id * width + index]],
			}),
			differs:
				doctrine.options[id * width + index] !==
				doctrine.familyOptions[family * width + index],
		})),
		virtues: doctrine.virtues[id].map((trait) => TEXT.titleCase(trait)),
		sins: doctrine.sins[id].map((trait) => TEXT.titleCase(trait)),
		stats: [{ label: "Provinces", value: provinces.toLocaleString() }],
		nations: [...holdings]
			.sort((a, b) => b[1] - a[1])
			.flatMap(([nationId, count]) => {
				const nation = frame.nations.get(nationId)
				return nation
					? [
							{
								key: String(nationId),
								name: nation.name,
								color: rgb255ToCss([...nation.color]),
								dimmed: false,
								title: `${count.toLocaleString()} provinces`,
								onClick: () => input.setSelectedWikiNationId(nationId),
							},
						]
					: []
			}),
	}
	return { data, selection }
}

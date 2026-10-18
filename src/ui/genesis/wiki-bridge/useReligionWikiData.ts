import { useMemo } from "react"
import { RELIGION } from "@/model/history/sim/religion"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import { TEXT } from "@/model/shared/text"
import type { ReligionWikiDataInput } from "@/ui/genesis/view/types"
import {
	religionGroupLabel,
	religionOptionLabel,
} from "@/ui/genesis/wiki-bridge/religion-labels"
import { rgb255ToCss } from "@/ui/wiki/nation/timeline-formatting"
import type { ReligionWikiData } from "@/ui/wiki/religion/types"

export function useReligionWikiData(
	input: ReligionWikiDataInput,
): ReligionWikiData | null {
	const {
		world,
		history,
		planetName,
		selectedWikiReligionId: id,
		setSelectedWikiReligionId,
		setSelectedWikiNationId,
	} = input
	return useMemo(() => {
		const frame = history.query?.frame
		if (
			!frame ||
			id === null ||
			!world?.religionTypes ||
			!world.religionFamilies
		)
			return null
		const doctrine = RELIGION_DOCTRINE.of({
			religionTypes: world.religionTypes,
			religionFamilies: world.religionFamilies,
			seed: world.params.seed,
		})
		const width = RELIGION_DOCTRINE.groups.length
		const row = frame.religions.find((entry) => entry.id === id)
		if (!row || id * width >= doctrine.options.length) return null
		const family = world.religionFamilies[id]
		const siblings = frame.religions
			.filter((entry) => world.religionFamilies?.[entry.id] === family)
			.sort((a, b) => a.id - b.id)
		const holdings = new Map<number, number>()
		for (let province = 0; province < frame.provinceReligion.length; province++)
			if (frame.provinceReligion[province] === id) {
				const nation = frame.provinceNation[province]
				if (nation >= 0) holdings.set(nation, (holdings.get(nation) ?? 0) + 1)
			}
		return {
			name: row.name,
			color: rgb255ToCss([...row.color]),
			typeName: RELIGION.religionTypeNames[world.religionTypes[id]],
			familyName: `${siblings[0].name} family`,
			planetTitle: planetName,
			onBack: () => setSelectedWikiReligionId(null),
			siblings: siblings
				.filter((sibling) => sibling.id !== id)
				.map((sibling) => ({
					key: sibling.key,
					name: sibling.name,
					color: rgb255ToCss([...sibling.color]),
					dimmed: false,
					title: sibling.name,
					onClick: () => setSelectedWikiReligionId(sibling.id),
				})),
			stats: RELIGION_DOCTRINE.groups.map((group, index) => {
				const option = religionOptionLabel({
					group: group.name,
					option: group.options[doctrine.options[id * width + index]],
				})
				const differs =
					doctrine.options[id * width + index] !==
					doctrine.familyOptions[family * width + index]
				return {
					label: religionGroupLabel(group.name),
					value: differs ? `${option} · differs` : option,
					valueHelp: differs ? "Differs from the family's doctrine" : undefined,
				}
			}),
			virtues: doctrine.virtues[id].map((trait) => TEXT.titleCase(trait)),
			sins: doctrine.sins[id].map((trait) => TEXT.titleCase(trait)),
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
									onClick: () => setSelectedWikiNationId(nationId),
								},
							]
						: []
				}),
		}
	}, [
		world,
		history.query,
		planetName,
		id,
		setSelectedWikiReligionId,
		setSelectedWikiNationId,
	])
}

import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import type { PersonWikiChip } from "@/ui/wiki/person/PersonWikiPage"
export interface ReligionWikiData {
	name: string
	color: string
	typeName: string
	familyName: string
	siblings: PersonWikiChip[]
	doctrines: { group: string; option: string; differs: boolean }[]
	virtues: string[]
	sins: string[]
	stats: StatEntry[]
	nations: PersonWikiChip[]
}

export interface ReligionWikiPageProps {
	religion: ReligionWikiData
}

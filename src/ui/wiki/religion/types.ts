import type { StatEntry } from "@/ui/components/composites/EditableStatValue"

export interface ReligionWikiChip {
	key: string
	name: string
	color: string
	dimmed: boolean
	title: string
	onClick: () => void
}

export interface ReligionWikiData {
	name: string
	color: string
	typeName: string
	familyName: string
	siblings: ReligionWikiChip[]
	virtues: string[]
	sins: string[]
	stats: StatEntry[]
	nations: ReligionWikiChip[]
	onBack: () => void
	planetTitle: string
}

export interface ReligionWikiPageProps {
	religion: ReligionWikiData
}

import { TEXT } from "@/model/shared/text"
import type { ReligionOptionLabelInput } from "@/ui/genesis/wiki-bridge/types"

const GROUP_LABELS: Record<string, string> = {
	theocracy: "Clerical Tradition",
	monasticism: "Monasticism",
}
const OPTION_LABELS: Record<string, string> = {
	"theocracy:temporal": "Theocratic",
	"theocracy:lay_clergy": "Lay Clergy",
	"head_of_faith:none": "No Head",
	"head_of_faith:spiritual": "Spiritual Head",
	"head_of_faith:temporal": "Temporal Head",
	"consanguinity:aunt_nephew_and_uncle_niece": "Aunt/Nephew and Uncle/Niece",
}
export function religionGroupLabel(name: string): string {
	return GROUP_LABELS[name] ?? TEXT.titleCase(name.replaceAll("_", " "))
}
export function religionOptionLabel(input: ReligionOptionLabelInput): string {
	return (
		OPTION_LABELS[`${input.group}:${input.option}`] ??
		TEXT.titleCase(input.option.replaceAll("_", " "))
	)
}

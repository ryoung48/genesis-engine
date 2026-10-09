import type {
	CongenitalTrait,
	GradeTrait,
	PersonalityTrait,
} from "@/model/history/sim/people/traits/types"
import { TEXT } from "@/model/shared/text"
import { uiPalette } from "@/ui/components/tokens"

export type PersonTraitTone = keyof typeof uiPalette.person.trait

export interface PersonTraitView {
	name: string
	tone: PersonTraitTone
}

const TONE_LABELS: Record<PersonTraitTone, string> = {
	virtue: "Virtue",
	vice: "Vice",
	neutral: "Temperament",
	gift: "Natural gift",
	defect: "Natural defect",
	lineage: "Lineage",
}

const PERSONALITY_TONES: Record<PersonalityTrait, PersonTraitTone> = {
	brave: "virtue",
	craven: "vice",
	ambitious: "neutral",
	content: "virtue",
	wrathful: "vice",
	calm: "virtue",
	just: "virtue",
	arbitrary: "vice",
	diligent: "virtue",
	lazy: "vice",
	generous: "virtue",
	greedy: "vice",
	lustful: "vice",
	chaste: "virtue",
	temperate: "virtue",
	gluttonous: "vice",
	patient: "virtue",
	impatient: "vice",
	humble: "virtue",
	arrogant: "vice",
	honest: "virtue",
	deceitful: "vice",
	gregarious: "virtue",
	shy: "vice",
	zealous: "virtue",
	cynical: "vice",
	trusting: "virtue",
	paranoid: "vice",
	forgiving: "virtue",
	vengeful: "vice",
	compassionate: "virtue",
	callous: "vice",
	sadistic: "vice",
	stubborn: "neutral",
	fickle: "neutral",
	eccentric: "neutral",
}

const CONGENITAL_TONES: Record<CongenitalTrait, PersonTraitTone> = {
	giant: "gift",
	dwarf: "defect",
	clubfooted: "defect",
	hunchbacked: "defect",
	spindly: "defect",
	lisping: "defect",
	stuttering: "defect",
	bleeder: "defect",
	wheezing: "defect",
	infertile: "defect",
	scaly: "defect",
	albino: "defect",
	depressed: "defect",
	lunatic: "defect",
	possessed: "defect",
	inbred: "defect",
	pure_blooded: "lineage",
}

const CONGENITAL_LABELS: Partial<Record<CongenitalTrait, string>> = {
	pure_blooded: "Pure-blooded",
}

function personality(trait: PersonalityTrait): PersonTraitView {
	return { name: TEXT.capitalize(trait), tone: PERSONALITY_TONES[trait] }
}

function grade({ label, grade: value }: GradeTrait): PersonTraitView {
	return { name: label, tone: value > 0 ? "gift" : "defect" }
}

function congenital(trait: CongenitalTrait): PersonTraitView {
	return {
		name: CONGENITAL_LABELS[trait] ?? TEXT.capitalize(trait),
		tone: CONGENITAL_TONES[trait],
	}
}

export const PERSON_TRAITS = {
	personality,
	grade,
	congenital,
	toneLabels: TONE_LABELS,
}

import { STRESS_EVENTS } from "@/model/history/sim/engine/events/people/stress"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { ConfigureStageParams } from "@/test/history-run/report/people-traits/stages/types"

function configure({ stage }: ConfigureStageParams): () => void {
	const originalGovernor = { ...GOVERNOR }
	const originalStress = STRESS_EVENTS.runYear
	const originalFertility = TRAITS.fertility
	if (stage === "draw") TRAITS.fertility = () => 1
	if (stage === "draw" || stage === "fertility") {
		GOVERNOR.factor = ({ attribute }) => (attribute === "diplomacy" ? 0 : 1)
		GOVERNOR.personAttribute = ({ attribute }) => ATTRIBUTES.neutral(attribute)
	}
	if (stage !== "stress" && stage !== "personality")
		STRESS_EVENTS.runYear = () => undefined
	if (stage !== "personality") {
		GOVERNOR.has = () => false
		GOVERNOR.personHas = () => false
		GOVERNOR.incomeFactor = () => 1
		GOVERNOR.startsWar = ({ roll, threat }) => roll > threat
	}
	return () => {
		Object.assign(GOVERNOR, originalGovernor)
		STRESS_EVENTS.runYear = originalStress
		TRAITS.fertility = originalFertility
	}
}
export const CHARACTER_STAGES = { configure }

import type {
	BattleKind,
	ChooseParams,
	ChosenBattle,
	ModifiersParams,
	TownParams,
} from "@/model/history/sim/engine/events/battle/kind/types"
import { TERRAIN } from "@/model/history/sim/engine/terrain"

const WEIGHTS: Record<BattleKind, number> = {
	open: 0.7,
	ambush: 0.05,
	"river crossing": 0.12,
	siege: 0.15,
}
const AMBUSH_DEFENDER_SHARE = 0.6
const AMBUSH_BONUS = 1.3
const RIVER_CROSSING_BONUS = 1.2
const TOWN_URBAN_POPULATION = 5000
function isTown({ state, province }: TownParams): boolean {
	return state.popUrbanCurrent[province] >= TOWN_URBAN_POPULATION
}
function choose({
	state,
	province,
	siegeEligible,
	rng,
}: ChooseParams): ChosenBattle {
	const eligible: BattleKind[] = ["open", "ambush"]
	if (TERRAIN.hasRiver({ state, p: province })) eligible.push("river crossing")
	if (siegeEligible && isTown({ state, province })) eligible.push("siege")
	let roll =
		rng.random() * eligible.reduce((sum, kind) => sum + WEIGHTS[kind], 0)
	for (const kind of eligible) {
		roll -= WEIGHTS[kind]
		if (roll < 0)
			return {
				kind,
				ambusher:
					kind === "ambush"
						? rng.random() < AMBUSH_DEFENDER_SHARE
							? "defender"
							: "attacker"
						: "none",
			}
	}
	return { kind: "open", ambusher: "none" }
}
function modifiers({ kind, terrain, ambusher }: ModifiersParams) {
	return {
		attackerMultiplier:
			kind === "ambush" && ambusher === "attacker" ? AMBUSH_BONUS : 1,
		defenderMultiplier:
			terrain.defense *
			(kind === "river crossing"
				? RIVER_CROSSING_BONUS
				: kind === "ambush" && ambusher === "defender"
					? AMBUSH_BONUS
					: 1),
	}
}
export const BATTLE_KIND = { choose, modifiers, isTown }

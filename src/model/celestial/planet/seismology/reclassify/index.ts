import type {
	OrbitClassification,
	OrbitGroup,
} from "@/model/celestial/orbit-body/types"
import { TEMPERATURE } from "@/model/celestial/planet/environment/temperature"
import type { HeatedClassInput } from "@/model/celestial/planet/seismology/reclassify/types"
import { RNG } from "@/model/shared/random/rng"

function describeRegime(
	totalHeating: number,
): "dead" | "low" | "active" | "extreme" {
	if (totalHeating > 100) return "extreme"
	if (totalHeating > 10) return "active"
	if (totalHeating > 1) return "low"
	return "dead"
}
// Ported from galaxy-gen's meltCheck (orbits/seismology/index.ts) --
// dice.choice(["hebean", "hebean", "geo-tidal"]) is an unconditional 2/3
// hebean, 1/3 geo-tidal split; galaxy-gen never gates it on sizeClass.
function pickHeatedClass({
	current,
	seed,
}: HeatedClassInput): OrbitClassification {
	if (current !== "rockball" && current !== "geo-cyclic") return current
	return RNG.createRng({ seed }).uniform(0, 1) < 1 / 3 ? "geo-tidal" : "hebean"
}

function nextSeismologyClass(params: {
	current: OrbitClassification
	group: OrbitGroup
	zone: ReturnType<typeof TEMPERATURE.zoneFromDeviation>
	tidalHeating: number
	totalHeating: number
	seed: number
}): OrbitClassification {
	let next = params.current
	if (
		(next === "rockball" || next === "geo-cyclic") &&
		params.tidalHeating > 5
	) {
		next = pickHeatedClass({ current: next, seed: params.seed })
	} else if (next === "rockball" && params.totalHeating > 20) {
		next = "geo-cyclic"
	} else if (
		(next === "geo-cyclic" || next === "geo-tidal" || next === "hebean") &&
		params.totalHeating < 1
	) {
		// Ported from galaxy-gen's dice.choice(["rockball", zone === "outer" ?
		// "snowball" : "rockball"]) -- an outer-zone body has a real 50% chance
		// of staying rockball instead of always becoming snowball.
		next =
			params.zone === "outer"
				? RNG.createRng({ seed: params.seed }).uniform(0, 1) < 0.5
					? "rockball"
					: "snowball"
				: "rockball"
	} else if (
		(next === "geo-tidal" || next === "hebean") &&
		params.tidalHeating < 1
	) {
		next = "geo-cyclic"
	}

	if (params.group === "dwarf" && params.totalHeating > 1_000) {
		return "meltball"
	}
	return next
}

export const RECLASSIFY = {
	describeRegime,
	nextSeismologyClass,
}

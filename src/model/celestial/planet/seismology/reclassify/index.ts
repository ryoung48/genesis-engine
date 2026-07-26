import { createRng } from "@/model/shared/rng"
import type { OrbitClassification, OrbitGroup } from "../../../orbit-body/types"
import { TEMPERATURE } from "../../environment/temperature"
import type { HeatedClassInput } from "./types"

function describeRegime(
	totalHeating: number,
): "dead" | "low" | "active" | "extreme" {
	if (totalHeating > 100) return "extreme"
	if (totalHeating > 10) return "active"
	if (totalHeating > 1) return "low"
	return "dead"
}
function pickHeatedClass({
	current,
	sizeClass,
	seed,
}: HeatedClassInput): OrbitClassification {
	if (current !== "rockball" && current !== "geo-cyclic") return current
	if (sizeClass >= 4)
		return createRng(seed).uniform(0, 1) < 1 / 3 ? "geo-tidal" : "hebean"
	return "hebean"
}

function nextSeismologyClass(params: {
	current: OrbitClassification
	group: OrbitGroup
	zone: ReturnType<typeof TEMPERATURE.zoneFromDeviation>
	sizeClass: number
	tidalHeating: number
	totalHeating: number
	seed: number
}): OrbitClassification {
	let next = params.current
	if (
		(next === "rockball" || next === "geo-cyclic") &&
		params.tidalHeating > 5
	) {
		next = pickHeatedClass({
			current: next,
			sizeClass: params.sizeClass,
			seed: params.seed,
		})
	} else if (next === "rockball" && params.totalHeating > 20) {
		next = "geo-cyclic"
	} else if (
		(next === "geo-cyclic" || next === "geo-tidal" || next === "hebean") &&
		params.totalHeating < 1
	) {
		next = params.zone === "outer" ? "snowball" : "rockball"
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

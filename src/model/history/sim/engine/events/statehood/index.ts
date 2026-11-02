import { DERIVE } from "@/model/history/sim/engine/derive"
import type {
	AbsorbParams,
	ClaimOption,
	ClaimOptionsParams,
	DistanceParams,
	ProvinceParams,
	StatehoodRunParams,
	StretchParams,
} from "@/model/history/sim/engine/events/statehood/types"
import { LAND_SHARES } from "@/model/history/sim/engine/land-shares"
import { STATE } from "@/model/history/sim/engine/state"
import { UNITS } from "@/model/shared/units"

const STRETCH_PENALTY = 3

function isHeld({ state, p }: ProvinceParams): boolean {
	return !state.desolate[p] && !state.uninhabited[p] && !state.stateless[p]
}

function isOpen({ state, p }: ProvinceParams): boolean {
	return !state.desolate[p] && !state.uninhabited[p] && !!state.stateless[p]
}

function hasStateNeighbor({ state, p }: ProvinceParams): boolean {
	for (
		let j = state.provinceAdjOffset[p];
		j < state.provinceAdjOffset[p + 1];
		j++
	)
		if (isHeld({ state, p: state.provinceAdjList[j] })) return true
	return false
}

function distanceKm({ state, a, b }: DistanceParams): number {
	return UNITS.regionDistanceKm({
		r_xyz: state.province_xyz,
		fromRegion: a,
		toRegion: b,
		planetRadiusKm: state.planetRadiusKm,
	})
}

function stretch({ state, nation, province, members }: StretchParams): number {
	return (
		distanceKm({ state, a: nation, b: province }) /
		(state.land.spacingKm * Math.sqrt((members + 1) / Math.PI))
	)
}

function claimOptions({
	state,
	frontier,
	members,
}: ClaimOptionsParams): ClaimOption[] {
	DERIVE.ensureHierarchyClean(state)
	const options: ClaimOption[] = []
	for (const province of frontier) {
		const enclosure = new Map<number, number>()
		for (
			let j = state.provinceAdjOffset[province];
			j < state.provinceAdjOffset[province + 1];
			j++
		) {
			const neighbor = state.provinceAdjList[j]
			if (!isHeld({ state, p: neighbor })) continue
			const nation = state.sovereignCurrent[neighbor]
			enclosure.set(nation, (enclosure.get(nation) ?? 0) + 1)
		}
		for (const [nation, count] of enclosure)
			options.push({
				nation,
				province,
				weight:
					count ** 2 *
					Math.exp(
						-STRETCH_PENALTY *
							Math.max(
								0,
								stretch({
									state,
									nation,
									province,
									members: members[nation],
								}) - 1,
							),
					),
			})
	}
	return options
}

function absorb({ state, rng, held, wanted }: AbsorbParams): void {
	const land = state.land
	let deficit = wanted - held
	land.counters.unmetDemand = Math.max(0, deficit)
	if (deficit <= 0) return
	DERIVE.ensureHierarchyClean(state)
	const members = new Int32Array(state.P)
	for (let p = 0; p < state.P; p++)
		if (isHeld({ state, p })) members[state.sovereignCurrent[p]]++
	const frontier = new Set<number>()
	for (let p = 0; p < state.P; p++)
		if (isOpen({ state, p }) && hasStateNeighbor({ state, p })) frontier.add(p)
	while (deficit > 0 && frontier.size > 0) {
		const choice = rng.weightedChoice(
			claimOptions({ state, frontier, members }).map((option) => ({
				v: option,
				w: option.weight,
			})),
		)
		if (!choice) break
		if (!isOpen({ state, p: choice.province }))
			land.counters.absorptionViolations++
		STATE.claimStateless({
			state,
			nation: choice.nation,
			province: choice.province,
		})
		land.counters.absorptions++
		members[choice.nation]++
		frontier.delete(choice.province)
		for (
			let j = state.provinceAdjOffset[choice.province];
			j < state.provinceAdjOffset[choice.province + 1];
			j++
		) {
			const neighbor = state.provinceAdjList[j]
			if (isOpen({ state, p: neighbor })) frontier.add(neighbor)
		}
		deficit--
	}
	land.counters.unmetDemand = Math.max(0, deficit)
}

function run({ state, rng }: StatehoodRunParams): void {
	const land = state.land
	if (!land.governed) return
	LAND_SHARES.refresh({ state })
	let held = 0
	let unsettled = 0
	for (let p = 0; p < state.P; p++) {
		if (isHeld({ state, p })) held++
		if (!state.desolate[p] && state.uninhabited[p]) unsettled++
	}
	const wanted = Math.round(land.stateHeldTarget * (land.habitable - unsettled))
	absorb({ state, rng, held, wanted })
	LAND_SHARES.refresh({ state })
}

export const STATEHOOD = { run }

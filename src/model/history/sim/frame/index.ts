import type { BuildProceduralFrameParams } from "@/model/history/sim/frame/types"
import { FRAME } from "@/model/history/world-frame"
import type { NationFrame, WorldFrame } from "@/model/history/world-frame/types"

// Assembles the single static WorldFrame for a procedurally generated history
// from its stored initial conditions. There is no time evolution yet, so
// `timeMs` only tags the returned frame -- the contents are identical for every
// call (see ProceduralInitialConditions).
function buildProceduralFrame({
	state,
	timeMs,
}: BuildProceduralFrameParams): WorldFrame {
	if (state.record.origin !== "procedural")
		throw new Error("Procedural frame requested for earth history")
	const { record } = state
	const init = record.timeline.initial
	const count = init.provinceCount

	const provinceNation = init.provinceNation.slice()
	const provinceCulture = init.provinceCulture.slice()
	const provinceReligion = init.provinceReligion.slice()

	const present = new Set<number>()
	for (let province = 0; province < count; province++) {
		const nation = provinceNation[province]
		if (nation >= 0) present.add(nation)
	}

	const initById = new Map(init.nations.map((nation) => [nation.id, nation]))
	const nations = new Map<number, NationFrame>()
	for (const identity of record.nations) {
		if (!present.has(identity.id)) continue
		const nationInit = initById.get(identity.id)
		nations.set(identity.id, {
			id: identity.id,
			name: identity.name,
			color: identity.color,
			capitalProvince: nationInit?.capitalProvince ?? -1,
			government: nationInit?.government ?? "",
			governmentReform: nationInit?.governmentReform ?? "",
			ruler: null,
			birthTimeMs: identity.birthTimeMs,
			deathTimeMs: identity.deathTimeMs,
			relations: FRAME.emptyRelations(),
			wealth: 0,
			optimalWealth: 0,
			isEmperor: false,
			isElector: false,
			organizations: [],
		})
	}

	let totalPopulation = 0
	for (let province = 0; province < count; province++)
		totalPopulation += init.provincePopulation[province]

	return {
		timeMs,
		provinceCount: count,
		provinceNation,
		provinceController: provinceNation.slice(),
		provinceCulture,
		provinceReligion,
		provinceCultureBlendSecondary: init.provinceCultureBlendSecondary.slice(),
		provinceHre: new Uint8Array(count),
		provincePopulation: init.provincePopulation.slice(),
		provincePopulationUrban: init.provincePopulationUrban.slice(),
		provinceDevelopment: init.provinceDevelopment.slice(),
		nations,
		wars: [],
		organizations: [],
		cultures: record.cultures,
		religions: record.religions,
		nationCount: nations.size,
		totalPopulation,
	}
}

export const SIM_FRAME = {
	buildProceduralFrame,
}

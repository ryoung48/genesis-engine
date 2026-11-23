import { MATH } from "@/model/shared/math/core"
import { FARMING_GROUND } from "@/model/society/farming/ground"
import { FARMING_LIVING } from "@/model/society/farming/living"
import type {
	AdvantageParams,
	ModeOfParams,
	WayOfLife,
	WayOfLifeAtParams,
	WayOfLifeField,
	WayOfLifeFieldParams,
	WayOfLifePeople,
	WayOfLifeShares,
} from "@/model/society/farming/types"

const ADVANTAGE_RAMP = { edge0: 1, edge1: 2 }

function advantage({ capacity, forage }: AdvantageParams): number {
	return MATH.smoothstep({
		...ADVANTAGE_RAMP,
		x: forage > 0 ? capacity / forage : ADVANTAGE_RAMP.edge1,
	})
}

// Share of a province's land each practice holds at a year. Each practice's
// potential is its climate fit, widened by the yield of the requested tech
// level and gated by how far it out-yields foraging. Its land is foraged until
// it is adopted, then switches over along the adoption ramp and keeps
// expanding toward that potential with age.
function landAt({
	farming,
	province,
	year,
	techLevel,
}: WayOfLifeAtParams): WayOfLifeShares {
	if (farming.settledYear[province] > year)
		return { forage: 0, farm: 0, herd: 0 }
	const yieldFactor = FARMING_LIVING.yieldFactor({ techLevel })
	const forage = farming.forageDensity[province]
	const potential = (fit: number, capacity: number) =>
		fit > 0
			? fit ** (1 / yieldFactor) *
				advantage({ capacity: capacity * yieldFactor, forage })
			: 0
	let farmPotential = potential(
		farming.farmFit[province] +
			FARMING_GROUND.terraceShare({ techLevel }) * farming.terraceFit[province],
		farming.farmCapacity[province],
	)
	let herdPotential =
		farming.herdColonial[province] === 1
			? farming.herdCapacity[province] > forage
				? farming.herdFit[province]
				: 0
			: potential(farming.herdFit[province], farming.herdCapacity[province])
	const overflow = farmPotential + herdPotential
	if (overflow > 1) {
		farmPotential /= overflow
		herdPotential /= overflow
	}
	const farmYears = year - farming.adoptionYear[province]
	const herdYears = year - farming.herdAdoptionYear[province]
	const farm =
		farmYears >= 0
			? farmPotential *
				(farming.farmModern[province] === 1
					? FARMING_LIVING.colonialRamp({ years: farmYears })
					: FARMING_LIVING.expansion({ years: farmYears }))
			: 0
	const colonial = farming.herdColonial[province] === 1
	const herd =
		herdYears >= 0
			? herdPotential *
				(colonial
					? FARMING_LIVING.colonialRamp({ years: herdYears })
					: FARMING_LIVING.expansion({ years: herdYears }))
			: 0
	return { forage: Math.max(0, 1 - farm - herd), farm, herd }
}

// People per km2 each practice supports on its own land; each practice's
// density climbs from foraging toward its capacity with time since adoption.
function densitiesAt({
	farming,
	province,
	year,
}: WayOfLifeAtParams): WayOfLifePeople {
	const forage = farming.forageDensity[province]
	return {
		forage,
		farm: (farming.farmModern[province] === 1
			? FARMING_LIVING.colonialDensity
			: FARMING_LIVING.density)({
			forage,
			capacity: FARMING_LIVING.farmDensity({
				capacity: farming.farmCapacity[province],
			}),
			years: year - farming.adoptionYear[province],
		}),
		herd: (farming.herdColonial[province] === 1
			? FARMING_LIVING.colonialDensity
			: FARMING_LIVING.density)({
			forage,
			capacity: farming.herdCapacity[province],
			years: year - farming.herdAdoptionYear[province],
		}),
	}
}

// Ways of life and population density across the whole world at a year,
// from each province's land shares and per-practice densities. Every map,
// the Earth checks read this one field, so they agree.
function wayOfLife({
	farming,
	graph,
	year,
	techLevel,
}: WayOfLifeFieldParams): WayOfLifeField {
	const field: WayOfLifeField = {
		forage: new Float32Array(graph.count),
		farm: new Float32Array(graph.count),
		herd: new Float32Array(graph.count),
		density: new Float32Array(graph.count),
	}
	for (let province = 0; province < graph.count; province++) {
		if (graph.desolate[province]) continue
		const at = { farming, province, year, techLevel }
		const land = landAt(at)
		const perPractice = densitiesAt(at)
		const forage = land.forage * perPractice.forage
		const farm = land.farm * perPractice.farm
		const herd = land.herd * perPractice.herd
		const density = forage + farm + herd
		if (!(density > 0)) continue
		field.forage[province] = forage / density
		field.farm[province] = farm / density
		field.herd[province] = herd / density
		field.density[province] = density
	}
	return field
}

// Most of a province's people forage: the test behind forager TL caps and the
// rule that foraging provinces hold no towns.
const FORAGER_MAJORITY = 0.5

function foraging({ field, province }: ModeOfParams): boolean {
	return field.forage[province] > FORAGER_MAJORITY
}

function modeOf({ field, province }: ModeOfParams): WayOfLife {
	const forage = field.forage[province]
	const farm = field.farm[province]
	const herd = field.herd[province]
	if (forage + farm + herd <= 0) return "uninhabited"
	if (farm >= forage && farm >= herd) return "farm"
	if (herd >= forage) return "herd"
	return "forage"
}

export const FARMING_WAY_OF_LIFE = {
	foraging,
	modeOf,
	wayOfLife,
}

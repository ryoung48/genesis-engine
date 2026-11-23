import { MATH } from "@/model/shared/math/core"
import { FARMING_WAY_OF_LIFE } from "@/model/society/farming/way-of-life"
import type {
	AssignTechLevelParams,
	AverageLevelParams,
	LeaderLevelParams,
	SmoothRuralParams,
	StretchParams,
	WayOfLifeCapsParams,
} from "@/model/society/tech-level/spread/types"

const LEADERS = {
	domain: [0, 0.5, 1, 1.8, 2.35, 3, 3.8, 5, 6, 7.3, 7.8, 12],
	range: [0.5, 1.4, 2, 2.5, 3.15, 4.1, 5, 6.1, 7, 8.2, 8.8, 12],
}
// Forager caps by the land's own foraging density (people/km2), read on a log
// scale: sparse desert and tundra bands (about 0.01-0.03/km2, e.g. Western
// Desert Aboriginal Australians, interior Inuit) stay Paleolithic; inland
// foragers top out in the late Mesolithic (Hadza, rainforest foragers about
// 0.2-0.4/km2); only rich coast and river foragers (Northwest Coast, Jomon,
// about 0.5-1+/km2) reach the late Neolithic. Densities after Kelly, The
// Lifeways of Hunter-Gatherers (2013).
const FORAGER_TL_CAP = {
	domain: [Math.log10(0.03), Math.log10(0.5), Math.log10(1)],
	range: [0.2, 0.6, 0.95],
}
// Stateless farmers and herders cap by their people per km2, read on a log
// scale: about 1/km2 (early Neolithic farming, mobile pastoralists) stays at
// the late Neolithic, joining the forager cap's top; about 10/km2 (Bronze Age
// and Iron Age tribal Europe, 5-15/km2) reaches the Late Bronze Age; 50/km2
// and up (the densest pre-state chiefdoms, e.g. pre-contact Hawaii) reaches
// the Iron Age. Densities after Zimmermann et al. (2009), Human Biology 81.
const STATELESS_TL_CAP = {
	domain: [0, 1, Math.log10(50)],
	range: [0.95, 1.67, 2.3],
}
// TL falls steeply just below the most developed province and levels off
// toward the floor. Anchors chosen by the user at the default (target 3.15,
// leader-to-average gap 0.8): development 0.45 sits at TL 2.3 and the floor
// at TL 1. The drops are kept as multiples of the gap so other eras keep the
// same shape: 0.85 / 0.8 and 2.15 / 0.8.
const MID_DEVELOPMENT = 0.45
const MID_DROP_GAPS = 0.85 / 0.8
const FLOOR_DROP_GAPS = 2.15 / 0.8
// The lowest development the urbanization curve gives a settled place (1,000
// people, urbanPopToDev). It also keeps stateless land, at development 0, finite:
// those provinces sit at this level before their caps.
const DEVELOPMENT_FLOOR = 0.05
// A province with fewer urban people than this has no town to hold its level.
const TOWN_URBAN_POPULATION = 1000
// Two passes reach neighbours of neighbours, enough to soften a one-province
// edge without flattening whole regions; more passes would erase real gradients.
const SMOOTHING_PASSES = 2
// Half weight on itself keeps a province's own development as large as the
// neighbourhood's pull, the simplest split that visibly blends.
const SELF_WEIGHT = 0.5

function leaderLevel({ techLevel }: LeaderLevelParams): number {
	return MATH.piecewise({ ...LEADERS, x: techLevel })
}

const AVERAGE_PRECISION = 1e9

function averageLevel({ target }: AverageLevelParams): number {
	const average = MATH.piecewise({
		domain: LEADERS.range,
		range: LEADERS.domain,
		x: target,
	})
	return Math.round(average * AVERAGE_PRECISION) / AVERAGE_PRECISION
}

// TL is read off log2(development) through three anchors: the floor, 0.45 and
// the most developed province, which sits exactly on the leader target.
// Between anchors it is linear in log2(development); levels are then clamped
// at zero and at each province's way-of-life cap.
function stretch({
	values,
	settled,
	techLevel,
	leaders,
	caps,
}: StretchParams): Float32Array {
	let top = DEVELOPMENT_FLOOR
	for (const p of settled) top = Math.max(top, values[p])
	const gap = leaders - techLevel
	const anchors =
		top > MID_DEVELOPMENT
			? {
					domain: [DEVELOPMENT_FLOOR, MID_DEVELOPMENT, top].map(Math.log2),
					range: [
						leaders - FLOOR_DROP_GAPS * gap,
						leaders - MID_DROP_GAPS * gap,
						leaders,
					],
				}
			: {
					domain: [DEVELOPMENT_FLOOR, top].map(Math.log2),
					range: [leaders - FLOOR_DROP_GAPS * gap, leaders],
				}
	const levels = new Float32Array(values.length).fill(Number.NaN)
	for (const p of settled)
		levels[p] = Math.min(
			caps[p],
			Math.max(
				0,
				top > DEVELOPMENT_FLOOR
					? MATH.piecewise({
							...anchors,
							x: Math.log2(Math.max(values[p], DEVELOPMENT_FLOOR)),
						})
					: leaders,
			),
		)
	return levels
}

// Provinces under 1000 urban people have no real town, so their level is the
// raw development reading and shows hard edges against neighbours. Each such
// province blends toward the mean of its settled neighbours, towns included as
// sources but never moved. Realm borders and stateless land are crossed on
// purpose: the hard edges were at frontiers. The peak province stays fixed so
// the world maximum still equals the target exactly; averaging only lowers a
// province below the peak, so no other level can pass it. Caps are not applied
// again afterwards, so capped forager pockets soften toward their neighbours.
function smoothRural({
	provinces,
	levels,
	settled,
	urbanPopulation,
}: SmoothRuralParams): Float32Array {
	let peak = Number.NEGATIVE_INFINITY
	for (const p of settled) peak = Math.max(peak, levels[p])
	const movable = settled.filter(
		(p) => urbanPopulation[p] < TOWN_URBAN_POPULATION && levels[p] < peak,
	)
	let current = levels
	for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
		const next = Float32Array.from(current)
		for (const p of movable) {
			let sum = 0
			let count = 0
			for (
				let i = provinces.adjOffset[p];
				i < provinces.adjOffset[p + 1];
				i++
			) {
				const level = current[provinces.adjList[i]]
				if (Number.isNaN(level)) continue
				sum += level
				count++
			}
			if (count === 0) continue
			next[p] = Math.max(
				0,
				SELF_WEIGHT * current[p] + (1 - SELF_WEIGHT) * (sum / count),
			)
		}
		current = next
	}
	return current
}

// Foragers are capped by their land's foraging density, inside states too as
// long as they have no town: foraging peoples under nominal state rule (Inuit,
// interior Aboriginal Australians, Amazonian and Kalahari peoples around
// 1900-1950) kept stone-age technology. Stateless farmers and herders are
// capped by their people per km2; state farmers and herders and every
// province with a town are uncapped.
function wayOfLifeCaps({
	provinces,
	farming,
	shares,
	sovereign,
	urbanPopulation,
}: WayOfLifeCapsParams): Float32Array {
	return Float32Array.from(sovereign, (root, province) => {
		if (provinces.desolate[province] || !farming || !shares)
			return Number.POSITIVE_INFINITY
		if (
			FARMING_WAY_OF_LIFE.foraging({ field: shares, province }) &&
			urbanPopulation[province] < TOWN_URBAN_POPULATION
		)
			return MATH.piecewise({
				...FORAGER_TL_CAP,
				x: Math.log10(farming.forageDensity[province]),
			})
		if (root >= 0) return Number.POSITIVE_INFINITY
		return MATH.piecewise({
			...STATELESS_TL_CAP,
			x: Math.log10(shares.density[province]),
		})
	})
}

function assign({
	provinces,
	population,
	development,
	urbanPopulation,
	sovereign,
	farming,
	year,
	techLevel,
}: AssignTechLevelParams): Float32Array {
	const settled: number[] = []
	for (let p = 0; p < provinces.count; p++)
		if (population[p] > 0 && !provinces.desolate[p]) settled.push(p)
	if (settled.length === 0)
		return new Float32Array(provinces.count).fill(Number.NaN)

	const shares = farming
		? FARMING_WAY_OF_LIFE.wayOfLife({
				farming,
				graph: provinces,
				year,
				techLevel,
			})
		: null
	const caps = wayOfLifeCaps({
		provinces,
		farming,
		shares,
		sovereign,
		urbanPopulation,
	})
	const stretched = stretch({
		values: development,
		settled,
		techLevel,
		leaders: leaderLevel({ techLevel }),
		caps,
	})
	return smoothRural({
		provinces,
		levels: stretched,
		settled,
		urbanPopulation,
	})
}

export const TECH_SPREAD = { assign, leaderLevel, averageLevel }

import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"
import type {
	CrossingYearParams,
	OpenOceanYearParams,
	RoutesParams,
	VoyageKnot,
	VoyageRoutes,
} from "@/model/society/farming/livestock-voyages/types"
import type { SeaLink } from "@/model/society/migration/sea-links/types"

// Livestock sea crossings by target tech level (the world's leading level),
// log-interpolated in distance between knots. Each level is the leader level
// the Earth calibration pairing (docs/terrestrial/population/tech-levels.md)
// gives the year of a documented crossing:
// - 80 km, level 0.69: sheep, goats, cattle and pigs reach Cyprus from the
//   Levant by about 8500 BCE (Vigne et al. 2012, PNAS 109:8445; Zeder 2008,
//   PNAS 105:11597), a 70-80 km gap and the first sea-borne livestock transfer.
// - 400 km, level 3.22: zebu cattle reach Madagascar across the Mozambique
//   Channel by about 1000 CE (Blench 2007, Azania 42:69; Boivin et al. 2013,
//   J. World Prehistory 26:213).
// - 1,000 km (OPEN_OCEAN_KM), level 4.09: cattle, horses, pigs and sheep cross
//   the Atlantic from 1493, Columbus's second voyage (Crosby 1972, The
//   Columbian Exchange).
// Coastal and island-hopping gaps grow gradually with distance. Past
// OPEN_OCEAN_KM the curve is flat: an open-ocean crossing arrived as one
// capability step (ships that carry stock, rigging for the open sea,
// navigation out and a way back), not a little later for each extra
// kilometre, so every longer gap opens at the same level. The 400 to 1,000 km
// stretch interpolates up to that step; extending the 80 to 400 km rate would
// reach level 4.66 at 1,000 km, later than the step itself, so a longer gap
// would open before a shorter one.
const OPEN_OCEAN_KM = 1000
const KNOTS: VoyageKnot[] = [
	{ km: 80, level: 0.69 },
	{ km: 400, level: 3.22 },
	{ km: OPEN_OCEAN_KM, level: 4.09 },
]

const levels = KNOTS.map((knot) => knot.level)

// Longest direct route: the longest crossing the Atlantic evidence covers.
// Beyond it (the Pacific) livestock travelled only after the 1560s galleon
// lines, which the single open-ocean level does not model.
const MAX_ROUTE_KM = 5000
const COAST = 2

function crossingYear({ distanceKm, knotYears }: CrossingYearParams): number {
	return MATH.piecewise({
		domain: KNOTS.map((knot) => Math.log(knot.km)),
		range: knotYears,
		x: Math.log(Math.max(1, distanceKm)),
	})
}

// Direct ocean routes: from every coastal province, one route to the nearest
// coastal province of every other landmass within range. Shipped livestock
// sailed straight to a far shore rather than hopping between adjacent shores
// (the 1493 stock went from Spain to Hispaniola), which the adjacent sea
// links cannot express. The line is not checked to stay over ocean: the
// nearest coast of each landmass is the shortest line to it, and a landmass
// in the way is a nearer landmass that the herds cross to first.
function routes({
	provinces,
	r_xyz,
	planetRadiusKm,
	traversable,
}: RoutesParams): VoyageRoutes {
	const coastal: number[] = []
	for (let p = 0; p < provinces.count; p++)
		if (traversable[p] && provinces.waterAccess[p] === COAST) coastal.push(p)
	const landmasses = Math.max(0, ...provinces.landmassId) + 1
	const nearest = new Int32Array(landmasses)
	const nearestKm = new Float64Array(landmasses)
	const links: VoyageRoutes = Array.from(
		{ length: provinces.count },
		(): SeaLink[] => [],
	)
	for (const a of coastal) {
		nearest.fill(-1)
		nearestKm.fill(Infinity)
		const own = provinces.landmassId[a]
		for (const b of coastal) {
			const landmass = provinces.landmassId[b]
			if (landmass === own) continue
			const km = UNITS.regionDistanceKm({
				r_xyz,
				fromRegion: provinces.seeds[a],
				toRegion: provinces.seeds[b],
				planetRadiusKm,
			})
			if (km < nearestKm[landmass]) {
				nearestKm[landmass] = km
				nearest[landmass] = b
			}
		}
		for (let landmass = 0; landmass < landmasses; landmass++)
			if (nearest[landmass] >= 0 && nearestKm[landmass] <= MAX_ROUTE_KM)
				links[a].push({
					a,
					b: nearest[landmass],
					distanceKm: Math.max(1, nearestKm[landmass]),
				})
	}
	return links
}

function openOceanYear({ knotYears }: OpenOceanYearParams): number {
	return crossingYear({ distanceKm: OPEN_OCEAN_KM, knotYears })
}

export const LIVESTOCK_VOYAGES = {
	levels,
	crossingYear,
	openOceanYear,
	routes,
}

import { FARMING_HEARTHS } from "@/model/society/farming/hearths"
import { LIVESTOCK_VOYAGES } from "@/model/society/farming/livestock-voyages"
import { FARMING_LIVING } from "@/model/society/farming/living"
import { FARMING_MEASURES } from "@/model/society/farming/measures"
import { FARMING_ODDS } from "@/model/society/farming/odds"
import { FARMING_SPREAD } from "@/model/society/farming/spread"
import type {
	FarmingParams,
	FarmingResult,
	Herding,
	HerdSearchParams,
	PastoralAdoptionParams,
} from "@/model/society/farming/types"
import { MIGRATION } from "@/model/society/migration"
import { TECH_START } from "@/model/society/tech-level/start-year"

const HERD_ONLY_SHARE = 1

function compute({
	provinces,
	migration,
	mesh,
	planetRadiusKm,
	horizonYear,
	...climate
}: FarmingParams): FarmingResult {
	const { result, landGraph } = migration
	const traversable = Uint8Array.from(provinces.desolate, (desolate, p) =>
		!desolate && result.arrivalYear[p] !== MIGRATION.sentinel ? 1 : 0,
	)
	const measures = FARMING_MEASURES.compute({
		provinces,
		landGraph,
		mesh,
		planetRadiusKm,
		...climate,
	})
	const capacities = FARMING_LIVING.capacities({
		measures,
		suitability: result.suitability,
	})
	const cropFit = FARMING_LIVING.cropFit({ measures })
	const herdShare = FARMING_LIVING.herdShare({ measures, cropFit })
	const postMode = Uint8Array.from({ length: provinces.count }, (_, p) =>
		FARMING_LIVING.postMode({
			forage: capacities.forage[p],
			farm: capacities.farm[p],
			herd: capacities.herd[p],
			farmShare: cropFit[p],
			herdShare: herdShare[p],
		}),
	)
	const { odds, timing, dependence } = FARMING_ODDS.compute({
		measures,
		provinces,
		landGraph,
		mesh,
		planetRadiusKm,
		traversable,
	})
	const schedule = FARMING_HEARTHS.schedule({
		provinces,
		landGraph,
		r_xyz: mesh.r_xyz,
		planetRadiusKm,
		odds,
		timing,
		dependence,
		traversable,
		suitability: result.suitability,
		areaKm2: measures.areaKm2,
		continuousArrival: result.continuousArrival,
	})
	const spread = FARMING_SPREAD.search({
		provinces,
		migration,
		measures,
		r_xyz: mesh.r_xyz,
		planetRadiusKm,
		hearths: schedule.hearths,
		postMode,
		traversable,
		horizonYear,
		voyageYear: null,
		colonial: null,
	})
	const hearthTiming = new Map(
		schedule.hearths.map((hearth) => [hearth.province, hearth.dependence]),
	)
	const faunaLandmass = provinces.landmassId[result.origin]
	for (let p = 0; p < provinces.count; p++) {
		const hearth = spread.hearthOf[p]
		const fauna =
			hearth >= 0 &&
			faunaLandmass >= 0 &&
			provinces.landmassId[hearth] === faunaLandmass
		if (fauna) continue
		postMode[p] = FARMING_LIVING.postMode({
			forage: capacities.forage[p],
			farm: capacities.farm[p],
			herd: capacities.herd[p],
			farmShare: cropFit[p],
			herdShare: 0,
		})
	}
	const farmAdoptionYear = Int32Array.from(
		spread.farmingYear,
		(farmingYear, p) =>
			FARMING_LIVING.adoptionYear({
				farmingYear,
				forage: capacities.forage[p],
				capacity: Math.max(capacities.farm[p], capacities.herd[p]),
				hearthTiming: hearthTiming.get(spread.hearthOf[p]) ?? 1,
				horizonYear,
			}),
	)
	const dependentAdoptionYear = Int32Array.from(farmAdoptionYear)
	const farmFit = Float32Array.from(cropFit)
	// Herds came with the crops wherever farming spread from a hearth on the
	// origin landmass; elsewhere herds arrive only by voyage.
	const herdsWithCrops = Uint8Array.from({ length: provinces.count }, (_, p) =>
		provinces.landmassId[p] === faunaLandmass ||
		(spread.hearthOf[p] >= 0 &&
			provinces.landmassId[spread.hearthOf[p]] === faunaLandmass)
			? 1
			: 0,
	)
	const herdCode = FARMING_LIVING.codeOf({ mode: "herd" })
	const originHearths = schedule.hearths.filter(
		(hearth, i) =>
			spread.fired[i] &&
			provinces.landmassId[hearth.province] === faunaLandmass,
	)
	const pastoralYear = FARMING_LIVING.pastoralYear({
		startYears: originHearths.map((hearth) => hearth.startYear),
		horizonYear,
	})
	const herdSearch = ({
		open,
		voyageYear,
		links,
		colonial,
	}: HerdSearchParams) =>
		FARMING_SPREAD.search({
			provinces,
			migration: { ...migration, seaLinks: links },
			measures,
			r_xyz: mesh.r_xyz,
			planetRadiusKm,
			hearths: originHearths,
			postMode: new Uint8Array(provinces.count).fill(herdCode),
			traversable: open,
			horizonYear,
			voyageYear,
			colonial,
		})
	const herdAdoption = ({ province, year }: PastoralAdoptionParams) => {
		const pastoral =
			FARMING_LIVING.postMode({
				forage: capacities.forage[province],
				farm: 0,
				herd: capacities.herd[province],
				farmShare: 0,
				herdShare: HERD_ONLY_SHARE,
			}) === herdCode
				? FARMING_LIVING.adoptionYear({
						farmingYear:
							year === MIGRATION.sentinel ? year : Math.max(year, pastoralYear),
						forage: capacities.forage[province],
						capacity: capacities.herd[province],
						hearthTiming: 1,
						horizonYear,
					})
				: MIGRATION.sentinel
		if (herdsWithCrops[province])
			return Math.min(pastoral, farmAdoptionYear[province])
		const mixed =
			farmFit[province] > 0
				? FARMING_LIVING.mixedHerdAdoption({
						arrivalYear: year,
						farmingAdoptionYear: farmAdoptionYear[province],
						horizonYear,
					})
				: MIGRATION.sentinel
		return mixed === MIGRATION.sentinel ? pastoral : mixed
	}
	const herdingFrom = (herdYear: Int32Array): Herding => {
		const herdAdoptionYear = Int32Array.from(herdYear, (year, p) =>
			herdAdoption({ province: p, year }),
		)
		const herdFit = Float32Array.from({ length: provinces.count }, (_, p) =>
			provinces.landmassId[p] === faunaLandmass ||
			herdYear[p] !== MIGRATION.sentinel
				? herdShare[p]
				: 0,
		)
		const adoption = Int32Array.from(farmAdoptionYear)
		for (let p = 0; p < provinces.count; p++)
			if (farmFit[p] <= 0 && herdFit[p] <= 0) adoption[p] = MIGRATION.sentinel
		return {
			herdAdoptionYear,
			herdFit,
			adoption,
			herdColonial: Uint8Array.from(
				herdsWithCrops,
				(withCrops) => 1 - withCrops,
			),
		}
	}
	const farmingOnly = herdingFrom(
		herdSearch({
			open: Uint8Array.from(traversable, (open, p) =>
				open && provinces.landmassId[p] === faunaLandmass ? 1 : 0,
			),
			voyageYear: null,
			links: migration.seaLinks,
			colonial: null,
		}).farmingYear,
	)
	const clock = {
		farming: {
			settledYear: Int32Array.from(result.arrivalYear),
			adoptionYear: farmingOnly.adoption,
			herdAdoptionYear: farmingOnly.herdAdoptionYear,
			forageDensity: capacities.forage,
			farmCapacity: capacities.farm,
			herdCapacity: capacities.herd,
			farmFit,
			herdFit: farmingOnly.herdFit,
			herdColonial: farmingOnly.herdColonial,
			farmModern: new Uint8Array(provinces.count),
		},
		areaKm2: result.areaKm2,
		graph: provinces,
		horizonYear,
	}
	const knotYears = LIVESTOCK_VOYAGES.levels.map((target) =>
		TECH_START.targetYear({ ...clock, target }),
	)
	const oceanYear = LIVESTOCK_VOYAGES.openOceanYear({ knotYears })
	for (let p = 0; p < provinces.count; p++)
		farmAdoptionYear[p] = Math.min(
			dependentAdoptionYear[p],
			FARMING_LIVING.exchangeAdoptionYear({
				farmingYear: spread.farmingYear[p],
				oceanYear,
				forage: capacities.forage[p],
				capacity: Math.max(capacities.farm[p], capacities.herd[p]),
				horizonYear,
			}),
		)
	const routes = LIVESTOCK_VOYAGES.routes({
		provinces,
		r_xyz: mesh.r_xyz,
		planetRadiusKm,
		traversable,
	})
	const herdSpread = herdSearch({
		open: traversable,
		colonial: Uint8Array.from(herdsWithCrops, (withCrops) => 1 - withCrops),
		links: migration.seaLinks.map((links, p) => [...links, ...routes[p]]),
		// Only a province that adopts herding can send herds across the sea,
		// and only once it has adopted.
		voyageYear: ({ distanceKm, source, sourceArrival }) => {
			const adopted = herdAdoption({
				province: source,
				year: sourceArrival,
			})
			return adopted === MIGRATION.sentinel
				? Number.POSITIVE_INFINITY
				: Math.max(
						sourceArrival,
						adopted,
						LIVESTOCK_VOYAGES.crossingYear({ distanceKm, knotYears }),
					)
		},
	})
	const herding = herdingFrom(herdSpread.farmingYear)
	for (let p = 0; p < provinces.count; p++)
		if (!herdsWithCrops[p] && herdSpread.farmingYear[p] !== MIGRATION.sentinel)
			postMode[p] = FARMING_LIVING.postMode({
				forage: capacities.forage[p],
				farm: capacities.farm[p],
				herd: capacities.herd[p],
				farmShare: cropFit[p],
				herdShare: herdShare[p],
			})
	return {
		farmingYear: spread.farmingYear,
		adoptionYear: herding.adoption,
		herdYear: herdSpread.farmingYear,
		herdAdoptionYear: herding.herdAdoptionYear,
		hearthOf: spread.hearthOf,
		farmingFrom: spread.farmingFrom,
		settledYear: Int32Array.from(result.arrivalYear),
		postMode,
		forageDensity: capacities.forage,
		farmCapacity: capacities.farm,
		herdCapacity: capacities.herd,
		farmFit,
		herdFit: herding.herdFit,
		herdColonial: herding.herdColonial,
		startClock: clock.farming,
		farmModern: Uint8Array.from(herding.adoption, (year) =>
			year !== MIGRATION.sentinel && year >= oceanYear ? 1 : 0,
		),
		hearths: schedule.hearths.map((hearth, i) => ({
			...hearth,
			fired: spread.fired[i],
		})),
		summary: {
			farmableKm2: schedule.farmableKm2,
			landEdgeSpeed: spread.landEdgeSpeed,
			pastoralYear,
			livestockKnotYears: knotYears,
		},
	}
}

export const FARMING = { compute }

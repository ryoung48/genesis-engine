import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"
import { CULTURE } from "@/model/history/sim/culture"
import type {
	DerivedSociety,
	DeriveSocietyParams,
} from "@/model/history/sim/derive/types"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import { HERITAGE } from "@/model/history/sim/heritage"
import { NATIONS } from "@/model/history/sim/nations"
import { RELIGION } from "@/model/history/sim/religion"
import { RELIGION_DOCTRINE } from "@/model/history/sim/religion/doctrine"
import { ERAS } from "@/model/society/eras"

// The political layer of a procedurally generated history's initial conditions:
// nation / culture / heritage / religion partitions over the province graph.
// Runs inside the genesis build pipeline (see derive-province-society) so the
// assignments ship with the generated world; the genesis worker then wraps them
// in a procedural HistoryRecord / HistoryState (see sim/record).
function deriveSociety(params: DeriveSocietyParams): DerivedSociety {
	const { timings } = params
	const record = <T>(stage: string, fn: () => T): T => {
		const t0 = performance.now()
		const result = fn()
		timings.push({ Stage: stage, ms: (performance.now() - t0).toFixed(1) })
		return result
	}

	let cultures: DerivedSociety["cultures"]
	let heritages: DerivedSociety["heritages"]
	let religions: DerivedSociety["religions"]
	let religionFamilies: DerivedSociety["religionFamilies"]
	let religionDoctrine: DerivedSociety["religionDoctrine"]
	let religionTypes: DerivedSociety["religionTypes"]
	let nations: DerivedSociety["nations"]

	const eraConfig = ERAS.getEraConfig(params.era)
	const eraSettledMask = params.eraSettledMask
	const eraStatehoodMask = params.eraStatehoodMask

	if (params.provinces) {
		const provinceCount = params.provinces.count
		const { desolate } = params.provinces

		if (params.population) {
			const provinceContinent = new Uint8Array(provinceCount)
			for (
				let region = 0;
				region < params.provinces.regionProvince.length;
				region++
			) {
				const province = params.provinces.regionProvince[region]
				if (province < 0) continue
				const landmark = params.landmarks.regionLandmark[region]
				if (landmark >= 0 && params.landmarks.type[landmark] === 0) {
					provinceContinent[province] = 1
				}
			}

			// Earth-imported worlds (raster-based provinces, identifiable by
			// realIds -- see computeProvincesFromRaster) get their political
			// layer from the earth-history engine (src/model/history/record/),
			// not the procedural flood-fill nation/government generator.
			const isEarthImportRaster = !!params.provinces.realIds
			if (params.historyPipeline === "distribution" && !isEarthImportRaster) {
				nations = record(
					"distribution placement",
					() =>
						DISTRIBUTION_TERRITORY.place({
							provinces: params.provinces!,
							habitability: params.population!.habitability,
							waterAccess: params.waterAccess,
							provinceContinent,
							migrationWave: params.population!.migrationWave,
							r_xyz: params.r_xyz,
							seed: params.seed,
						}).nations,
				)
			} else if (eraConfig.hasNations && !isEarthImportRaster) {
				const provinces = params.provinces
				const population = params.population
				nations = record("nations", () =>
					NATIONS.computeNations({
						provinces,
						coastal: params.coastal,
						riverVisible: params.riverVisible,
						waterAccess: params.waterAccess,
						provinceContinent,
						habitability: population.habitability,
						r_xyz: params.r_xyz,
						seed: params.seed,
						planetRadiusKm: params.planetRadiusKm,
						eraActiveMask: eraStatehoodMask,
						nationPercentages: eraConfig.nationPercentages,
						nationBuckets: eraConfig.nationBuckets,
						governmentMix: eraConfig.governmentMix,
						governmentSizeWeight: eraConfig.governmentSizeWeight,
						maxRepublicSize: eraConfig.maxRepublicSize,
						maxTheocracySize: eraConfig.maxTheocracySize,
						migrationWave: population.migrationWave,
						statehoodFraction: eraConfig.statehoodFraction,
						buildImperialPatchwork: eraConfig.organizations?.imperialPatchwork,
						buildTradeLeague: eraConfig.organizations?.tradeLeague,
					}),
				)
			}
		}

		record("cultures", () => {
			const settledMask =
				eraSettledMask ??
				(() => {
					const m = new Uint8Array(provinceCount)
					for (let p = 0; p < provinceCount; p++) {
						if (!desolate[p]) m[p] = 1
					}
					return m
				})()
			cultures = CULTURE.computeCultures({
				provinces: params.provinces!,
				seed: params.seed,
				settledMask,
			})
			heritages = HERITAGE.computeHeritages({
				cultures: cultures!,
				seed: params.seed,
			})
			religions = RELIGION.computeReligions({
				cultures: cultures!,
				seed: params.seed,
			})
			const families = RELIGION.computeReligionFamilies({
				religions: religions!,
				seed: params.seed,
			})
			religionFamilies = families.assignment
			religionTypes = RELIGION.assignReligionTypes({
				religionCount: religions!.count,
				religionFamilies,
				religionFamilyCount: families.count,
				cultureToReligion: religions!.assignment,
				cultureCount: cultures!.count,
				provinceCount,
				cultureAssignment: cultures!.assignment,
				migrationWave: params.population?.migrationWave,
				era: eraConfig.id,
				seed: params.seed,
			})
			if (!params.isEarthImport)
				religionDoctrine = RELIGION_DOCTRINE.assign({
					religionTypes,
					religionFamilies,
					familyCount: families.count,
					seed: params.seed,
				})
			cultures!.genderSystems = GENDER_SYSTEM.restrict({
				systems: cultures!.genderSystems!,
				cultureToReligion: religions!.assignment,
				doctrine: religionDoctrine,
				seed: params.seed,
			})
			religions!.colors = GRAPH_PARTITION.deriveChildColors({
				childCount: religions!.count,
				childToParent: religionFamilies,
				parentColors: families.colors,
				seed: params.seed + 6281,
			})
			cultures!.colors = GRAPH_PARTITION.deriveChildColors({
				childCount: cultures!.count,
				childToParent: heritages!.assignment,
				parentColors: heritages!.colors,
				seed: params.seed + 5101,
			})
			// Organization naming needs the emperor's culture, which isn't known
			// until cultures are computed -- patch it in now rather than
			// reordering the pipeline.
			if (nations?.organizations?.length) {
				for (const org of nations.organizations) {
					const capital = nations.seeds[org.leadNationIndex]
					org.cultureIdx =
						capital !== undefined ? cultures!.assignment[capital] : -1
				}
			}
		})
	}

	return {
		nations,
		cultures,
		heritages,
		religions,
		religionFamilies,
		religionTypes,
		religionDoctrine,
	}
}

export const SIM_DERIVE = {
	deriveSociety,
}

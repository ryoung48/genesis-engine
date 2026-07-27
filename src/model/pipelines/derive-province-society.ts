import type { GenesisParams, SphereMesh, StageTiming } from "@/model"
import { computeSettlementAnchors } from "@/model/settlements"
import { assignLandmarkIdentity, type GenesisLandmarks } from "@/model/terrain"
import { runPostElevationPipeline } from "@/model/pipelines/post-elevation"
import { CULTURE } from "@/model/society/culture"
import { ERAS } from "@/model/society/eras"
import { HERITAGE } from "@/model/society/heritage"
import { NATIONS } from "@/model/society/nations"
import { RELIGION } from "@/model/society/religion"
import { SHARED } from "@/model/society/shared"

interface DeriveProvinceSocietyInput {
	mesh: SphereMesh
	params: Pick<GenesisParams, "seed" | "planetRadiusKm" | "era">
	post: Pick<
		ReturnType<typeof runPostElevationPipeline>,
		| "coastal"
		| "eraSettledMask"
		| "eraStatehoodMask"
		| "landmarks"
		| "population"
		| "provinces"
		| "rivers"
		| "topography"
		| "waterAccess"
	>
	isLand: Uint8Array
}

interface DerivedProvinceSociety {
	nations: ReturnType<typeof NATIONS.computeNations> | undefined
	cultures: ReturnType<typeof CULTURE.computeCultures> | undefined
	heritages: ReturnType<typeof HERITAGE.computeHeritages> | undefined
	religions: ReturnType<typeof RELIGION.computeReligions> | undefined
	religionTypes: Uint8Array | undefined
	landmarks: GenesisLandmarks
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
	timings: StageTiming[]
}

export function deriveProvinceSociety({
	mesh,
	params,
	post,
	isLand,
}: DeriveProvinceSocietyInput): DerivedProvinceSociety {
	const timings: StageTiming[] = []
	const record = <T>(stage: string, fn: () => T): T => {
		const t0 = performance.now()
		const result = fn()
		timings.push({ Stage: stage, ms: (performance.now() - t0).toFixed(1) })
		return result
	}

	let cultures: ReturnType<typeof CULTURE.computeCultures> | undefined
	let heritages: ReturnType<typeof HERITAGE.computeHeritages> | undefined
	let religions: ReturnType<typeof RELIGION.computeReligions> | undefined
	let religionTypes: Uint8Array | undefined
	let nations: ReturnType<typeof NATIONS.computeNations> | undefined

	const eraConfig = ERAS.getEraConfig(params.era)

	// Pre-computed masks arrive from post-elevation where migration.migrationWave
	// is guaranteed. undefined means "all non-desolate provinces qualify".
	const eraSettledMask = post.eraSettledMask
	const eraStatehoodMask = post.eraStatehoodMask

	if (post.provinces) {
		const provinceCount = post.provinces.count
		const { desolate } = post.provinces

		if (post.population) {
			const provinceContinent = new Uint8Array(provinceCount)
			for (
				let region = 0;
				region < post.provinces.regionProvince.length;
				region++
			) {
				const province = post.provinces.regionProvince[region]
				if (province < 0) continue
				const landmark = post.landmarks.regionLandmark[region]
				if (landmark >= 0 && post.landmarks.type[landmark] === 0) {
					provinceContinent[province] = 1
				}
			}

			// Earth-imported worlds (raster-based provinces, identifiable by
			// realIds -- see computeProvincesFromRaster) get their political
			// layer from the earth-history engine (src/model/earth/history/),
			// not the procedural flood-fill nation/government generator. Running
			// it anyway wasted a full generation pass and, worse, its output
			// silently leaked into hover/map fallbacks for provinces the real
			// history data doesn't cover (see InfoPanel.tsx's earth-history
			// override handling). Skipping it here removes the stale data at
			// the source instead of only masking it in the UI.
			const isEarthImportRaster = !!post.provinces.realIds
			if (eraConfig.hasNations && !isEarthImportRaster) {
				nations = record("nations", () =>
					NATIONS.computeNations({
						provinces: post.provinces,
						coastal: post.coastal,
						riverVisible: post.rivers.visible,
						waterAccess: post.waterAccess,
						provinceContinent,
						habitability: post.population.habitability,
						r_xyz: mesh.r_xyz,
						seed: params.seed,
						planetRadiusKm: params.planetRadiusKm,
						eraActiveMask: eraStatehoodMask,
						nationPercentages: eraConfig.nationPercentages,
						nationBuckets: eraConfig.nationBuckets,
						governmentMix: eraConfig.governmentMix,
						governmentSizeWeight: eraConfig.governmentSizeWeight,
						migrationWave: post.population.migrationWave,
						statehoodFraction: eraConfig.statehoodFraction,
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
				provinces: post.provinces!,
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
			religionTypes = RELIGION.assignReligionTypes({
				religionCount: religions!.count,
				cultureToReligion: religions!.assignment,
				cultureCount: cultures!.count,
				provinceCount,
				cultureAssignment: cultures!.assignment,
				governmentType: nations?.governmentType,
				migrationWave: post.population?.migrationWave,
				sizeWeight: eraConfig.governmentSizeWeight ?? 0.55,
				seed: params.seed,
			})
			religions!.colors = RELIGION.buildReligionColors({
				religionCount: religions!.count,
				religionTypes,
			})
			cultures!.colors = SHARED.deriveChildColors({
				childCount: cultures!.count,
				childToParent: heritages!.assignment,
				parentColors: heritages!.colors,
				seed: params.seed + 5101,
			})
		})
	}

	const landmarks = record("landmark identity", () =>
		assignLandmarkIdentity({
			mesh,
			landmarks: post.landmarks,
			provinces: post.provinces,
			cultures,
			isLand,
			seed: params.seed,
		}),
	)
	const settlementAnchors = record("settlement anchors", () =>
		computeSettlementAnchors(
			{
				mesh,
				provinces: post.provinces,
				topography: post.topography,
				coastal: post.coastal,
				rivers: post.rivers ? { visible: post.rivers.visible } : undefined,
				isLand,
				landmarks,
			},
			eraStatehoodMask,
		),
	)

	return {
		nations,
		cultures,
		heritages,
		religions,
		religionTypes,
		landmarks,
		settlementRegions: settlementAnchors.settlementRegions,
		settlementWaterLandmarks: settlementAnchors.settlementWaterLandmarks,
		settlementPortRegions: settlementAnchors.settlementPortRegions,
		timings,
	}
}

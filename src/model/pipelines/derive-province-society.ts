import type { OrogenParams, SphereMesh, StageTiming } from ".."
import { computeSettlementAnchors } from "../settlements/compute-settlement-regions"
import { computeCultures } from "../society/culture"
import { computeFaiths } from "../society/faith"
import { computeHeritages } from "../society/heritage"
import { computeNations } from "../society/nations"
import { computeReligions } from "../society/religion"
import { deriveChildColors } from "../society/shared"
import {
	assignLandmarkIdentity,
	type OrogenLandmarks,
} from "../terrain/landmarks"
import { runPostElevationPipeline } from "./post-elevation"

interface DeriveProvinceSocietyInput {
	mesh: SphereMesh
	params: Pick<OrogenParams, "seed" | "planetRadiusKm">
	post: Pick<
		ReturnType<typeof runPostElevationPipeline>,
		| "coastal"
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
	nations: ReturnType<typeof computeNations> | undefined
	cultures: ReturnType<typeof computeCultures> | undefined
	heritages: ReturnType<typeof computeHeritages> | undefined
	faiths: ReturnType<typeof computeFaiths> | undefined
	religions: ReturnType<typeof computeReligions> | undefined
	landmarks: OrogenLandmarks
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

	let cultures: ReturnType<typeof computeCultures> | undefined
	let heritages: ReturnType<typeof computeHeritages> | undefined
	let faiths: ReturnType<typeof computeFaiths> | undefined
	let religions: ReturnType<typeof computeReligions> | undefined
	let nations: ReturnType<typeof computeNations> | undefined

	if (post.provinces) {
		if (post.population) {
			const provinceContinent = new Uint8Array(post.provinces.count)
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
			nations = record("nations", () =>
				computeNations({
					provinces: post.provinces,
					coastal: post.coastal,
					riverVisible: post.rivers.visible,
					waterAccess: post.waterAccess,
					provinceContinent,
					habitability: post.population.habitability,
					r_xyz: mesh.r_xyz,
					seed: params.seed,
					planetRadiusKm: params.planetRadiusKm,
				}),
			)
		}
		record("cultures", () => {
			cultures = computeCultures(post.provinces!, params.seed)
			heritages = computeHeritages(cultures!, params.seed)
			faiths = computeFaiths(cultures!, params.seed)
			religions = computeReligions(faiths!, params.seed)
			cultures!.colors = deriveChildColors({
				childCount: cultures!.count,
				childToParent: heritages!.assignment,
				parentColors: heritages!.colors,
				seed: params.seed + 5101,
			})
			faiths!.colors = deriveChildColors({
				childCount: faiths!.count,
				childToParent: religions!.assignment,
				parentColors: religions!.colors,
				seed: params.seed + 5102,
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
		computeSettlementAnchors({
			mesh,
			provinces: post.provinces,
			topography: post.topography,
			coastal: post.coastal,
			rivers: post.rivers ? { visible: post.rivers.visible } : undefined,
			isLand,
			landmarks,
		}),
	)

	return {
		nations,
		cultures,
		heritages,
		faiths,
		religions,
		landmarks,
		settlementRegions: settlementAnchors.settlementRegions,
		settlementWaterLandmarks: settlementAnchors.settlementWaterLandmarks,
		settlementPortRegions: settlementAnchors.settlementPortRegions,
		timings,
	}
}

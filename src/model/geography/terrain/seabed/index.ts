import { SEABED_HABITAT } from "@/model/geography/terrain/seabed/habitat"
import type {
	SeabedComputeParams,
	SeabedResult,
	SeabedStats,
	SeabedStatsParams,
} from "@/model/geography/terrain/seabed/types"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"

function tally<K extends string>({
	kinds,
	codes,
	openWater,
}: {
	kinds: readonly K[]
	codes: Uint8Array
	openWater: Uint8Array
}): Record<K, number> {
	const out = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<
		K,
		number
	>
	for (let r = 0; r < codes.length; r++)
		if (openWater[r]) out[kinds[codes[r]]]++
	return out
}

function statistics({
	layers,
	openWater,
	stageMs,
}: SeabedStatsParams): SeabedStats {
	let oceanCells = 0
	let reachedCells = 0
	for (let r = 0; r < openWater.length; r++) {
		if (!openWater[r]) continue
		oceanCells++
		if (layers.substrate[r] > 0) reachedCells++
	}
	return {
		oceanCells,
		reachedCells,
		habitat: tally({
			kinds: SEABED_HABITAT.habitats,
			codes: layers.habitat,
			openWater,
		}),
		substrate: tally({
			kinds: SHORE_MATERIAL.kinds,
			codes: layers.substrate,
			openWater,
		}),

		stageMs,
	}
}

function compute({
	mesh,
	isLand,
	openWater,
	elevationKm,
	planetRadiusKm,
	flow,
	shore,
	climate,
	iceMinMonthly,
	iceMaxMonthly,
}: SeabedComputeParams): SeabedResult {
	const startedAt = performance.now()
	const source = SEABED_HABITAT.reach({
		mesh,
		isLand,
		openWater,
		planetRadiusKm,
	})
	const share = SEABED_HABITAT.share({ source, elevationKm, flow })
	const substrate = SEABED_HABITAT.substrateOf({
		source,
		shoreMaterial: shore.material,
	})
	const habitat = SEABED_HABITAT.classify({
		numRegions: mesh.numRegions,
		source,
		share,
		substrate,
		exposureLeeM: shore.exposureLeeM,
		temperatureMonthly: climate.temperature_monthly,
		iceMinMonthly,
		iceMaxMonthly,
	})
	const layers = { substrate, habitat, share }
	return {
		layers,

		stats: statistics({
			layers,
			openWater,

			stageMs: performance.now() - startedAt,
		}),
	}
}

export const SEABED = { compute }

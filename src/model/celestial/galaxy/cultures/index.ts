import type {
	BuildGalaxyCulturesParams,
	GalaxyCultures,
} from "@/model/celestial/galaxy/cultures/types"
import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import { computePartitionBorderBlend } from "@/model/history/sim/partition-blend"

// Same ratios as the province sim's culture/heritage passes (history/sim/
// culture/index.ts, heritage/index.ts): ~1 culture per 17 settled nodes,
// ~1 heritage per 4 cultures. Seeds are offset by the same +410x constants
// so a galaxy's culture layout is stable and independent of its nations.
const SYSTEMS_PER_CULTURE = 17
const CULTURES_PER_HERITAGE = 4

/**
 * Partitions every non-edge system of a generated galaxy into cultures, and
 * groups those cultures into heritage families -- the galaxy-scale mirror of
 * history/sim's province culture + heritage pipeline, run over the same
 * hyperlane graph GALAXY_NATIONS spreads along. Each culture's color is a
 * hue-shifted child of its heritage's color (as derive/index.ts does for
 * provinces); the heritage layer itself is internal and not returned. A
 * one-shot border-bleed pass marks a deterministic subset of cross-culture
 * systems with a secondary culture + weight for the map's blend stripes.
 */
function build({
	numSystems,
	r_edge,
	adjOffset,
	adjList,
	seed,
}: BuildGalaxyCulturesParams): GalaxyCultures {
	const active = new Uint8Array(numSystems)
	let activeCount = 0
	for (let s = 0; s < numSystems; s++) {
		if (r_edge[s]) continue
		active[s] = 1
		activeCount++
	}
	if (activeCount === 0) {
		return {
			assignment: new Int32Array(numSystems).fill(-1),
			seeds: new Int32Array(0),
			size: new Int32Array(0),
			colors: new Float32Array(0),
			count: 0,
			blendSecondary: new Int32Array(numSystems).fill(-1),
			blendWeight: new Float32Array(numSystems),
		}
	}

	const cultures = GRAPH_PARTITION.computeGraphPartition({
		nodeCount: numSystems,
		adjOffset,
		adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / SYSTEMS_PER_CULTURE)),
		seed: seed + 4101,
	})

	const cultureActive = new Uint8Array(cultures.count)
	let activeCultureCount = 0
	for (let c = 0; c < cultures.count; c++) {
		if (cultures.size[c]! > 0) {
			cultureActive[c] = 1
			activeCultureCount++
		}
	}
	const heritages = GRAPH_PARTITION.computeGraphPartition({
		nodeCount: cultures.count,
		adjOffset: cultures.adjOffset,
		adjList: cultures.adjList,
		active: cultureActive,
		targetCount: Math.max(
			1,
			Math.floor(activeCultureCount / CULTURES_PER_HERITAGE),
		),
		seed: seed + 4102,
	})

	const colors = GRAPH_PARTITION.deriveChildColors({
		childCount: cultures.count,
		childToParent: heritages.assignment,
		parentColors: heritages.colors,
		seed: seed + 5101,
	})

	const { blendSecondary, blendWeight } = computePartitionBorderBlend({
		nodeCount: numSystems,
		adjOffset,
		adjList,
		assignment: cultures.assignment,
		partitionSize: cultures.size,
		seed: seed + 4103,
	})

	return {
		assignment: cultures.assignment,
		seeds: cultures.seeds,
		size: cultures.size,
		colors,
		count: cultures.count,
		blendSecondary,
		blendWeight,
	}
}

export const GALAXY_CULTURES = { build }

export {
	generateCoarsePlates,
	projectCoarsePlates,
} from "./coarse-plates"
export { classifyBoundaries } from "./collision"
export {
	computeMantleField,
	normalizeMantleField,
	projectMantleFieldToRegions,
} from "./mantle"
export { smoothAndReconnectPlates } from "./plates"
export { buildSuperPlates } from "./super-plates"
export {
	buildDummyBoundary,
	buildSyntheticPlates,
	computeSimpleDistanceFields,
	deriveSyntheticPlates,
} from "./synthetic-plates"
export {
	GENESIS_TERRAIN_FEATURE,
	GENESIS_TERRAIN_FEATURE_LABELS,
} from "./terrain-features"

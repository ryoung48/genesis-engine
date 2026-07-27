const genesisTerrainFeatureLabels = [
	"none",
	"rift valley",
	"pull-apart basin",
	"back-arc basin",
	"fold ridges",
	"plateau uplift",
	"continental interior",
	"mid-ocean ridge",
	"fracture zone",
	"trench",
	"coastal roughening",
	"island arc",
	"volcanic arc",
	"large igneous province",
] as const

const genesisTerrainFeature = {
	RIFT_VALLEY: 1,
	PULL_APART_BASIN: 2,
	BACK_ARC_BASIN: 3,
	FOLD_RIDGES: 4,
	PLATEAU_UPLIFT: 5,
	CONTINENTAL_INTERIOR: 6,
	MID_OCEAN_RIDGE: 7,
	FRACTURE_ZONE: 8,
	TRENCH: 9,
	COASTAL_ROUGHENING: 10,
	ISLAND_ARC: 11,
	VOLCANIC_ARC: 12,
	LARGE_IGNEOUS_PROVINCE: 13,
} as const

export const TERRAIN_FEATURES = {
	genesisTerrainFeatureLabels,
	genesisTerrainFeature,
}

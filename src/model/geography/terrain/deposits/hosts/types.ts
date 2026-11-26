import type { RockKind } from "@/model/geography/terrain/rocks/types"

export type HostTerm =
	| "bared"
	| "epithermal"
	| "orogenicGold"
	| "vms"
	| "skarn"
	| "mvtRock"
	| "sedex"
	| "tin"
	| "magmatic"
	| "nativeCopper"
	| "kimberlite"
	| "greenstone"
	| "bifKeel"
	| "bifBasin"
	| "ironVein"
	| "ioa"
	| "reef"
	| "petroleum"
	| "bitumen"
	| "oilShaleBed"
	| "coal"
	| "ironstone"
	| "pegmatite"
	| "emeraldPegmatite"
	| "emeraldShale"
	| "corundum"
	| "lapis"
	| "basaltGems"
	| "amethyst"
	| "opal"
	| "garnet"
	| "stone"
	| "stoneHere"
	| "marble"
	| "clay"
	| "saltBed"
	| "saltFlats"
	| "bogIron"
	| "ironLaterite"
	| "saltpeter"
	| "alumVolcanic"
	| "alumShale"
	| "mercury"
	| "amber"
	| "young"

export interface RockShares {
	kind: Record<RockKind, number>
	cover: number
	young: number
	base: number
	bared: number
}

export type HostTables = Record<HostTerm, Float32Array>

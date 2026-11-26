export type SystemId =
	| "porphyry"
	| "epithermal"
	| "orogenicGold"
	| "vms"
	| "skarn"
	| "mvt"
	| "sedex"
	| "tin"
	| "iocg"
	| "magmatic"
	| "nativeCopper"
	| "kimberlite"
	| "greenstoneGold"
	| "bif"
	| "reef"
	| "oil"
	| "gas"
	| "bitumen"
	| "ironLaterite"
	| "supergene"
	| "gossan"
	| "placerGold"
	| "placerTin"
	| "placerDiamond"
	| "salt"
	| "ironstone"
	| "bogIron"
	| "coal"
	| "pegmatite"
	| "emerald"
	| "corundum"
	| "lapis"
	| "basaltGems"
	| "amethyst"
	| "opal"
	| "turquoise"
	| "garnet"
	| "gemPlacer"
	| "stone"
	| "stoneMarble"
	| "clay"
	| "ironVein"
	| "ioa"
	| "sand"
	| "alum"
	| "mercury"
	| "saltpeter"
	| "amber"

export type SystemGroup = "metal" | "fuel" | "mineral" | "gem" | "building"

export type Rgb = readonly [number, number, number]

export interface SystemInfo {
	id: SystemId
	name: string
	yields: string
	group: SystemGroup
	rgb: Rgb
	words: string
}

import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import type {
	OasisKind,
	SpringKind,
	WetlandKind,
} from "@/model/geography/terrain/groundwater/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import type { RockKind, YoungKind } from "@/model/geography/terrain/rocks/types"
import type { ShoreLabel } from "@/model/geography/terrain/shore/types"
import { OCEAN_LIGHT_BLUE } from "@/ui/genesis/shared/colors"

export const WETLAND_LEGEND: ReadonlyArray<{
	kind: WetlandKind
	label: string
}> = [
	{ kind: "mangrove", label: "Mangrove" },
	{ kind: "coastalSaltMarsh", label: "Coastal salt marsh" },
	{ kind: "inlandSaltMarsh", label: "Inland salt marsh" },
	{ kind: "floodplain", label: "Floodplain wetland" },
	{ kind: "peatBog", label: "Peat bog" },
	{ kind: "wetMeadow", label: "Wet meadow" },
	{ kind: "marsh", label: "Marsh" },
	{ kind: "swampForest", label: "Swamp forest" },
	{ kind: "forestedPeatland", label: "Forested peatland" },
]

export function basinColor(id: number): [number, number, number] {
	if (id < 0) return OCEAN_LIGHT_BLUE
	let h = (id * 2654435761) >>> 0
	h ^= h >>> 16
	const hue = (h % 360) / 360
	const sat = 0.45 + ((h >>> 9) % 40) / 100
	const light = 0.42 + ((h >>> 17) % 18) / 100
	let r = light
	let g = light
	let b = light
	if (sat > 0) {
		const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
		const p = 2 * light - q
		const hueToRgb = (t: number) => {
			let x = t
			if (x < 0) x += 1
			if (x > 1) x -= 1
			if (x < 1 / 6) return p + (q - p) * 6 * x
			if (x < 1 / 2) return q
			if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
			return p
		}
		r = hueToRgb(hue + 1 / 3)
		g = hueToRgb(hue)
		b = hueToRgb(hue - 1 / 3)
	}
	return [r, g, b]
}

export function getTerrainFeatureColor(
	feature: number,
): [number, number, number] | null {
	return TERRAIN_FEATURE_COLORS[feature] ?? null
}

export function getTopographyColor(
	topography: number,
): [number, number, number] | null {
	return TOPOGRAPHY_COLORS[topography] ?? null
}

export const TERRAIN_FEATURE_COLORS: Record<number, [number, number, number]> =
	{
		[TERRAIN_FEATURES.genesisTerrainFeature.RIFT_VALLEY]: [0.82, 0.29, 0.22],
		[TERRAIN_FEATURES.genesisTerrainFeature.PULL_APART_BASIN]: [
			0.7, 0.22, 0.18,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.BACK_ARC_BASIN]: [0.95, 0.55, 0.22],
		[TERRAIN_FEATURES.genesisTerrainFeature.FOLD_RIDGES]: [0.55, 0.24, 0.13],
		[TERRAIN_FEATURES.genesisTerrainFeature.PLATEAU_UPLIFT]: [0.8, 0.65, 0.28],
		[TERRAIN_FEATURES.genesisTerrainFeature.CONTINENTAL_INTERIOR]: [
			0.45, 0.63, 0.21,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.MID_OCEAN_RIDGE]: [
			0.17, 0.73, 0.88,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.FRACTURE_ZONE]: [0.18, 0.47, 0.92],
		[TERRAIN_FEATURES.genesisTerrainFeature.TRENCH]: [0.07, 0.17, 0.46],
		[TERRAIN_FEATURES.genesisTerrainFeature.COASTAL_ROUGHENING]: [
			0.98, 0.9, 0.5,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.ISLAND_ARC]: [0.9, 0.4, 0.72],
		[TERRAIN_FEATURES.genesisTerrainFeature.CONTINENTAL_SPLIT_ARC]: [
			0.55, 0.35, 0.95,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.SUNDA_SPLIT_ARC]: [0.15, 0.8, 0.55],
		[TERRAIN_FEATURES.genesisTerrainFeature.VOLCANIC_ARC]: [0.78, 0.12, 0.2],
		[TERRAIN_FEATURES.genesisTerrainFeature.LARGE_IGNEOUS_PROVINCE]: [
			0.55, 0.2, 0.75,
		],
		[TERRAIN_FEATURES.genesisTerrainFeature.HOTSPOT_VOLCANO]: [1, 0.5, 0],
	}

export const TOPOGRAPHY_COLORS: Record<number, [number, number, number]> = {
	0: [0x6c / 255, 0x9d / 255, 0x35 / 255], // flat
	1: [0x72 / 255, 0x84 / 255, 0x76 / 255], // hill
	2: [0x92 / 255, 0x76 / 255, 0x2d / 255], // plateau
	3: [0x6c / 255, 0x2c / 255, 0x14 / 255], // mountains
	4: [0x2d / 255, 0x8e / 255, 0x72 / 255], // marsh
	5: [0x75 / 255, 0xaf / 255, 0xd4 / 255], // ocean
	6: [0x75 / 255, 0xaf / 255, 0xd4 / 255], // lake
}

export const UNOWNED_GRAY: [number, number, number] = [0.75, 0.75, 0.75]

const rgb255 = (r: number, g: number, b: number): [number, number, number] => [
	r / 255,
	g / 255,
	b / 255,
]

export const ROCK_COLORS: Record<RockKind, [number, number, number]> = {
	sea: OCEAN_LIGHT_BLUE,
	young: rgb255(240, 228, 168),
	sandstone: rgb255(222, 182, 110),
	shale: rgb255(176, 150, 112),
	limestone: rgb255(118, 172, 222),
	salt: rgb255(236, 176, 208),
	basalt: rgb255(96, 80, 120),
	volcanic: rgb255(172, 124, 204),
	granite: rgb255(226, 110, 104),
	slate: rgb255(136, 192, 140),
	gneiss: rgb255(70, 140, 112),
	shield: rgb255(212, 150, 164),
	greenstone: rgb255(52, 112, 84),
	ophiolite: rgb255(44, 98, 112),
}

export const YOUNG_TAG_COLORS: Record<YoungKind, [number, number, number]> = {
	none: ROCK_COLORS.young,
	river: rgb255(250, 238, 120),
	loess: rgb255(214, 196, 132),
	till: rgb255(200, 204, 196),
	erg: rgb255(246, 222, 142),
}

const SOIL_BARREN = rgb255(196, 180, 146)
const SOIL_MIDDLING = rgb255(150, 150, 64)
const SOIL_RICH = rgb255(22, 96, 40)

export function soilColor(fertility: number): [number, number, number] {
	const f = Math.max(0, Math.min(1, fertility))
	const [from, to, t] =
		f < 0.5
			? [SOIL_BARREN, SOIL_MIDDLING, f * 2]
			: [SOIL_MIDDLING, SOIL_RICH, (f - 0.5) * 2]
	return [
		from[0] + (to[0] - from[0]) * t,
		from[1] + (to[1] - from[1]) * t,
		from[2] + (to[2] - from[2]) * t,
	]
}

export function rockColor({
	rock,
	young,
}: {
	rock: RockKind
	young: YoungKind
}): [number, number, number] {
	return rock === "young" ? YOUNG_TAG_COLORS[young] : ROCK_COLORS[rock]
}

export const WATER_TABLE_COLORS: ReadonlyArray<[number, number, number]> = [
	rgb255(8, 48, 107),
	rgb255(33, 102, 172),
	rgb255(67, 147, 195),
	rgb255(146, 197, 222),
	rgb255(209, 229, 240),
	rgb255(253, 219, 160),
	rgb255(224, 160, 80),
	rgb255(166, 97, 26),
]

export const SALT_PAN_COLOR: [number, number, number] = rgb255(190, 180, 151)

export const WETLAND_KIND_COLORS: ReadonlyArray<[number, number, number]> = [
	rgb255(200, 196, 180),
	rgb255(0, 150, 100),
	rgb255(110, 160, 170),
	rgb255(190, 170, 200),
	rgb255(120, 180, 90),
	rgb255(110, 80, 60),
	rgb255(170, 210, 110),
	rgb255(40, 160, 170),
	rgb255(20, 100, 70),
	rgb255(80, 70, 50),
]

export const SHORE_LABEL_COLORS: Record<ShoreLabel, [number, number, number]> =
	{
		none: UNOWNED_GRAY,
		iceCoast: rgb255(224, 240, 250),
		mangroveCoast: rgb255(20, 130, 80),
		saltMarshCoast: rgb255(130, 190, 120),
		tidalFlat: rgb255(150, 140, 190),
		deltaCoast: rgb255(60, 170, 190),
		estuaryCoast: rgb255(90, 120, 200),
		cliff: rgb255(110, 80, 70),
		rockyShore: rgb255(150, 140, 135),
		gravelBeach: rgb255(190, 160, 120),
		blackSandBeach: rgb255(50, 45, 60),
		sandyBeach: rgb255(245, 220, 130),
		muddyShore: rgb255(140, 105, 70),
	}

export const SHORE_LEGEND: ReadonlyArray<{ label: ShoreLabel; name: string }> =
	[
		{ label: "iceCoast", name: "Ice coast" },
		{ label: "mangroveCoast", name: "Mangrove coast" },
		{ label: "saltMarshCoast", name: "Salt marsh coast" },
		{ label: "tidalFlat", name: "Tidal flat" },
		{ label: "deltaCoast", name: "Delta coast" },
		{ label: "estuaryCoast", name: "Estuary coast" },
		{ label: "cliff", name: "Cliff" },
		{ label: "rockyShore", name: "Rocky shore" },
		{ label: "gravelBeach", name: "Gravel beach" },
		{ label: "blackSandBeach", name: "Black sand beach" },
		{ label: "sandyBeach", name: "Sandy beach" },
		{ label: "muddyShore", name: "Muddy shore" },
	]

export function waterTableClass(depthM: number): number {
	const bounds = GROUNDWATER_CONFIG.depthColourBoundsM
	for (let k = 0; k < bounds.length; k++) if (depthM <= bounds[k]) return k
	return bounds.length
}

export function waterTableColor(depthClass: number): [number, number, number] {
	return WATER_TABLE_COLORS[
		Math.max(0, Math.min(WATER_TABLE_COLORS.length - 1, depthClass))
	]
}

export function wetlandColor({
	kind,
	share,
}: {
	kind: number
	share: number
}): [number, number, number] {
	const base = WETLAND_KIND_COLORS[0]
	const tint = WETLAND_KIND_COLORS[kind] ?? base
	const t = kind === 0 ? 0 : 0.55 + 0.45 * Math.max(0, Math.min(1, share))
	return [
		base[0] + (tint[0] - base[0]) * t,
		base[1] + (tint[1] - base[1]) * t,
		base[2] + (tint[2] - base[2]) * t,
	]
}

export type WaterDotKey =
	| Exclude<SpringKind, "none">
	| Exclude<OasisKind, "none">

export const WATER_DOT_KEYS: readonly WaterDotKey[] = [
	"seepage",
	"contact",
	"karst",
	"piedmont",
	"river",
	"spring",
	"foothill",
	"fossil",
	"wells",
]

export const WATER_DOT_COLORS: Record<WaterDotKey, [number, number, number]> = {
	seepage: rgb255(130, 200, 255),
	contact: rgb255(30, 100, 230),
	karst: rgb255(0, 170, 170),
	piedmont: rgb255(100, 70, 200),
	river: rgb255(30, 160, 70),
	spring: rgb255(235, 200, 0),
	foothill: rgb255(240, 130, 20),
	fossil: rgb255(210, 40, 140),
	wells: rgb255(130, 80, 40),
}

export const WATER_DOT_LABELS: Record<WaterDotKey, string> = {
	seepage: "Seepage spring",
	contact: "Contact spring",
	karst: "Karst spring",
	piedmont: "Piedmont spring",
	river: "River oasis",
	spring: "Spring oasis (surfacing flux)",
	foothill: "Foothill oasis (mountain front)",
	fossil: "Fossil aquifer oasis (depression)",
	wells: "Well oasis",
}

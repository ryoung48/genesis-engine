import { SEABED_HABITAT } from "@/model/geography/terrain/seabed/habitat"
import type { SeabedHabitat } from "@/model/geography/terrain/seabed/habitat/types"
import type { SeabedLayers } from "@/model/geography/terrain/seabed/types"

type Rgb = [number, number, number]

const PERCENT = 100
const TINT_FLOOR = 0.25

const rgb255 = (r: number, g: number, b: number): Rgb => [
	r / 255,
	g / 255,
	b / 255,
]

export type SeabedLegendKind = Exclude<SeabedHabitat, "none">

export const SEABED_COLORS: Record<SeabedLegendKind, Rgb> = {
	seagrass: rgb255(46, 158, 107),
	kelp: rgb255(110, 122, 31),
	coral: rgb255(242, 118, 106),
	rockyReef: rgb255(125, 111, 99),
}

export const SEABED_LEGEND: ReadonlyArray<{
	kind: SeabedLegendKind
	name: string
}> = [
	{ kind: "coral", name: "Coral reef" },
	{ kind: "rockyReef", name: "Rocky reef" },
	{ kind: "kelp", name: "Kelp forest" },
	{ kind: "seagrass", name: "Seagrass meadow" },
]

function tint({
	base,
	target,
	sharePercent,
}: {
	base: Rgb
	target: Rgb
	sharePercent: number
}): Rgb {
	const t =
		TINT_FLOOR +
		(1 - TINT_FLOOR) * Math.sqrt(Math.min(1, sharePercent / PERCENT))
	return [
		base[0] + (target[0] - base[0]) * t,
		base[1] + (target[1] - base[1]) * t,
		base[2] + (target[2] - base[2]) * t,
	]
}

export function vegetationSeabedColor({
	seabed,
	region,
	base,
}: {
	seabed: SeabedLayers | undefined
	region: number
	base: Rgb
}): Rgb {
	if (!seabed) return base
	const habitat = SEABED_HABITAT.habitats[seabed.habitat[region]]
	if (habitat !== "seagrass" && habitat !== "kelp") return base
	return tint({
		base,
		target: SEABED_COLORS[habitat],
		sharePercent: seabed.share[region],
	})
}

export function topographySeabedColor({
	seabed,
	region,
	base,
}: {
	seabed: SeabedLayers | undefined
	region: number
	base: Rgb
}): Rgb {
	if (!seabed) return base
	const habitat = SEABED_HABITAT.habitats[seabed.habitat[region]]
	if (habitat !== "coral" && habitat !== "rockyReef") return base
	return tint({
		base,
		target: SEABED_COLORS[habitat],
		sharePercent: seabed.share[region],
	})
}

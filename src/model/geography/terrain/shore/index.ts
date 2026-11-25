import { ROCK_KEY } from "@/model/geography/terrain/groundwater/rock-key"
import { WETLANDS } from "@/model/geography/terrain/groundwater/wetlands"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { SHORE_EXPOSURE } from "@/model/geography/terrain/shore/exposure"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"
import { SHORE_SETTING } from "@/model/geography/terrain/shore/setting"
import type {
	HabitatOfParams,
	LabelOfParams,
	ShoreClassifyParams,
	ShoreHabitat,
	ShoreLabel,
	ShoreLayers,
	ShoreResult,
	ShoreStats,
	ShoreStatsParams,
} from "@/model/geography/terrain/shore/types"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"

const C = SHORE_CONFIG

const habitats: readonly ShoreHabitat[] = [
	"none",
	"mangrove",
	"saltMarsh",
	"tidalFlat",
]

const habitatCode = Object.fromEntries(
	habitats.map((kind, i) => [kind, i]),
) as Record<ShoreHabitat, number>

const labels: readonly ShoreLabel[] = [
	"none",
	"iceCoast",
	"mangroveCoast",
	"saltMarshCoast",
	"tidalFlat",
	"deltaCoast",
	"cliff",
	"rockyShore",
	"gravelBeach",
	"blackSandBeach",
	"sandyBeach",
	"muddyShore",
]

const labelCode = Object.fromEntries(
	labels.map((kind, i) => [kind, i]),
) as Record<ShoreLabel, number>

function habitatOf({
	isIce,
	wetlandKind,
	coastFlag,
	wetCoast,
	leeClass,
	relief,
	sandShare,
	tidalRangeM,
}: HabitatOfParams): number {
	if (isIce) return habitatCode.none
	if (coastFlag === 1 && wetCoast >= C.marshLabelShare) {
		if (wetlandKind === WETLANDS.code.mangrove) return habitatCode.mangrove
		if (wetlandKind === WETLANDS.code.coastalSaltMarsh)
			return habitatCode.saltMarsh
	}
	if (
		leeClass < 2 &&
		relief === SHORE_RELIEF.code.low &&
		sandShare < C.sandMin &&
		tidalRangeM >= C.flatRangeM
	)
		return habitatCode.tidalFlat
	return habitatCode.none
}

function labelOf({
	material,
	volcanicSand,
	relief,
	openClass,
	habitat,
	setting,
}: LabelOfParams): number {
	if (material === SHORE_MATERIAL.code.ice) return labelCode.iceCoast
	if (habitat === habitatCode.mangrove) return labelCode.mangroveCoast
	if (habitat === habitatCode.saltMarsh) return labelCode.saltMarshCoast
	if (habitat === habitatCode.tidalFlat) return labelCode.tidalFlat
	if (setting === SHORE_SETTING.code.delta) return labelCode.deltaCoast
	if (relief === SHORE_RELIEF.code.steep && openClass >= 1)
		return labelCode.cliff
	if (material === SHORE_MATERIAL.code.rock) return labelCode.rockyShore
	if (material === SHORE_MATERIAL.code.gravel) return labelCode.gravelBeach
	if (material === SHORE_MATERIAL.code.sand)
		return volcanicSand ? labelCode.blackSandBeach : labelCode.sandyBeach
	return labelCode.muddyShore
}

function tally<K extends string>(
	kinds: readonly K[],
	codes: Uint8Array,
	coastal: Uint8Array,
): Record<K, number> {
	const out = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<
		K,
		number
	>
	for (let r = 0; r < codes.length; r++) if (coastal[r]) out[kinds[codes[r]]]++
	return out
}

function statistics({ layers, stageMs }: ShoreStatsParams): ShoreStats {
	const coastal = Uint8Array.from(layers.label, (label) => (label > 0 ? 1 : 0))
	const open = Uint8Array.from(layers.exposureOpenM, (m) =>
		SHORE_EXPOSURE.classOf({ exposureM: m }),
	)
	const lee = Uint8Array.from(layers.exposureLeeM, (m) =>
		SHORE_EXPOSURE.classOf({ exposureM: m }),
	)
	let coastalRegions = 0
	let volcanicSand = 0
	for (let r = 0; r < coastal.length; r++) {
		coastalRegions += coastal[r]
		volcanicSand += layers.volcanicSand[r]
	}
	return {
		coastalRegions,
		label: tally(labels, layers.label, coastal),
		exposureOpen: tally(SHORE_EXPOSURE.classes, open, coastal),
		exposureLee: tally(SHORE_EXPOSURE.classes, lee, coastal),
		relief: tally(SHORE_RELIEF.kinds, layers.relief, coastal),
		material: tally(SHORE_MATERIAL.kinds, layers.material, coastal),
		habitat: tally(habitats, layers.habitat, coastal),
		setting: tally(SHORE_SETTING.kinds, layers.setting, coastal),
		volcanicSand,
		stageMs,
	}
}

function classify({
	mesh,
	isLand,
	openWater,
	elevationKm,
	planetRadiusKm,
	exposure,
	rock,
	youngKind,
	glaciated,
	iceThickness,
	groundwater,
	flow,
	tidalRange,
	volcano,
}: ShoreClassifyParams): ShoreResult {
	const startedAt = performance.now()
	const N = mesh.numRegions
	const coastal = LANDMARKS.coastalLandMask({ mesh, isLand, openWater })
	const relief = SHORE_RELIEF.classify({
		mesh,
		elevationKm,
		isLand,
		openWater,
		coastal,
		planetRadiusKm,
	})
	const { material, volcanicSand } = SHORE_MATERIAL.classify({
		coastal,
		keyCode: ROCK_KEY.codes({ rock, youngKind }),
		sand: groundwater.sand,
		iceThickness,
		relief,
		exposureOpenM: exposure.exposureOpenM,
		flow,
		volcano,
	})
	const setting = SHORE_SETTING.classify({
		coastal,
		relief,
		flow,
		tidalRange,
		glaciated,
		exposureLeeM: exposure.exposureLeeM,
	})
	const habitat = new Uint8Array(N)
	const label = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (!coastal[r]) continue
		habitat[r] = habitatOf({
			isIce: material[r] === SHORE_MATERIAL.code.ice,
			wetlandKind: groundwater.wetlandKind[r],
			coastFlag: groundwater.coastFlag[r],
			wetCoast: groundwater.wetCoast[r],
			leeClass: SHORE_EXPOSURE.classOf({ exposureM: exposure.exposureLeeM[r] }),
			relief: relief[r],
			sandShare: groundwater.sand[r],
			tidalRangeM: tidalRange[r],
		})
		label[r] = labelOf({
			material: material[r],
			volcanicSand: volcanicSand[r] === 1,
			relief: relief[r],
			openClass: SHORE_EXPOSURE.classOf({
				exposureM: exposure.exposureOpenM[r],
			}),
			habitat: habitat[r],
			setting: setting[r],
		})
	}
	const layers: ShoreLayers = {
		exposureOpenM: exposure.exposureOpenM,
		exposureLeeM: exposure.exposureLeeM,
		relief,
		material,
		volcanicSand,
		habitat,
		setting,
		label,
	}
	return {
		layers,
		stats: statistics({ layers, stageMs: performance.now() - startedAt }),
	}
}

export const SHORE = {
	labels,
	labelCode,
	habitats,
	habitatCode,
	habitatOf,
	labelOf,
	classify,
}

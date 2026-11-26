import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import type {
	BeginParams,
	DistrictParams,
	Here,
	PutParams,
	SpotParams,
	StretchParams,
} from "@/model/geography/terrain/deposits/scene/types"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import { MATH } from "@/model/shared/math/core"

const BYTE = 255
const MIN = DEPOSIT_CONFIG.pRichness
const [POOR] = DEPOSIT_CONFIG.grades

function stretch({ value, factor }: StretchParams): number {
	return value > POOR ? POOR + (value - POOR) * factor : value
}

function put({ scene, region, system, value }: PutParams): number {
	const k = SYSTEMS.index[system]
	const v = MATH.clamp01(
		stretch({ value: scene.scale[k] * value, factor: scene.stretch[k] }),
	)
	if (v > 0) scene.rows[k * scene.numRegions + region] = Math.round(BYTE * v)
	return v
}

function district({ scene, region, system, value }: DistrictParams): number {
	if (!(value > MIN)) return 0
	return put({
		scene,
		region,
		system,
		value: value * scene.shapes.at(SYSTEMS.index[system]),
	})
}

function spot({ scene, value, frequency, edges, offset }: SpotParams): number {
	if (!(value > MIN)) return 0
	const { wx, wy, wz } = scene.shapes.warped()
	return (
		value *
		MATH.smoothstep({
			edge0: edges[0],
			edge1: edges[1],
			x: scene.spot.noise(
				wx * frequency + offset,
				wy * frequency + 2 * offset,
				wz * frequency - offset,
			),
		})
	)
}

function begin({
	here,
	region,
	cell,
	rock,
	young,
	erg,
	till,
	glaciated,
}: BeginParams): void {
	here.region = region
	here.cell = cell
	here.rock = rock
	here.young = young
	here.erg = erg
	here.till = till
	here.glaciated = glaciated
	here.porphyry = 0
	here.vms = 0
	here.skarn = 0
	here.mvt = 0
	here.sedex = 0
	here.marble = 0
	here.coal = 0
}

function blank(): Here {
	return {
		region: 0,
		cell: 0,
		rock: 0,
		young: false,
		erg: false,
		till: false,
		glaciated: false,
		porphyry: 0,
		vms: 0,
		skarn: 0,
		mvt: 0,
		sedex: 0,
		marble: 0,
		coal: 0,
	}
}

export const SCENE = { put, stretch, district, spot, begin, blank }

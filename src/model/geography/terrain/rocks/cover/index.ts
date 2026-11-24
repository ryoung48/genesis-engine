import type {
	CoverKindParams,
	CoverShownParams,
} from "@/model/geography/terrain/rocks/cover/types"
import type { RockKind } from "@/model/geography/terrain/rocks/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"

const C = SURFACE_CONFIG

function shownKm({ coverKm, heightKm, glaciated }: CoverShownParams): number {
	const strip =
		C.highStripPerKm * Math.max(0, heightKm - C.highStripFromKm) +
		(glaciated ? C.glacialStripKm : 0)
	return coverKm - strip
}

function kind({ facies, draw }: CoverKindParams): RockKind {
	const salt = C.saltShare * facies.salt
	const lime = Math.min(1 - salt, C.carbGain * facies.carb)
	const clastic = 1 - lime - salt
	const shale = Math.min(
		C.shaleMax,
		C.shaleLand +
			(C.shaleMarine - C.shaleLand) * facies.marine +
			0.6 * facies.organic,
	)
	const at = draw
	if (at < lime) return "limestone"
	if (at < lime + salt) return "salt"
	if (at < lime + salt + clastic * shale) return "shale"
	return "sandstone"
}

function shown(params: CoverShownParams): boolean {
	return shownKm(params) > C.coverShowKm
}

export const COVER_ROCK = { kind, shown, shownKm }

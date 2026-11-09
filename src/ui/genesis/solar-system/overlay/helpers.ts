import { ASTEROID_BELT } from "@/model/celestial/system/generation/asteroid-belt"
import type { SystemBody } from "@/model/celestial/system/types"
import {
	BELT_WIDTH_RATIO,
	BODY_SIZE_RADIUS_KM,
	GROUP_LABEL,
	MIN_BODY_SIZE,
} from "@/ui/genesis/solar-system/overlay/constants"

// `showRealNames` gates real Sol names the same way the stat-panel titles
// do (see GenerationPanel's resolveSiblingBodyTitle) — off by default so a
// procedurally generated system's bodies read as "Terrestrial Planet 2"
// etc. rather than borrowing unrelated real names baked into the Sol seed
// data.
export function bodyDisplayName(
	body: SystemBody,
	siblingNumber: number,
	showRealNames: boolean,
	namesEnabled: boolean,
): string {
	if (body.isMainWorld) {
		if (showRealNames) return "Earth"
		if (namesEnabled && body.name) return body.name
		return "Main World"
	}
	if (namesEnabled && body.name) return body.name
	return `${GROUP_LABEL[body.group]} ${siblingNumber}`
}

// A body's size before the per-system fit (see BODY_GAP_FRACTION).
export function bodySizeUnits(diameterKm: number): number {
	return Math.max(
		MIN_BODY_SIZE,
		Math.tanh(Math.max(diameterKm, 0) / 2 / BODY_SIZE_RADIUS_KM),
	)
}

export function beltEdgesAU(body: SystemBody): {
	minAU: number
	maxAU: number
} {
	if (body.belt) {
		return ASTEROID_BELT.beltAURange({
			orbitalDistanceAU: body.orbitalDistanceAU,
			spanOrbitNumber: body.belt.spanOrbitNumber,
		})
	}
	const halfSpanAU = (body.orbitalDistanceAU * BELT_WIDTH_RATIO) / 2
	return {
		minAU: body.orbitalDistanceAU - halfSpanAU,
		maxAU: body.orbitalDistanceAU + halfSpanAU,
	}
}

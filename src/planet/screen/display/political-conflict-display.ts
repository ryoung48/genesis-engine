export interface PoliticalMapWar {
	idx: number
	attacker: number
	defender: number
	rebel: boolean
	occupied: number[]
}

export function getRebelDisplayColorNationId(
	activeWars: readonly PoliticalMapWar[] | null | undefined,
	nationId: number,
): number | null {
	for (const war of activeWars ?? []) {
		if (war.rebel && war.defender === nationId) return war.attacker
	}
	return null
}

export function buildPoliticalOccupationOverlay(params: {
	regionProvince: Int32Array | null | undefined
	assignment: Int32Array | null | undefined
	activeWars: readonly PoliticalMapWar[] | null | undefined
	getNationColorRgb: (nationId: number) => [number, number, number] | null
}): Float32Array | null {
	const { regionProvince, assignment, activeWars, getNationColorRgb } = params
	if (
		!regionProvince ||
		!assignment ||
		!activeWars ||
		activeWars.length === 0
	) {
		return null
	}

	const occupiedByProvince = new Map<number, [number, number, number]>()
	for (const war of activeWars) {
		if (war.rebel) {
			const stripeColor: [number, number, number] = [0, 0, 0]
			const occupied = new Set(war.occupied)
			for (let province = 0; province < assignment.length; province++) {
				if (assignment[province] !== war.defender || occupied.has(province))
					continue
				occupiedByProvince.set(province, stripeColor)
			}
			continue
		}

		const stripeColor = getNationColorRgb(war.attacker)
		if (!stripeColor) continue
		for (const province of war.occupied) {
			occupiedByProvince.set(province, stripeColor)
		}
	}

	if (occupiedByProvince.size === 0) return null
	const overlay = new Float32Array(regionProvince.length * 4)
	let hasOccupiedRegion = false
	for (let region = 0; region < regionProvince.length; region++) {
		const stripeColor = occupiedByProvince.get(regionProvince[region])
		if (!stripeColor) continue
		const base = region * 4
		overlay[base] = stripeColor[0]
		overlay[base + 1] = stripeColor[1]
		overlay[base + 2] = stripeColor[2]
		overlay[base + 3] = 1
		hasOccupiedRegion = true
	}
	return hasOccupiedRegion ? overlay : null
}

export function getPoliticalHoverOccupation(params: {
	hoverProvince: number | null
	assignment: Int32Array | null | undefined
	activeWars: readonly PoliticalMapWar[] | null | undefined
}): { id: number; displayColorNationId: number; rebel: boolean } | null {
	const { hoverProvince, assignment, activeWars } = params
	if (
		hoverProvince === null ||
		hoverProvince < 0 ||
		!assignment ||
		!activeWars ||
		activeWars.length === 0
	) {
		return null
	}

	for (const war of activeWars) {
		if (war.rebel) {
			if (
				assignment[hoverProvince] === war.defender &&
				!war.occupied.includes(hoverProvince)
			) {
				return {
					id: war.defender,
					displayColorNationId: war.attacker,
					rebel: true,
				}
			}
			continue
		}
		if (war.occupied.includes(hoverProvince)) {
			return {
				id: war.attacker,
				displayColorNationId: war.attacker,
				rebel: false,
			}
		}
	}

	return null
}

export function getPoliticalHoverNationId(params: {
	hoverProvince: number | null
	assignment: Int32Array | null | undefined
	activeWars: readonly PoliticalMapWar[] | null | undefined
}): number | null {
	const { hoverProvince, assignment, activeWars } = params
	if (hoverProvince === null || hoverProvince < 0 || !assignment) return null
	const occupation = getPoliticalHoverOccupation({
		hoverProvince,
		assignment,
		activeWars,
	})
	if (occupation?.rebel) return occupation.displayColorNationId
	return assignment[hoverProvince] ?? null
}

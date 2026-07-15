import type { PoliticalMapWar } from "../../../ui/planet/screen/display/political-conflict-display"
import type { RawNationReference } from "./data-source"
import type { FoldedState } from "./fold"
import type { Eu4ProvinceMap } from "./import/eu4-province-map"

/** Assigns a stable internal numeric id per nation tag encountered as a
 * province owner *or controller* in `state` -- a war's attacker may only
 * ever appear as a controller (e.g. a rebel faction that never owns
 * territory outright), so it still needs an id to be stripeable. This is a
 * simplified placeholder for the fuller mechanism docs/earth-history-plan.md
 * describes ("Nation ID mapping": seed internal nation ids the same way
 * NATION.build derives them from a province partition, just from real
 * ownership instead of flood-fill) -- that integration with NATION.build is
 * not implemented yet. Deterministic (sorted tag order) so ids are stable
 * across calls for the same tag set. */
function assignNationIds(state: FoldedState): Map<string, number> {
	const tags = new Set<string>()
	for (const p of state.provinces.values()) {
		if (p.owner) tags.add(p.owner)
		if (p.controller) tags.add(p.controller)
	}
	const sorted = Array.from(tags).sort()
	const ids = new Map<string, number>()
	sorted.forEach((tag, i) => ids.set(tag, i))
	return ids
}

export interface GenesisFrameFromHistory {
	/** Per compact province index: internal nation id, or -1 if unowned. */
	assignment: Int32Array
	/** Per compact province index: culture id, or null. */
	cultureByProvince: (string | null)[]
	/** Per compact province index: religion id, or null. */
	religionByProvince: (string | null)[]
	nationIds: Map<string, number>
	/** Per nation id: the compact province index to anchor the nation label
	 * at. Prefers the real capital (history/countries/*.txt's `capital`
	 * field, tracked over time as `capitalChange` events) when that
	 * province is currently owned by the same nation; otherwise falls back
	 * to the owned province geographically closest to the centroid of all
	 * its owned provinces (see provinceCoords param) -- important for
	 * tags with no capital data at all (e.g. Cliopatria-sourced pre-2AD
	 * polities), where the naive "first scanned" index could land on the
	 * edge of a nation's territory instead of somewhere central. Falls
	 * back further to whatever was scanned first if coordinates are
	 * missing for every owned province. Matches the shape of the
	 * procedural world.nations.seeds array so nation-label placement
	 * (nation-label-overlay.ts's nationCapitalRegion) works unmodified
	 * against a shadow world built from this frame. -1 for an id with no
	 * owned provinces (shouldn't normally happen). */
	seeds: Int32Array
	/** Per nation id: display name, from reference/nations.json when
	 * available, falling back to the raw EU4 tag. */
	names: string[]
	/** `occupied` follows EU4 convention: a province is occupied whenever its
	 * controller differs from its owner. We track both fields per province
	 * (see FoldedProvinceState), so this needs no extra siege/occupation
	 * data beyond what's already converted from owner/controller events. */
	activeWars: PoliticalMapWar[]
	/** Per compact province index: culture partition id, or -1. Paired with
	 * cultureNames for the culture map-mode label overlay (see
	 * buildGlobePartitionLabels in nation-label-overlay.ts) -- a different id
	 * space from the procedural world.cultures.assignment, so it can't reuse
	 * that field/the buildGlobeCultureLabels wrapper. */
	cultureAssignment: Int32Array
	cultureCount: number
	cultureNames: string[]
	/** Same shape as culture, for religion -- which has no procedural
	 * label-overlay equivalent at all (world.religions is culture-indexed,
	 * not province-indexed, and there is no buildGlobeReligionLabels in the
	 * procedural system). */
	religionAssignment: Int32Array
	religionCount: number
	religionNames: string[]
}

/** Converts a lon/lat pair to a unit vector on the sphere, so per-nation
 * geographic centroids can be averaged without antimeridian/pole
 * wraparound issues (plain lon/lat averaging breaks near +-180 deg). */
function lonLatToUnitVector(
	lon: number,
	lat: number,
): [number, number, number] {
	const lonRad = (lon * Math.PI) / 180
	const latRad = (lat * Math.PI) / 180
	const cosLat = Math.cos(latRad)
	return [
		cosLat * Math.cos(lonRad),
		cosLat * Math.sin(lonRad),
		Math.sin(latRad),
	]
}

/** Among `owned` (compact province indices), returns the one geographically
 * closest to their collective centroid -- null if none have coordinates. */
function findCentroidNearestProvince(
	owned: number[],
	provinceMap: Eu4ProvinceMap,
	provinceCoords: Map<string, { lon: number; lat: number }>,
): number | null {
	const vectors: { idx: number; v: [number, number, number] }[] = []
	let sumX = 0
	let sumY = 0
	let sumZ = 0
	for (const idx of owned) {
		const rawId = String(provinceMap.compactToRealId[idx])
		const coord = provinceCoords.get(rawId)
		if (!coord) continue
		const v = lonLatToUnitVector(coord.lon, coord.lat)
		vectors.push({ idx, v })
		sumX += v[0]
		sumY += v[1]
		sumZ += v[2]
	}
	if (vectors.length === 0) return null
	const len = Math.hypot(sumX, sumY, sumZ) || 1
	const centroid: [number, number, number] = [
		sumX / len,
		sumY / len,
		sumZ / len,
	]
	let bestIdx = vectors[0].idx
	let bestDist = Number.POSITIVE_INFINITY
	for (const { idx, v } of vectors) {
		const dx = v[0] - centroid[0]
		const dy = v[1] - centroid[1]
		const dz = v[2] - centroid[2]
		const dist = dx * dx + dy * dy + dz * dz
		if (dist < bestDist) {
			bestDist = dist
			bestIdx = idx
		}
	}
	return bestIdx
}

export function foldedStateToGenesisFrame(
	state: FoldedState,
	provinceMap: Eu4ProvinceMap,
	nationReference?: Map<string, RawNationReference>,
	cultureNameById?: Map<string, string>,
	religionNameById?: Map<string, string>,
	provinceCoords?: Map<string, { lon: number; lat: number }>,
): GenesisFrameFromHistory {
	const count = provinceMap.compactToRealId.length
	const assignment = new Int32Array(count).fill(-1)
	const cultureByProvince: (string | null)[] = new Array(count).fill(null)
	const religionByProvince: (string | null)[] = new Array(count).fill(null)
	const nationIds = assignNationIds(state)
	// (ownerTag, controllerTag) -> compact province indices currently
	// occupied by controllerTag away from ownerTag.
	const occupiedByOwnerController = new Map<string, number[]>()
	const seeds = new Int32Array(nationIds.size).fill(-1)
	const ownedByNation = new Map<number, number[]>()
	const cultureIds = new Map<string, number>()
	const religionIds = new Map<string, number>()
	const cultureAssignment = new Int32Array(count).fill(-1)
	const religionAssignment = new Int32Array(count).fill(-1)

	for (let idx = 0; idx < count; idx++) {
		const rawId = String(provinceMap.compactToRealId[idx])
		const p = state.provinces.get(rawId)
		if (!p) continue
		if (p.owner) {
			const id = nationIds.get(p.owner) ?? -1
			assignment[idx] = id
			if (id >= 0) {
				if (seeds[id] < 0) seeds[id] = idx
				let owned = ownedByNation.get(id)
				if (!owned) ownedByNation.set(id, (owned = []))
				owned.push(idx)
			}
		}
		cultureByProvince[idx] = p.cultureId
		religionByProvince[idx] = p.religionId
		if (p.cultureId) {
			let cid = cultureIds.get(p.cultureId)
			if (cid === undefined)
				cultureIds.set(p.cultureId, (cid = cultureIds.size))
			cultureAssignment[idx] = cid
		}
		if (p.religionId) {
			let rid = religionIds.get(p.religionId)
			if (rid === undefined)
				religionIds.set(p.religionId, (rid = religionIds.size))
			religionAssignment[idx] = rid
		}
		if (p.owner && p.controller && p.owner !== p.controller) {
			const key = `${p.owner}|${p.controller}`
			let list = occupiedByOwnerController.get(key)
			if (!list) occupiedByOwnerController.set(key, (list = []))
			list.push(idx)
		}
	}

	const cultureNames = new Array<string>(cultureIds.size)
	for (const [id, idx] of cultureIds)
		cultureNames[idx] = cultureNameById?.get(id) ?? id
	const religionNames = new Array<string>(religionIds.size)
	for (const [id, idx] of religionIds)
		religionNames[idx] = religionNameById?.get(id) ?? id

	const names = new Array<string>(nationIds.size)
	for (const [tag, id] of nationIds) {
		names[id] =
			state.nations.get(tag)?.currentName ??
			nationReference?.get(tag)?.name ??
			tag
		// Prefer the real capital as the label anchor over the fallback
		// first-owned-province from the loop above, when that capital is
		// currently owned by this same nation.
		const capitalRawId = state.nations.get(tag)?.capitalProvinceId
		let hasCapitalSeed = false
		if (capitalRawId) {
			const capitalIdx = provinceMap.realIdToCompact.get(capitalRawId)
			if (capitalIdx !== undefined && assignment[capitalIdx] === id) {
				seeds[id] = capitalIdx
				hasCapitalSeed = true
			}
		}
		if (!hasCapitalSeed && provinceCoords) {
			const owned = ownedByNation.get(id)
			if (owned && owned.length > 1) {
				const centroidNearestIdx = findCentroidNearestProvince(
					owned,
					provinceMap,
					provinceCoords,
				)
				if (centroidNearestIdx !== null) seeds[id] = centroidNearestIdx
			}
		}
	}

	const activeWars: PoliticalMapWar[] = []
	let warIdx = 0
	for (const war of state.activeWars) {
		for (const attackerTag of war.attackers) {
			const attacker = nationIds.get(attackerTag)
			if (attacker === undefined) continue
			for (const defenderTag of war.defenders) {
				const defender = nationIds.get(defenderTag)
				if (defender === undefined) continue
				const occupied =
					occupiedByOwnerController.get(`${defenderTag}|${attackerTag}`) ?? []
				activeWars.push({
					idx: warIdx++,
					attacker,
					defender,
					rebel: war.isRebel,
					occupied,
				})
			}
		}
	}

	return {
		assignment,
		cultureByProvince,
		religionByProvince,
		nationIds,
		seeds,
		names,
		activeWars,
		cultureAssignment,
		cultureCount: cultureIds.size,
		cultureNames,
		religionAssignment,
		religionCount: religionIds.size,
		religionNames,
	}
}

export interface NationInfoFromHistory {
	tag: string
	name: string | null
	governmentType: string | null
	reforms: string[]
	ruler: { name: string; dynasty?: string } | null
	overlord: string | null
	vassals: string[]
	unionWith: string[]
	allies: string[]
	atWar: {
		warId: string
		name: string
		isRebel: boolean
		asAttacker: boolean
	}[]
}

export function foldedStateToNationInfo(
	state: FoldedState,
	tag: string,
): NationInfoFromHistory | null {
	const n = state.nations.get(tag)
	if (!n) return null
	const atWar: NationInfoFromHistory["atWar"] = []
	for (const war of state.activeWars) {
		if (war.attackers.has(tag))
			atWar.push({
				warId: war.warId,
				name: war.name,
				isRebel: war.isRebel,
				asAttacker: true,
			})
		else if (war.defenders.has(tag))
			atWar.push({
				warId: war.warId,
				name: war.name,
				isRebel: war.isRebel,
				asAttacker: false,
			})
	}
	return {
		tag,
		name: n.currentName,
		governmentType: n.governmentType,
		reforms: Array.from(n.reforms),
		ruler: n.ruler,
		overlord: n.overlord,
		vassals: Array.from(n.vassals),
		unionWith: Array.from(n.unionWith),
		allies: Array.from(n.allies),
		atWar,
	}
}

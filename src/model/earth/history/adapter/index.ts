import type {
	FindCentroidNearestProvinceParams,
	FoldedStateToGenesisFrameParams,
	FoldedStateToNationInfoParams,
	GenesisFrameFromHistory,
	NationInfoFromHistory,
} from "@/model/earth/history/adapter/types"
import type { FoldedState } from "@/model/earth/history/fold/types"
import type { LonLat } from "@/model/earth/history/types"
import type { PoliticalMapWar } from "@/ui/planet/screen/display/political-conflict-display"

function isPlaceholderNationTag(tag: string): boolean {
	return tag === "---" || tag === "XXX"
}

function assignNationIds(state: FoldedState): Map<string, number> {
	const tags = new Set<string>()
	for (const p of state.provinces.values()) {
		if (p.owner && !isPlaceholderNationTag(p.owner)) tags.add(p.owner)
		if (p.controller && !isPlaceholderNationTag(p.controller))
			tags.add(p.controller)
	}
	const sorted = Array.from(tags).sort()
	const ids = new Map<string, number>()
	for (const [i, tag] of sorted.entries()) ids.set(tag, i)
	return ids
}

function lonLatToUnitVector({ lon, lat }: LonLat): [number, number, number] {
	const lonRad = (lon * Math.PI) / 180
	const latRad = (lat * Math.PI) / 180
	const cosLat = Math.cos(latRad)
	return [
		cosLat * Math.cos(lonRad),
		cosLat * Math.sin(lonRad),
		Math.sin(latRad),
	]
}

function findCentroidNearestProvince({
	owned,
	provinceMap,
	provinceCoords,
}: FindCentroidNearestProvinceParams): number | null {
	const vectors: { idx: number; v: [number, number, number] }[] = []
	let sumX = 0
	let sumY = 0
	let sumZ = 0
	for (const idx of owned) {
		const rawId = String(provinceMap.compactToRealId[idx])
		const coord = provinceCoords.get(rawId)
		if (!coord) continue
		const v = lonLatToUnitVector(coord)
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

function foldedStateToGenesisFrame({
	state,
	provinceMap,
	nationReference,
	cultureNameById,
	religionNameById,
	provinceCoords,
}: FoldedStateToGenesisFrameParams): GenesisFrameFromHistory {
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
				const centroidNearestIdx = findCentroidNearestProvince({
					owned,
					provinceMap,
					provinceCoords,
				})
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

function foldedStateToNationInfo({
	state,
	tag,
}: FoldedStateToNationInfoParams): NationInfoFromHistory | null {
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
		governmentReform: n.governmentReform,
		ruler: n.ruler,
		overlord: n.overlord,
		overlordSubjectType: n.overlordSubjectType,
		vassals: Array.from(n.vassals),
		vassalSubjectTypes: Array.from(n.vassalSubjectTypes).map(
			([subjectTag, subjectType]) => ({ tag: subjectTag, subjectType }),
		),
		unionSeniorOf: Array.from(n.unionSeniorOf),
		unionJuniorPartner: n.unionJuniorPartner,
		allies: Array.from(n.allies),
		guarantees: Array.from(n.guarantees),
		royalMarriages: Array.from(n.royalMarriages),
		atWar,
	}
}

export const ADAPTER = {
	foldedStateToGenesisFrame,
	foldedStateToNationInfo,
}

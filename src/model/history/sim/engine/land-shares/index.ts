import { DERIVE } from "@/model/history/sim/engine/derive"
import type {
	LandSharesRefreshParams,
	RealmRootParams,
} from "@/model/history/sim/engine/land-shares/types"
import { STATE } from "@/model/history/sim/engine/state"
import { TARGET_PROFILE } from "@/model/history/sim/targets"

const MAX_OVERLORD_DEPTH = 8

function realmRoot({ state, root }: RealmRootParams): number {
	let current = root
	for (let depth = 0; depth < MAX_OVERLORD_DEPTH; depth++) {
		const overlord = STATE.diplomaticOverlord({ state, nation: current })
		if (overlord < 0) return current
		current = overlord
	}
	return current
}

function refresh({ state }: LandSharesRefreshParams): void {
	const land = state.land
	if (!land.governed) return
	DERIVE.ensureHierarchyClean(state)
	const own = new Int32Array(state.P)
	let held = 0
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || state.uninhabited[p] || state.stateless[p])
			continue
		const root = state.sovereignCurrent[p]
		if (root < 0) continue
		own[root]++
		held++
	}
	land.realmSize.fill(0)
	for (let root = 0; root < state.P; root++)
		if (own[root] > 0) land.realmSize[realmRoot({ state, root })] += own[root]
	const profile = TARGET_PROFILE.at({
		year: Math.floor(state.time / STATE.yearMs),
		habitableProvinces: land.habitable,
	})
	land.stateHeldTarget = profile.stateHeld
	const provincesIn = new Float64Array(TARGET_PROFILE.bucketCount)
	for (let root = 0; root < state.P; root++)
		if (land.realmSize[root] > 0)
			provincesIn[TARGET_PROFILE.bucketOf({ size: land.realmSize[root] })] +=
				land.realmSize[root]
	for (let b = 0; b < TARGET_PROFILE.bucketCount; b++) {
		land.shares[b] = held > 0 ? provincesIn[b] / held : 0
		land.targets[b] = profile.sizeShares[b]
	}
}

export const LAND_SHARES = { refresh }

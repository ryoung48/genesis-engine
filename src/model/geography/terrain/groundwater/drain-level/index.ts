import type {
	DrainLevel,
	DrainLevelParams,
	IncisionParams,
} from "@/model/geography/terrain/groundwater/drain-level/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

function incision({ reliefM }: IncisionParams): number {
	return Math.min(C.incisionMaxM, C.incisionMinM + C.incisionRel * reliefM)
}

function compute({
	drainTarget,
	processOrder,
	heightM,
	reliefM,
	waterLevelM,
	water,
	pan,
	wet,
}: DrainLevelParams): DrainLevel {
	const n = heightM.length
	const incisionM = new Float32Array(n)
	const headM = new Float32Array(n)
	const offsetM = new Float32Array(n)
	for (let r = 0; r < n; r++) if (water[r]) headM[r] = waterLevelM[r]

	for (let i = 0; i < processOrder.length; i++) {
		const r = processOrder[i]
		const z = heightM[r]
		incisionM[r] = incision({ reliefM: reliefM[r] })
		const local = z - incisionM[r]
		if (pan[r]) {
			headM[r] = z - C.panDepthM
			continue
		}
		const target = drainTarget[r]
		headM[r] = wet[r] || target < 0 ? local : Math.min(local, headM[target])
		offsetM[r] = local - headM[r]
	}
	return { incisionM, headM, offsetM }
}

export const DRAIN_LEVEL = { incision, compute }

import type {
	CapacityParams,
	CascadeParams,
	CascadeResult,
} from "@/model/geography/terrain/groundwater/lateral-flux/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const HEX_EDGE_RATIO = Math.sqrt(3)

function capacity({
	transmissivity,
	headDropM,
	distM,
}: CapacityParams): number {
	const gradient = Math.max(C.sMin, headDropM / distM)
	return transmissivity * gradient * (distM / HEX_EDGE_RATIO)
}

function cascade({
	drainTarget,
	processOrder,
	targetDistM,
	headM,
	active,
	pan,
	karst,
	recharge,
	areaM2,
	transmissivity,
}: CascadeParams): CascadeResult {
	const n = recharge.length
	const qin = new Float64Array(n)
	const qout = new Float64Array(n)
	const qem = new Float64Array(n)
	const qkarst = new Float64Array(n)
	const effective = new Float64Array(n)
	let exportedM3s = 0
	let dischargedM3s = 0

	for (let i = processOrder.length - 1; i >= 0; i--) {
		const r = processOrder[i]
		if (!active[r]) continue
		const own = C.regionalShare * recharge[r] * areaM2[r]
		const available = qin[r] + own
		const availableKarst = qkarst[r] + (karst[r] ? own : 0)
		const target = drainTarget[r]
		const cap =
			pan[r] || target < 0
				? 0
				: capacity({
						transmissivity: transmissivity[r],
						headDropM: headM[r] - headM[target],
						distM: targetDistM[r],
					})
		const out = Math.min(available, cap)
		qout[r] = out
		qem[r] = Math.max(0, qin[r] - cap)
		effective[r] = Math.max(0, recharge[r] + (qin[r] - out) / areaM2[r])
		if (out <= 0) continue
		if (target >= 0 && active[target]) {
			qin[target] += out
			qkarst[target] += available > 0 ? (out * availableKarst) / available : 0
		} else dischargedM3s += out
		exportedM3s += Math.max(0, out - qin[r])
	}
	return { qin, qout, qem, qkarst, effective, exportedM3s, dischargedM3s }
}

export const LATERAL_FLUX = { capacity, cascade }

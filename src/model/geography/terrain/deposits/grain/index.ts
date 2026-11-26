import { CRUST } from "@/model/geography/tectonics/crust"
import type {
	GrainFields,
	GrainParams,
} from "@/model/geography/terrain/deposits/grain/types"
import { HASH } from "@/model/shared/random/hash"

const SALT = { theta: 0x7a11, phi: 0x3c3c }

function fields({ crust, seed }: GrainParams): GrainFields {
	const n = crust.numCells
	const out: GrainFields = {
		acrossKm: new Float32Array(n),
		beltW: new Float32Array(n),
		axisX: new Float32Array(n),
		axisY: new Float32Array(n),
		axisZ: new Float32Array(n),
	}
	for (let c = 0; c < n; c++) {
		const type = crust.type[c]
		if (type === CRUST.TYPE.OCEAN) continue
		const belt = crust.oroType[c]
		if (belt && crust.beltReach[c] > 0) {
			out.acrossKm[c] = Math.min(1, crust.beltU[c]) * crust.beltReach[c]
			out.beltW[c] = 1
		}
		if (type === CRUST.TYPE.CRATON && !belt) {
			const terrane = crust.terrane[c]
			const theta =
				2 * Math.PI * HASH.unit({ seed, channel: terrane, salt: SALT.theta })
			const phi = Math.acos(
				2 * HASH.unit({ seed, channel: terrane, salt: SALT.phi }) - 1,
			)
			out.axisX[c] = Math.sin(phi) * Math.cos(theta)
			out.axisY[c] = Math.sin(phi) * Math.sin(theta)
			out.axisZ[c] = Math.cos(phi)
		}
	}
	return out
}

export const GRAIN = { fields }

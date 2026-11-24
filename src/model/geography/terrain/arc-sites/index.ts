import { CRUST } from "@/model/geography/tectonics/crust"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import type {
	BuildArcSitesParams,
	StrikeParams,
} from "@/model/geography/terrain/arc-sites/types"
import type { VolcanoSite } from "@/model/geography/terrain/volcano-edifices/types"
import { VEC3 } from "@/model/shared/math/vec3"
import type { Vec3 } from "@/model/shared/math/vec3/types"
import { RNG } from "@/model/shared/random/rng"

const V = PRESENT_CONFIG.volcano
const ARC_SALT = 102
const ANDEAN_SALT = 103

function strikeAt({ space, crust, cell }: StrikeParams): Vec3 | null {
	const { adjOffset, adjList, r_xyz } = space.mesh
	const p = VEC3.at({ xyz: r_xyz, cell })
	let ax = 0
	let ay = 0
	let az = 0
	for (let k = adjOffset[cell]; k < adjOffset[cell + 1]; k++) {
		const nb = adjList[k]
		if (crust.oroType[nb] === CRUST.OROGENY.NONE) continue
		const du = crust.beltU[nb] - crust.beltU[cell]
		ax += du * (r_xyz[3 * nb] - p[0])
		ay += du * (r_xyz[3 * nb + 1] - p[1])
		az += du * (r_xyz[3 * nb + 2] - p[2])
	}
	const radial = ax * p[0] + ay * p[1] + az * p[2]
	const across: Vec3 = [
		ax - radial * p[0],
		ay - radial * p[1],
		az - radial * p[2],
	]
	if (Math.hypot(across[0], across[1], across[2]) < 1e-9) return null
	return VEC3.cross({ a: p, b: VEC3.unit(across) })
}

function cellRng({
	seed,
	cell,
	salt,
}: {
	seed: number
	cell: number
	salt: number
}): () => number {
	return RNG.makeRng(((seed ^ 0x5a00) + cell * 7919 + salt * 131) >>> 0)
}

function build({
	space,
	crust,
	arcFront,
	formedAtMyr,
	seed,
}: BuildArcSitesParams): VolcanoSite[] {
	const sites: VolcanoSite[] = []
	for (let c = 0; c < crust.numCells; c++) {
		if (crust.type[c] === CRUST.TYPE.ARC) {
			if (!arcFront[c]) continue
			const rng = cellRng({ seed, cell: c, salt: ARC_SALT })
			if (!(rng() < V.arcConeShare)) continue
			const m = Math.min(1, Math.max(0, -formedAtMyr[c] / V.arcMatureMyr))
			sites.push({
				cell: c,
				kind: "arc",
				heightKm:
					(V.coneKm.young + (V.coneKm.mature - V.coneKm.young) * m) *
					(0.75 + 0.5 * rng()),
				radiusKm:
					(V.coneRadiusKm.young +
						(V.coneRadiusKm.mature - V.coneRadiusKm.young) * m) *
					(0.85 + 0.3 * rng()),
				ageMyr: 10 + 40 * m * rng(),
				strike: strikeAt({ space, crust, cell: c }),
				floorKm: null,
				active: true,
			})
			continue
		}
		if (
			crust.oroType[c] !== CRUST.OROGENY.ANDEAN ||
			!(crust.oroLast[c] > -V.coneActiveMyr)
		)
			continue
		const W = Math.max(40, crust.beltReach[c])
		const centre = Math.max(70, Math.min(260, 0.3 * W))
		const dKm = crust.beltU[c] * crust.beltReach[c]
		const rng = cellRng({ seed, cell: c, salt: ANDEAN_SALT })
		if (
			!(
				Math.abs(dKm - centre) < Math.max(35, 0.07 * W) + 40 &&
				rng() < V.andeanConeShare
			)
		)
			continue
		sites.push({
			cell: c,
			kind: "andean",
			heightKm: V.coneKm.andean * (0.75 + 0.5 * rng()),
			radiusKm: V.coneRadiusKm.andean * (0.85 + 0.3 * rng()),
			ageMyr: 20 * rng(),
			strike: strikeAt({ space, crust, cell: c }),
			floorKm: null,
			active: true,
		})
	}
	return sites
}

export const ARC_SITES = { build }

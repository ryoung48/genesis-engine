import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import { GLACIER_CAVE } from "@/model/geography/terrain/caves/glacier"
import { GROTTO_CAVE } from "@/model/geography/terrain/caves/grotto"
import { LAVA_CAVE } from "@/model/geography/terrain/caves/lava"
import { SEA_CAVE } from "@/model/geography/terrain/caves/sea"
import { SINKHOLE_CAVE } from "@/model/geography/terrain/caves/sinkhole"
import { TALUS_CAVE } from "@/model/geography/terrain/caves/talus"
import type {
	CavePotentialsParams,
	CaveSitesParams,
	CaveType,
	GenesisCaveSites,
	PassageLengthParams,
	SitePositionParams,
} from "@/model/geography/terrain/caves/types"
import { MATH } from "@/model/shared/math/core"
import { HASH } from "@/model/shared/random/hash"

const C = CAVE_CONFIG

const types: readonly CaveType[] = [
	"solution",
	"sinkhole",
	"grotto",
	"lava",
	"sea",
	"talus",
	"glacier",
]

const typeCode = Object.fromEntries(
	types.map((type, i) => [type, i]),
) as Record<CaveType, number>

function potentials({
	isLand,
	karst,
	spring,
	rock,
	volcano,
	shoreLabel,
	exposureOpenM,
	topography,
	slopeScore,
	iceThickness,
	warmest,
}: CavePotentialsParams): Float32Array[] {
	const solution = karst.potential
	return [
		solution,
		SINKHOLE_CAVE.potential({ kind: karst.kind, water: karst.water }),
		GROTTO_CAVE.potential({ kind: karst.kind, solution, spring }),
		LAVA_CAVE.potential({ rock, volcano }),
		SEA_CAVE.potential({ label: shoreLabel, exposureOpenM }),
		TALUS_CAVE.potential({ topography, slopeScore, rock }),
		GLACIER_CAVE.potential({ isLand, iceThickness, topography, warmest }),
	]
}

function passageM({ type, long, draw }: PassageLengthParams): number {
	const name = types[type]
	if (
		name === "sinkhole" ||
		name === "lava" ||
		name === "sea" ||
		name === "talus" ||
		name === "glacier"
	) {
		const [lo, hi] = C.fixedPassageM[name]
		return lo * (hi / lo) ** draw
	}
	if (name !== "grotto" && long)
		return Math.min(C.longMaxM, C.longCutM / (1 - draw) ** (1 / C.longAlpha))
	return C.shortMinM * (C.longCutM / C.shortMinM) ** (draw ** C.shortLean)
}

function position({
	mesh,
	region,
	neighbor,
	fraction,
	out,
}: SitePositionParams): void {
	const { r_xyz } = mesh
	const x = (1 - fraction) * r_xyz[3 * region] + fraction * r_xyz[3 * neighbor]
	const y =
		(1 - fraction) * r_xyz[3 * region + 1] + fraction * r_xyz[3 * neighbor + 1]
	const z =
		(1 - fraction) * r_xyz[3 * region + 2] + fraction * r_xyz[3 * neighbor + 2]
	const length = Math.hypot(x, y, z) || 1
	out.push(x / length, y / length, z / length)
}

function sites({
	mesh,
	seed,
	isLand,
	openWater,
	potentials: byType,
	long,
}: CaveSitesParams): GenesisCaveSites {
	const { adjOffset, adjList, numRegions } = mesh
	const seeds = types.map((type) => ({
		presence: HASH.keyed({ seed, key: `cave:${type}` }),
		pick: HASH.keyed({ seed, key: `cave:${type}:pick` }),
		offset: HASH.keyed({ seed, key: `cave:${type}:offset` }),
		length: HASH.keyed({ seed, key: `cave:${type}:length` }),
	}))
	const region: number[] = []
	const type: number[] = []
	const xyz: number[] = []
	const lengthM: number[] = []
	const candidates: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (!isLand[r]) continue
		for (let t = 0; t < types.length; t++) {
			const p = byType[t][r]
			if (p <= C.caveRange[0]) continue
			const chance =
				C.siteScale *
				C.typeWeight[types[t]] *
				MATH.ramp({ range: C.caveRange, x: p })
			const s = seeds[t]
			if (HASH.unit({ seed: s.presence, channel: r, salt: 0 }) >= chance)
				continue
			const sea = types[t] === "sea"
			candidates.length = 0
			for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
				const nb = adjList[k]
				if (sea ? openWater[nb] : isLand[nb]) candidates.push(nb)
			}
			const target =
				candidates.length === 0
					? r
					: candidates[
							Math.floor(
								HASH.unit({ seed: s.pick, channel: r, salt: 0 }) *
									candidates.length,
							)
						]
			const fraction = sea
				? C.seaOffset
				: C.landOffsetMax * HASH.unit({ seed: s.offset, channel: r, salt: 0 })
			region.push(r)
			type.push(t)
			position({ mesh, region: r, neighbor: target, fraction, out: xyz })
			lengthM.push(
				passageM({
					type: t,
					long: long[r] === 1,
					draw: HASH.unit({ seed: s.length, channel: r, salt: 0 }),
				}),
			)
		}
	}
	return {
		region: Int32Array.from(region),
		type: Uint8Array.from(type),
		xyz: Float32Array.from(xyz),
		lengthM: Float32Array.from(lengthM),
	}
}

export const CAVES = { types, typeCode, potentials, passageM, sites }

import { PASTA } from "@/model/climate/classification/pasta"
import { CRUST } from "@/model/geography/tectonics/crust"
import { HEIGHT_SCALE } from "@/model/geography/terrain/height-scale"
import { BASEMENT } from "@/model/geography/terrain/rocks/basement"
import { COVER_ROCK } from "@/model/geography/terrain/rocks/cover"
import { GLACIAL } from "@/model/geography/terrain/rocks/glacial"
import { LOESS } from "@/model/geography/terrain/rocks/loess"
import { RIVER_SEDIMENT } from "@/model/geography/terrain/rocks/river-sediment"
import { SAND_SEA } from "@/model/geography/terrain/rocks/sand-sea"
import type {
	BlurRecordParams,
	DespeckleParams,
	LandCellsParams,
	RockClassification,
	RockClassifyParams,
	RockInfo,
	RockKind,
	YoungKind,
} from "@/model/geography/terrain/rocks/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"

const C = SURFACE_CONFIG
const B = BASEMENT.kinds
const ICE = PASTA.pastaLabels.indexOf("CI")

const KINDS: readonly RockKind[] = [
	"sea",
	"young",
	"sandstone",
	"shale",
	"limestone",
	"salt",
	"basalt",
	"volcanic",
	"granite",
	"slate",
	"gneiss",
	"shield",
	"greenstone",
	"ophiolite",
]
const CODE = Object.fromEntries(
	KINDS.map((kind, code) => [kind, code]),
) as Record<RockKind, number>
const YOUNG_KINDS: readonly YoungKind[] = [
	"none",
	"river",
	"loess",
	"till",
	"erg",
]
const YOUNG_CODE = Object.fromEntries(
	YOUNG_KINDS.map((kind, code) => [kind, code]),
) as Record<YoungKind, number>

const INFO: Record<RockKind, RockInfo> = {
	sea: { name: "Sea", family: null },
	young: { name: "Young sediment", family: "young" },
	sandstone: { name: "Sandstone", family: "sedimentary" },
	shale: { name: "Shale & mudstone", family: "sedimentary" },
	limestone: { name: "Limestone", family: "sedimentary" },
	salt: { name: "Salt & gypsum", family: "sedimentary" },
	basalt: { name: "Basalt", family: "volcanic" },
	volcanic: { name: "Andesite & rhyolite", family: "volcanic" },
	granite: { name: "Granite", family: "plutonic" },
	slate: { name: "Slate & schist", family: "metamorphic" },
	gneiss: { name: "Gneiss", family: "metamorphic" },
	shield: { name: "Shield granite-gneiss", family: "metamorphic" },
	greenstone: { name: "Greenstone", family: "metamorphic" },
	ophiolite: { name: "Ophiolite & mélange", family: "plutonic" },
}

const SALT = {
	contact: 0x2c1b4d,
	facies: 0x3f7a11,
}

function blurSim({ simMesh, land, fields, strides }: BlurRecordParams): void {
	const { adjOffset, adjList, numRegions: n } = simMesh.mesh
	fields.forEach((field, f) => {
		const stride = strides[f]
		const was = field.slice()
		for (let c = 0; c < n; c++) {
			if (!land[c]) continue
			let count = 1
			for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++)
				if (land[adjList[k]]) count += C.recordBlurNeighbour
			for (let s = 0; s < stride; s++) {
				let sum = was[stride * c + s]
				for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
					const nb = adjList[k]
					if (land[nb]) sum += C.recordBlurNeighbour * was[stride * nb + s]
				}
				field[stride * c + s] = sum / count
			}
		}
	})
}

function landCells({ simMesh, land }: LandCellsParams): Int32Array {
	const { adjOffset, adjList, numRegions: n } = simMesh.mesh
	const out = new Int32Array(n).fill(-1)
	for (let c = 0; c < n; c++) {
		if (land[c]) {
			out[c] = c
			continue
		}
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++)
			if (land[adjList[k]]) {
				out[c] = adjList[k]
				break
			}
	}
	return out
}

function despeckle({ mesh, rock, youngKind, eligible }: DespeckleParams): void {
	const { adjOffset, adjList, numRegions: n } = mesh
	const was = rock.slice()
	const wasYoung = youngKind.slice()
	const tally = new Uint16Array(KINDS.length)
	const youngTally = new Uint16Array(YOUNG_KINDS.length)
	for (let r = 0; r < n; r++) {
		if (!eligible[r] || wasYoung[r]) continue
		let best = 0
		let votes = 0
		let all = 0
		for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
			const nb = adjList[k]
			const kind = was[nb]
			if (!kind) continue
			all++
			tally[kind]++
			if (tally[kind] > votes) {
				votes = tally[kind]
				best = kind
			}
			if (kind === CODE.young) youngTally[wasYoung[nb]]++
		}
		let tag = 0
		if (best === CODE.young)
			for (let t = 1; t < YOUNG_KINDS.length; t++)
				if (youngTally[t] > youngTally[tag]) tag = t
		for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
			tally[was[adjList[k]]] = 0
			youngTally[wasYoung[adjList[k]]] = 0
		}
		if (
			best > 0 &&
			best !== was[r] &&
			votes >= Math.max(C.despeckleMinVotes, Math.ceil(C.despeckleShare * all))
		) {
			rock[r] = best
			youngKind[r] = tag
		}
	}
}

function classify({
	mesh,
	planetRadiusKm,
	seed,
	crust,
	oldLip,
	simMesh,
	sample,
	isLand,
	elevation,
	elevationKm,
	maxElevKm,
	maxDepthKm,
	discharge,
	erosion,
	koppen,
	pasta,
	windU,
	windV,
	temperatureAvg,
}: RockClassifyParams): RockClassification {
	const n = mesh.numRegions
	const toKm = (field: Float32Array) =>
		Float32Array.from(field, (delta, r) =>
			HEIGHT_SCALE.elevDeltaKm({
				elev: elevation[r],
				delta,
				maxElevKm,
				maxDepthKm,
			}),
		)
	const till = GLACIAL.till({
		mesh,
		planetRadiusKm,
		isLand,
		glaciated: erosion.glaciated,
		pastIce: erosion.pastIce,
		morainesKm: toKm(erosion.morainesElev),
	})
	const river = RIVER_SEDIMENT.mask({
		mesh,
		planetRadiusKm,
		isLand,
		sedimentKm: toKm(erosion.sedimentElev),
		discharge,
		elevationKm,
	}).river
	const erg = SAND_SEA.extent({
		mesh,
		planetRadiusKm,
		isLand,
		koppen,
		elevationKm,
	})
	const loess = LOESS.thickness({
		simMesh,
		sample,
		mesh,
		planetRadiusKm,
		isLand,
		koppen,
		till,
		windU,
		windV,
		temperatureAvg,
		elevationKm,
	})
	const basement = BASEMENT.scores({ crust, seed })
	const scores = basement.score
	const shieldCore = Uint8Array.from({ length: crust.numCells }, (_, c) =>
		scores[BASEMENT.count * c + B.shield] > 0 ? 1 : 0,
	)
	const cover = Float32Array.from(crust.coverKm)
	const carb = Float32Array.from(crust.coverCarb)
	const salt = Float32Array.from(crust.coverSalt)
	const organic = Float32Array.from(crust.coverOrganic)
	const marine = Float32Array.from(crust.geoFlags, (flags) =>
		flags & (CRUST.GEO.SHELF | CRUST.GEO.EPEIRIC) ? 1 : 0,
	)
	const lava = Float32Array.from(basement.lavaCap, (cap, c) =>
		oldLip.age[c] > 0
			? Math.max(cap, 1 - C.oldLipWearShown * oldLip.worn[c])
			: cap,
	)
	blurSim({
		simMesh,
		land: basement.land,
		fields: [scores, cover, carb, salt, organic, marine, lava],
		strides: [BASEMENT.count, 1, 1, 1, 1, 1, 1],
	})
	const landCellOf = landCells({ simMesh, land: basement.land })
	const noise = new SimplexNoise((seed ^ SALT.contact) >>> 0)
	const facies = new SimplexNoise((seed ^ SALT.facies) >>> 0)
	const R = planetRadiusKm
	const { r_xyz } = mesh
	const rock = new Uint8Array(n)
	const youngKind = new Uint8Array(n)
	const score = new Float64Array(KINDS.length)
	const wave = (x: number, y: number, z: number, km: number, off: number) => {
		const f = R / km
		return noise.noise3D(x * f + off, y * f + 2 * off, z * f + 3 * off)
	}
	const contact = (x: number, y: number, z: number, off: number) =>
		wave(x, y, z, C.contactKm, off) +
		C.contactFineGain * wave(x, y, z, C.contactKm / 2, off + 1.7)
	const iced = Uint8Array.from(pasta, (zone, r) =>
		erosion.glaciated[r] === 1 || zone === ICE ? 1 : 0,
	)
	const eligible = Uint8Array.from(isLand, (land, r) =>
		land && !iced[r] ? 1 : 0,
	)
	const patchFreq = R / C.patchKm
	const domeFreq = R / C.domeKm
	const faciesFreq = R / C.faciesKm
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		const w = landCellOf[sample.cellOfRegion[r]]
		if (w < 0) {
			rock[r] = CODE.young
			youngKind[r] = iced[r] ? YOUNG_CODE.till : YOUNG_CODE.river
			continue
		}
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]
		score.fill(0)
		if (
			COVER_ROCK.shown({
				coverKm: cover[w],
				heightKm: elevationKm[r],
				glaciated: erosion.glaciated[r] === 1,
			})
		) {
			const draw = MATH.smoothstep({
				edge0: -0.5,
				edge1: 0.5,
				x:
					facies.noise3D(
						x * faciesFreq + 7.3,
						y * faciesFreq + 4.9,
						z * faciesFreq + 4.1,
					) +
					0.35 *
						facies.noise3D(
							x * faciesFreq * 3.1 + 2.2,
							y * faciesFreq * 3.1 + 5.5,
							z * faciesFreq * 3.1 + 1.1,
						),
			})
			const kind = COVER_ROCK.kind({
				facies: {
					carb: carb[w],
					salt: salt[w],
					organic: organic[w],
					marine: marine[w],
				},
				draw,
			})
			score[CODE[kind]] = 1
		} else {
			const b = BASEMENT.count * w
			const nA = contact(x, y, z, 11.1)
			const nB = contact(x, y, z, 23.7)
			const plutons =
				noise.noise3D(
					x * patchFreq * 0.8 + 5.5,
					y * patchFreq * 0.8 + 2.2,
					z * patchFreq * 0.8 + 8.8,
				) +
				0.25 * nB
			const granite = Math.max(0, scores[b + B.granite])
			const volcanic = Math.max(0, scores[b + B.volcanic])
			const slate = Math.max(0, scores[b + B.slate])
			const gneiss = Math.max(0, scores[b + B.gneiss])
			const pluton =
				granite > 0.02
					? MATH.smoothstep({
							edge0: -0.15,
							edge1: 0.25,
							x: plutons + (granite - 0.4),
						})
					: 0
			const others = slate + gneiss + volcanic
			score[CODE.granite] = pluton * Math.max(granite, 0.5 * (granite + others))
			const rest = 1 - pluton * 0.85
			score[CODE.slate] = slate * rest * Math.exp(0.6 * nA)
			score[CODE.gneiss] = gneiss * rest * Math.exp(-0.6 * nA)
			score[CODE.volcanic] = volcanic * rest * Math.exp(0.6 * nB)
			score[CODE.basalt] =
				Math.max(0, scores[b + B.basalt]) * Math.exp(0.4 * nA)
			score[CODE.ophiolite] =
				Math.max(0, scores[b + B.ophiolite]) * Math.exp(0.4 * nB)
			const suture = basement.suture[w]
			if (suture > 0.01) {
				const ridge =
					1 -
					Math.abs(
						noise.noise3D(
							x * patchFreq * 0.6 + 1.4,
							y * patchFreq * 0.6 + 6.6,
							z * patchFreq * 0.6 + 3.3,
						) +
							0.3 * nA,
					)
				score[CODE.ophiolite] +=
					suture * 2 * MATH.smoothstep({ edge0: 0.82, edge1: 0.95, x: ridge })
			}
			const shield = Math.max(0, scores[b + B.shield])
			if (shield > 0.02 && shieldCore[w]) {
				const keel =
					1 -
					Math.abs(
						noise.noise3D(
							x * domeFreq,
							y * domeFreq + 4.4,
							z * domeFreq + 8.2,
						) +
							0.5 *
								noise.noise3D(
									x * domeFreq * 2.1 + 1.1,
									y * domeFreq * 2.1,
									z * domeFreq * 2.1 + 3.7,
								),
					)
				const share = basement.greenShare[w]
				const g = MATH.smoothstep({
					edge0: 1 - share - 0.06,
					edge1: 1 - share + 0.06,
					x: keel + 0.1 * nA,
				})
				score[CODE.greenstone] = shield * g
				score[CODE.shield] = shield * (1 - g)
			}
		}
		const riverScore = iced[r] ? 0 : river[r]
		const loessScore = iced[r]
			? 0
			: MATH.ramp({
					range: C.loessShow,
					x: loess[r] / C.loessKm,
				})
		const tillScore = MATH.ramp({ range: C.tillShow, x: till[r] })
		const ergScore = MATH.ramp({ range: C.ergShow, x: erg[r] })
		const young = Math.max(riverScore, ergScore, loessScore, tillScore)
		score[CODE.young] = C.youngGain * young
		score[CODE.basalt] = Math.max(
			score[CODE.basalt],
			C.lavaCapGain * MATH.ramp({ range: C.lavaShow, x: lava[w] }),
		)
		let best = CODE.slate
		let bestScore = -1
		for (let k = 1; k < KINDS.length; k++)
			if (score[k] > bestScore) {
				bestScore = score[k]
				best = k
			}
		rock[r] = best
		if (best === CODE.young)
			youngKind[r] =
				young === riverScore
					? YOUNG_CODE.river
					: young === ergScore
						? YOUNG_CODE.erg
						: young === loessScore
							? YOUNG_CODE.loess
							: YOUNG_CODE.till
	}
	for (let pass = 0; pass < C.despecklePasses; pass++)
		despeckle({ mesh, rock, youngKind, eligible })
	const glaciated = Uint8Array.from(
		erosion.glaciated,
		(ice, r) => ice & isLand[r],
	)
	const rising = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		const w = landCellOf[sample.cellOfRegion[r]]
		if (w >= 0) rising[r] = basement.rising[w]
	}
	return { rock, youngKind, glaciated, rising }
}

export const ROCKS = {
	kinds: KINDS,
	code: CODE,
	youngKinds: YOUNG_KINDS,
	youngCode: YOUNG_CODE,
	info: INFO,
	classify,
}

import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { CLIMATE_TESTS } from "@/model/geography/terrain/deposits/climate-tests"
import { COMMODITIES } from "@/model/geography/terrain/deposits/commodities"
import { DISTRICTS } from "@/model/geography/terrain/deposits/districts"
import { GRAIN } from "@/model/geography/terrain/deposits/grain"
import { GROUND } from "@/model/geography/terrain/deposits/ground"
import { HOSTS } from "@/model/geography/terrain/deposits/hosts"
import { PLACERS } from "@/model/geography/terrain/deposits/placers"
import { RECORD } from "@/model/geography/terrain/deposits/record"
import type { RecordFields } from "@/model/geography/terrain/deposits/record/types"
import { SCENE } from "@/model/geography/terrain/deposits/scene"
import type {
	Here,
	PlacerSources,
	Scene,
	SceneFields,
} from "@/model/geography/terrain/deposits/scene/types"
import { SETTINGS } from "@/model/geography/terrain/deposits/settings"
import { SURFACE } from "@/model/geography/terrain/deposits/surface"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import type { SystemId } from "@/model/geography/terrain/deposits/systems/types"
import type {
	DepositsParams,
	EdgePassesParams,
	GenesisDeposits,
	GridDegreesParams,
	PlacersParams,
	RegionCellsParams,
	SceneFieldsParams,
} from "@/model/geography/terrain/deposits/types"
import { DRAINAGE } from "@/model/geography/terrain/drainage"
import { LAKES } from "@/model/geography/terrain/lakes"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { BASEMENT } from "@/model/geography/terrain/rocks/basement"
import { MATH } from "@/model/shared/math/core"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { SPREAD } from "@/model/shared/spread"

const C = DEPOSIT_CONFIG
const S = C.shapes
const NEIGHBOUR = 0.5
const SALT = { spot: 0x3d, spotGain: 0x6c8b }
const GEM_RECORD = [
	"pegmatite",
	"marble",
	"hotspot",
	"lip",
	"foldShale",
] as const satisfies readonly (keyof RecordFields)[]
const BELT = { from: 0.1, to: 0.6 }
const CRATON_WEIGHT = { from: 0.15, to: 0.6 }
const AXIS_WEIGHT = { from: 0.05, to: 0.3 }
const CRATON_MIN = 0.1
const AXIS_MIN = 0.05
const BELT_MIN_W = 0.05

function gridDegrees({
	numRegions,
	planetRadiusKm,
}: GridDegreesParams): number {
	const edgeKm = Math.sqrt((4 * Math.PI * planetRadiusKm ** 2) / numRegions)
	return (
		S.gridDegrees.find(
			(deg) => deg * S.kmPerDegree >= S.gridEdgeFactor * edgeKm,
		) ?? S.gridDegrees[S.gridDegrees.length - 1]
	)
}

function edgePasses({ numCells, planetRadiusKm }: EdgePassesParams): number {
	const edgeKm = Math.sqrt((4 * Math.PI * planetRadiusKm ** 2) / numCells)
	return Math.max(1, Math.round(C.craton.edgeKm / edgeKm))
}

function regionCells({
	mesh,
	simMesh,
	sample,
	land,
}: RegionCellsParams): Int32Array {
	const landCellOf = SPREAD.nearestLand({ mesh: simMesh.mesh, land })
	return Int32Array.from(
		{ length: mesh.numRegions },
		(_, r) => landCellOf[sample.cellOfRegion[r]],
	)
}

function sceneFields({
	record,
	grain,
	land,
	numCells,
	passes,
	mesh,
}: SceneFieldsParams): SceneFields {
	const edge = SPREAD.neighbourAverage({
		mesh,
		field: record.craton,
		include: land,
		passes,
	})
	const anyRecord = new Float32Array(numCells)
	const anyGem = new Float32Array(numCells)
	for (const key of Object.keys(record) as (keyof RecordFields)[]) {
		if (
			key === "craton" ||
			key === "shale" ||
			key === "coverNow" ||
			key === "shelfOil" ||
			key === "shelfGas"
		)
			continue
		const gem = (GEM_RECORD as readonly string[]).includes(key)
		const into = gem ? anyGem : anyRecord
		const field = record[key]
		for (let c = 0; c < numCells; c++)
			if (field[c] > into[c]) into[c] = field[c]
	}
	return { record, ...grain, edge, anyRecord, anyGem }
}

function compute(params: DepositsParams): GenesisDeposits {
	const {
		mesh,
		seed,
		planetRadiusKm: R,
		crust,
		simMesh,
		sample,
		isLand,
	} = params
	const n = mesh.numRegions
	const basement = BASEMENT.scores({ crust, seed })
	const rockCode = ROCKS.code
	const granite = Float32Array.from({ length: crust.numCells }, (_, c) =>
		Math.max(0, basement.score[BASEMENT.count * c + BASEMENT.kinds.granite]),
	)
	const record = RECORD.potential({ crust, seed, granite })
	const grain = GRAIN.fields({ crust, seed })
	SPREAD.blurRecord({
		mesh: simMesh.mesh,
		land: basement.land,
		fields: [...Object.values(record), ...Object.values(grain)],
		strides: [
			...Object.values(record).map(() => 1),
			...Object.values(grain).map(() => 1),
		],
		neighbour: NEIGHBOUR,
	})
	const fields = sceneFields({
		record,
		grain,
		land: basement.land,
		numCells: crust.numCells,
		passes: edgePasses({ numCells: crust.numCells, planetRadiusKm: R }),
		mesh: simMesh.mesh,
	})
	const cellOf = regionCells({ mesh, simMesh, sample, land: basement.land })
	const ground = GROUND.compute({
		mesh,
		planetRadiusKm: R,
		elevationKm: params.elevationKm,
		isLand,
	})
	const tests = CLIMATE_TESTS.compute({
		numRegions: n,
		temperatureMonthly: params.temperatureMonthly,
		rainfallMonthly: params.rainfallMonthly,
		isLand,
	})
	const shapes = DISTRICTS.create({
		seed,
		systems: DISTRICTS.systems(),
		gridDeg: gridDegrees({ numRegions: n, planetRadiusKm: R }),
		radiusKm: R,
	})
	const noise = new SimplexNoise(
		(Math.imul(seed, SALT.spotGain) + SALT.spot) >>> 0,
	)
	const sources: PlacerSources = {
		gold: new Float32Array(n),
		tin: new Float32Array(n),
		diamond: new Float32Array(n),
		gem: new Float32Array(n),
	}
	const scene: Scene = {
		mesh,
		numRegions: n,
		rows: new Uint8Array(SYSTEMS.count * n),
		scale: Float32Array.from(
			SYSTEMS.list,
			(s) => (C.scale as Partial<Record<string, number>>)[s.id] ?? 1,
		),
		stretch: Float32Array.from(
			SYSTEMS.list,
			(s) => (C.gradeStretch as Partial<Record<string, number>>)[s.id] ?? 1,
		),
		shapes,
		spot: {
			noise: (x, y, z) => noise.noise3D(x, y, z),
			kimberliteFreq: R / C.kimberliteFieldKm,
			reefFreq: R / C.reefKm,
		},
		fields,
		hosts: HOSTS.tables,
		tests,
		ground,
		rock: params.rock,
		youngKind: params.youngKind,
		glaciated: params.glaciated,
		lakeKind: params.lakeKind,
		sand: params.sand,
		coastal: params.coastal,
		sources,
	}
	const here: Here = SCENE.blank()
	const { r_xyz } = mesh
	for (let r = 0; r < n; r++) {
		const land = isLand[r] === 1
		const w = cellOf[r]
		if (!land) {
			SURFACE.lake({ scene, region: r })
			if (w < 0 || !(params.elevationKm[r] > C.shelfKm)) continue
			if (!(record.shelfOil[w] > 0 || record.shelfGas[w] > 0)) continue
		}
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]
		const beltW = w >= 0 ? fields.beltW[w] : 0
		const wB = MATH.smoothstep({ edge0: BELT.from, edge1: BELT.to, x: beltW })
		const psiB = wB > 0 ? fields.acrossKm[w] / Math.max(BELT_MIN_W, beltW) : 0
		let wC = 0
		let psiC = 0
		const craton = w >= 0 ? record.craton[w] : 0
		if (craton > CRATON_MIN) {
			const ax = fields.axisX[w]
			const ay = fields.axisY[w]
			const az = fields.axisZ[w]
			const length = Math.hypot(ax, ay, az)
			if (length > AXIS_MIN) {
				wC =
					MATH.smoothstep({
						edge0: CRATON_WEIGHT.from,
						edge1: CRATON_WEIGHT.to,
						x: craton,
					}) *
					(1 - wB) *
					MATH.smoothstep({
						edge0: AXIS_WEIGHT.from,
						edge1: AXIS_WEIGHT.to,
						x: length,
					})
				psiC = (R * (x * ax + y * ay + z * az)) / length
			}
		}
		shapes.cell({ x, y, z, psiB, wB, psiC, wC })
		const rock = params.rock[r]
		const young = rock === rockCode.young
		const kind = params.youngKind[r]
		SCENE.begin({
			here,
			region: r,
			cell: w,
			rock,
			young,
			erg: young && kind === ROCKS.youngCode.erg,
			till: young && kind === ROCKS.youngCode.till,
			glaciated: params.glaciated[r] === 1,
		})
		if (!land) {
			SETTINGS.shelf({ scene, here })
			continue
		}
		SETTINGS.place({ scene, here })
		SURFACE.place({ scene, here })
	}
	placers({ scene, params })
	const landRegions = isLand.reduce((sum, v) => sum + v, 0)
	return {
		rows: scene.rows,
		shares: COMMODITIES.shares({
			rows: scene.rows,
			numRegions: n,
			land: isLand,
		}),
		landRegions,
	}
}

function placers({ scene, params }: PlacersParams): void {
	const { mesh, isLand, planetRadiusKm } = params
	const n = mesh.numRegions
	const pans = Uint8Array.from(params.lakeKind, (kind, r) =>
		isLand[r] && kind === LAKES.kindCode.pan ? 1 : 0,
	)
	const { drainTarget, processOrder } = DRAINAGE.order({
		mesh,
		elevation: params.elevationKm,
		isLand,
		sinks: pans,
	})
	const carry = (source: Float32Array, lengthKm: number) =>
		PLACERS.carry({
			mesh,
			planetRadiusKm,
			isLand,
			drainTarget,
			processOrder,
			source,
			lengthKm,
		})
	const { sources } = scene
	const gold = carry(sources.gold, C.placerKm.gold)
	const tin = carry(sources.tin, C.placerKm.tin)
	const diamond = carry(sources.diamond, C.placerKm.diamond)
	const gem = carry(sources.gem, C.placerKm.gem)
	const youngCode = ROCKS.youngCode
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		const glaciated = params.glaciated[r] === 1
		const till =
			params.rock[r] === ROCKS.code.young &&
			params.youngKind[r] === youngCode.till
		const k = PLACERS.factor({
			discharge: params.flow[r],
			rough: scene.ground.rough[r],
			glaciated,
			till,
		})
		if (!(k > 0)) continue
		const put = (system: SystemId, v: number) =>
			SCENE.put({ scene, region: r, system, value: v * k })
		put("placerGold", gold[r])
		put("placerTin", tin[r])
		put("placerDiamond", diamond[r])
		put("gemPlacer", gem[r])
	}
}

export const DEPOSITS = { compute }

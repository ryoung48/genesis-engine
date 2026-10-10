import { DISTRIBUTION_ENGINE } from "@/model/history/distribution/engine"
import type { DistributionEngine } from "@/model/history/distribution/engine/types"
import { DISTRIBUTION_MIGRATION } from "@/model/history/distribution/migration"
import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"
import type { Territory } from "@/model/history/distribution/territory/types"
import { PROCEDURAL_RECORD } from "@/model/history/record/procedural"
import type { GenesisProvinces } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type {
	EngineFixtureParams,
	FixtureParams,
	GroupsParams,
} from "@/test/history-run/fixtures/distribution/types"

function world({
	neighbors,
	desolate,
	seed,
}: FixtureParams): SerializedGenesisWorld {
	const count = neighbors.length,
		adjOffset = new Int32Array(count + 1),
		adjList = Int32Array.from(neighbors.flat())
	for (let i = 0; i < count; i++)
		adjOffset[i + 1] = adjOffset[i] + neighbors[i].length
	const indices = Int32Array.from({ length: count }, (_, i) => i)
	const provinces: GenesisProvinces = {
		count,
		seeds: indices,
		regionProvince: indices,
		desolate: Uint8Array.from({ length: count }, (_, i) =>
			desolate.includes(i) ? 1 : 0,
		),
		landmassId: new Int32Array(count),
		adjOffset,
		adjList,
		size: new Int32Array(count).fill(1),
		areaKm2: new Float32Array(count).fill(1),
		colors: new Float32Array(count * 3),
		waterAccess: new Uint8Array(count),
		riverAccess: new Uint8Array(count),
		lakeAccess: new Uint8Array(count),
	}
	const r_xyz = Float32Array.from({ length: count * 3 }, (_, i) => {
		const angle = Math.floor(i / 3) * 0.02
		return i % 3 === 0 ? Math.cos(angle) : i % 3 === 1 ? Math.sin(angle) : 0
	})
	const migrationWave = Float32Array.from(
		{ length: count },
		(_, i) => i / Math.max(1, count),
	)
	const nations = DISTRIBUTION_TERRITORY.emptyNations({ provinces })
	const mesh = {
		r_xyz,
		numRegions: count,
		adjOffset,
		adjList,
		regionArea: new Float32Array(count).fill(1),
	}
	const historyMigration = {
		pipeline: "distribution",
		data: DISTRIBUTION_MIGRATION.compute({
			provinces,
			habitability: new Float32Array(count).fill(1),
			mesh,
			ocean: new Uint8Array(count),
			planetRadiusKm: 6371,
			seed,
		}),
	}
	return {
		params: { seed, planetRadiusKm: 6371, historyPipeline: "distribution" },
		provinces,
		nations,
		mesh,
		historyMigration,
		population: { migrationWave },
	} as unknown as SerializedGenesisWorld
}

function territory({ world: w, groups }: GroupsParams): Territory {
	if (!w.provinces) throw new Error("Missing fixture")
	const t = DISTRIBUTION_TERRITORY.initialize({
		provinces: w.provinces,
		r_xyz: w.mesh.r_xyz,
	})
	for (let p = 0; p < t.owner.length; p++)
		if (!w.provinces.desolate[p]) t.owner[p] = DISTRIBUTION_STATUS.stateless
	for (const group of groups) {
		const country = DISTRIBUTION_TERRITORY.found({
			territory: t,
			province: group[0],
		})
		for (const province of group.slice(1))
			DISTRIBUTION_TERRITORY.claim({ territory: t, country, province })
	}
	return t
}

function engine({
	world: w,
	groups,
	year,
}: EngineFixtureParams): DistributionEngine {
	const e = DISTRIBUTION_ENGINE.create({ world: w })
	e.territory = territory({ world: w, groups })
	e.settlement.cursor = e.settlement.order.length
	e.settlement.capacities = [...e.territory.capacities]
	e.settlement.newlySettled = new Int32Array(0)
	e.year = year
	const { record } = e.history
	for (const [p, log] of record.events.provinceEvents) {
		log.base.ownerId = e.territory.owner[p]
		log.base.controllerId = e.territory.owner[p]
	}
	for (const c of e.territory.countries.values()) {
		record.nations[c.id] = {
			id: c.id,
			name: `Country ${c.id}`,
			color: PROCEDURAL_RECORD.successorNationColor({ id: c.id }),
			birthTimeMs: record.minTimeMs,
			deathTimeMs: -1,
			isRebel: false,
			tag: null,
		}
		record.events.nationEvents[c.id] = {
			base: {
				capitalProvinceId: c.capital,
				initialGovernment: "",
				reforms: [],
			},
			events: [],
		}
	}
	return e
}

export const DISTRIBUTION_FIXTURE = { world, territory, engine }

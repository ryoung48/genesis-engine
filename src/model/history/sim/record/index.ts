import type { LonLat } from "@/model/history/earth/types"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import type {
	HistoryRecord,
	HistoryState,
	NationEventLog,
	NationIdentity,
	OrganizationEventRecord,
	ProvinceEventLog,
	ProvinceMap,
	ProvinceMeta,
	TitleBase,
} from "@/model/history/record/types"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import type { BuildProceduralStateParams } from "@/model/history/sim/record/types"
import type { PartitionRow } from "@/model/history/world-frame/types"
import { ERAS } from "@/model/society/eras"
import { NAMES } from "@/model/society/language/names"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

function scale255(value: number): number {
	return Math.round(Math.max(0, Math.min(1, value)) * 255)
}

function partitionColor(params: {
	colors: Float32Array
	id: number
}): readonly [number, number, number] {
	const offset = params.id * 3
	return [
		scale255(params.colors[offset] ?? 0),
		scale255(params.colors[offset + 1] ?? 0),
		scale255(params.colors[offset + 2] ?? 0),
	]
}

// The pastel softening applied to raw generator nation colours, baked into
// NationFrame.color so the shared history render path stays raw for Earth
// while procedural nations keep their softer look.
const PASTEL_MIX = 0.52
function pastelNationColor(params: {
	colors: Float32Array
	id: number
}): readonly [number, number, number] {
	const offset = params.id * 3
	return [0, 1, 2].map((component) => {
		const raw = Math.max(0, Math.min(1, params.colors[offset + component] ?? 0))
		return scale255(raw + (1 - raw) * PASTEL_MIX)
	}) as unknown as [number, number, number]
}

function identityProvinceMap(provinceCount: number): ProvinceMap {
	const compactToRealId = new Int32Array(provinceCount)
	const realIdToCompact = new Map<string, number>()
	for (let province = 0; province < provinceCount; province++) {
		compactToRealId[province] = province
		realIdToCompact.set(String(province), province)
	}
	return { compactToRealId, realIdToCompact }
}

function buildProceduralRecord(
	params: BuildProceduralStateParams,
): HistoryRecord {
	const { world, startTimeMs } = params
	const recordStartTimeMs = TRANSLATOR.recordTime(startTimeMs)
	const provinceCount = world.provinces?.count ?? 0
	const { nations, cultures, religions } = world
	const names = NAMES.createWorldNames(world)

	// `key` is a stable join handle for the hook's colour/name side-maps
	// (mirrors the Earth path, where PartitionRow.key joins to reference data).
	const cultureRows: PartitionRow[] = cultures
		? Array.from({ length: cultures.count }, (_, id) => ({
				id,
				key: `culture-${id}`,
				name: names.culture(id),
				color: partitionColor({ colors: cultures.colors, id }),
			}))
		: []

	const religionRows: PartitionRow[] = religions
		? Array.from({ length: religions.count }, (_, id) => ({
				id,
				key: `religion-${id}`,
				name: names.religion(id),
				color: partitionColor({ colors: religions.colors, id }),
			}))
		: []

	// nation id == raw partition index; a province's nation is its SOVEREIGN,
	// found by mapping the sovereign-root province back to its nation index.
	const nationIdByCapital = new Map<number, number>()
	if (nations) {
		for (let id = 0; id < nations.seeds.length; id++) {
			nationIdByCapital.set(nations.seeds[id], id)
		}
	}

	const provinceNation = new Int32Array(provinceCount).fill(-1)
	const provinceCulture = new Int32Array(provinceCount).fill(-1)
	const provinceReligion = new Int32Array(provinceCount).fill(-1)
	for (let province = 0; province < provinceCount; province++) {
		if (nations) {
			const sovereign = nations.sovereign[province] ?? -1
			provinceNation[province] =
				sovereign >= 0 ? (nationIdByCapital.get(sovereign) ?? -1) : -1
		}
		const culture = cultures ? (cultures.assignment[province] ?? -1) : -1
		provinceCulture[province] = culture
		provinceReligion[province] =
			culture >= 0 && religions ? (religions.assignment[culture] ?? -1) : -1
	}
	const provinceCultureBlendSecondary =
		cultures?.blendSecondary?.slice() ?? new Int32Array(provinceCount).fill(-1)

	const nationEvents: NationEventLog[] = []
	const nationIdentities: NationIdentity[] = []
	if (nations) {
		for (let id = 0; id < nations.seeds.length; id++) {
			const capital = nations.seeds[id] ?? -1
			const governmentType =
				capital >= 0 ? (nations.governmentType?.[capital] ?? 0) : 0
			nationEvents.push({
				base: {
					capitalProvinceId: capital,
					initialGovernment: ERAS.governmentTypes[governmentType] ?? "",
					reforms: [],
				},
				events: [],
			})
			nationIdentities.push({
				id,
				name: names.nation(capital),
				color: pastelNationColor({ colors: nations.colors, id }),
				birthTimeMs: recordStartTimeMs,
				deathTimeMs: -1,
				isRebel: false,
				tag: null,
			})
		}
	}

	const provinceEvents = new Map<number, ProvinceEventLog>()
	for (let province = 0; province < provinceCount; province++) {
		provinceEvents.set(province, {
			base: {
				ownerId: provinceNation[province],
				controllerId: provinceNation[province],
				parentId: nations?.parent[province] ?? -1,
				cultureId: provinceCulture[province],
				cultureBlendSecondaryId: provinceCultureBlendSecondary[province],
				religionId: provinceReligion[province],
				inHolyRomanEmpire: false,
			},
			events: [],
		})
	}
	const baseTitles: TitleBase | null = nations
		? {
				count: nations.titles.count,
				tier: nations.titles.tier.slice(),
				seat: nations.titles.seat.slice(),
				holder: nations.titles.holder.map(
					(root) => nationIdByCapital.get(root) ?? -1,
				),
				regionOf: nations.titles.regionOf.slice(),
			}
		: null
	const organizationEvents: OrganizationEventRecord[] = []
	for (const organization of nations?.organizations ?? []) {
		for (const member of organization.members) {
			organizationEvents.push({
				timeMs: recordStartTimeMs,
				nationId: member.nationIndex,
				kind: "join",
				payload: { orgId: organization.id, role: member.title },
			})
		}
		const capital = nations?.seeds[organization.leadNationIndex] ?? -1
		if (capital >= 0)
			organizationEvents.push({
				timeMs: recordStartTimeMs,
				provinceId: capital,
				kind: "siteStart",
				payload: {
					orgId: organization.id,
					name: organization.id,
					role: "capital",
				},
			})
	}
	return {
		origin: "procedural",
		people: PEOPLE_RECORD.create(),
		minTimeMs: recordStartTimeMs,
		maxTimeMs: recordStartTimeMs,
		nations: nationIdentities,
		cultures: cultureRows,
		religions: religionRows,
		events: {
			provinceEvents,
			nationEvents,
			wars: [],
			diplomacy: [],
			organizationEvents,
			censuses: [],
			titleEvents: [],
			raids: [],
		},
		titles: baseTitles,
	}
}

function provinceLonLat({
	world,
	province,
}: {
	world: SerializedGenesisWorld
	province: number
}): LonLat {
	const region = world.provinces?.seeds[province] ?? -1
	if (region < 0) return { lon: 0, lat: 0 }
	const { r_xyz } = world.mesh
	const x = r_xyz[region * 3]
	const y = r_xyz[region * 3 + 1]
	const z = r_xyz[region * 3 + 2]
	return {
		lon: (Math.atan2(y, x) * 180) / Math.PI,
		lat:
			(Math.asin(Math.max(-1, Math.min(1, z / (Math.hypot(x, y, z) || 1)))) *
				180) /
			Math.PI,
	}
}

function buildProceduralState(
	params: BuildProceduralStateParams,
): HistoryState {
	const { world } = params
	const provinceCount = world.provinces?.count ?? 0
	const names = NAMES.createWorldNames(world)
	return {
		record: buildProceduralRecord(params),
		frameCache: new Map(),
		provinceMap: identityProvinceMap(provinceCount),
		provinceMeta: Array.from(
			{ length: provinceCount },
			(_, province): ProvinceMeta => ({
				name: names.province(province),
				wasteland: false,
				area: null,
				region: null,
				superregion: null,
			}),
		),
		provinceCoords: Array.from({ length: provinceCount }, (_, province) =>
			provinceLonLat({ world, province }),
		),
	}
}

export const SIM_RECORD = {
	buildProceduralRecord,
	buildProceduralState,
	createTranslator: TRANSLATOR.createTranslator,
	appendJournal: TRANSLATOR.appendJournal,
}

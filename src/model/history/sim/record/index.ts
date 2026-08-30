import type { LonLat } from "@/model/history/earth/types"
import type {
	HistoryRecord,
	HistoryState,
	NationIdentity,
	ProceduralNationInit,
	ProvinceMap,
	ProvinceMeta,
} from "@/model/history/record/types"
import type { BuildProceduralStateParams } from "@/model/history/sim/record/types"
import type { PartitionRow } from "@/model/history/world-frame/types"
import { ERAS } from "@/model/society/eras"
import { NAMES } from "@/model/society/language/names"

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

// The pastel softening the procedural UI applies to raw generator nation
// colours (toPastelNationColor, ui/genesis/shared/region-colors/palette.ts).
// Baked into NationFrame.color here, and mirrored on the wiki swatch
// (buildDisplayNationModel), so the shared history render path stays raw for
// Earth while procedural nations keep their softer look on both.
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

	// nation id == raw partition index; a province's nation is its SOVEREIGN
	// (matching the procedural display convention -- see buildDisplayWorld),
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

	const nationInits: ProceduralNationInit[] = []
	const nationIdentities: NationIdentity[] = []
	if (nations) {
		for (let id = 0; id < nations.seeds.length; id++) {
			const capital = nations.seeds[id] ?? -1
			const governmentType =
				capital >= 0 ? (nations.governmentType?.[capital] ?? 0) : 0
			nationInits.push({
				id,
				capitalProvince: capital,
				// The concrete GovernmentType string; the unified history
				// government palette (GOVERNMENT.getEarthHistoryGovernmentColor)
				// resolves it directly.
				government: ERAS.governmentTypes[governmentType] ?? "",
				governmentReform: "",
			})
			nationIdentities.push({
				id,
				name: names.nation(capital),
				color: pastelNationColor({ colors: nations.colors, id }),
				birthTimeMs: startTimeMs,
				deathTimeMs: -1,
				isRebel: false,
				tag: null,
			})
		}
	}

	return {
		origin: "procedural",
		minTimeMs: startTimeMs,
		maxTimeMs: startTimeMs,
		nations: nationIdentities,
		cultures: cultureRows,
		religions: religionRows,
		timeline: {
			initial: {
				provinceCount,
				provinceNation,
				provinceCulture,
				provinceReligion,
				provinceCultureBlendSecondary,
				provincePopulation: new Float32Array(provinceCount),
				provincePopulationUrban: new Float32Array(provinceCount),
				provinceDevelopment: new Float32Array(provinceCount),
				nations: nationInits,
			},
		},
	}
}

function buildProceduralState(
	params: BuildProceduralStateParams,
): HistoryState {
	const provinceCount = params.world.provinces?.count ?? 0
	const zeroCoords: LonLat[] = Array.from({ length: provinceCount }, () => ({
		lon: 0,
		lat: 0,
	}))
	return {
		record: buildProceduralRecord(params),
		frameCache: new Map(),
		provinceMap: identityProvinceMap(provinceCount),
		provinceMeta: Array.from(
			{ length: provinceCount },
			(): ProvinceMeta => ({
				name: null,
				wasteland: false,
				area: null,
				region: null,
				superregion: null,
			}),
		),
		provinceCoords: params.provinceCoords ?? zeroCoords,
	}
}

export const SIM_RECORD = {
	buildProceduralRecord,
	buildProceduralState,
}

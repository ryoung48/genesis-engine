import { DATA_SOURCE } from "@/model/history/earth/data-source"
import { EU4_PROVINCE_MAP } from "@/model/history/earth/import/eu4-province-map"
import { NATIONS } from "@/model/history/earth/reference/nations"
import type {
	BuildEarthRecordParams,
	CreateHistoryStateParams,
	FrameAtParams,
	HistoryEvents,
	HistoryRecord,
	HistoryState,
	LoadEarthStateParams,
	LoadedEarthState,
	NationEventLog,
	OrganizationEventRecord,
	ProvinceEventLog,
} from "@/model/history/record/types"
import { FRAME } from "@/model/history/world-frame"
import type {
	NationFrame,
	OrganizationFrame,
	PartitionRow,
	WarFrame,
	WorldFrame,
} from "@/model/history/world-frame/types"

const MS_PER_DAY = 86_400_000

function buildEarthRecord(params: BuildEarthRecordParams): HistoryRecord {
	const cultures = params.cultures
	const religions = params.religions
	const cultureIdByKey = new Map(cultures.map((row) => [row.key, row.id]))
	const religionIdByKey = new Map(religions.map((row) => [row.key, row.id]))
	const timeMs = (days: number) => days * MS_PER_DAY
	// Per-nation ownership span, accumulated while walking province events below.
	const bornMs = new Map<number, number>()
	const lastLostMs = new Map<number, number>()
	const ownsAtEnd = new Set<number>()
	const provinceEvents = new Map<number, ProvinceEventLog>()
	const nationEvents: (NationEventLog | undefined)[] = []
	let minTimeMs = Infinity
	let maxTimeMs = -Infinity
	const consider = (days: number) => {
		const value = timeMs(days)
		minTimeMs = Math.min(minTimeMs, value)
		maxTimeMs = Math.max(maxTimeMs, value)
	}
	const nationId = (tag: string | null | undefined) =>
		tag == null ? -1 : (params.idByTag.get(tag) ?? -1)
	const provinceId = (rawId: string | null | undefined) =>
		rawId == null || rawId === "" ? -1 : Number(rawId)
	for (const [rawId, entry] of Object.entries(params.provinceEvents)) {
		const id = Number(rawId)
		const baseOwnerId = nationId(entry.base.owner)
		const log: ProvinceEventLog = {
			base: {
				ownerId: baseOwnerId,
				parentId: -1,
				controllerId: nationId(entry.base.controller),
				cultureId: entry.base.culture
					? (cultureIdByKey.get(entry.base.culture) ?? -1)
					: -1,
				cultureBlendSecondaryId: -1,
				religionId: entry.base.religion
					? (religionIdByKey.get(entry.base.religion) ?? -1)
					: -1,
				inHolyRomanEmpire: entry.base.hre ?? false,
			},
			events: entry.events
				.map((event) => {
					consider(event.date)
					let payload = event.payload
					if (
						event.kind === "owner" ||
						event.kind === "controller" ||
						event.kind === "coreAdd" ||
						event.kind === "coreRemove"
					) {
						payload = {
							...event.payload,
							nationId: nationId(event.payload.tag as string | undefined),
						}
					} else if (event.kind === "culture") {
						const key = event.payload.cultureId as string | undefined
						payload = {
							...event.payload,
							cultureId: key ? (cultureIdByKey.get(key) ?? -1) : -1,
						}
					} else if (event.kind === "religion") {
						const key = event.payload.religionId as string | undefined
						payload = {
							...event.payload,
							religionId: key ? (religionIdByKey.get(key) ?? -1) : -1,
						}
					}
					return {
						...event,
						payload,
						comment: event.comment ?? null,
						timeMs: timeMs(event.date),
					}
				})
				.sort((a, b) => a.timeMs - b.timeMs),
		}
		provinceEvents.set(id, log)
		// Walk this province's ownership chain to feed nation birth/death.
		let owner = baseOwnerId
		if (owner >= 0 && !bornMs.has(owner)) bornMs.set(owner, 0)
		for (const event of log.events) {
			if (event.kind !== "owner") continue
			const next = (event.payload.nationId as number | null) ?? -1
			if (owner >= 0)
				lastLostMs.set(
					owner,
					Math.max(lastLostMs.get(owner) ?? 0, event.timeMs),
				)
			if (next >= 0) {
				bornMs.set(next, Math.min(bornMs.get(next) ?? Infinity, event.timeMs))
			}
			owner = next
		}
		if (owner >= 0) ownsAtEnd.add(owner)
	}
	for (const [tag, entry] of Object.entries(params.nationEvents)) {
		const id = params.idByTag.get(tag)
		if (id === undefined) continue
		nationEvents[id] = {
			base: {
				reforms: entry.base.reforms,
				capitalProvinceId: provinceId(entry.base.capital),
				initialGovernment: params.nations[id]?.governmentType ?? "",
			},
			events: entry.events
				.map((event) => {
					consider(event.date)
					const payload =
						event.kind === "capitalChange"
							? {
									...event.payload,
									provinceId: provinceId(
										event.payload.provinceId as string | undefined,
									),
								}
							: event.payload
					return {
						...event,
						payload,
						comment: event.comment ?? null,
						timeMs: timeMs(event.date),
					}
				})
				.sort((a, b) => a.timeMs - b.timeMs),
		}
	}
	const events: HistoryEvents = {
		provinceEvents,
		nationEvents,
		wars: params.wars.map((war, id) => ({
			id,
			name: war.name,
			casusBelli: war.casusBelli,
			warGoalType: war.warGoalType,
			warGoalId: nationId(war.warGoalTag),
			warGoalProvinceId: provinceId(war.warGoalProvince),
			rebel: war.isRebel,
			events: war.events
				.flatMap((event) => {
					const eventNationId = params.idByTag.get(event.nationTag)
					if (eventNationId === undefined) return []
					consider(event.date)
					return [
						{
							...event,
							nationId: eventNationId,
							comment: event.comment ?? null,
							timeMs: timeMs(event.date),
						},
					]
				})
				.sort((a, b) => a.timeMs - b.timeMs),
			battles: war.battles.map((battle) => ({
				...battle,
				comment: battle.comment ?? null,
				locationProvinceId: provinceId(battle.locationProvinceId),
				timeMs: timeMs(battle.date),
				attacker: {
					...battle.attacker,
					countryId: nationId(battle.attacker.country),
					wealthCost: null as number | null,
				},
				defender: {
					...battle.defender,
					countryId: nationId(battle.defender.country),
					wealthCost: null as number | null,
				},
			})),
		})),
		diplomacy: params.diplomacy
			.flatMap((event) => {
				const firstId = params.idByTag.get(event.payload.firstTag)
				const secondId = params.idByTag.get(event.payload.secondTag)
				if (firstId === undefined || secondId === undefined) return []
				consider(event.date)
				return [
					{
						timeMs: timeMs(event.date),
						kind: event.kind,
						firstId,
						secondId,
						subjectType: event.payload.subjectType ?? null,
					},
				]
			})
			.sort((a, b) => a.timeMs - b.timeMs),
		organizationEvents: params.organizationEvents
			.reduce<OrganizationEventRecord[]>((events, event) => {
				if (event.kind === "join" || event.kind === "leave") {
					const eventNationId = params.idByTag.get(event.nationTag)
					if (eventNationId === undefined) return events
					consider(event.date)
					events.push({
						timeMs: timeMs(event.date),
						nationId: eventNationId,
						kind: event.kind,
						payload: {
							orgId: event.payload.orgId,
							role: event.payload.role ?? null,
						},
					})
					return events
				}
				if (!("provinceId" in event)) return events
				consider(event.date)
				events.push({
					timeMs: timeMs(event.date),
					provinceId: Number(event.provinceId),
					kind: event.kind,
					payload: {
						orgId: event.payload.orgId,
						name: event.payload.name,
						role: event.payload.role,
					},
				})
				return events
			}, [])
			.sort((a, b) => a.timeMs - b.timeMs),
		censuses: [],
	}
	const resolvedMinMs = minTimeMs === Infinity ? 0 : minTimeMs
	return {
		origin: "earth",
		minTimeMs: resolvedMinMs,
		maxTimeMs: maxTimeMs === -Infinity ? 0 : maxTimeMs,
		nations: params.nations.map((nation) => ({
			id: nation.id,
			name: nation.name,
			color: nation.color,
			birthTimeMs: bornMs.has(nation.id)
				? Math.max(bornMs.get(nation.id) as number, resolvedMinMs)
				: resolvedMinMs,
			deathTimeMs: ownsAtEnd.has(nation.id)
				? -1
				: (lastLostMs.get(nation.id) ?? -1),
			isRebel: nation.isRebel,
			tag: nation.tag,
		})),
		cultures,
		religions,
		events,
	}
}

function createState(params: CreateHistoryStateParams): HistoryState {
	return { ...params, frameCache: new Map() }
}

async function loadEarthState({
	provinces,
}: LoadEarthStateParams): Promise<LoadedEarthState | null> {
	const provinceMap = EU4_PROVINCE_MAP.buildEu4ProvinceMap(provinces)
	if (!provinceMap) return null
	const [
		provinceEvents,
		nationEvents,
		wars,
		diplomacy,
		organizationEvents,
		provinceCoords,
		nationReferenceRows,
		geography,
		heritages,
		religionGroups,
	] = await Promise.all([
		DATA_SOURCE.loadProvinceEvents(),
		DATA_SOURCE.loadNationEvents(),
		DATA_SOURCE.loadWars(),
		DATA_SOURCE.loadDiplomacyEvents(),
		DATA_SOURCE.loadOrganizationEvents(),
		DATA_SOURCE.loadProvinceCoordinates(),
		DATA_SOURCE.loadNationReference(),
		DATA_SOURCE.loadGeography(),
		DATA_SOURCE.loadHeritages(),
		DATA_SOURCE.loadReligionGroups(),
	])
	const nationReference = new Map(
		nationReferenceRows.map((nation) => [nation.tag, nation]),
	)
	const { nations, idByTag } = NATIONS.build({
		provinceEvents,
		nationEvents,
		wars,
		diplomacy,
		organizationEvents,
		nationReference,
	})
	const cultures: PartitionRow[] = heritages
		.flatMap((heritage) => heritage.cultures)
		.map((culture, id) => ({
			id,
			key: culture.id,
			name: culture.name,
			color: culture.color ?? [128, 128, 128],
		}))
	const religions: PartitionRow[] = religionGroups
		.flatMap((group) => group.religions)
		.map((religion, id) => ({
			id,
			key: religion.id,
			name: religion.name,
			color: religion.color,
		}))
	const record = buildEarthRecord({
		provinceEvents,
		nationEvents,
		wars,
		diplomacy,
		organizationEvents,
		nations,
		idByTag,
		cultures,
		religions,
	})
	const provinceMeta = Array.from(provinceMap.compactToRealId, (rawId) => {
		const province = provinceEvents[String(rawId)]
		const geo = geography[String(rawId)]
		return {
			name: province?.base.name ?? null,
			wasteland: province?.base.wasteland ?? false,
			area: geo?.area ?? null,
			region: geo?.region ?? null,
			superregion: geo?.superregion ?? null,
		}
	})
	const compactProvinceCoords = Array.from(
		provinceMap.compactToRealId,
		(rawId) => provinceCoords.get(String(rawId)) ?? { lon: 0, lat: 0 },
	)
	return {
		state: createState({
			record,
			provinceMap,
			provinceMeta,
			provinceCoords: compactProvinceCoords,
		}),
	}
}

interface NationCapitalAnchorParams {
	capitalRaw: number
	nationId: number
	provinceMap: HistoryState["provinceMap"]
	provinceNation: Int32Array
	owned: number[]
	provinceCoords: HistoryState["provinceCoords"]
}

// The province the nation's label anchors to: its real capital when it currently
// owns that province, otherwise the owned province nearest the centroid of all
// its owned provinces, otherwise the first owned, otherwise -1 (no label).
function nationCapitalAnchor({
	capitalRaw,
	nationId,
	provinceMap,
	provinceNation,
	owned,
	provinceCoords,
}: NationCapitalAnchorParams): number {
	const capitalCompact =
		capitalRaw < 0
			? -1
			: (provinceMap.realIdToCompact.get(String(capitalRaw)) ?? -1)
	if (capitalCompact >= 0 && provinceNation[capitalCompact] === nationId)
		return capitalCompact
	if (owned.length <= 1) return owned[0] ?? -1

	let sx = 0
	let sy = 0
	let sz = 0
	let counted = 0
	for (const province of owned) {
		const coord = provinceCoords[province]
		if (!coord || (coord.lon === 0 && coord.lat === 0)) continue
		const lon = (coord.lon * Math.PI) / 180
		const lat = (coord.lat * Math.PI) / 180
		const cosLat = Math.cos(lat)
		sx += cosLat * Math.cos(lon)
		sy += cosLat * Math.sin(lon)
		sz += Math.sin(lat)
		counted++
	}
	if (counted === 0) return owned[0]
	const len = Math.hypot(sx, sy, sz) || 1
	const cx = sx / len
	const cy = sy / len
	const cz = sz / len
	let best = owned[0]
	let bestDist = Number.POSITIVE_INFINITY
	for (const province of owned) {
		const coord = provinceCoords[province]
		if (!coord || (coord.lon === 0 && coord.lat === 0)) continue
		const lon = (coord.lon * Math.PI) / 180
		const lat = (coord.lat * Math.PI) / 180
		const cosLat = Math.cos(lat)
		const dx = cosLat * Math.cos(lon) - cx
		const dy = cosLat * Math.sin(lon) - cy
		const dz = Math.sin(lat) - cz
		const dist = dx * dx + dy * dy + dz * dz
		if (dist < bestDist) {
			bestDist = dist
			best = province
		}
	}
	return best
}

function buildFrame({ state, timeMs }: FrameAtParams): WorldFrame {
	const { record, provinceMap } = state
	const count = provinceMap.compactToRealId.length
	const provinceNation = new Int32Array(count).fill(-1)
	const provinceParent = new Int32Array(count).fill(-1)
	const provinceController = new Int32Array(count).fill(-1)
	const provinceCulture = new Int32Array(count).fill(-1)
	const provinceReligion = new Int32Array(count).fill(-1)
	const provinceCultureBlendSecondary = new Int32Array(count).fill(-1)
	const provinceHre = new Uint8Array(count)
	for (let province = 0; province < count; province++) {
		const rawId = provinceMap.compactToRealId[province]
		const log = record.events.provinceEvents.get(rawId)
		if (!log) continue
		let nation = log.base.ownerId
		let parent = log.base.parentId
		let controller = log.base.controllerId
		let culture = log.base.cultureId
		let religion = log.base.religionId
		let hre = log.base.inHolyRomanEmpire
		for (const event of log.events) {
			if (event.timeMs > timeMs) break
			if (event.kind === "owner")
				nation = (event.payload.nationId as number | null) ?? -1
			else if (event.kind === "parent")
				parent = (event.payload.parentId as number | null) ?? -1
			else if (event.kind === "controller")
				controller = (event.payload.nationId as number | null) ?? -1
			else if (event.kind === "culture")
				culture = event.payload.cultureId as number
			else if (event.kind === "religion")
				religion = event.payload.religionId as number
			else if (event.kind === "hre") hre = event.payload.member as boolean
		}
		provinceNation[province] = nation
		provinceParent[province] = parent
		provinceController[province] = controller
		provinceCulture[province] = culture
		provinceCultureBlendSecondary[province] = log.base.cultureBlendSecondaryId
		provinceReligion[province] = religion
		provinceHre[province] = hre ? 1 : 0
	}

	// Only nations that actually hold or contest territory at this instant get a
	// frame row (and therefore a map label). A landless-but-historical tag stays
	// resolvable by name via record.nations; the wiki bridges fall back to it.
	const ownedByNation = new Map<number, number[]>()
	const present = new Set<number>()
	for (let province = 0; province < count; province++) {
		const owner = provinceNation[province]
		if (owner >= 0) {
			present.add(owner)
			let owned = ownedByNation.get(owner)
			if (!owned) ownedByNation.set(owner, (owned = []))
			owned.push(province)
		}
		const controller = provinceController[province]
		if (controller >= 0) present.add(controller)
	}

	const nations = new Map<number, NationFrame>()
	for (const identity of record.nations) {
		if (!present.has(identity.id)) continue
		const log = record.events.nationEvents[identity.id]
		let name = identity.name
		let government = log?.base.initialGovernment ?? ""
		let governmentReform =
			log?.base.reforms.findLast(
				(reform) => !/^early_gov_reform_\d+$/.test(reform),
			) ?? ""
		let capitalRaw = log?.base.capitalProvinceId ?? -1
		let ruler: NationFrame["ruler"] = null
		let isElector = false
		for (const event of log?.events ?? []) {
			if (event.timeMs > timeMs) break
			if (event.kind === "nameChange") name = event.payload.name as string
			else if (event.kind === "governmentChange")
				government = event.payload.governmentType as string
			else if (
				event.kind === "governmentReformAdd" &&
				!/^early_gov_reform_\d+$/.test(event.payload.reformId as string)
			)
				governmentReform = event.payload.reformId as string
			else if (
				event.kind === "governmentReformRemove" &&
				governmentReform === event.payload.reformId
			)
				governmentReform = ""
			else if (event.kind === "capitalChange")
				capitalRaw = (event.payload.provinceId as number | null) ?? -1
			else if (event.kind === "rulerChange")
				ruler = {
					name: event.payload.name as string,
					dynasty: (event.payload.dynasty as string | undefined) ?? null,
				}
			else if (event.kind === "elector")
				isElector = event.payload.elector as boolean
		}
		const capitalProvince = nationCapitalAnchor({
			capitalRaw,
			nationId: identity.id,
			provinceMap,
			provinceNation,
			owned: ownedByNation.get(identity.id) ?? [],
			provinceCoords: state.provinceCoords,
		})
		nations.set(identity.id, {
			id: identity.id,
			name,
			color: identity.color,
			capitalProvince,
			government,
			governmentReform,
			ruler,
			birthTimeMs: identity.birthTimeMs,
			deathTimeMs: identity.deathTimeMs,
			relations: FRAME.emptyRelations(),
			wealth: 0,
			optimalWealth: 0,
			isEmperor: false,
			isElector,
			organizations: [],
		})
	}
	for (const event of record.events.diplomacy) {
		if (event.timeMs > timeMs) break
		const first = nations.get(event.firstId)
		const second = nations.get(event.secondId)
		if (!first || !second) continue
		if (event.kind === "allianceStart") {
			first.relations.allies.push(second.id)
			second.relations.allies.push(first.id)
		} else if (event.kind === "allianceEnd") {
			first.relations.allies = first.relations.allies.filter(
				(id) => id !== second.id,
			)
			second.relations.allies = second.relations.allies.filter(
				(id) => id !== first.id,
			)
		} else if (event.kind === "rivalStart") {
			first.relations.rivals.push(second.id)
			second.relations.rivals.push(first.id)
		} else if (event.kind === "rivalEnd") {
			first.relations.rivals = first.relations.rivals.filter(
				(id) => id !== second.id,
			)
			second.relations.rivals = second.relations.rivals.filter(
				(id) => id !== first.id,
			)
		} else if (
			event.kind === "vassalStart" ||
			event.kind === "dependencyStart"
		) {
			first.relations.vassals.push(second.id)
			first.relations.vassalSubjectTypes.push({
				nationId: second.id,
				subjectType:
					event.subjectType ??
					(event.kind === "vassalStart" ? "vassal" : "subject"),
			})
			second.relations.overlord = first.id
		} else if (event.kind === "vassalEnd" || event.kind === "dependencyEnd") {
			first.relations.vassals = first.relations.vassals.filter(
				(id) => id !== second.id,
			)
			first.relations.vassalSubjectTypes =
				first.relations.vassalSubjectTypes.filter(
					(entry) => entry.nationId !== second.id,
				)
			if (second.relations.overlord === first.id) second.relations.overlord = -1
		} else if (event.kind === "guaranteeStart") {
			first.relations.guarantees.push(second.id)
		} else if (event.kind === "guaranteeEnd") {
			first.relations.guarantees = first.relations.guarantees.filter(
				(id) => id !== second.id,
			)
		} else if (event.kind === "royalMarriageStart") {
			first.relations.royalMarriages.push(second.id)
			second.relations.royalMarriages.push(first.id)
		} else if (event.kind === "royalMarriageEnd") {
			first.relations.royalMarriages = first.relations.royalMarriages.filter(
				(id) => id !== second.id,
			)
			second.relations.royalMarriages = second.relations.royalMarriages.filter(
				(id) => id !== first.id,
			)
		} else if (event.kind === "unionStart") {
			// firstId is always the senior/ruling partner (raw diplomacy.json convention)
			first.relations.unionSeniorOf.push(second.id)
			second.relations.unionJuniorPartner = first.id
		} else if (event.kind === "unionEnd") {
			first.relations.unionSeniorOf = first.relations.unionSeniorOf.filter(
				(id) => id !== second.id,
			)
			if (second.relations.unionJuniorPartner === first.id)
				second.relations.unionJuniorPartner = -1
		} else if (event.kind === "emperorStart") first.isEmperor = true
		else if (event.kind === "emperorEnd") first.isEmperor = false
	}
	for (const event of record.events.organizationEvents) {
		if (
			event.timeMs > timeMs ||
			(event.kind !== "join" && event.kind !== "leave")
		)
			continue
		const nation = nations.get(event.nationId)
		if (!nation) continue
		if (event.kind === "join")
			nation.organizations.push({
				orgId: event.payload.orgId,
				role: event.payload.role ?? "member",
			})
		else
			nation.organizations = nation.organizations.filter(
				(organization) => organization.orgId !== event.payload.orgId,
			)
	}
	const organizations: OrganizationFrame[] = []
	for (const event of record.events.organizationEvents) {
		if (
			event.timeMs > timeMs ||
			(event.kind !== "siteStart" && event.kind !== "siteEnd")
		)
			continue
		const province = provinceMap.realIdToCompact.get(String(event.provinceId))
		if (province === undefined) continue
		const index = organizations.findIndex(
			(site) =>
				site.orgId === event.payload.orgId &&
				site.role === event.payload.role &&
				site.province === province,
		)
		if (event.kind === "siteStart" && index < 0)
			organizations.push({
				orgId: event.payload.orgId,
				role: event.payload.role,
				province,
			})
		else if (event.kind === "siteEnd" && index >= 0)
			organizations.splice(index, 1)
	}
	const wars: WarFrame[] = record.events.wars.flatMap((war) => {
		const attackers = new Set<number>()
		const defenders = new Set<number>()
		for (const event of war.events) {
			if (event.timeMs > timeMs) break
			const side = event.side === "attacker" ? attackers : defenders
			if (event.kind === "warStart") side.add(event.nationId)
			else side.delete(event.nationId)
		}
		if (attackers.size === 0 || defenders.size === 0) return []
		const occupiedProvinces: number[] = []
		for (let province = 0; province < count; province++)
			if (
				defenders.has(provinceNation[province]) &&
				attackers.has(provinceController[province])
			)
				occupiedProvinces.push(province)
		return [
			{
				id: war.id,
				name: war.name,
				rebel: war.rebel,
				attackers: [...attackers],
				defenders: [...defenders],
				occupiedProvinces,
			},
		]
	})
	const census = record.events.censuses.findLast(
		(entry) => entry.timeMs <= timeMs,
	)
	const provincePopulation = census?.rural.slice() ?? new Float32Array(count)
	const provincePopulationUrban =
		census?.urban.slice() ?? new Float32Array(count)
	const provinceDevelopment =
		census?.development.slice() ?? new Float32Array(count)
	let totalPopulation = 0
	for (let province = 0; province < count; province++)
		totalPopulation +=
			provincePopulation[province] + provincePopulationUrban[province]
	return {
		timeMs,
		provinceCount: count,
		provinceNation,
		provinceParent,
		provinceController,
		provinceCulture,
		provinceReligion,
		provinceCultureBlendSecondary,
		provinceHre,
		provincePopulation,
		provincePopulationUrban,
		provinceDevelopment,
		nations,
		wars,
		organizations,
		cultures: record.cultures,
		religions: record.religions,
		nationCount: nations.size,
		totalPopulation,
	}
}

// Memoise every built frame by exact timeMs. Scrubbing revisits the same
// handful of dates (the slider steps by a fixed increment), so this turns
// "rebuild on every tick" into "build once per distinct date". Bounded LRU so
// a long session doesn't accumulate frames without limit.
const FRAME_CACHE_LIMIT = 48

function frameAt({ state, timeMs }: FrameAtParams): WorldFrame {
	const cached = state.frameCache.get(timeMs)
	if (cached) {
		// refresh LRU position
		state.frameCache.delete(timeMs)
		state.frameCache.set(timeMs, cached)
		return cached
	}
	const frame = buildFrame({ state, timeMs })
	state.frameCache.set(timeMs, frame)
	if (state.frameCache.size > FRAME_CACHE_LIMIT) {
		const oldest = state.frameCache.keys().next().value
		if (oldest !== undefined) state.frameCache.delete(oldest)
	}
	return frame
}

export const HISTORY = {
	buildEarthRecord,
	createState,
	loadEarthState,
	frameAt,
}

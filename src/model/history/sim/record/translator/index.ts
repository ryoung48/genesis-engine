import { DATE } from "@/model/history/earth/date"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import type {
	HistoryEvent,
	NationIdentity,
	WarRecord,
} from "@/model/history/record/types"
import { COLORING } from "@/model/history/sim/nations/coloring"
import type {
	ActiveTie,
	AppendJournalParams,
	AppendNoteParams,
	ApplyTransactionParams,
	CreateTranslatorParams,
	DescendantsParams,
	IdentityForRootParams,
	PersonNameParams,
	ProceduralTranslator,
	ProjectTieParams,
	RebelNoteReasons,
	RebelWar,
	RebelWarOfParams,
	ScanRebelNotesParams,
	UpdateTiesParams,
} from "@/model/history/sim/record/translator/types"
import { ERAS } from "@/model/society/eras"
import { NAMES } from "@/model/society/language/names"

const YEAR_MS = 365 * 86_400_000

function recordTime(engineTimeMs: number): number {
	return engineTimeMs - DATE.earthHistoryStartYear * YEAR_MS
}

function descendants({ children, province }: DescendantsParams): number[] {
	const result: number[] = []
	const stack = [province]
	while (stack.length > 0) {
		const current = stack.pop() as number
		result.push(current)
		for (const child of children[current]) stack.push(child)
	}
	return result
}

function rootOf({
	translator,
	province,
}: {
	translator: ProceduralTranslator
	province: number
}): number {
	let current = province
	while (translator.parent[current] >= 0) current = translator.parent[current]
	return current
}

function rebelWarOf({ translator, root }: RebelWarOfParams): RebelWar | null {
	for (const war of translator.rebelWars.values())
		if (war.defenderRoot === root && translator.parent[war.attackerRoot] < 0)
			return war
	return null
}

function nationLabel({
	translator,
	root,
}: {
	translator: ProceduralTranslator
	root: number
}): string {
	const id = translator.identityByRoot.get(root)
	return id === undefined
		? translator.names.nation(root)
		: (translator.state.record.nations[id]?.name ??
				translator.names.nation(root))
}

function personName({ translator, person }: PersonNameParams): string | null {
	return translator.state.record.people?.persons.get(person)?.name ?? null
}

// Registers and retires rebel wars from this transaction's notes before any
// ownership is derived, and collects the reason text the record attaches to
// each revolt and each rebel-war outcome.
function scanRebelNotes({
	translator,
	transaction,
}: ScanRebelNotesParams): RebelNoteReasons {
	const reasons: RebelNoteReasons = {
		revolts: new Map(),
		outcomes: new Map(),
		touchedRoots: new Set(),
	}
	for (const note of transaction.notes) {
		if (note.tag === "rebellion" || note.tag === "province released") {
			const cause =
				note.tag === "province released"
					? "disconnected"
					: note.data.restoration
						? "restoration"
						: note.data.succession
							? "succession"
							: "threat"
			const pretender = personName({
				translator,
				person: (note.data.pretender as number | undefined) ?? -1,
			})
			reasons.revolts.set(
				note.data.subject as number,
				`Revolted against ${nationLabel({ translator, root: note.data.overlord as number })} (${cause}${pretender ? `, for ${pretender}` : ""})`,
			)
		} else if (note.tag === "war started") {
			const warId = note.data.war as number
			const coalition = transaction.coalitions.find(
				(entry) => entry.warId === warId,
			)
			if (!coalition?.rebel) continue
			translator.rebelWars.set(warId, {
				attackerRoot: note.data.attacker as number,
				defenderRoot: note.data.defender as number,
			})
			reasons.touchedRoots.add(note.data.defender as number)
		} else if (note.tag === "war ended") {
			const warId = note.data.war as number
			const war = translator.rebelWars.get(warId)
			if (!war) continue
			const transferred = (note.data.transferred as number[]).length
			reasons.outcomes.set(
				war.defenderRoot,
				note.data.stalemate === undefined &&
					note.data.winner === note.data.attacker
					? "Rebels defeated"
					: transferred > 0
						? `Partial reconquest (${transferred} provinces)`
						: "Rebels held out",
			)
			reasons.touchedRoots.add(war.defenderRoot)
			translator.rebelWars.delete(warId)
		}
	}
	return reasons
}

function pastelColor(
	color: [number, number, number],
): readonly [number, number, number] {
	return color.map((value) =>
		Math.round(Math.max(0, Math.min(1, value + (1 - value) * 0.52)) * 255),
	) as [number, number, number]
}

function identityForRoot({
	translator,
	root,
	timeMs,
}: IdentityForRootParams): number {
	const existing = translator.identityByRoot.get(root)
	if (existing !== undefined) return existing
	const { world, state } = translator
	const colors = world.provinces?.colors
	const baseColor: [number, number, number] = colors
		? [colors[root * 3], colors[root * 3 + 1], colors[root * 3 + 2]]
		: [0.5, 0.5, 0.5]
	const neighbors = new Set<number>()
	const provinces = descendants({
		children: translator.children,
		province: root,
	})
	const adjacency = world.provinces
	if (adjacency) {
		for (const province of provinces) {
			for (
				let edge = adjacency.adjOffset[province];
				edge < adjacency.adjOffset[province + 1];
				edge++
			) {
				const otherId = translator.owner[adjacency.adjList[edge]]
				if (otherId >= 0) neighbors.add(otherId)
			}
		}
	}
	const rawColor = COLORING.nationColorFor({
		baseColor,
		neighborColors: [...neighbors]
			.map((id) => translator.rawColors[id])
			.filter((color) => color !== undefined),
	})
	const id = state.record.nations.length
	const identity: NationIdentity = {
		id,
		name: translator.names.nation(root),
		color: pastelColor(rawColor),
		birthTimeMs: timeMs,
		deathTimeMs: -1,
		isRebel: false,
		tag: null,
	}
	state.record.nations.push(identity)
	state.record.events.nationEvents[id] = {
		base: {
			reforms: [],
			capitalProvinceId: root,
			initialGovernment:
				ERAS.governmentTypes[world.nations?.governmentType?.[root] ?? 0] ?? "",
		},
		events: [],
	}
	translator.identityByRoot.set(root, id)
	translator.rawColors.push(rawColor)
	translator.ownedCount.push(0)
	return id
}

function holderId({ translator, root, timeMs }: IdentityForRootParams): number {
	return root < 0 ? -1 : identityForRoot({ translator, root, timeMs })
}

function projectTie({
	translator,
	x,
	y,
	value,
}: ProjectTieParams): ActiveTie | null {
	if (translator.parent[x] >= 0 || translator.parent[y] >= 0) return null
	const firstId = translator.owner[x]
	const secondId = translator.owner[y]
	if (firstId < 0 || secondId < 0 || firstId === secondId) return null
	if (value === 2) return { kind: "vassal", firstId, secondId }
	if (value === 11) return { kind: "colony", firstId, secondId }
	if (value === 4) return { kind: "union", firstId, secondId }
	if (value === 5 || value === 9) {
		return {
			kind: value === 5 ? "alliance" : "rival",
			firstId: Math.min(firstId, secondId),
			secondId: Math.max(firstId, secondId),
		}
	}
	return null
}

function diplomacyKind({
	tie,
	ending,
}: {
	tie: ActiveTie
	ending: boolean
}): string {
	const stem = tie.kind === "colony" ? "dependency" : tie.kind
	return `${stem}${ending ? "End" : "Start"}`
}

function updateTies({ translator, pairs, timeMs }: UpdateTiesParams): void {
	const { record } = translator.state
	const count = translator.parent.length
	for (const pair of pairs) {
		const x = Math.floor(pair / count)
		const y = pair % count
		const next =
			projectTie({
				translator,
				x,
				y,
				value: translator.relationCells.get(x * count + y) ?? 7,
			}) ??
			projectTie({
				translator,
				x: y,
				y: x,
				value: translator.relationCells.get(y * count + x) ?? 7,
			})
		const previous = translator.activeTies.get(pair)
		if (
			previous &&
			(!next ||
				previous.kind !== next.kind ||
				previous.firstId !== next.firstId ||
				previous.secondId !== next.secondId)
		) {
			record.events.diplomacy.push({
				timeMs,
				kind: diplomacyKind({ tie: previous, ending: true }),
				firstId: previous.firstId,
				secondId: previous.secondId,
				subjectType: previous.kind === "colony" ? "colony" : null,
			})
			translator.activeTies.delete(pair)
			// A marriage alliance also lapses if its alliance ends first.
			const marriage = translator.royalMarriages.get(pair)
			if (previous.kind === "alliance" && marriage) {
				record.events.diplomacy.push({
					timeMs,
					kind: "royalMarriageEnd",
					firstId: marriage.firstId,
					secondId: marriage.secondId,
					subjectType: null,
				})
				translator.royalMarriages.delete(pair)
			}
		}
		if (
			next &&
			(!previous ||
				previous.kind !== next.kind ||
				previous.firstId !== next.firstId ||
				previous.secondId !== next.secondId)
		) {
			record.events.diplomacy.push({
				timeMs,
				kind: diplomacyKind({ tie: next, ending: false }),
				firstId: next.firstId,
				secondId: next.secondId,
				subjectType: next.kind === "colony" ? "colony" : null,
			})
			translator.activeTies.set(pair, next)
		}
	}
}

function coalitionChange({
	translator,
	coalition,
	timeMs,
}: {
	translator: ProceduralTranslator
	coalition: NonNullable<AppendNoteParams["coalition"]>
	timeMs: number
}): void {
	const war = translator.state.record.events.wars[coalition.warId]
	if (!war) return
	const previous = translator.warCoalitions.get(coalition.warId) ?? {
		attackers: new Set<number>(),
		defenders: new Set<number>(),
	}
	const attackers = new Set(
		coalition.attackers.map((root) =>
			identityForRoot({ translator, root, timeMs }),
		),
	)
	const defenders = new Set(
		coalition.defenders.map((root) =>
			identityForRoot({ translator, root, timeMs }),
		),
	)
	for (const [side, current, next] of [
		["attacker", previous.attackers, attackers],
		["defender", previous.defenders, defenders],
	] as const) {
		for (const id of current)
			if (!next.has(id))
				war.events.push({
					timeMs,
					nationId: id,
					kind: "warEnd",
					side,
					comment: null,
				})
		for (const id of next)
			if (!current.has(id))
				war.events.push({
					timeMs,
					nationId: id,
					kind: "warStart",
					side,
					comment: null,
				})
	}
	translator.warCoalitions.set(coalition.warId, { attackers, defenders })
}

function appendNote({
	translator,
	note,
	timeMs,
	coalition,
}: AppendNoteParams): void {
	const { record } = translator.state
	const data = note.data
	if (note.tag === "war started") {
		const warId = data.war as number
		const attacker = identityForRoot({
			translator,
			root: data.attacker as number,
			timeMs,
		})
		const defender = identityForRoot({
			translator,
			root: data.defender as number,
			timeMs,
		})
		for (const [root, id] of [
			[data.attacker as number, attacker],
			[data.defender as number, defender],
		]) {
			for (const province of descendants({
				children: translator.children,
				province: root,
			})) {
				if (
					translator.world.provinces?.desolate[province] ||
					translator.stateless[province] ||
					translator.owner[province] >= 0
				)
					continue
				translator.owner[province] = id
				translator.controller[province] = id
				translator.ownedCount[id]++
				record.events.provinceEvents.get(province)?.events.push({
					timeMs,
					kind: "owner",
					payload: { nationId: id },
					comment: null,
				})
				if (translator.occupation[province] < 0)
					record.events.provinceEvents.get(province)?.events.push({
						timeMs,
						kind: "controller",
						payload: { nationId: id },
						comment: null,
					})
			}
		}
		let civilWar = false
		if (coalition?.rebel) {
			const areaByProvince =
				translator.world.provinces?.areaKm2 ?? translator.world.provinces?.size
			let overlordArea = 0
			for (let province = 0; province < translator.owner.length; province++) {
				if (translator.owner[province] === attacker)
					overlordArea += areaByProvince?.[province] ?? 0
			}
			let rebelArea = 0
			for (const province of descendants({
				children: translator.children,
				province: data.defender as number,
			})) {
				if (translator.owner[province] === attacker)
					rebelArea += areaByProvince?.[province] ?? 0
			}
			civilWar = overlordArea > 0 && rebelArea * 2 > overlordArea
		}
		const war: WarRecord = {
			id: warId,
			name: civilWar
				? `${record.nations[attacker]?.name ?? "Unknown"} Civil War`
				: coalition?.rebel
					? `Suppression of the ${record.nations[defender]?.name ?? "Unknown"} Revolt`
					: `${record.nations[attacker]?.name ?? "Unknown"}–${record.nations[defender]?.name ?? "Unknown"} War`,
			casusBelli: coalition?.rebel ? "rebellion" : "conquest",
			warGoalType: coalition?.rebel ? "rebellion" : "province",
			warGoalId: defender,
			warGoalProvinceId: data.defender as number,
			rebel: coalition?.rebel ?? false,
			events: [],
			battles: [],
		}
		record.events.wars[warId] = war
		if (coalition) coalitionChange({ translator, coalition, timeMs })
	} else if (note.tag === "battle") {
		const war = record.events.wars[data.war as number]
		if (!war) return
		if (coalition) coalitionChange({ translator, coalition, timeMs })
		const attackerId =
			translator.identityByRoot.get(data.attacker as number) ?? -1
		const defenderId =
			translator.identityByRoot.get(data.defender as number) ?? -1
		const province = data.province as number
		war.battles.push({
			timeMs,
			name: translator.names.province(province),
			locationProvinceId: province,
			attacker: {
				countryId: attackerId,
				commander: null,
				infantry: data.attackerArmy as number,
				cavalry: null,
				artillery: null,
				losses: data.attackerLosses as number,
			},
			defender: {
				countryId: defenderId,
				commander: null,
				infantry: data.defenderArmy as number,
				cavalry: null,
				artillery: null,
				losses: data.defenderLosses as number,
			},
			attackerDeployed: data.attackerDeployed as number,
			defenderDeployed: data.defenderDeployed as number,
			attackerWon: data.winner === data.attacker,
			comment: null,
		})
	} else if (note.tag === "raid") {
		record.events.raids.push({
			timeMs,
			raiderId: translator.identityByRoot.get(data.raider as number) ?? -1,
			victimId: translator.identityByRoot.get(data.victim as number) ?? -1,
			provinceId: data.province as number,
			success: data.success as boolean,
			loot: data.loot as number,
			raiderParty: data.raiderParty as number,
			response: data.response as number,
			raiderLosses: data.raiderLosses as number,
			victimLosses: data.victimLosses as number,
		})
	} else if (note.tag === "war ended") {
		const warId = data.war as number
		const war = record.events.wars[warId]
		if (!war) return
		const active = translator.warCoalitions.get(warId)
		if (active) {
			for (const id of active.attackers)
				war.events.push({
					timeMs,
					nationId: id,
					kind: "warEnd",
					side: "attacker",
					comment: (data.stalemate as string) ?? null,
				})
			for (const id of active.defenders)
				war.events.push({
					timeMs,
					nationId: id,
					kind: "warEnd",
					side: "defender",
					comment: (data.stalemate as string) ?? null,
				})
			translator.warCoalitions.delete(warId)
		}
	} else if (note.tag === "title passed") {
		record.events.titleEvents.push({
			timeMs,
			kind: "passed",
			title: data.title as number,
			from: holderId({ translator, root: data.from as number, timeMs }),
			to: holderId({ translator, root: data.to as number, timeMs }),
		})
	} else if (note.tag === "title created") {
		record.events.titleEvents.push({
			timeMs,
			kind: "created",
			title: data.title as number,
			tier: data.tier as number,
			seat: data.seat as number,
			holder: holderId({ translator, root: data.holder as number, timeMs }),
			children: data.children as number[],
			ancestors: data.ancestors as number[],
		})
	} else if (note.tag === "title destroyed") {
		record.events.titleEvents.push({
			timeMs,
			kind: "destroyed",
			title: data.title as number,
			children: data.children as number[],
			ancestors: data.ancestors as number[],
		})
	} else if (note.tag === "marriage alliance") {
		const firstId = translator.identityByRoot.get(data.first as number)
		const secondId = translator.identityByRoot.get(data.second as number)
		if (firstId === undefined || secondId === undefined) return
		const count = translator.parent.length
		const a = data.first as number
		const b = data.second as number
		const pair = Math.min(a, b) * count + Math.max(a, b)
		if (translator.royalMarriages.has(pair)) return
		translator.royalMarriages.set(pair, { firstId, secondId })
		record.events.diplomacy.push({
			timeMs,
			kind: "royalMarriageStart",
			firstId,
			secondId,
			subjectType: null,
			spouses: data.spouses as [number, number],
		})
	} else if (note.tag === "marriage alliance ended") {
		const count = translator.parent.length
		const a = data.first as number
		const b = data.second as number
		const pair = Math.min(a, b) * count + Math.max(a, b)
		const marriage = translator.royalMarriages.get(pair)
		if (!marriage) return
		translator.royalMarriages.delete(pair)
		record.events.diplomacy.push({
			timeMs,
			kind: "royalMarriageEnd",
			firstId: marriage.firstId,
			secondId: marriage.secondId,
			subjectType: null,
		})
	} else if (REGENCY_EVENTS[note.tag]) {
		const nationId = translator.identityByRoot.get(data.nation as number)
		if (nationId === undefined) return
		if (note.tag === "regency ended" && data.cause !== "age") return
		record.events.nationEvents[nationId]?.events.push({
			timeMs,
			kind: "regency",
			payload: {
				event: REGENCY_EVENTS[note.tag],
				ward: data.ward as number,
				regent: data.regent as number,
				regentKind: data.kind as string,
			},
			comment: null,
		})
	} else if (note.tag === "capital moved") {
		record.events.titleEvents.push({
			timeMs,
			kind: "moved",
			title: data.title as number,
			from: data.from as number,
			to: data.to as number,
			cause: data.cause as string,
		})
	}
}

// Engine notes that reach a nation's timeline as regency rows. Only a
// regency that ends with the child coming of age gets an end row: the
// other endings already show as a succession, a usurpation or a loss.
const REGENCY_EVENTS: Record<string, string> = {
	"regency started": "started",
	"regency ended": "ended",
	"regent changed": "changed",
	usurpation: "usurpation",
}

function createTranslator({
	state,
	world,
}: CreateTranslatorParams): ProceduralTranslator {
	const count = world.provinces?.count ?? 0
	const parent = new Int32Array(count).fill(-1)
	const owner = new Int32Array(count).fill(-1)
	const controller = new Int32Array(count).fill(-1)
	const occupation = new Int32Array(count).fill(-1)
	const children = Array.from({ length: count }, () => new Set<number>())
	const ownedCount = new Array<number>(state.record.nations.length).fill(0)
	const stateless = new Uint8Array(count)
	for (let province = 0; province < count; province++) {
		const base = state.record.events.provinceEvents.get(province)?.base
		parent[province] = base?.parentId ?? -1
		owner[province] = base?.ownerId ?? -1
		controller[province] = base?.controllerId ?? -1
		if (parent[province] >= 0) children[parent[province]].add(province)
		if (owner[province] >= 0) ownedCount[owner[province]]++
		if (
			!world.provinces?.desolate[province] &&
			(world.nations?.sovereign[province] ?? -1) < 0
		)
			stateless[province] = 1
	}
	const identityByRoot = new Map<number, number>()
	const rawColors: Array<[number, number, number]> = []
	for (let id = 0; id < (world.nations?.seeds.length ?? 0); id++) {
		identityByRoot.set(world.nations!.seeds[id], id)
		const colors = world.nations!.colors
		rawColors.push([colors[id * 3], colors[id * 3 + 1], colors[id * 3 + 2]])
	}
	const translator: ProceduralTranslator = {
		state,
		world,
		names: NAMES.createWorldNames(world),
		parent,
		owner,
		controller,
		occupation,
		rebelWars: new Map(),
		children,
		identityByRoot,
		rawColors,
		relationCells: new Map(),
		relationColumns: new Map(),
		activeTies: new Map(),
		royalMarriages: new Map(),
		warCoalitions: new Map(),
		ownedCount,
		stateless,
	}
	for (let province = 0; province < count; province++) {
		const root = world.nations?.sovereign[province] ?? -1
		if (root < 0 || owner[province] >= 0 || stateless[province]) continue
		const id = identityForRoot({
			translator,
			root,
			timeMs: state.record.minTimeMs,
		})
		owner[province] = id
		controller[province] = id
		ownedCount[id]++
		const base = state.record.events.provinceEvents.get(province)?.base
		if (base) {
			base.ownerId = id
			base.controllerId = id
		}
	}
	return translator
}

function applyTransaction({
	translator,
	transaction,
}: ApplyTransactionParams): void {
	const { record } = translator.state
	const timeMs = Math.max(record.minTimeMs, recordTime(transaction.timeMs))
	record.maxTimeMs = Math.max(record.maxTimeMs, timeMs)
	if (record.people)
		PEOPLE_RECORD.append({
			record: record.people,
			rows: transaction.people,
			timeMs,
			recordTime,
			describe: ({ person, houseHome }) => ({
				name: translator.names.ruler({
					province: person.home,
					nameSeed: person.nameSeed,
				}).name,
				house:
					person.dynasty >= 0
						? translator.names.dynasty({
								dynastyIdx: person.dynasty,
								province: houseHome,
							})
						: null,
			}),
		})
	const count = translator.parent.length
	const affected = new Set<number>()
	const pairs = new Set<number>()
	const reasons = scanRebelNotes({ translator, transaction })
	for (const change of transaction.parents) {
		for (const province of descendants({
			children: translator.children,
			province: change.province,
		}))
			affected.add(province)
		if (change.before < 0 || change.after < 0) {
			for (const neighbor of translator.relationColumns.get(change.province) ??
				[])
				pairs.add(
					Math.min(change.province, neighbor) * count +
						Math.max(change.province, neighbor),
				)
		}
	}
	for (const change of transaction.parents) {
		if (change.before >= 0)
			translator.children[change.before].delete(change.province)
		translator.parent[change.province] = change.after
		const event: HistoryEvent = {
			timeMs,
			kind: "parent",
			payload: { parentId: change.after },
			comment: null,
		}
		record.events.provinceEvents.get(change.province)?.events.push(event)
	}
	for (const change of transaction.parents) {
		if (change.after >= 0)
			translator.children[change.after].add(change.province)
	}
	for (const change of transaction.parents) {
		for (const province of descendants({
			children: translator.children,
			province: change.province,
		}))
			affected.add(province)
	}
	for (const [warId, war] of translator.rebelWars)
		if (translator.parent[war.attackerRoot] >= 0) {
			translator.rebelWars.delete(warId)
			reasons.touchedRoots.add(war.defenderRoot)
		}
	for (const root of reasons.touchedRoots)
		for (const province of descendants({
			children: translator.children,
			province: root,
		}))
			affected.add(province)
	for (const province of affected) {
		const root = rootOf({ translator, province })
		const mask = rebelWarOf({ translator, root })
		const next =
			translator.world.provinces?.desolate[province] ||
			translator.stateless[province]
				? -1
				: identityForRoot({
						translator,
						root: mask ? mask.attackerRoot : root,
						timeMs,
					})
		const previous = translator.owner[province]
		if (next === previous) continue
		if (previous >= 0 && --translator.ownedCount[previous] === 0)
			record.nations[previous].deathTimeMs = timeMs
		if (next >= 0) {
			if (translator.ownedCount[next]++ === 0) {
				record.nations[next].birthTimeMs = Math.min(
					record.nations[next].birthTimeMs,
					timeMs,
				)
				record.nations[next].deathTimeMs = -1
			}
		}
		translator.owner[province] = next
		record.events.provinceEvents.get(province)?.events.push({
			timeMs,
			kind: "owner",
			payload: { nationId: next },
			comment: reasons.outcomes.get(root) ?? reasons.revolts.get(root) ?? null,
		})
	}
	for (const change of transaction.relations) {
		const key = change.x * count + change.y
		if (change.after === 7) {
			translator.relationCells.delete(key)
			translator.relationColumns.get(change.x)?.delete(change.y)
		} else {
			translator.relationCells.set(key, change.after)
			let columns = translator.relationColumns.get(change.x)
			if (!columns)
				translator.relationColumns.set(change.x, (columns = new Set()))
			columns.add(change.y)
		}
		pairs.add(
			Math.min(change.x, change.y) * count + Math.max(change.x, change.y),
		)
	}
	updateTies({ translator, pairs, timeMs })
	const coalitions = transaction.coalitions.slice()
	for (const note of transaction.notes) {
		const coalition =
			note.tag === "war started" || note.tag === "battle"
				? (coalitions.find((entry) => entry.warId === note.data.war) ?? null)
				: null
		if (coalition) coalitions.splice(coalitions.indexOf(coalition), 1)
		appendNote({
			translator,
			note,
			timeMs: Math.max(record.minTimeMs, recordTime(note.time)),
			coalition,
		})
	}
	for (const change of transaction.occupations)
		translator.occupation[change.province] = change.after
	const reconcile = new Set(affected)
	for (const change of transaction.occupations) reconcile.add(change.province)
	for (const province of reconcile) {
		const occupyingWar = translator.occupation[province]
		const root = rootOf({ translator, province })
		const owner = translator.owner[province]
		const next =
			occupyingWar >= 0
				? (record.events.wars[occupyingWar]?.events.find(
						(event) => event.kind === "warStart" && event.side === "attacker",
					)?.nationId ?? -1)
				: owner >= 0 && rebelWarOf({ translator, root })
					? identityForRoot({ translator, root, timeMs })
					: owner
		if (next === translator.controller[province]) continue
		translator.controller[province] = next
		record.events.provinceEvents.get(province)?.events.push({
			timeMs,
			kind: "controller",
			payload: { nationId: next },
			comment: rebelWarOf({ translator, root })
				? (reasons.revolts.get(root) ?? null)
				: null,
		})
	}
	for (const ruler of transaction.rulers) {
		const nationId = translator.identityByRoot.get(ruler.root)
		if (nationId === undefined || ruler.nameSeed < 0) continue
		const log = record.events.nationEvents[nationId]
		if (!log) continue
		// Names follow the person's birth realm and the house's first home, so
		// a ruler keeps one name across every throne they hold.
		const person = record.people?.persons.get(ruler.person)
		const named = translator.names.ruler({
			province: person?.home ?? ruler.root,
			nameSeed: ruler.nameSeed,
		})
		const previous = log.events.findLast(
			(event) => event.kind === "rulerChange",
		)
		log.events.push({
			timeMs,
			kind: "rulerChange",
			payload: {
				name: named.name,
				dynasty:
					ruler.dynasty >= 0
						? translator.names.dynasty({
								dynastyIdx: ruler.dynasty,
								province:
									record.people?.dynastyHome.get(ruler.dynasty) ?? ruler.root,
							})
						: null,
				birthDate: DATE.timeMsToEu4Date(recordTime(ruler.birthTimeMs)),
				deathDate: DATE.timeMsToEu4Date(recordTime(ruler.deathTimeMs)),
				female: named.female,
				person: ruler.person,
				newRuler: previous?.payload.person !== ruler.person,
				regency: ruler.regency,
				regent: ruler.regent,
				regentName: personName({ translator, person: ruler.regent }),
			},
			comment: null,
		})
	}
	if (transaction.census)
		record.events.censuses.push({
			timeMs,
			urban: transaction.census.urban,
			rural: transaction.census.rural,
			development: transaction.census.development,
			economy: transaction.census.economy,
		})
	translator.state.frameCache.clear()
}

function appendJournal({
	translator,
	transactions,
}: AppendJournalParams): void {
	for (const transaction of transactions)
		applyTransaction({ translator, transaction })
}

export const TRANSLATOR = { createTranslator, appendJournal, recordTime }

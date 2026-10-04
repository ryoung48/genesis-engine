import { DATE } from "@/model/history/earth/date"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import type {
	BattleContribution,
	HistoryEvent,
	NationIdentity,
	ParticipantRole,
	SiegeBeat,
	SiegeRecord,
	WarRecord,
} from "@/model/history/record/types"
import type {
	Ambusher,
	BattleKind,
} from "@/model/history/sim/engine/events/battle/kind/types"
import type { SiegeBeatData } from "@/model/history/sim/engine/events/siege/types"
import { RELATION_CODE } from "@/model/history/sim/engine/fields"
import type { BattleOutcome } from "@/model/history/sim/engine/military/types"
import { COLORING } from "@/model/history/sim/nations/coloring"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type {
	ActiveTie,
	AppendJournalParams,
	AppendNoteParams,
	ApplyTransactionParams,
	ContributionsParams,
	CreateTranslatorParams,
	DescendantsParams,
	IdentityForRootParams,
	OwnerNoteReasons,
	ProceduralTranslator,
	ProjectTieParams,
	RebelWar,
	RebelWarOfParams,
	RulerDeathParams,
	ScanOwnerNotesParams,
	UpdateTiesParams,
} from "@/model/history/sim/record/translator/types"
import { ERAS } from "@/model/society/eras"
import { NAMES } from "@/model/society/language/names"

const YEAR_MS = 365 * 86_400_000

function recordTime(engineTimeMs: number): number {
	return engineTimeMs - DATE.earthHistoryStartYear * YEAR_MS
}

// People rows carry simulation years.
function peopleTime(years: number): number {
	return recordTime(years * YEAR_MS)
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
		if (war.rebelRoot === root && translator.parent[war.crownRoot] < 0)
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

// Registers and retires rebel wars from this transaction's notes before any
// ownership is derived, and collects the reason text the record attaches to
// each revolt and each rebel-war outcome.
// A reigning ruler whose death moved earlier: the reign's last ruler entry
// carries the new death date.
function moveRulerDeath({ translator, person, time }: RulerDeathParams): void {
	const { record } = translator.state
	for (const index of record.people?.tenuresOf.get(person) ?? []) {
		const tenure = record.people?.tenures[index]
		if (!tenure || tenure.kind !== "ruler" || tenure.endTimeMs !== Infinity)
			continue
		const nationId = translator.identityByRoot.get(tenure.seat)
		if (nationId === undefined) continue
		const entry = record.events.nationEvents[nationId]?.events.findLast(
			(event) =>
				event.kind === "rulerChange" && event.payload.person === person,
		)
		if (entry) entry.payload.deathDate = DATE.timeMsToEu4Date(peopleTime(time))
	}
}

function scanOwnerNotes({
	translator,
	transaction,
}: ScanOwnerNotesParams): OwnerNoteReasons {
	const reasons: OwnerNoteReasons = {
		revolts: new Map(),
		outcomes: new Map(),
		annexations: new Map(),
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
			reasons.revolts.set(note.data.subject as number, {
				nation: nationLabel({ translator, root: note.data.overlord as number }),
				cause,
				person: (note.data.pretender as number | undefined) ?? -1,
				throne: note.data.goal === "throne",
				late: -1,
			})
		} else if (note.tag === "partition") {
			const heirs = note.data.heirs as number[]
			for (const [index, seat] of (note.data.seats as number[]).entries())
				reasons.revolts.set(seat, {
					nation: nationLabel({
						translator,
						root: note.data.nation as number,
					}),
					cause: "partition",
					person: heirs[index],
					throne: false,
					late: note.data.dying as number,
				})
		} else if (note.tag === "war started") {
			const warId = note.data.war as number
			const coalition = transaction.coalitions.find(
				(entry) => entry.warId === warId,
			)
			if (!coalition || coalition.goal === "conquest") continue
			translator.rebelWars.set(warId, {
				rebelRoot:
					coalition.goal === "throne"
						? (note.data.attacker as number)
						: (note.data.defender as number),
				crownRoot:
					coalition.goal === "throne"
						? (note.data.defender as number)
						: (note.data.attacker as number),
			})
			reasons.touchedRoots.add(
				coalition.goal === "throne"
					? (note.data.attacker as number)
					: (note.data.defender as number),
			)
		} else if (note.tag === "war ended") {
			const warId = note.data.war as number
			const war = translator.rebelWars.get(warId)
			if (!war) continue
			const transferred = (note.data.transferred as number[]).length
			reasons.outcomes.set(
				war.rebelRoot,
				note.data.outcome === "restoration"
					? "Rebels defeated"
					: note.data.outcome === "regime change"
						? "Claimant took the throne"
						: note.data.outcome === "submission"
							? "Rebels submitted"
							: note.data.outcome === "cession"
								? `Rebels held land (${transferred} provinces)`
								: note.data.outcome === "independence"
									? transferred > 0
										? `Partial reconquest (${transferred} provinces)`
										: "Rebels held out"
									: "Rebellion lapsed",
			)
			reasons.touchedRoots.add(war.rebelRoot)
			translator.rebelWars.delete(warId)
		} else if (note.tag === "peaceful annexation") {
			const comment = `${nationLabel({ translator, root: note.data.defender as number })} was peacefully annexed by ${nationLabel({ translator, root: note.data.attacker as number })}`
			for (const province of note.data.provinces as number[])
				reasons.annexations.set(province, comment)
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
	if (value === RELATION_CODE.VASSAL)
		return { kind: "vassal", firstId, secondId }
	if (value === RELATION_CODE.COLONY)
		return { kind: "colony", firstId, secondId }
	if (value === RELATION_CODE.PU_JUNIOR)
		return { kind: "union", firstId, secondId }
	if (value === RELATION_CODE.ALLY) {
		return {
			kind: "alliance",
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
				value:
					translator.relationCells.get(x * count + y) ?? RELATION_CODE.NONE,
			}) ??
			projectTie({
				translator,
				x: y,
				y: x,
				value:
					translator.relationCells.get(y * count + x) ?? RELATION_CODE.NONE,
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

const ROLE_BY_RELATION: Record<number, ParticipantRole> = {
	[RELATION_CODE.VASSAL]: "vassal",
	[RELATION_CODE.OVERLORD]: "overlord",
	[RELATION_CODE.PU_SENIOR]: "union partner",
	[RELATION_CODE.PU_JUNIOR]: "union partner",
	[RELATION_CODE.ALLY]: "ally",
}

function contributions({
	translator,
	data,
}: ContributionsParams): BattleContribution[] {
	return (data.deployedNations as number[]).map((nation, index) => ({
		countryId: translator.identityByRoot.get(nation) ?? -1,
		troops: (data.deployedTroops as number[])[index],
		levy: (data.deployedLevies as number[])[index],
		regular: (data.deployedRegulars as number[])[index],
		role:
			(data.deployedRoles as (ParticipantRole | null)[] | undefined)?.[index] ??
			ROLE_BY_RELATION[(data.deployedRelations as number[])[index]] ??
			null,
	}))
}

function appendNote({
	translator,
	note,
	timeMs,
	coalition,
}: AppendNoteParams): void {
	const { record } = translator.state
	const data = note.data
	if (note.tag === "troops demobilized") {
		const nationId = translator.identityByRoot.get(data.nation as number)
		if (nationId !== undefined)
			record.events.nationEvents[nationId]?.events.push({
				timeMs,
				kind: "troopsDemobilized",
				payload: { recruitment: data.type, troops: data.troops },
				comment: null,
			})
	} else if (note.tag === "war started") {
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
		if (coalition && coalition.goal !== "conquest") {
			const crown = coalition.goal === "throne" ? defender : attacker
			const rebelRoot =
				coalition.goal === "throne"
					? (data.attacker as number)
					: (data.defender as number)
			const areaByProvince =
				translator.world.provinces?.areaKm2 ?? translator.world.provinces?.size
			let overlordArea = 0
			for (let province = 0; province < translator.owner.length; province++) {
				if (translator.owner[province] === crown)
					overlordArea += areaByProvince?.[province] ?? 0
			}
			let rebelArea = 0
			for (const province of descendants({
				children: translator.children,
				province: rebelRoot,
			})) {
				if (translator.owner[province] === crown)
					rebelArea += areaByProvince?.[province] ?? 0
			}
			civilWar = overlordArea > 0 && rebelArea * 2 > overlordArea
		}
		const war: WarRecord = {
			id: warId,
			name:
				coalition?.goal === "throne"
					? `${record.nations[defender]?.name ?? "Unknown"} War of Succession`
					: civilWar
						? `${record.nations[attacker]?.name ?? "Unknown"} Civil War`
						: coalition?.goal === "independence"
							? `Suppression of the ${record.nations[defender]?.name ?? "Unknown"} Revolt`
							: `${record.nations[attacker]?.name ?? "Unknown"}–${record.nations[defender]?.name ?? "Unknown"} War`,
			casusBelli:
				coalition?.goal === "throne"
					? "claim"
					: coalition?.goal === "independence"
						? "rebellion"
						: "conquest",
			warGoalType:
				coalition?.goal === "throne"
					? "throne"
					: coalition?.goal === "independence"
						? "rebellion"
						: "province",
			warGoalId: coalition?.goal === "throne" ? attacker : defender,
			warGoalProvinceId: data.defender as number,
			rebel: coalition !== undefined && coalition.goal !== "conquest",
			events: [],
			battles: [],
			sieges: [],
			mobilization: [],
		}
		record.events.wars[warId] = war
		if (coalition) coalitionChange({ translator, coalition, timeMs })
	} else if (note.tag === "war mobilized") {
		const war = record.events.wars[data.war as number]
		if (!war) return
		war.mobilization = contributions({ translator, data })
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
			simulated: {
				kind: data.kind as BattleKind,
				ambusher: data.ambusher as Ambusher,
				contributions: contributions({ translator, data }),
				outcome: data.result as BattleOutcome,
				preBattleWinProbability: data.preBattleWinProbability as number,
				powerShare: data.powerShare as number,
				topography: data.topography as string,
				vegetation: data.vegetation as string,
			},
		})
	} else if (
		note.tag === "siege started" ||
		note.tag === "siege beat" ||
		note.tag === "siege ended"
	) {
		const war = record.events.wars[data.war as number]
		if (!war) return
		if (coalition) coalitionChange({ translator, coalition, timeMs })
		const troops = contributions({ translator, data })
		if (note.tag === "siege started") {
			war.sieges.push({
				timeMs,
				province: data.province as number,
				besieger: translator.identityByRoot.get(data.besieger as number) ?? -1,
				defender: translator.identityByRoot.get(data.defender as number) ?? -1,
				besiegers: data.besiegers as number,
				garrisonTroops: data.garrisonTroops as number,
				contributions: troops,
				beats: [],
				outcome: null,
				reason: null,
				endTimeMs: null,
				endContributions: null,
				phases: null,
			})
		} else {
			const siege = war.sieges.findLast(
				(siege) => siege.outcome === null && siege.province === data.province,
			)
			if (!siege) return
			if (note.tag === "siege ended") {
				siege.outcome = data.outcome as SiegeRecord["outcome"]
				siege.reason = data.reason as SiegeRecord["reason"]
				siege.endTimeMs = timeMs
				siege.endContributions = troops
				siege.phases = data.phases as number
			} else {
				const beat = {
					beat: data.beat,
					...(data.beat === "breach"
						? { breaches: data.breaches }
						: data.beat === "sortie" ||
								data.beat === "assault" ||
								data.beat === "relief"
							? {
									won: data.won,
									outcome: data.outcome,
									powerShare: data.powerShare,
									effect: data.effect,
								}
							: {}),
				} as SiegeBeatData
				siege.beats.push({
					...beat,
					timeMs,
					phase: data.phase as number,
					besiegerLosses: data.besiegerLosses as number,
					garrisonLosses: data.garrisonLosses as number,
					contributions: troops,
				} as SiegeBeat)
			}
		}
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
		const attacker =
			record.nations[
				translator.identityByRoot.get(data.attacker as number) ?? -1
			]?.name ?? "Unknown"
		const defender =
			record.nations[
				translator.identityByRoot.get(data.defender as number) ?? -1
			]?.name ?? "Unknown"
		const transferred = (data.transferred as number[]).length
		const comment =
			data.outcome === "white peace"
				? "White peace"
				: data.outcome === "regime change"
					? "Claimant took the throne"
					: data.outcome === "submission"
						? "Rebels submitted"
						: data.outcome === "annexation"
							? "Annexed"
							: data.outcome === "restoration"
								? `${attacker} restored control over ${defender}`
								: data.outcome === "cession"
									? war.warGoalType === "throne"
										? `Rebels held land (${transferred} provinces)`
										: `Ceded ${transferred} provinces`
									: data.outcome === "indemnity"
										? `${attacker} owes ${defender} 10% of its revenue for 5 years`
										: data.outcome === "bought peace"
											? `${defender} paid ${attacker} ${Math.round(data.payment as number)} ducats for peace`
											: data.outcome === "independence"
												? war.warGoalType === "throne"
													? "Rebels held out"
													: `${defender} won independence from ${attacker}${transferred > 0 ? ` after ceding ${transferred} provinces` : ""}`
												: `The war lapsed: ${data.winner === data.attacker ? defender : attacker} no longer rules a realm`
		const active = translator.warCoalitions.get(warId)
		if (active) {
			for (const id of active.attackers)
				war.events.push({
					timeMs,
					nationId: id,
					kind: "warEnd",
					side: "attacker",
					comment,
				})
			for (const id of active.defenders)
				war.events.push({
					timeMs,
					nationId: id,
					kind: "warEnd",
					side: "defender",
					comment,
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
	} else if (note.tag === "partition") {
		const nationId = translator.identityByRoot.get(data.nation as number)
		if (nationId === undefined) return
		const realmId = (root: number) => translator.identityByRoot.get(root) ?? -1
		const realms = (data.seats as number[]).map(realmId)
		// A new realm takes the divided realm's government, whatever its seat
		// province carried before.
		for (const id of realms) {
			const log = record.events.nationEvents[id]
			if (!log) continue
			const current =
				log.events.findLast((event) => event.kind === "governmentChange")
					?.payload.governmentType ?? log.base.initialGovernment
			if (current === data.government) continue
			if (log.events.length === 0)
				log.base.initialGovernment = data.government as string
			else
				log.events.push({
					timeMs,
					kind: "governmentChange",
					payload: { governmentType: data.government },
					comment: null,
				})
		}
		record.events.nationEvents[nationId]?.events.push({
			timeMs,
			kind: "partition",
			payload: {
				late: data.dying,
				primary: data.primary,
				heirs: data.heirs,
				realms,
				joinedDistricts: data.joinedDistricts,
				joinedRealms: (data.joinedRealms as number[]).map(realmId),
			},
			comment: null,
		})
	} else if (note.tag === "peaceful annexation") {
		const annexerId = translator.identityByRoot.get(data.attacker as number)
		const annexedId = translator.identityByRoot.get(data.defender as number)
		if (annexerId === undefined || annexedId === undefined) return
		for (const nationId of [annexerId, annexedId])
			record.events.nationEvents[nationId]?.events.push({
				timeMs,
				kind: "peacefulAnnexation",
				payload: { annexerId, annexedId },
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
	const packet = transaction.people
	if (record.people && packet) {
		PEOPLE_RECORD.append({
			record: record.people,
			packet,
			timeMs,
			recordTime: peopleTime,
		})
		for (let index = 0; index < packet.count; index++) {
			const row = PEOPLE_LOG.read({ rows: packet, index })
			if (row.kind === "death")
				moveRulerDeath({ translator, person: row.person, time: row.time })
		}
	}
	const count = translator.parent.length
	const affected = new Set<number>()
	const pairs = new Set<number>()
	const reasons = scanOwnerNotes({ translator, transaction })
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
		if (translator.parent[war.crownRoot] >= 0) {
			translator.rebelWars.delete(warId)
			reasons.touchedRoots.add(war.rebelRoot)
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
						root: mask ? mask.crownRoot : root,
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
			comment:
				reasons.annexations.get(province) ??
				reasons.outcomes.get(root) ??
				reasons.revolts.get(root) ??
				null,
		})
	}
	for (const change of transaction.relations) {
		const key = change.x * count + change.y
		if (change.after === RELATION_CODE.NONE) {
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
			note.tag === "war started" ||
			note.tag === "battle" ||
			note.tag === "siege started" ||
			note.tag === "siege beat" ||
			note.tag === "siege ended"
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
		const previous = log.events.findLast(
			(event) => event.kind === "rulerChange",
		)
		log.events.push({
			timeMs,
			kind: "rulerChange",
			payload: {
				birthDate: DATE.timeMsToEu4Date(recordTime(ruler.birthTimeMs)),
				deathDate: DATE.timeMsToEu4Date(recordTime(ruler.deathTimeMs)),
				person: ruler.person,
				newRuler: previous?.payload.person !== ruler.person,
				regency: ruler.regency,
				regent: ruler.regent,
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
			economy: {
				...transaction.census.economy,
				nations: Int32Array.from(transaction.census.economy.nations, (root) =>
					identityForRoot({ translator, root, timeMs }),
				),
			},
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

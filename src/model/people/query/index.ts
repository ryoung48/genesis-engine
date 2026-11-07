import { FRAME } from "@/model/history/world-frame"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { FIT } from "@/model/people/anchors/fit"
import { CAST } from "@/model/people/cast"
import { INGEST } from "@/model/people/cast/ingest"
import type { Cast, Person, PersonRow } from "@/model/people/cast/types"
import { CHARACTER } from "@/model/people/character"
import { HEALTH } from "@/model/people/health"
import { AGEING } from "@/model/people/health/ageing"
import { MARRIAGE } from "@/model/people/marriage"
import { NOBILITY } from "@/model/people/nobility"
import { OPINION } from "@/model/people/opinion"
import { ORIENTATION } from "@/model/people/orientation"
import type {
	ConditionView,
	Describer,
	FamilyGroup,
	FamilyMember,
	GroupsParams,
	MemberParams,
	PageOutcome,
	PageParams,
	PassedOver,
	PassedOverParams,
	PersonHeader,
	PersonKey,
	PersonRef,
	RelativesResult,
	TimelineParams,
	TimelineRow,
	TitleParams,
	UnionLinkParams,
	ViewParams,
} from "@/model/people/query/types"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const BIRTH_FRAME_STEP = 25 * YEAR
const NON_SON_MIN_AGE = 16
const TIER_TITLES: readonly (readonly [string, string])[] = [
	["Count", "Countess"],
	["Duke", "Duchess"],
	["King", "Queen"],
	["Emperor", "Empress"],
	["Emperor", "Empress"],
]
const CONDITION_LABELS: Record<string, string> = {
	infirm: "Infirm",
	clouded_eyes: "Clouded Eyes",
	fragile_bones: "Fragile Bones",
	withering_mind: "Withering Mind",
	faltering_heart: "Faltering Heart",
	blind: "Blind",
	incapable: "Incapable",
}

function keyOf(person: Person): PersonKey {
	return `person:${person.id}`
}

function rulerKey(rulerId: number): PersonKey {
	return `ruler:${rulerId}`
}

function resolve(cast: Cast, key: PersonKey): Person | null {
	if (key.startsWith("ruler:"))
		return INGEST.ruler({ cast, rulerId: Number(key.slice(6)) })
	if (key.startsWith("person:"))
		return cast.persons[Number(key.slice(7))] ?? null
	return null
}

function nameOf(cast: Cast, person: Person): string {
	return CAST.names({ cast, person }).name
}

function marriageOfParents(cast: Cast, person: Person) {
	return person.parents.kind === "couple"
		? cast.marriages[person.parents.marriage]
		: null
}

function childrenIn(cast: Cast, ids: number[]): Person[] {
	return ids.flatMap((id) =>
		cast.marriages[id].children.map((child) => cast.persons[child.id]),
	)
}

function relatives(
	cast: Cast,
	subject: Person,
	timeMs: number,
): RelativesResult {
	const own = marriageOfParents(cast, subject)
	const couple = CAST.parentsOf({ cast, person: subject })
	const parents = couple ? [couple[0], couple[1]] : []
	const born = (person: Person) => person.birthMs <= timeMs
	const fullSiblings = own
		? own.children
				.map((child) => cast.persons[child.id])
				.filter((person) => person.id !== subject.id && born(person))
		: []
	const halfSiblings: Person[] = []
	for (const parent of parents)
		halfSiblings.push(
			...childrenIn(
				cast,
				parent.marriages.filter((id) => id !== own?.id),
			).filter(born),
		)
	const spouses = subject.marriages
		.map((id) => cast.marriages[id])
		.filter(
			(marriage) =>
				marriage.startMs <= timeMs ||
				(marriage.betrothedMs !== null && marriage.betrothedMs <= timeMs),
		)
		.map((marriage) => ({
			betrothed: marriage.startMs > timeMs,
			concubine: marriage.kind === "concubine",
			kinship: marriage.kinship,
			person:
				cast.persons[
					marriage.husband === subject.id ? marriage.wife : marriage.husband
				],
			current:
				marriage.startMs <= timeMs && CAST.endOf({ cast, marriage }) > timeMs,
		}))
	return {
		parents,
		fullSiblings,
		halfSiblings,
		spouses,
		children: childrenIn(cast, subject.marriages).filter(born),
	}
}

function reigning(cast: Cast, person: Person, timeMs: number): number | null {
	const fact = CAST.factOf({ cast, person })
	if (!fact) return null
	const reign = fact.reigns.find(
		(entry) => entry.startMs <= timeMs && (timeMs < entry.endMs || entry.open),
	)
	return reign ? reign.nationId : null
}

function titleOf({
	cast,
	person,
	parents,
	timeMs,
	frame,
}: TitleParams): string | null {
	const female = person.sex === 1
	const nationId = reigning(cast, person, timeMs)
	if (nationId !== null) {
		const tier = FRAME.heldTitles({ frame, nationId }).reduce(
			(top, title) => Math.max(top, frame.titles?.tier[title] ?? 0),
			-1,
		)
		return tier < 0
			? female
				? "Lady"
				: "Lord"
			: TIER_TITLES[tier][female ? 1 : 0]
	}
	for (const parent of parents) {
		const realm = reigning(cast, parent, timeMs)
		if (realm !== null)
			return `${female ? "Princess" : "Prince"} of ${frame.nations.get(realm)?.name ?? cast.record.nations[realm]?.name ?? "the realm"}`
	}
	return null
}

function viewOf({ cast, person, timeMs, frame }: ViewParams) {
	const culture = frame.provinceCulture[person.home] ?? -1
	return {
		character: person.character,
		age: Math.max(0, (timeMs - person.birthMs) / YEAR),
		culture,
		religion: frame.provinceReligion[person.home] ?? -1,
		heritage:
			culture >= 0 ? (cast.record.heritageOfCulture[culture] ?? -1) : -1,
	}
}

function member({
	cast,
	context,
	subject,
	person,
	timeMs,
	frame,
	kin,
	spouse,
}: MemberParams): FamilyMember {
	const life = CAST.lifeOf({ cast, person })
	const status = HEALTH.at({ life, timeMs }).band
	const names = CAST.names({ cast, person })
	return {
		key: keyOf(person),
		name: names.name,
		house: names.house,
		female: person.sex === 1,
		ageYears: (Math.min(timeMs, life.deathMs) - person.birthMs) / YEAR,
		status,
		kinship: null,
		opinion:
			status === "Dead"
				? null
				: OPINION.of({
						observer: viewOf({ cast, context, person: subject, timeMs, frame }),
						target: viewOf({ cast, context, person, timeMs, frame }),
						kin,
						spouse,
					}),
		revealed:
			person.revealedLater ||
			(CAST.parentsOf({ cast, person })?.some(
				(parent) => parent.revealedLater,
			) ??
				false),
	}
}

function groups({
	cast,
	context,
	subject,
	timeMs,
	frame,
	found,
}: GroupsParams): FamilyGroup[] {
	const seen = new Set<number>()
	const kinships = new Map(
		found.spouses.map((entry) => [entry.person.id, entry.kinship] as const),
	)
	const build = (
		label: string,
		people: Person[],
		kin: boolean,
		spouse: (person: Person) => boolean,
	): FamilyGroup => ({
		label,
		members: people
			.filter((person) => {
				if (seen.has(person.id)) return false
				seen.add(person.id)
				return true
			})
			.map((person) => ({
				...member({
					cast,
					context,
					subject,
					person,
					timeMs,
					frame,
					kin,
					spouse: spouse(person),
				}),
				kinship: kinships.get(person.id) ?? null,
			})),
	})
	const never = () => false
	const current = new Set(
		found.spouses
			.filter((entry) => entry.current && !entry.concubine)
			.map((entry) => entry.person.id),
	)
	return [
		build("Parents", found.parents, true, never),
		build("Siblings", found.fullSiblings, true, never),
		build("Half siblings", found.halfSiblings, true, never),
		build(
			"Spouses",
			found.spouses
				.filter((entry) => entry.current && !entry.concubine)
				.map((entry) => entry.person),
			false,
			(person) => current.has(person.id),
		),
		build(
			"Concubines",
			found.spouses
				.filter((entry) => entry.current && entry.concubine)
				.map((entry) => entry.person),
			false,
			never,
		),
		build(
			"Betrothed",
			found.spouses
				.filter((entry) => entry.betrothed)
				.map((entry) => entry.person),
			false,
			never,
		),
		build(
			"Former spouses",
			found.spouses
				.filter((entry) => !entry.current && !entry.betrothed)
				.map((entry) => entry.person),
			false,
			never,
		),
		build("Children", found.children, true, never),
	]
}

function conditionsOf(
	cast: Cast,
	person: Person,
	timeMs: number,
): ConditionView[] {
	const { levels } = HEALTH.at({
		life: CAST.lifeOf({ cast, person }),
		timeMs,
	})
	return levels.flatMap((level, index) =>
		level < 0
			? []
			: [
					{
						name: CONDITION_LABELS[AGEING.conditions[index]],
						level: level + 1,
					},
				],
	)
}

function relationsOf(
	found: RelativesResult,
	side: (person: Person, male: string, female: string) => string,
): Map<number, string> {
	const relations = new Map<number, string>()
	for (const person of found.parents)
		relations.set(person.id, side(person, "father", "mother"))
	for (const person of found.fullSiblings)
		relations.set(person.id, side(person, "brother", "sister"))
	for (const person of found.halfSiblings)
		relations.set(person.id, side(person, "half-brother", "half-sister"))
	for (const person of found.children)
		relations.set(person.id, side(person, "son", "daughter"))
	for (const entry of found.spouses)
		relations.set(
			entry.person.id,
			entry.betrothed
				? side(entry.person, "fiancé", "fiancée")
				: entry.concubine
					? "concubine"
					: side(entry.person, "husband", "wife"),
		)
	return relations
}

function describer(
	cast: Cast,
	subject: Person,
	found: RelativesResult,
): Describer {
	const relations = relationsOf(found, (person, male, female) =>
		person.sex === 1 ? female : male,
	)
	const row = (
		timeMs: number,
		type: string,
		parts: Array<string | Person>,
		revealed = false,
	): TimelineRow => {
		const people: PersonRef[] = []
		const text = parts
			.map((part) => {
				if (typeof part === "string") return part
				const name = nameOf(cast, part)
				const relation = relations.get(part.id)
				if (part.id === subject.id || !relation) return name
				people.push({ key: keyOf(part), name })
				return `${name} (${relation})`
			})
			.join("")
		return { timeMs, type, text, people, revealed }
	}
	return { row }
}

function kinLabel(kinship: string, husband: Person, wife: Person): string {
	if (kinship === "sibling") return "his sister"
	if (kinship === "half-sibling") return "his half-sister"
	if (kinship === "cousin") return "his cousin"
	return wife.birthMs < husband.birthMs ? "his aunt" : "his niece"
}

function birthParts(cast: Cast, person: Person): Array<string | Person> {
	const couple = CAST.parentsOf({ cast, person })
	if (!couple) return [person, " was born"]
	return [person, " was born to ", couple[0], " and ", couple[1]]
}

function deathCause(cast: Cast, person: Person): string | null {
	const life = CAST.lifeOf({ cast, person })
	const childbirth = person.marriages.some((id) => {
		const marriage = cast.marriages[id]
		return (
			marriage.wife === person.id &&
			marriage.pregnancies.some(
				(pregnancy) =>
					pregnancy.outcome === "childbirth death" &&
					pregnancy.dueMs === life.deathMs,
			)
		)
	})
	return childbirth ? "Died in childbirth" : life.cause
}

function passedOver({ cast, person, timeMs }: PassedOverParams): PassedOver[] {
	const found: PassedOver[] = []
	const couple = CAST.parentsOf({ cast, person })
	if (!couple) return found
	const life = CAST.lifeOf({ cast, person })
	for (const parent of couple) {
		const fact = CAST.factOf({ cast, person: parent })
		if (!fact) continue
		for (const reign of fact.reigns) {
			if (reign.open || reign.endMs > timeMs) continue
			const reigns = cast.anchors.nationReigns.get(reign.nationId) ?? []
			const at = reigns.indexOf(reign)
			const next = reigns[at + 1]
			if (!next || next.rulerId === fact.rulerId) continue
			const successor = cast.anchors.facts.get(next.rulerId)
			if (!successor) continue
			if (
				person.ruler.kind === "ruler" &&
				person.ruler.ref.rulerId === successor.rulerId
			)
				continue
			if (person.birthMs > reign.endMs || life.deathMs <= reign.endMs) continue
			const sonOfLate =
				successor.kin?.relation === "son" &&
				successor.kin.late.rulerId === fact.rulerId
			const outranks = sonOfLate
				? person.birthMs < successor.birthMs &&
					(person.sex === 0 || person.sex === successor.ref.sex)
				: (reign.endMs - person.birthMs) / YEAR >= NON_SON_MIN_AGE
			if (!outranks) continue
			found.push({
				timeMs: reign.endMs,
				successorRulerId: successor.rulerId,
			})
		}
	}
	return found
}

function unionLinked({ cast, person, union }: UnionLinkParams): boolean {
	const late = INGEST.ruler({ cast, rulerId: union.late })
	if (!late) return false
	return person.marriages.some((id) => {
		const marriage = cast.marriages[id]
		const other =
			cast.persons[
				marriage.husband === person.id ? marriage.wife : marriage.husband
			]
		const couple = CAST.parentsOf({ cast, person: other })
		return (
			marriage.startMs <= union.timeMs &&
			couple !== null &&
			couple.some((parent) => parent.id === late.id)
		)
	})
}

function extraRows(
	cast: Cast,
	describe: Describer,
	person: Person,
	timeMs: number,
): TimelineRow[] {
	const rows: TimelineRow[] = []
	for (const entry of person.rows as PersonRow[])
		rows.push(
			describe.row(
				entry.timeMs,
				entry.type,
				entry.parts.map((part) =>
					typeof part === "string" ? part : cast.persons[part.person],
				),
				entry.revealed,
			),
		)
	for (const over of passedOver({ cast, person, timeMs })) {
		const successor = INGEST.ruler({ cast, rulerId: over.successorRulerId })
		const fact = cast.anchors.facts.get(over.successorRulerId)
		const realm = fact?.reigns[0]
			? (cast.record.nations[fact.reigns[0].nationId]?.name ?? "the realm")
			: "the realm"
		rows.push(
			describe.row(over.timeMs, "Succession", [
				person,
				` was passed over in the succession to the throne of ${realm}`,
				...(successor ? [" in favour of ", successor] : []),
			]),
		)
	}
	const union = cast.unions.find(
		(entry) =>
			person.ruler.kind === "ruler" &&
			entry.successor === person.ruler.ref.rulerId,
	)
	if (
		union &&
		union.timeMs <= timeMs &&
		!unionLinked({ cast, person, union })
	) {
		const late = INGEST.ruler({ cast, rulerId: union.late })
		const house = late ? CAST.names({ cast, person: late }).house : null
		rows.push(
			describe.row(union.timeMs, "Succession", [
				person,
				` inherited through the marriage alliance with ${house ? `${house}'s` : "the late ruler's"} house`,
			]),
		)
	}
	return rows
}

function timelineOf({
	cast,
	person,
	timeMs,
	found,
}: TimelineParams): TimelineRow[] {
	const describe = describer(cast, person, found)
	const { row } = describe
	const rows: TimelineRow[] = []
	const life = CAST.lifeOf({ cast, person })
	rows.push(
		row(
			person.birthMs,
			"Birth",
			birthParts(cast, person),
			person.revealedLater,
		),
	)
	for (const entry of life.rows) {
		if (entry.kind === "band" && entry.timeMs > person.birthMs)
			rows.push(
				row(entry.timeMs, "Health", [
					person,
					`'s health became ${entry.band.toLowerCase()}`,
				]),
			)
		else if (entry.kind === "condition") {
			const label = CONDITION_LABELS[entry.condition]
			rows.push(
				row(
					entry.timeMs,
					"Health",
					entry.before < 0
						? [person, ` developed ${label}`]
						: entry.after < 0
							? [person, ` lost ${label}`]
							: [`${label} worsened to level ${entry.after + 1}`],
				),
			)
		}
	}
	const fact = CAST.factOf({ cast, person })
	for (const reign of fact?.reigns ?? []) {
		const realm = cast.record.nations[reign.nationId]?.name ?? "a realm"
		rows.push(
			row(reign.startMs, "Reign", [person, ` took the throne of ${realm}`]),
		)
		if (!reign.open)
			rows.push(
				row(reign.endMs, "Reign", [person, ` left the throne of ${realm}`]),
			)
	}
	for (const id of person.marriages) {
		const marriage = cast.marriages[id]
		const husband = cast.persons[marriage.husband]
		const wife = cast.persons[marriage.wife]
		const revealed = marriage.revealedLater
		if (marriage.betrothedMs !== null)
			rows.push(
				row(marriage.betrothedMs, "Marriage", [
					husband,
					" and ",
					wife,
					" were betrothed",
				]),
			)
		rows.push(
			row(
				marriage.startMs,
				"Marriage",
				marriage.kind === "tie"
					? marriage.kinship
						? [
								husband,
								" and ",
								wife,
								` wed in a royal marriage, ${kinLabel(marriage.kinship, husband, wife)}`,
							]
						: [husband, " and ", wife, " wed in a royal marriage"]
					: marriage.kind === "concubine"
						? [husband, " took ", wife, " as a concubine"]
						: marriage.kinship
							? [
									husband,
									" married ",
									wife,
									`, ${kinLabel(marriage.kinship, husband, wife)}`,
								]
							: [husband, " married ", wife],
				revealed,
			),
		)
		const spouse = husband.id === person.id ? wife : husband
		const spouseLife = CAST.lifeOf({ cast, person: spouse })
		if (
			spouseLife.deathMs <= life.deathMs &&
			spouseLife.deathMs > marriage.startMs
		)
			rows.push(
				row(
					spouseLife.deathMs,
					"Marriage",
					[person, " was widowed by the death of ", spouse],
					revealed || spouse.revealedLater,
				),
			)
		for (const pregnancy of marriage.pregnancies)
			if (
				(pregnancy.outcome === "miscarriage" ||
					pregnancy.outcome === "stillbirth") &&
				wife.id === person.id
			)
				rows.push(
					row(pregnancy.dueMs, "Children", [
						person,
						` suffered a ${pregnancy.outcome} with `,
						husband,
					]),
				)
		for (const child of marriage.children) {
			const born = cast.persons[child.id]
			rows.push(
				row(
					child.birthMs,
					"Children",
					birthParts(cast, born),
					born.revealedLater,
				),
			)
		}
	}
	for (const relative of [
		...found.parents,
		...found.fullSiblings,
		...found.halfSiblings,
		...found.children,
		...found.spouses.map((entry) => entry.person),
	]) {
		const deathMs = CAST.lifeOf({ cast, person: relative }).deathMs
		if (deathMs <= timeMs)
			rows.push(
				row(deathMs, "Family", [relative, " died"], relative.revealedLater),
			)
	}
	rows.push(...extraRows(cast, describe, person, timeMs))
	if (life.deathMs <= timeMs)
		rows.push(
			row(life.deathMs, "Death", [
				person,
				` died (${(deathCause(cast, person) ?? "natural causes").toLowerCase()})`,
			]),
		)
	return rows
		.filter((entry) => entry.timeMs <= Math.min(timeMs, life.deathMs))
		.sort((x, y) => x.timeMs - y.timeMs)
}

function headerOf(cast: Cast, person: Person): PersonHeader {
	return { name: nameOf(cast, person), birthMs: person.birthMs }
}

function generate(cast: Cast, subject: Person, timeMs: number): void {
	MARRIAGE.extend({ cast, id: subject.id, untilMs: timeMs })
	FIT.ensureParents({ cast, person: subject })
}

function page({
	record,
	context,
	key,
	timeMs,
}: PageParams): PageOutcome | null {
	const cast = INGEST.open({ record, context })
	INGEST.settle(cast)
	const subject = resolve(cast, key)
	if (!subject) return null
	if (timeMs > record.maxTimeMs)
		return { kind: "pending", header: headerOf(cast, subject) }
	if (subject.birthMs > timeMs)
		return { kind: "unborn", header: headerOf(cast, subject) }
	generate(cast, subject, timeMs)
	const life = CAST.lifeOf({ cast, person: subject })
	const frame: WorldFrame = context.frameAt(timeMs)
	const birthFrame = context.frameAt(
		Math.min(
			record.maxTimeMs,
			Math.max(
				record.minTimeMs,
				Math.floor(subject.birthMs / BIRTH_FRAME_STEP) * BIRTH_FRAME_STEP,
			),
		),
	)
	const found = relatives(cast, subject, timeMs)
	const names = CAST.names({ cast, person: subject })
	const age = (Math.min(timeMs, life.deathMs) - subject.birthMs) / YEAR
	const culture = birthFrame.provinceCulture[subject.home] ?? -1
	const religion = frame.provinceReligion[subject.home] ?? -1
	return {
		kind: "page",
		page: {
			key: keyOf(subject),
			name: names.name,
			house: names.house,
			female: subject.sex === 1,
			birthMs: subject.birthMs,
			ageYears: age,
			status: HEALTH.at({ life, timeMs }).band,
			deathMs: life.deathMs,
			title: titleOf({
				cast,
				person: subject,
				parents: found.parents,
				timeMs,
				frame,
			}),
			cultureKey:
				culture >= 0 ? (birthFrame.cultures[culture]?.key ?? null) : null,
			rank: NOBILITY.rankLabel(
				subject,
				NOBILITY.tierOf({ cast, person: subject, timeMs }),
			),
			seatProvince: NOBILITY.seatOf({ cast, person: subject, timeMs }),
			religionId: religion,
			religionKey:
				religion >= 0 ? (frame.religions[religion]?.key ?? null) : null,
			culture:
				culture >= 0 ? (birthFrame.cultures[culture]?.name ?? null) : null,
			religion:
				religion >= 0 ? (frame.religions[religion]?.name ?? null) : null,
			orientation:
				age >= ORIENTATION.adultAge
					? ORIENTATION.of({ seed: CAST.seedOf({ cast, id: subject.id }) })
					: null,
			personality: CHARACTER.activeTraits({
				character: subject.character,
				age,
			}),
			grades: CHARACTER.gradeTraits(subject.character),
			congenital: CHARACTER.congenitalTraits(subject.character),
			conditions: conditionsOf(cast, subject, timeMs),
			groups: groups({ cast, context, subject, timeMs, frame, found }),
			timeline: timelineOf({ cast, person: subject, timeMs, found }),
			revealed: subject.revealedLater,
		},
	}
}

function header(cast: Cast, key: PersonKey): PersonHeader | null {
	const person = resolve(cast, key)
	return person ? headerOf(cast, person) : null
}

export const PERSON_QUERY = {
	page,
	header,
	rulerKey,
	keyOf,
	resolve,
	passedOver,
	unionLinked,
	open: INGEST.open,
}

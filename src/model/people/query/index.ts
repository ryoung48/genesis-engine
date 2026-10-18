import { FRAME } from "@/model/history/world-frame"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { CHARACTER } from "@/model/people/character"
import { HEALTH } from "@/model/people/health"
import { AGEING } from "@/model/people/health/ageing"
import { PERSON_KEY } from "@/model/people/keys"
import type { PersonKey } from "@/model/people/keys/types"
import { MARRIAGE } from "@/model/people/marriage"
import type { Marriage } from "@/model/people/marriage/types"
import { NOBILITY } from "@/model/people/nobility"
import { OPINION } from "@/model/people/opinion"
import { ORIENTATION } from "@/model/people/orientation"
import type {
	ConditionView,
	Describer,
	FamilyGroup,
	FamilyMember,
	HeaderParams,
	MemberParams,
	PersonHeader,
	PersonPage,
	PersonQueryParams,
	PersonRef,
	RelativesResult,
	TimelineRow,
	TitleParams,
} from "@/model/people/query/types"
import { PEOPLE_STORE } from "@/model/people/store"
import type { PeopleStore } from "@/model/people/store/types"
import { PERSON_STUB } from "@/model/people/stub"
import type { PersonStub } from "@/model/people/stub/types"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const BIRTH_FRAME_STEP = 25 * YEAR
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

function nameOf(store: PeopleStore, stub: PersonStub): string {
	return PERSON_STUB.names({ store, stub }).name
}

function marriageOf(store: PeopleStore, stub: PersonStub): Marriage {
	return MARRIAGE.parentMarriage({ store, key: stub.key })
}

function kinLabel(
	marriage: Marriage,
	husband: PersonStub,
	wife: PersonStub,
): string {
	if (marriage.kinship === "sibling") return "his sister"
	if (marriage.kinship === "half-sibling") return "his half-sister"
	if (marriage.kinship === "cousin") return "his cousin"
	return wife.birthMs < husband.birthMs ? "his aunt" : "his niece"
}

function stubsOf(store: PeopleStore, keys: PersonKey[]): PersonStub[] {
	return keys.map((key) => PERSON_STUB.of({ store, key }))
}

function relatives(
	store: PeopleStore,
	subject: PersonStub,
	timeMs: number,
): RelativesResult {
	const marriage = marriageOf(store, subject)
	const parents = marriage
		? stubsOf(store, [marriage.husband, marriage.wife])
		: []
	const born = (stub: PersonStub) => stub.birthMs <= timeMs
	const fullSiblings = marriage
		? stubsOf(
				store,
				marriage.children
					.map((child) => child.key)
					.filter((key) => key !== subject.key),
			).filter(born)
		: []
	const halfSiblings: PersonStub[] = []
	for (const parent of parents)
		for (const other of MARRIAGE.chain({ store, key: parent.key }).marriages) {
			if (other.key === marriage?.key) continue
			halfSiblings.push(
				...stubsOf(
					store,
					other.children.map((child) => child.key),
				).filter(born),
			)
		}
	const chain = MARRIAGE.chain({ store, key: subject.key })
	const spouses = chain.marriages
		.filter(
			(own) =>
				own.startMs <= timeMs ||
				(own.betrothedMs !== null && own.betrothedMs <= timeMs),
		)
		.map((own) => ({
			betrothed: own.startMs > timeMs,
			concubine: own.kind === "concubine",
			kinship: own.kinship,
			stub: PERSON_STUB.of({
				store,
				key: own.husband === subject.key ? own.wife : own.husband,
			}),
			current: own.startMs <= timeMs && own.endMs > timeMs,
		}))
	const children = chain.marriages.flatMap((own) =>
		stubsOf(
			store,
			own.children.map((child) => child.key),
		).filter(born),
	)
	const known = PEOPLE_STORE.index(store).parentCouple
	const house = parents.filter(
		(parent) => parent.house || known.has(parent.key),
	)
	const grandMarriages = house.map((parent) =>
		MARRIAGE.parentMarriage({ store, key: parent.key }),
	)
	const grandparents = grandMarriages.flatMap((own) =>
		stubsOf(store, [own.husband, own.wife]),
	)
	const auncles = grandMarriages.flatMap((own, at) =>
		stubsOf(
			store,
			own.children
				.map((child) => child.key)
				.filter((key) => key !== house[at].key),
		).filter(born),
	)
	const cousins = auncles
		.filter((auncle) => auncle.house)
		.flatMap((auncle) =>
			MARRIAGE.baseChain({ store, key: auncle.key }).marriages.flatMap((own) =>
				stubsOf(
					store,
					own.children.map((child) => child.key),
				).filter(born),
			),
		)
	const nephews = fullSiblings
		.filter((sibling) => sibling.house)
		.flatMap((sibling) =>
			MARRIAGE.baseChain({ store, key: sibling.key }).marriages.flatMap((own) =>
				stubsOf(
					store,
					own.children.map((child) => child.key),
				).filter(born),
			),
		)
	return {
		parents,
		fullSiblings,
		halfSiblings,
		spouses,
		children,
		grandparents,
		auncles,
		cousins,
		nephews,
	}
}

function reigning(
	store: PeopleStore,
	stub: PersonStub,
	timeMs: number,
): number | null {
	const parsed = PERSON_KEY.parse(stub.key)
	if (parsed.tag !== "R") return null
	const fact = PEOPLE_STORE.index(store).facts.get(parsed.rulerId)
	const reign = fact?.reigns.find(
		(entry) => entry.startMs <= timeMs && (timeMs < entry.endMs || entry.open),
	)
	return reign ? reign.nationId : null
}

function titleOf({
	store,
	stub,
	parents,
	timeMs,
	frame,
}: TitleParams): string | null {
	const female = stub.sex === 1
	const nationId = reigning(store, stub, timeMs)
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
		const realm = reigning(store, parent, timeMs)
		if (realm !== null)
			return `${female ? "Princess" : "Prince"} of ${frame.nations.get(realm)?.name ?? store.record.nations[realm]?.name ?? "the realm"}`
	}
	return null
}

function viewOf(
	store: PeopleStore,
	stub: PersonStub,
	timeMs: number,
	frame: WorldFrame,
) {
	const culture = frame.provinceCulture[stub.home] ?? -1
	return {
		character: PERSON_STUB.character({ store, stub }),
		age: Math.max(0, (timeMs - stub.birthMs) / YEAR),
		culture,
		religion: frame.provinceReligion[stub.home] ?? -1,
		heritage:
			culture >= 0 ? (store.record.heritageOfCulture[culture] ?? -1) : -1,
	}
}

function member({
	store,
	subject,
	stub,
	timeMs,
	frame,
	kin,
	spouse,
}: MemberParams): FamilyMember {
	const life = PERSON_STUB.life({ store, stub })
	const status = HEALTH.at({ life, timeMs }).band
	const names = PERSON_STUB.names({ store, stub })
	return {
		key: stub.key,
		name: names.name,
		house: names.house,
		female: stub.sex === 1,
		ageYears: (Math.min(timeMs, life.deathMs) - stub.birthMs) / YEAR,
		status,
		kinship: null,
		opinion:
			status === "Dead"
				? null
				: OPINION.of({
						observer: viewOf(store, subject, timeMs, frame),
						target: viewOf(store, stub, timeMs, frame),
						kin,
						spouse,
					}),
	}
}

function groups(
	store: PeopleStore,
	subject: PersonStub,
	timeMs: number,
	frame: WorldFrame,
	found: RelativesResult,
): FamilyGroup[] {
	const seen = new Set<PersonKey>()
	const build = (
		label: string,
		stubs: PersonStub[],
		kin: boolean,
		spouse: (stub: PersonStub) => boolean,
	): FamilyGroup => ({
		label,
		members: stubs
			.filter((stub) => {
				if (seen.has(stub.key)) return false
				seen.add(stub.key)
				return true
			})
			.map((stub) => ({
				...member({
					store,
					subject,
					stub,
					timeMs,
					frame,
					kin,
					spouse: spouse(stub),
				}),
				kinship: kinships.get(stub.key) ?? null,
			})),
	})
	const never = () => false
	const kinships = new Map(
		found.spouses.map((entry) => [entry.stub.key, entry.kinship] as const),
	)
	const current = new Set(
		found.spouses
			.filter((entry) => entry.current && !entry.concubine)
			.map((entry) => entry.stub.key),
	)
	return [
		build("Parents", found.parents, true, never),
		build("Siblings", found.fullSiblings, true, never),
		build("Half siblings", found.halfSiblings, true, never),
		build(
			"Spouses",
			found.spouses
				.filter((entry) => entry.current && !entry.concubine)
				.map((entry) => entry.stub),
			false,
			(stub) => current.has(stub.key),
		),
		build(
			"Concubines",
			found.spouses
				.filter((entry) => entry.current && entry.concubine)
				.map((entry) => entry.stub),
			false,
			never,
		),
		build(
			"Betrothed",
			found.spouses
				.filter((entry) => entry.betrothed)
				.map((entry) => entry.stub),
			false,
			never,
		),
		build(
			"Former spouses",
			found.spouses
				.filter((entry) => !entry.current && !entry.betrothed)
				.map((entry) => entry.stub),
			false,
			never,
		),
		build("Children", found.children, true, never),
	]
}

function conditionsOf(
	store: PeopleStore,
	stub: PersonStub,
	timeMs: number,
): ConditionView[] {
	const { levels } = HEALTH.at({
		life: PERSON_STUB.life({ store, stub }),
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
	side: (stub: PersonStub, male: string, female: string) => string,
): Map<PersonKey, string> {
	const relations = new Map<PersonKey, string>()
	for (const stub of found.grandparents)
		relations.set(stub.key, side(stub, "grandfather", "grandmother"))
	for (const stub of found.auncles)
		relations.set(stub.key, side(stub, "uncle", "aunt"))
	for (const stub of found.cousins) relations.set(stub.key, "cousin")
	for (const stub of found.nephews)
		relations.set(stub.key, side(stub, "nephew", "niece"))
	for (const stub of found.parents)
		relations.set(stub.key, side(stub, "father", "mother"))
	for (const stub of found.fullSiblings)
		relations.set(stub.key, side(stub, "brother", "sister"))
	for (const stub of found.halfSiblings)
		relations.set(stub.key, side(stub, "half-brother", "half-sister"))
	for (const stub of found.children)
		relations.set(stub.key, side(stub, "son", "daughter"))
	for (const entry of found.spouses)
		relations.set(
			entry.stub.key,
			entry.betrothed
				? side(entry.stub, "fiancé", "fiancée")
				: entry.concubine
					? "concubine"
					: side(entry.stub, "husband", "wife"),
		)
	return relations
}

function describer(
	store: PeopleStore,
	subject: PersonStub,
	found: RelativesResult,
): Describer {
	const relations = relationsOf(found, (stub, male, female) =>
		stub.sex === 1 ? female : male,
	)
	const row = (
		timeMs: number,
		type: string,
		parts: Array<string | PersonStub>,
	) => {
		const people: PersonRef[] = []
		const text = parts
			.map((part) => {
				if (typeof part === "string") return part
				const name = nameOf(store, part)
				const relation = relations.get(part.key)
				if (part.key === subject.key || !relation) return name
				people.push({ key: part.key, name })
				return `${name} (${relation})`
			})
			.join("")
		return { timeMs, type, text, people }
	}
	return { row }
}

function birthParts(
	store: PeopleStore,
	stub: PersonStub,
	marriage: Marriage | null,
): Array<string | PersonStub> {
	if (!marriage) return [stub, " was born"]
	return [
		stub,
		" was born to ",
		PERSON_STUB.of({ store, key: marriage.husband }),
		" and ",
		PERSON_STUB.of({ store, key: marriage.wife }),
	]
}

function deathCause(store: PeopleStore, stub: PersonStub): string | null {
	const life = PERSON_STUB.life({ store, stub })
	const chain = MARRIAGE.chain({ store, key: stub.key })
	const childbirth = chain.marriages.some((marriage) =>
		marriage.pregnancies.some(
			(pregnancy) =>
				pregnancy.outcome === "childbirth death" &&
				marriage.wife === stub.key &&
				pregnancy.dueMs === life.deathMs,
		),
	)
	return childbirth ? "Died in childbirth" : life.cause
}

function timelineOf(
	store: PeopleStore,
	subject: PersonStub,
	timeMs: number,
	found: RelativesResult,
): TimelineRow[] {
	const { row } = describer(store, subject, found)
	const rows: TimelineRow[] = []
	const life = PERSON_STUB.life({ store, stub: subject })
	rows.push(
		row(
			subject.birthMs,
			"Birth",
			birthParts(store, subject, marriageOf(store, subject)),
		),
	)
	for (const entry of life.rows) {
		if (entry.kind === "band" && entry.timeMs > subject.birthMs)
			rows.push(
				row(entry.timeMs, "Health", [
					subject,
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
						? [subject, ` developed ${label}`]
						: entry.after < 0
							? [subject, ` lost ${label}`]
							: [`${label} worsened to level ${entry.after + 1}`],
				),
			)
		}
	}
	const parsed = PERSON_KEY.parse(subject.key)
	if (parsed.tag === "R") {
		const fact = PEOPLE_STORE.index(store).facts.get(parsed.rulerId)
		for (const reign of fact?.reigns ?? []) {
			const realm = store.record.nations[reign.nationId]?.name ?? "a realm"
			rows.push(
				row(reign.startMs, "Reign", [subject, ` took the throne of ${realm}`]),
			)
			if (!reign.open)
				rows.push(
					row(reign.endMs, "Reign", [subject, ` left the throne of ${realm}`]),
				)
		}
	}
	const chain = MARRIAGE.chain({ store, key: subject.key })
	for (const marriage of chain.marriages) {
		const husband = PERSON_STUB.of({ store, key: marriage.husband })
		const wife = PERSON_STUB.of({ store, key: marriage.wife })
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
					? [husband, " and ", wife, " wed in a royal marriage"]
					: marriage.kind === "concubine"
						? [husband, " took ", wife, " as a concubine"]
						: marriage.kinship
							? [
									husband,
									" married ",
									wife,
									`, ${kinLabel(marriage, husband, wife)}`,
								]
							: [husband, " married ", wife],
			),
		)
		const spouse = husband.key === subject.key ? wife : husband
		const spouseLife = PERSON_STUB.life({ store, stub: spouse })
		if (
			spouseLife.deathMs <= life.deathMs &&
			spouseLife.deathMs > marriage.startMs
		)
			rows.push(
				row(spouseLife.deathMs, "Marriage", [
					subject,
					" was widowed by the death of ",
					spouse,
				]),
			)
		for (const pregnancy of marriage.pregnancies) {
			if (
				(pregnancy.outcome === "miscarriage" ||
					pregnancy.outcome === "stillbirth") &&
				wife.key === subject.key
			)
				rows.push(
					row(pregnancy.dueMs, "Children", [
						subject,
						` suffered a ${pregnancy.outcome} with `,
						husband,
					]),
				)
		}
		for (const child of marriage.children)
			rows.push(
				row(
					child.birthMs,
					"Children",
					birthParts(
						store,
						PERSON_STUB.of({ store, key: child.key }),
						marriage,
					),
				),
			)
	}
	for (const relative of [
		...found.parents,
		...found.fullSiblings,
		...found.halfSiblings,
		...found.children,
		...found.spouses.map((entry) => entry.stub),
	]) {
		const deathMs = PERSON_STUB.life({ store, stub: relative }).deathMs
		if (deathMs <= timeMs)
			rows.push(row(deathMs, "Family", [relative, " died"]))
	}
	const deathMs = life.deathMs
	if (deathMs <= timeMs)
		rows.push(
			row(deathMs, "Death", [
				subject,
				` died (${(deathCause(store, subject) ?? "natural causes").toLowerCase()})`,
			]),
		)
	return rows
		.filter((entry) => entry.timeMs <= Math.min(timeMs, life.deathMs))
		.sort((x, y) => x.timeMs - y.timeMs)
}

function page({
	store,
	key,
	timeMs,
	frameAt,
	doctrine,
	geography,
}: PersonQueryParams): PersonPage | null {
	store.context = { frameAt, doctrine, geography }
	let subject: PersonStub
	try {
		subject = PERSON_STUB.of({ store, key })
	} catch {
		return null
	}
	if (subject.birthMs > timeMs) return null
	store.builds.l3.add(key)
	const life = PERSON_STUB.life({ store, stub: subject })
	const frame = frameAt(timeMs)
	const birthFrame = frameAt(
		Math.min(
			store.record.maxTimeMs,
			Math.max(
				store.record.minTimeMs,
				Math.floor(subject.birthMs / BIRTH_FRAME_STEP) * BIRTH_FRAME_STEP,
			),
		),
	)
	const found = relatives(store, subject, timeMs)
	const names = PERSON_STUB.names({ store, stub: subject })
	const character = PERSON_STUB.character({ store, stub: subject })
	const age = (Math.min(timeMs, life.deathMs) - subject.birthMs) / YEAR
	const culture = birthFrame.provinceCulture[subject.home] ?? -1
	const religion = frame.provinceReligion[subject.home] ?? -1
	return {
		key,
		name: names.name,
		house: names.house,
		female: subject.sex === 1,
		birthMs: subject.birthMs,
		ageYears: age,
		status: HEALTH.at({ life, timeMs }).band,
		deathMs: life.deathMs,
		title: titleOf({
			store,
			stub: subject,
			parents: found.parents,
			timeMs,
			frame,
		}),
		cultureKey:
			culture >= 0 ? (birthFrame.cultures[culture]?.key ?? null) : null,
		rank: NOBILITY.rankLabel(
			subject,
			NOBILITY.tierOf({ store, stub: subject, timeMs }),
		),
		seatProvince: NOBILITY.seatOf({ store, stub: subject, timeMs }),
		religionId: religion,
		religionKey:
			religion >= 0 ? (frame.religions[religion]?.key ?? null) : null,
		culture: culture >= 0 ? (birthFrame.cultures[culture]?.name ?? null) : null,
		religion: religion >= 0 ? (frame.religions[religion]?.name ?? null) : null,
		orientation:
			age >= ORIENTATION.adultAge
				? ORIENTATION.of({ seed: PERSON_STUB.seedOf(store, key) })
				: null,
		personality: CHARACTER.activeTraits({ character, age }),
		grades: CHARACTER.gradeTraits(character),
		congenital: CHARACTER.congenitalTraits(character),
		conditions: conditionsOf(store, subject, timeMs),
		groups: groups(store, subject, timeMs, frame, found),
		timeline: timelineOf(store, subject, timeMs, found),
	}
}

function rulerKey(rulerId: number): PersonKey {
	return PERSON_KEY.ruler(rulerId)
}

function header({ store, key }: HeaderParams): PersonHeader {
	const stub = PERSON_STUB.of({ store, key })
	return { name: nameOf(store, stub), birthMs: stub.birthMs }
}

export const PERSON_QUERY = { page, header, rulerKey }

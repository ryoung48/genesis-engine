import type { PersonRelation } from "@/model/history/record/people/query/types"
import { TITLE_RECORD } from "@/model/history/record/titles"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import type { DeathCause } from "@/model/history/sim/people/log/types"
import { TITLES } from "@/model/society/titles"
import { TITLE_TIER_LABELS } from "@/ui/genesis/shared/title-colors"
import type {
	BuildPersonEventsParams,
	CreateContextParams,
	DescribeRowParams,
	PersonContext,
	RowEvent,
} from "@/ui/genesis/wiki-bridge/person-wiki-timeline/types"
import { TITLE_NAMES } from "@/ui/genesis/wiki-bridge/title-names"
import {
	joinWithAnd,
	paletteColorForDynasty,
	pushTimelineEvent,
	rgb255ToCss,
} from "@/ui/wiki/nation/timeline-formatting"
import type { WikiTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

const MS_PER_DAY = 86_400_000
const HEALTH_SCALE = 8

const RELATION_LABELS: Record<PersonRelation, string> = {
	father: "Their father",
	mother: "Their mother",
	spouse: "Their spouse",
	child: "Their child",
	sibling: "Their sibling",
	"half-sibling": "Their half-sibling",
}

const CAUSE_TEXT: Record<DeathCause, string> = {
	natural: "of natural causes",
	childhood: "in childhood",
	childbirth: "in childbirth",
}

const TITLE_CAUSE_TEXT: Record<string, string> = {
	division: "in a division of the realm",
	escheat: "by escheat",
	deposed: "on deposition",
	grant: "by a grant",
	reseat: "on moving the seat",
	holding: "as holdings changed",
}

const TYPE_OF_GROUP = { life: "Life", family: "Family", titles: "Title" }

function causeText(cause: string): string {
	return TITLE_CAUSE_TEXT[cause] ?? `(${cause})`
}

function describe({ row, context }: DescribeRowParams): RowEvent {
	const empty: RowEvent = {
		description: "",
		people: [],
		nations: [],
		provinces: [],
	}
	switch (row.kind) {
		case "born": {
			const parents = [row.father, row.mother]
				.filter((parent): parent is number => parent !== null)
				.map(context.personMention)
			return {
				...empty,
				description:
					parents.length > 0
						? `Born to ${joinWithAnd(parents.map((parent) => parent.name))}.`
						: "Born.",
				people: parents,
			}
		}
		case "health-declined":
			return {
				...empty,
				description: `Health worsened to ${LIFESPAN.bandNames[row.toBand]}.`,
			}
		case "died":
			return {
				...empty,
				description: `Died aged ${Math.floor(row.ageYears)}${row.inOffice ? " in office" : ""} ${CAUSE_TEXT[row.cause]}, health ${(row.deathHealth / HEALTH_SCALE).toFixed(1)}.`,
			}
		case "married": {
			const spouse = context.personMention(row.spouse)
			return {
				...empty,
				description: `Married ${spouse.name}.`,
				people: [spouse],
			}
		}
		case "child-born": {
			const child = context.personMention(row.child)
			return {
				...empty,
				description: `A child, ${child.name}, was born.`,
				people: [child],
			}
		}
		case "sibling-born": {
			const sibling = context.personMention(row.sibling)
			return {
				...empty,
				description: `A ${row.relation}, ${sibling.name}, was born.`,
				people: [sibling],
			}
		}
		case "kin-died": {
			const kin = context.personMention(row.kin)
			return {
				...empty,
				description: `${RELATION_LABELS[row.relation]}, ${kin.name}, died.`,
				people: [kin],
			}
		}
		case "tenure-start": {
			const province = context.provinceMention(row.seat)
			const realm = context.realmAt({ seat: row.seat, timeMs: row.timeMs })
			const nation = realm >= 0 ? context.nationMention(realm) : null
			const place = nation
				? `${province.name}, in ${nation.name}`
				: province.name
			const previous =
				row.previousHolder === null
					? null
					: context.personMention(row.previousHolder)
			return {
				...empty,
				description: row.sinceRecordStart
					? `Held the seat of ${place} at the start of the record.`
					: previous
						? `Succeeded ${previous.name} as ruler of ${place}.`
						: `Became ruler of ${place}.`,
				people: previous ? [previous] : [],
				nations: nation ? [nation] : [],
				provinces: [province],
			}
		}
		case "tenure-lost": {
			const province = context.provinceMention(row.seat)
			return {
				...empty,
				description: `Lost the seat of ${province.name}.`,
				provinces: [province],
			}
		}
		case "seat-moved": {
			const from = context.provinceMention(row.fromSeat)
			const to = context.provinceMention(row.toSeat)
			return {
				...empty,
				description: `Moved their seat from ${from.name} to ${to.name}.`,
				provinces: [from, to],
			}
		}
		case "titles-gained": {
			const from = context.provinceMention(row.fromSeat)
			return {
				...empty,
				description: `Gained the ${joinWithAnd(row.titles.map(context.titleLabel))} from ${from.name} ${causeText(row.cause)}.`,
				provinces: [from],
			}
		}
		case "titles-lost": {
			const to =
				row.toSeat === null ? null : context.provinceMention(row.toSeat)
			return {
				...empty,
				description: `Lost the ${joinWithAnd(row.titles.map(context.titleLabel))}${to ? ` to the ruler of ${to.name}` : ""} ${causeText(row.cause)}.`,
				provinces: to ? [to] : [],
			}
		}
		case "title-founded":
			return {
				...empty,
				description: `Founded the ${context.titleLabel(row.title)}.`,
			}
		case "title-dissolved":
			return {
				...empty,
				description: `The ${context.titleLabel(row.title)} was dissolved.`,
			}
	}
}

function build({
	rows,
	context,
}: BuildPersonEventsParams): WikiTimelineEvent[] {
	const events: WikiTimelineEvent[] = []
	for (const row of rows) {
		const event = describe({ row, context })
		pushTimelineEvent(events, {
			id: row.id,
			date: row.timeMs / MS_PER_DAY,
			type: TYPE_OF_GROUP[row.group],
			description: event.description,
			people: event.people,
			nations: event.nations,
			provinces: event.provinces,
		})
	}
	return events
}

const NEUTRAL_COLOR = "#94a3b8"

function createContext({
	state,
	names,
	getProvinceColor,
}: CreateContextParams): PersonContext {
	const record = state.record
	const people = record.people
	const seats = TITLE_NAMES.nameSeats({ record })
	const tiers = TITLE_NAMES.tiers({ record })
	const dynastyNames = new Map<number, string>()
	const dynastyName = (dynasty: number): string => {
		const cached = dynastyNames.get(dynasty)
		if (cached !== undefined) return cached
		const name = names.dynasty({
			dynastyIdx: dynasty,
			culture: people.dynastyCulture.get(dynasty) ?? -1,
		})
		dynastyNames.set(dynasty, name)
		return name
	}
	const dynastyColor = (dynasty: number): string =>
		paletteColorForDynasty(dynastyName(dynasty))
	const provinceName = (province: number): string =>
		state.provinceMeta[province]?.name ?? `Province ${province}`
	return {
		dynastyName,
		dynastyColor,
		personMention: (person) => ({
			id: person,
			name: names.person({
				personId: person,
				culture: people.culture[person],
				sex: people.sex[person] as 0 | 1,
			}),
			color: dynastyColor(people.dynasty[person]),
		}),
		nationMention: (nationId) => {
			const nation = record.nations[nationId]
			return {
				tag: String(nationId),
				name: nation?.name ?? `nation ${nationId}`,
				color: nation
					? rgb255ToCss([nation.color[0], nation.color[1], nation.color[2]])
					: NEUTRAL_COLOR,
			}
		},
		provinceMention: (seat) => ({
			id: seat,
			name: provinceName(seat),
			color: getProvinceColor(seat) ?? NEUTRAL_COLOR,
		}),
		titleLabel: (title) =>
			`${TITLE_TIER_LABELS[TITLES.tierOrder[tiers[title]]]} of ${provinceName(seats[title])}`,
		realmAt: ({ seat, timeMs }) =>
			TITLE_RECORD.realmAt({ record, holder: seat, timeMs }),
	}
}

export const PERSON_WIKI_TIMELINE = { build, createContext }

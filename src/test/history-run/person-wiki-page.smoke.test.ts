import { createElement, type ReactElement } from "react"
import { renderToString } from "react-dom/server"
import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { NAMES } from "@/model/society/language/names"
import { HISTORY_RUN } from "@/test/history-run"
import type { HistoryTimeline, SceneRef } from "@/ui/genesis/view/types"
import { useNationWikiData } from "@/ui/genesis/wiki-bridge/useNationWikiData"
import { usePersonWikiData } from "@/ui/genesis/wiki-bridge/usePersonWikiData"
import type { WikiRef } from "@/ui/genesis/wiki-stack/types"
import { NationWikiPage } from "@/ui/wiki/nation/NationWikiPage"
import { PersonWikiPage } from "@/ui/wiki/person/PersonWikiPage"

const SEED = 14963991

function escaped(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/'/g, "&#x27;")
		.replace(/"/g, "&quot;")
}

it("renders person and nation pages from a generated run", () => {
	const { world, state } = HISTORY_RUN.build({
		seed: SEED,
		era: "highMedieval",
		numPoints: 20000,
		years: 150,
	})
	const names = NAMES.createWorldNames(world)
	const record = state.record
	const people = record.people
	const opened: WikiRef[] = []
	const sceneRef: SceneRef = { current: null }
	const historyAt = (timeMs: number) =>
		({
			state,
			query: { frame: HISTORY.frameAt({ state, timeMs }) },
			selectedTimeMs: timeMs,
			setSelectedTimeMs: (): void => undefined,
			minTimeMs: record.minTimeMs,
			maxTimeMs: record.maxTimeMs,
			organizationReference: null,
			cultureNameById: null,
			cultureColorById: null,
			religionNameById: null,
			religionColorById: null,
			provinceMeta: state.provinceMeta,
		}) as unknown as HistoryTimeline
	const navigation = {
		backTitle: "Planet",
		openWikiPage: (ref: WikiRef) => {
			opened.push(ref)
		},
		backWikiPage: (): void => undefined,
	}
	const personHtml = (person: number, timeMs: number): string => {
		const Harness = (): ReactElement | null => {
			const data = usePersonWikiData({
				...navigation,
				selectedWikiPersonId: person,
				history: historyAt(timeMs),
				names,
				getProvinceColor: () => null,
				sceneRef,
			})
			return data ? createElement(PersonWikiPage, { person: data }) : null
		}
		return renderToString(createElement(Harness))
	}
	const late = record.maxTimeMs
	const early = record.minTimeMs + (record.maxTimeMs - record.minTimeMs) / 4
	const persons = new Set<number>()
	for (
		let tenure = 0;
		tenure < record.people.tenureCount && persons.size < 12;
		tenure += 7
	)
		persons.add(people.tenurePerson[tenure])
	for (
		let person = 0;
		person < people.count && persons.size < 30;
		person += Math.floor(people.count / 18)
	)
		persons.add(person)
	let dead = 0
	let unborn = 0
	for (const person of persons) {
		for (const at of [early, late]) {
			const html = personHtml(person, at)
			const name = names.person({
				personId: person,
				culture: people.culture[person],
				sex: people.sex[person] as 0 | 1,
			})
			expect(html, `person ${person} at ${at}`).toContain(escaped(name))
			expect(html).toContain("Health")
			expect(html).not.toContain("Person not found")
			if (html.includes("Not yet born")) unborn++
			if (html.includes("Died aged")) dead++
		}
	}
	expect(dead).toBeGreaterThan(0)
	expect(unborn).toBeGreaterThan(0)
	expect(personHtml(people.count + 3, late)).toContain("Person not found")

	const nationId = [
		...HISTORY.frameAt({ state, timeMs: late }).nations.values(),
	].find((nation) => nation.ruler)?.id
	if (nationId === undefined) throw new Error("No nation with a ruler")
	const nationHtml = (nation: number, timeMs: number): string => {
		const NationHarness = (): ReactElement | null => {
			const data = useNationWikiData({
				...navigation,
				selectedWikiNationId: nation,
				world,
				worldForDisplay: world,
				history: historyAt(timeMs),
				showObservedDistributions: false,
				names,
				getProvinceColor: () => null,
				sceneRef,
			})
			return data ? createElement(NationWikiPage, { nation: data }) : null
		}
		return renderToString(createElement(NationHarness))
	}
	const html = nationHtml(nationId, late)
	expect(html).toContain("Ruler")
	const rulerEvents = record.events.nationEvents[nationId]?.events.filter(
		(event) => event.kind === "rulerChange",
	)
	const last = rulerEvents?.at(-1)?.payload
	expect(typeof last?.personId).toBe("number")
	expect(
		PEOPLE_RECORD.has({ record: people, person: last?.personId as number }),
	).toBe(true)
	expect(html).toContain(escaped(String(last?.name)))

	let regencies = 0
	record.events.nationEvents.forEach((log, nation) => {
		for (const event of log?.events ?? []) {
			if (
				event.kind !== "rulerChange" ||
				event.payload.regent !== true ||
				regencies >= 3
			)
				continue
			const child = event.payload.personId as number
			const regencyHtml = nationHtml(nation, event.timeMs + 1)
			if (!regencyHtml.replace(/<!-- -->/g, "").includes("Regency Council for"))
				continue
			regencies++
			expect(regencyHtml).toContain(
				escaped(
					names.person({
						personId: child,
						culture: people.culture[child],
						sex: people.sex[child] as 0 | 1,
					}),
				),
			)
		}
	})
	expect(regencies).toBeGreaterThan(0)
}, 3_600_000)

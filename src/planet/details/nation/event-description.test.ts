import { describe, expect, it } from "vitest"
import type { HistoryNote } from "@/model/history/state"
import { YEAR_MS } from "@/model/history/state"
import {
	eventInvolvesNation,
	eventYear,
	getDisplayTags,
	getEventDescription,
	getEventDotColor,
} from "./event-description"

function makeEvent(
	tag: string,
	time: number,
	data: HistoryNote["data"],
): HistoryNote {
	return { tag, time, data }
}

const MONTH_MS = YEAR_MS / 12

const SPRING_WAR_START_PHRASES = [
	"in early spring",
	"following the spring thaw",
]
const AUTUMN_WAR_START_PHRASES = [
	"during the autumn campaign",
	"preceding the winter months",
]
const ATTACK_VICTORY_VERBS = [
	" defeated the forces of ",
	" successfully advanced against ",
	" won an engagement against ",
	" overcame the defenders of ",
]
const DEFEND_VICTORY_VERBS = [
	" successfully defended against ",
	" repelled the forces of ",
	" halted the advance of ",
	" repulsed the attack of ",
]
const ATTACK_DEFEAT_VERBS = [
	" was defeated by ",
	" was driven back by ",
	" was turned back by ",
	" suffered a tactical defeat against ",
]
const OPENING_BATTLE_PHRASES = [
	"the first engagement of the conflict",
	"opening hostilities",
	"the initial military action",
]
const LONG_WIN_STREAK_PHRASES = [
	"a 6th consecutive tactical victory",
	"5 successful engagements in a row",
]
const LONG_LOSING_STREAK_PHRASES = [
	"continuing a pattern of military setbacks",
	"a 5-battle strategic losing streak continues",
]
const NO_ODDS_PHRASES = [
	"despite severe numerical disadvantage",
	"in an unexpected tactical upset",
	"against unfavorable odds",
	"despite significant numerical superiority",
	"in a major logistical failure",
	"a notable tactical collapse",
	"leveraging strong numerical advantages",
	"a conventional outcome",
	"securing an expected victory",
]

function expectOneOf(text: string, phrases: string[]): void {
	expect(phrases.some((phrase) => text.includes(phrase))).toBe(true)
}

describe("getDisplayTags", () => {
	it("classifies battle results from the viewing nation's perspective", () => {
		const tags = getDisplayTags(
			makeEvent("battle", YEAR_MS, {
				winner: 4,
				victoryDegree: "decisive",
			}),
			4,
		)

		expect(tags).toEqual({
			primary: "Battle",
			secondary: "Decisive Victory",
			title: "Victory",
		})
	})

	it("labels war starts differently for attackers and defenders", () => {
		const event = makeEvent("war started", YEAR_MS, {
			attacker: 2,
			defender: 7,
			war: 3,
		})

		expect(getDisplayTags(event, 2)).toEqual({
			primary: "War",
			secondary: "Declared",
		})
		expect(getDisplayTags(event, 7)).toEqual({
			primary: "War",
			secondary: "Defending",
		})
	})

	it("classifies succession and subject-status events", () => {
		expect(
			getDisplayTags(makeEvent("succession", YEAR_MS, { nation: 3 }), 3),
		).toEqual({ primary: "Succession" })
		expect(
			getDisplayTags(
				makeEvent("vassalized", YEAR_MS, { overlord: 2, vassal: 5 }),
				5,
			),
		).toEqual({
			primary: "Vassal",
			secondary: "Became Subject",
		})
		expect(
			getDisplayTags(
				makeEvent("personal union formed", YEAR_MS, { senior: 2, junior: 5 }),
				5,
			),
		).toEqual({
			primary: "Personal Union",
			secondary: "Junior",
		})
		expect(
			getDisplayTags(makeEvent("regency ended", YEAR_MS, { nation: 9 }), 9),
		).toEqual({
			primary: "Regency",
			secondary: "Ended",
		})
	})

	it("covers war-end, rebellion, and fallback display tags", () => {
		expect(
			getDisplayTags(
				makeEvent("war ended", YEAR_MS, {
					attacker: 1,
					defender: 2,
					winner: 2,
				}),
				2,
			),
		).toEqual({
			primary: "War",
			secondary: "Won",
		})
		expect(
			getDisplayTags(
				makeEvent("rebellion", YEAR_MS, { overlord: 3, subject: 8 }),
				8,
			),
		).toEqual({
			primary: "Rebellion",
			secondary: "Freedom",
		})
		expect(getDisplayTags(makeEvent("treaty", YEAR_MS, {}), 1)).toEqual({
			primary: "treaty",
		})
	})

	it("covers battle fallback and alternate subject-role display tags", () => {
		expect(
			getDisplayTags(
				makeEvent("battle", YEAR_MS, {
					attacker: 3,
					defender: 4,
					winner: 4,
				}),
				3,
			),
		).toEqual({
			primary: "Battle",
			title: "Defeat",
		})
		expect(
			getDisplayTags(
				makeEvent("vassalage ended", YEAR_MS, { overlord: 2, vassal: 5 }),
				2,
			),
		).toEqual({
			primary: "Vassal",
			secondary: "Lost Subject",
		})
		expect(
			getDisplayTags(
				makeEvent("personal union formed", YEAR_MS, { senior: 2, junior: 5 }),
				2,
			),
		).toEqual({
			primary: "Personal Union",
			secondary: "Senior",
		})
		expect(
			getDisplayTags(makeEvent("regency started", YEAR_MS, { nation: 9 }), 9),
		).toEqual({ primary: "Regency" })
	})

	it("covers remaining outcome and subject-role display tags", () => {
		expect(
			getDisplayTags(
				makeEvent("battle", YEAR_MS, {
					attacker: 1,
					defender: 2,
					winner: 2,
					victoryDegree: "crushing",
				}),
				1,
			),
		).toEqual({
			primary: "Battle",
			secondary: "Crushing Defeat",
			title: "Defeat",
		})
		expect(
			getDisplayTags(
				makeEvent("war ended", YEAR_MS, {
					attacker: 1,
					defender: 2,
					winner: 2,
				}),
				1,
			),
		).toEqual({
			primary: "War",
			secondary: "Lost",
		})
		expect(
			getDisplayTags(
				makeEvent("rebellion", YEAR_MS, { overlord: 3, subject: 8 }),
				3,
			),
		).toEqual({
			primary: "Rebellion",
			secondary: "Subject",
		})
		expect(
			getDisplayTags(
				makeEvent("vassalized", YEAR_MS, { overlord: 2, vassal: 5 }),
				2,
			),
		).toEqual({
			primary: "Vassal",
			secondary: "Gained Subject",
		})
		expect(
			getDisplayTags(
				makeEvent("vassalage ended", YEAR_MS, { overlord: 2, vassal: 5 }),
				5,
			),
		).toEqual({
			primary: "Vassal",
			secondary: "Ended",
		})
		expect(
			getDisplayTags(
				makeEvent("personal union ended", YEAR_MS, { senior: 2, junior: 5 }),
				5,
			),
		).toEqual({
			primary: "Personal Union",
			secondary: "Ended",
		})
	})
})

describe("getEventDotColor", () => {
	it("flips battle colors for the losing viewer perspective", () => {
		const color = getEventDotColor(
			makeEvent("battle", YEAR_MS, {
				winner: 2,
				victoryDegree: "victory",
			}),
			1,
		)

		expect(color).toBe("#ef4444")
	})

	it("falls back to the neutral dot color for unknown event tags", () => {
		expect(getEventDotColor(makeEvent("mystery", 0, {}), 1)).toBe("#9ca3af")
	})

	it("uses mapped colors for reversals and non-battle events", () => {
		expect(
			getEventDotColor(
				makeEvent("battle", YEAR_MS, {
					winner: 2,
					victoryDegree: "decisive",
				}),
				1,
			),
		).toBe("#b91c1c")
		expect(
			getEventDotColor(makeEvent("regency started", YEAR_MS, { nation: 7 }), 7),
		).toBe("#a855f7")
	})

	it("falls back to the battle map color when no victory degree is present", () => {
		expect(
			getEventDotColor(
				makeEvent("battle", YEAR_MS, {
					attacker: 1,
					defender: 2,
					winner: 1,
				}),
				1,
			),
		).toBe("#60a5fa")
	})

	it("uses the degree color when the viewer won the battle", () => {
		expect(
			getEventDotColor(
				makeEvent("battle", YEAR_MS, {
					winner: 2,
					victoryDegree: "decisive",
				}),
				2,
			),
		).toBe("#059669")
	})
})

describe("getEventDescription", () => {
	it("describes battle outcomes with contextual odds, streak, and season phrases", () => {
		const battleTime = YEAR_MS / 12
		const pastEvents = [
			makeEvent("battle", 0, {
				war: 4,
				winner: 1,
			}),
			makeEvent("battle", YEAR_MS / 48, {
				war: 4,
				winner: 1,
			}),
			makeEvent("battle", YEAR_MS / 24, {
				war: 4,
				winner: 1,
			}),
		]

		const description = getEventDescription(
			makeEvent("battle", battleTime, {
				attacker: 1,
				defender: 9,
				winner: 1,
				victoryDegree: "victory",
				attackerCost: 5,
				defenderCost: 4,
				odds: 0.2,
				war: 4,
				province: 7,
			}),
			{ viewingNation: 1, pastEvents },
		)
		expect(description).toContain("#1")
		expect(description).toContain("#9")
		expect(description).toContain("province #7")
		expect(
			[
				"despite severe numerical disadvantage",
				"in an unexpected tactical upset",
				"against unfavorable odds",
			].some((phrase) => description.includes(phrase)),
		).toBe(true)
		expect(
			["a 4th consecutive tactical victory", "a 3-win streak"].some((phrase) =>
				description.includes(phrase),
			),
		).toBe(true)
		expect(
			[
				"during a winter campaign",
				"in winter conditions",
				"during the winter months",
			].some((phrase) => description.includes(phrase)),
		).toBe(true)
	})

	it("references prior hostilities when a new war restarts an old rivalry", () => {
		const description = getEventDescription(
			makeEvent("war started", 6 * YEAR_MS, {
				attacker: 4,
				defender: 6,
				war: 12,
			}),
			{
				viewingNation: 4,
				pastEvents: [
					makeEvent("war started", YEAR_MS, {
						attacker: 6,
						defender: 4,
						war: 2,
					}),
				],
			},
		)

		expect(description).toContain("#4 declared war on #6")
		expect(
			[
				"renewing previous hostilities",
				"in a continuation of prior conflict",
			].some((phrase) => description.includes(phrase)),
		).toBe(true)
	})

	it("describes annexations with duration context when a war ends", () => {
		const pastEvents = [
			makeEvent("war started", 0, {
				attacker: 1,
				defender: 2,
				war: 9,
			}),
		]

		const description = getEventDescription(
			makeEvent("war ended", 2 * YEAR_MS, {
				attacker: 1,
				defender: 2,
				winner: 1,
				war: 9,
				transferred: [4, 5],
			}),
			{ viewingNation: 1, pastEvents },
		)

		expect(description).toContain(
			"#1 won the war against #2, annexing 2 provinces",
		)
		expect(description).toContain("a 2-year conflict")
	})

	it("describes stalemates without annexation language", () => {
		const description = getEventDescription(
			makeEvent("war ended", 4 * YEAR_MS, {
				attacker: 1,
				defender: 3,
				winner: 3,
				war: 6,
				stalemate: "white peace",
			}),
			{ viewingNation: 1, pastEvents: [] },
		)

		expect(description).toContain(
			"The war between #1 and #3 ended (white peace)",
		)
		expect(description).not.toContain("annexing")
		expect(description).not.toContain("ceding")
	})

	it("calls out succession-crisis rebellions explicitly", () => {
		const description = getEventDescription(
			makeEvent("rebellion", YEAR_MS, {
				overlord: 3,
				subject: 8,
				succession: true,
			}),
			{ viewingNation: 3, pastEvents: [] },
		)

		expect(description).toBe(
			"#8 rebelled against #3 during a succession crisis.",
		)
	})

	it("describes losing battles with odds, streak, and spring campaign phrases", () => {
		const battleTime = 253
		const pastEvents = [
			makeEvent("battle", YEAR_MS / 40, { war: 5, winner: 2 }),
			makeEvent("battle", YEAR_MS / 30, { war: 5, winner: 2 }),
			makeEvent("battle", YEAR_MS / 20, { war: 5, winner: 2 }),
			makeEvent("battle", YEAR_MS / 10, { war: 5, winner: 2 }),
		]

		const description = getEventDescription(
			makeEvent("battle", battleTime, {
				attacker: 2,
				defender: 1,
				winner: 2,
				victoryDegree: "decisive",
				attackerCost: 18,
				defenderCost: 12,
				odds: 0.9,
				war: 5,
				province: 3,
			}),
			{ viewingNation: 1, pastEvents },
		)

		expect(description).toContain("#1")
		expect(description).toContain("province #3")
		expect(
			[
				"despite significant numerical superiority",
				"in a major logistical failure",
				"a notable tactical collapse",
			].some((phrase) => description.includes(phrase)),
		).toBe(true)
	})

	it("describes expected victories with dominant odds and major battle scale", () => {
		const description = getEventDescription(
			makeEvent("battle", YEAR_MS / 3, {
				attacker: 1,
				defender: 4,
				winner: 1,
				victoryDegree: "crushing",
				attackerCost: 20,
				defenderCost: 15,
				odds: 0.9,
				war: 8,
				province: 2,
			}),
			{ viewingNation: 1, pastEvents: [] },
		)

		expect(description).toContain("#1")
		expect(description).toContain("province #2")
		expect(
			[
				"leveraging strong numerical advantages",
				"a conventional outcome",
				"securing an expected victory",
			].some((phrase) => description.includes(phrase)),
		).toBe(true)
		expect(
			[
				"a large-scale battle",
				"a battle resulting in massive casualties",
				"a heavily destructive engagement",
			].some((phrase) => description.includes(phrase)),
		).toBe(true)
	})

	it("describes additional war-start and war-end outcomes", () => {
		const thirdWar = getEventDescription(
			makeEvent("war started", 8 * YEAR_MS, {
				attacker: 1,
				defender: 2,
				war: 9,
			}),
			{
				viewingNation: 1,
				pastEvents: [
					makeEvent("war started", YEAR_MS, {
						attacker: 1,
						defender: 2,
						war: 1,
					}),
					makeEvent("war started", 3 * YEAR_MS, {
						attacker: 2,
						defender: 1,
						war: 2,
					}),
				],
			},
		)
		expect(thirdWar).toContain("#1 declared war on #2")
		expect(
			["the third war between the two powers", "a recurring conflict"].some(
				(phrase) => thirdWar.includes(phrase),
			),
		).toBe(true)

		const shortWar = getEventDescription(
			makeEvent("war ended", YEAR_MS / 2, {
				attacker: 4,
				defender: 6,
				winner: 4,
				war: 11,
				transferred: [],
			}),
			{
				viewingNation: 4,
				pastEvents: [
					makeEvent("war started", YEAR_MS / 4, {
						attacker: 4,
						defender: 6,
						war: 11,
					}),
				],
			},
		)
		expect(shortWar).toContain(
			"The war between #4 and #6 ended without territorial change",
		)
		expect(
			["concluding rapidly", "a short-lived conflict"].some((phrase) =>
				shortWar.includes(phrase),
			),
		).toBe(true)

		const longWar = getEventDescription(
			makeEvent("war ended", 12 * YEAR_MS, {
				attacker: 7,
				defender: 8,
				winner: 8,
				war: 15,
				transferred: [4],
			}),
			{
				viewingNation: 8,
				pastEvents: [
					makeEvent("war started", 0, {
						attacker: 7,
						defender: 8,
						war: 15,
					}),
				],
			},
		)
		expect(longWar).toContain("#8 won the war against #7, annexing 1 province")
		expect(longWar).toContain("following 12 years of protracted warfare")
	})

	it("covers higher-order grudges, seasonal war starts, and losing cessions", () => {
		const recurring = getEventDescription(
			makeEvent("war started", (4 * YEAR_MS) / 12, {
				attacker: 3,
				defender: 9,
				war: 20,
			}),
			{
				viewingNation: 9,
				pastEvents: [
					makeEvent("war started", YEAR_MS, {
						attacker: 3,
						defender: 9,
						war: 1,
					}),
					makeEvent("war started", 2 * YEAR_MS, {
						attacker: 9,
						defender: 3,
						war: 2,
					}),
					makeEvent("war started", 3 * YEAR_MS, {
						attacker: 3,
						defender: 9,
						war: 3,
					}),
				],
			},
		)
		expect(recurring).toContain("#3 declared war on #9")
		expect(recurring).toContain(
			"4th instance of armed conflict between the nations",
		)

		const autumnLoss = getEventDescription(
			makeEvent("war ended", 10 * YEAR_MS, {
				attacker: 4,
				defender: 8,
				winner: 8,
				war: 21,
				transferred: [6, 7],
			}),
			{
				viewingNation: 4,
				pastEvents: [
					makeEvent("war started", 0, {
						attacker: 4,
						defender: 8,
						war: 21,
					}),
				],
			},
		)
		expect(autumnLoss).toContain(
			"#4 lost the war against #8, ceding 2 provinces",
		)
		expect(autumnLoss).toContain("after 10 years of hostilities")
	})

	it("covers losing-battle fallbacks and regency default ages", () => {
		const description = getEventDescription(
			makeEvent("battle", 5 * YEAR_MS, {
				attacker: 2,
				defender: 7,
				winner: 2,
				attackerCost: 1,
				defenderCost: 0,
				odds: 0.5,
				war: 30,
				province: 11,
			}),
			{ viewingNation: 7, pastEvents: [] },
		)

		expect(description).toContain("province #11")
		expect(description).not.toContain("despite")
		expect(description).not.toContain("streak")
		expect(
			getEventDescription(
				makeEvent("regency started", YEAR_MS, { nation: 4 }),
				{ viewingNation: 4, pastEvents: [] },
			),
		).toBe("A regency began for #4 (ruler aged 0).")
	})

	it("adds seeded spring and autumn campaign language to war declarations", () => {
		const springDescription = getEventDescription(
			makeEvent("war started", 3 * MONTH_MS + 1, {
				attacker: 2,
				defender: 5,
				war: 31,
			}),
			{ viewingNation: 2, pastEvents: [] },
		)
		expect(springDescription).toContain("#2 declared war on #5")
		expectOneOf(springDescription, SPRING_WAR_START_PHRASES)

		const autumnDescription = getEventDescription(
			makeEvent("war started", 9 * MONTH_MS + 1, {
				attacker: 7,
				defender: 4,
				war: 32,
			}),
			{ viewingNation: 4, pastEvents: [] },
		)
		expect(autumnDescription).toContain("#7 declared war on #4")
		expectOneOf(autumnDescription, AUTUMN_WAR_START_PHRASES)
	})

	it("varies grudge language by the number of prior wars", () => {
		const zeroGrudge = getEventDescription(
			makeEvent("war started", 7 * YEAR_MS, {
				attacker: 1,
				defender: 8,
				war: 40,
			}),
			{ viewingNation: 1, pastEvents: [] },
		)
		expect(zeroGrudge).toContain("#1 declared war on #8")
		expect(zeroGrudge).not.toContain("previous hostilities")
		expect(zeroGrudge).not.toContain("recurring conflict")
		expect(zeroGrudge).not.toContain("instance of armed conflict")

		const oneGrudge = getEventDescription(
			makeEvent("war started", 8 * YEAR_MS, {
				attacker: 1,
				defender: 8,
				war: 41,
			}),
			{
				viewingNation: 1,
				pastEvents: [
					makeEvent("war started", YEAR_MS, {
						attacker: 8,
						defender: 1,
						war: 1,
					}),
				],
			},
		)
		expectOneOf(oneGrudge, [
			"renewing previous hostilities",
			"in a continuation of prior conflict",
		])

		const twoGrudges = getEventDescription(
			makeEvent("war started", 9 * YEAR_MS, {
				attacker: 1,
				defender: 8,
				war: 42,
			}),
			{
				viewingNation: 1,
				pastEvents: [
					makeEvent("war started", YEAR_MS, {
						attacker: 1,
						defender: 8,
						war: 2,
					}),
					makeEvent("war started", 2 * YEAR_MS, {
						attacker: 8,
						defender: 1,
						war: 3,
					}),
				],
			},
		)
		expectOneOf(twoGrudges, [
			"the third war between the two powers",
			"a recurring conflict",
		])

		const manyGrudges = getEventDescription(
			makeEvent("war started", 10 * YEAR_MS, {
				attacker: 1,
				defender: 8,
				war: 43,
			}),
			{
				viewingNation: 1,
				pastEvents: [
					makeEvent("war started", YEAR_MS, {
						attacker: 1,
						defender: 8,
						war: 4,
					}),
					makeEvent("war started", 2 * YEAR_MS, {
						attacker: 8,
						defender: 1,
						war: 5,
					}),
					makeEvent("war started", 3 * YEAR_MS, {
						attacker: 1,
						defender: 8,
						war: 6,
					}),
				],
			},
		)
		expect(manyGrudges).toContain(
			"4th instance of armed conflict between the nations",
		)
	})

	it("uses attack-side default battle phrasing without odds flavor for opening clashes", () => {
		const description = getEventDescription(
			makeEvent("battle", 7 * MONTH_MS + 4, {
				attacker: 4,
				defender: 9,
				winner: 4,
				attackerCost: 5,
				defenderCost: 3,
				war: 44,
				province: 6,
			}),
			{ viewingNation: 4, pastEvents: [] },
		)

		expect(description).toContain("#4")
		expect(description).toContain("province #6")
		expectOneOf(description, ATTACK_VICTORY_VERBS)
		expectOneOf(description, OPENING_BATTLE_PHRASES)
		for (const phrase of NO_ODDS_PHRASES)
			expect(description).not.toContain(phrase)
	})

	it("uses defend-side default battle phrasing for long winning streaks", () => {
		const pastEvents = Array.from({ length: 5 }, (_, index) =>
			makeEvent("battle", (index + 1) * MONTH_MS, {
				war: 45,
				winner: 6,
			}),
		)

		const description = getEventDescription(
			makeEvent("battle", 8 * MONTH_MS + 4, {
				attacker: 3,
				defender: 6,
				winner: 6,
				attackerCost: 4,
				defenderCost: 2,
				war: 45,
				province: 10,
			}),
			{ viewingNation: 6, pastEvents },
		)

		expect(description).toContain("#6")
		expectOneOf(description, DEFEND_VICTORY_VERBS)
		expectOneOf(description, LONG_WIN_STREAK_PHRASES)
		for (const phrase of NO_ODDS_PHRASES)
			expect(description).not.toContain(phrase)
	})

	it("describes extended losing streaks after repeated defeats", () => {
		const pastEvents = Array.from({ length: 5 }, (_, index) =>
			makeEvent("battle", (index + 1) * MONTH_MS, {
				war: 46,
				winner: 9,
			}),
		)

		const description = getEventDescription(
			makeEvent("battle", 10 * MONTH_MS + 7, {
				attacker: 4,
				defender: 9,
				winner: 9,
				victoryDegree: "defeat",
				attackerCost: 6,
				defenderCost: 5,
				war: 46,
				province: 12,
			}),
			{ viewingNation: 4, pastEvents },
		)

		expect(description).toContain("#4")
		expectOneOf(description, ATTACK_DEFEAT_VERBS)
		expectOneOf(description, LONG_LOSING_STREAK_PHRASES)
	})

	it("describes protracted campaigns with shorter losing streaks", () => {
		const pastEvents = [
			makeEvent("battle", MONTH_MS, { war: 48, winner: 7 }),
			makeEvent("battle", 2 * MONTH_MS, { war: 48, winner: 5 }),
			makeEvent("battle", 3 * MONTH_MS, { war: 48, winner: 7 }),
			makeEvent("battle", 4 * MONTH_MS, { war: 48, winner: 5 }),
			makeEvent("battle", 5 * MONTH_MS, { war: 48, winner: 5 }),
			makeEvent("battle", 6 * MONTH_MS, { war: 48, winner: 7 }),
			makeEvent("battle", 7 * MONTH_MS, { war: 48, winner: 7 }),
			makeEvent("battle", 8 * MONTH_MS, { war: 48, winner: 7 }),
		]

		const description = getEventDescription(
			makeEvent("battle", 9 * MONTH_MS, {
				attacker: 5,
				defender: 7,
				winner: 7,
				victoryDegree: "defeat",
				war: 48,
				province: 14,
			}),
			{ viewingNation: 5, pastEvents },
		)

		expect(description).toContain("province #14")
		expectOneOf(description, [
			"a minor skirmish",
			"a probing action",
			"a limited engagement",
		])
		expectOneOf(description, ATTACK_DEFEAT_VERBS)
		expectOneOf(description, [
			"the 9th major engagement characterizing this protracted conflict",
			"a continuation of extended hostilities",
			"the 9th battle in a series of attritional clashes",
		])
		expectOneOf(description, [
			"a 4th consecutive tactical defeat",
			"a continuation of tactical losses",
		])
		for (const phrase of NO_ODDS_PHRASES)
			expect(description).not.toContain(phrase)
	})

	it("describes wars lasting more than twenty-five years", () => {
		const description = getEventDescription(
			makeEvent("war ended", 30 * YEAR_MS, {
				attacker: 2,
				defender: 5,
				winner: 2,
				war: 47,
				transferred: [11],
			}),
			{
				viewingNation: 2,
				pastEvents: [
					makeEvent("war started", 0, {
						attacker: 2,
						defender: 5,
						war: 47,
					}),
				],
			},
		)

		expect(description).toContain(
			"#2 won the war against #5, annexing 1 province",
		)
		expect(description).toContain("after an extended 30-year conflict")
	})

	it("omits streak language when the prior run is shorter than three battles", () => {
		const description = getEventDescription(
			makeEvent("battle", 4 * MONTH_MS, {
				attacker: 2,
				defender: 6,
				winner: 6,
				victoryDegree: "defeat",
				war: 49,
				province: 5,
			}),
			{
				viewingNation: 2,
				pastEvents: [
					makeEvent("battle", MONTH_MS, { war: 49, winner: 6 }),
					makeEvent("battle", 2 * MONTH_MS, { war: 49, winner: 6 }),
				],
			},
		)

		expect(description).toContain("province #5")
		expect(description).not.toContain("consecutive tactical defeat")
		expect(description).not.toContain("continuation of tactical losses")
	})

	it("filters unrelated grudges and uses singular cession language", () => {
		const warStart = getEventDescription(
			makeEvent("war started", 11 * YEAR_MS, {
				attacker: 4,
				defender: 6,
				war: 58,
			}),
			{
				viewingNation: 4,
				pastEvents: [
					makeEvent("battle", YEAR_MS, {
						war: 12,
						winner: 1,
					}),
					makeEvent("war started", 2 * YEAR_MS, {
						attacker: 4,
						defender: 6,
						war: 58,
					}),
					makeEvent("war started", 3 * YEAR_MS, {
						attacker: 6,
						defender: 4,
						war: 13,
					}),
					makeEvent("war started", 4 * YEAR_MS, {
						attacker: 1,
						defender: 9,
						war: 14,
					}),
				],
			},
		)
		expect(warStart).toContain("#4 declared war on #6")
		expectOneOf(warStart, [
			"renewing previous hostilities",
			"in a continuation of prior conflict",
		])

		const warEnd = getEventDescription(
			makeEvent("war ended", 6 * YEAR_MS, {
				attacker: 4,
				defender: 6,
				winner: 6,
				war: 59,
				transferred: [7],
			}),
			{
				viewingNation: 4,
				pastEvents: [
					makeEvent("war started", 0, {
						attacker: 4,
						defender: 6,
						war: 59,
					}),
				],
			},
		)
		expect(warEnd).toContain("#4 lost the war against #6, ceding 1 province")
	})

	it("describes diplomatic, regency, and fallback events directly", () => {
		const ctx: { viewingNation: number; pastEvents: HistoryNote[] } = {
			viewingNation: 1,
			pastEvents: [],
		}
		expect(
			getEventDescription(
				makeEvent("succession", YEAR_MS, {
					nation: 5,
					leader: 2,
					successor: 9,
				}),
				ctx,
			),
		).toBe("#5: leader #2 was succeeded by #9.")
		expect(
			getEventDescription(
				makeEvent("rebellion", YEAR_MS, { overlord: 3, subject: 8 }),
				ctx,
			),
		).toBe("#8 rebelled against #3.")
		expect(
			getEventDescription(
				makeEvent("vassalized", YEAR_MS, { overlord: 2, vassal: 5 }),
				ctx,
			),
		).toBe("#5 became a vassal of #2.")
		expect(
			getEventDescription(
				makeEvent("vassalage ended", YEAR_MS, { overlord: 2, vassal: 5 }),
				ctx,
			),
		).toBe("#5 ended its vassalage under #2.")
		expect(
			getEventDescription(
				makeEvent("personal union formed", YEAR_MS, { senior: 9, junior: 4 }),
				ctx,
			),
		).toBe(
			"A personal union formed between #4 as junior partner and #9 as senior partner.",
		)
		expect(
			getEventDescription(
				makeEvent("personal union ended", YEAR_MS, { senior: 9, junior: 4 }),
				ctx,
			),
		).toBe("The personal union between #4 and #9 ended.")
		expect(
			getEventDescription(
				makeEvent("alliance formed", YEAR_MS, { a: 1, b: 3 }),
				ctx,
			),
		).toBe("alliance formed")
		expect(
			getEventDescription(
				makeEvent("alliance broken", YEAR_MS, { a: 1, b: 3 }),
				ctx,
			),
		).toBe("alliance broken")
		expect(
			getEventDescription(
				makeEvent("regency started", YEAR_MS, { nation: 6, age: 12 }),
				ctx,
			),
		).toBe("A regency began for #6 (ruler aged 12).")
		expect(
			getEventDescription(
				makeEvent("regency ended", YEAR_MS, { nation: 6 }),
				ctx,
			),
		).toBe("The regency for #6 ended.")
		expect(getEventDescription(makeEvent("mystery", YEAR_MS, {}), ctx)).toBe(
			"mystery",
		)
	})
})

describe("eventInvolvesNation", () => {
	it("matches across the supported nation-role fields", () => {
		const event = makeEvent("personal union formed", YEAR_MS, {
			junior: 5,
			senior: 9,
		})

		expect(eventInvolvesNation(event, 5)).toBe(true)
		expect(eventInvolvesNation(event, 9)).toBe(true)
		expect(eventInvolvesNation(event, 2)).toBe(false)
	})

	it("checks every supported nation field", () => {
		expect(
			eventInvolvesNation(makeEvent("succession", YEAR_MS, { nation: 3 }), 3),
		).toBe(true)
		expect(
			eventInvolvesNation(
				makeEvent("war started", YEAR_MS, { attacker: 4, defender: 8 }),
				4,
			),
		).toBe(true)
		expect(
			eventInvolvesNation(
				makeEvent("war started", YEAR_MS, { attacker: 4, defender: 8 }),
				8,
			),
		).toBe(true)
		expect(
			eventInvolvesNation(makeEvent("battle", YEAR_MS, { winner: 6 }), 6),
		).toBe(true)
		expect(
			eventInvolvesNation(makeEvent("rebellion", YEAR_MS, { overlord: 7 }), 7),
		).toBe(true)
		expect(
			eventInvolvesNation(makeEvent("rebellion", YEAR_MS, { subject: 9 }), 9),
		).toBe(true)
		expect(
			eventInvolvesNation(makeEvent("vassalized", YEAR_MS, { vassal: 10 }), 10),
		).toBe(true)
	})
})

describe("eventYear", () => {
	it("rounds down to the containing simulation year", () => {
		expect(eventYear(makeEvent("war started", 2.75 * YEAR_MS, {}))).toBe(2)
	})

	it("treats exact year boundaries as the next simulation year", () => {
		expect(eventYear(makeEvent("war started", YEAR_MS, {}))).toBe(1)
	})
})

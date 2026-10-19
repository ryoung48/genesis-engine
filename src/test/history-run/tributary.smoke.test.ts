import { expect, it } from "vitest"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HISTORY_RUN } from "@/test/history-run"

function isolated(): {
	engine: ReturnType<typeof HISTORY_RUN.createEngine>["engine"]
	nations: [number, number, number]
} {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const nations = Array.from({ length: engine.P }, (_, p) => p)
		.filter(
			(p) => !engine.desolate[p] && STATE.isSovereign({ state: engine, p }),
		)
		.slice(0, 3)
	if (nations.length < 3) throw new Error("too few sovereigns")
	for (const a of nations)
		for (const b of nations)
			if (a < b) STATE.setRelation({ state: engine, a, b, rel: STATE.rel.NONE })
	for (const nation of nations) {
		const ruler = STATE.getRulerRelation({ state: engine, nation })
		if (ruler)
			STATE.setRelation({
				state: engine,
				a: nation,
				b: ruler.ruler,
				rel: STATE.rel.NONE,
			})
	}
	return { engine, nations: nations as [number, number, number] }
}

function govern({
	engine,
	nation,
	type,
}: {
	engine: ReturnType<typeof isolated>["engine"]
	nation: number
	type: "tribal_monarchy" | "feudal_monarchy"
}): void {
	FIELDS.prov.government.set({
		state: engine,
		p: nation,
		value: GOVERNMENT.getGovIdx()[type],
	})
}

it("binds a tribal realm's subject as a tributary and anyone else's as a vassal", () => {
	const { engine, nations } = isolated()
	const [overlord, subject, other] = nations
	for (const nation of nations)
		govern({ engine, nation, type: "feudal_monarchy" })
	VASSALAGE.bind({
		state: engine,
		vassal: subject,
		overlord,
		cause: "diplomacy",
	})
	expect(STATE.getRelation({ state: engine, a: subject, b: overlord })).toBe(
		STATE.rel.OVERLORD,
	)
	expect(STATE.getRelation({ state: engine, a: overlord, b: subject })).toBe(
		STATE.rel.VASSAL,
	)
	VASSALAGE.release({
		state: engine,
		vassal: subject,
		overlord,
		cause: "diplomacy",
	})

	govern({ engine, nation: overlord, type: "tribal_monarchy" })
	VASSALAGE.bind({
		state: engine,
		vassal: subject,
		overlord,
		cause: "diplomacy",
	})
	expect(STATE.getRelation({ state: engine, a: overlord, b: subject })).toBe(
		STATE.rel.TRIBUTARY,
	)
	expect(STATE.getRelation({ state: engine, a: subject, b: overlord })).toBe(
		STATE.rel.SUZERAIN,
	)
	expect(STATE.diplomaticOverlord({ state: engine, nation: subject })).toBe(
		overlord,
	)
	VASSALAGE.release({
		state: engine,
		vassal: subject,
		overlord,
		cause: "diplomacy",
	})
	expect(STATE.getRelation({ state: engine, a: overlord, b: subject })).toBe(
		STATE.rel.NONE,
	)

	govern({ engine, nation: overlord, type: "feudal_monarchy" })
	govern({ engine, nation: other, type: "tribal_monarchy" })
	VASSALAGE.bind({ state: engine, vassal: other, overlord, cause: "diplomacy" })
	expect(STATE.getRelation({ state: engine, a: overlord, b: other })).toBe(
		STATE.rel.TRIBUTARY,
	)
})

it("pays tribute like a vassal and withholds it from a rival", () => {
	const { engine, nations } = isolated()
	const [overlord, subject] = nations
	govern({ engine, nation: overlord, type: "tribal_monarchy" })
	STATE.setRelation({
		state: engine,
		a: subject,
		b: overlord,
		rel: STATE.rel.TRIBUTARY,
	})
	engine.time += STATE.yearMs
	TAX.runTax({
		state: engine,
		nation: subject,
		previousTime: engine.time - STATE.yearMs,
	})
	const payer = TREASURY_BUDGET.get({ state: engine, p: subject })
	expect(payer.tribute).toBeCloseTo(-0.1 * payer.taxes, 8)
	expect(
		TREASURY_BUDGET.get({ state: engine, p: overlord }).tributeReceived,
	).toBeCloseTo(-payer.tribute, 8)
	STATE.setDisposition({
		state: engine,
		a: subject,
		b: overlord,
		disposition: STATE.disp.RIVAL,
	})
	engine.time += STATE.yearMs
	TAX.runTax({
		state: engine,
		nation: subject,
		previousTime: engine.time - STATE.yearMs,
	})
	expect(TREASURY_BUDGET.get({ state: engine, p: subject }).tribute).toBe(0)
})

it("calls vassals into wars but never tributaries or their suzerains", () => {
	const { engine, nations } = isolated()
	const [overlord, subject, target] = nations
	for (const type of ["offensive", "defensive"] as const) {
		STATE.setRelation({
			state: engine,
			a: subject,
			b: overlord,
			rel: STATE.rel.VASSAL,
		})
		expect(
			STATE.getWarAllies({ state: engine, nation: overlord, type, target }),
		).toContain(subject)
		expect(
			STATE.getWarAllies({ state: engine, nation: subject, type, target }),
		).toContain(overlord)
		STATE.setRelation({
			state: engine,
			a: subject,
			b: overlord,
			rel: STATE.rel.TRIBUTARY,
		})
		expect(
			STATE.getWarAllies({ state: engine, nation: overlord, type, target }),
		).not.toContain(subject)
		expect(
			STATE.getWarAllies({ state: engine, nation: subject, type, target }),
		).not.toContain(overlord)
	}
})

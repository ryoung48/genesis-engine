import { describe, expect, it } from "vitest"
import { WIKI_STACK } from "@/ui/genesis/wiki-stack"
import type { WikiRef } from "@/ui/genesis/wiki-stack/types"

const nation = (id: number): WikiRef => ({
	kind: "nation",
	id,
	title: `Nation ${id}`,
})
const war = (id: number): WikiRef => ({ kind: "war", id, title: `War ${id}` })
const person = (id: number): WikiRef => ({
	kind: "person",
	id,
	title: `Person ${id}`,
})

describe("wiki stack", () => {
	it("pushes pages and pops back one at a time", () => {
		let stack: WikiRef[] = []
		stack = WIKI_STACK.open({ stack, ref: nation(1) })
		stack = WIKI_STACK.open({ stack, ref: war(2) })
		expect(WIKI_STACK.top({ stack })).toEqual(war(2))
		stack = WIKI_STACK.back({ stack })
		expect(WIKI_STACK.top({ stack })).toEqual(nation(1))
		stack = WIKI_STACK.back({ stack })
		expect(stack).toEqual([])
		expect(WIKI_STACK.top({ stack })).toBeNull()
		expect(WIKI_STACK.back({ stack })).toEqual([])
	})

	it("ignores opening the page already on top but pushes a page seen deeper", () => {
		let stack = [nation(1), war(2)]
		expect(WIKI_STACK.open({ stack, ref: war(2) })).toBe(stack)
		stack = WIKI_STACK.open({ stack, ref: nation(1) })
		expect(stack.map(WIKI_STACK.keyOf)).toEqual([
			"nation:1",
			"war:2",
			"nation:1",
		])
	})

	it("drops the oldest entry past the cap", () => {
		let stack: WikiRef[] = []
		for (let i = 0; i < 40; i++)
			stack = WIKI_STACK.open({ stack, ref: person(i % 2 === 0 ? 1 : 2) })
		expect(stack.length).toBe(30)
		stack = WIKI_STACK.open({ stack: [], ref: nation(9) })
		for (let i = 0; i < 30; i++)
			stack = WIKI_STACK.open({ stack, ref: person(i) })
		expect(stack.length).toBe(30)
		expect(WIKI_STACK.keyOf(stack[0])).toBe("person:0")
	})

	it("names the page a back link returns to", () => {
		const stack = [nation(1), war(2), person(3)]
		expect(WIKI_STACK.backTitle({ stack, planetTitle: "Earth" })).toBe("War 2")
		expect(
			WIKI_STACK.backTitle({ stack: [nation(1)], planetTitle: "Earth" }),
		).toBe("Earth")
	})

	it("selects only the kind on top", () => {
		expect(WIKI_STACK.selection({ stack: [nation(1), war(2)] })).toEqual({
			nationId: null,
			organizationId: null,
			warId: 2,
			personId: null,
		})
		expect(WIKI_STACK.selection({ stack: [] })).toEqual({
			nationId: null,
			organizationId: null,
			warId: null,
			personId: null,
		})
	})
})

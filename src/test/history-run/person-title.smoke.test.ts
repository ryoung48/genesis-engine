import { expect, it } from "vitest"
import { PERSON_TITLE } from "@/ui/genesis/wiki-bridge/person-title"
import type { PersonTitleParams } from "@/ui/genesis/wiki-bridge/person-title/types"

const base: PersonTitleParams = {
	female: false,
	tier: null,
	royalParent: null,
	regency: null,
	crown: false,
}

it("titles sovereigns by their highest tier, then royal children, then nobles", () => {
	expect(PERSON_TITLE.of({ ...base, tier: "county" })).toBe("Count")
	expect(PERSON_TITLE.of({ ...base, tier: "duchy", female: true })).toBe(
		"Duchess",
	)
	expect(PERSON_TITLE.of({ ...base, tier: "kingdom", female: true })).toBe(
		"Queen",
	)
	expect(PERSON_TITLE.of({ ...base, tier: "empire", female: true })).toBe(
		"Empress",
	)
	expect(PERSON_TITLE.of(base)).toBe("Noble")
	expect(
		PERSON_TITLE.of({ ...base, tier: "county", royalParent: "kingdom" }),
	).toBe("Count")
	expect(PERSON_TITLE.of({ ...base, royalParent: "kingdom" })).toBe("Prince")
	expect(
		PERSON_TITLE.of({
			...base,
			royalParent: "empire",
			female: true,
		}),
	).toBe("Princess")
	expect(
		PERSON_TITLE.of({ ...base, royalParent: "kingdom", crown: true }),
	).toBe("Crown Prince")
	expect(
		PERSON_TITLE.of({
			...base,
			royalParent: "kingdom",
			crown: true,
			female: true,
		}),
	).toBe("Crown Princess")
	expect(PERSON_TITLE.of({ ...base, royalParent: "duchy" })).toBe("Noble")
})

it("titles a regent as a protector, or a dowager when governing for their own child", () => {
	const regent = { tier: "kingdom", mother: false } as const
	expect(PERSON_TITLE.of({ ...base, regency: regent })).toBe("Lord Protector")
	expect(PERSON_TITLE.of({ ...base, female: true, regency: regent })).toBe(
		"Lady Protector",
	)
	for (const [tier, title] of [
		["county", "Dowager Countess"],
		["duchy", "Dowager Duchess"],
		["kingdom", "Queen Dowager"],
		["empire", "Empress Dowager"],
		["hegemony", "Empress Dowager"],
	] as const)
		expect(
			PERSON_TITLE.of({
				...base,
				female: true,
				regency: { tier, mother: true },
			}),
		).toBe(title)
	expect(
		PERSON_TITLE.of({
			...base,
			tier: "kingdom",
			female: true,
			regency: { tier: "empire", mother: true },
		}),
	).toBe("Queen")
})

it("names the eldest living son the crown, else the eldest daughter", () => {
	const children = [
		{ id: 1, female: true, birthTimeMs: 1 },
		{ id: 2, female: false, birthTimeMs: 5 },
		{ id: 3, female: false, birthTimeMs: 9 },
	]
	expect(PERSON_TITLE.isCrown({ person: 2, children })).toBe(true)
	expect(PERSON_TITLE.isCrown({ person: 1, children })).toBe(false)
	expect(PERSON_TITLE.isCrown({ person: 3, children })).toBe(false)
	expect(PERSON_TITLE.isCrown({ person: 1, children: [children[0]] })).toBe(
		true,
	)
})

import { expect, it } from "vitest"
import { PERSON_TITLE } from "@/ui/genesis/wiki-bridge/person-title"
import type { PersonTitleParams } from "@/ui/genesis/wiki-bridge/person-title/types"

const base: PersonTitleParams = {
	female: false,
	hasHouse: true,
	tier: null,
	royalParent: null,
	crown: false,
}

it("titles a person by their highest tier, then royal birth, then house", () => {
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
	expect(PERSON_TITLE.of({ ...base, hasHouse: false })).toBe("Low born")
	expect(PERSON_TITLE.of({ ...base, royalParent: "kingdom" })).toBe("Prince")
	expect(
		PERSON_TITLE.of({
			...base,
			royalParent: "empire",
			female: true,
			tier: "county",
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

it("names the eldest living son the crown, else the eldest daughter", () => {
	const child = (id: number, female: boolean, birthTimeMs: number) => ({
		id,
		female,
		birthTimeMs,
	})
	const children = [child(1, true, 1), child(2, false, 5), child(3, false, 9)]
	expect(PERSON_TITLE.isCrown({ person: 2, children })).toBe(true)
	expect(PERSON_TITLE.isCrown({ person: 1, children })).toBe(false)
	expect(PERSON_TITLE.isCrown({ person: 3, children })).toBe(false)
	expect(
		PERSON_TITLE.isCrown({ person: 1, children: [child(1, true, 1)] }),
	).toBe(true)
})

import { describe, expect, it } from "vitest"
import {
	assignCultureGenderSystems,
	CULTURE_GENDER_SYSTEM,
	resolveLeaderGender,
} from "./gender-system"

describe("gender-system", () => {
	it("assigns culture gender systems deterministically", () => {
		expect(Array.from(assignCultureGenderSystems(8, 1234))).toEqual(
			Array.from(assignCultureGenderSystems(8, 1234)),
		)
	})

	it("keeps generated culture systems within the supported enum range", () => {
		expect(Array.from(assignCultureGenderSystems(64, 7))).toSatisfy((systems) =>
			systems.every(
				(system: number) =>
					system === CULTURE_GENDER_SYSTEM.PATRIARCHAL ||
					system === CULTURE_GENDER_SYSTEM.EQUAL ||
					system === CULTURE_GENDER_SYSTEM.MATRIARCHAL,
			),
		)
	})

	it("resolves leader gender from culture system and seed", () => {
		expect(resolveLeaderGender(CULTURE_GENDER_SYSTEM.PATRIARCHAL, 99)).toBe(
			resolveLeaderGender(CULTURE_GENDER_SYSTEM.PATRIARCHAL, 99),
		)
		expect(resolveLeaderGender(CULTURE_GENDER_SYSTEM.MATRIARCHAL, 99)).not.toBe(
			resolveLeaderGender(CULTURE_GENDER_SYSTEM.PATRIARCHAL, 99),
		)
	})
})

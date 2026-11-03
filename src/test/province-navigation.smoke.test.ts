import { expect, it } from "vitest"
import { PROVINCE_SELECTION } from "@/ui/genesis/shared/province-selection"

it("routes Nations to the owner and all other modes to a province without requiring history", () => {
	const base = {
		province: 3,
		owner: 7,
		colorMode: "nations" as const,
		toolActive: false,
	}
	expect(PROVINCE_SELECTION.clickTarget(base)).toEqual({
		kind: "nation",
		id: 7,
	})
	expect(PROVINCE_SELECTION.clickTarget({ ...base, owner: null })).toEqual({
		kind: "province",
		id: 3,
	})
	expect(
		PROVINCE_SELECTION.clickTarget({ ...base, colorMode: "precipitation" }),
	).toEqual({ kind: "province", id: 3 })
	expect(
		PROVINCE_SELECTION.clickTarget({ ...base, colorMode: "temperature" }),
	).toEqual({ kind: "province", id: 3 })
	expect(
		PROVINCE_SELECTION.clickTarget({ ...base, toolActive: true }).kind,
	).toBe("none")
	expect(PROVINCE_SELECTION.clickTarget({ ...base, province: null }).kind).toBe(
		"none",
	)
})

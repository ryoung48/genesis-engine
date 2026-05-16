import { describe, expect, it, vi } from "vitest"
import { createDrawerNationClickHandler } from "./nation-clicks"

describe("createDrawerNationClickHandler", () => {
	it("opens the drawer and focuses the requested nation", () => {
		const openDetailsDrawer = vi.fn()
		const focusOnNation = vi.fn()
		const handler = createDrawerNationClickHandler({
			openDetailsDrawer,
			focusOnNation,
		})

		handler(12)

		expect(openDetailsDrawer).toHaveBeenCalledTimes(1)
		expect(focusOnNation).toHaveBeenCalledTimes(1)
		expect(focusOnNation).toHaveBeenCalledWith(12)
	})
})

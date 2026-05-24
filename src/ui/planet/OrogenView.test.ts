import { describe, expect, it } from "vitest"
import { buildMapExportFilename } from "./OrogenView"

describe("buildMapExportFilename", () => {
	it("uses the current planet code when present", () => {
		expect(
			buildMapExportFilename(
				"AB_cd:12",
				4096,
				new Date("2026-05-24T12:00:00Z"),
			),
		).toBe("genesis-map-ab-cd-12-4096w.png")
	})

	it("falls back to a timestamp when there is no planet code", () => {
		expect(
			buildMapExportFilename("", 2048, new Date("2026-05-24T12:34:56.789Z")),
		).toBe("genesis-map-2026-05-24T12-34-56-789Z-2048w.png")
	})
})

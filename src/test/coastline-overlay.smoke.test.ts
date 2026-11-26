import { expect, it } from "vitest"
import { buildCoastlineMapLines } from "@/ui/genesis/renderer/coastline-overlay"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"

it("splits a mesh boundary across the map seam", () => {
	const lines = buildCoastlineMapLines(
		{ rings: [[179, 70, -179, 72]] },
		createMapProjection(0),
		0,
		[800, 600],
	)
	const starts = lines.geometry.getAttribute("instanceStart")
	const ends = lines.geometry.getAttribute("instanceEnd")
	expect(starts.count).toBe(2)
	expect(ends.getX(0)).toBeCloseTo(2)
	expect(starts.getX(1)).toBeCloseTo(-2)
	expect(ends.getY(0)).toBeCloseTo(starts.getY(1))
	lines.geometry.dispose()
	lines.material.dispose()
})

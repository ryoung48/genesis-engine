// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { WORLD } from "@/model"
import { SHAPER_CONTINENTS } from "@/model/shapers/continents"
import { SHAPER_MOUNTAINS } from "@/model/shapers/topagraphy"
import { SHAPER_CLIMATES } from "@/model/shapers/climate"
import { SHAPER_PARTITIONS } from "@/model/shapers/partitions"
import { HISTORY } from "@/model/history"
import { SHAPER_DISPLAY } from "@/model/shapers/display"

const buildWorld = (landFraction: number) => {
	window.world = WORLD.spawn({
		seed: "6616826c",
		obliquity: 23.5,
		eccentricity: 0.017,
		perihelion: 102,
		tSun: 5778,
		landFraction,
	})
	SHAPER_CONTINENTS.build(landFraction)
	SHAPER_MOUNTAINS.build()
	SHAPER_CLIMATES.build()
	SHAPER_PARTITIONS.build()
	HISTORY.init()
}

describe("SHAPER_DISPLAY.build", () => {
	it(
		"builds display for seed 6616826c without errors",
		() => {
			buildWorld(0.3)

			// Verify depth assignments
			const landmarks = window.world.landmarks
			const depth0Water = WORLD.landmarks("water").filter(
				(i) => (landmarks[i].depth ?? 0) === 0,
			)
			// Ocean world — all land should be depth >= 1
			if (depth0Water.length > 0) {
				const depth0Land = WORLD.landmarks("land").filter(
					(i) => (landmarks[i].depth ?? 0) === 0,
				)
				expect(depth0Land.length).toBe(0)
			}

			expect(() => SHAPER_DISPLAY.build()).not.toThrow()

			// Verify segments have valid depth fields and non-empty paths
			for (const seg of Object.values(window.world.display.islands)) {
				expect(seg.depth).toBeGreaterThanOrEqual(1)
				expect(seg.path.length).toBeGreaterThan(0)
			}
			for (const seg of Object.values(window.world.display.lakes)) {
				expect(seg.depth).toBeGreaterThanOrEqual(1)
				expect(seg.path.length).toBeGreaterThan(0)
			}
		},
		30000,
	)

	it(
		"builds with 60% land without culture errors",
		() => {
			buildWorld(0.6)

			// Every non-desolate province must have a valid culture
			const orphans = window.world.provinces.filter(
				(p) => !p.desolate && p.culture === -1,
			)
			expect(orphans.length).toBe(0)

			expect(() => SHAPER_DISPLAY.build()).not.toThrow()
		},
		30000,
	)

	it(
		"builds with 80% land without errors",
		() => {
			buildWorld(0.8)

			// No landmarks with deleted parents
			const deletedParents = Object.entries(window.world.landmarks).filter(
				([, lm]) => lm.parent !== undefined && !window.world.landmarks[lm.parent],
			)
			expect(deletedParents.length).toBe(0)

			const orphans = window.world.provinces.filter(
				(p) => !p.desolate && p.culture === -1,
			)
			expect(orphans.length).toBe(0)

			expect(() => SHAPER_DISPLAY.build()).not.toThrow()

			// Every depth > 0 landmark with a display segment must have a valid parent
			const { landmarks } = window.world
			const { islands, lakes } = window.world.display
			const noParent: { idx: number; type: string; depth: number; water: boolean }[] = []
			for (const seg of [...Object.values(islands), ...Object.values(lakes)]) {
				const lm = landmarks[seg.idx]
				if (!lm) continue
				if ((lm.depth ?? 0) > 0 && lm.parent === undefined) {
					noParent.push({ idx: seg.idx, type: lm.type, depth: lm.depth, water: lm.water })
				}
			}
			if (noParent.length > 0) {
				console.log("Landmarks with depth > 0 but no parent:", JSON.stringify(noParent))
			}
			expect(noParent.length).toBe(0)
		},
		60000,
	)
})

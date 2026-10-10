import { it } from "vitest"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import { DEJURE } from "@/model/society/dejure"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

it("times dejure build", () => {
	const w = GENERATE_WORLD.generateGenesisWorld({
		params: {
			...DEFAULT_WORLD_PARAMS,
			seed: 42,
			numPoints: 204000,
			tideLock: null,
			historyPipeline: "distribution",
		},
	})
	const p = w.provinces
	const pop = w.population
	if (!p || !pop) throw new Error("missing")
	const active = Uint8Array.from(p.desolate, (d) => (d ? 0 : 1))
	for (let i = 0; i < 3; i++) {
		const t = performance.now()
		const titles = DEJURE.build({
			adjOffset: p.adjOffset,
			adjList: p.adjList,
			active,
			habitability: pop.habitability,
			waterAccess: p.waterAccess,
			provinceCount: p.count,
		})
		console.log(
			"DEJURE.build ms",
			(performance.now() - t).toFixed(1),
			"titles",
			titles.count,
			"provinces",
			p.count,
		)
	}
})

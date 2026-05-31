import { describe, expect, it } from "vitest"
import { decodePlanetCode } from "@/model/shared/planet-code"
import { generateOrogenWorld } from "./generate-world"

const PLANET_CODE = "8wqaf.0t235xojuv6uxcdkkrxdek0h1a9f1d46nrl"

describe("inspect nation", () => {
	it("finds trading companies with non-ocean capital", () => {
		const decoded = decodePlanetCode(PLANET_CODE)
		if (!decoded) throw new Error(`Invalid planet code: ${PLANET_CODE}`)

		const params = {
			...decoded,
			era: "industrial" as const,
		}

		const world = generateOrogenWorld(params)

		expect(world.nations).toBeDefined()
		expect(world.provinces).toBeDefined()
		expect(world.waterAccess).toBeDefined()

		const nations = world.nations!

		const colonyNations: Array<{
			nation: number
			colonizer: number
			capitalProvince: number
			capitalWaterAccess: number
			govType: number
		}> = []

		for (let n = 0; n < nations.count; n++) {
			const col = nations.nationColonizer?.[n]
			if (col === undefined || col < 0) continue
			const seed = nations.seeds[n]
			colonyNations.push({
				nation: n,
				colonizer: col,
				capitalProvince: seed,
				capitalWaterAccess: world.waterAccess?.[seed] ?? -1,
				govType: nations.governmentType?.[seed] ?? -1,
			})
		}

		console.info(`Real colonies (via nationColonizer): ${colonyNations.length}`)
		console.table(colonyNations)
	}, 600_000)
})

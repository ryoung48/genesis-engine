import type { ProvinceMeasures } from "@/model/society/farming/measures/types"
import { MIGRATION } from "@/model/society/migration"
import type { MigrationOutput } from "@/model/society/migration/types"
import type {
	FarmingMeasuresParams,
	FarmingWorldParams,
} from "@/test/history-run/fixtures/farming/types"
import { MIGRATION_FIXTURE } from "@/test/history-run/fixtures/migration"
import type { MigrationWorld } from "@/test/history-run/fixtures/migration/types"

const EARLY_YEAR = -80000

function measures({
	count,
	overrides,
}: FarmingMeasuresParams): ProvinceMeasures {
	const fill = (value: number) => new Float64Array(count).fill(value)
	const defaults = {
		areaKm2: 10000,
		T: 15,
		P: 800,
		arid: 1,
		seas: 0.5,
		range: 15,
		Tc: 5,
		relief: 0.3,
		npp: 1000,
		gdd: 2000,
		forager: 0.01,
		floodShare: 0,
		pasture: 0.5,
	}
	const merged = { ...defaults, ...overrides }
	return {
		count,
		areaKm2: fill(merged.areaKm2),
		T: fill(merged.T),
		P: fill(merged.P),
		arid: fill(merged.arid),
		seas: fill(merged.seas),
		range: fill(merged.range),
		Tc: fill(merged.Tc),
		relief: fill(merged.relief),
		npp: fill(merged.npp),
		gdd: fill(merged.gdd),
		forager: fill(merged.forager),
		floodShare: fill(merged.floodShare),
		pasture: fill(merged.pasture),
	}
}

function world({ layout, stepDegrees }: FarmingWorldParams): {
	world: MigrationWorld
	migration: MigrationOutput
} {
	const source = MIGRATION_FIXTURE.world({
		layout,
		stepDegrees,
		habitability: [...layout].filter((c) => c === "L").map(() => 1),
		horizonYear: 2025,
	})
	const output = MIGRATION.compute(source)
	const count = source.provinces.count
	return {
		world: source,
		migration: {
			...output,
			result: {
				...output.result,
				continuousArrival: new Float64Array(count).fill(EARLY_YEAR),
				arrivalYear: new Int32Array(count).fill(EARLY_YEAR),
				suitability: new Float64Array(count).fill(1),
			},
		},
	}
}

export const FARMING_FIXTURE = { measures, world }

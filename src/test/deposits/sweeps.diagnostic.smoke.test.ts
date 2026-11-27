import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { DEPOSITS } from "@/model/geography/terrain/deposits"
import { COMMODITIES } from "@/model/geography/terrain/deposits/commodities"
import type { CommodityId } from "@/model/geography/terrain/deposits/commodities/types"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import type { SystemId } from "@/model/geography/terrain/deposits/systems/types"
import type { GenesisWorld } from "@/model/pipelines/types"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = [14963991, 20251107, 77031]

type Range = readonly [number, number]

interface Sweep {
	knob: string
	values: readonly (Range | number)[]
	apply: (value: Range | number) => void
	commodities: CommodityId[]
	systems: SystemId[]
}

const MUTABLE = DEPOSIT_CONFIG as unknown as {
	placerDischarge: Range
	ironstoneOutcrop: number
	sandCoast: Range
	oilArch: number
}

const SWEEPS: Sweep[] = [
	{
		knob: "PLACER_Q",
		values: [
			[250, 2000],
			[1000, 4000],
			[4000, 8000],
		],
		apply: (v) => {
			MUTABLE.placerDischarge = v as Range
		},
		commodities: ["gold", "tin", "gems"],
		systems: ["placerGold", "placerTin", "placerDiamond", "gemPlacer"],
	},
	{
		knob: "IRONSTONE_OUTCROP",
		values: [0.2, 0.1, 0.4],
		apply: (v) => {
			MUTABLE.ironstoneOutcrop = v as number
		},
		commodities: ["iron"],
		systems: ["ironstone"],
	},
	{
		knob: "SAND_COAST",
		values: [
			[50, 80],
			[40, 70],
			[60, 90],
		],
		apply: (v) => {
			MUTABLE.sandCoast = v as Range
		},
		commodities: ["sand"],
		systems: ["sand"],
	},
	{
		knob: "OIL_ARCH",
		values: [0.5, 0.3, 0.7],
		apply: (v) => {
			MUTABLE.oilArch = v as number
		},
		commodities: ["oilAndGas"],
		systems: ["oil", "gas"],
	},
]

function reach(g: { poor: number; moderate: number; rich: number }): number {
	return g.poor + g.moderate + g.rich
}

function compute(world: GenesisWorld) {
	const tectonics = world.presentTectonics
	const sand = world.groundwater?.sand
	if (
		!tectonics ||
		!sand ||
		!world.rock ||
		!world.youngKind ||
		!world.glaciated
	)
		throw new Error("world has no surface")
	return DEPOSITS.compute({
		mesh: world.mesh,
		seed: world.params.seed,
		planetRadiusKm: world.params.planetRadiusKm,
		crust: tectonics.crust,
		simMesh: tectonics.simMesh,
		sample: tectonics.sample,
		isLand: world.isLand,
		elevationKm: world.elevation_km,
		rock: world.rock,
		youngKind: world.youngKind,
		glaciated: world.glaciated,
		temperatureMonthly: world.climate.temperature_monthly,
		rainfallMonthly: world.rainfall.monthly,
		flow: world.rivers.flow,
		lakeKind: world.rivers.lakeKind,
		coastal: world.coastal,
		sand,
	})
}

function run(sweep: Sweep): string {
	const worlds = SEEDS.map(cachedWorld)
	const head = ["knob value", ...SEEDS.map(String)]
	const labels = [
		...sweep.commodities.map((id) => `commodity ${id}`),
		...sweep.systems.map((id) => `system ${id}`),
	]
	const lines = [`### ${sweep.knob}`, ""]
	const table: string[][] = []
	for (const value of sweep.values) {
		sweep.apply(value)
		const results = worlds.map((world) => compute(world).shares)
		for (const label of labels) {
			const [kind, id] = label.split(" ")
			table.push([
				`${JSON.stringify(value)} ${label}`,
				...results.map((shares) => {
					const g =
						kind === "commodity"
							? shares.commodity[COMMODITIES.index[id as CommodityId]]
							: shares.system[SYSTEMS.index[id as SystemId]]
					return reach(g).toFixed(2)
				}),
			])
		}
	}
	lines.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`)
	for (const row of table) lines.push(`| ${row.join(" | ")} |`)
	return lines.join("\n")
}

describe.skipIf(!process.env.DEPOSIT_SWEEPS)(
	"deposits: calibration sweeps",
	() => {
		it("writes the share of land at poor or richer for each knob setting", () => {
			const defaults = structuredClone({
				placerDischarge: MUTABLE.placerDischarge,
				ironstoneOutcrop: MUTABLE.ironstoneOutcrop,
				sandCoast: MUTABLE.sandCoast,
				oilArch: MUTABLE.oilArch,
			})
			const parts: string[] = []
			try {
				for (const sweep of SWEEPS) parts.push(run(sweep))
			} finally {
				Object.assign(MUTABLE, defaults)
			}
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = `stats/deposits/${stamp}-sweeps`
			mkdirSync(dir, { recursive: true })
			writeFileSync(
				`${dir}/report.md`,
				`Percent of land regions at poor or richer; seeds ${SEEDS.join(", ")}.\n\n${parts.join("\n\n")}\n`,
			)
		}, 1_200_000)
	},
)

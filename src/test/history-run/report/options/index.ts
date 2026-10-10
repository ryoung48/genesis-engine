import { ERAS } from "@/model/society/eras"
import type { SocietyEra } from "@/model/society/types"
import { HISTORY_OUTPUT } from "@/test/history-run/output"
import type {
	HistoryReportOptions,
	ReportEnvParams,
} from "@/test/history-run/report/options/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const DEFAULT_SEEDS = [14963991]

const DEFAULT_YEARS = 300

// Year 1800 quantile from the original 933-year history baseline.
const DEFAULT_LATE_KNOWLEDGE_BAND = 2.366478320318625

function optionsFromEnv({ env, log }: ReportEnvParams): HistoryReportOptions {
	const era = (env.HISTORY_ERA ?? "lateMedieval") as SocietyEra
	if (!ERAS.eraOrder.includes(era))
		throw new Error(`HISTORY_ERA must be one of ${ERAS.eraOrder.join(", ")}`)
	const pipeline = env.HISTORY_PIPELINE ?? "simulation"
	if (pipeline !== "simulation" && pipeline !== "distribution")
		throw new Error("Invalid HISTORY_PIPELINE")
	const years = Number(
		env.HISTORY_YEARS ?? (pipeline === "distribution" ? 2023 : DEFAULT_YEARS),
	)
	return {
		pipeline,
		lateKnowledgeBand: Number(
			env.HISTORY_LATE_KNOWLEDGE ?? DEFAULT_LATE_KNOWLEDGE_BAND,
		),
		seeds: env.HISTORY_SEEDS
			? env.HISTORY_SEEDS.split(",").map(Number)
			: DEFAULT_SEEDS,
		era,
		numPoints: Number(env.HISTORY_POINTS ?? DEFAULT_WORLD_PARAMS.numPoints),
		years,
		startYear: env.HISTORY_START ? Number(env.HISTORY_START) : undefined,
		reachKm: Number(env.HISTORY_REACH_KM ?? 400),
		cohesionStep: Number(env.HISTORY_COHESION_STEP ?? 0.1),
		outPath: HISTORY_OUTPUT.path({ env, years, kind: "report" }),
		baselinePath: env.HISTORY_BASELINE ?? null,
		log,
	}
}

export const HISTORY_REPORT_OPTIONS = { fromEnv: optionsFromEnv }

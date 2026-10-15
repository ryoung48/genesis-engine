import type { GenesisWorld } from "@/model/pipelines/types"
import type {
	CradleChoice,
	MigrationDiagnostics,
} from "@/model/society/migration/types"

export interface MigrationReport {
	// [JUSTIFICATION] Worlds without an arrival field have no link diagnostics.
	diagnostics: MigrationDiagnostics | null
	cradles: CradleChoice[]
	provinces: number
	settledAtStartPercent: number
	uninhabitedAtStartPercent: number
	neverReachedPercent: number
	arrivalYearQuantiles: number[]
}

export interface MigrationReportParams {
	generated: GenesisWorld
	startYear: number
}

import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import type {
	TerrainReport,
	TerrainReportParams,
} from "@/test/history-run/report/terrain/types"

const MARSH = CLASSIFICATION.genesisTopographyLabels.indexOf("marsh")

function summarize({ generated }: TerrainReportParams): TerrainReport {
	let land = 0
	let marsh = 0
	for (let r = 0; r < generated.isLand.length; r++) {
		if (!generated.isLand[r]) continue
		land++
		if (generated.topography[r] === MARSH) marsh++
	}
	return {
		marshShare: land ? marsh / land : 0,
		tidalMaxForce: generated.tidalSchedule?.maxForce ?? null,
	}
}

export const TERRAIN_REPORT = { summarize }

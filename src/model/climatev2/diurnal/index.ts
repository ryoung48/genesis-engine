import type {
	DiurnalCells,
	DiurnalCellsParams,
} from "@/model/climatev2/diurnal/types"
import { CLIMATEV2_OUTPUTS } from "@/model/climatev2/outputs"

const MONTHS = 12

function cells({ result, weights, isLand }: DiurnalCellsParams): DiurnalCells {
	const { grid } = result
	const diurnal = result.stages.temperature.diurnal
	if (!diurnal) throw new Error("climatev2 returned no daily range")
	const N = isLand.length
	const isSea = new Uint8Array(N)
	for (let r = 0; r < N; r++) isSea[r] = isLand[r] ? 0 : 1
	const monthly = new Float32Array(MONTHS * N)
	const sample = { weights, fieldSize: grid.size, months: MONTHS, out: monthly }
	CLIMATEV2_OUTPUTS.sampleCells({
		...sample,
		field: diurnal.land,
		cells: isLand,
	})
	CLIMATEV2_OUTPUTS.sampleCells({ ...sample, field: diurnal.sea, cells: isSea })
	return { monthly, annual: CLIMATEV2_OUTPUTS.annualMean({ monthly, N }) }
}

export const CLIMATEV2_DIURNAL = { cells }

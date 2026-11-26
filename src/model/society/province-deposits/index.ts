import { COMMODITIES } from "@/model/geography/terrain/deposits/commodities"
import type {
	ProvinceDeposits,
	ProvinceDepositsParams,
} from "@/model/society/province-deposits/types"

const PROVINCE_RICH = 0.4

function aggregate({
	provinces,
	mesh,
	rows,
}: ProvinceDepositsParams): ProvinceDeposits {
	const count = provinces.count
	const width = COMMODITIES.count
	const n = mesh.numRegions
	const area = new Float64Array(count)
	const sum = new Float64Array(count * width)
	const rich = new Float64Array(count * width)
	const at = new Float32Array(width)
	for (let r = 0; r < n; r++) {
		const p = provinces.regionProvince[r]
		if (p < 0) continue
		const a = mesh.regionArea[r]
		area[p] += a
		COMMODITIES.all({ rows, numRegions: n, region: r, out: at })
		for (let k = 0; k < width; k++) {
			sum[p * width + k] += a * at[k]
			if (at[k] >= PROVINCE_RICH) rich[p * width + k] += a
		}
	}
	const mean = (values: Float64Array) =>
		Float32Array.from(values, (v, i) => {
			const total = area[Math.floor(i / width)]
			return total > 0 ? v / total : 0
		})
	return { richness: mean(sum), rich: mean(rich) }
}

export const PROVINCE_DEPOSITS = { aggregate }

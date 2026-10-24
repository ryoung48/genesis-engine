import type {
	CloudRadiation,
	CloudRadiationParams,
} from "@/model/climatev2/clouds/radiation/types"
import { tropicsWeight } from "@/model/climatev2/vendor/circulation.js"
import { coarsenField } from "@/model/climatev2/vendor/grid.js"

const MONTHS = 12

function compute({
	core,
	grid: g,
	ratio,
	clouds,
	landFrac,
	winds,
	albedo,
	longwaveCancellation,
	lowAlbedo,
	longwaveWindow,
}: CloudRadiationParams): CloudRadiation {
	const G = g.size,
		w = g.w,
		h = g.h
	const high = new Float64Array(12 * G),
		low = new Float64Array(12 * G)
	const highThermal = new Float64Array(12 * G)
	const lowThermal = new Float64Array(12 * G)
	for (let m = 0; m < 12; m++) {
		highThermal.set(
			coarsenField(
				core,
				g,
				ratio,
				clouds.highThermalContrast.subarray(m * core.size, (m + 1) * core.size),
			),
			m * G,
		)
		lowThermal.set(
			coarsenField(
				core,
				g,
				ratio,
				clouds.lowThermalContrast.subarray(m * core.size, (m + 1) * core.size),
			),
			m * G,
		)
		high.set(
			coarsenField(
				core,
				g,
				ratio,
				clouds.high.subarray(m * core.size, (m + 1) * core.size),
			),
			m * G,
		)
		low.set(
			coarsenField(
				core,
				g,
				ratio,
				clouds.low.subarray(m * core.size, (m + 1) * core.size),
			),
			m * G,
		)
	}
	const cloudT = {
		land: new Float64Array(MONTHS * G),
		sea: new Float64Array(MONTHS * G),
		landLongwave: new Float64Array(MONTHS * G),
		seaLongwave: new Float64Array(MONTHS * G),
	}
	for (let k = 0; k < MONTHS; k++) {
		const pos = (12 * k) / MONTHS - 0.5,
			m0 = Math.floor(pos),
			f = pos - m0,
			a = ((m0 % 12) + 12) % 12,
			b = (a + 1) % 12
		let highSum = 0,
			lowSum = 0,
			wsum = 0
		const lo = new Float64Array(G),
			hi = new Float64Array(G)
		for (let j = 0; j < h; j++)
			for (let i = 0; i < w; i++) {
				const c = j * w + i,
					cw = Math.cos((g.lat[j] * Math.PI) / 180)
				hi[c] = (1 - f) * high[a * G + c] + f * high[b * G + c]
				lo[c] = ((1 - f) * low[a * G + c] + f * low[b * G + c]) * (1 - hi[c])
				highSum += hi[c] * landFrac[c] * cw
				lowSum += lo[c] * landFrac[c] * cw
				wsum += landFrac[c] * cw
			}
		const meanHigh = wsum > 0 ? highSum / wsum : 0,
			meanLow = wsum > 0 ? lowSum / wsum : 0
		const bt = winds?.belts?.[a]
		for (let j = 0; j < h; j++) {
			const keep = bt
				? 1 -
					longwaveCancellation *
						tropicsWeight(g.lat[j], bt.itcz, bt.hiN, bt.hiS)
				: 1
			let seaSum = 0,
				seaWeight = 0
			for (let i = 0; i < w; i++) {
				const c = j * w + i
				seaSum += lo[c] * (1 - landFrac[c])
				seaWeight += 1 - landFrac[c]
			}
			const meanSea = seaWeight > 0 ? seaSum / seaWeight : 0
			for (let i = 0; i < w; i++) {
				const c = j * w + i,
					d = hi[c] - meanHigh
				cloudT.land[k * G + c] = albedo * d + lowAlbedo * (lo[c] - meanLow)
				cloudT.sea[k * G + c] = lowAlbedo * (lo[c] - meanSea)
				const thermalHigh =
					(1 - f) * highThermal[a * G + c] + f * highThermal[b * G + c]
				const thermalLow =
					(1 - f) * lowThermal[a * G + c] + f * lowThermal[b * G + c]
				const lowWindow = albedo > 0 ? (longwaveWindow * lowAlbedo) / albedo : 0
				cloudT.landLongwave[k * G + c] =
					longwaveWindow * Math.max(0, d) * (1 - keep) * thermalHigh +
					lowWindow * (lo[c] - meanLow) * thermalLow
				cloudT.seaLongwave[k * G + c] =
					lowWindow * (lo[c] - meanSea) * thermalLow
			}
		}
	}
	return cloudT
}

export const CLIMATEV2_CLOUD_RADIATION = { compute }

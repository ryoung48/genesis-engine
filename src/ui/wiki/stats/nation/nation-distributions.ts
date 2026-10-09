import { TEXT } from "@/model/shared/text"
import type { DistributionChartBucket } from "@/ui/components/composites/DistributionChart"
import {
	EU5_TOPOGRAPHY_CATEGORIES,
	EU5_TOPOGRAPHY_COLORS,
	EU5_TOPOGRAPHY_MERGE_LABEL,
} from "@/ui/genesis/shared/colors"

/** Same bucketing idea as GenesisView.tsx's world-level buildDistribution,
 * restricted to the mesh region/cell indexes inside one nation -- so
 * Environmental-style charts can be scoped down to one nation instead of
 * the whole world. */
export function buildDistributionForRegions(
	labels: ReadonlyArray<string>,
	values: ArrayLike<number> | undefined,
	regionIndexes: ReadonlyArray<number>,
	colorFn: (index: number) => string,
	excludeIndexes: ReadonlySet<number> = new Set(),
): DistributionChartBucket[] {
	const counts = new Array(labels.length).fill(0)
	if (values) {
		for (const region of regionIndexes) {
			const value = values[region]
			if (value >= 0 && value < counts.length && !excludeIndexes.has(value))
				counts[value]++
		}
	}
	return labels
		.map((label, index) => ({
			label: TEXT.titleCase(label),
			count: counts[index] ?? 0,
			color: colorFn(index),
		}))
		.filter((bucket) => bucket.count > 0)
}

// One representative color per merged EU5_TOPOGRAPHY_MERGE_LABEL bucket --
// the color of whichever raw category maps to that label first, in
// EU5_TOPOGRAPHY_CATEGORIES order (deterministic, and always the
// non-wasteland variant since those come first in the category list).
const EU5_TOPOGRAPHY_MERGE_COLOR: Record<string, [number, number, number]> =
	(() => {
		const colors: Record<string, [number, number, number]> = {}
		EU5_TOPOGRAPHY_CATEGORIES.forEach((category, index) => {
			const label = EU5_TOPOGRAPHY_MERGE_LABEL[category]
			if (label && !(label in colors))
				colors[label] = EU5_TOPOGRAPHY_COLORS[index]
		})
		return colors
	})()

/** Topography distribution for the observed (EU5) data source, collapsing
 * water categories and folding `_wasteland` variants into their
 * non-wasteland counterpart -- see EU5_TOPOGRAPHY_MERGE_LABEL's doc.
 * Omit regionIndexes for a world-wide (unrestricted) distribution. */
export function buildEu5TopographyDistribution(params: {
	values: ArrayLike<number> | undefined
	regionIndexes?: ReadonlyArray<number>
	rgbToCss: (rgb: [number, number, number]) => string
}): DistributionChartBucket[] {
	const { values, regionIndexes, rgbToCss } = params
	const counts = new Map<string, number>()
	const tally = (index: number) => {
		const value = values?.[index]
		if (
			value === undefined ||
			value < 0 ||
			value >= EU5_TOPOGRAPHY_CATEGORIES.length
		)
			return
		const label = EU5_TOPOGRAPHY_MERGE_LABEL[EU5_TOPOGRAPHY_CATEGORIES[value]]
		if (!label) return
		counts.set(label, (counts.get(label) ?? 0) + 1)
	}
	if (regionIndexes) {
		for (const region of regionIndexes) tally(region)
	} else if (values) {
		for (let index = 0; index < values.length; index++) tally(index)
	}
	return Array.from(counts.entries())
		.map(([label, count]) => ({
			label: TEXT.titleCase(label),
			count,
			color: rgbToCss(EU5_TOPOGRAPHY_MERGE_COLOR[label]),
		}))
		.sort((a, b) => b.count - a.count)
}

/** Cultures/religions on the Earth-import path are keyed by string id (EU4
 * culture/religion tags), not a small fixed index space, so this buckets by
 * whatever string id shows up per province directly instead of a fixed
 * label array -- same shape output as buildDistributionForRegions. */
export function buildStringIdDistributionForProvinces(params: {
	idByProvince: ReadonlyArray<string | null>
	provinceIndexes: ReadonlyArray<number>
	nameById?: Map<string, string>
	colorById?: Map<string, [number, number, number]>
	rgbToCss: (rgb: [number, number, number]) => string
	fallbackColor: string
 // [JUSTIFICATION] Only entity charts provide selection handlers.
 selectionForId?: (id: string) => (() => void) | undefined
}): DistributionChartBucket[] {
	const {
		idByProvince,
		provinceIndexes,
		nameById,
		colorById,
		rgbToCss,
		fallbackColor,
	} = params
	const counts = new Map<string, number>()
	for (const province of provinceIndexes) {
		const id = idByProvince[province]
		if (!id) continue
		counts.set(id, (counts.get(id) ?? 0) + 1)
	}
	return Array.from(counts.entries())
		.map(([id, count]) => ({
			onSelect: params.selectionForId?.(id),
			label: nameById?.get(id) ?? id,
			count,
			color: colorById?.get(id) ? rgbToCss(colorById.get(id)!) : fallbackColor,
		}))
		.sort((a, b) => b.count - a.count)
}

// "coming from" convention: negate u/v to get the source direction
// Nation focus is anchored on a representative seed province, so province
// count is only a rough proxy for framing. Use a slow logarithmic curve:
// single-province minors need a much tighter view than the default point
// focus, while large nations should pull back only moderately instead of
// hitting the far-out cap early.
// Focusing on a single province (as opposed to a whole nation) should use
// the same tight framing as a single-province nation -- the unscaled
// default (distanceScale 1) is tuned for the far-out nation case and looks
// much too zoomed-out for one province.

export function buildDistribution(
	labels: ReadonlyArray<string>,
	values: ArrayLike<number> | undefined,
	colorFn: (index: number) => string,
	excludeIndexes: ReadonlySet<number> = new Set(),
) {
	const counts = new Array(labels.length).fill(0)
	if (values) {
		for (let i = 0; i < values.length; i++) {
			const value = values[i]
			if (value >= 0 && value < counts.length && !excludeIndexes.has(value))
				counts[value]++
		}
	}

	return labels
		.map((label, index) => ({
			label: TEXT.titleCase(label),
			count: counts[index] ?? 0,
			color: colorFn(index),
		}))
		.filter((bucket) => bucket.count > 0)
}

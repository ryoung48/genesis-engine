import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { COMMODITIES } from "@/model/geography/terrain/deposits/commodities"
import type { CommodityId } from "@/model/geography/terrain/deposits/commodities/types"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import type { SystemGroup } from "@/model/geography/terrain/deposits/systems/types"
import type {
	DepositsHoverRow,
	DepositsPaintParams,
	DepositsRegionParams,
	DepositsTintParams,
	DepositsView,
	DepositsViewKind,
	DepositsViewOption,
	Rgb01,
	SystemRichnessParams,
} from "@/ui/genesis/shared/deposits-view/types"

const BYTE = 255
const [POOR, RICH] = DEPOSIT_CONFIG.grades
const GRADE_WORDS = ["none", "poor", "moderate", "rich"] as const
const POOR_TINT = 0.35
const HOVER_ROWS = 5
const OVERVIEW_GROUPS: readonly SystemGroup[] = [
	"metal",
	"fuel",
	"mineral",
	"gem",
]
const OVERVIEW = COMMODITIES.list
	.map((commodity, index) => ({ commodity, index }))
	.filter(({ commodity }) => OVERVIEW_GROUPS.includes(commodity.group))
const WATER_OVERVIEW = OVERVIEW.filter(
	({ commodity }) => commodity.id === "salt" || commodity.id === "oilAndGas",
)

function kind(view: DepositsView): DepositsViewKind {
	return view === "commodities" ? "commodities" : "commodity"
}

function target(view: DepositsView): string {
	return view.slice(view.indexOf(":") + 1)
}

function isView(value: unknown): value is DepositsView {
	if (typeof value !== "string") return false
	if (value === "commodities") return true
	const [prefix, id] = value.split(":")
	return prefix === "commodity" && id in COMMODITIES.index
}

function tint({ base, rgb, richness }: DepositsTintParams): Rgb01 {
	const t =
		POOR_TINT +
		(1 - POOR_TINT) *
			Math.min(1, Math.max(0, (richness - POOR) / (RICH - POOR)))
	return [
		base[0] + (rgb[0] / BYTE - base[0]) * t,
		base[1] + (rgb[1] / BYTE - base[1]) * t,
		base[2] + (rgb[2] / BYTE - base[2]) * t,
	]
}

function swatch(index: number): Rgb01 {
	return COMMODITIES.list[index].rgb.map((v) => v / BYTE) as Rgb01
}

function commodityInfo(view: DepositsView) {
	return COMMODITIES.list[COMMODITIES.index[target(view) as CommodityId]]
}

function systemRichness({
	rows,
	numRegions,
	region,
	system,
}: SystemRichnessParams): number {
	return rows[SYSTEMS.index[system] * numRegions + region] / BYTE
}

function strongestOverview({
	rows,
	numRegions,
	region,
	isLand,
}: DepositsPaintParams): {
	index: number
	richness: number
} {
	let index = -1
	let richness = 0
	for (const item of isLand ? OVERVIEW : WATER_OVERVIEW) {
		const value = COMMODITIES.richness({
			rows,
			numRegions,
			region,
			commodity: item.index,
		})
		if (value > richness) {
			richness = value
			index = item.index
		}
	}
	return { index, richness }
}

function paint(params: DepositsPaintParams): Rgb01 {
	const { base, rows, numRegions, region, view } = params
	if (kind(view) === "commodity") {
		const commodity = COMMODITIES.index[target(view) as CommodityId]
		const richness = COMMODITIES.richness({
			rows,
			numRegions,
			region,
			commodity,
		})
		return richness < POOR
			? base
			: tint({ base, rgb: COMMODITIES.list[commodity].rgb, richness })
	}
	const { index, richness } = strongestOverview(params)
	return richness < POOR
		? base
		: tint({ base, rgb: COMMODITIES.list[index].rgb, richness })
}

function options(): DepositsViewOption[] {
	return [
		{ value: "commodities", label: "All", rgb: null },
		...COMMODITIES.list.map((c, index) => ({
			value: `commodity:${c.id}` as const,
			label: c.name,
			rgb: swatch(index),
		})),
	]
}

function value(richness: number): string {
	return `${GRADE_WORDS[COMMODITIES.grade(richness)]} ${Math.round(richness * 100)}%`
}

function hover(params: DepositsRegionParams): DepositsHoverRow[] {
	const { rows, numRegions, region, view } = params
	const at = new Float32Array(COMMODITIES.count)
	COMMODITIES.all({ rows, numRegions, region, out: at })
	const wanted =
		kind(view) === "commodity"
			? [COMMODITIES.index[target(view) as CommodityId]]
			: OVERVIEW.map(({ index }) => index)
	const found = wanted
		.filter((k) => at[k] >= POOR)
		.sort((a, b) => at[b] - at[a])
		.slice(0, HOVER_ROWS)
	const out: DepositsHoverRow[] = found.map((k) => ({
		label: COMMODITIES.list[k].name,
		value: value(at[k]),
		rgb: swatch(k),
	}))
	if (
		kind(view) === "commodity" &&
		found.length > 0 &&
		commodityInfo(view).sources.length > 1
	)
		for (const [id] of commodityInfo(view).sources) {
			const richness = systemRichness({
				rows,
				numRegions,
				region,
				system: id,
			})
			if (richness < POOR) continue
			const info = SYSTEMS.list[SYSTEMS.index[id]]
			out.push({
				label: `  ${info.name}`,
				value: value(richness),
				rgb: info.rgb.map((v) => v / BYTE) as Rgb01,
			})
		}
	return out
}

export const DEPOSITS_VIEW = {
	defaultView: "commodities" as DepositsView,
	kind,
	isView,
	paint,
	options,
	hover,
}

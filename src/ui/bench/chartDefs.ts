import type {
	BenchBox,
	BenchDistribution,
	BenchUnit,
	BenchWindow,
} from "@/bench/types"
import { ERAS } from "@/model/society/eras"
import type { GovernmentType } from "@/model/society/types"
import type { DrilldownFamily } from "@/ui/bench/types"
import { uiChartPalette } from "@/ui/components/tokens"
import { GOVERNMENT_COLORS_BY_TYPE } from "@/ui/genesis/political/government-colors"
import {
	SIZE_BUCKET_LABELS,
	sizeBucketColor,
} from "@/ui/genesis/political/nation-size-distribution"

export interface ComboChartDef {
	title: string
	winnerLabel: string
	loserLabel: string
	winnerColor: string
	loserColor: string
	winner: (window: BenchWindow) => number | null
	loser: (window: BenchWindow) => number | null
	p50: (window: BenchWindow) => number | null
	p90: (window: BenchWindow) => number | null
}

export interface BoxChartDef {
	title: string
	unit: BenchUnit
	box: (window: BenchWindow) => BenchBox
}

export interface DistributionChartDef {
	title: string
	pick: (window: BenchWindow) => BenchDistribution
	order: string[]
	label: (params: { key: string }) => string
	color: (params: { key: string; index: number }) => string
}

const GOVERNMENT_ORDER = Object.keys(GOVERNMENT_COLORS_BY_TYPE)
const CATEGORIES = uiChartPalette.bench.categories

function categoryColor({ index }: { index: number }): string {
	return CATEGORIES[index % CATEGORIES.length]
}

function governmentColor({ key }: { key: string }): string {
	const rgb = GOVERNMENT_COLORS_BY_TYPE[key as GovernmentType]
	if (!rgb) return uiChartPalette.bench.baseline
	return `rgb(${rgb.map((channel) => Math.round(channel * 255)).join(", ")})`
}

export const COMBO_CHARTS: ComboChartDef[] = [
	{
		title:
			"Wars (attacker vs defender victories) and duration (years, p50 / p90)",
		winnerLabel: "Attacker won",
		loserLabel: "Defender won",
		winnerColor: uiChartPalette.bench.war.winner,
		loserColor: uiChartPalette.bench.war.loser,
		winner: (w) => w.warsAttackerWon,
		loser: (w) => w.warsDefenderWon,
		p50: (w) => w.warYearsP50,
		p90: (w) => w.warYearsP90,
	},
	{
		title:
			"Rebellions (rebel vs loyalist victories) and duration (years, p50 / p90)",
		winnerLabel: "Rebels won",
		loserLabel: "Loyalists won",
		winnerColor: uiChartPalette.bench.rebellion.winner,
		loserColor: uiChartPalette.bench.rebellion.loser,
		winner: (w) => w.rebelWarsRebelWon,
		loser: (w) => w.rebelWarsLoyalistWon,
		p50: (w) => w.rebelWarYearsP50,
		p90: (w) => w.rebelWarYearsP90,
	},
]

export const SIZE_CHART: DistributionChartDef = {
	title: "Sovereigns by size (provinces)",
	pick: (w) => w.sovereignSizes,
	order: Array.from(SIZE_BUCKET_LABELS.keys(), String),
	label: ({ key }) => SIZE_BUCKET_LABELS[Number(key)] ?? key,
	color: ({ key }) => sizeBucketColor(Number(key)),
}

export const DRILLDOWN_FAMILIES: DrilldownFamily[] = [
	"tribal",
	"monarchy",
	"republic",
	"theocracy",
]

const FAMILY_LABELS: Record<DrilldownFamily, string> = {
	tribal: "Tribal",
	monarchy: "Monarchy",
	republic: "Republic",
	theocracy: "Theocracy",
}

const FAMILY_REPRESENTATIVE: Record<DrilldownFamily, GovernmentType> = {
	tribal: "tribal_monarchy",
	monarchy: "feudal_monarchy",
	republic: "oligarchic_republic",
	theocracy: "theocracy",
}

export function familyLabel(family: DrilldownFamily): string {
	return FAMILY_LABELS[family]
}

export function familyColor(family: DrilldownFamily): string {
	return governmentColor({ key: FAMILY_REPRESENTATIVE[family] })
}

export function familySum(params: {
	distribution: BenchDistribution
	family: DrilldownFamily
}): number {
	return Object.entries(params.distribution).reduce(
		(sum, [type, count]) =>
			ERAS.governmentTypeFamily[type as GovernmentType] === params.family
				? sum + count
				: sum,
		0,
	)
}

export function governmentSubtypeDef(
	family: DrilldownFamily,
): DistributionChartDef {
	return {
		title: `Sovereigns by government: ${FAMILY_LABELS[family]}`,
		pick: (w) =>
			Object.fromEntries(
				Object.entries(w.governments).filter(
					([type]) =>
						ERAS.governmentTypeFamily[type as GovernmentType] === family,
				),
			),
		order: GOVERNMENT_ORDER,
		label: ({ key }) => ERAS.governmentTypeLabels[key as GovernmentType] ?? key,
		color: governmentColor,
	}
}

export const ARMY_BOX_CHART: BoxChartDef = {
	title: "Army size per sovereign (box p25–p75, whiskers p10–p90, line median)",
	unit: "count",
	box: (w) => w.armySize,
}

export const NAVY_BOX_CHART: BoxChartDef = {
	title: "Navy ships per realm (box p25–p75, whiskers p10–p90, line median)",
	unit: "count",
	box: (w) => w.ships,
}

export const TIES_CHART: DistributionChartDef = {
	title: "Diplomatic ties (realms with each tie)",
	pick: (w) => w.ties,
	order: [],
	label: ({ key }) => key,
	color: categoryColor,
}

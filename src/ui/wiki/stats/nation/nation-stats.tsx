import type { NationEconomy } from "@/model/history/world-frame/types"
import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { TraceTooltipContent } from "@/ui/components/composites/TraceTooltipContent"
import { SwordCrossIcon } from "@/ui/components/primitives/icons/SwordCrossIcon"
import { uiPalette } from "@/ui/components/tokens"
import type {
	ArmyStatParams,
	BuildNationWikiStatsParams,
} from "@/ui/wiki/stats/nation/types"

function treasuryHealthColor(economy: NationEconomy): string {
	if (economy.treasury < 0) return uiPalette.treasury.critical
	if (economy.treasurySafe <= 0) return uiPalette.nationCapital
	const surplusYearsPercent = (economy.treasury / economy.treasurySafe) * 200
	if (surplusYearsPercent >= 150) return uiPalette.treasury.healthy
	if (surplusYearsPercent >= 50) return uiPalette.treasury.caution
	return uiPalette.treasury.critical
}

const MANPOWER_STOPS = [
	uiPalette.treasury.critical,
	uiPalette.treasury.caution,
	uiPalette.treasury.healthy,
].map(COLOR_INTERPOLATION.cssColorToRgb)

function manpowerColor(economy: NationEconomy): string | null {
	if (economy.maxManpower <= 0) return null
	return COLOR_INTERPOLATION.rgbToCss(
		COLOR_INTERPOLATION.sampleColorStops({
			stops: MANPOWER_STOPS,
			t: economy.manpower / economy.maxManpower,
		}),
	)
}

function armyStat({ economy, warName, yearLabel }: ArmyStatParams): StatEntry {
	const deployed = economy.deployments.reduce(
		(sum, deployment) => sum + deployment.troops,
		0,
	)
	return {
		label: "Army",
		valuePrefix: `${formatCount(economy.army)} men ·`,
		value: `${formatCount(deployed)} deployed`,
		valueHelp:
			economy.deployments.length > 0 ? (
				<TraceTooltipContent
					title={`${yearLabel} deployments`}
					trace={economy.deployments.map((deployment) => ({
						value: deployment.troops,
						description: warName(deployment.warId),
					}))}
					formatValue={formatCount}
					finalLabel="Total deployed"
					finalValue={deployed}
				/>
			) : undefined,
		valueHelpTarget: "suffix",
	}
}

export function formatCount(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0"
	if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`
	}
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
	}
	return Math.round(value).toLocaleString()
}

export function formatDucats(value: number): string {
	const magnitude = Math.abs(value)
	if (magnitude > 0 && magnitude < 0.0001)
		return `${value.toPrecision(2)} ducats`
	const digits = magnitude >= 10 ? 1 : magnitude >= 1 ? 2 : 4
	return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })} ducats`
}

function formatSignedDucats(value: number): string {
	return `${value > 0 ? "+" : ""}${formatDucats(value)}`
}

export function formatAreaKm2(areaKm2: number): string {
	if (!Number.isFinite(areaKm2) || areaKm2 <= 0) return "0 km²"
	return `${formatCount(areaKm2)} km²`
}

export function formatDensity(perKm2: number): string {
	if (!Number.isFinite(perKm2) || perKm2 <= 0) return "0 /km²"
	if (perKm2 >= 1000) return `${Math.round(perKm2).toLocaleString()} /km²`
	return `${perKm2.toFixed(perKm2 >= 100 ? 0 : 1)} /km²`
}

function formatUrbanization(
	totalUrbanPopulation: number,
	totalPopulation: number,
) {
	if (
		!Number.isFinite(totalUrbanPopulation) ||
		!Number.isFinite(totalPopulation) ||
		totalUrbanPopulation <= 0 ||
		totalPopulation <= 0
	) {
		return "0%"
	}
	const percent = Math.min(
		100,
		Math.max(0, (totalUrbanPopulation / totalPopulation) * 100),
	)
	return `${percent.toFixed(0)}%`
}

export function buildNationWikiStats(
	params: BuildNationWikiStatsParams,
): StatEntry[] {
	const {
		territoryBasis,
		totalAreaKm2,
		totalPopulation,
		totalUrbanPopulation,
		provinceCount,
		rulerLabel,
		governmentSubtype,
		governmentColor,
		economy,
		warName,
		yearLabel,
	} = params
	const density = totalAreaKm2 > 0 ? totalPopulation / totalAreaKm2 : 0
	return [
		{
			label: territoryBasis === "controlled" ? "Controlled Area" : "Total Area",
			value: `${formatAreaKm2(totalAreaKm2)} · ${provinceCount.toLocaleString()} Province${provinceCount === 1 ? "" : "s"}`,
		},
		{
			label:
				territoryBasis === "controlled"
					? "Controlled Population"
					: "Population",
			valuePrefix: formatCount(totalPopulation),
			value: ` · ${formatDensity(density)} · ${formatUrbanization(totalUrbanPopulation, totalPopulation)} urbanized`,
		},
		...(rulerLabel !== null && rulerLabel !== undefined
			? [{ label: "Ruler", value: rulerLabel }]
			: []),
		{
			label: "Government",
			value: governmentSubtype ?? "Unknown",
			swatchColor: governmentColor,
		},
		...(economy
			? [
					{
						label: "Treasury",
						value: formatDucats(economy.treasury),
						valueHelp: economy.budget ? (
							<TraceTooltipContent
								title={`${yearLabel} treasury ${economy.budget.settled ? "changes" : "estimate"}`}
								trace={[
									{
										value: economy.budget.taxes,
										description: "Taxes",
									},
									{
										value: economy.budget.stateMaintenance,
										description: "State maintenance",
									},
									{
										value: economy.budget.armyExpenses,
										description: "Army maintenance",
										icon: economy.budget.wartimeRates ? (
											<span
												className="inline-flex items-center"
												title="Charged at wartime rates"
											>
												<SwordCrossIcon className="block h-2.5 w-2.5 text-rose-500" />
											</span>
										) : undefined,
									},
									{
										value: economy.budget.treasuryLeakage,
										description: "Treasury leakage",
									},
									{ value: economy.budget.plunder, description: "Plunder" },
									{
										value: economy.budget.tribute,
										description: "Tribute to overlord",
									},
									{
										value: economy.budget.tributeReceived,
										description: "Tribute from vassals",
									},
									{
										value: economy.budget.indemnity,
										description: "War indemnity paid",
									},
									{
										value: economy.budget.indemnityReceived,
										description: "War indemnity received",
									},
									{
										value: economy.budget.boughtPeace,
										description: "Bought peace",
									},
									{
										value: economy.budget.succession,
										description: "Realm split",
									},
								].filter((entry) => entry.value !== 0)}
								formatValue={formatSignedDucats}
								finalLabel="Net treasury change"
								finalValue={economy.treasuryChange}
							/>
						) : (
							"No annual settlement recorded yet"
						),
						swatchColor: treasuryHealthColor(economy),
					},
					{
						label: "Manpower",
						value: `${formatCount(economy.manpower)} men${economy.maxManpower > 0 ? ` · ${Math.round((100 * economy.manpower) / economy.maxManpower)}% of ${formatCount(economy.maxManpower)}` : ""}`,
						swatchColor: manpowerColor(economy),
					},
					armyStat({ economy, warName, yearLabel }),
				]
			: []),
	]
}

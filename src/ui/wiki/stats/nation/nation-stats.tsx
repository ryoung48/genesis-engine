import type { NationEconomy } from "@/model/history/world-frame/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { TraceTooltipContent } from "@/ui/components/composites/TraceTooltipContent"
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

function armyStat({ economy, warName, yearLabel }: ArmyStatParams): StatEntry {
	const deployed = economy.deployed
	return {
		label: "Field army",
		valuePrefix: `${formatCount(economy.army)} enrolled ·`,
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
		trailingHelp: (
			<TraceTooltipContent
				title={`${yearLabel} field army composition`}
				trace={[
					{
						value: economy.deployedLevy,
						description: `Levies (${economy.deployedLevyPercent.toFixed(1)}%)`,
					},
					{
						value: economy.deployedRegular,
						description: `Regulars (${economy.deployedRegularPercent.toFixed(1)}%)`,
					},
				]}
				formatValue={formatCount}
				finalLabel="Deployed troops"
				finalValue={deployed}
			/>
		),
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
		successionLabel,
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
		...(successionLabel !== null
			? [{ label: "Succession", value: successionLabel }]
			: []),
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
										description: economy.budget.settled
											? "Army maintenance (settled interval)"
											: "Army maintenance (projected annual)",
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
					armyStat({ economy, warName, yearLabel }),
				]
			: []),
	]
}

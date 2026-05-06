import React from "react"
import { DistributionChart } from "@/components"
import type { WorldSection } from "../drawer-state"
import type { DetailsDrawerBaseProps } from "../shared"
import { AccordionSection, DetailRow, formatPopulation } from "../shared"

function hasValue(value: string): boolean {
	const trimmed = value.trim()
	return trimmed !== "" && trimmed !== "—" && trimmed !== "-"
}

function getWorldSections({
	planetStats,
	worldPopulation,
	activeWarCount,
	cultureCount,
	heritageCount,
	faithCount,
	religionCount,
}: Pick<
	DetailsDrawerBaseProps,
	| "planetStats"
	| "worldPopulation"
	| "activeWarCount"
	| "cultureCount"
	| "heritageCount"
	| "faithCount"
	| "religionCount"
>) {
	const stats = new Map(
		planetStats
			.filter((stat) => hasValue(stat.value))
			.map((stat) => [stat.label, stat.value]),
	)

	return {
		planetary: [
			{ label: "Radius", value: stats.get("Radius") },
			{ label: "Sun", value: stats.get("Sun") },
			{ label: "Tilt", value: stats.get("Tilt") },
			{ label: "Ecc", value: stats.get("Ecc") },
			{ label: "Perihelion", value: stats.get("Perihelion") },
			{ label: "Year", value: stats.get("Year") },
			{ label: "Day", value: stats.get("Day") },
			{ label: "Pressure", value: stats.get("Pressure") },
			{ label: "Lock", value: stats.get("Lock") },
			{ label: "Habitability", value: stats.get("Habitability") },
			{ label: "Cell", value: stats.get("Cell") },
			{ label: "Land Area", value: stats.get("Land Area") },
			{ label: "Continents", value: stats.get("Continents") },
			{ label: "Provinces", value: stats.get("Provinces") },
			{ label: "Avg Province Area", value: stats.get("Avg Province Area") },
		].filter((stat): stat is { label: string; value: string } =>
			Boolean(stat.value),
		),
		environmental: [
			{ label: "Avg Temp", value: stats.get("Avg Temp") },
			{ label: "Avg Rain", value: stats.get("Avg Rain") },
			{ label: "Avg DTR", value: stats.get("Avg DTR") },
		].filter((stat): stat is { label: string; value: string } =>
			Boolean(stat.value),
		),
		social: [
			{
				label: "Population",
				value:
					worldPopulation != null ? formatPopulation(worldPopulation) : "N/A",
			},
			{
				label: "Active Wars",
				value: activeWarCount != null ? activeWarCount.toLocaleString() : "N/A",
			},
			{
				label: "Culture Count",
				value: cultureCount != null ? cultureCount.toLocaleString() : "N/A",
			},
			{
				label: "Heritage Count",
				value: heritageCount != null ? heritageCount.toLocaleString() : "N/A",
			},
			{
				label: "Faith Count",
				value: faithCount != null ? faithCount.toLocaleString() : "N/A",
			},
			{
				label: "Religion Count",
				value: religionCount != null ? religionCount.toLocaleString() : "N/A",
			},
		],
	}
}

interface WorldDetailsProps extends DetailsDrawerBaseProps {
	section: WorldSection
	onSectionChange: (section: WorldSection) => void
}

export const WorldDetails: React.FC<WorldDetailsProps> = ({
	section,
	onSectionChange,
	planetStats,
	worldPopulation,
	activeWarCount,
	cultureCount,
	heritageCount,
	faithCount,
	religionCount,
	nationSizeDistribution,
	conflictDistribution,
	relationDistribution,
	climateDistribution,
	vegetationDistribution,
	topographyDistribution,
}) => {
	const worldSections = getWorldSections({
		planetStats,
		worldPopulation,
		activeWarCount,
		cultureCount,
		heritageCount,
		faithCount,
		religionCount,
	})

	return (
		<div className="space-y-2">
			<AccordionSection
				title="Planetary"
				open={section === "planetary"}
				onToggle={() => onSectionChange("planetary")}
			>
				<div className="space-y-1.5">
					{worldSections.planetary.map((stat) => (
						<DetailRow key={stat.label} label={stat.label} value={stat.value} />
					))}
				</div>
			</AccordionSection>
			<AccordionSection
				title="Environmental"
				open={section === "environmental"}
				onToggle={() => onSectionChange("environmental")}
			>
				<div className="space-y-2">
					<div className="space-y-1.5">
						{worldSections.environmental.map((stat) => (
							<DetailRow
								key={stat.label}
								label={stat.label}
								value={stat.value}
							/>
						))}
					</div>
					<DistributionChart title="Climate" buckets={climateDistribution} />
					<DistributionChart
						title="Vegetation"
						buckets={vegetationDistribution}
					/>
					<DistributionChart
						title="Topography"
						buckets={topographyDistribution}
					/>
				</div>
			</AccordionSection>
			<AccordionSection
				title="Social"
				open={section === "social"}
				onToggle={() => onSectionChange("social")}
			>
				<div className="space-y-2">
					<div className="space-y-1.5">
						{worldSections.social.map((stat) => (
							<DetailRow
								key={stat.label}
								label={stat.label}
								value={stat.value}
							/>
						))}
					</div>
					<DistributionChart
						title="Nation Size"
						buckets={nationSizeDistribution}
					/>
					<DistributionChart title="Conflicts" buckets={conflictDistribution} />
					<DistributionChart title="Relations" buckets={relationDistribution} />
				</div>
			</AccordionSection>
		</div>
	)
}

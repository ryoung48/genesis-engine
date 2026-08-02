import React from "react"
import { CollapsibleSectionHeader } from "@/ui/components/composites/CollapsibleSectionHeader"
import { RadioGroup } from "@/ui/components/primitives/RadioGroup"
import { ToggleRow } from "@/ui/components/primitives/ToggleRow"
import type { DataVariant } from "@/ui/genesis/shared/data-variant"

export interface GeographySectionProps {
	geographyExpanded: boolean
	setGeographyExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	showElevation: boolean
	setShowElevation: (v: boolean) => void
	showRivers: boolean
	setShowRivers: (v: boolean) => void
	showInfrastructure: boolean
	setShowInfrastructure: (v: boolean) => void
	showWindArrows: boolean
	setShowWindArrows: (v: boolean) => void
	isEarthImport: boolean
	showOceanCurrents: boolean
	setShowOceanCurrents: (v: boolean) => void
	showThermalEquator: boolean
	setShowThermalEquator: (v: boolean) => void
	showCoastlines: boolean
	setShowCoastlines: (v: boolean) => void
	availableVariants: DataVariant[]
	dataVariant: DataVariant
	setDataVariant: (v: DataVariant) => void
}

export const GeographySection: React.FC<GeographySectionProps> = ({
	geographyExpanded,
	setGeographyExpanded,
	showElevation,
	setShowElevation,
	showRivers,
	setShowRivers,
	showInfrastructure,
	setShowInfrastructure,
	showWindArrows,
	setShowWindArrows,
	isEarthImport,
	showOceanCurrents,
	setShowOceanCurrents,
	showThermalEquator,
	setShowThermalEquator,
	showCoastlines,
	setShowCoastlines,
	availableVariants,
	dataVariant,
	setDataVariant,
}) => {
	// Wind and Ocean Currents don't gate on the color mode's own variant
	// family (getAvailableVariants(colorMode)) -- they always support
	// Model/Observed regardless of what's colored on the map -- so the radio
	// surfaces whenever either overlay is on, not just when colorMode itself
	// has variants.
	const showDataVariantRadio = isEarthImport
	return (
		<div>
			<CollapsibleSectionHeader
				title="Geography"
				expanded={geographyExpanded}
				onToggle={() => setGeographyExpanded((v) => !v)}
			/>
			{geographyExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<ToggleRow
						label="Elevation"
						checked={showElevation}
						onChange={() => setShowElevation(!showElevation)}
					/>
					<ToggleRow
						label="Rivers"
						checked={showRivers}
						onChange={setShowRivers}
					/>
					<ToggleRow
						label="Infrastructure"
						checked={showInfrastructure}
						onChange={setShowInfrastructure}
					/>
					<ToggleRow
						label="Wind"
						checked={showWindArrows}
						onChange={setShowWindArrows}
					/>
					<ToggleRow
						label="Ocean Currents"
						checked={showOceanCurrents}
						onChange={setShowOceanCurrents}
					/>
					<ToggleRow
						label="Thermal Equator"
						checked={showThermalEquator}
						onChange={setShowThermalEquator}
					/>
					<ToggleRow
						label="Coastlines"
						checked={showCoastlines}
						onChange={setShowCoastlines}
					/>
					{showDataVariantRadio && (
						<div className="pt-1">
							<RadioGroup
								label="Data source"
								orientation="horizontal"
								options={[
									{ value: "generated", label: "Model" },
									{ value: "observed", label: "Observed" },
									...(availableVariants.includes("diff")
										? [{ value: "diff" as DataVariant, label: "Diff" }]
										: []),
								]}
								value={dataVariant}
								onChange={setDataVariant}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { DataVariant } from "@/ui/planet/screen/shared/data-variant"

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
	showRealWind: boolean
	setShowRealWind: (v: boolean) => void
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
	showRealWind,
	setShowRealWind,
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
	return (
		<div>
			<button
				type="button"
				onClick={() => setGeographyExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Geography</span>
				<ChevronIcon
					direction={geographyExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{geographyExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Elevation</span>
						<input
							type="checkbox"
							checked={showElevation}
							onChange={() => setShowElevation(!showElevation)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Rivers</span>
						<input
							type="checkbox"
							checked={showRivers}
							onChange={(e) => setShowRivers(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Infrastructure</span>
						<input
							type="checkbox"
							checked={showInfrastructure}
							onChange={(e) => setShowInfrastructure(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Wind</span>
						<input
							type="checkbox"
							checked={showWindArrows}
							onChange={(e) => setShowWindArrows(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					{isEarthImport && showWindArrows && (
						<div className="flex items-center gap-4 pl-3 text-[11px] font-medium">
							<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
								<input
									type="radio"
									name="wind-source"
									checked={!showRealWind}
									onChange={() => setShowRealWind(false)}
									className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
								Model
							</label>
							<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
								<input
									type="radio"
									name="wind-source"
									checked={showRealWind}
									onChange={() => setShowRealWind(true)}
									className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
								/>
								Observed (NCEP)
							</label>
						</div>
					)}
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Ocean Currents</span>
						<input
							type="checkbox"
							checked={showOceanCurrents}
							onChange={(e) => setShowOceanCurrents(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Thermal Equator</span>
						<input
							type="checkbox"
							checked={showThermalEquator}
							onChange={(e) => setShowThermalEquator(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Coastlines</span>
						<input
							type="checkbox"
							checked={showCoastlines}
							onChange={(e) => setShowCoastlines(e.target.checked)}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					{isEarthImport && availableVariants.length > 1 && (
						<div className="pt-1">
							<div className="flex items-center gap-4 text-[11px] font-medium">
								<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
									<input
										type="radio"
										name="data-variant"
										checked={dataVariant === "generated"}
										onChange={() => setDataVariant("generated")}
										className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
									Model
								</label>
								<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
									<input
										type="radio"
										name="data-variant"
										checked={dataVariant === "observed"}
										onChange={() => setDataVariant("observed")}
										className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
									/>
									Observed
								</label>
								{availableVariants.includes("diff") && (
									<label className="flex items-center gap-2 cursor-pointer text-slate-300 has-[:checked]:text-slate-100">
										<input
											type="radio"
											name="data-variant"
											checked={dataVariant === "diff"}
											onChange={() => setDataVariant("diff")}
											className="h-3 w-3 rounded-full border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
										/>
										Diff
									</label>
								)}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

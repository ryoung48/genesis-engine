import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import { GlobeIcon } from "@/ui/components/primitives/icons/GlobeIcon"
import { MapIcon } from "@/ui/components/primitives/icons/MapIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import type { GenesisViewMode } from "@/ui/planet/renderer"
import { MAX_MAP_PROJECTION_LATITUDE_DEG } from "@/ui/planet/renderer/map-projection"
import type { UnitSystem } from "@/ui/planet/screen/shared/ui-format"
import type { ExportWidthPreset } from "./types"

export interface ViewExportSectionProps {
	viewMode: GenesisViewMode
	setViewMode: (v: GenesisViewMode) => void
	unitSystem: UnitSystem
	setUnitSystem: (v: UnitSystem) => void
	draftMapProjectionLatitude: number
	setDraftMapProjectionLatitude: (v: number) => void
	commitMapProjectionLatitude: (
		event:
			| React.PointerEvent<HTMLInputElement>
			| React.KeyboardEvent<HTMLInputElement>
			| React.FocusEvent<HTMLInputElement>,
	) => void
	exportExpanded: boolean
	setExportExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	exportWidthPreset: ExportWidthPreset
	setExportWidthPreset: (v: ExportWidthPreset) => void
	exportCenterLongitude: number
	setExportCenterLongitude: (v: number) => void
	exportDisabled: boolean
	exportBusy: boolean
	exportProgress: { percent: number; label: string } | null
	exportError?: string | null
	onExport: () => void
}

export const ViewExportSection: React.FC<ViewExportSectionProps> = ({
	viewMode,
	setViewMode,
	unitSystem,
	setUnitSystem,
	draftMapProjectionLatitude,
	setDraftMapProjectionLatitude,
	commitMapProjectionLatitude,
	exportExpanded,
	setExportExpanded,
	exportWidthPreset,
	setExportWidthPreset,
	exportCenterLongitude,
	setExportCenterLongitude,
	exportDisabled,
	exportBusy,
	exportProgress,
	exportError,
	onExport,
}) => {
	return (
		<>
			<div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
				<SegmentedControl
					options={[
						{
							value: "globe",
							label: <GlobeIcon className="h-3.5 w-3.5" />,
							ariaLabel: "Globe view",
							title: "Globe view",
						},
						{
							value: "map",
							label: <MapIcon className="h-3.5 w-3.5" />,
							ariaLabel: "Map view",
							title: "Map view",
						},
					]}
					value={viewMode}
					onChange={setViewMode}
					tone="overlay"
					size="sm"
					buttonClassName="px-1.5"
				/>
				<SegmentedControl
					options={[
						{
							value: "metric",
							label: <span className="font-mono uppercase">me</span>,
							title: "Metric units",
							ariaLabel: "Metric units",
						},
						{
							value: "imperial",
							label: <span className="font-mono uppercase">im</span>,
							title: "Imperial units",
							ariaLabel: "Imperial units",
						},
					]}
					value={unitSystem}
					onChange={setUnitSystem}
					tone="overlay"
					size="sm"
					buttonClassName="px-1.5"
				/>
			</div>
			{viewMode === "map" && (
				<div className="space-y-1.5">
					<div className="flex items-baseline justify-between gap-3">
						<label className="text-[11px] font-medium text-slate-300">
							Projection Latitude
						</label>
						<span className="font-mono text-[11px] text-slate-400">
							{draftMapProjectionLatitude.toFixed(0)}°
						</span>
					</div>
					<input
						type="range"
						min={-MAX_MAP_PROJECTION_LATITUDE_DEG}
						max={MAX_MAP_PROJECTION_LATITUDE_DEG}
						step={1}
						value={draftMapProjectionLatitude}
						onChange={(e) =>
							setDraftMapProjectionLatitude(Number(e.target.value))
						}
						onPointerUp={commitMapProjectionLatitude}
						onKeyUp={commitMapProjectionLatitude}
						onBlur={commitMapProjectionLatitude}
						className="w-full accent-slate-100"
					/>
				</div>
			)}

			<div className="space-y-2 border-t border-white/10 pt-2">
				<div className="flex items-center justify-between gap-3">
					<label className="text-[11px] font-medium text-slate-300">
						Export PNG
					</label>
					<button
						type="button"
						onClick={() => setExportExpanded((v) => !v)}
						className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
					>
						<ChevronIcon
							direction={exportExpanded ? "up" : "down"}
							className="h-3 w-3 text-slate-400"
						/>
					</button>
				</div>
				{exportExpanded && (
					<div className="space-y-2">
						<div className="flex items-center justify-between gap-3">
							<label className="text-[11px] font-medium text-slate-300">
								Resolution
							</label>
							<SegmentedControl
								options={[
									{
										value: "4096",
										label: "4k",
										ariaLabel: "4096 wide",
									},
									{
										value: "8192",
										label: "8k",
										ariaLabel: "8192 wide",
									},
									{
										value: "16384",
										label: "16k",
										ariaLabel: "16384 wide",
									},
									{
										value: "32768",
										label: "32k",
										ariaLabel: "32768 wide",
									},
								]}
								value={exportWidthPreset}
								onChange={setExportWidthPreset}
								tone="overlay"
								size="sm"
								buttonClassName="px-1.5"
							/>
						</div>
						<div className="space-y-1.5">
							<div className="flex items-baseline justify-between gap-3">
								<label className="text-[11px] font-medium text-slate-300">
									Export Longitude
								</label>
								<span className="font-mono text-[11px] text-slate-400">
									{exportCenterLongitude.toFixed(0)}°
								</span>
							</div>
							<input
								type="range"
								min={-180}
								max={180}
								step={1}
								value={exportCenterLongitude}
								onChange={(e) =>
									setExportCenterLongitude(Number(e.target.value))
								}
								className="w-full accent-slate-100"
							/>
						</div>
						<button
							type="button"
							onClick={onExport}
							disabled={exportDisabled}
							className="w-full rounded-md border border-white/10 bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{exportBusy ? `Exporting ${exportWidthPreset}w` : "Export PNG"}
						</button>
						{exportProgress && (
							<div className="space-y-1">
								<div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
									<span>{exportProgress.label}</span>
									<span className="font-mono">{exportProgress.percent}%</span>
								</div>
								<div className="h-1.5 overflow-hidden rounded-full bg-white/8">
									<div
										className="h-full rounded-full bg-slate-100 transition-[width]"
										style={{ width: `${exportProgress.percent}%` }}
									/>
								</div>
							</div>
						)}
						{exportError && (
							<div className="text-[10px] text-rose-300">{exportError}</div>
						)}
					</div>
				)}
			</div>
		</>
	)
}

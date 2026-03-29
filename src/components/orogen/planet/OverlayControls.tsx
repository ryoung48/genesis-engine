import React from "react"
import { gridSpacingOptions } from "./constants"

interface OverlayControlsProps {
	overlaysExpanded: boolean
	setOverlaysExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	showWireframe: boolean
	setShowWireframe: (v: boolean) => void
	showRivers: boolean
	setShowRivers: (v: boolean) => void
	showClouds: boolean
	setShowClouds: (v: boolean) => void
	showThermalEquator: boolean
	setShowThermalEquator: (v: boolean) => void
	showGrid: boolean
	setShowGrid: (v: boolean) => void
	gridSpacing: number
	setGridSpacing: (v: number) => void
	showPastaDebug: boolean
	setShowPastaDebug: (v: boolean) => void
	sidebarOpen?: boolean
	onToggleSidebar?: () => void
}

export const OverlayControls: React.FC<OverlayControlsProps> = ({
	overlaysExpanded, setOverlaysExpanded,
	showWireframe, setShowWireframe,
	showRivers, setShowRivers,
	showClouds, setShowClouds,
	showThermalEquator, setShowThermalEquator,
	showGrid, setShowGrid,
	gridSpacing, setGridSpacing,
	showPastaDebug, setShowPastaDebug,
	sidebarOpen, onToggleSidebar,
}) => (
	<div className="absolute bottom-3 left-3 z-20 pointer-events-none">
		<div className="pointer-events-auto flex flex-col items-start gap-2">
			{overlaysExpanded && (
				<div className="w-64 rounded-2xl border border-white/10 bg-slate-950/85 p-3 text-white shadow-2xl backdrop-blur-md">
					<div className="mb-3 flex items-center justify-between gap-3">
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
							Overlays
						</span>
						<button
							onClick={() => setOverlaysExpanded(false)}
							className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 transition hover:bg-white/10 hover:text-white"
						>
							Close
						</button>
					</div>
					<div className="space-y-3">
						<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
							<span>Wireframe</span>
							<input
								type="checkbox"
								checked={showWireframe}
								onChange={(e) => setShowWireframe(e.target.checked)}
								className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
						</label>
						<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
							<span>Rivers</span>
							<input
								type="checkbox"
								checked={showRivers}
								onChange={(e) => setShowRivers(e.target.checked)}
								className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
						</label>
						<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
							<span>Clouds</span>
							<input
								type="checkbox"
								checked={showClouds}
								onChange={(e) => setShowClouds(e.target.checked)}
								className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
						</label>
						<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
							<span>Thermal Equator</span>
							<input
								type="checkbox"
								checked={showThermalEquator}
								onChange={(e) => setShowThermalEquator(e.target.checked)}
								className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
						</label>
						<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
							<span>Grid Lines</span>
							<input
								type="checkbox"
								checked={showGrid}
								onChange={(e) => setShowGrid(e.target.checked)}
								className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
						</label>
						<div className={showGrid ? "space-y-1.5" : "space-y-1.5 opacity-50"}>
							<div className="flex justify-between items-baseline">
								<label className="text-[11px] font-medium text-slate-300">
									Grid Spacing
								</label>
								<span className="font-mono text-[11px] text-slate-400">
									{gridSpacing}°
								</span>
							</div>
							<input
								type="range"
								min={0}
								max={gridSpacingOptions.length - 1}
								step={1}
								value={Math.max(0, gridSpacingOptions.indexOf(gridSpacing))}
								onChange={(e) => setGridSpacing(gridSpacingOptions[Number(e.target.value)] ?? gridSpacingOptions[0])}
								disabled={!showGrid}
								className="w-full accent-slate-100 disabled:cursor-not-allowed"
							/>
						</div>
						<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-200">
							<span>Pasta Debug</span>
							<input
								type="checkbox"
								checked={showPastaDebug}
								onChange={(e) => setShowPastaDebug(e.target.checked)}
								className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
							/>
						</label>
					</div>
				</div>
			)}
			<div className="flex items-center gap-2">
				{!sidebarOpen && onToggleSidebar && (
					<button
						onClick={onToggleSidebar}
						title="Show sidebar"
						className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-slate-200 shadow-lg backdrop-blur-md transition-all hover:bg-slate-950/95"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white">
							<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
							<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="1.5" />
						</svg>
					</button>
				)}
				<button
					onClick={() => setOverlaysExpanded((value) => !value)}
					title={overlaysExpanded ? "Hide overlays" : "Show overlays"}
					className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] shadow-lg transition-all ${
						overlaysExpanded
							? "border-white/20 bg-white/15 text-white"
							: "border-white/10 bg-slate-950/80 text-slate-200 hover:bg-slate-950/95"
					} backdrop-blur-md`}
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
						<path d="M4.5 2.5v11M8 2.5v11M11.5 2.5v11" opacity="0.45" />
					</svg>
					<span>Overlays</span>
				</button>
			</div>
		</div>
	</div>
)

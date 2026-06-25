import React from "react"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiTokens } from "@/ui/components/tokens"
import type { GenerationPreviewTab } from "@/ui/planet/screen/generation/generation-preview"
import type { UnitSystem } from "@/ui/planet/screen/shared/ui-format"
import { formatTemperature } from "@/ui/planet/screen/shared/ui-format"
import { LockedClimatePreview } from "./LockedClimatePreview"
import { RegularClimatePreview } from "./RegularClimatePreview"
import type {
	ClimatePreviewData,
	LockedClimatePreviewData,
	RegularClimatePreviewData,
} from "./types"

interface ClimatePreviewOverlayProps {
	preview: ClimatePreviewData
	tidallyLocked: boolean
	activeTab: GenerationPreviewTab
	unitSystem: UnitSystem
	daysPerYear: number
	onClose: () => void
}

export const ClimatePreviewOverlay: React.FC<ClimatePreviewOverlayProps> = ({
	preview,
	tidallyLocked,
	activeTab,
	unitSystem,
	daysPerYear,
	onClose,
}) => {
	return (
		<div className="absolute inset-0 z-20 flex h-full flex-col bg-slate-50 text-slate-900">
			<div className="flex items-center gap-3 border-b border-slate-200 bg-white/70 px-5 py-3">
				<div className="ml-auto flex items-center gap-3">
					<Surface
						tone="panelAccent"
						borderTone="default"
						radius="md"
						shadow="sm"
						padding="md"
						className="flex items-center gap-2 px-3 py-2 text-right"
					>
						<div className={`${uiTokens.type.control} text-slate-500`}>
							Avg Temp
						</div>
						<div className="font-mono text-sm text-slate-900">
							{formatTemperature(preview.avgTemp, unitSystem, 1, {
								compact: true,
							})}
						</div>
					</Surface>
					<IconButton
						type="button"
						onClick={onClose}
						tone="panel"
						shape="rounded"
						title="Close climate preview"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</IconButton>
				</div>
			</div>
			<div className="min-h-0 flex-1 px-5 py-5">
				{tidallyLocked ? (
					<LockedClimatePreview
						preview={preview as LockedClimatePreviewData}
						activeTab={activeTab}
						unitSystem={unitSystem}
						daysPerYear={daysPerYear}
					/>
				) : (
					<RegularClimatePreview
						preview={preview as RegularClimatePreviewData}
						activeTab={activeTab}
						unitSystem={unitSystem}
						daysPerYear={daysPerYear}
					/>
				)}
			</div>
		</div>
	)
}

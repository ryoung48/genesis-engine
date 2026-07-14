import React, { useState } from "react"
import {
	EARTH_HISTORY_BOOKMARK_ERAS,
	EARTH_HISTORY_BOOKMARKS,
} from "@/model/earth/history/reference/bookmarks"
import { IconButton } from "@/ui/components/primitives/IconButton"

interface EarthHistoryBookmarksProps {
	onSelect: (dateDays: number) => void
	/** Which side of the trigger button the popup opens toward. The scrubber
	 * this lives in is docked near the top of the viewport for Earth-imported
	 * worlds, so opening "above" (the original bottom-docked-panel default)
	 * pushed the popup off-screen and got clipped -- pass "below" there. */
	placement?: "above" | "below"
}

/** Era-grouped bookmark shortcut popup, ported from geo-explorer's
 * DateControls.tsx preset-button pattern (see docs/earth-history-plan.md
 * "Bookmarks"). Selecting a bookmark jumps the scrubber to that date via the
 * same onTimeChange path as manual scrubbing. */
export const EarthHistoryBookmarks: React.FC<EarthHistoryBookmarksProps> = ({
	onSelect,
	placement = "above",
}) => {
	const [open, setOpen] = useState(false)
	const popupPositionClassName =
		placement === "below" ? "top-full mt-2" : "bottom-full mb-2"

	return (
		<div className="relative">
			<IconButton
				onClick={() => setOpen((v) => !v)}
				size="sm"
				shape="rounded"
				className="h-7 w-7 shrink-0 border-white/0 bg-white/5 text-slate-100 shadow-none hover:bg-white/10"
				title="Bookmarks"
				aria-label="Bookmarks"
				selected={open}
			>
				<svg
					width="12"
					height="12"
					viewBox="0 0 12 12"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M3 1h6a1 1 0 0 1 1 1v9l-4-2.5L2 11V2a1 1 0 0 1 1-1Z" />
				</svg>
			</IconButton>
			{open && (
				<div
					className={`absolute left-1/2 z-30 max-h-80 w-72 -translate-x-1/2 overflow-y-auto rounded-lg border border-white/20 bg-slate-900/95 p-3 shadow-xl backdrop-blur ${popupPositionClassName}`}
				>
					{EARTH_HISTORY_BOOKMARK_ERAS.map((era) => (
						<div key={era} className="mb-3 last:mb-0">
							<div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
								{era}
							</div>
							<div className="flex flex-wrap gap-1">
								{EARTH_HISTORY_BOOKMARKS.filter((b) => b.era === era).map(
									(bookmark) => (
										<button
											key={bookmark.eu4Date}
											onClick={() => {
												onSelect(bookmark.date)
												setOpen(false)
											}}
											className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-slate-200 hover:bg-white/15"
										>
											{bookmark.label}
										</button>
									),
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

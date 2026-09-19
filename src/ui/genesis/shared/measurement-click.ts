import type { MeasureMode } from "@/ui/genesis/controls/OverlayControls"

export function canHandlePlanetClick(
	measureMode: MeasureMode,
	opts: {
		hasWorld: boolean
		hasProvinces: boolean
	},
): boolean {
	if (!opts.hasWorld) return false
	if (measureMode === "off") return opts.hasProvinces
	return true
}

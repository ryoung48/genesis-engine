import type { MeasureMode } from "./controls/OverlayControls"

export function canHandlePlanetClick(
	measureMode: MeasureMode,
	opts: {
		hasWorld: boolean
		hasProvinces: boolean
		hasNationModel: boolean
	},
): boolean {
	if (!opts.hasWorld) return false
	if (measureMode === "off") {
		return opts.hasProvinces && opts.hasNationModel
	}
	return true
}

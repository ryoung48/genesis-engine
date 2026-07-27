import type { MeasureMode } from "@/ui/planet/controls/OverlayControls"

export function canHandlePlanetClick(
	measureMode: MeasureMode,
	opts: {
		hasWorld: boolean
		hasProvinces: boolean
		hasNationModel: boolean
		/** Earth-imported worlds never build a procedural nations structure
		 * (see derive-province-society.ts's isEarthImportRaster check) --
		 * nation identity there comes from the real EU4 engine instead, so
		 * hasNationModel alone would always fail this gate for them. */
		isEarthImport?: boolean
	},
): boolean {
	if (!opts.hasWorld) return false
	if (measureMode === "off") {
		return opts.hasProvinces && (opts.hasNationModel || !!opts.isEarthImport)
	}
	return true
}

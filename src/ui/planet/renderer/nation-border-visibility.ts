export function shouldRebuildNationBordersForVisibilityChange(opts: {
	nextVisible: boolean
	hasGlobeOverlay: boolean
	hasMapOverlay: boolean
}) {
	if (!opts.nextVisible) return false
	return !opts.hasGlobeOverlay || !opts.hasMapOverlay
}

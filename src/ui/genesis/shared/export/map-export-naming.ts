export function sanitizeExportIdentity(
	value: string | null | undefined,
): string | null {
	if (!value) return null
	const sanitized = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
	return sanitized.length > 0 ? sanitized : null
}

export function buildMapExportFilename(
	seed: number | null | undefined,
	width: number,
	date: Date = new Date(),
): string {
	const identity =
		sanitizeExportIdentity(seed?.toString()) ?? buildExportTimestamp(date)
	return `genesis-map-${identity}-${width}w.png`
}

export function buildExportTimestamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, "-")
}

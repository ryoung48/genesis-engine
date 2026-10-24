export const GENERATION_PREVIEW_TABS = [
	["climate", "CLIMATE"],
	["insolation", "INSOL"],
	["daylight", "LIGHT"],
] as const

export type GenerationPreviewTab = (typeof GENERATION_PREVIEW_TABS)[number][0]

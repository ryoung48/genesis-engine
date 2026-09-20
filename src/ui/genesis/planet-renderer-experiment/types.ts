import type { CloudBandStyle } from "@/ui/genesis/renderer/types"

export type PlanetTextureStyle =
	| CloudBandStyle
	| "cratered"
	| "martian"
	| "snowball"
	| "meltball"
	| "sun"
	| "white-dwarf"
	| "neutron-star"

export type PlanetPreviewSettings = {
	seed: number
	color: string
	style: PlanetTextureStyle
}

export type PlanetPreview = {
	setSettings: (settings: PlanetPreviewSettings) => void
	dispose: () => void
}

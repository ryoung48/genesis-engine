import type {
	RuneGeneratorOptions,
	RuneTemplate,
} from "@/model/society/script/runegen/rune/types"
import type { RuneRenderOptions } from "@/model/society/script/runegen/rune-renderer"

export const SCRIPT_TEMPLATE_OPTIONS = [
	{ value: "random1", label: "Classic 1" },
	{ value: "random2", label: "Classic 2" },
	{ value: "random4", label: "Hollow" },
	{ value: "random5", label: "Spine" },
	{ value: "cursive", label: "Cursive" },
	{ value: "carved", label: "Carved" },
] as const satisfies readonly { value: RuneTemplate; label: string }[]

const onOff = [
	{ value: "true", label: "On" },
	{ value: "false", label: "Off" },
]

export const GLYPH_OVERRIDE_SELECTS = [
	{ name: "template", label: "Template", choices: SCRIPT_TEMPLATE_OPTIONS },
	{
		name: "motif",
		label: "Motif",
		choices: [
			{ value: "none", label: "None" },
			{ value: "headline", label: "Headline" },
			{ value: "baseline", label: "Baseline" },
			{ value: "stave", label: "Stave" },
		],
	},
	{
		name: "weight",
		label: "Weight",
		choices: [
			{ value: "light", label: "Light" },
			{ value: "medium", label: "Medium" },
			{ value: "heavy", label: "Heavy" },
		],
	},
	{
		name: "symmetry",
		label: "Symmetry",
		choices: [
			{ value: "symmetric", label: "Symmetric" },
			{ value: "asymmetric", label: "Asymmetric" },
		],
	},
	{
		name: "discontinuous",
		label: "Allow disconnected strokes",
		choices: onOff,
	},
]

export const RENDER_OVERRIDE_SELECTS = [
	{
		name: "dotStyle",
		label: "Dot style",
		choices: [
			{ value: "fill", label: "Fill" },
			{ value: "outline", label: "Outline" },
			{ value: "small", label: "Small" },
		],
	},
	{ name: "smooth", label: "Smooth strokes", choices: onOff },
	{ name: "roundCaps", label: "Round caps", choices: onOff },
	{ name: "headline", label: "Join with a headline", choices: onOff },
]

export const SCRIPT_OVERRIDE_NUMBERS = {
	maxDots: { label: "Dot budget", min: 0, max: 3, step: 1 },
	noise: { label: "Stroke jitter", min: 0, max: 1, step: 0.05 },
	oblique: { label: "Slant", min: -0.2, max: 0.2, step: 0.01 },
	carvingWear: { label: "Carved edge wear", min: 0, max: 1, step: 0.05 },
	compression: { label: "Label compression ratio", min: 0, max: 1, step: 0.01 },
	scale: { label: "Texture scale", min: 1, max: 16, step: 1 },
} as const

export function readScriptOverrides(values: Record<string, string>) {
	const readNumber = (name: keyof typeof SCRIPT_OVERRIDE_NUMBERS) => {
		const value = values[name]
		if (!value) return undefined
		const { min, max } = SCRIPT_OVERRIDE_NUMBERS[name]
		const number = Number(value)
		return Number.isFinite(number) && number >= min && number <= max
			? number
			: undefined
	}
	const readBoolean = (name: string) => {
		const value = values[name]
		return value ? value === "true" : undefined
	}
	const generatorOptions: RuneGeneratorOptions = {
		seedTemplate: (values.template as RuneTemplate) || undefined,
		motif: (values.motif as RuneGeneratorOptions["motif"]) || undefined,
		weightBand:
			(values.weight as RuneGeneratorOptions["weightBand"]) || undefined,
		symmetryBias:
			(values.symmetry as RuneGeneratorOptions["symmetryBias"]) || undefined,
		maxDots: readNumber("maxDots"),
		allowDiscontinuousStrokes: readBoolean("discontinuous"),
	}
	const renderOptions: Partial<RuneRenderOptions> = Object.fromEntries(
		Object.entries({
			dotStyle: values.dotStyle || undefined,
			smooth: readBoolean("smooth"),
			roundCaps: readBoolean("roundCaps"),
			headline: readBoolean("headline"),
			noise: readNumber("noise"),
			oblique: readNumber("oblique"),
			carvingWear: readNumber("carvingWear"),
		}).filter(([, value]) => value !== undefined),
	)
	return {
		generatorOptions,
		renderOptions,
		compressionRatio: readNumber("compression"),
		scale: readNumber("scale"),
	}
}

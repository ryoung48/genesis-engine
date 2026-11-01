import { drawIcon, type JdenticonConfig } from "jdenticon"
import * as THREE from "three"
import { HASH } from "@/model/shared/random/hash"
import type {
	IdenticonColorParams,
	IdenticonConfigParams,
	IdenticonStyle,
	IdenticonTone,
} from "@/ui/heraldry/identicon/types"
import { HERALDRY_SHIELD } from "@/ui/heraldry/shield"
import type { HeraldryPaintParams } from "@/ui/heraldry/types"

const TONES: readonly IdenticonTone[] = [
	{
		roll: 0.5,
		backSaturation: 0.35,
		backLightness: 0.94,
		lightness: [0.2, 0.6],
		grayscaleLightness: [0.3, 0.6],
		saturation: 0.5,
	},
	{
		roll: 0.7,
		backSaturation: 0.42,
		backLightness: 0.28,
		lightness: [0.84, 0.84],
		grayscaleLightness: [0.84, 0.84],
		saturation: 0.48,
	},
	{
		roll: 0.9,
		backSaturation: 0.5,
		backLightness: 0.75,
		lightness: [0.1, 0.38],
		grayscaleLightness: [0.1, 0.38],
		saturation: 0.5,
	},
	{
		roll: 1,
		backSaturation: 0.4,
		backLightness: 0.12,
		lightness: [0.52, 0.84],
		grayscaleLightness: [0.52, 0.87],
		saturation: 0.5,
	},
]

function color({ hue, saturation, lightness }: IdenticonColorParams): string {
	return `#${new THREE.Color()
		.setHSL(hue / 360, saturation, lightness, THREE.SRGBColorSpace)
		.getHexString()}`
}

function style({ name, forcedHue }: IdenticonConfigParams): IdenticonStyle {
	const hash = HASH.keyed({ seed: 0, key: name }) >>> 0
	const hue = forcedHue ?? hash % 361
	const roll = HASH.unit({ seed: hash, channel: 0, salt: 0 })
	const tone = TONES.find((entry) => roll < entry.roll)!
	return {
		hue,
		backColor: color({
			hue,
			saturation: tone.backSaturation,
			lightness: tone.backLightness,
		}),
		lightness: tone.lightness,
		grayscaleLightness: tone.grayscaleLightness,
		saturation: tone.saturation,
	}
}

function configuration(params: IdenticonConfigParams): JdenticonConfig {
	const { hue, backColor, lightness, grayscaleLightness, saturation } =
		style(params)
	return {
		hues: [hue],
		backColor,
		lightness: {
			color: [...lightness],
			grayscale: [...grayscaleLightness],
		},
		saturation: { color: saturation, grayscale: saturation },
	}
}

function paint({ ctx, seed, width, height, hue }: HeraldryPaintParams) {
	const config = configuration({ name: seed, forcedHue: hue })
	ctx.save()
	ctx.fillStyle = config.backColor ?? "#ffffff"
	ctx.fillRect(0, 0, width, height)
	ctx.scale(
		width / HERALDRY_SHIELD.fieldWidth,
		height / HERALDRY_SHIELD.fieldHeight,
	)
	ctx.translate(0.4, 1)
	ctx.scale(0.04, 0.04)
	drawIcon(ctx, seed, 100, config)
	ctx.restore()
}

export const IDENTICON_HERALDRY = { paint, style, color }

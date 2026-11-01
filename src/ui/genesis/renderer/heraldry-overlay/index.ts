import * as THREE from "three"
import type { Text } from "troika-three-text"
import type {
	HeraldryAttachment,
	HeraldryOverlayUpdate,
	NationHueParams,
	TextureParams,
} from "@/ui/genesis/renderer/heraldry-overlay/types"
import { LABEL_RENDER_ORDER } from "@/ui/genesis/renderer/nation-label-overlay/constants"
import { SCRIPT_BLOCK_HEIGHT_FACTOR } from "@/ui/genesis/renderer/nation-script-overlay"
import { HERALDRY_SHIELD } from "@/ui/heraldry/shield"
import { FLAG_GENERATOR } from "@/ui/heraldry/simple"

const HUE_BUCKET_DEGREES = 15
const MIN_NATION_CHROMA = 0.08

const STYLE = {
	textureSize: 128,
	heightInFontSizes: 2,
	gapInFontSizes: 0.35,
}

function nationHue({ colors, index }: NationHueParams): number | null {
	if (!colors || colors.length < (index + 1) * 3) return null
	const r = colors[index * 3]
	const g = colors[index * 3 + 1]
	const b = colors[index * 3 + 2]
	if (Math.max(r, g, b) - Math.min(r, g, b) < MIN_NATION_CHROMA) return null
	const hsl = { h: 0, s: 0, l: 0 }
	new THREE.Color()
		.setRGB(r, g, b, THREE.SRGBColorSpace)
		.getHSL(hsl, THREE.SRGBColorSpace)
	return (
		(Math.round((hsl.h * 360) / HUE_BUCKET_DEGREES) * HUE_BUCKET_DEGREES) % 360
	)
}

function renderTexture({
	name,
	hue,
}: TextureParams): THREE.CanvasTexture | null {
	const canvas = FLAG_GENERATOR.render({
		design: FLAG_GENERATOR.sample({ seed: name, pattern: "map", hue }),
		width: STYLE.textureSize,
	})
	if (!canvas) return null
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	return texture
}

function create() {
	const attachments = new Map<Text, HeraldryAttachment>()
	const textures = new Map<string, THREE.CanvasTexture>()
	const geometry = new THREE.PlaneGeometry(1, 1)

	function update({
		groups,
		names,
		colors,
		showHeraldry,
		showNames,
		showScript,
	}: HeraldryOverlayUpdate) {
		const hues = names.map((_, index) => nationHue({ colors, index }))
		const keyFor = (index: number) => `${names[index]}|${hues[index]}`
		const activeKeys = new Set(names.map((_, index) => keyFor(index)))
		for (const [key, texture] of textures) {
			if (activeKeys.has(key)) continue
			texture.dispose()
			textures.delete(key)
		}
		for (const { mesh } of attachments.values()) mesh.visible = false
		for (const group of groups) {
			if (!group) continue
			for (const child of group.children) {
				if (child.userData.nationIdx === undefined) continue
				const label = child as Text
				const index: number = label.userData.nationIdx
				const name = names[index]
				if (!showNames) {
					label.text = ""
					label.sync()
				}
				if (!showHeraldry || !name) continue
				const key = keyFor(index)
				let texture = textures.get(key)
				if (!texture) {
					const rendered = renderTexture({ name, hue: hues[index] })
					if (!rendered) continue
					texture = rendered
					textures.set(key, texture)
				}
				let attachment = attachments.get(label)
				if (!attachment) {
					const mesh = new THREE.Mesh(
						geometry,
						new THREE.MeshBasicMaterial({
							transparent: true,
							depthWrite: false,
							toneMapped: false,
						}),
					)
					mesh.renderOrder = LABEL_RENDER_ORDER
					attachment = { label, mesh }
					attachments.set(label, attachment)
					label.add(mesh)
				}
				const { mesh } = attachment
				if (mesh.material.map !== texture) {
					mesh.material.map = texture
					mesh.material.needsUpdate = true
				}
				const height = label.userData.heraldryFontSize * STYLE.heightInFontSizes
				mesh.scale.set(height * HERALDRY_SHIELD.aspect, height, 1)
				const scriptBlock =
					showScript && showNames
						? label.fontSize * SCRIPT_BLOCK_HEIGHT_FACTOR
						: 0
				mesh.position.set(
					0,
					showNames
						? -height / 2 - label.fontSize * STYLE.gapInFontSizes - scriptBlock
						: height / 2,
					0,
				)
				mesh.visible = true
			}
		}
	}

	function dispose() {
		for (const { label, mesh } of attachments.values()) {
			label.remove(mesh)
			mesh.material.dispose()
		}
		attachments.clear()
		for (const texture of textures.values()) texture.dispose()
		textures.clear()
		geometry.dispose()
	}

	return { update, dispose }
}

export const HERALDRY_OVERLAY = { create }

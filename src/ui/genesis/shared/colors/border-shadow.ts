import type { ApplyBorderShadowParams } from "@/ui/genesis/shared/colors/types"

const SHADOW_DEPTH_HOPS = 5
const SHADOW_FALLOFF_POWER = 2
const EDGE_DARKEN = 0.68
const EDGE_SATURATION = 1.35
const INTERIOR_WASH = 0.22

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}

export function applyBorderShadow({
	rgb,
	owner,
	adjOffset,
	adjList,
}: ApplyBorderShadowParams): Float32Array {
	const N = owner.length
	const out = new Float32Array(rgb)
	const hops = new Int16Array(N).fill(-1)
	let frontier: number[] = []
	for (let r = 0; r < N; r++) {
		if (owner[r] < 0) continue
		for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
			if (owner[adjList[i]] !== owner[r]) {
				hops[r] = 0
				frontier.push(r)
				break
			}
		}
	}
	for (let hop = 1; hop < SHADOW_DEPTH_HOPS && frontier.length > 0; hop++) {
		const next: number[] = []
		for (const r of frontier) {
			for (let i = adjOffset[r]; i < adjOffset[r + 1]; i++) {
				const neighbor = adjList[i]
				if (owner[neighbor] !== owner[r] || hops[neighbor] >= 0) continue
				hops[neighbor] = hop
				next.push(neighbor)
			}
		}
		frontier = next
	}
	for (let r = 0; r < N; r++) {
		if (owner[r] < 0) continue
		const depth = hops[r] < 0 ? SHADOW_DEPTH_HOPS : hops[r]
		const edge = (1 - depth / SHADOW_DEPTH_HOPS) ** SHADOW_FALLOFF_POWER
		const base = 3 * r
		const luma =
			rgb[base] * 0.299 + rgb[base + 1] * 0.587 + rgb[base + 2] * 0.114
		for (let c = 0; c < 3; c++) {
			const value = rgb[base + c]
			const wash = value + (1 - value) * INTERIOR_WASH
			const shadow = clamp01(
				(luma + (value - luma) * EDGE_SATURATION) * EDGE_DARKEN,
			)
			out[base + c] = wash + (shadow - wash) * edge
		}
	}
	return out
}

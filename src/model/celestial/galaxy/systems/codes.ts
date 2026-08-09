import type { StarRole } from "@/model/celestial/galaxy/systems/types"
import type {
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import {
	EXOTIC_SPECTRAL_CLASSES,
	MAIN_SEQUENCE_CLASSES,
} from "@/model/celestial/star/types"

// Mirrors galaxy-gen's stars/codes.ts encode/decode-table pattern.
export const packedStarRoleOrder = [
	"primary",
	"epistellar",
	"inner",
	"outer",
	"distant",
] as const satisfies readonly StarRole[]

// O..M then L,T,Y,D,NS,BH -- exactly galaxy-gen's spectralClassOrder
// (stars/codes.ts), just assembled from this repo's two separate class-list
// constants (MainSequenceClass ∪ ExoticSpectralClass) instead of one literal
// tuple.
export const spectralClassOrder = [
	...MAIN_SEQUENCE_CLASSES,
	...EXOTIC_SPECTRAL_CLASSES,
] as const satisfies readonly SpectralClass[]

export const luminosityClassOrder = [
	"Ia",
	"Ib",
	"II",
	"III",
	"IV",
	"V",
	"VI",
	"O",
	"P",
	"M",
] as const satisfies readonly LuminosityClass[]

const spectralClassToCode = new Map<SpectralClass, number>(
	spectralClassOrder.map((value, index) => [value, index]),
)

const luminosityClassToCode = new Map<LuminosityClass, number>(
	luminosityClassOrder.map((value, index) => [value, index]),
)

const roleToCode = new Map<StarRole, number>(
	packedStarRoleOrder.map((value, index) => [value, index]),
)

export function encodeSpectralClass(value: SpectralClass): number {
	const code = spectralClassToCode.get(value)
	if (code === undefined) {
		throw new Error(`Unknown spectral class: ${value}`)
	}
	return code
}

export function decodeSpectralClass(code: number): SpectralClass {
	const value = spectralClassOrder[code]
	if (value === undefined) {
		throw new Error(`Unknown spectral class code: ${code}`)
	}
	return value
}

export function encodeLuminosityClass(value: LuminosityClass): number {
	const code = luminosityClassToCode.get(value)
	if (code === undefined) {
		throw new Error(`Unknown luminosity class: ${value}`)
	}
	return code
}

export function decodeLuminosityClass(code: number): LuminosityClass {
	const value = luminosityClassOrder[code]
	if (value === undefined) {
		throw new Error(`Unknown luminosity class code: ${code}`)
	}
	return value
}

export function encodeStarRole(value: StarRole): number {
	const code = roleToCode.get(value)
	if (code === undefined) {
		throw new Error(`Unknown star role: ${value}`)
	}
	return code
}

export function decodeStarRole(code: number): StarRole {
	const value = packedStarRoleOrder[code]
	if (value === undefined) {
		throw new Error(`Unknown star role code: ${code}`)
	}
	return value
}

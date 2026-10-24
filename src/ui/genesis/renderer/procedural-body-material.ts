import type * as THREE from "three"
import type {
	AtmosphereProfile,
	OrbitClassification,
} from "@/model/celestial/orbit-body/types"
import {
	buildCloudBandMaterial,
	swatchCloudBandPalette,
} from "@/ui/genesis/renderer/cloud-band-material"
import { buildCraterMaterial } from "@/ui/genesis/renderer/crater-material"
import { DEFERRED_SHADERS } from "@/ui/genesis/renderer/deferred-shaders"

export interface ProceduralBodyMaterialInput {
	seed: number
	classification: OrbitClassification | undefined
	atmosphere: AtmosphereProfile | null | undefined
	swatchHex: number
}

function hasThinAtmosphere(
	atmosphere: AtmosphereProfile | null | undefined,
): boolean {
	if (!atmosphere) return true
	if (atmosphere.type === "vacuum" || atmosphere.type === "trace") return true
	return atmosphere.subtype === "thin" || atmosphere.subtype === "very thin"
}

export function buildProceduralBodyMaterial(
	input: ProceduralBodyMaterialInput,
): THREE.MeshStandardMaterial {
	const material = selectProceduralBodyMaterial(input)
	DEFERRED_SHADERS.mark({
		material,
		deferral: { kind: "stand-in", color: input.swatchHex, lit: true },
	})
	return material
}

function selectProceduralBodyMaterial(
	input: ProceduralBodyMaterialInput,
): THREE.MeshStandardMaterial {
	const { seed, classification, atmosphere, swatchHex } = input
	const cloudy = (style: "cloudy" | "banded" | "venusian") =>
		buildCloudBandMaterial({
			seed,
			style,
			palette: swatchCloudBandPalette({ hex: swatchHex }),
		})
	const cratered = (style: "cratered" | "martian" | "meltball") =>
		buildCraterMaterial({
			seed,
			color: `#${swatchHex.toString(16).padStart(6, "0")}`,
			style,
		})

	// Panthalassic is always a full ocean world regardless of atmosphere, so
	// it always keeps the cloudy look -- helian is not (a thin/trace/vacuum
	// atmosphere reads as a bare rock, same as any other classification), so
	// it falls through to the shared atmosphere check below instead.
	if (classification === "panthalassic") return cloudy("cloudy")
	if (classification === "jovian") return cloudy("banded")
	if (classification === "telluric") return cloudy("venusian")
	if (classification === "meltball") return cratered("meltball")
	if (classification === "rockball") return cratered("cratered")
	if (classification === "snowball" && hasThinAtmosphere(atmosphere))
		return cratered("cratered")
	return hasThinAtmosphere(atmosphere) ? cratered("martian") : cloudy("cloudy")
}

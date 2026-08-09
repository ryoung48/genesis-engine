import type { OrbitClassification } from "@/model/celestial/orbit-body/types"

export interface HeatedClassInput {
	current: OrbitClassification
	seed: number
}

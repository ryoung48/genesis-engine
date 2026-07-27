import type { SphereMesh } from "@/model/mesh/types"
import type {
	GenesisTerrainFeatures,
	TectonicPlate,
} from "@/model/tectonics/types"

export interface Dome {
	x: number
	y: number
	z: number
	strength: number
	baseStrength: number
	sigma: number
	chainIndex: number
	chainLength: number
	dx: number
	dy: number
	dz: number
	ux: number
	uy: number
	uz: number
	vx: number
	vy: number
	vz: number
	riftAngles: number[]
	// Pre-computed
	cosThreshPeak: number
	invS2: number
	swellSigma: number
	swellStrength: number
	cosThreshSwell: number
	invS2Swell: number
	driftStretch: number
	hasCaldera: boolean
	calderaSigma: number
	calderaDepth: number
	invS2Caldera: number
	ageFactor: number
	isContinental: boolean
}

export interface ApplyHotspotsParams {
	mesh: SphereMesh
	plates: TectonicPlate[]
	plateAssignment: Int32Array
	elevation: Float32Array
	mantleUpwelling: Float32Array
	terrainFeatures: GenesisTerrainFeatures | undefined
	seed: number
	volcanism: number
}

export interface FindNearestRParams {
	mesh: SphereMesh
	px: number
	py: number
	pz: number
}

import type {
	BuildMovingPlatesParams,
	BuildPlateMotionParams,
	MovingPlates,
	PlateMotion,
	VelocityCmYrParams,
	VelocityUnitsParams,
} from "@/model/geography/tectonics/plate-motion/types"
import { MATH } from "@/model/shared/math/core"

const RMS_PLATE_SPEED_CM_YR = 4

function buildMovingPlates({
	r_plate,
	plateVec,
	plateIsOcean,
	plateDensity,
	superPlateData,
}: BuildMovingPlatesParams): MovingPlates {
	if (!superPlateData) {
		return {
			cellPlate: r_plate,
			vec: plateVec,
			isOcean: plateIsOcean,
			density: plateDensity,
		}
	}
	return {
		cellPlate: superPlateData.r_superPlate,
		vec: superPlateData.superPlateVec,
		isOcean: superPlateData.superPlateIsOcean,
		density: superPlateData.superPlateDensity,
	}
}

function velocityUnits({
	plates,
	plate,
	x,
	y,
	z,
}: VelocityUnitsParams): [number, number, number] {
	const pv = plates.vec.get(plate)
	if (!pv) return [0, 0, 0]
	return MATH.eulerVelocityAt({ pole: pv.pole, omega: pv.omega, x, y, z })
}

function build({ mesh, plates }: BuildPlateMotionParams): PlateMotion {
	const { numRegions, r_xyz, regionArea } = mesh
	let weighted = 0
	let area = 0
	for (let r = 0; r < numRegions; r++) {
		const v = velocityUnits({
			plates,
			plate: plates.cellPlate[r],
			x: r_xyz[3 * r],
			y: r_xyz[3 * r + 1],
			z: r_xyz[3 * r + 2],
		})
		weighted += regionArea[r] * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
		area += regionArea[r]
	}
	const measuredRms = Math.sqrt(weighted / Math.max(1e-12, area))
	return {
		plates,
		cmYrPerUnit: measuredRms > 1e-12 ? RMS_PLATE_SPEED_CM_YR / measuredRms : 0,
	}
}

function velocityCmYr({
	motion,
	plate,
	x,
	y,
	z,
}: VelocityCmYrParams): [number, number, number] {
	const v = velocityUnits({ plates: motion.plates, plate, x, y, z })
	return [
		v[0] * motion.cmYrPerUnit,
		v[1] * motion.cmYrPerUnit,
		v[2] * motion.cmYrPerUnit,
	]
}

export const PLATE_MOTION = {
	buildMovingPlates,
	build,
	velocityCmYr,
}

const DEPTH_M = 50
const SEAWATER_DENSITY_KG_M3 = 1025
const SEAWATER_HEAT_CAPACITY_J_KG_K = 3990
const AIR_SEA_EXCHANGE_W_M2_K = 30

// Time for a mixed-layer temperature anomaly to relax toward the air above it,
// rho * c_p * h / lambda (~80 days).
const RELAXATION_SECONDS =
	(SEAWATER_DENSITY_KG_M3 * SEAWATER_HEAT_CAPACITY_J_KG_K * DEPTH_M) /
	AIR_SEA_EXCHANGE_W_M2_K

export const MIXED_LAYER = {
	depthM: DEPTH_M,
	seawaterDensityKgM3: SEAWATER_DENSITY_KG_M3,
	relaxationSeconds: RELAXATION_SECONDS,
}

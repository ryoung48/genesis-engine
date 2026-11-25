import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import type { HydraulicKey } from "@/model/geography/terrain/groundwater-config/types"

const M_PER_KM = 1000

export const SHORE_CONFIG = {
	refWindMs: 10,
	exposureEdgesM: [0.6, 1.5],
	shelterEdgesM: [1.5, 2.4],
	radialDeg: [-45, -22.5, 0, 22.5, 45],
	reliefLowMPerKm: GROUNDWATER_CONFIG.shoreSlopeMin * M_PER_KM,
	reliefSteepMPerKm: 10,
	resist: {
		shield: 1,
		granite: 1,
		gneiss: 1,
		greenstone: 0.9,
		ophiolite: 0.9,
		basalt: 0.85,
		volcanic: 0.7,
		slate: 0.6,
		limestone: 0.6,
		sandstone: 0.55,
		shale: 0.25,
		salt: 0.05,
		till: 0.1,
		river: 0,
		loess: 0,
		erg: 0,
		young: 0,
	} satisfies Record<HydraulicKey, number>,
	resistMin: 0.6,
	sandMin: 50,
	deltaFlowM3s: 500,
	estuaryFlowM3s: GROUNDWATER_CONFIG.floodM3s,
	flatRangeM: 2,
	marshLabelShare: 0.05,
	volcanicSandActivity: 0.25,
	volcanicKeys: ["basalt", "volcanic"],
} as const

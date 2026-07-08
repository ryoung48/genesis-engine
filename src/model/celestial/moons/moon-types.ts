import type { AtmosphereProfile, OrbitBody } from "../orbit-body"

export type {
	AtmosphereProfile,
	SeismologyProfile,
	TideLock,
} from "../orbit-body"

export type MoonOrbitRange = "inner" | "middle" | "outer" | "extreme"

export type PlanetType = "terrestrial"

export interface MoonBody extends OrbitBody {
	meanAnomalyAtEpochDeg: number
	orbitRange?: MoonOrbitRange
	semiMajorAxisPlanetDiameters?: number
}

export const MAX_MOONS = 3

// Fallback for any moon that doesn't get a rolled/authored atmosphere of its
// own (see generateMoons() and sol-system.ts's SolMoonSeed table) -- most
// moons in reality are airless, and an explicit vacuum profile keeps the
// stats card's Atmosphere row from silently disappearing (the row is only
// omitted when `atmosphere` is `undefined`, not when it's vacuum).
export const DEFAULT_MOON_ATMOSPHERE: AtmosphereProfile = {
	code: 0,
	pressureBar: 0,
	type: "vacuum",
	breathable: false,
}

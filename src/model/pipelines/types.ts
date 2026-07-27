import type { TideLock } from "@/model/celestial/orbit-body/types"
import type { SocietyEra } from "@/model/society/types"

export interface GenesisParams {
	seed: number
	numPoints: number
	numPlates: number
	landDistribution: number
	continentSizeVariety: number
	landCoverage: number
	jitter: number
	roughness: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	seaLevel: number
	volcanism?: number
	craters?: number // 0 = none, 1 = heavily cratered
	maxElevation?: number // max elevation in meters, default 6000
	planetRadiusKm: number
	obliquity: number // axial tilt in degrees, default 23.5
	eccentricity: number // orbital eccentricity, default 0.0167
	spectralClass: string // stellar spectral class, default "G"
	starSubtype: number // spectral subtype 0–9, default 2.0 (G2 ≈ Sol)
	orbitalDistanceAU: number // orbital semi-major axis in AU, default 1.0
	daysPerYear: number // orbital year length in local days, default 365
	hoursPerDay: number // rotation period expressed as local hours per day, default 24
	tideLock: TideLock | null // null = not locked
	substellarLon: number // longitude of the substellar point in degrees (0-360), default 0
	perihelion: number // argument of perihelion in degrees (0-360), default 90
	pressure?: number // atmospheric pressure in bars, default 1.0
	/** Real per-body Bond albedo override (0..1) -- pass this for a known real
	 * body (e.g. Sol's Earth, see sol-system.ts's SolPlanetSeed.albedo doc);
	 * leave unset for a procedurally generated world, which falls back to
	 * EMB_CONSTANTS.surface.ALBEDO.BASE. */
	albedo?: number
	/** Real per-body EBM greenhouseFactor override -- pass this alongside
	 * albedo for a known real body (see ebm/index.ts's EBMConfig.
	 * greenhouseFactor doc for what it means and how it's fit); leave unset
	 * for a procedurally generated world, which falls back to
	 * EMB_CONSTANTS.surface.GREENHOUSE_FACTOR. */
	greenhouseFactor?: number
	/** Geologic/tidal heating (system-seismology.ts's SeismologyProfile.
	 * totalHeating), applied on top of the EBM's own solved equilibrium --
	 * see ebm/index.ts's EBMConfig.seismologyTotalHeatingK doc. 0/unset for
	 * the overwhelming majority of bodies; only matters for a geologically or
	 * tidally active world/moon (e.g. an Io-analog). Never pass this for a
	 * jovian -- see that doc's explanation of why it breaks their
	 * temperature calibration. */
	seismologyTotalHeatingK?: number
	/** Seed for the sibling/system bodies shown in the Generation panel; 0 = Sol. Not used by terrain generation. */
	restSeed?: number
	/** Society era preset; controls population, settlement coverage, and nation-formation thresholds */
	era?: SocietyEra
}

export interface StageTiming {
	Stage: string
	ms: string
}

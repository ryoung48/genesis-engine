import { describe, expect, it } from "vitest"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthRiverLines } from "./assets"

const LAT_BANDS = [
	{ label: "60N-90N", lo: 60, hi: 90 },
	{ label: "30N-60N", lo: 30, hi: 60 },
	{ label: "0-30N", lo: 0, hi: 30 },
	{ label: "0-30S", lo: -30, hi: 0 },
	{ label: "30S-60S", lo: -60, hi: -30 },
	{ label: "60S-90S", lo: -90, hi: -60 },
]

function buildEarth(obliquity: number) {
	const earth = loadEarthGrayscale("earth.png")
	const coastline = loadEarthGrayscale("coastline-mask.png")
	const lake = loadEarthGrayscale("lake-mask.png")
	const riverLines = loadEarthRiverLines()

	return IMPORT_HEIGHTMAP.importGenesisWorld({
		params: {
			seed: 14963991,
			numPoints: DEFAULT_WORLD_PARAMS.numPoints,
			jitter: DEFAULT_WORLD_PARAMS.jitter,
			grayscale: earth.grayscale,
			imageWidth: earth.width,
			imageHeight: earth.height,
			coastlineMask: coastline.grayscale,
			maskWidth: coastline.width,
			maskHeight: coastline.height,
			lakeMask: lake.grayscale,
			lakeMaskWidth: lake.width,
			lakeMaskHeight: lake.height,
			riverLines,
			// Zeroed, not DEFAULT_WORLD_PARAMS -- those are tuned for shaping
			// synthetic noise into plausible terrain. A real Earth heightmap
			// already IS realistic terrain; warping/smoothing/eroding it distorts
			// real elevation instead of preserving it.
			terrainWarp: 0,
			smoothing: 0,
			hydraulicErosion: 0,
			thermalErosion: 0,
			ridgeSharpening: 0,
			glacialErosion: 0,
			seaLevel: DEFAULT_WORLD_PARAMS.seaLevel,
			volcanism: 1,
			craters: 0,
			maxElevation: DEFAULT_WORLD_PARAMS.maxElevation,
			planetRadiusKm: DEFAULT_WORLD_PARAMS.planetRadiusKm,
			obliquity,
			eccentricity: DEFAULT_WORLD_PARAMS.eccentricity,
			spectralClass: DEFAULT_WORLD_PARAMS.spectralClass,
			starSubtype: DEFAULT_WORLD_PARAMS.starSubtype,
			orbitalDistanceAU: DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
			daysPerYear: DEFAULT_WORLD_PARAMS.daysPerYear,
			hoursPerDay: DEFAULT_WORLD_PARAMS.hoursPerDay,
			substellarLon: DEFAULT_WORLD_PARAMS.substellarLon,
			perihelion: DEFAULT_WORLD_PARAMS.perihelion,
			pressure: DEFAULT_WORLD_PARAMS.pressure,
		},
	})
}

function summarizeByLatitude(world: ReturnType<typeof buildEarth>) {
	const { climate, mesh } = world
	const r_xyz = mesh.r_xyz
	const avg = climate.temperature_avg

	const bandStats = LAT_BANDS.map((b) => ({
		...b,
		n: 0,
		sum: 0,
		min: Infinity,
	}))
	let globalN = 0
	let globalSum = 0
	let belowFreezingN = 0

	for (let r = 0; r < mesh.numRegions; r++) {
		const t = avg[r]
		if (!Number.isFinite(t)) continue
		const z = r_xyz[r * 3 + 2]
		const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI

		globalN++
		globalSum += t
		if (t < 0) belowFreezingN++

		const band = bandStats.find((b) => lat >= b.lo && lat < b.hi)
		if (band) {
			band.n++
			band.sum += t
			band.min = Math.min(band.min, t)
		}
	}

	return {
		globalMeanC: globalSum / Math.max(1, globalN),
		belowFreezingPct: (100 * belowFreezingN) / Math.max(1, globalN),
		bandStats: bandStats.map((b) => ({
			band: b.label,
			cells: b.n,
			meanC: b.n > 0 ? Number((b.sum / b.n).toFixed(2)) : NaN,
			minC: b.n > 0 ? Number(b.min.toFixed(2)) : NaN,
		})),
	}
}

describe("EBM at extreme axial tilt (90 deg obliquity)", () => {
	it("shows the real Earth heightmap's polar/tropical climate inverting at 90 deg obliquity vs today's 23.4 deg", () => {
		const baseline = summarizeByLatitude(
			buildEarth(DEFAULT_WORLD_PARAMS.obliquity),
		)
		const tilted = summarizeByLatitude(buildEarth(90))

		console.info(
			`Baseline obliquity ${DEFAULT_WORLD_PARAMS.obliquity} deg -- global mean ${baseline.globalMeanC.toFixed(2)}C, ${baseline.belowFreezingPct.toFixed(1)}% of land below 0C`,
		)
		console.table(baseline.bandStats)

		console.info(
			`Extreme obliquity 90 deg -- global mean ${tilted.globalMeanC.toFixed(2)}C, ${tilted.belowFreezingPct.toFixed(1)}% of land below 0C`,
		)
		console.table(tilted.bandStats)

		// [CHANGED] Used to assert belowFreezingPct simply went up at extreme
		// tilt, on the theory that six-month polar nights would let the poles
		// (and, by transport, everywhere else) cool far more than the
		// six-month polar days could rewarm them. That was wrong: a pole at
		// 90 deg obliquity gets six continuous months of DAYLIGHT per year,
		// which gives it a higher annual-mean insolation than a low-tilt
		// pole ever sees (it barely gets direct sun at all) -- a documented
		// real effect in high-obliquity planet climate literature (warmer
		// poles, cooler tropics, sometimes a full pole/equator inversion).
		// This only became visible once land was properly thermally coupled
		// to the ocean at the same latitude (see energy-balance-model's
		// land/water Nu coupling) -- beforehand, land's un-buffered swings
		// let it plunge far colder during polar winter regardless of the
		// warm annual mean, masking the real insolation-driven pattern with
		// an artificially inflated polar freeze. The physically meaningful
		// check is the inversion itself: poles warm up, tropics cool down.
		const baselinePoles =
			(baseline.bandStats.find((b) => b.band === "60N-90N")!.meanC +
				baseline.bandStats.find((b) => b.band === "60S-90S")!.meanC) /
			2
		const tiltedPoles =
			(tilted.bandStats.find((b) => b.band === "60N-90N")!.meanC +
				tilted.bandStats.find((b) => b.band === "60S-90S")!.meanC) /
			2
		const baselineTropics =
			(baseline.bandStats.find((b) => b.band === "0-30N")!.meanC +
				baseline.bandStats.find((b) => b.band === "0-30S")!.meanC) /
			2
		const tiltedTropics =
			(tilted.bandStats.find((b) => b.band === "0-30N")!.meanC +
				tilted.bandStats.find((b) => b.band === "0-30S")!.meanC) /
			2

		expect(tilted.globalMeanC).toBeLessThan(baseline.globalMeanC)
		expect(tiltedPoles).toBeGreaterThan(baselinePoles)
		expect(tiltedTropics).toBeLessThan(baselineTropics)
	}, 600_000)
})

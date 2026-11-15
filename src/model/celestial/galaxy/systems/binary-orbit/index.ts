import type {
	AxisRoundingInput,
	BinaryOrbit,
	OuterSpacingInput,
	PlanetaryRegionsInput,
	StabilityFit,
} from "@/model/celestial/galaxy/systems/binary-orbit/types"
import type { StarPreview } from "@/model/celestial/galaxy/systems/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { OrbitRegion } from "@/model/celestial/orbit-body/types"
import { STAR } from "@/model/celestial/star"
import { TIME } from "@/model/shared/time"

function circumstellarLimitAU({
	orbitalDistanceAU,
	eccentricity: e,
	massRatio: mu,
}: StabilityFit): number {
	if (mu < 0.1 || mu > 0.9 || e < 0 || e > 0.8) return 0
	return (
		orbitalDistanceAU *
		(0.464 -
			0.38 * mu -
			0.631 * e +
			0.586 * mu * e +
			0.15 * e ** 2 -
			0.198 * mu * e ** 2)
	)
}

function circumbinaryLimitAU({
	orbitalDistanceAU,
	eccentricity: e,
	massRatio: mu,
}: StabilityFit): number {
	if (mu < 0.1 || mu > 0.5 || e < 0 || e > 0.7) return Infinity
	return (
		orbitalDistanceAU *
		(1.6 +
			5.1 * e -
			2.22 * e ** 2 +
			4.12 * mu -
			4.27 * e * mu -
			5.09 * mu ** 2 +
			4.61 * e ** 2 * mu ** 2)
	)
}

function outerPeriapsisFloorAU({
	innerAxisAU,
	eccentricity,
	massRatio,
}: OuterSpacingInput): number {
	return (
		2.8 *
		innerAxisAU *
		(((1 + massRatio) * (1 + eccentricity)) / Math.sqrt(1 - eccentricity)) **
			0.4
	)
}

function resolve(stars: StarPreview[]): BinaryOrbit[] {
	const [primary, secondary, wider] = stars
	if (!primary || !secondary || secondary.parentIndex !== 0) return []
	if (stars.length !== 2 && !isCloseTriple(stars)) return []
	const innerMass = primary.massSol + secondary.massSol
	const inner: BinaryOrbit = {
		a: { center: { kind: "star", index: 0 }, massSol: primary.massSol },
		b: { center: { kind: "star", index: 1 }, massSol: secondary.massSol },
		orbitalDistanceAU: secondary.orbitalDistanceAU,
		eccentricity: secondary.eccentricity,
		inclinationDeg: secondary.inclinationDeg,
		orbitalPeriodDays:
			STAR.getKeplerYearYears({
				orbitalDistanceAU: secondary.orbitalDistanceAU,
				massSol: innerMass,
			}) * TIME.astronomicalDaysPerYear,
	}
	if (!wider) return [inner]
	return [
		inner,
		{
			a: { center: { kind: "binary", index: 0 }, massSol: innerMass },
			b: { center: { kind: "star", index: 2 }, massSol: wider.massSol },
			orbitalDistanceAU: wider.orbitalDistanceAU,
			eccentricity: wider.eccentricity,
			inclinationDeg: wider.inclinationDeg,
			orbitalPeriodDays:
				STAR.getKeplerYearYears({
					orbitalDistanceAU: wider.orbitalDistanceAU,
					massSol: innerMass + wider.massSol,
				}) * TIME.astronomicalDaysPerYear,
		},
	]
}

function isCloseTriple(stars: StarPreview[]): boolean {
	return (
		stars.length === 3 &&
		stars[1]?.role === "epistellar" &&
		stars[1].parentIndex === 0 &&
		stars[2]?.parentIndex === 0 &&
		stars[2].role !== "epistellar"
	)
}

function normalizeTriple(stars: StarPreview[]): boolean {
	if (!isCloseTriple(stars)) return false
	const [primary, inner, outer] = stars as [
		StarPreview,
		StarPreview,
		StarPreview,
	]
	for (const star of stars) {
		star.massSol = Math.fround(star.massSol)
		star.diameterSol = Math.fround(star.diameterSol)
		star.eccentricity = Math.fround(star.eccentricity)
		star.inclinationDeg = Math.fround(star.inclinationDeg)
		star.mao = Math.fround(star.mao)
		star.luminositySol = Math.fround(star.luminositySol)
	}
	inner.orbitalDistanceAU = roundAxis({
		axisAU: inner.orbitalDistanceAU,
		floorAU:
			Math.max(
				primary.mao,
				STAR.getMinimumStarPeriapsisAU({ a: primary, b: inner }),
			) /
			(1 - inner.eccentricity),
	})
	const innerMass = primary.massSol + inner.massSol
	const innerApoapsis = inner.orbitalDistanceAU * (1 + inner.eccentricity)
	const periapsisFloor = Math.max(
		outerPeriapsisFloorAU({
			innerAxisAU: inner.orbitalDistanceAU,
			eccentricity: outer.eccentricity,
			massRatio: outer.massSol / innerMass,
		}),
		(innerApoapsis * inner.massSol) / innerMass +
			STAR.getMinimumStarPeriapsisAU({ a: primary, b: outer }),
		(innerApoapsis * primary.massSol) / innerMass +
			STAR.getMinimumStarPeriapsisAU({ a: inner, b: outer }),
		primary.mao,
	)
	outer.orbitalDistanceAU = roundAxis({
		axisAU: outer.orbitalDistanceAU,
		floorAU: periapsisFloor / (1 - outer.eccentricity),
	})
	return true
}

function roundAxis({ axisAU, floorAU }: AxisRoundingInput): number {
	const value = Float32Array.of(Math.max(axisAU, floorAU))
	if (value[0]! <= floorAU || value[0]! < axisAU) {
		const bits = new Uint32Array(value.buffer)
		bits[0] = bits[0]! + 1
	}
	return value[0]!
}

function planetaryRegions({
	stars,
	orbits,
}: PlanetaryRegionsInput): OrbitRegion[] {
	const [inner, outer] = orbits
	if (!inner || stars[1]?.role !== "epistellar") return []
	const primary = stars[0]!
	const secondary = stars[1]!
	const innerMass = primary.massSol + secondary.massSol
	const innerApoapsis = inner.orbitalDistanceAU * (1 + inner.eccentricity)
	const innerLimit = outer
		? circumstellarLimitAU({
				...outer,
				massRatio: outer.b.massSol / (innerMass + outer.b.massSol),
			})
		: Infinity
	const stellarRegions = stars.map((star, index): OrbitRegion => {
		const isWider = index === 2 && outer !== undefined
		const orbit = isWider ? outer : inner
		const otherMass = isWider
			? innerMass
			: index === 0
				? secondary.massSol
				: primary.massSol
		const stabilityLimit = circumstellarLimitAU({
			...orbit,
			massRatio: otherMass / (star.massSol + otherMass),
		})
		return {
			center: { kind: "star", index },
			minAU: star.mao,
			maxAU: isWider
				? stabilityLimit
				: Math.min(
						stabilityLimit,
						innerLimit - (innerApoapsis * otherMass) / innerMass,
					),
			massSol: star.massSol,
			luminositySol: star.luminositySol,
			inclinationDeg: orbit.inclinationDeg,
			fitted: true,
		}
	})
	const circumbinary: OrbitRegion = {
		center: { kind: "binary", index: 0 },
		minAU: Math.max(
			circumbinaryLimitAU({
				...inner,
				massRatio: Math.min(primary.massSol, secondary.massSol) / innerMass,
			}),
			(innerApoapsis * secondary.massSol) / innerMass + primary.mao,
			(innerApoapsis * primary.massSol) / innerMass + secondary.mao,
		),
		maxAU: innerLimit,
		massSol: innerMass,
		luminositySol: primary.luminositySol + secondary.luminositySol,
		inclinationDeg: inner.inclinationDeg,
		fitted: true,
	}
	const maxSupportedAU = ORBIT_BODY.orbitNumberToAU({ orbitNumber: Infinity })
	return [...stellarRegions, circumbinary]
		.map((region) => ({
			...region,
			maxAU: Math.min(region.maxAU, maxSupportedAU),
		}))
		.filter((region) => region.minAU < region.maxAU)
}

export const BINARY_ORBIT = {
	resolve,
	normalizeTriple,
	outerPeriapsisFloorAU,
	circumstellarLimitAU,
	circumbinaryLimitAU,
	planetaryRegions,
}

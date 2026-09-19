import { GALAXY_IDENTITY } from "@/model/celestial/galaxy/galaxy-identity"
import {
	decodeLuminosityClass,
	decodeSpectralClass,
	decodeStarRole,
	encodeLuminosityClass,
	encodeSpectralClass,
	encodeStarRole,
} from "@/model/celestial/galaxy/systems/codes"
import type {
	GalaxyStar,
	GalaxyStarSeedParams,
	GalaxySystem,
	GalaxySystemParams,
	GalaxySystemSeedParams,
	MutablePackedGalaxyStarData,
	PackedGalaxyStars,
	PackedSystemStarSlice,
	StarPreview,
	StarRole,
} from "@/model/celestial/galaxy/systems/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type {
	HostStarAttributes,
	MainSequenceClass,
	ParentStarLike,
	SpectralClass,
} from "@/model/celestial/star/types"
import { ANOMALOUS_ORBITS } from "@/model/celestial/system/generation/anomalous-orbits"
import { BASELINE_NUMBER } from "@/model/celestial/system/generation/baseline-number"
import { BASELINE_ORBIT } from "@/model/celestial/system/generation/baseline-orbit"
import { BODY_GENERATION } from "@/model/celestial/system/generation/body"
import { EMPTY_ORBITS } from "@/model/celestial/system/generation/empty-orbits"
import { FINAL_ORBIT_ENVIRONMENT } from "@/model/celestial/system/generation/final-orbit-environment"
import { ORBIT_PLACEMENT } from "@/model/celestial/system/generation/orbit-placement"
import type { OrbitExclusionZone } from "@/model/celestial/system/generation/orbit-placement/types"
import { ROLLS } from "@/model/celestial/system/generation/rolls"
import { WORLD_TYPE_ALLOCATION } from "@/model/celestial/system/generation/world-type-allocation"
import { WORLD_TYPE_COUNTS } from "@/model/celestial/system/generation/world-type-counts"
import { DICE } from "@/model/shared/random/dice"
import type { SharedRng } from "@/model/shared/random/rng"
import { RNG } from "@/model/shared/random/rng"
import { TIME } from "@/model/shared/time"

function toParentStarLike(star: StarPreview): ParentStarLike {
	return {
		spectralClass: star.spectralClass,
		luminosityClass: star.luminosityClass,
		subtype: star.subtype,
		massSol: star.massSol,
		ageGyr: star.ageGyr,
	}
}

function toHostStarAttributes(star: StarPreview): HostStarAttributes {
	return {
		spectralClass: star.spectralClass,
		luminosityClass: star.luminosityClass,
		subtype: star.subtype,
		massSol: star.massSol,
		temperatureK: star.temperatureK,
		diameterSol: star.diameterSol,
		luminositySol: star.luminositySol,
		ageGyr: star.ageGyr,
		mao: star.mao,
	}
}

// [DEVIATION] The book's own thresholds below (before this DM) produce a
// measured ~45% multi-star rate across a realistic spectral-class mix --
// confirmed book-literal, not a bug. Raising every threshold by 1 roughly
// halves each class's odds (e.g. a G/K primary's four independent rolls
// drop from ~52% to ~30% likely-multi) at the request of the person running
// this generator, who found the book's own default too high for their
// purposes. Set to 0 to restore book-literal odds.
const MULTI_STAR_PRESENCE_DAMPENING_DM = 1

// Book's "Multiple Stars Presence" DM table (pp. 24-25): every Close/Near/
// Far/Companion presence roll in the system shares one 2D6 target of 10+,
// modified only by the primary's own class/type -- never recomputed per
// star further down the tree. Class Ia/Ib/II/III/IV (a giant or subgiant
// primary) or a V/VI O/B/A/F primary raises the odds (DM+1); a V/VI M-type,
// brown/white dwarf, or pulsar/neutron star/black hole primary lowers them
// (DM-1). Everything else (V/VI G or K) gets no DM.
function presenceThresholdForPrimary(
	primary: Pick<StarPreview, "spectralClass" | "luminosityClass">,
): number {
	if (
		primary.spectralClass === "NS" ||
		primary.spectralClass === "BH" ||
		primary.spectralClass === "D" ||
		STAR.isBrownDwarf(primary.spectralClass)
	) {
		return 11 + MULTI_STAR_PRESENCE_DAMPENING_DM
	}
	if (primary.luminosityClass !== "V" && primary.luminosityClass !== "VI") {
		return 9 + MULTI_STAR_PRESENCE_DAMPENING_DM
	}
	if (
		primary.spectralClass === "O" ||
		primary.spectralClass === "B" ||
		primary.spectralClass === "A" ||
		primary.spectralClass === "F"
	) {
		return 9 + MULTI_STAR_PRESENCE_DAMPENING_DM
	}
	if (primary.spectralClass === "M")
		return 11 + MULTI_STAR_PRESENCE_DAMPENING_DM
	return 10 + MULTI_STAR_PRESENCE_DAMPENING_DM
}

// [DEVIATION] Not in the book: a neutron star, black hole, or Y brown dwarf
// can never itself gain a companion, regardless of the system's shared
// presence threshold -- these are physically degenerate/terminal objects a
// tabletop referee wouldn't expect to host a bound companion.
function isExoticNoCompanion(
	star: Pick<StarPreview, "spectralClass">,
): boolean {
	return (
		star.spectralClass === "NS" ||
		star.spectralClass === "BH" ||
		star.spectralClass === "Y"
	)
}

/** Derives a stable, non-zero numeric seed for one packed system index --
 * distinct from SOL_DATA.solSeed (0) by construction, since
 * RNG.seedStringToNumber never returns 0. */
function seedForSystem({
	galaxySeed,
	systemIndex,
}: GalaxySystemSeedParams): number {
	return RNG.seedStringToNumber(`galaxy:${galaxySeed}:${systemIndex}`)
}

/** Derives one star's own distinct seed for its planets/moons, from the
 * same system seed plus its position in the rolled star tree. */
function seedForStar({
	galaxySeed,
	systemIndex,
	starIndex,
}: GalaxyStarSeedParams): number {
	return RNG.seedStringToNumber(
		`galaxy:${galaxySeed}:${systemIndex}:star:${starIndex}`,
	)
}

/**
 * Walks the same companion-star tree galaxy-gen's rollStarCompanionTemplates
 * + walkSystemStarsFromDice walk: the primary always rolls for one
 * "epistellar" companion AND (being the only star with no parent) one each
 * of "inner"/"outer"/"distant"; every rolled companion can, in turn, roll
 * for exactly one more "epistellar" companion of its own (never another
 * inner/outer/distant -- those require having no parent), and an epistellar
 * companion never rolls for companions of its own at all. Every one of these
 * presence rolls shares the single `presenceThreshold` derived once from the
 * primary (see presenceThresholdForPrimary, book pp. 24-25) -- it is never
 * recomputed from a companion's own rolled class further down the tree. A
 * neutron star/black hole/Y brown dwarf still gets no companions at all
 * (isExoticNoCompanion), as a deliberate deviation from the book layered on
 * top of the shared threshold. Every
 * star's full physical attributes -- not just its class -- come from
 * STAR.rollStarAttributes, which types every companion via the Traveller
 * Non-Primary Star Determination table (Random/Lesser/Sibling/Twin/Other;
 * see resolveCompanionType in star/index.ts) keyed by the `column` this
 * function derives from StarRole just below ("epistellar" -> "companion",
 * everything else -> "secondary" -- the post-stellar column is chosen
 * automatically whenever the immediate parent is D/NS/BH). Every non-exotic
 * companion still inherits `parent.ageGyr` verbatim, but a companion that
 * itself resolves to post-stellar now rolls its own independent elapsed
 * age -- see the system-age-reset pass at the end of this function, which
 * mirrors the book's age-reset rule using that value. Each non-primary
 * star's orbitalDistanceAU is rolled once here from its role's book Orbit#
 * dice result. Stopping here (no body
 * generation) is what makes this cheap enough to call for every visible
 * galaxy point; `generate` below walks the identical tree and then
 * additionally hydrates each star's real planets/moons.
 */
function rollStarTree(rng: SharedRng): StarPreview[] {
	const stars: StarPreview[] = []

	function rollOne({
		role,
		parentIndex,
	}: {
		role: StarRole
		parentIndex: number | null
	}): number {
		const index = stars.length
		const parentStar = parentIndex === null ? undefined : stars[parentIndex]!
		const parent =
			parentStar === undefined ? undefined : toParentStarLike(parentStar)
		const column = role === "epistellar" ? "companion" : "secondary"
		const rolled = STAR.rollStarAttributes(rng, parent, undefined, column)
		const orbitNumber =
			role === "primary"
				? 0
				: role === "epistellar" &&
						parentStar &&
						STAR.isGiant(parentStar.luminosityClass)
					? rng.randint(1, 6) *
						ORBIT_BODY.auToOrbitNumber({
							au: parentStar.mao,
						})
					: role === "epistellar"
						? rng.randint(1, 6) / 10 + (DICE.roll2d6(rng) - 7) / 100
						: role === "inner"
							? Math.max(0.5, rng.randint(1, 6) - 1)
							: role === "outer"
								? rng.randint(1, 6) + 5
								: rng.randint(1, 6) + 11
		const orbitalDistanceAU = ORBIT_BODY.orbitNumberToAU({ orbitNumber })
		// Book's "for each star an object directly orbits beyond the first"
		// eccentricity DM (p. 27-28): only an epistellar companion of a
		// non-primary star (the tree's one nested case) counts as beyond the
		// first; every other role orbits the primary directly.
		const starsOrbitedBeyondFirst =
			parentIndex !== null && stars[parentIndex]!.role !== "primary" ? 1 : 0
		const eccentricity =
			role === "primary"
				? 0
				: ROLLS.rollEccentricity({
						rng,
						orbitKind: "companion-star",
						starsOrbitedBeyondFirst,
						oldTightOrbit: orbitNumber < 1 && rolled.ageGyr > 1,
					})
		const inclinationDeg =
			role === "primary" ? 0 : ORBIT_BODY.rollInclinationDeg(rng)
		stars.push({
			spectralClass: rolled.spectralClass,
			luminosityClass: rolled.luminosityClass,
			subtype: rolled.subtype,
			massSol: rolled.massSol,
			diameterSol: rolled.diameterSol,
			temperatureK: rolled.temperatureK,
			luminositySol: rolled.luminositySol,
			mao: rolled.mao,
			ageGyr: rolled.ageGyr,
			role,
			parentIndex,
			orbitalDistanceAU,
			eccentricity,
			inclinationDeg,
		})
		return index
	}

	function rollCompanionsFor({
		index,
		hasParent,
		presenceThreshold,
	}: {
		index: number
		hasParent: boolean
		presenceThreshold: number
	}): void {
		const star = stars[index]!
		if (isExoticNoCompanion(star)) return
		if (DICE.roll2d6(rng) >= presenceThreshold) {
			rollOne({ role: "epistellar", parentIndex: index })
		}
		if (hasParent) return
		if (DICE.roll2d6(rng) >= presenceThreshold) {
			rollCompanionsFor({
				index: rollOne({ role: "inner", parentIndex: index }),
				hasParent: true,
				presenceThreshold,
			})
		}
		if (DICE.roll2d6(rng) >= presenceThreshold) {
			rollCompanionsFor({
				index: rollOne({ role: "outer", parentIndex: index }),
				hasParent: true,
				presenceThreshold,
			})
		}
		if (DICE.roll2d6(rng) >= presenceThreshold) {
			rollCompanionsFor({
				index: rollOne({ role: "distant", parentIndex: index }),
				hasParent: true,
				presenceThreshold,
			})
		}
	}

	// Book's orbit-crossing check (p. 29): "if adding [eccentricity] factors
	// will cause stellar orbits to cross ... add one full Orbit# to the outer
	// crossing star's Orbit# and recompute until the issue resolves." Only
	// the stars that directly orbit the primary (epistellar/inner/outer/
	// distant) share a common reference frame worth comparing this way -- an
	// epistellar companion of a non-primary star orbits that star instead,
	// with no sibling of its own to cross. [DEVIATION] extended beyond the
	// book's own literal-crossing check to require a genuine hierarchical
	// stability margin between adjacent siblings, not just non-overlap -- see
	// computeMinimumOuterOrbitalDistanceAU's doc. Unlike the old Hill-sphere-
	// style additive-gap attempts, the Mardling-Aarseth ratio floor has no
	// circular dependency on the push itself, so one forward sweep -- each
	// outer sibling's own semi-major axis floored relative to its already-
	// resolved inner neighbor -- is exact, not an iterative approximation;
	// still equivalent to the book's "recompute until resolved" in spirit,
	// since raising an outer sibling's floor can only ever raise what comes
	// after it, never reopen a gap already resolved earlier in the sweep.
	// The band-overlap check stays as a final safety net for the rare
	// high-eccentricity case where clearing the ratio still isn't enough to
	// clear the literal orbits.
	function resolveStellarOrbitCrossings(primaryIndex: number): void {
		const siblings = stars
			.map((star, index) => ({ star, index }))
			.filter(({ star }) => star.parentIndex === primaryIndex)
			.sort((a, b) => a.star.orbitalDistanceAU - b.star.orbitalDistanceAU)
		for (let i = 1; i < siblings.length; i++) {
			const inner = siblings[i - 1]!.star
			const outer = siblings[i]!.star
			const minOuterAU = computeMinimumOuterOrbitalDistanceAU({
				innerIndex: siblings[i - 1]!.index,
				outerIndex: siblings[i]!.index,
				parentIndex: primaryIndex,
				previews: stars,
			})
			if (outer.orbitalDistanceAU < minOuterAU) {
				outer.orbitalDistanceAU = minOuterAU
			}
			const innerMaxAU = inner.orbitalDistanceAU * (1 + inner.eccentricity)
			const outerMinAU = outer.orbitalDistanceAU * (1 - outer.eccentricity)
			if (outerMinAU <= innerMaxAU) {
				outer.orbitalDistanceAU = innerMaxAU / (1 - outer.eccentricity)
			}
		}
	}

	const primaryIndex = rollOne({ role: "primary", parentIndex: null })
	const presenceThreshold = presenceThresholdForPrimary(stars[primaryIndex]!)
	rollCompanionsFor({
		index: primaryIndex,
		hasParent: false,
		presenceThreshold,
	})
	resolveStellarOrbitCrossings(primaryIndex)

	// System age reset (book: "if a new star is a post-stellar object but
	// the primary is a fusing star, the age of the entire stellar system
	// could be reset ... use the final age of the post-stellar object ...
	// to determine system age"). Only fires when the root primary is still
	// fusing (a post-stellar root already sets its own age including any
	// post-death bump) and some companion's independently-rolled
	// post-stellar age (see rollPostStellarCompanionAgeGyr in star/index.ts)
	// implies an older system than currently assigned. [DEVIATION] see that
	// function's doc comment -- the book's Referee-arbitrated mass
	// reverse-engineering fallback for when this would exceed the primary's
	// own achievable lifespan has no automated equivalent here; the age is
	// simply carried forward (already capped at STAR.rollStarAttributes'
	// flat uniform(13, 14) ceiling) and every other still-fusing star in the
	// tree is bumped to match, same as they'd otherwise have inherited a
	// younger age from the primary.
	const root = stars[primaryIndex]!
	if (!STAR.isPostStellar(root.spectralClass)) {
		let systemAgeGyr = root.ageGyr
		for (const star of stars) {
			if (
				STAR.isPostStellar(star.spectralClass) &&
				star.ageGyr > systemAgeGyr
			) {
				systemAgeGyr = star.ageGyr
			}
		}
		if (systemAgeGyr > root.ageGyr) {
			for (const star of stars) {
				if (!STAR.isPostStellar(star.spectralClass)) star.ageGyr = systemAgeGyr
			}
		}
	}

	return stars
}

/** Growable columnar accumulator for one galaxy's worth of star trees --
 * mirrors galaxy-gen's createMutablePackedSystemStarData. */
function createMutablePackedGalaxyStarData(): MutablePackedGalaxyStarData {
	return {
		parent: [],
		role: [],
		spectralClass: [],
		luminosityClass: [],
		subtype: [],
		orbitalDistanceAU: [],
		eccentricity: [],
		inclinationDeg: [],
		age: [],
		mass: [],
		diameter: [],
		temperature: [],
		luminosity: [],
		mao: [],
	}
}

/** Walks one system's star tree and (if `target` is given) appends it to a
 * galaxy-wide columnar accumulator -- mirrors galaxy-gen's
 * appendPackedSystemStarDataFromDice, including the "always walk the tree,
 * only append if a target was passed" shape that lets edge/boundary systems
 * still advance the shared RNG stream without being stored (see
 * buildPackedGalaxyStars). Returns the star count either way. */
function appendPackedSystemStarData(
	rng: SharedRng,
	target?: MutablePackedGalaxyStarData,
): number {
	const stars = rollStarTree(rng)
	if (!target) return stars.length
	for (const star of stars) {
		target.parent.push(star.parentIndex ?? -1)
		target.role.push(encodeStarRole(star.role))
		target.spectralClass.push(encodeSpectralClass(star.spectralClass))
		target.luminosityClass.push(encodeLuminosityClass(star.luminosityClass))
		target.subtype.push(star.subtype)
		target.orbitalDistanceAU.push(star.orbitalDistanceAU)
		target.eccentricity.push(star.eccentricity)
		target.inclinationDeg.push(star.inclinationDeg)
		target.age.push(star.ageGyr)
		target.mass.push(star.massSol)
		target.diameter.push(star.diameterSol)
		target.temperature.push(star.temperatureK)
		target.luminosity.push(star.luminositySol)
		target.mao.push(star.mao)
	}
	return stars.length
}

/**
 * Rolls every system's star tree in a galaxy into flat, transfer-cheap
 * typed arrays -- mirrors galaxy-gen's extractLegacyStarMapData exactly: one
 * continuous RNG stream walked in system-index order (not one independent
 * seed per system, so a system's tree depends on every earlier system having
 * been rolled first, same as the source), with edge/boundary systems still
 * consuming their share of the stream but never stored (keeps every other
 * system's roll identical regardless of where the edge ring falls). Meant to
 * run once per galaxy generation, inside the galaxy worker (see
 * GALAXY.spawn) -- GALAXY_SYSTEMS.generate/previewStars can then hydrate any
 * system from the result with zero further RNG use.
 */
function buildPackedGalaxyStars({
	galaxySeed,
	numSystems,
	r_edge,
}: {
	galaxySeed: number
	numSystems: number
	r_edge: Uint8Array
}): PackedGalaxyStars {
	const rng = RNG.createRng({ seed: galaxySeed })
	const packed = createMutablePackedGalaxyStarData()
	const systemStarOffset = new Int32Array(numSystems + 1)
	for (let index = 0; index < numSystems; index++) {
		if (r_edge[index] === 1) {
			appendPackedSystemStarData(rng)
			systemStarOffset[index + 1] = packed.parent.length
			continue
		}
		appendPackedSystemStarData(rng, packed)
		systemStarOffset[index + 1] = packed.parent.length
	}
	return {
		systemStarOffset,
		starParent: Int32Array.from(packed.parent),
		starRole: Uint8Array.from(packed.role),
		starSpectralClass: Uint8Array.from(packed.spectralClass),
		starLuminosityClass: Uint8Array.from(packed.luminosityClass),
		starSubtype: Float32Array.from(packed.subtype),
		starOrbitalDistanceAU: Float32Array.from(packed.orbitalDistanceAU),
		starEccentricity: Float32Array.from(packed.eccentricity),
		starInclinationDeg: Float32Array.from(packed.inclinationDeg),
		starAge: Float32Array.from(packed.age),
		starMass: Float32Array.from(packed.mass),
		starDiameter: Float32Array.from(packed.diameter),
		starTemperature: Float32Array.from(packed.temperature),
		starLuminosity: Float32Array.from(packed.luminosity),
		starMao: Float32Array.from(packed.mao),
	}
}

// Sun-like slice of the main sequence a habitable homeworld can form around,
// weighted toward G/K. Hotter O/B/A dwarfs and every exotic class are excluded.
const CAPITAL_CLASS_WEIGHTS: [MainSequenceClass, number][] = [
	["F", 2],
	["G", 4],
	["K", 3],
	["M", 2],
]
const CAPITAL_CLASSES = new Set<SpectralClass>(
	CAPITAL_CLASS_WEIGHTS.map(([cls]) => cls),
)

function isLoneCapitalClassStar({
	packed,
	systemIndex,
}: {
	packed: PackedGalaxyStars
	systemIndex: number
}): boolean {
	const start = packed.systemStarOffset[systemIndex]!
	if (packed.systemStarOffset[systemIndex + 1]! - start !== 1) return false
	if (decodeLuminosityClass(packed.starLuminosityClass[start]!) !== "V") {
		return false
	}
	return CAPITAL_CLASSES.has(
		decodeSpectralClass(packed.starSpectralClass[start]!),
	)
}

function rollCapitalClass(rng: SharedRng): MainSequenceClass {
	const total = CAPITAL_CLASS_WEIGHTS.reduce(
		(sum, [, weight]) => sum + weight,
		0,
	)
	let roll = rng.random() * total
	for (const [cls, weight] of CAPITAL_CLASS_WEIGHTS) {
		roll -= weight
		if (roll <= 0) return cls
	}
	return "G"
}

// GALAXY_NATIONS picks capitals on geography alone, so any capital that isn't
// already a lone F/G/K/M V star is rewritten into one here: companions stripped,
// a fresh Sun-like primary rolled from the system seed, original age kept.
function forceCapitalsMainWorldCapable({
	packed,
	capitalSystemIndices,
	galaxySeed,
}: {
	packed: PackedGalaxyStars
	capitalSystemIndices: Int32Array
	galaxySeed: number
}): PackedGalaxyStars {
	const numSystems = packed.systemStarOffset.length - 1
	const capitals = new Set(capitalSystemIndices)
	const primaryRole = encodeStarRole("primary")
	const classV = encodeLuminosityClass("V")

	const out = createMutablePackedGalaxyStarData()
	const systemStarOffset = new Int32Array(numSystems + 1)

	// A capital's homeworld sits at its primary's HZ center -- a freak very
	// young (proto/primordial) primary would give that world an unstable
	// climate/seismology, so a capital's whole star tree (age is shared across
	// a companion tree) is clamped to a settled main-sequence window.
	const clampCapitalAge = (age: number): number => Math.min(8, Math.max(3, age))

	for (let i = 0; i < numSystems; i++) {
		const start = packed.systemStarOffset[i]!
		const end = packed.systemStarOffset[i + 1]!
		const isCapitalSystem = capitals.has(i)

		if (
			!isCapitalSystem ||
			isLoneCapitalClassStar({ packed, systemIndex: i })
		) {
			for (let s = start; s < end; s++) {
				out.parent.push(packed.starParent[s]!)
				out.role.push(packed.starRole[s]!)
				out.spectralClass.push(packed.starSpectralClass[s]!)
				out.luminosityClass.push(packed.starLuminosityClass[s]!)
				out.subtype.push(packed.starSubtype[s]!)
				out.orbitalDistanceAU.push(packed.starOrbitalDistanceAU[s]!)
				out.eccentricity.push(packed.starEccentricity[s]!)
				out.inclinationDeg.push(packed.starInclinationDeg[s]!)
				out.age.push(
					isCapitalSystem
						? clampCapitalAge(packed.starAge[s]!)
						: packed.starAge[s]!,
				)
				out.mass.push(packed.starMass[s]!)
				out.diameter.push(packed.starDiameter[s]!)
				out.temperature.push(packed.starTemperature[s]!)
				out.luminosity.push(packed.starLuminosity[s]!)
				out.mao.push(packed.starMao[s]!)
			}
			systemStarOffset[i + 1] = out.parent.length
			continue
		}

		const rng = RNG.createRng({
			seed: RNG.seedStringToNumber(`galaxy:${galaxySeed}:${i}:capital-star`),
		})
		const cls = rollCapitalClass(rng)
		const subtype = rng.random() * 10
		const spectralInput = { cls, subtype }

		out.parent.push(-1)
		out.role.push(primaryRole)
		out.spectralClass.push(encodeSpectralClass(cls))
		out.luminosityClass.push(classV)
		out.subtype.push(subtype)
		out.orbitalDistanceAU.push(0)
		out.eccentricity.push(0)
		out.inclinationDeg.push(0)
		out.age.push(clampCapitalAge(packed.starAge[start]!))
		out.mass.push(STAR.getStarMassSol(spectralInput))
		out.diameter.push(STAR.getStarDiameterSol(spectralInput))
		out.temperature.push(STAR.getStarTemperatureK(spectralInput))
		out.luminosity.push(STAR.getStarLuminositySol(spectralInput))
		out.mao.push(STAR.getStarMAO(spectralInput))
		systemStarOffset[i + 1] = out.parent.length
	}

	return {
		systemStarOffset,
		starParent: Int32Array.from(out.parent),
		starRole: Uint8Array.from(out.role),
		starSpectralClass: Uint8Array.from(out.spectralClass),
		starLuminosityClass: Uint8Array.from(out.luminosityClass),
		starSubtype: Float32Array.from(out.subtype),
		starOrbitalDistanceAU: Float32Array.from(out.orbitalDistanceAU),
		starEccentricity: Float32Array.from(out.eccentricity),
		starInclinationDeg: Float32Array.from(out.inclinationDeg),
		starAge: Float32Array.from(out.age),
		starMass: Float32Array.from(out.mass),
		starDiameter: Float32Array.from(out.diameter),
		starTemperature: Float32Array.from(out.temperature),
		starLuminosity: Float32Array.from(out.luminosity),
		starMao: Float32Array.from(out.mao),
	}
}

/** One system's window into a galaxy-wide PackedGalaxyStars -- mirrors
 * galaxy-gen's getPackedSystemStarSlice (scaled/model/packed-stars.ts). */
function getPackedSystemStarSlice(
	packed: PackedGalaxyStars,
	systemIndex: number,
): PackedSystemStarSlice {
	return {
		start: packed.systemStarOffset[systemIndex]!,
		end: packed.systemStarOffset[systemIndex + 1]!,
		parent: packed.starParent,
		role: packed.starRole,
		spectralClass: packed.starSpectralClass,
		luminosityClass: packed.starLuminosityClass,
		subtype: packed.starSubtype,
		orbitalDistanceAU: packed.starOrbitalDistanceAU,
		eccentricity: packed.starEccentricity,
		inclinationDeg: packed.starInclinationDeg,
		age: packed.starAge,
		mass: packed.starMass,
		diameter: packed.starDiameter,
		temperature: packed.starTemperature,
		luminosity: packed.starLuminosity,
		mao: packed.starMao,
	}
}

/** Reconstructs one system's StarPreview[] from a packed slice -- mirrors
 * galaxy-gen's unpackStarAttributes, decoded straight back into the same
 * shape rollStarTree produces so callers can't tell packed and freshly
 * rolled stars apart. */
function unpackStarPreviews(slice: PackedSystemStarSlice): StarPreview[] {
	const stars: StarPreview[] = []
	for (let i = slice.start; i < slice.end; i++) {
		stars.push({
			spectralClass: decodeSpectralClass(slice.spectralClass[i]!),
			luminosityClass: decodeLuminosityClass(slice.luminosityClass[i]!),
			subtype: slice.subtype[i]!,
			role: decodeStarRole(slice.role[i]!),
			parentIndex: slice.parent[i] === -1 ? null : slice.parent[i]!,
			ageGyr: slice.age[i]!,
			orbitalDistanceAU: slice.orbitalDistanceAU[i]!,
			eccentricity: slice.eccentricity[i]!,
			inclinationDeg: slice.inclinationDeg[i]!,
			massSol: slice.mass[i]!,
			diameterSol: slice.diameter[i]!,
			temperatureK: slice.temperature[i]!,
			luminositySol: slice.luminosity[i]!,
			mao: slice.mao[i]!,
		})
	}
	return stars
}

/** Cheap preview of every star in a packed system for rendering (e.g. the
 * galaxy view's point colors/multi-star clustering) without paying for full
 * body generation -- see rollStarTree's doc comment. Always at least one
 * entry (the primary); `generate`'s own roll matches this exactly since
 * both start from the same per-system seed and walk the same tree. Pass
 * `packed` (see buildPackedGalaxyStars) to unpack instead of re-rolling --
 * the two are interchangeable, but unpacking is the fast path once a
 * galaxy's star trees have already been rolled once in the worker. */
function previewStars({
	galaxySeed,
	systemIndex,
	packed,
}: GalaxySystemSeedParams & { packed?: PackedGalaxyStars }): StarPreview[] {
	if (packed) {
		return unpackStarPreviews(getPackedSystemStarSlice(packed, systemIndex))
	}
	return rollStarTree(
		RNG.createRng({ seed: seedForSystem({ galaxySeed, systemIndex }) }),
	)
}

// A star's own epistellar companion (0.02-0.26 AU away)
// is close enough that anything outside that tight pair effectively sees
// them as one combined source: one gravitational mass for Hill-sphere
// purposes (computeMaxOrbitalDistanceAU below) and one combined luminosity
// for climate purposes (see GALAXY_SYSTEMS.generate's hostStar construction)
// -- a real circumbinary planet receives light from, and is perturbed by,
// both stars of a close pair it orbits. This is the same "S-type orbit
// around a tight pair reads as circumbinary" case the book's own Hill-sphere
// method (pp. 40-41) treats as one unit.
function effectiveMassSolAt({
	index,
	previews,
}: {
	index: number
	previews: StarPreview[]
}): number {
	const epistellarChild = previews.find(
		(star) => star.parentIndex === index && star.role === "epistellar",
	)
	return previews[index]!.massSol + (epistellarChild?.massSol ?? 0)
}

function effectiveLuminositySolAt({
	index,
	previews,
}: {
	index: number
	previews: StarPreview[]
}): number {
	const epistellarChild = previews.find(
		(star) => star.parentIndex === index && star.role === "epistellar",
	)
	return previews[index]!.luminositySol + (epistellarChild?.luminositySol ?? 0)
}

// Book's Available Orbits "Alternate Multi-Star Orbit Determination" (pp.
// 40-41): a real Hill-sphere stability zone, fully AU/mass-native (no
// Orbit# table involved) -- this is the piece the crude companion-band
// exclusion below never provided: a ceiling on how far a star's OWN planets
// can extend before a stellar neighbor's gravity starts to dominate, not
// just "don't literally overlap where a neighbor's own orbit sits". A star's
// own epistellar companion is never a candidate perturber here since its
// mass is already folded into effectiveMassSolAt instead. Applied uniformly
// to every star, including epistellar companions themselves -- they never
// reach it in practice, since generateSystemBodies unconditionally gives
// them zero bodies (isEpistellarCompanion branch), but there is no case here
// worth special-casing around that.
//
// [Bug fix] This used to only evaluate the geometrically-closest perturber,
// on the assumption that "closest" is always "most restrictive" -- false
// whenever mass dominates over distance. A 0.05 Msun sibling at 2 AU gave a
// ceiling of 1.255 AU under the old logic, while an 100 Msun sibling at
// 8 AU actually demands a tighter 0.398 AU; the old code silently picked
// the more permissive, wrong answer. Every candidate perturber is now
// checked, and the tightest (minimum) result wins. Each perturber's own
// contribution is also capped at that perturber's own periapsis (closest
// approach) -- a lopsided mass ratio (e.g. a supergiant primary against a
// tiny companion) can otherwise produce a Hill-sphere-derived ceiling
// larger than the companion's own orbit entirely, which would let a planet
// "pass" this check while still landing exactly where that companion
// physically is. (resolvePlanetVsCompanionStarOverlaps's literal band
// exclusion remains genuinely load-bearing for that same reason, not just a
// redundant backstop over this ceiling.)
function computeMaxOrbitalDistanceAU({
	index,
	previews,
}: {
	index: number
	previews: StarPreview[]
}): number {
	const star = previews[index]!
	const perturbers: {
		separationAU: number
		mass: number
		eccentricity: number
	}[] = []

	if (star.parentIndex === null) {
		previews.forEach((other, otherIndex) => {
			if (other.parentIndex === index && other.role !== "epistellar") {
				perturbers.push({
					separationAU: other.orbitalDistanceAU,
					mass: effectiveMassSolAt({ index: otherIndex, previews }),
					eccentricity: other.eccentricity,
				})
			}
		})
	} else {
		perturbers.push({
			separationAU: star.orbitalDistanceAU,
			mass: effectiveMassSolAt({ index: star.parentIndex, previews }),
			eccentricity: star.eccentricity,
		})
		previews.forEach((other, otherIndex) => {
			if (
				otherIndex !== index &&
				other.parentIndex === star.parentIndex &&
				other.role !== "epistellar"
			) {
				perturbers.push({
					separationAU: Math.abs(
						other.orbitalDistanceAU - star.orbitalDistanceAU,
					),
					mass: effectiveMassSolAt({ index: otherIndex, previews }),
					eccentricity: other.eccentricity,
				})
			}
		})
	}

	if (perturbers.length === 0) return Number.POSITIVE_INFINITY
	const selfMass = effectiveMassSolAt({ index, previews })
	let ceiling = Number.POSITIVE_INFINITY
	for (const perturber of perturbers) {
		const hillSphereAU =
			perturber.separationAU *
			(1 - perturber.eccentricity) *
			Math.cbrt(selfMass / (3 * perturber.mass))
		const stabilitySphereAU = hillSphereAU / 3
		const perturberPeriapsisAU =
			perturber.separationAU * (1 - perturber.eccentricity)
		ceiling = Math.min(ceiling, stabilitySphereAU, perturberPeriapsisAU)
	}
	return ceiling
}

// [DEVIATION] Not in the book at all -- the book only ever checks whether
// two stellar orbits literally cross (p. 29), never whether they have a real
// dynamical stability margin between them. This function went through two
// wrong attempts before this one: both a direct two-body Hill sphere and the
// Gladman (1993) mutual-Hill-radius criterion (the standard tool for
// spacing multiple PLANETS around one star) are Hill-sphere derivatives that
// assume one mass is negligible next to the other -- true for a planet,
// false for two comparable-mass stars. Both blow up (require an ever-larger,
// sometimes divergent-to-infinity separation) once the "small" mass isn't
// actually small, exactly the regime stellar companions live in. The
// standard tool for THIS regime -- comparable-mass hierarchical multiple-
// star stability -- is the Mardling & Aarseth (2001) empirical criterion: a
// multiplicative ratio between the outer and inner semi-major axes, with no
// such blowup since it has no additive term that can outpace the push:
//   a_out / a_in > K * [(1 + q_out)(1 + e_out) / sqrt(1 - e_out)]^(2/5)
// where q_out is the outer body's mass relative to the *inner system's*
// total mass (parent + inner sibling, treated as one system being
// perturbed), e_out is the outer body's own eccentricity, and K = 2.8 is
// Mardling & Aarseth's own empirically-fit long-term-stability threshold.
const MARDLING_AARSETH_K = 2.8

function computeMinimumOuterOrbitalDistanceAU({
	innerIndex,
	outerIndex,
	parentIndex,
	previews,
}: {
	innerIndex: number
	outerIndex: number
	parentIndex: number
	previews: StarPreview[]
}): number {
	const inner = previews[innerIndex]!
	const outer = previews[outerIndex]!
	const outerMass = effectiveMassSolAt({ index: outerIndex, previews })
	const innerSystemMass =
		effectiveMassSolAt({ index: parentIndex, previews }) +
		effectiveMassSolAt({ index: innerIndex, previews })
	const massRatio = outerMass / innerSystemMass
	const bracket =
		((1 + massRatio) * (1 + outer.eccentricity)) /
		Math.sqrt(1 - outer.eccentricity)
	const requiredRatio = MARDLING_AARSETH_K * bracket ** 0.4
	return requiredRatio * inner.orbitalDistanceAU
}

// Book's Available Orbits exclusion zones (pp. 38-39) exist because every
// Close/Near/Far Orbit# sits on the same radial line as the primary's own
// planets in that model -- a planet can't be placed at an Orbit# another
// star already occupies. This repo's stars have real independent positions
// (a "distant" companion's own planets orbit IT, not the primary), so the
// only place the same coordinate frame is genuinely shared is a star and
// its OWN direct stellar children: the primary's planets share the
// primary's AU axis with the primary's own inner/outer/distant/epistellar
// companions, and any secondary's planets share ITS axis with its own
// epistellar companion, if it has one. A measured pass found ~4.5% of a
// star's planets landing inside a direct child star's own min/max
// separation band, which is common enough to be worth nudging clear --
// mirrors resolveStellarOrbitCrossings' "push just past the edge" approach,
// including its dependents (belt-resident dwarfs, trojans) that copied the
// original AU before the nudge.
// A push away from a band's edge multiplies it by this factor -- so two
// bands separated by a real but smaller-than-this gap would still have a
// push out of one land inside the other (and a push out of that one land
// right back), oscillating forever. Merging any bands within this same
// tolerance guarantees the push distance always clears the merged interval's
// far edge.
const BAND_MERGE_TOLERANCE = 1.02

function mergeTouchingBands(
	bands: { min: number; max: number }[],
): { min: number; max: number }[] {
	const sorted = [...bands].sort((a, b) => a.min - b.min)
	const merged: { min: number; max: number }[] = []
	for (const band of sorted) {
		const last = merged[merged.length - 1]
		if (last && band.min <= last.max * BAND_MERGE_TOLERANCE) {
			last.max = Math.max(last.max, band.max)
		} else {
			merged.push({ ...band })
		}
	}
	return merged
}

// Same companion min/max separation bands resolvePlanetVsCompanionStarOverlaps
// nudges finished bodies out of, but converted to Orbit# and computed
// *before* any body exists -- Stage 8's regular walk (book p. 49) needs to
// route around these zones as it places slots, not just clean up after the
// fact. The post-hoc AU-based nudge below still runs regardless, as a safety
// net for whatever this earlier avoidance doesn't fully resolve (e.g. the
// walk's own overflow fallback, which clamps into range without rechecking
// zones).
function companionExclusionZonesAU({
	index,
	previews,
}: {
	index: number
	previews: StarPreview[]
}): { minAU: number; maxAU: number }[] {
	return mergeTouchingBands(
		previews
			.filter((star) => star.parentIndex === index)
			.map((child) => ({
				min: child.orbitalDistanceAU * (1 - child.eccentricity),
				max: child.orbitalDistanceAU * (1 + child.eccentricity),
			})),
	).map((band) => ({ minAU: band.min, maxAU: band.max }))
}

function companionExclusionZonesOrbitNumbers({
	index,
	previews,
}: {
	index: number
	previews: StarPreview[]
}): OrbitExclusionZone[] {
	return companionExclusionZonesAU({ index, previews }).map((band) => ({
		minOrbitNumber: ORBIT_BODY.auToOrbitNumber({ au: band.minAU }),
		maxOrbitNumber: ORBIT_BODY.auToOrbitNumber({ au: band.maxAU }),
	}))
}

function resolvePlanetVsCompanionStarOverlaps({
	stars,
	maxOrbitalDistanceAUByIndex,
}: {
	stars: GalaxyStar[]
	maxOrbitalDistanceAUByIndex: number[]
}): void {
	for (const star of stars) {
		const bands = mergeTouchingBands(
			stars
				.filter((s) => s.parentIndex === star.index)
				.map((child) => ({
					min: child.orbitalDistanceAU * (1 - child.eccentricity),
					max: child.orbitalDistanceAU * (1 + child.eccentricity),
				})),
		)
		if (bands.length === 0) continue
		const ceiling = maxOrbitalDistanceAUByIndex[star.index]!
		const infeasibleIdx = new Set<number>()

		for (const body of star.bodies) {
			if (body.beltOfIdx !== undefined || body.trojanOfIdx !== undefined) {
				continue
			}
			// Merging handles two bands touching exactly, but a push clear of one
			// band can still land inside a distinct, merely nearby one -- keep
			// pushing (each push strictly increases distance from the band it
			// just escaped) until clear, bounded well past this tree's max depth.
			let nudgedAU = body.orbitalDistanceAU
			let infeasible = false
			for (let attempt = 0; attempt < 5; attempt++) {
				const overlapping = bands.find(
					(band) => nudgedAU >= band.min && nudgedAU <= band.max,
				)
				if (!overlapping) break
				const distToMin = nudgedAU - overlapping.min
				const distToMax = overlapping.max - nudgedAU
				const pushDown = overlapping.min / BAND_MERGE_TOLERANCE
				const pushUp = overlapping.max * BAND_MERGE_TOLERANCE
				// Pushing down is preferred when it's the nearer edge, but never
				// below the host star's own MAO (its dust-clearing floor); pushing
				// up must likewise never cross the Hill-sphere ceiling.
				const pushDownValid = pushDown >= star.mao
				const pushUpValid = pushUp <= ceiling
				if (pushDownValid && (!pushUpValid || distToMin <= distToMax)) {
					nudgedAU = pushDown
				} else if (pushUpValid) {
					nudgedAU = pushUp
				} else {
					// Neither direction clears the band without crossing the MAO
					// floor or Hill-sphere ceiling -- an extremely rare, truly
					// cramped configuration with no fully legal position at all.
					// Toss the slot rather than force a physically impossible or
					// compromised result.
					infeasible = true
					break
				}
			}
			if (infeasible) {
				infeasibleIdx.add(body.idx)
				continue
			}
			if (nudgedAU === body.orbitalDistanceAU) continue

			body.orbitalDistanceAU = nudgedAU
			body.orbitalPeriodDays =
				STAR.getKeplerYearYears({
					orbitalDistanceAU: nudgedAU,
					massSol: star.massSol,
				}) * TIME.astronomicalDaysPerYear
			for (const dependent of star.bodies) {
				if (
					dependent.beltOfIdx !== body.idx &&
					dependent.trojanOfIdx !== body.idx
				) {
					continue
				}
				dependent.orbitalDistanceAU = nudgedAU
				dependent.orbitalPeriodDays = body.orbitalPeriodDays
			}
		}

		if (infeasibleIdx.size > 0) {
			star.bodies = star.bodies.filter(
				(body) =>
					!infeasibleIdx.has(body.idx) &&
					!infeasibleIdx.has(body.beltOfIdx ?? -1) &&
					!infeasibleIdx.has(body.trojanOfIdx ?? -1),
			)
		}
		star.bodies.sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU)
	}
}

/**
 * Generates every real star in a packed galaxy system, each with its own
 * fully generated planets/moons -- not just the primary. Reuses
 * SYSTEM_GENERATION.generateSystemBodies per star (the same per-system
 * pipeline a single-star system already uses), normally with
 * `mainWorldMode: "procedural"` (see plans/galaxy-view-port.md) so no body
 * is ever forced into a guaranteed-habitable slot or cloned from Earth. The
 * sole exception: a nation CAPITAL system's PRIMARY star uses
 * `"temperate-native"`, which reserves the HZ-center slot for a normally
 * rolled body constrained to friendly ranges (see MainWorldMode).
 */
function generate({
	galaxySeed,
	systemIndex,
	nationIndex = -1,
	isCapital = false,
	packed,
	skipNaming,
}: GalaxySystemParams & { packed?: PackedGalaxyStars }): GalaxySystem {
	const seed = seedForSystem({ galaxySeed, systemIndex })
	const previews = packed
		? unpackStarPreviews(getPackedSystemStarSlice(packed, systemIndex))
		: rollStarTree(RNG.createRng({ seed }))
	const primary = previews[0]!
	const worldTypeCounts = WORLD_TYPE_COUNTS.roll({
		rng: RNG.createStringRng({ seed: `world-type-counts:${seed}` }),
		primarySpectralClass: primary.spectralClass,
		primaryLuminosityClass: primary.luminosityClass,
		primaryMassSol: primary.massSol,
		primaryAgeGyr: primary.ageGyr,
		isLoneStar: previews.length === 1,
		systemPostStellarCount: previews.filter((star) =>
			STAR.isPostStellar(star.spectralClass),
		).length,
		systemStarCount: previews.length,
		systemHasNeutronStar: previews.some((star) => star.spectralClass === "NS"),
		systemHasBlackHole: previews.some((star) => star.spectralClass === "BH"),
	})
	const maxOrbitalDistanceAUByIndex = previews.map((_, index) =>
		computeMaxOrbitalDistanceAU({ index, previews }),
	)
	const allocatedWorldTypes = WORLD_TYPE_ALLOCATION.allocate({
		worldTypeCounts,
		stars: previews.map((preview, index) => ({
			orbitalDistanceAU: preview.orbitalDistanceAU,
			mao: preview.mao,
			maxOrbitalDistanceAU: maxOrbitalDistanceAUByIndex[index]!,
			acceptsBodies: preview.role !== "epistellar",
		})),
	})
	const worldTypeAllocations = allocatedWorldTypes.map((allocation, index) => {
		const emptyOrbitCount = EMPTY_ORBITS.roll({
			rng: RNG.createStringRng({ seed: `empty-orbits:${seed}:${index}` }),
			normalWorldCount: allocation.totalWorlds,
		})
		return {
			...allocation,
			emptyOrbitCount,
			totalWorlds: allocation.totalWorlds + emptyOrbitCount,
		}
	})
	const baselineWorldTypes = worldTypeAllocations.map((allocation, index) => {
		const preview = previews[index]!
		return {
			...allocation,
			baselineNumber: BASELINE_NUMBER.roll({
				rng: RNG.createStringRng({ seed: `baseline-number:${seed}:${index}` }),
				totalWorlds: allocation.totalWorlds,
				otherStarCount: previews.length - 1,
				hasEpistellarCompanion: previews.some(
					(star) => star.parentIndex === index && star.role === "epistellar",
				),
				hostSpectralClass: preview.spectralClass,
				hostLuminosityClass: preview.luminosityClass,
			}),
		}
	})
	const baselineOrbitWorldTypes = baselineWorldTypes.map(
		(allocation, index) => {
			const preview = previews[index]!
			return {
				...allocation,
				baselineOrbitNumber: BASELINE_ORBIT.roll({
					rng: RNG.createStringRng({ seed: `baseline-orbit:${seed}:${index}` }),
					baselineNumber: allocation.baselineNumber,
					totalWorlds: allocation.totalWorlds,
					habitableZoneOrbitNumber: ORBIT_BODY.auToOrbitNumber({
						au: STAR.getHabitableZoneAU(
							effectiveLuminositySolAt({ index, previews }),
						),
					}),
					minimumOrbitNumber: ORBIT_BODY.auToOrbitNumber({ au: preview.mao }),
					maximumOrbitNumber: ORBIT_BODY.auToOrbitNumber({
						au: maxOrbitalDistanceAUByIndex[index]!,
					}),
				}),
			}
		},
	)
	const anomalousOrbitReservations = ANOMALOUS_ORBITS.roll({
		rng: RNG.createStringRng({ seed: `anomalous-orbits:${seed}` }),
		terrestrialCount: worldTypeCounts.terrestrialCount,
		eligibleStarIndices: baselineOrbitWorldTypes.flatMap((allocation, index) =>
			allocation.starCapacity > 0 && previews[index]!.role !== "epistellar"
				? [index]
				: [],
		),
	})
	const reservedWorldTypes = baselineOrbitWorldTypes.map(
		(allocation, index) => ({
			...allocation,
			anomalousOrbitReservations: anomalousOrbitReservations.filter(
				(reservation) => reservation.starIndex === index,
			),
		}),
	)
	const placedWorldTypes = reservedWorldTypes.map((allocation, index) => ({
		...allocation,
		orbitSlots: ORBIT_PLACEMENT.place({
			rng: RNG.createStringRng({ seed: `orbit-placement:${seed}:${index}` }),
			baselineNumber: allocation.baselineNumber,
			baselineOrbitNumber: allocation.baselineOrbitNumber,
			totalWorlds: allocation.totalWorlds,
			gasGiantCount: allocation.gasGiantCount,
			beltCount: allocation.beltCount,
			terrestrialCount: allocation.terrestrialCount,
			emptyOrbitCount: allocation.emptyOrbitCount,
			anomalousOrbitReservations: allocation.anomalousOrbitReservations,
			minimumOrbitNumber: ORBIT_BODY.auToOrbitNumber({
				au: previews[index]!.mao,
			}),
			maximumOrbitNumber: ORBIT_BODY.auToOrbitNumber({
				au: maxOrbitalDistanceAUByIndex[index]!,
			}),
			exclusionZones: companionExclusionZonesOrbitNumbers({ index, previews }),
		}),
	}))
	const finalizedWorldTypes = placedWorldTypes.map((allocation, index) => ({
		...allocation,
		orbitSlots: FINAL_ORBIT_ENVIRONMENT.hydrate({
			slots: allocation.orbitSlots,
			luminositySol: effectiveLuminositySolAt({ index, previews }),
		}),
	}))

	const stars: GalaxyStar[] = previews.map((preview, index) => {
		const starSeed = seedForStar({ galaxySeed, systemIndex, starIndex: index })

		const orbitalDistanceAU = preview.orbitalDistanceAU
		const orbitalPeriodDays =
			preview.parentIndex === null
				? 0
				: STAR.getKeplerYearYears({
						orbitalDistanceAU,
						massSol: previews[preview.parentIndex]!.massSol,
					}) * TIME.astronomicalDaysPerYear

		const bodies = BODY_GENERATION.generateSystemBodies({
			seed: starSeed,
			hostStar: {
				...toHostStarAttributes(preview),
				// A planet's climate sees this star's own epistellar companion's
				// light too, if it has one -- see effectiveLuminositySolAt's doc.
				luminositySol: effectiveLuminositySolAt({ index, previews }),
			},
			hasParent: preview.parentIndex !== null,
			isEpistellarCompanion: preview.role === "epistellar",
			maxOrbitalDistanceAU: maxOrbitalDistanceAUByIndex[index],
			companionExclusionZonesAU: companionExclusionZonesAU({
				index,
				previews,
			}),
			orbitSlots: finalizedWorldTypes[index]!.orbitSlots,
			mainWorldMode:
				isCapital && preview.parentIndex === null
					? "temperate-native"
					: "procedural",
			exactHZC: false,
			skipNaming,
		})
		return {
			index,
			parentIndex: preview.parentIndex,
			role: preview.role,
			seed: starSeed,
			starName: skipNaming
				? ""
				: GALAXY_IDENTITY.generateSystemStarName({
						seed: galaxySeed,
						nationIndex,
						starSeed,
					}),
			spectralClass: preview.spectralClass,
			luminosityClass: preview.luminosityClass,
			...toHostStarAttributes(preview),
			bodies,
			orbitalDistanceAU,
			orbitalPeriodDays,
			eccentricity: preview.eccentricity,
			inclinationDeg: preview.inclinationDeg,
			worldTypeAllocation: finalizedWorldTypes[index]!,
		}
	})

	resolvePlanetVsCompanionStarOverlaps({ stars, maxOrbitalDistanceAUByIndex })

	return {
		systemIndex,
		seed,
		stars,
		worldTypeCounts,
		anomalousOrbitReservations,
	}
}

export const GALAXY_SYSTEMS = {
	seedForSystem,
	previewStars,
	generate,
	buildPackedGalaxyStars,
	forceCapitalsMainWorldCapable,
	getPackedSystemStarSlice,
}

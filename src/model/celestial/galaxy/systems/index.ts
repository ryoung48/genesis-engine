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
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import type {
	HostStarAttributes,
	ParentStarLike,
} from "@/model/celestial/star/types"
import { BODY_GENERATION } from "@/model/celestial/system/generation/body"
import { ROLLS } from "@/model/celestial/system/generation/rolls"
import { DICE } from "@/model/shared/random/dice"
import type { SharedRng } from "@/model/shared/random/rng"
import { RNG } from "@/model/shared/random/rng"
import { TIME } from "@/model/shared/time"

function isPostStellarClass(
	spectralClass: StarPreview["spectralClass"],
): boolean {
	return (
		spectralClass === "D" || spectralClass === "NS" || spectralClass === "BH"
	)
}

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

// Ported from galaxy-gen's rollStarCompanionTemplates companionMods (stars/
// generation.ts) in full, now that STAR.rollStarAttributes actually models
// giants/subgiants/subdwarfs/supergiants and the exotic classes these odds
// also key off of. A giant/subgiant/supergiant (any luminosity class other
// than V/VI) or an O/B/A/F dwarf raises the odds of a bound companion; an M
// dwarf or any degenerate/sub-stellar object (white dwarf, brown dwarf,
// neutron star, black hole) lowers them. Neutron stars, black holes, and Y
// brown dwarfs get no companions at all (companionOdds -> Infinity, which no
// 2d6 roll can ever meet).
function companionOddsFor(
	star: Pick<StarPreview, "spectralClass" | "luminosityClass">,
): number {
	const whiteDwarf = star.spectralClass === "D"
	const neutronStar = star.spectralClass === "NS"
	const blackHole = star.spectralClass === "BH"
	const yBrownDwarf = star.spectralClass === "Y"
	const brownDwarf = STAR.isBrownDwarf(star.spectralClass)
	let companionMods = 0
	if (star.luminosityClass !== "V" && star.luminosityClass !== "VI") {
		companionMods += 1
	} else if (
		star.spectralClass === "O" ||
		star.spectralClass === "B" ||
		star.spectralClass === "A" ||
		star.spectralClass === "F"
	) {
		companionMods += 1
	} else if (
		star.spectralClass === "M" ||
		whiteDwarf ||
		brownDwarf ||
		neutronStar ||
		blackHole
	) {
		companionMods -= 1
	}
	const noCompanions = neutronStar || blackHole || yBrownDwarf
	return noCompanions ? Number.POSITIVE_INFINITY : 12 + companionMods
}

// A companion's distance from the star it orbits reuses the exact same
// habitable-zone deviation-to-AU mapping planets already use (see
// PLANET.deviationToAU), but rolled from its own continuous range per zone
// (galaxy-gen's rollStarCompanionTemplates: epistellar 1.5-2.5, inner -1..1,
// outer -3.5..-1.5, distant -6..-5) -- NOT sampled from the discrete
// ENVIRONMENT.*Deviations pools planets themselves draw from. Sharing that
// pool (the original implementation's mistake) let a companion land on the
// exact same deviation -- and therefore the exact same orbitalDistanceAU --
// as one of its parent's own real planets, since both would independently
// draw from the same handful of fixed values.
const ROLE_DEVIATION_RANGE: Record<
	Exclude<StarRole, "primary">,
	{ min: number; max: number }
> = {
	epistellar: { min: 1.5, max: 2.5 },
	inner: { min: -1, max: 1 },
	outer: { min: -3.5, max: -1.5 },
	distant: { min: -6, max: -5 },
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
 * companion never rolls for companions of its own at all. A giant parent
 * blocks its own epistellar-companion roll specifically (galaxy-gen's
 * `!giant && dice.roll(2,6) >= companionOdds`); `companionOdds` (see
 * companionOddsFor) is recomputed per star from its own rolled spectral AND
 * luminosity class, exactly mirroring the source. Every star's full physical
 * attributes -- not just its class -- come from STAR.rollStarAttributes,
 * which now types every companion via the Traveller Non-Primary Star
 * Determination table (Random/Lesser/Sibling/Twin/Other; see
 * resolveCompanionType in star/index.ts) keyed by the `column` this
 * function derives from StarRole just below ("epistellar" -> "companion",
 * everything else -> "secondary" -- the post-stellar column is chosen
 * automatically whenever the immediate parent is D/NS/BH). Every non-exotic
 * companion still inherits `parent.ageGyr` verbatim, but a companion that
 * itself resolves to post-stellar now rolls its own independent elapsed
 * age -- see the system-age-reset pass at the end of this function, which
 * mirrors the book's age-reset rule using that value. Stopping here (no
 * body generation) is what makes this cheap enough to call for every
 * visible galaxy point; `generate` below walks the identical tree and then
 * additionally hydrates each star's real planets/moons.
 */
function rollStarTree(rng: SharedRng): StarPreview[] {
	const stars: StarPreview[] = []

	function rollOne(role: StarRole, parentIndex: number | null): number {
		const index = stars.length
		const parent =
			parentIndex === null ? undefined : toParentStarLike(stars[parentIndex]!)
		const column = role === "epistellar" ? "companion" : "secondary"
		const rolled = STAR.rollStarAttributes(rng, parent, undefined, column)
		const deviation =
			role === "primary"
				? 0
				: rng.uniform(
						ROLE_DEVIATION_RANGE[role].min,
						ROLE_DEVIATION_RANGE[role].max,
					)
		const eccentricity =
			role === "primary"
				? 0
				: ROLLS.rollEccentricity({ rng, orbitKind: "companion-star" })
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
			deviation,
			eccentricity,
			inclinationDeg,
		})
		return index
	}

	function rollCompanionsFor(index: number, hasParent: boolean): void {
		const star = stars[index]!
		const companionOdds = companionOddsFor(star)
		const giant = STAR.isGiant(star.luminosityClass)
		if (!giant && DICE.roll2d6(rng) >= companionOdds) {
			rollOne("epistellar", index)
		}
		if (hasParent) return
		if (DICE.roll2d6(rng) >= companionOdds) {
			rollCompanionsFor(rollOne("inner", index), true)
		}
		if (DICE.roll2d6(rng) >= companionOdds) {
			rollCompanionsFor(rollOne("outer", index), true)
		}
		if (DICE.roll2d6(rng) >= companionOdds) {
			rollCompanionsFor(rollOne("distant", index), true)
		}
	}

	const primaryIndex = rollOne("primary", null)
	rollCompanionsFor(primaryIndex, false)

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
	if (!isPostStellarClass(root.spectralClass)) {
		let systemAgeGyr = root.ageGyr
		for (const star of stars) {
			if (
				isPostStellarClass(star.spectralClass) &&
				star.ageGyr > systemAgeGyr
			) {
				systemAgeGyr = star.ageGyr
			}
		}
		if (systemAgeGyr > root.ageGyr) {
			for (const star of stars) {
				if (!isPostStellarClass(star.spectralClass)) star.ageGyr = systemAgeGyr
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
		deviation: [],
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
		target.deviation.push(star.deviation)
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
		starDeviation: Float32Array.from(packed.deviation),
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
		deviation: packed.starDeviation,
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
			deviation: slice.deviation[i]!,
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

/**
 * Generates every real star in a packed galaxy system, each with its own
 * fully generated planets/moons -- not just the primary. Reuses
 * SYSTEM_GENERATION.generateSystemBodies per star (the same per-system
 * pipeline a single-star system already uses), always with
 * `mainWorldMode: "procedural"` (see plans/galaxy-view-port.md) so no body
 * is ever forced into a guaranteed-habitable slot or cloned from Earth, and
 * always with a star-mass override derived from that star's own rolled
 * spectral class rather than generateSystemBodies' Sol-mass default.
 */
function generate({
	galaxySeed,
	systemIndex,
	nationIndex = -1,
	packed,
	skipNaming,
}: GalaxySystemParams & { packed?: PackedGalaxyStars }): GalaxySystem {
	const seed = seedForSystem({ galaxySeed, systemIndex })
	const previews = packed
		? unpackStarPreviews(getPackedSystemStarSlice(packed, systemIndex))
		: rollStarTree(RNG.createRng({ seed }))

	const stars: GalaxyStar[] = previews.map((preview, index) => {
		const starSeed = seedForStar({ galaxySeed, systemIndex, starIndex: index })

		let orbitalDistanceAU = 0
		let orbitalPeriodDays = 0
		if (preview.parentIndex !== null) {
			const parent = previews[preview.parentIndex]!
			orbitalDistanceAU = PLANET.deviationToAU({
				deviation: preview.deviation,
				luminositySol: parent.luminositySol,
			})
			orbitalPeriodDays =
				STAR.getKeplerYearYears({
					orbitalDistanceAU,
					massSol: parent.massSol,
				}) * TIME.astronomicalDaysPerYear
		}

		const bodies = BODY_GENERATION.generateSystemBodies({
			seed: starSeed,
			hostStar: toHostStarAttributes(preview),
			hasParent: preview.parentIndex !== null,
			isEpistellarCompanion: preview.role === "epistellar",
			mainWorldMode: "procedural",
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
		}
	})

	return { systemIndex, seed, stars }
}

export const GALAXY_SYSTEMS = {
	seedForSystem,
	previewStars,
	generate,
	buildPackedGalaxyStars,
	getPackedSystemStarSlice,
}

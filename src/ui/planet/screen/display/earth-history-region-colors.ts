import { hashColorForKey } from "@/model/earth/history/color"
import type { RawNationReference } from "@/model/earth/history/data-source"
import type { FoldedState } from "@/model/earth/history/fold"
import {
	EARTH_HISTORY_NO_GOVERNMENT_COLOR,
	getEarthHistoryGovernmentColor,
} from "@/model/earth/history/government"
import { type ColorMode, OCEAN_LIGHT_BLUE } from "../../colors"
import { getBaseMapMode, getDataVariant } from "../shared/data-variant"
import type { NationMapMode, PopulationMapMode } from "../shared/map-modes"
import {
	darkenPoliticalAtElevation,
	darkenVegetationAtElevation,
} from "./color-helpers"

const UNOWNED_GRAY: [number, number, number] = [0.75, 0.75, 0.75]

/** Nation tag -> fill color (0-1 RGB), from RawNationReference.color
 * (0-255), falling back to a neutral gray for tags with no reference color.
 * Shared by computeEarthHistoryRegionColors (per-region vertex coloring)
 * and buildEarthHistoryNationFillColorForRawId (per-province-polygon
 * coloring) so both paths render the same nation the same color. */
function buildNationColorByTag(
	nationIds: Map<string, number>,
	nationReference: Map<string, RawNationReference>,
): Map<string, [number, number, number]> {
	const nationColorByTag = new Map<string, [number, number, number]>()
	for (const tag of nationIds.keys()) {
		const ref = nationReference.get(tag)
		nationColorByTag.set(
			tag,
			ref
				? [ref.color[0] / 255, ref.color[1] / 255, ref.color[2] / 255]
				: [0.5, 0.5, 0.5],
		)
	}
	return nationColorByTag
}

/** Political/culture/religion/diplomacy map-mode coloring sourced from the
 * earth-history engine's folded state, for Earth-imported worlds. A sibling
 * to computeRegionColors in region-colors.ts rather than a branch inside it:
 * that function's "religion" mode is derived from a province's *culture*
 * index (world.religions.assignment[cultureIdx]), an assumption that holds
 * for the procedural generator (religion is a property of culture there)
 * but not for real EU4 history, where a province's religion is independent
 * of its culture (e.g. conversions). Reusing that indirection would silently
 * misrender religion, so this keeps its own small, direct implementation
 * instead. See docs/earth-history-plan.md "Map modes and hover gating".
 *
 * Returns null for any (colorMode, nationMode, populationMode) combination
 * this doesn't cover -- callers should fall back to computeRegionColors
 * (still correct for terrain/climate/density/development/etc, which aren't
 * part of this engine's scope). */
export function computeEarthHistoryRegionColors(params: {
	colorMode: string
	nationMode: NationMapMode
	populationMode: PopulationMapMode
	state: FoldedState
	provinceMap: { compactToRealId: Int32Array }
	nationIds: Map<string, number>
	nationReference: Map<string, RawNationReference>
	regionProvince: Int32Array
	desolate: Uint8Array
	elevationKm: Float32Array
	isLand: Uint8Array | undefined
	/** religion id -> [r,g,b] 0-1, from reference/religion-groups.ts. Falls
	 * back to a deterministic hash color when a religion has none. */
	religionColorById?: Map<string, [number, number, number]>
	/** culture id -> [r,g,b] 0-1, from geo-explorer's cultures.json. Falls
	 * back to a deterministic hash color when a culture has none. */
	cultureColorById?: Map<string, [number, number, number]>
	/** When true, the isPolitical/isDemographic branches skip their real
	 * per-nation/per-culture/per-religion coloring and write a flat
	 * neutral gray instead -- for when the caller is painting the same
	 * territory with the real-province-polygon fill overlay
	 * (eu4-nation-fill-overlay.ts) instead, and this per-region layer only
	 * needs to exist as an underlying background (wasteland/desolate
	 * classification still shows through it; only the mode-specific color
	 * is suppressed, since the overlay renders that more precisely). The
	 * isPopulationVector branch (density/urban) is always suppressed this
	 * way regardless of this flag -- those modes have no per-region
	 * rendering path of their own left in this app, only the polygon-fill
	 * one, so there's nothing meaningful to toggle. */
	suppressFill?: boolean
}): Float32Array | null {
	const {
		colorMode,
		nationMode,
		populationMode,
		state,
		provinceMap,
		nationIds,
		nationReference,
		regionProvince,
		desolate,
		elevationKm,
		isLand,
		religionColorById,
		cultureColorById,
		suppressFill,
	} = params

	const isPolitical =
		colorMode === "nations" &&
		(nationMode === "borders" || nationMode === "government")
	const isDemographic =
		getBaseMapMode(colorMode as ColorMode) === "population" &&
		(populationMode === "culture" || populationMode === "religion")
	// Excludes the "observed" (realPopulation) and "diff" (populationDiff)
	// variants -- those compare the model against real-world census data
	// (world.realPopulation.population/.difference in region-colors.ts,
	// via populationDifferenceColor), which the polygon-fill overlay this
	// branch defers to (buildEarthHistoryPopulationFillColorForRawId) has
	// no notion of. Only the plain modeled-population "generated" variant
	// has a fill-overlay counterpart; getBaseMapMode collapses all three
	// colorModes ("population"/"realPopulation"/"populationDiff") to the
	// same "population" base, so that alone isn't a narrow enough check.
	const isPopulationVector =
		getDataVariant(colorMode as ColorMode) === "generated" &&
		getBaseMapMode(colorMode as ColorMode) === "population" &&
		(populationMode === "density" || populationMode === "urban")
	if (!isPolitical && !isDemographic && !isPopulationVector) return null

	const N = regionProvince.length
	const rgb = new Float32Array(N * 3)
	const oceanRgb = (r: number): [number, number, number] =>
		darkenVegetationAtElevation(OCEAN_LIGHT_BLUE, elevationKm[r] ?? 0)
	const write = (r: number, color: [number, number, number]) => {
		rgb[3 * r] = color[0]
		rgb[3 * r + 1] = color[1]
		rgb[3 * r + 2] = color[2]
	}

	// province index -> raw EU4 id string, cached once per call.
	const rawIdByProvince = provinceMap.compactToRealId

	const nationColorByTag = buildNationColorByTag(nationIds, nationReference)

	// Deterministic fallback color for culture/religion ids with no explicit
	// reference color (most EU4 cultures have no inherent color; religions
	// do via religion-groups.ts, applied by the caller before calling this).
	// Shared with the hover panel (via color.ts) so swatches match map tiles.
	const colorCache = new Map<string, [number, number, number]>()
	const colorFor = (key: string): [number, number, number] => {
		let c = colorCache.get(key)
		if (!c) {
			c = hashColorForKey(key)
			colorCache.set(key, c)
		}
		return c
	}

	for (let r = 0; r < N; r++) {
		const p = regionProvince[r]
		if (p < 0) {
			write(r, oceanRgb(r))
			continue
		}
		const rawId = String(rawIdByProvince[p])
		const ps = state.provinces.get(rawId)

		// "Desolate" (this app's own procedural habitability model) only
		// suppresses political/population coloring, never isDemographic's
		// culture/religion below (that renders real data the same as any
		// other province, falling back to gray only when there's genuinely
		// no cultureId/religionId recorded). EU4's own "wasteland" flag gets
		// no special treatment here -- wasteland provinces are colored by
		// ownership/culture/religion/population like any other province.
		if ((isPolitical || isPopulationVector) && desolate[p]) {
			write(
				r,
				darkenPoliticalAtElevation([0.35, 0.33, 0.32], elevationKm[r] ?? 0),
			)
			continue
		}

		if (isPolitical) {
			if (suppressFill) {
				write(r, darkenPoliticalAtElevation(UNOWNED_GRAY, elevationKm[r] ?? 0))
				continue
			}
			const owner = ps?.owner ?? null
			if (!owner) {
				write(r, darkenPoliticalAtElevation(UNOWNED_GRAY, elevationKm[r] ?? 0))
				continue
			}
			if (nationMode === "government") {
				const nation = state.nations.get(owner)
				const governmentColor = getEarthHistoryGovernmentColor({
					governmentType: nation?.governmentType ?? null,
					governmentReform: nation?.governmentReform,
				})
				write(
					r,
					darkenPoliticalAtElevation(
						governmentColor ?? EARTH_HISTORY_NO_GOVERNMENT_COLOR,
						elevationKm[r] ?? 0,
					),
				)
			} else {
				const color = nationColorByTag.get(owner) ?? colorFor(`nation:${owner}`)
				write(r, darkenPoliticalAtElevation(color, elevationKm[r] ?? 0))
			}
			continue
		}

		if (isPopulationVector) {
			// Always suppressed -- see suppressFill's doc comment: density/
			// urban have no per-region rendering path left, only the
			// polygon-fill overlay (GenesisView.tsx's populationFillColorForRawId),
			// so this per-region layer is purely the background under it.
			write(r, darkenPoliticalAtElevation(UNOWNED_GRAY, elevationKm[r] ?? 0))
			continue
		}

		// isDemographic
		if (suppressFill) {
			write(r, darkenPoliticalAtElevation(UNOWNED_GRAY, elevationKm[r] ?? 0))
			continue
		}
		if (populationMode === "culture") {
			const cultureId = ps?.cultureId ?? null
			if (!cultureId) {
				write(
					r,
					darkenPoliticalAtElevation([0.35, 0.33, 0.32], elevationKm[r] ?? 0),
				)
			} else {
				const color =
					cultureColorById?.get(cultureId) ?? colorFor(`culture:${cultureId}`)
				write(r, darkenPoliticalAtElevation(color, elevationKm[r] ?? 0))
			}
		} else {
			const religionId = ps?.religionId ?? null
			if (!religionId) {
				write(
					r,
					darkenPoliticalAtElevation([0.35, 0.33, 0.32], elevationKm[r] ?? 0),
				)
			} else {
				const color =
					religionColorById?.get(religionId) ??
					colorFor(`religion:${religionId}`)
				write(r, darkenPoliticalAtElevation(color, elevationKm[r] ?? 0))
			}
		}
	}

	void isLand
	return rgb
}

/** Nation tag -> occupation-stripe color, colored black for anonymous EU4
 * rebel control (tag "REB" -- popular uprisings never tracked as a real war
 * in wars.json, unlike named secessionist wars such as the American Civil
 * War, which keep their real belligerent's color) and the controlling
 * nation's color otherwise. Shared by computeEarthHistoryOccupationOverlay
 * (per-region) and buildEarthHistoryOccupationStripeColorForRawId
 * (per-province-polygon) so both render the same controller the same
 * stripe color. */
function buildOccupationColorForTag(
	nationReference: Map<string, RawNationReference>,
): (tag: string) => [number, number, number] {
	const REBEL_BLACK: [number, number, number] = [0, 0, 0]
	const colorCache = new Map<string, [number, number, number]>()
	return (tag: string) => {
		if (tag === "REB") return REBEL_BLACK
		let c = colorCache.get(tag)
		if (!c) {
			const ref = nationReference.get(tag)
			c = ref
				? [ref.color[0] / 255, ref.color[1] / 255, ref.color[2] / 255]
				: hashColorForKey(`nation:${tag}`)
			colorCache.set(tag, c)
		}
		return c
	}
}

/** Occupation-stripe overlay for Earth-imported worlds: every province whose
 * controller differs from its owner (EU4's own convention for "occupied")
 * gets a stripe. Reads state.provinces directly instead of going through
 * activeWars/nationIds (the mechanism computeEarthHistoryRegionColors's
 * sibling, buildPoliticalOccupationOverlay, uses for the procedural
 * generator's own war system) because most real occupations here have no
 * matching tracked war at all -- owner/controller divergence is the ground
 * truth. */
export function computeEarthHistoryOccupationOverlay(params: {
	state: FoldedState
	provinceMap: { compactToRealId: Int32Array }
	regionProvince: Int32Array
	nationReference: Map<string, RawNationReference>
}): Float32Array | null {
	const { state, provinceMap, regionProvince, nationReference } = params
	const rawIdByProvince = provinceMap.compactToRealId
	const colorForTag = buildOccupationColorForTag(nationReference)

	const N = regionProvince.length
	const overlay = new Float32Array(N * 4)
	let hasAny = false
	for (let r = 0; r < N; r++) {
		const p = regionProvince[r]
		if (p < 0) continue
		const rawId = String(rawIdByProvince[p])
		const ps = state.provinces.get(rawId)
		if (!ps?.owner || !ps?.controller || ps.owner === ps.controller) continue
		const color = colorForTag(ps.controller)
		const base = r * 4
		overlay[base] = color[0]
		overlay[base + 1] = color[1]
		overlay[base + 2] = color[2]
		overlay[base + 3] = 1
		hasAny = true
	}
	return hasAny ? overlay : null
}

import { hashColorForKey } from "@/model/earth/history/color"
import type { RawNationReference } from "@/model/earth/history/data-source"
import type { FoldedState } from "@/model/earth/history/fold"
import { type ColorMode, OCEAN_LIGHT_BLUE } from "../../colors"
import { getBaseMapMode } from "../shared/data-variant"
import type { NationMapMode, PopulationMapMode } from "../shared/map-modes"
import {
	darkenPoliticalAtElevation,
	darkenVegetationAtElevation,
} from "./color-helpers"

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
	/** Raw EU4 province id -> {name, wasteland}, from provinces.json's base
	 * fields (engine.provinceMeta). Wasteland provinces are always rendered
	 * dark gray, taking priority over political/demographic coloring in
	 * every mode this function handles. */
	provinceMeta?: Map<string, { name: string | null; wasteland: boolean }>
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
		provinceMeta,
	} = params

	const isPolitical =
		colorMode === "nations" &&
		(nationMode === "borders" || nationMode === "government")
	const isDemographic =
		getBaseMapMode(colorMode as ColorMode) === "population" &&
		(populationMode === "culture" || populationMode === "religion")
	if (!isPolitical && !isDemographic) return null

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

	const WASTELAND_GRAY: [number, number, number] = [0.25, 0.25, 0.25]
	const UNOWNED_GRAY: [number, number, number] = [0.75, 0.75, 0.75]

	const nationColorByTag = new Map<string, [number, number, number]>()
	for (const [tag, id] of nationIds) {
		const ref = nationReference.get(tag)
		nationColorByTag.set(
			tag,
			ref
				? [ref.color[0] / 255, ref.color[1] / 255, ref.color[2] / 255]
				: [0.5, 0.5, 0.5],
		)
		void id
	}

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

		if (isPolitical) {
			// "Desolate" (this app's own procedural habitability model) and
			// EU4's own "wasteland" flag both describe present-day/in-engine
			// uninhabitability, not history -- a province can be desolate or
			// EU4-wasteland while still having real historical owner data (a
			// real polity once ruled it; EU4 itself records ~43 of its 72
			// wasteland provinces with real culture/religion data too), so
			// both only suppress political coloring. Culture/religion below
			// render real data the same as any other province, falling back
			// to gray only when there's genuinely no cultureId/religionId
			// recorded.
			if (provinceMeta?.get(rawId)?.wasteland) {
				write(
					r,
					darkenPoliticalAtElevation(WASTELAND_GRAY, elevationKm[r] ?? 0),
				)
				continue
			}
			if (desolate[p]) {
				write(
					r,
					darkenPoliticalAtElevation([0.35, 0.33, 0.32], elevationKm[r] ?? 0),
				)
				continue
			}
			const owner = ps?.owner ?? null
			if (!owner) {
				write(r, darkenPoliticalAtElevation(UNOWNED_GRAY, elevationKm[r] ?? 0))
				continue
			}
			if (nationMode === "government") {
				const nation = state.nations.get(owner)
				const govKey = nation?.governmentType ?? "unknown"
				write(
					r,
					darkenPoliticalAtElevation(
						colorFor(`gov:${govKey}`),
						elevationKm[r] ?? 0,
					),
				)
			} else {
				const color = nationColorByTag.get(owner) ?? colorFor(`nation:${owner}`)
				write(r, darkenPoliticalAtElevation(color, elevationKm[r] ?? 0))
			}
			continue
		}

		// isDemographic
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

/** Occupation-stripe overlay for Earth-imported worlds: every province whose
 * controller differs from its owner (EU4's own convention for "occupied")
 * gets a stripe, colored black for anonymous EU4 rebel control (tag "REB" --
 * popular uprisings never tracked as a real war in wars.json, unlike named
 * secessionist wars such as the American Civil War, which keep their real
 * belligerent's color) and the controlling nation's color otherwise. Reads
 * state.provinces directly instead of going through activeWars/nationIds
 * (the mechanism computeEarthHistoryRegionColors's sibling,
 * buildPoliticalOccupationOverlay, uses for the procedural generator's own
 * war system) because most real occupations here have no matching tracked
 * war at all -- owner/controller divergence is the ground truth. */
export function computeEarthHistoryOccupationOverlay(params: {
	state: FoldedState
	provinceMap: { compactToRealId: Int32Array }
	regionProvince: Int32Array
	nationReference: Map<string, RawNationReference>
}): Float32Array | null {
	const { state, provinceMap, regionProvince, nationReference } = params
	const rawIdByProvince = provinceMap.compactToRealId
	const REBEL_BLACK: [number, number, number] = [0, 0, 0]

	const colorCache = new Map<string, [number, number, number]>()
	const colorForTag = (tag: string): [number, number, number] => {
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

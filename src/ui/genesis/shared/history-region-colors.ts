import type { GenesisLocations } from "@/model/geography/terrain/locations/types"
import { COLOR } from "@/model/history/earth/color"
import { GOVERNMENT } from "@/model/history/earth/government"
import type { OrgCategorizer } from "@/model/history/earth/organization-categories/types"
import { TITLE_RECORD } from "@/model/history/record/titles"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { DEJURE } from "@/model/society/dejure"
import { ERAS } from "@/model/society/eras"
import { TITLES } from "@/model/society/titles"
import type { TitleTier } from "@/model/society/titles/types"
import type { GenesisOrganization } from "@/model/society/types"
import {
	darkenPoliticalAtElevation,
	darkenVegetationAtElevation,
} from "@/ui/genesis/shared/color-helpers"
import { type ColorMode, OCEAN_LIGHT_BLUE } from "@/ui/genesis/shared/colors"
import { getBaseMapMode } from "@/ui/genesis/shared/data-variant"
import {
	isTitlesNationMode,
	type NationMapMode,
	type SocietyMapMode,
} from "@/ui/genesis/shared/map-modes"
import { tintNationColor } from "@/ui/genesis/shared/title-colors"

const UNOWNED_GRAY: [number, number, number] = [0.75, 0.75, 0.75]

type Rgb = [number, number, number]
type OrganizationKind = GenesisOrganization["kind"]

const ORGANIZATION_COLORS = {
	imperialPatchwork: [0.58, 0.29, 0.82],
	tradeLeague: [0.16, 0.68, 0.38],
	none: [0.82, 0.8, 0.78],
} as const satisfies Record<string, Rgb>

function tierForTitlesMode(nationMode: NationMapMode): TitleTier | null {
	switch (nationMode) {
		case "titlesDuchy":
			return "duchy"
		case "titlesKingdom":
			return "kingdom"
		case "titlesEmpire":
			return "empire"
		case "titlesHegemony":
			return "hegemony"
		default:
			return null
	}
}

function organizationColor(params: {
	frame: WorldFrame
	owner: number
	organizationKindById: ReadonlyMap<string, OrganizationKind>
}): Rgb {
	const { frame, owner, organizationKindById } = params
	const kinds = new Set(
		frame.nations
			.get(owner)
			?.organizations.map((entry) => organizationKindById.get(entry.orgId)),
	)
	if (kinds.has("imperialPatchwork"))
		return [...ORGANIZATION_COLORS.imperialPatchwork]
	if (kinds.has("tradeLeague")) return [...ORGANIZATION_COLORS.tradeLeague]
	return [...ORGANIZATION_COLORS.none]
}

export function computeHistoryRegionColors(params: {
	colorMode: string
	nationMode: NationMapMode
	populationMode: SocietyMapMode
	frame: WorldFrame
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
	 * is suppressed, since the overlay renders that more precisely). */
	suppressFill?: boolean
	locations: Pick<GenesisLocations, "regionLocation"> | null
	organizationKindById: ReadonlyMap<string, OrganizationKind>
}): Float32Array | null {
	const {
		colorMode,
		nationMode,
		populationMode,
		frame,
		regionProvince,
		desolate,
		elevationKm,
		isLand,
		religionColorById,
		cultureColorById,
		suppressFill,
		locations,
		organizationKindById,
	} = params

	const isPolitical =
		colorMode === "nations" &&
		(nationMode === "borders" ||
			nationMode === "government" ||
			nationMode === "dynasty" ||
			nationMode === "organizations" ||
			isTitlesNationMode(nationMode))
	const isDemographic =
		getBaseMapMode(colorMode as ColorMode) === "population" &&
		(populationMode === "culture" || populationMode === "religion")
	// density/urban (any variant -- generated/observed/diff) has no
	// per-region rendering path here: it falls through to the plain
	// computeRegionColors in region-colors.ts, which reads world.population/
	// world.realPopulation/world.realPopulation.difference directly and
	// renders per-region density correctly. There is no polygon-fill overlay
	// for population (unlike nations' nationFillColorForRawId) -- an earlier
	// version of this function routed the generated variant through one, but
	// that overlay was never implemented, which left the map solid gray for
	// Model/Density on earth-import worlds.
	if (!isPolitical && !isDemographic) return null

	const titleTier = isPolitical ? tierForTitlesMode(nationMode) : null
	const titles = frame.titles
	const tierIndex = titleTier ? TITLES.tierOrder.indexOf(titleTier) : 0
	const tierRegion =
		titleTier && titles
			? DEJURE.tierRegion({
					titles,
					provinceCount: frame.provinceCount,
					tier: tierIndex,
				})
			: null
	const realmIndex = new Map<number, number>()
	if (titles && titleTier) {
		const perNation = new Map<number, number>()
		for (let title = 0; title < titles.count; title++) {
			if (titles.tier[title] !== tierIndex) continue
			const holder = TITLE_RECORD.realmOf({
				frame,
				holder: titles.holder[title],
			})
			const next = perNation.get(holder) ?? 0
			realmIndex.set(title, next)
			perNation.set(holder, next + 1)
		}
	}
	const nationBase = (id: number): [number, number, number] => {
		const nation = frame.nations.get(id)
		return nation
			? [nation.color[0] / 255, nation.color[1] / 255, nation.color[2] / 255]
			: colorFor(`nation:${id}`)
	}

	const N = regionProvince.length
	const rgb = new Float32Array(N * 3)
	const oceanRgb = (r: number): [number, number, number] =>
		darkenVegetationAtElevation(OCEAN_LIGHT_BLUE, elevationKm[r] ?? 0)
	const write = (r: number, color: [number, number, number]) => {
		rgb[3 * r] = color[0]
		rgb[3 * r + 1] = color[1]
		rgb[3 * r + 2] = color[2]
	}

	// compact province index -> raw EU4 id (number), cached once per call.
	// Deterministic fallback color for culture/religion ids with no explicit
	// reference color (most EU4 cultures have no inherent color; religions
	// do via religion-groups.ts, applied by the caller before calling this).
	// Shared with the hover panel (via color.ts) so swatches match map tiles.
	const colorCache = new Map<string, [number, number, number]>()
	const colorFor = (key: string): [number, number, number] => {
		let c = colorCache.get(key)
		if (!c) {
			c = COLOR.hashColorForKey(key)
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
		const owner = frame.provinceNation[p]

		// "Desolate" (this app's own procedural habitability model) only
		// suppresses political/population coloring, never isDemographic's
		// culture/religion below (that renders real data the same as any
		// other province, falling back to gray only when there's genuinely
		// no cultureId/religionId recorded). EU4's own "wasteland" flag gets
		// no special treatment here -- wasteland provinces are colored by
		// ownership/culture/religion/population like any other province.
		if (isPolitical && desolate[p]) {
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
			if (owner < 0) {
				write(r, darkenPoliticalAtElevation(UNOWNED_GRAY, elevationKm[r] ?? 0))
				continue
			}
			if (nationMode === "government") {
				const nation = frame.nations.get(owner)
				const localGovernment =
					ERAS.governmentTypes[frame.provinceGovernment[p]] ?? null
				const governmentColor = GOVERNMENT.getEarthHistoryGovernmentColor({
					governmentType: localGovernment ?? nation?.government ?? null,
					governmentReform: localGovernment
						? undefined
						: nation?.governmentReform,
				})
				write(
					r,
					darkenPoliticalAtElevation(
						governmentColor ?? GOVERNMENT.earthHistoryNoGovernmentColor,
						elevationKm[r] ?? 0,
					),
				)
			} else if (nationMode === "dynasty") {
				// No stored reference color for a dynasty (unlike nations/
				// religions) -- dynastyColor's fixed palette keeps this
				// consistent with the swatch NationWikiPage shows for the same
				// dynasty. A republic, an interregnum, or simply no ruler
				// recorded at this date all fall back to the same neutral gray
				// as "no culture"/"no religion" below.
				const dynasty = frame.nations.get(owner)?.ruler?.dynasty ?? null
				write(
					r,
					darkenPoliticalAtElevation(
						dynasty ? COLOR.dynastyColor(dynasty) : [0.35, 0.33, 0.32],
						elevationKm[r] ?? 0,
					),
				)
			} else if (nationMode === "titlesBarony") {
				const location = locations?.regionLocation[r] ?? -1
				write(
					r,
					darkenPoliticalAtElevation(
						tintNationColor({
							base: nationBase(owner),
							index: location >= 0 ? location : p,
						}),
						elevationKm[r] ?? 0,
					),
				)
			} else if (nationMode === "titlesCounty") {
				write(
					r,
					darkenPoliticalAtElevation(
						tintNationColor({ base: nationBase(owner), index: p }),
						elevationKm[r] ?? 0,
					),
				)
			} else if (tierRegion && titles) {
				const title = tierRegion[p]
				const holder =
					title < 0
						? -1
						: TITLE_RECORD.realmOf({ frame, holder: titles.holder[title] })
				write(
					r,
					darkenPoliticalAtElevation(
						holder < 0
							? UNOWNED_GRAY
							: tintNationColor({
									base: nationBase(holder),
									index: realmIndex.get(title) ?? 0,
								}),
						elevationKm[r] ?? 0,
					),
				)
			} else if (nationMode === "organizations") {
				write(
					r,
					darkenPoliticalAtElevation(
						organizationColor({ frame, owner, organizationKindById }),
						elevationKm[r] ?? 0,
					),
				)
			} else {
				const nation = frame.nations.get(owner)
				const color: [number, number, number] = nation
					? [
							nation.color[0] / 255,
							nation.color[1] / 255,
							nation.color[2] / 255,
						]
					: colorFor(`nation:${owner}`)
				write(r, darkenPoliticalAtElevation(color, elevationKm[r] ?? 0))
			}
			continue
		}

		// isDemographic
		if (suppressFill) {
			write(r, darkenPoliticalAtElevation(UNOWNED_GRAY, elevationKm[r] ?? 0))
			continue
		}
		if (populationMode === "culture") {
			const cultureId = frame.provinceCulture[p]
			if (cultureId < 0) {
				write(
					r,
					darkenPoliticalAtElevation([0.35, 0.33, 0.32], elevationKm[r] ?? 0),
				)
			} else {
				const color =
					cultureColorById?.get(frame.cultures[cultureId]?.key ?? "") ??
					colorFor(`culture:${cultureId}`)
				write(r, darkenPoliticalAtElevation(color, elevationKm[r] ?? 0))
			}
		} else {
			const religionId = frame.provinceReligion[p]
			if (religionId < 0) {
				write(
					r,
					darkenPoliticalAtElevation([0.35, 0.33, 0.32], elevationKm[r] ?? 0),
				)
			} else {
				const color =
					religionColorById?.get(frame.religions[religionId]?.key ?? "") ??
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
 * gets a stripe. Reads state.provinceStateById directly instead of going through
 * activeWars/nationIds (the mechanism computeEarthHistoryRegionColors's
 * sibling, buildPoliticalOccupationOverlay, uses for the procedural
 * generator's own war system) because most real occupations here have no
 * matching tracked war at all -- owner/controller divergence is the ground
 * truth. */
export function computeHistoryOccupationOverlay(params: {
	frame: WorldFrame
	regionProvince: Int32Array
}): Float32Array | null {
	const { frame, regionProvince } = params
	const colorForId = (id: number): [number, number, number] => {
		const nation = frame.nations.get(id)
		return nation
			? [nation.color[0] / 255, nation.color[1] / 255, nation.color[2] / 255]
			: COLOR.hashColorForKey(`nation:${id}`)
	}

	const landholders = new Set<number>()
	for (const owner of frame.provinceNation)
		if (owner >= 0) landholders.add(owner)
	const rebelHeld = new Set<number>()
	for (const war of frame.wars)
		if (war.rebel)
			for (const id of war.defenders)
				if (!landholders.has(id)) rebelHeld.add(id)

	const N = regionProvince.length
	const overlay = new Float32Array(N * 4)
	let hasAny = false
	for (let r = 0; r < N; r++) {
		const p = regionProvince[r]
		if (p < 0) continue
		const owner = frame.provinceNation[p]
		const controller = frame.provinceController[p]
		if (owner < 0 || controller < 0 || owner === controller) continue
		const color: [number, number, number] = rebelHeld.has(controller)
			? [0, 0, 0]
			: colorForId(controller)
		const base = r * 4
		overlay[base] = color[0]
		overlay[base + 1] = color[1]
		overlay[base + 2] = color[2]
		overlay[base + 3] = 1
		hasAny = true
	}
	return hasAny ? overlay : null
}

export function computeTitleStripeOverlay(params: {
	frame: WorldFrame
	regionProvince: Int32Array
	tier: TitleTier
}): Float32Array | null {
	const { frame, regionProvince, tier } = params
	const { titles } = frame
	if (!titles) return null
	const tierRegion = DEJURE.tierRegion({
		titles,
		provinceCount: frame.provinceCount,
		tier: TITLES.tierOrder.indexOf(tier),
	})
	const overlay = new Float32Array(regionProvince.length * 4)
	let hasAny = false
	for (let r = 0; r < regionProvince.length; r++) {
		const p = regionProvince[r]
		if (p < 0) continue
		const owner = frame.provinceNation[p]
		const title = tierRegion[p]
		if (owner < 0 || title < 0) continue
		const holder = TITLE_RECORD.realmOf({
			frame,
			holder: titles.holder[title],
		})
		if (holder < 0 || holder === owner) continue
		const nation = frame.nations.get(owner)
		const color: [number, number, number] = nation
			? [nation.color[0] / 255, nation.color[1] / 255, nation.color[2] / 255]
			: COLOR.hashColorForKey(`nation:${owner}`)
		overlay[r * 4] = color[0]
		overlay[r * 4 + 1] = color[1]
		overlay[r * 4 + 2] = color[2]
		overlay[r * 4 + 3] = 1
		hasAny = true
	}
	return hasAny ? overlay : null
}

/** Diagonal-stripe overlay marking every province an org's OrgCategorizer
 * (organization-categories.ts) flags `striped` -- territory/sites associated
 * with the org without being a genuine member (HRE's foreign-held Imperial
 * soil, HSA's Hanseatic kontors/trade posts). Same Float32Array(numRegions*4)
 * shape as computeEarthHistoryOccupationOverlay above, feeding the exact
 * same scene.setOccupationOverlay -> applyFaceRegionColors path -- both
 * terrain and mapMesh already carry occColor/occMask attributes that this
 * writes into in place (mesh-builders.ts), so this does NOT need (and must
 * never gain back) a separate cloned overlay mesh: an earlier version of
 * this feature built one for map view mode (buildMapOccupationOverlay, since
 * removed) and it turned into a standing per-frame + per-pan rendering cost,
 * since HRE foreign-holder status is non-null across centuries of the
 * timeline (unlike ordinary occupation, which is only non-null during rare
 * active sieges). */
export function computeOrgStripeOverlay(params: {
	frame: WorldFrame
	regionProvince: Int32Array
	categorize: OrgCategorizer
	categoryColor: (categoryId: string) => [number, number, number]
}): Float32Array | null {
	const { frame, regionProvince, categorize, categoryColor } = params

	// Precompute a stripe color per province ONCE here (a single, small
	// ~province-count pass calling categorize), rather than calling it once
	// per region below -- the region loop can be two orders of magnitude
	// larger than the province count, and this runs every earth-history
	// scrub tick (see organization-categories.ts's OrgCategorySchema doc
	// comment for the perf incident this avoids repeating).
	const stripeColorByProvince = new Map<number, [number, number, number]>()
	for (let province = 0; province < frame.provinceCount; province++) {
		const category = categorize(province)
		if (category?.striped) {
			stripeColorByProvince.set(province, categoryColor(category.categoryId))
		}
	}
	if (stripeColorByProvince.size === 0) return null

	const N = regionProvince.length
	const overlay = new Float32Array(N * 4)
	let hasAny = false
	for (let r = 0; r < N; r++) {
		const p = regionProvince[r]
		if (p < 0) continue
		const color = stripeColorByProvince.get(p)
		if (!color) continue
		const base = r * 4
		overlay[base] = color[0]
		overlay[base + 1] = color[1]
		overlay[base + 2] = color[2]
		overlay[base + 3] = 1
		hasAny = true
	}
	return hasAny ? overlay : null
}

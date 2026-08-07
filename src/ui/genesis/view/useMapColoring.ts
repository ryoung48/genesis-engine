import { useCallback, useMemo } from "react"
import { APPARENT_TEMP } from "@/model/climate/apparent-temp"
import { HUMIDITY } from "@/model/climate/humidity"
import { COLOR } from "@/model/history/earth/color"
import type { RawOrganizationReference } from "@/model/history/earth/data-source/types"
import { FOLD } from "@/model/history/earth/fold"
import type { FoldedState } from "@/model/history/earth/fold/types"
import { GOVERNMENT } from "@/model/history/earth/government"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import type { OrgCategorizer } from "@/model/history/earth/organization-categories/types"
import { RELIGION } from "@/model/society/religion"
import type { OrgHighlightSpec } from "@/ui/genesis/renderer"
import {
	miseryColor,
	OCEAN_LIGHT_BLUE,
	windSpeedColor,
} from "@/ui/genesis/shared/colors"
import {
	computeEarthHistoryOccupationOverlay,
	computeEarthHistoryRegionColors,
	computeOrgStripeOverlay,
} from "@/ui/genesis/shared/earth-history-region-colors"
import { computeRegionColors } from "@/ui/genesis/shared/region-colors"
import { usePlaybackSampledValue } from "@/ui/genesis/shared/usePlaybackSampledValue"
import type { MapColoringInput } from "@/ui/genesis/view/types"
/**
 * Computes everything that colors the map surface: the per-region base fill
 * for the active map mode, the occupation/organization stripe overlays, the
 * open org wiki page's territory highlight, and the Earth-history overrides
 * that swap the procedural nation/culture/religion partitions for the real
 * ones at the scrubbed date. Playback-sensitive results are sampled through
 * usePlaybackSampledValue so timeline playback doesn't rebuild borders and
 * label textures on every tick.
 */
export function useMapColoring(input: MapColoringInput) {
	const {
		world,
		worldForDisplay,
		earthHistory,
		colorMode,
		nationMode,
		populationMode,
		viewMode,
		showElevation,
		dangerSubMode,
		selectedNationId,
		selectedWikiOrganizationId,
		windVectors,
		earthImportRawIdToCompact,
		hoverProvince,
		labelsPlaybackActive,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		currentMonth,
	} = input

	const buildOrgCategorizer = useCallback(
		(
			state: FoldedState,
			orgRef: RawOrganizationReference,
		): {
			categorize: OrgCategorizer
			categoryColor: (categoryId: string) => [number, number, number]
		} | null => {
			const schema = ORGANIZATION_CATEGORIES.orgCategorySchemas[orgRef.id]
			if (!schema) return null
			const categorize = schema.createCategorizer(state)
			const colorCache = new Map<string, [number, number, number]>()
			const categoryColor = (categoryId: string): [number, number, number] => {
				let color = colorCache.get(categoryId)
				if (color) return color
				const rgb =
					schema.categories.find((c) => c.id === categoryId)?.color ??
					orgRef.color
				color = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
				colorCache.set(categoryId, color)
				return color
			}
			return { categorize, categoryColor }
		},
		[],
	)

	// Recolors provinces belonging to the currently-open org's wiki page,
	// entirely at region level -- eu4-province-borders-fills.json's real
	// polygon triangulation only covers ~85% of provinces (3522 of 4195),
	// so a mesh-overlay approach left the other ~15% showing whatever the
	// base map already had underneath. The region mesh (world.mesh) always
	// covers 100% of the globe, so painting it directly (same mechanism
	// computeEarthHistoryRegionColors already uses for ordinary political
	// coloring) has no coverage gaps and no separate-mesh depth/elevation
	// concerns. Every org replaces every region's color outright: white
	// outside the organization, and a per-category color (from
	// buildOrgCategorizer) for every province a category covers.
	const resolveOrgProvinceColor = useCallback(
		(
			state: FoldedState,
			orgRef: RawOrganizationReference,
		): ((rawId: number) => [number, number, number] | null) => {
			const WHITE: [number, number, number] = [1, 1, 1]
			const colorByRawId = new Map<number, [number, number, number]>()
			const resolvers = buildOrgCategorizer(state, orgRef)
			if (resolvers) {
				const { categorize, categoryColor } = resolvers
				for (const rawId of state.provinces.keys()) {
					const numericRawId = Number(rawId)
					const category = categorize(numericRawId)
					// Striped categories (HRE's foreign holders, HSA's trade posts)
					// stay white at this base layer -- their diagonal stripe
					// (computeOrgStripeOverlay, fed through the SAME occColor/
					// occMask attributes as the ordinary occupation stripe) is the
					// sole indicator, same convention as the real occupation
					// overlay (owner's own color underneath, controller's color
					// striped on top).
					colorByRawId.set(
						numericRawId,
						category && !category.striped
							? categoryColor(category.categoryId)
							: WHITE,
					)
				}
			} else {
				// No registered schema: fall back to plain solid-member-color/
				// white-elsewhere coloring, so a brand new org still renders
				// reasonably before anyone gets around to giving it a real schema.
				const memberProvinceRawIds = FOLD.collectOrgMemberProvinceRawIds({
					state,
					orgId: orgRef.id,
				})
				const orgColor: [number, number, number] = [
					orgRef.color[0] / 255,
					orgRef.color[1] / 255,
					orgRef.color[2] / 255,
				]
				for (const rawId of state.provinces.keys()) {
					const numericRawId = Number(rawId)
					colorByRawId.set(
						numericRawId,
						memberProvinceRawIds.has(numericRawId) ? orgColor : WHITE,
					)
				}
			}
			return (rawId: number) => colorByRawId.get(rawId) ?? WHITE
		},
		[buildOrgCategorizer],
	)
	const withOrgHighlight = useCallback(
		(baseColors: Float32Array | null): Float32Array | null => {
			if (
				!selectedWikiOrganizationId ||
				!worldForDisplay?.provinces?.regionProvince ||
				!earthHistory.query ||
				!earthHistory.organizationReference ||
				!earthHistory.engine
			)
				return baseColors
			const orgRef = earthHistory.organizationReference.get(
				selectedWikiOrganizationId,
			)
			if (!orgRef) return baseColors
			const provinceColor = resolveOrgProvinceColor(
				earthHistory.query.state,
				orgRef,
			)
			const regionProvince = worldForDisplay.provinces.regionProvince
			const compactToRealId = earthHistory.engine.provinceMap.compactToRealId
			const N = worldForDisplay.mesh.numRegions
			// Mutate baseColors in place rather than copying it first -- every
			// caller (see regionColors' useMemo) computes a brand-new
			// Float32Array on the spot and never reads it again itself, so
			// there's nothing to protect by copying, only a wasted full-array
			// allocation + copy on top of the write loop below.
			const out = baseColors ?? new Float32Array(N * 3)
			for (let region = 0; region < N; region++) {
				const compact = regionProvince[region]
				if (compact < 0 || compact >= compactToRealId.length) continue
				const rawId = compactToRealId[compact]
				const color = provinceColor(rawId)
				if (!color) continue
				out[3 * region] = color[0]
				out[3 * region + 1] = color[1]
				out[3 * region + 2] = color[2]
			}
			return out
		},
		[
			selectedWikiOrganizationId,
			worldForDisplay,
			earthHistory.query,
			earthHistory.organizationReference,
			earthHistory.engine,
			resolveOrgProvinceColor,
		],
	)

	// --- Region colors ---
	const regionColors = useMemo(() => {
		if (!worldForDisplay) return null
		if (colorMode === "wind" && windVectors) {
			const N = worldForDisplay.mesh.numRegions
			const rgb = new Float32Array(N * 3)
			const { windSpeed } = windVectors
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = windSpeedColor(windSpeed[r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return withOrgHighlight(rgb)
		}
		if (
			(colorMode === "misery" || colorMode === "realMisery") &&
			windVectors &&
			worldForDisplay.climate &&
			worldForDisplay.dtr_annual
		) {
			// realMisery uses observed temperature/humidity throughout; misery
			// (model) uses the modeled climate estimates throughout. Wind has no
			// observed variant (no per-region historical wind data is
			// available), so it always comes from the model regardless of mode.
			const isObserved = colorMode === "realMisery"
			const N = worldForDisplay.mesh.numRegions
			const rgb = new Float32Array(N * 3)
			const isMonthly = dtrMonth > 0
			const offset = isMonthly ? (dtrMonth - 1) * N : 0
			const monthlyTemp = isMonthly
				? worldForDisplay.climate.temperature_monthly
				: null
			const monthlyRealTemp = isMonthly
				? worldForDisplay.climate.real_temperature_monthly
				: null
			const monthlyDtr = isMonthly ? worldForDisplay.dtr_monthly : null
			const aet = worldForDisplay.hydrology?.aet_monthly
			const pet = worldForDisplay.climate.pet_monthly
			const { windSpeed } = windVectors
			for (let r = 0; r < N; r++) {
				if (!worldForDisplay.isLand?.[r]) {
					rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
					rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
					rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
					continue
				}
				const modeledT = monthlyTemp
					? monthlyTemp[offset + r]
					: worldForDisplay.climate.temperature_avg[r]
				const observedT = monthlyRealTemp
					? monthlyRealTemp[offset + r]
					: worldForDisplay.climate.real_temperature_avg?.[r]
				const meanT =
					isObserved && Number.isFinite(observedT) ? observedT : modeledT
				let humidity: number
				if (isObserved) {
					const observedRh = isMonthly
						? worldForDisplay.observedHumidity?.real_monthly?.[offset + r]
						: worldForDisplay.observedHumidity?.real_annual?.[r]
					if (Number.isFinite(observedRh)) {
						humidity = observedRh as number
					} else {
						const dtr = monthlyDtr
							? (monthlyDtr[offset + r] ?? worldForDisplay.dtr_annual[r])
							: worldForDisplay.dtr_annual[r]
						humidity = HUMIDITY.relativeHumidityFromTempRange({
							meanTempC: meanT,
							dtrC: dtr,
							annualRainfallMm: worldForDisplay.rainfall?.annual[r],
						})
					}
				} else {
					const dtr = monthlyDtr
						? (monthlyDtr[offset + r] ?? worldForDisplay.dtr_annual[r])
						: worldForDisplay.dtr_annual[r]
					let annualAridity: number | undefined
					if (aet && pet) {
						let aetSum = 0
						let petSum = 0
						for (let m = 0; m < 12; m++) {
							aetSum += aet[m * N + r]
							petSum += pet[m * N + r]
						}
						annualAridity = petSum > 0 ? aetSum / petSum : 1
					}
					humidity = HUMIDITY.relativeHumidityFromTempRange({
						meanTempC: meanT,
						dtrC: dtr,
						annualAridity,
						annualRainfallMm: worldForDisplay.rainfall?.annual[r],
					})
				}
				const [cr, cg, cb] = miseryColor(
					APPARENT_TEMP.apparentTemperatureC({
						tempC: meanT,
						rhPercent: humidity,
						windSpeedMs: windSpeed[r],
					}),
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
			return withOrgHighlight(rgb)
		}
		if (
			worldForDisplay?.isEarthImport &&
			earthHistory.engine &&
			earthHistory.query &&
			earthHistory.nationReference &&
			worldForDisplay.provinces &&
			worldForDisplay.elevation_km
		) {
			const earthColors = computeEarthHistoryRegionColors({
				colorMode,
				nationMode,
				populationMode,
				state: earthHistory.query.state,
				provinceMap: earthHistory.engine.provinceMap,
				nationIds: earthHistory.query.frame.nationIds,
				nationReference: earthHistory.nationReference,
				regionProvince: worldForDisplay.provinces.regionProvince,
				desolate: worldForDisplay.provinces.desolate,
				elevationKm: worldForDisplay.elevation_km,
				isLand: worldForDisplay.isLand,
				religionColorById: earthHistory.religionColorById ?? undefined,
				cultureColorById: earthHistory.cultureColorById ?? undefined,
			})
			if (earthColors) return withOrgHighlight(earthColors)
		}
		return withOrgHighlight(
			computeRegionColors(
				worldForDisplay,
				colorMode,
				nationMode,
				populationMode,
				temperatureMonth,
				rainfallMonth,
				dtrMonth,
				currentMonth,
				viewMode,
				showElevation,
				undefined,
				undefined,
				selectedNationId,
				null,
				dangerSubMode,
			),
		)
	}, [
		colorMode,
		nationMode,
		populationMode,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		viewMode,
		showElevation,
		currentMonth,
		worldForDisplay,
		selectedNationId,
		windVectors,
		dangerSubMode,
		earthHistory.engine,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.religionColorById,
		earthHistory.cultureColorById,
		withOrgHighlight,
	])

	// Earth-import political/demographic fills are temporarily rendered only
	// via the base region mesh, not the real-EU4-province overlay, to avoid
	// the heavier first-render vector-overlay setup cost.
	const nationFillColorForRawId = useMemo<null>(() => null, [])

	// Overrides Nation/Government/Culture/Religion hover rows with real
	// history for the currently-scrubbed date -- the procedural builders
	// (buildProvinceDisplayData/buildGovernmentDisplayData/
	// buildDemographicDisplayData) read the generation-time-only
	// world.nations/world.cultures snapshot, which doesn't vary with the
	// earth-history scrubber. Colors reuse hashColorForKey so a hovered
	// swatch always matches its map tile (see earth-history-region-colors.ts,
	// which uses the same helper). Gated on world.isEarthImport, per
	// docs/earth-history-plan.md.
	const earthHistoryHoverOverride = useMemo(() => {
		if (
			!worldForDisplay?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query ||
			hoverProvince === null ||
			hoverProvince < 0
		)
			return undefined
		const rawId = String(
			earthHistory.engine.provinceMap.compactToRealId[hoverProvince],
		)
		// ps (folded owner/culture/religion state) can be missing for
		// provinces with no recorded history at all -- area/region/
		// superregion are static and come from `meta` regardless, so this no
		// longer bails out entirely; it just leaves the history-derived
		// fields null below.
		const ps = earthHistory.query.state.provinces.get(rawId) ?? null

		const meta = earthHistory.provinceMeta?.get(rawId)
		// EU4's own "wasteland" flag describes present-day/in-engine
		// uninhabitability, not history -- a wasteland province can still
		// have real recorded culture/religion data (EU4 itself records this
		// for many of its own wasteland provinces), so it only suppresses
		// nation/government, matching computeEarthHistoryRegionColors'
		// map-coloring behavior.
		const isWasteland = !!meta?.wasteland
		const owner = isWasteland ? null : (ps?.owner ?? null)
		const nationRef = owner ? earthHistory.nationReference?.get(owner) : null
		const nationName = owner
			? (earthHistory.query.state.nations.get(owner)?.currentName ??
				nationRef?.name ??
				owner)
			: null
		const nationColor = owner
			? nationRef
				? COLOR.rgb01ToCss([
						nationRef.color[0] / 255,
						nationRef.color[1] / 255,
						nationRef.color[2] / 255,
					])
				: COLOR.rgb01ToCss(COLOR.hashColorForKey(`nation:${owner}`))
			: null

		const nationState = owner
			? (earthHistory.query.state.nations.get(owner) ?? null)
			: null
		const governmentLabel = nationState
			? GOVERNMENT.formatEarthHistoryGovernmentReformLabel({
					governmentReform: nationState.governmentReform,
				})
			: null
		const governmentColorRgb = GOVERNMENT.getEarthHistoryGovernmentColor({
			governmentType: nationState?.governmentType ?? null,
			governmentReform: nationState?.governmentReform,
		})
		const governmentColor = COLOR.rgb01ToCss(
			governmentColorRgb ?? GOVERNMENT.earthHistoryNoGovernmentColor,
		)

		const cultureId = ps?.cultureId
		const cultureName = cultureId
			? (earthHistory.cultureNameById?.get(cultureId) ?? cultureId)
			: null
		const cultureColorRgb = cultureId
			? earthHistory.cultureColorById?.get(cultureId)
			: null
		const cultureColor = cultureId
			? COLOR.rgb01ToCss(
					cultureColorRgb ?? COLOR.hashColorForKey(`culture:${cultureId}`),
				)
			: null

		const provinceName = meta?.name ?? null
		const area = meta?.area ?? null
		const region = meta?.region ?? null
		const superregion = meta?.superregion ?? null

		const religionId = ps?.religionId
		const religionName = religionId
			? (earthHistory.religionNameById?.get(religionId) ?? religionId)
			: null
		const religionColorRgb = religionId
			? earthHistory.religionColorById?.get(religionId)
			: null
		const religionColor = religionId
			? COLOR.rgb01ToCss(
					religionColorRgb ?? COLOR.hashColorForKey(`religion:${religionId}`),
				)
			: null

		return {
			nationName,
			nationColor,
			governmentLabel,
			governmentColor,
			cultureName,
			cultureColor,
			religionName,
			religionColor,
			provinceName,
			area,
			region,
			superregion,
		}
	}, [
		worldForDisplay?.isEarthImport,
		earthHistory.engine,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.cultureNameById,
		earthHistory.cultureColorById,
		earthHistory.religionNameById,
		earthHistory.religionColorById,
		earthHistory.provinceMeta,
		hoverProvince,
	])

	const occupationOverlay = useMemo(() => {
		if (
			worldForDisplay?.isEarthImport &&
			earthHistory.engine &&
			earthHistory.query &&
			earthHistory.nationReference &&
			worldForDisplay.provinces
		) {
			// Any org wiki page open: its own striped categories (HRE's
			// foreign-held territory, HSA's Hanseatic kontors/trade posts, ...)
			// take priority over the normal contested-province stripe while
			// browsing that org's territory. Both write into the SAME
			// occColor/occMask attributes already present on terrainMesh/
			// mapMesh (see applyFaceRegionColors) -- no separate overlay mesh
			// is built for this (see computeOrgStripeOverlay's doc comment for
			// why that mattered).
			if (selectedWikiOrganizationId) {
				const orgRef = earthHistory.organizationReference.get(
					selectedWikiOrganizationId,
				)
				const resolvers = orgRef
					? buildOrgCategorizer(earthHistory.query.state, orgRef)
					: null
				if (resolvers) {
					return computeOrgStripeOverlay({
						state: earthHistory.query.state,
						provinceMap: earthHistory.engine.provinceMap,
						regionProvince: worldForDisplay.provinces.regionProvince,
						categorize: resolvers.categorize,
						categoryColor: resolvers.categoryColor,
					})
				}
				// No registered category schema for this org (nothing striped) --
				// the ordinary contested-province stripe is nation-mode furniture
				// unrelated to org membership, so it's suppressed rather than
				// bleeding through org territory coloring.
				return null
			}
			return computeEarthHistoryOccupationOverlay({
				state: earthHistory.query.state,
				provinceMap: earthHistory.engine.provinceMap,
				regionProvince: worldForDisplay.provinces.regionProvince,
				nationReference: earthHistory.nationReference,
			})
		}
		// Procedural worlds no longer have wars, so there is nothing to occupy.
		return null
	}, [
		worldForDisplay,
		earthHistory.query,
		earthHistory.nationReference,
		earthHistory.engine,
		earthHistory.organizationReference,
		selectedWikiOrganizationId,
		buildOrgCategorizer,
	])

	const occupationStripeColorForRawId = useMemo<null>(() => null, [])

	// Earth-imported worlds swap in the real historical culture/religion
	// partitions and have no per-province blend data of their own. Procedural
	// worlds carry a static border-bleed pass (computePartitionBorderBlend, run
	// once at generation time in CULTURE.computeCultures / RELIGION.computeReligions)
	// that approximates the old per-tick culture-spread simulation's visible
	// stripes.
	const cultureBlendOverlay = useMemo(() => {
		if (worldForDisplay?.isEarthImport || !worldForDisplay?.provinces) {
			return null
		}
		const { regionProvince, desolate } = worldForDisplay.provinces
		const N = regionProvince.length

		if (populationMode === "culture") {
			if (!worldForDisplay.cultures?.blendSecondary) return null
			const { colors, blendSecondary } = worldForDisplay.cultures
			const overlay = new Float32Array(N * 4)
			let hasAny = false
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				if (p < 0 || desolate[p]) continue
				const secondary = blendSecondary[p]
				if (secondary < 0) continue
				const base = r * 4
				overlay[base] = colors[3 * secondary]
				overlay[base + 1] = colors[3 * secondary + 1]
				overlay[base + 2] = colors[3 * secondary + 2]
				overlay[base + 3] = 1
				hasAny = true
			}
			return hasAny ? overlay : null
		}

		if (populationMode === "religion") {
			const { cultures, religions, religionTypes } = worldForDisplay
			if (!cultures?.blendSecondary || !religions || !religionTypes) {
				return null
			}
			// Religion has no border-bleed pass of its own -- it rides the same
			// province-level culture bleed (cultures.blendSecondary) and just
			// looks up the bled-to culture's religion, so religion stripes
			// appear on exactly the same provinces as culture stripes rather
			// than bleeding over an entire (much coarser) religion region.
			// Colored by religion TYPE (animistic, monotheistic, ...), matching
			// the base religion fill -- not the individual religion's own color
			// or the culture's color.
			const overlay = new Float32Array(N * 4)
			let hasAny = false
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				if (p < 0 || desolate[p]) continue
				const primaryCulture = cultures.assignment[p]
				if (primaryCulture < 0) continue
				const secondaryCulture = cultures.blendSecondary[p]
				if (secondaryCulture < 0) continue
				const secondaryReligion = religions.assignment[secondaryCulture]
				if (secondaryReligion < 0) continue
				const typeIdx = religionTypes[secondaryReligion]
				// Skip the stripe when the bled-to culture practices the same
				// religion type as the province's own culture -- nothing would be
				// visually different from the base fill.
				const primaryReligion = religions.assignment[primaryCulture]
				if (
					primaryReligion >= 0 &&
					religionTypes[primaryReligion] === typeIdx
				) {
					continue
				}
				const typeColor =
					RELIGION.religionTypeColors[typeIdx] ?? RELIGION.religionTypeColors[0]
				const base = r * 4
				overlay[base] = typeColor[0]
				overlay[base + 1] = typeColor[1]
				overlay[base + 2] = typeColor[2]
				overlay[base + 3] = 1
				hasAny = true
			}
			return hasAny ? overlay : null
		}

		return null
	}, [worldForDisplay, populationMode])
	const earthHistorySceneNationOverride = usePlaybackSampledValue(
		worldForDisplay?.isEarthImport && earthHistory.query
			? {
					assignment: earthHistory.query.frame.assignment,
					seeds: earthHistory.query.frame.seeds,
					names:
						colorMode === "nations" && nationMode === "dynasty"
							? (() => {
									const { frame, state } = earthHistory.query!
									const dynastyNames = new Array<string>(
										frame.names.length,
									).fill("")
									for (const [tag, id] of frame.nationIds) {
										const dynasty = state.nations.get(tag)?.ruler?.dynasty
										if (dynasty) dynastyNames[id] = dynasty
									}
									return dynastyNames
								})()
							: earthHistory.query.frame.names,
				}
			: null,
		350,
		labelsPlaybackActive,
	)
	const earthHistorySceneLabelPartitions = usePlaybackSampledValue(
		worldForDisplay?.isEarthImport && earthHistory.query
			? {
					culture: {
						assignment: earthHistory.query.frame.cultureAssignment,
						count: earthHistory.query.frame.cultureCount,
						names: earthHistory.query.frame.cultureNames,
					},
					religion: {
						assignment: earthHistory.query.frame.religionAssignment,
						count: earthHistory.query.frame.religionCount,
						names: earthHistory.query.frame.religionNames,
					},
				}
			: null,
		350,
		labelsPlaybackActive,
	)

	// Map territory highlight (HRE, Hanseatic League, ...) -- recomputed on
	// every timeline scrub tick since membership is derived fresh from
	// FoldedState each time (see fold.ts's collectOrgMemberProvinceRawIds).
	// setOrganizationHighlight rebuilds nation BORDERS and LABELS (border
	// tracing + label-texture regeneration, both far more expensive than a
	// region-color array fill) whenever the spec reference changes, so this
	// is throttled through usePlaybackSampledValue exactly like
	// earthHistorySceneNationOverride/LabelPartitions just above -- without
	// it, an open org wiki page rebuilt borders+labels every single tick
	// instead of at most once per 350ms during playback.
	const organizationHighlightSpecRaw = useMemo<OrgHighlightSpec | null>(() => {
		if (
			!selectedWikiOrganizationId ||
			!world?.isEarthImport ||
			!earthHistory.query ||
			!earthHistory.organizationReference
		)
			return null
		const orgRef = earthHistory.organizationReference.get(
			selectedWikiOrganizationId,
		)
		if (!orgRef) return null
		const { state } = earthHistory.query
		const memberProvinceRawIds = FOLD.collectOrgMemberProvinceRawIds({
			state,
			orgId: orgRef.id,
		})
		if (memberProvinceRawIds.size === 0) return null
		const memberProvinceCompactIndexes = new Set<number>()
		for (const rawId of memberProvinceRawIds) {
			const compact = earthImportRawIdToCompact?.get(rawId)
			if (compact !== undefined) memberProvinceCompactIndexes.add(compact)
		}
		return {
			orgId: orgRef.id,
			name: orgRef.name,
			memberProvinceCompactIndexes,
		}
	}, [
		selectedWikiOrganizationId,
		world,
		earthHistory.query,
		earthHistory.organizationReference,
		earthImportRawIdToCompact,
	])
	const organizationHighlightSpec = usePlaybackSampledValue(
		organizationHighlightSpecRaw,
		350,
		labelsPlaybackActive,
	)

	return {
		buildOrgCategorizer,
		cultureBlendOverlay,
		earthHistoryHoverOverride,
		earthHistorySceneLabelPartitions,
		earthHistorySceneNationOverride,
		nationFillColorForRawId,
		occupationOverlay,
		occupationStripeColorForRawId,
		organizationHighlightSpec,
		regionColors,
	}
}

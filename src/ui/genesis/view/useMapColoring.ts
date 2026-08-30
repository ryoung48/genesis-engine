import { useCallback, useMemo } from "react"
import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import { APPARENT_TEMP } from "@/model/climate/temperature/apparent-temp"
import { COLOR } from "@/model/history/earth/color"
import type { RawOrganizationReference } from "@/model/history/earth/data-source/types"
import { GOVERNMENT } from "@/model/history/earth/government"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import type { OrgCategorizer } from "@/model/history/earth/organization-categories/types"
import { ORGANIZATION_TITLE_COLORS } from "@/model/history/sim/organizations/titles"
import { RELIGION } from "@/model/history/sim/religion"
import { FRAME } from "@/model/history/world-frame"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { OrganizationTitle } from "@/model/society/types"
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
		historyFrame,
		historyCultureColorById,
		historyReligionColorById,
		colorMode,
		nationMode,
		societyMode: populationMode,
		religionMode,
		viewMode,
		showElevation,
		dangerSubMode,
		selectedNationId,
		selectedWikiOrganizationId,
		windVectors,
		hoverProvince,
		labelsPlaybackActive,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		currentMonth,
		getOrganizationName,
	} = input

	const buildOrgCategorizer = useCallback(
		(
			frame: WorldFrame,
			orgRef: RawOrganizationReference,
		): {
			categorize: OrgCategorizer
			categoryColor: (categoryId: string) => [number, number, number]
		} | null => {
			const schema = ORGANIZATION_CATEGORIES.orgCategorySchemas[orgRef.id]
			if (!schema) return null
			const categorize = schema.createCategorizer(frame)
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
	const historyRenderInputs = useMemo(
		() => (historyFrame ? FRAME.toRenderInputs({ frame: historyFrame }) : null),
		[historyFrame],
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
			frame: WorldFrame,
			orgRef: RawOrganizationReference,
		): ((province: number) => [number, number, number] | null) => {
			const WHITE: [number, number, number] = [1, 1, 1]
			const colorByProvince = new Map<number, [number, number, number]>()
			const resolvers = buildOrgCategorizer(frame, orgRef)
			if (resolvers) {
				const { categorize, categoryColor } = resolvers
				for (let province = 0; province < frame.provinceCount; province++) {
					const category = categorize(province)
					// Striped categories (HRE's foreign holders, HSA's trade posts)
					// stay white at this base layer -- their diagonal stripe
					// (computeOrgStripeOverlay, fed through the SAME occColor/
					// occMask attributes as the ordinary occupation stripe) is the
					// sole indicator, same convention as the real occupation
					// overlay (owner's own color underneath, controller's color
					// striped on top).
					colorByProvince.set(
						province,
						category && !category.striped
							? categoryColor(category.categoryId)
							: WHITE,
					)
				}
			} else {
				// No registered schema: fall back to plain solid-member-color/
				// white-elsewhere coloring, so a brand new org still renders
				// reasonably before anyone gets around to giving it a real schema.
				const memberProvinces = FRAME.orgMemberProvinces({
					frame,
					orgId: orgRef.id,
				})
				const orgColor: [number, number, number] = [
					orgRef.color[0] / 255,
					orgRef.color[1] / 255,
					orgRef.color[2] / 255,
				]
				for (let province = 0; province < frame.provinceCount; province++) {
					colorByProvince.set(
						province,
						memberProvinces.has(province) ? orgColor : WHITE,
					)
				}
			}
			return (province: number) => colorByProvince.get(province) ?? WHITE
		},
		[buildOrgCategorizer],
	)
	const withOrgHighlight = useCallback(
		(baseColors: Float32Array | null): Float32Array | null => {
			if (
				!selectedWikiOrganizationId ||
				!worldForDisplay?.provinces?.regionProvince
			)
				return baseColors
			if (
				earthHistory.query &&
				earthHistory.organizationReference &&
				earthHistory.state
			) {
				const orgRef = earthHistory.organizationReference.get(
					selectedWikiOrganizationId,
				)
				if (orgRef) {
					const provinceColor = resolveOrgProvinceColor(
						earthHistory.query.frame,
						orgRef,
					)
					const regionProvince = worldForDisplay.provinces.regionProvince
					const N = worldForDisplay.mesh.numRegions
					// Mutate baseColors in place rather than copying it first -- every
					// caller (see regionColors' useMemo) computes a brand-new
					// Float32Array on the spot and never reads it again itself, so
					// there's nothing to protect by copying, only a wasted full-array
					// allocation + copy on top of the write loop below.
					const out = baseColors ?? new Float32Array(N * 3)
					for (let region = 0; region < N; region++) {
						const compact = regionProvince[region]
						if (
							compact < 0 ||
							compact >= earthHistory.query.frame.provinceCount
						)
							continue
						const color = provinceColor(compact)
						if (!color) continue
						out[3 * region] = color[0]
						out[3 * region + 1] = color[1]
						out[3 * region + 2] = color[2]
					}
					return out
				}
			}
			// Procedural counterpart -- same white-outside/category-color-inside
			// convention as resolveOrgProvinceColor above, keyed directly by raw
			// nation array index (no rawId translation layer needed, unlike the
			// Earth-import path). Deliberately reads world.nations.assignment, NOT
			// worldForDisplay.nations.assignment -- buildDisplayWorld overwrites
			// the display copy's assignment with sovereign.slice() (capital
			// province ids, for the label/selection convention used elsewhere in
			// this UI layer), which would never match member.nationIndex's raw
			// 0..nationCount-1 array index space.
			const proceduralOrg = world?.nations?.organizations?.find(
				(org) => org.id === selectedWikiOrganizationId,
			)
			if (!proceduralOrg || !world?.nations) return baseColors
			const titleByNation = new Map<number, OrganizationTitle>(
				proceduralOrg.members.map((m) => [m.nationIndex, m.title]),
			)
			const regionProvince = worldForDisplay.provinces.regionProvince
			const assignment = world.nations.assignment
			const N = worldForDisplay.mesh.numRegions
			const WHITE: [number, number, number] = [1, 1, 1]
			const out = baseColors ?? new Float32Array(N * 3)
			for (let region = 0; region < N; region++) {
				const province = regionProvince[region]
				// Ocean regions (province < 0) are left untouched -- same
				// convention as resolveOrgProvinceColor's Earth-import counterpart
				// -- so water stays whatever the base fill already painted it,
				// instead of getting overwritten white like unclaimed land.
				if (province < 0) continue
				const nationId = assignment[province]
				const title = nationId >= 0 ? titleByNation.get(nationId) : undefined
				const color = title
					? (ORGANIZATION_TITLE_COLORS[title].map((c) => c / 255) as [
							number,
							number,
							number,
						])
					: WHITE
				out[3 * region] = color[0]
				out[3 * region + 1] = color[1]
				out[3 * region + 2] = color[2]
			}
			return out
		},
		[
			selectedWikiOrganizationId,
			world,
			worldForDisplay,
			earthHistory.query,
			earthHistory.organizationReference,
			earthHistory.state,
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
			historyFrame &&
			worldForDisplay.provinces &&
			worldForDisplay.elevation_km
		) {
			const historyColors = computeEarthHistoryRegionColors({
				colorMode,
				nationMode,
				populationMode,
				frame: historyFrame,
				regionProvince: worldForDisplay.provinces.regionProvince,
				desolate: worldForDisplay.provinces.desolate,
				elevationKm: worldForDisplay.elevation_km,
				isLand: worldForDisplay.isLand,
				religionColorById: historyReligionColorById ?? undefined,
				cultureColorById: historyCultureColorById ?? undefined,
			})
			if (historyColors) return withOrgHighlight(historyColors)
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
				religionMode,
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
		historyReligionColorById,
		historyCultureColorById,
		historyFrame,
		withOrgHighlight,
		religionMode,
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
			!earthHistory.state ||
			!earthHistory.query ||
			hoverProvince === null ||
			hoverProvince < 0
		)
			return undefined
		// ps (folded owner/culture/religion state) can be missing for
		// provinces with no recorded history at all -- area/region/
		// superregion are static and come from `meta` regardless, so this no
		// longer bails out entirely; it just leaves the history-derived
		// fields null below.
		const frame = earthHistory.query.frame
		const meta = earthHistory.state.provinceMeta[hoverProvince]
		// EU4's own "wasteland" flag describes present-day/in-engine
		// uninhabitability, not history -- a wasteland province can still
		// have real recorded culture/religion data (EU4 itself records this
		// for many of its own wasteland provinces), so it only suppresses
		// nation/government, matching computeEarthHistoryRegionColors'
		// map-coloring behavior.
		const isWasteland = !!meta?.wasteland
		const provinceNation = frame.provinceNation[hoverProvince] ?? -1
		const owner = isWasteland || provinceNation < 0 ? null : provinceNation
		const nation = owner === null ? null : (frame.nations.get(owner) ?? null)
		const nationName =
			owner !== null
				? (nation?.name ??
					earthHistory.state.record.nations[owner]?.name ??
					`nation ${owner}`)
				: null
		const nationColor = nation
			? COLOR.rgb01ToCss([
					nation.color[0] / 255,
					nation.color[1] / 255,
					nation.color[2] / 255,
				])
			: null

		const nationState = nation
		const governmentLabel = nationState
			? GOVERNMENT.formatEarthHistoryGovernmentReformLabel({
					governmentReform: nationState.governmentReform,
				})
			: null
		const governmentColorRgb = GOVERNMENT.getEarthHistoryGovernmentColor({
			governmentType: nationState?.government ?? null,
			governmentReform: nationState?.governmentReform,
		})
		const governmentColor = COLOR.rgb01ToCss(
			governmentColorRgb ?? GOVERNMENT.earthHistoryNoGovernmentColor,
		)

		const cultureId = frame.provinceCulture[hoverProvince]
		const culture = cultureId >= 0 ? (frame.cultures[cultureId] ?? null) : null
		const cultureName = culture?.name ?? null
		const cultureColor = culture
			? COLOR.rgb01ToCss(
					culture.color.map((component) => component / 255) as [
						number,
						number,
						number,
					],
				)
			: null

		const provinceName = meta?.name ?? null
		const area = meta?.area ?? null
		const region = meta?.region ?? null
		const superregion = meta?.superregion ?? null

		const religionId = frame.provinceReligion[hoverProvince]
		const religion =
			religionId >= 0 ? (frame.religions[religionId] ?? null) : null
		const religionName = religion?.name ?? null
		const religionColor = religion
			? COLOR.rgb01ToCss(
					religion.color.map((component) => component / 255) as [
						number,
						number,
						number,
					],
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
		earthHistory.state,
		earthHistory.query,
		hoverProvince,
	])

	const occupationOverlay = useMemo(() => {
		if (
			worldForDisplay?.isEarthImport &&
			earthHistory.state &&
			earthHistory.query &&
			earthHistory.nations &&
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
					? buildOrgCategorizer(earthHistory.query.frame, orgRef)
					: null
				if (resolvers) {
					return computeOrgStripeOverlay({
						frame: earthHistory.query.frame,
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
				frame: earthHistory.query.frame,
				regionProvince: worldForDisplay.provinces.regionProvince,
			})
		}
		// Procedural worlds no longer have wars, so there is nothing to occupy.
		return null
	}, [
		worldForDisplay,
		earthHistory.query,
		earthHistory.nations,
		earthHistory.state,
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
			if (
				!cultures?.blendSecondary ||
				!religions ||
				(religionMode === "types" && !religionTypes)
			) {
				return null
			}
			// Religion has no border-bleed pass of its own -- it rides the same
			// province-level culture bleed (cultures.blendSecondary) and just
			// looks up the bled-to culture's religion, so religion stripes
			// appear on exactly the same provinces as culture stripes rather
			// than bleeding over an entire (much coarser) religion region.
			// Religions use the bled-to religion's individual color; the Types
			// submode substitutes its family's shared type palette color.
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
				// Skip the stripe when the bled-to culture practices the same
				// religion as the province's own culture -- nothing would be
				// visually different from the base fill.
				const primaryReligion = religions.assignment[primaryCulture]
				const typeIdx = religionTypes?.[secondaryReligion] ?? -1
				if (
					primaryReligion === secondaryReligion ||
					(religionMode === "types" &&
						typeIdx >= 0 &&
						religionTypes?.[primaryReligion] === typeIdx)
				) {
					continue
				}
				const colorBase = secondaryReligion * 3
				const color =
					religionMode === "types" && typeIdx >= 0
						? (RELIGION.religionTypeColors[typeIdx] ??
							RELIGION.religionTypeColors[0])
						: colorBase + 2 < religions.colors.length
							? [
									religions.colors[colorBase],
									religions.colors[colorBase + 1],
									religions.colors[colorBase + 2],
								]
							: null
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

		return null
	}, [worldForDisplay, populationMode, religionMode])
	const earthHistorySceneNationOverride = usePlaybackSampledValue(
		historyFrame && historyRenderInputs
			? {
					assignment: historyRenderInputs.assignment,
					seeds: historyRenderInputs.seeds,
					names:
						colorMode === "nations" && nationMode === "dynasty"
							? (() => {
									const dynastyNames = new Array<string>(
										historyRenderInputs.names.length,
									).fill("")
									for (const nation of historyFrame.nations.values()) {
										const dynasty = nation.ruler?.dynasty
										if (dynasty) dynastyNames[nation.id] = dynasty
									}
									return dynastyNames
								})()
							: historyRenderInputs.names,
				}
			: null,
		350,
		labelsPlaybackActive,
	)
	const earthHistorySceneLabelPartitions = usePlaybackSampledValue(
		historyFrame && historyRenderInputs
			? {
					culture: {
						assignment: historyRenderInputs.cultureAssignment,
						count: historyFrame.cultures.length,
						names: historyFrame.cultures.map((culture) => culture.name),
					},
					religion: {
						assignment: historyRenderInputs.religionAssignment,
						count: historyFrame.religions.length,
						names: historyFrame.religions.map((religion) => religion.name),
					},
				}
			: null,
		350,
		labelsPlaybackActive,
	)

	// Map territory highlight (HRE, Hanseatic League, ...) -- recomputed on
	// every timeline scrub tick since membership is derived fresh from
	// WorldFrame each time because membership changes with the scrubbed date.
	// setOrganizationHighlight rebuilds nation BORDERS and LABELS (border
	// tracing + label-texture regeneration, both far more expensive than a
	// region-color array fill) whenever the spec reference changes, so this
	// is throttled through usePlaybackSampledValue exactly like
	// earthHistorySceneNationOverride/LabelPartitions just above -- without
	// it, an open org wiki page rebuilt borders+labels every single tick
	// instead of at most once per 350ms during playback.
	const organizationHighlightSpecRaw = useMemo<OrgHighlightSpec | null>(() => {
		if (!selectedWikiOrganizationId) return null
		if (
			world?.isEarthImport &&
			earthHistory.query &&
			earthHistory.organizationReference
		) {
			const orgRef = earthHistory.organizationReference.get(
				selectedWikiOrganizationId,
			)
			if (!orgRef) return null
			const memberProvinceCompactIndexes = FRAME.orgMemberProvinces({
				frame: earthHistory.query.frame,
				orgId: orgRef.id,
			})
			if (memberProvinceCompactIndexes.size === 0) return null
			return {
				orgId: orgRef.id,
				name: orgRef.name,
				memberProvinceCompactIndexes,
			}
		}
		// Procedural counterpart: membership is static (carved once at
		// generation time), so this is just a straight scan rather than a
		// fold -- no per-scrub-tick recomputation needed, but kept in the same
		// memo/throttle path for consistency with the Earth branch. Reads
		// world.nations.assignment (raw array indices), NOT
		// worldForDisplay.nations.assignment (capital-province-id-keyed, see
		// buildDisplayWorld) -- see withOrgHighlight's matching comment above.
		if (!world?.nations?.organizations || !world.provinces) return null
		const org = world.nations.organizations.find(
			(o) => o.id === selectedWikiOrganizationId,
		)
		if (!org) return null
		const memberNations = new Set(org.members.map((m) => m.nationIndex))
		const memberProvinceCompactIndexes = new Set<number>()
		const { assignment } = world.nations
		const { count } = world.provinces
		for (let province = 0; province < count; province++) {
			if (memberNations.has(assignment[province])) {
				memberProvinceCompactIndexes.add(province)
			}
		}
		if (memberProvinceCompactIndexes.size === 0) return null
		return {
			orgId: org.id,
			name: getOrganizationName(org.id),
			memberProvinceCompactIndexes,
		}
	}, [
		selectedWikiOrganizationId,
		world,
		earthHistory.query,
		earthHistory.organizationReference,
		getOrganizationName,
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

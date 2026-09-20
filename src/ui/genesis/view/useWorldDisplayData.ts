import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { WIND } from "@/model/climate/weather/wind"
import {
	getHoverBiome,
	getHoverClimateDisplay,
	getHoverClimateZone,
	getHoverCoordinates,
	getHoverDistCoast,
	getHoverDistCoastKm,
	getHoverDtr,
	getHoverDtrDiff,
	getHoverElevationKm,
	getHoverHazards,
	getHoverHotspot,
	getHoverHumidity,
	getHoverHumidityDiff,
	getHoverIsLand,
	getHoverKoppenClimate,
	getHoverLandmark,
	getHoverLonLat,
	getHoverMisery,
	getHoverModeledCloudCover,
	getHoverOceanCurrents,
	getHoverOceanDist,
	getHoverPastaClimate,
	getHoverProvince,
	getHoverRainfall,
	getHoverRainfallDiff,
	getHoverRealCloudCover,
	getHoverRealDtr,
	getHoverRealHumidity,
	getHoverRealKoppenClimate,
	getHoverRealPastaClimate,
	getHoverRealRainfall,
	getHoverRealTemperature,
	getHoverRiver,
	getHoverTemperatureDelta,
	getHoverTemperatureDiff,
	getHoverTerrainFeature,
	getHoverTimezone,
	getHoverTopography,
	type HoverMisery,
} from "@/ui/genesis/hover/hover"
import { findEu4ProvinceForLonLat } from "@/ui/genesis/political/eu4-hover-province"
import {
	buildCultureLabelNames,
	buildHeritageLabelNames,
	buildNationDynastyLabelNames,
	buildNationLabelNames,
	buildReligionLabelNames,
	buildSettlementLabelNames,
} from "@/ui/genesis/shared/label-names"
import { getMapModePrimary } from "@/ui/genesis/shared/map-modes"
import { rgbToCss, windDirectionLabel } from "@/ui/genesis/shared/ui-format"
import {
	SCENE_REBUILD_THROTTLE_MS,
	useThrottledValue,
} from "@/ui/genesis/shared/useThrottledValue"
import { createDisplayNames } from "@/ui/genesis/view/display-names"
import type {
	WorldDisplayDataInput,
	WorldWindCache,
} from "@/ui/genesis/view/types"
/**
 * Derives everything the map surface and the hover InfoPanel display from the
 * current world: every hover readout, the world's display name lookups and
 * the playback-sampled label arrays built from them, and the shared wind
 * fields both depend on (per-region vectors plus a lazily-computed 12-month
 * series). Pure derivation -- the only state it owns is the monthly-wind
 * readiness flag.
 */
export function useWorldDisplayData(input: WorldDisplayDataInput) {
	const {
		sceneRef,
		world,
		worldForDisplay,
		hoverInfo,
		eu4HoverFillGeometry,
		colorMode,
		dataVariant,
		showWindArrows,
		resolvedClimateMonth,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
	} = input

	// A single Model/Observed/Diff radio drives every observed-vs-model
	// overlay (color mode variants, wind, ocean currents) instead of each
	// having its own toggle.
	const showRealWind = dataVariant === "observed"
	const windCacheRef = useRef<WorldWindCache>({
		world: null,
		vectors: new Map(),
		monthly: new Map(),
	})
	if (windCacheRef.current.world !== world) {
		windCacheRef.current = {
			world,
			vectors: new Map(),
			monthly: new Map(),
		}
	}

	const hoverElevationKm = getHoverElevationKm(hoverInfo, worldForDisplay)
	const hoverTopography = getHoverTopography(hoverInfo, worldForDisplay)
	const hoverCoordinates = useMemo(
		() => getHoverCoordinates(hoverInfo, worldForDisplay),
		[hoverInfo, worldForDisplay],
	)
	const hoverTimezone = useMemo(
		() => getHoverTimezone(hoverInfo, worldForDisplay),
		[hoverInfo, worldForDisplay],
	)
	const hoverTemperatureDelta = getHoverTemperatureDelta(
		hoverInfo,
		worldForDisplay,
	)
	const hoverRainfall = getHoverRainfall(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverRealRainfall = getHoverRealRainfall(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverRealCloudCover = getHoverRealCloudCover(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverCloudCover = getHoverModeledCloudCover({
		hoverInfo,
		world: worldForDisplay,
		rainfallMonth,
	})
	const hoverRainfallDiff = getHoverRainfallDiff(
		hoverInfo,
		worldForDisplay,
		rainfallMonth,
	)
	const hoverDtr = getHoverDtr(hoverInfo, worldForDisplay, dtrMonth)
	const hoverRealDtr = getHoverRealDtr(hoverInfo, worldForDisplay, dtrMonth)
	const hoverDtrDiff = getHoverDtrDiff(hoverInfo, worldForDisplay, dtrMonth)
	const hoverHumidity = getHoverHumidity(hoverInfo, worldForDisplay, dtrMonth)
	const hoverRealHumidity = getHoverRealHumidity(
		hoverInfo,
		worldForDisplay,
		dtrMonth,
	)
	const hoverHumidityDiff = getHoverHumidityDiff(
		hoverInfo,
		worldForDisplay,
		dtrMonth,
	)
	const hoverRealTemperature = getHoverRealTemperature(
		hoverInfo,
		worldForDisplay,
		temperatureMonth,
	)
	const hoverTemperatureDiff = getHoverTemperatureDiff(
		hoverInfo,
		worldForDisplay,
		temperatureMonth,
	)
	const hoverClimateZone = getHoverClimateZone(
		hoverInfo,
		worldForDisplay,
		colorMode,
	)
	const hoverPastaClimate = getHoverPastaClimate(hoverInfo, worldForDisplay)
	const hoverKoppenClimate = getHoverKoppenClimate(hoverInfo, worldForDisplay)
	const hoverRealPastaClimate = getHoverRealPastaClimate(
		hoverInfo,
		worldForDisplay,
	)
	const hoverRealKoppenClimate = getHoverRealKoppenClimate(
		hoverInfo,
		worldForDisplay,
	)
	const hoverBiome = getHoverBiome(hoverInfo, worldForDisplay, colorMode)
	const earthImportRawIdToCompact = useMemo(() => {
		const realIds = worldForDisplay?.provinces?.realIds
		if (!realIds) return null
		const map = new Map<number, number>()
		for (let idx = 0; idx < realIds.length; idx++) {
			map.set(realIds[idx], idx)
		}
		return map
	}, [worldForDisplay?.provinces?.realIds])
	const hoverProvince = useMemo(() => {
		const fallbackProvince = getHoverProvince(hoverInfo, worldForDisplay)
		if (
			!hoverInfo ||
			!worldForDisplay?.isEarthImport ||
			!worldForDisplay.provinces?.realIds ||
			!earthImportRawIdToCompact ||
			!eu4HoverFillGeometry
		) {
			return fallbackProvince
		}
		const lonLat = getHoverLonLat(hoverInfo, worldForDisplay)
		if (!lonLat) return fallbackProvince
		const rawProvinceId = findEu4ProvinceForLonLat(
			eu4HoverFillGeometry,
			lonLat.lonDeg,
			lonLat.latDeg,
		)
		if (rawProvinceId === null) return fallbackProvince
		return earthImportRawIdToCompact.get(rawProvinceId) ?? fallbackProvince
	}, [
		earthImportRawIdToCompact,
		eu4HoverFillGeometry,
		hoverInfo,
		worldForDisplay,
	])
	const hoverLandmark = getHoverLandmark(hoverInfo, worldForDisplay)
	const hoverIsLand = getHoverIsLand(hoverInfo, worldForDisplay)
	const hoverOceanDist = getHoverOceanDist(hoverInfo, worldForDisplay)
	const hoverDistCoast = getHoverDistCoast(hoverInfo, worldForDisplay)
	const hoverHazards = getHoverHazards(hoverInfo, worldForDisplay)
	const hoverHotspot = getHoverHotspot(hoverInfo, worldForDisplay)
	const hoverRiver = getHoverRiver(hoverInfo, worldForDisplay)
	const hoverTerrainFeature = getHoverTerrainFeature(hoverInfo, worldForDisplay)
	const hoverOceanCurrents = getHoverOceanCurrents(hoverInfo, worldForDisplay)
	const worldNames = useMemo(
		() => (world ? createDisplayNames(world) : null),
		[world],
	)
	const nationLabelsArray = useMemo(() => {
		return buildNationLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const dynastyLabelsArray = useMemo(() => {
		return buildNationDynastyLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const settlementLabelsArray = useMemo(() => {
		return buildSettlementLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const cultureLabelsArray = useMemo(() => {
		return buildCultureLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const heritageLabelsArray = useMemo(() => {
		return buildHeritageLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const religionLabelsArray = useMemo(() => {
		return buildReligionLabelNames(worldForDisplay, worldNames)
	}, [worldForDisplay, worldNames])
	const sampledNationLabelsArray = useThrottledValue({
		value: nationLabelsArray,
		intervalMs: SCENE_REBUILD_THROTTLE_MS,
		resetKey: worldForDisplay?.mesh ?? null,
	})
	const sampledDynastyLabelsArray = useThrottledValue({
		value: dynastyLabelsArray,
		intervalMs: SCENE_REBUILD_THROTTLE_MS,
		resetKey: worldForDisplay?.mesh ?? null,
	})
	const sampledSettlementLabelsArray = useThrottledValue({
		value: settlementLabelsArray,
		intervalMs: SCENE_REBUILD_THROTTLE_MS,
		resetKey: worldForDisplay?.mesh ?? null,
	})
	const sampledCultureLabelsArray = useThrottledValue({
		value: cultureLabelsArray,
		intervalMs: SCENE_REBUILD_THROTTLE_MS,
		resetKey: worldForDisplay?.mesh ?? null,
	})
	const sampledHeritageLabelsArray = useThrottledValue({
		value: heritageLabelsArray,
		intervalMs: SCENE_REBUILD_THROTTLE_MS,
		resetKey: worldForDisplay?.mesh ?? null,
	})
	const sampledReligionLabelsArray = useThrottledValue({
		value: religionLabelsArray,
		intervalMs: SCENE_REBUILD_THROTTLE_MS,
		resetKey: worldForDisplay?.mesh ?? null,
	})
	const getProvinceName = useCallback(
		(provinceId: number) =>
			worldNames?.province(provinceId) ?? `Province #${provinceId}`,
		[worldNames],
	)
	const getCultureName = useCallback(
		(cultureId: number) =>
			worldNames?.culture(cultureId) ?? `Culture #${cultureId}`,
		[worldNames],
	)
	const getHeritageName = useCallback(
		(heritageId: number) =>
			worldNames?.heritage(heritageId) ?? `Heritage #${heritageId}`,
		[worldNames],
	)
	const getReligionName = useCallback(
		(religionId: number) =>
			worldNames?.religion(religionId) ?? `Religion #${religionId}`,
		[worldNames],
	)
	const getLeaderName = useCallback(
		(nationId: number, timeMs: number) =>
			worldNames?.leader(nationId, timeMs) ?? `Leader #${nationId}`,
		[worldNames],
	)
	const getDynastyName = useCallback(
		(dynastyId: number) =>
			worldNames?.dynasty({ dynastyIdx: dynastyId, province: -1 }) ??
			`Dynasty #${dynastyId}`,
		[worldNames],
	)
	const getLandmarkName = useCallback(
		(landmarkId: number) =>
			worldNames?.landmark(landmarkId) ?? `#${landmarkId}`,
		[worldNames],
	)
	const getRiverName = useCallback(
		(riverId: number) => worldNames?.river(riverId) ?? `#${riverId}`,
		[worldNames],
	)
	const getOrganizationName = useCallback(
		(orgId: string) => worldNames?.organization(orgId) ?? orgId,
		[worldNames],
	)
	const getProvinceColor = useCallback(
		(provinceId: number) => {
			if (
				!worldForDisplay?.provinces?.colors ||
				provinceId < 0 ||
				provinceId * 3 + 2 >= worldForDisplay.provinces.colors.length
			) {
				return null
			}
			return rgbToCss([
				worldForDisplay.provinces.colors[provinceId * 3],
				worldForDisplay.provinces.colors[provinceId * 3 + 1],
				worldForDisplay.provinces.colors[provinceId * 3 + 2],
			])
		},
		[worldForDisplay],
	)
	const hoverDistCoastKm = getHoverDistCoastKm(hoverDistCoast)
	// Occupation came from the procedural sim's active wars, which no longer
	// exist; Earth import surfaces its own occupation overlay separately.
	const hoverOccupation: {
		id: number
		name: string
		color: string
		rebel: boolean
	} | null = null
	const hoverIceSummary = (() => {
		if (!(hoverInfo && worldForDisplay)) return null
		const r = hoverInfo.region
		const iceThickness = worldForDisplay.iceThickness?.[r] ?? 0
		const iceMin = worldForDisplay.iceMinMonthly?.[r] ?? 0
		const iceMax = worldForDisplay.iceMaxMonthly?.[r] ?? 0
		if (iceThickness <= 0 && iceMax <= 0) return null
		return `${(iceThickness / 1000).toFixed(2)} m (${(iceMin / 1000).toFixed(2)}-${(iceMax / 1000).toFixed(2)})`
	})()
	const hoverClimateDisplay = getHoverClimateDisplay({
		colorMode,
		hoverPastaClimate,
		hoverKoppenClimate,
		hoverClimateZone,
		hoverRealPastaClimate,
		hoverRealKoppenClimate,
	})

	// Shared wind computation — runs when wind arrows or wind color mode is active
	const windVectors = useMemo(() => {
		if (
			!world?.climate ||
			(!showWindArrows &&
				colorMode !== "wind" &&
				colorMode !== "misery" &&
				colorMode !== "realMisery")
		)
			return null
		const month =
			resolvedClimateMonth > 0 ? resolvedClimateMonth - 1 : undefined
		const source = showRealWind ? "observed" : "generated"
		const cacheKey = `${source}:${month ?? "annual"}`
		const cached = windCacheRef.current.vectors.get(cacheKey)
		if (cached) return cached
		const vectors = showRealWind
			? WIND.observedWindVectorsForMonth({
					observedWind: world.observedWind,
					numRegions: world.mesh.numRegions,
					month,
				})
			: month === undefined
				? world.wind
				: WIND.computeWindVectors({
						mesh: world.mesh,
						climate: world.climate,
						elevation_km: world.elevation_km,
						params: world.params,
						month,
						surface: {
							vegetation: world.vegetation,
							topography: world.topography,
							slopeScore: world.slopeScore,
							oceanDist: world.oceanDist,
						},
					})
		windCacheRef.current.vectors.set(cacheKey, vectors)
		return vectors
	}, [world, showWindArrows, showRealWind, colorMode, resolvedClimateMonth])

	// Monthly wind: computed lazily across setTimeout ticks when wind is active
	const monthlyWindRef = useRef<
		Array<{ windU: Float32Array; windV: Float32Array; windSpeed: Float32Array }>
	>([])
	const [monthlyWindReady, setMonthlyWindReady] = useState(false)
	const windActive =
		showWindArrows ||
		colorMode === "wind" ||
		getMapModePrimary(colorMode) === "geography"
	useEffect(() => {
		if (!world?.climate || !windActive) {
			monthlyWindRef.current = []
			setMonthlyWindReady(false)
			return
		}
		const source = showRealWind ? "observed" : "generated"
		const cached = windCacheRef.current.monthly.get(source)
		if (cached) {
			monthlyWindRef.current = cached
			setMonthlyWindReady(true)
			return
		}
		if (showRealWind) {
			const numRegions = world.mesh.numRegions
			const monthly = Array.from({ length: 12 }, (_, m) =>
				WIND.observedWindVectorsForMonth({
					observedWind: world.observedWind,
					numRegions,
					month: m,
				}),
			)
			windCacheRef.current.monthly.set(source, monthly)
			monthlyWindRef.current = monthly
			setMonthlyWindReady(true)
			return
		}
		const results: typeof monthlyWindRef.current = []
		setMonthlyWindReady(false)
		let m = 0
		let cancelled = false
		const tick = () => {
			if (cancelled) return
			if (m >= 12) {
				windCacheRef.current.monthly.set(source, results)
				monthlyWindRef.current = results
				setMonthlyWindReady(true)
				return
			}
			results.push(
				WIND.computeWindVectors({
					mesh: world.mesh,
					climate: world.climate,
					elevation_km: world.elevation_km,
					params: world.params,
					month: m++,
					surface: {
						vegetation: world.vegetation,
						topography: world.topography,
						slopeScore: world.slopeScore,
						oceanDist: world.oceanDist,
					},
				}),
			)
			setTimeout(tick, 0)
		}
		setTimeout(tick, 0)
		return () => {
			cancelled = true
			setMonthlyWindReady(false)
		}
	}, [world, windActive, showRealWind])

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const projectToScreen = useCallback(
		(xyz: [number, number, number], lonOffsetRad?: number) =>
			sceneRef.current?.projectToScreen(xyz, lonOffsetRad) ?? null,
		[],
	)
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const getGlobeCameraDir = useCallback(
		() => sceneRef.current?.getGlobeCameraDir() ?? null,
		[],
	)

	const hoverWindSpeed =
		hoverInfo && windVectors ? windVectors.windSpeed[hoverInfo.region] : null
	const hoverWindDir =
		hoverInfo && windVectors
			? windDirectionLabel(
					windVectors.windU[hoverInfo.region],
					windVectors.windV[hoverInfo.region],
				)
			: null
	const hoverWindMonthly = useMemo(() => {
		if (!hoverInfo || !monthlyWindReady || monthlyWindRef.current.length < 12)
			return null
		const r = hoverInfo.region
		return monthlyWindRef.current.map((wv) => ({
			speedMs: wv.windSpeed[r],
			dir: windDirectionLabel(wv.windU[r], wv.windV[r]),
		}))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hoverInfo?.region, monthlyWindReady, hoverInfo])

	const hoverMisery: HoverMisery | null = getHoverMisery({
		hoverInfo,
		world: worldForDisplay,
		dtrMonth,
		windSpeedMs: hoverWindSpeed,
		monthlyWindSpeedMs: hoverWindMonthly?.map((w) => w.speedMs) ?? null,
		useObserved: colorMode === "realMisery",
	})

	return {
		getCultureName,
		getDynastyName,
		getGlobeCameraDir,
		getHeritageName,
		getReligionName,
		getLandmarkName,
		getLeaderName,
		getOrganizationName,
		getProvinceColor,
		getProvinceName,
		getRiverName,
		hoverBiome,
		hoverClimateDisplay,
		hoverCloudCover,
		hoverCoordinates,
		hoverDistCoast,
		hoverDistCoastKm,
		hoverDtr,
		hoverDtrDiff,
		hoverElevationKm,
		hoverHazards,
		hoverHotspot,
		hoverHumidity,
		hoverHumidityDiff,
		hoverIceSummary,
		hoverIsLand,
		hoverLandmark,
		hoverMisery,
		hoverOccupation,
		hoverOceanCurrents,
		hoverOceanDist,
		hoverProvince,
		hoverRainfall,
		hoverRainfallDiff,
		hoverRealDtr,
		hoverRealCloudCover,
		hoverRealHumidity,
		hoverRealRainfall,
		hoverRealTemperature,
		hoverRiver,
		hoverTemperatureDelta,
		hoverTemperatureDiff,
		hoverTerrainFeature,
		hoverTimezone,
		hoverTopography,
		hoverWindDir,
		hoverWindMonthly,
		hoverWindSpeed,
		projectToScreen,
		sampledCultureLabelsArray,
		sampledDynastyLabelsArray,
		sampledHeritageLabelsArray,
		sampledReligionLabelsArray,
		sampledNationLabelsArray,
		sampledSettlementLabelsArray,
		windVectors,
	}
}

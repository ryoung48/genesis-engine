import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { WIND } from "@/model/climate/wind"
import type { WorldDisplayDataInput } from "@/ui/planet/GenesisView/types"
import { usePlaybackSampledValue } from "@/ui/planet/hooks/usePlaybackSampledValue"
import { findEu4ProvinceForLonLat } from "@/ui/planet/hover/eu4-hover-province"
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
	getHoverOceanCurrents,
	getHoverOceanDist,
	getHoverPastaClimate,
	getHoverProvince,
	getHoverRainfall,
	getHoverRainfallDiff,
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
} from "@/ui/planet/hover/hover"
import { createDisplayNames } from "@/ui/planet/screen/display/display-names"
import {
	buildCultureLabelNames,
	buildHeritageLabelNames,
	buildNationDynastyLabelNames,
	buildNationLabelNames,
	buildSettlementLabelNames,
} from "@/ui/planet/screen/display/label-names"
import { getMapModePrimary } from "@/ui/planet/screen/shared/map-modes"
import {
	rgbToCss,
	windDirectionLabel,
} from "@/ui/planet/screen/shared/ui-format"
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
		nationModel,
		colorMode,
		dataVariant,
		showWindArrows,
		showRealWind,
		resolvedClimateMonth,
		temperatureMonth,
		rainfallMonth,
		dtrMonth,
		earthHistoryPlaying,
	} = input

	const hoverElevationKm = getHoverElevationKm(hoverInfo, worldForDisplay)
	const hoverTopography = getHoverTopography(
		hoverInfo,
		worldForDisplay,
		dataVariant,
	)
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
		dataVariant,
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
	const hoverBiome = getHoverBiome(hoverInfo, worldForDisplay, dataVariant)
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
	const hoverNationId = useMemo(() => {
		const assignment = nationModel?.assignment
		if (hoverProvince === null || hoverProvince < 0 || !assignment) return null
		return assignment[hoverProvince] ?? null
	}, [nationModel, hoverProvince])
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
	const labelsPlaybackActive = earthHistoryPlaying
	const sampledNationLabelsArray = usePlaybackSampledValue(
		nationLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledDynastyLabelsArray = usePlaybackSampledValue(
		dynastyLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledSettlementLabelsArray = usePlaybackSampledValue(
		settlementLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledCultureLabelsArray = usePlaybackSampledValue(
		cultureLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const sampledHeritageLabelsArray = usePlaybackSampledValue(
		heritageLabelsArray,
		350,
		labelsPlaybackActive,
	)
	const getNationName = useCallback(
		(nationId: number) => worldNames?.nation(nationId) ?? `#${nationId}`,
		[worldNames],
	)
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
	const getLeaderName = useCallback(
		(nationId: number, timeMs: number) =>
			worldNames?.leader(nationId, timeMs) ?? `Leader #${nationId}`,
		[worldNames],
	)
	const getDynastyName = useCallback(
		(dynastyId: number) =>
			worldNames?.dynasty(dynastyId) ?? `Dynasty #${dynastyId}`,
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
		if (showRealWind) {
			return WIND.observedWindVectorsForMonth({
				observedWind: world.observedWind,
				numRegions: world.mesh.numRegions,
				month,
			})
		}
		return WIND.computeWindVectors({
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
		if (showRealWind) {
			const numRegions = world.mesh.numRegions
			monthlyWindRef.current = Array.from({ length: 12 }, (_, m) =>
				WIND.observedWindVectorsForMonth({
					observedWind: world.observedWind,
					numRegions,
					month: m,
				}),
			)
			setMonthlyWindReady(true)
			return
		}
		const results: typeof monthlyWindRef.current = []
		setMonthlyWindReady(false)
		let m = 0
		const tick = () => {
			if (m >= 12) {
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
		earthImportRawIdToCompact,
		getCultureName,
		getDynastyName,
		getGlobeCameraDir,
		getHeritageName,
		getLandmarkName,
		getLeaderName,
		getNationName,
		getProvinceColor,
		getProvinceName,
		getRiverName,
		hoverBiome,
		hoverClimateDisplay,
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
		hoverNationId,
		hoverOccupation,
		hoverOceanCurrents,
		hoverOceanDist,
		hoverProvince,
		hoverRainfall,
		hoverRainfallDiff,
		hoverRealDtr,
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
		labelsPlaybackActive,
		projectToScreen,
		sampledCultureLabelsArray,
		sampledDynastyLabelsArray,
		sampledHeritageLabelsArray,
		sampledNationLabelsArray,
		sampledSettlementLabelsArray,
		windVectors,
	}
}

import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { TEXT } from "@/model/shared/text"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { SerializedRoutes } from "@/model/society/infrastructure/transport/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { windSpeedColor } from "@/ui/planet/colors"
import type { HoverLandmark } from "@/ui/planet/hover/hover"

export function buildSummary(
	value: number | undefined,
	options: {
		prefix?: string
		unit?: string
		formatValue?: (value: number) => string
	},
): string | undefined {
	if (value === undefined) return undefined

	const prefix = options.prefix?.trim()
	const formatted = options.formatValue
		? options.formatValue(value)
		: `${value}`
	const unit = options.unit?.trim()

	return [prefix, formatted, unit].filter(Boolean).join(" ")
}

export function computeLakeAverageAnnualPrecipitation(
	hoverLandmark: HoverLandmark | null,
	world: SerializedGenesisWorld | null,
): number | null {
	if (
		hoverLandmark?.type !== "lake" ||
		!world?.rainfall?.annual ||
		!world.landmarks?.regionLandmark
	) {
		return null
	}

	let sum = 0
	let count = 0
	for (let region = 0; region < world.mesh.numRegions; region++) {
		if (world.landmarks.regionLandmark[region] !== hoverLandmark.id) continue
		sum += world.rainfall.annual[region] ?? 0
		count++
	}

	return count > 0 ? sum / count : null
}

export function buildHoverRouteLabel(
	hoverRegion: number | null,
	routes: SerializedRoutes | null,
): string | null {
	if (hoverRegion === null || !routes) return null
	let hasImperialRoute = false
	let hasMinorRoute = false
	let hasSeaRoute = false
	TRANSPORT.forEachRoute({
		routes,
		callback: (route) => {
			if (!route.pathRegions.includes(hoverRegion)) return
			if (route.kind === TRANSPORT.ROUTE_SEA) {
				hasSeaRoute = true
			} else if (route.kind === TRANSPORT.ROUTE_LAND_MAJOR) {
				hasImperialRoute = true
			} else if (route.kind === TRANSPORT.ROUTE_LAND_MINOR) {
				hasMinorRoute = true
			}
		},
	})
	const labels: string[] = []
	if (hasImperialRoute) labels.push("Major")
	if (hasMinorRoute) labels.push("Minor")
	if (hasSeaRoute) labels.push("Sea")
	return labels.length > 0 ? labels.join(" / ") : null
}

export function buildHoverPortLabel(
	hoverProvince: number | null,
	world: SerializedGenesisWorld | null,
	getLandmarkName: (landmarkId: number) => string,
): string | null {
	if (
		hoverProvince === null ||
		hoverProvince < 0 ||
		!world?.settlementWaterLandmarks ||
		hoverProvince >= world.settlementWaterLandmarks.length
	) {
		return null
	}
	const landmarkId = world.settlementWaterLandmarks[hoverProvince]
	if (landmarkId < 0) return null
	const landmarkTypeCode = world.landmarks?.type?.[landmarkId]
	const landmarkType =
		typeof landmarkTypeCode === "number"
			? TEXT.titleCase(
					LANDMARKS.landmarkTypes[landmarkTypeCode] ?? "water body",
				)
			: "Water Body"
	return `${getLandmarkName(landmarkId)} (${landmarkType})`
}

export function windSpeedColorCss(speed: number): string {
	const [r, g, b] = windSpeedColor(speed)
	return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
}

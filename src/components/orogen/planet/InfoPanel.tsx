import React from "react"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import {
	climateTempColor,
	climateZoneColor,
	dangerColor,
	type ColorMode,
	vegetationColor,
} from "../colors"
import { DAYLIGHT } from "@/model/cells/daylight"
import { koppenClimateColor, koppenTrueColor } from "@/model/orogen/climate/koppen"
import { pastaClimateColor, pastaTrueColor } from "@/model/orogen/climate/pasta"
import type { PlanetStat } from "./planet-stats"
import type { HoverHazards, HoverHotspot, HoverInfo, HoverLandmark, HoverRiver, HoverTerrainFeature, HoverWind } from "./hover"
import { monthLabels } from "./constants"
import { OROGEN_TERRAIN_FEATURE_LABELS } from "@/model/orogen/types"
import { getTerrainFeatureColor, getTopographyColor } from "./region-colors"

const MONTH_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

function MiniBarChart({
	values,
	label,
	unit,
	colorFn,
	globalMonth,
	annualValue,
	annualDigits = 0,
	formatValue,
}: {
	values: number[]
	label: string
	unit: string
	colorFn: (v: number, i: number) => string
	globalMonth: number
	annualValue?: number
	annualDigits?: number
	formatValue?: (v: number) => string
}) {
	const max = Math.max(...values.map(Math.abs), 0.001)
	const min = Math.min(...values, 0)
	const hasNeg = min < 0
	const range = hasNeg ? max - min : max
	const zeroY = hasNeg ? max / range : 1

	return (
		<div>
			<div className="mb-0.5 flex items-baseline justify-between">
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">{label}</span>
				<span className="font-mono text-[9px] text-slate-500">
					{(formatValue ? formatValue(values[globalMonth - 1] ?? 0) : values[globalMonth - 1]?.toFixed(label === "Temp" ? 1 : 0))} {unit}
					{annualValue !== undefined ? ` · ann ${formatValue ? formatValue(annualValue) : annualValue.toFixed(annualDigits)} ${unit}` : ""}
				</span>
			</div>
			<div className="relative flex h-[28px] gap-px">
				{hasNeg && (
					<div
						className="absolute left-0 right-0 border-t border-slate-500/30"
						style={{ top: `${zeroY * 100}%` }}
					/>
				)}
				{values.map((v, i) => {
					const barH = Math.abs(v) / range
					const isSelected = i === globalMonth - 1
					return (
						<div
							key={i}
							className="relative h-full flex-1"
							title={`${monthLabels[i + 1]}: ${formatValue ? formatValue(v) : v.toFixed(label === "Temp" ? 1 : 0)} ${unit}`}
						>
							{v >= 0 ? (
								<div
									className={`absolute left-0 right-0 rounded-t-[1px] transition-all ${isSelected ? "opacity-100" : "opacity-70"}`}
									style={{
										height: `${barH * zeroY * 100}%`,
										bottom: `${(1 - zeroY) * 100}%`,
										backgroundColor: colorFn(v, i),
									}}
								/>
							) : (
								<div
									className={`absolute left-0 right-0 rounded-b-[1px] transition-all ${isSelected ? "opacity-100" : "opacity-70"}`}
									style={{
										height: `${barH * (1 - zeroY) * 100}%`,
										top: `${zeroY * 100}%`,
										backgroundColor: colorFn(v, i),
									}}
								/>
							)}
						</div>
					)
				})}
			</div>
			<div className="mt-px flex gap-px">
				{MONTH_SHORT.map((m, i) => (
					<span
						key={i}
						className={`flex-1 text-center text-[7px] leading-none ${i === globalMonth - 1 ? "font-bold text-slate-200" : "text-slate-600"}`}
					>
						{m}
					</span>
				))}
			</div>
		</div>
	)
}

function tempColor(v: number): string {
	if (v < -20) return "#6366f1"
	if (v < -5) return "#818cf8"
	if (v < 0) return "#93c5fd"
	if (v < 10) return "#67e8f9"
	if (v < 20) return "#fbbf24"
	if (v < 30) return "#f97316"
	return "#ef4444"
}

function rainColor(v: number): string {
	if (v < 10) return "#a16207"
	if (v < 30) return "#65a30d"
	if (v < 80) return "#059669"
	if (v < 150) return "#0891b2"
	return "#2563eb"
}

function flowColor(v: number): string {
	if (v < 1) return "#64748b"
	if (v < 10) return "#7dd3fc"
	if (v < 100) return "#38bdf8"
	if (v < 1000) return "#0284c7"
	return "#1d4ed8"
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between">
			<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">{label}</span>
			<span className="font-mono text-[10px] text-slate-100">{value}</span>
		</div>
	)
}

function SwatchRow({ label, value, color }: { label: string; value: string; color: string | null }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">{label}</span>
			<span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-100">
				{color && <span className="h-2 w-2 border border-white/15" style={{ backgroundColor: color }} />}
				<span>{value}</span>
			</span>
		</div>
	)
}

function MultiSwatchRow({ label, values }: { label: string; values: Array<{ label: string; color: string | null }> }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">{label}</span>
			<span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 font-mono text-[10px] text-slate-100">
				{values.map((value, index) => (
					<React.Fragment key={`${value.label}-${index}`}>
						<span className="inline-flex items-center gap-1.5">
							{value.color && <span className="h-2 w-2 border border-white/15" style={{ backgroundColor: value.color }} />}
							<span>{value.label}</span>
						</span>
						{index < values.length - 1 && <span className="text-slate-500">,</span>}
					</React.Fragment>
				))}
			</span>
		</div>
	)
}

function rgbToCss([r, g, b]: [number, number, number]): string {
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

function formatCompactNumber(value: number): string {
	if (!Number.isFinite(value)) return "0"
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
	if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`
	return value
		.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)
		.replace(/\.0+$/, "")
		.replace(/(\.\d*[1-9])0+$/, "$1")
}

function hasDisplayValue(value: string): boolean {
	const trimmed = value.trim()
	return trimmed !== "" && trimmed !== "-" && trimmed !== "—" && trimmed !== "–"
}

interface InfoPanelProps {
	hoverInfo: HoverInfo | null
	hoverElevationKm: number | null
	hoverTopography: string | null
	hoverCoordinates: string | null
	hoverLandmark: HoverLandmark | null
	hoverIsLand: boolean | null
	hoverTemperature: number | null
	hoverBiotemperature: number | null
	hoverTemperatureDelta: number | null
	hoverRainfall: number | null
	hoverClimateDisplay: string | null
	hoverIceDebug: string | null
	hoverIceSummary: string | null
	hoverBiome: string | null
	hoverProvince: number | null
	hoverBasinId: number | null
	hoverOceanDist: number | null
	hoverDistCoast: number | null
	hoverDistCoastKm: number | null
	hoverWind: HoverWind | null
	hoverHazards: HoverHazards | null
	hoverHotspot: HoverHotspot | null
	hoverRiver: HoverRiver | null
	hoverTerrainFeature: HoverTerrainFeature | null
	showPastaDebug: boolean
	colorMode: ColorMode
	isClimateMode: boolean
	isSatelliteMode: boolean
	isWindMode: boolean
	tempAnnual: boolean
	rainAnnual: boolean
	windAnnual: boolean
	globalMonth: number
	world: SerializedOrogenWorld | null
	hoverCardRef: React.RefObject<HTMLDivElement | null>
}

export const GlobalInfoPanel: React.FC<{ planetStats: PlanetStat[] }> = ({ planetStats }) => {
	const visibleStats = planetStats.filter((stat) => hasDisplayValue(stat.value))

	return (
		<div className="pointer-events-auto absolute top-3 left-3 z-20 w-64 rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
			<div className="space-y-0.5">
				{visibleStats.map((stat) => (
					<Row key={stat.label} label={stat.label} value={stat.value} />
				))}
			</div>
		</div>
	)
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
	hoverInfo,
	hoverElevationKm,
	hoverTopography,
	hoverCoordinates,
	hoverLandmark,
	hoverBiotemperature,
	hoverTemperatureDelta,
	hoverClimateDisplay,
	hoverIceDebug,
	hoverIceSummary,
	hoverBiome,
	hoverProvince,
	hoverBasinId,
	hoverOceanDist,
	hoverDistCoast,
	hoverDistCoastKm,
	hoverWind,
	hoverHazards,
	hoverRiver,
	hoverTerrainFeature,
	showPastaDebug,
	colorMode,
	isWindMode,
	windAnnual,
	globalMonth,
	world,
	hoverCardRef,
}) => {
	const chartData = (() => {
		if (!hoverInfo || hoverElevationKm === null || !world) return null
		const r = hoverInfo.region
		const N = world.mesh.numRegions
		const temps: number[] = []
		const precip: number[] = []
		const daylight: number[] = []
		for (let m = 0; m < 12; m++) {
			temps.push(world.climate ? world.climate.temperature_monthly[m * N + r] : 0)
			precip.push(world.rainfall ? world.rainfall.monthly[m * N + r] : 0)
			daylight.push(world.climate?.daylight_hours_monthly ? world.climate.daylight_hours_monthly[m * N + r] : 0)
		}
		const isLand = world.isLand?.[r]
		const iceThickness = world.iceThickness?.[r] ?? 0
		const iceMin = world.iceMinMonthly?.[r] ?? 0
		const iceMax = world.iceMaxMonthly?.[r] ?? 0
		return { temps, precip, daylight, isLand, iceThickness, iceMin, iceMax }
	})()

	const hoverRegion = hoverInfo?.region ?? null
	const landmarkShare =
		hoverLandmark?.size != null && world?.mesh.numRegions
			? (hoverLandmark.size / world.mesh.numRegions) * 100
			: null
	const annualTemp =
		chartData ? chartData.temps.reduce((sum, value) => sum + value, 0) / chartData.temps.length : null
	const annualPrecip = chartData ? chartData.precip.reduce((sum, value) => sum + value, 0) : null
	const climateColor =
		hoverRegion === null || !world
			? null
			: colorMode === "pastaClimate" && world.pastaClimate
				? rgbToCss(pastaClimateColor(world.pastaClimate[hoverRegion]))
				: colorMode === "satellite" && world.pastaClimate
					? rgbToCss(pastaTrueColor(world.pastaClimate[hoverRegion]))
					: colorMode === "koppenClimate" && world.koppenClimate
						? rgbToCss(koppenClimateColor(world.koppenClimate[hoverRegion]))
						: colorMode === "satelliteKoppen" && world.koppenClimate
							? rgbToCss(koppenTrueColor(world.koppenClimate[hoverRegion]))
							: world.climateZones
								? rgbToCss(
									colorMode === "climate" && world.climate
										? climateTempColor(world.climate.temperature_avg[hoverRegion])
										: climateZoneColor(world.climateZones[hoverRegion]),
								)
								: null
	const vegetationSwatch =
		hoverRegion !== null && world?.vegetation ? rgbToCss(vegetationColor(world.vegetation[hoverRegion])) : null
	const topographySwatch =
		hoverRegion !== null && world?.topography ? (() => {
			const color = getTopographyColor(world.topography[hoverRegion])
			return color ? rgbToCss(color) : null
		})() : null
	const terrainFeatureSwatches = hoverTerrainFeature
		? Array.from(new Set([
			hoverTerrainFeature.dominant,
			...hoverTerrainFeature.all,
		].filter((feature): feature is string => Boolean(feature)))).map((feature) => {
			const featureIndex = OROGEN_TERRAIN_FEATURE_LABELS.indexOf(feature as typeof OROGEN_TERRAIN_FEATURE_LABELS[number])
			const featureColor = featureIndex >= 0 ? getTerrainFeatureColor(featureIndex) : null
			return {
				label: feature,
				color: featureColor ? rgbToCss(featureColor) : null,
			}
		})
		: []
	const slopeScoreByRegion = world?.slopeScore ?? null
	const hoverSlopePercent =
		hoverRegion !== null && slopeScoreByRegion ? slopeScoreByRegion[hoverRegion] * 100 : null

	if (showPastaDebug) {
		return (
			<div className="pointer-events-auto absolute top-3 left-3 z-20 w-64 rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
				<div ref={hoverCardRef} className="space-y-0.5">
					{hoverCoordinates && <Row label="Coords" value={hoverCoordinates} />}
					{hoverClimateDisplay && <SwatchRow label="Climate" value={hoverClimateDisplay} color={climateColor} />}
					{hoverRegion !== null && world?.pastaDebug && (
						<>
							<Row label="GDD" value={world.pastaDebug.gdd[hoverRegion].toFixed(0)} />
							<Row label="GDDz" value={world.pastaDebug.gddz[hoverRegion].toFixed(0)} />
							<Row label="GInt" value={world.pastaDebug.gint[hoverRegion] >= 99999 ? "∞" : world.pastaDebug.gint[hoverRegion].toFixed(0)} />
							<Row label="AR" value={world.pastaDebug.ar[hoverRegion].toFixed(3)} />
							<Row label="GAR" value={world.pastaDebug.gar[hoverRegion].toFixed(3)} />
							<Row label="GrS" value={world.pastaDebug.grs[hoverRegion].toFixed(3)} />
							<Row label="EvR" value={world.pastaDebug.evr[hoverRegion].toFixed(3)} />
							<Row label="MinT" value={`${world.pastaDebug.minT[hoverRegion].toFixed(1)} °C`} />
							<Row label="MaxT" value={`${world.pastaDebug.maxT[hoverRegion].toFixed(1)} °C`} />
						</>
					)}
				</div>
			</div>
		)
	}

	return (
		<div className="pointer-events-auto absolute top-3 left-3 z-20 w-64 rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
			<div ref={hoverCardRef} className="space-y-0.5">
					{hoverCoordinates && <Row label="Coords" value={hoverCoordinates} />}
					<Row label="Elev" value={`${hoverElevationKm.toFixed(2)} km${hoverSlopePercent !== null ? ` (${hoverSlopePercent.toFixed(1)}%)` : ""}`} />
					{hoverLandmark && (
						<Row
							label="Landmark"
							value={`${hoverLandmark.type ?? "unknown"} #${hoverLandmark.id}${landmarkShare !== null ? ` (${landmarkShare.toFixed(1)}%)` : ""}`}
						/>
					)}
					{colorMode === "biotemperature" && hoverBiotemperature !== null && (
						<Row label="Biotemp" value={`${hoverBiotemperature.toFixed(1)} °C`} />
					)}
					{colorMode === "temperatureDelta" && hoverTemperatureDelta !== null && (
						<Row label="Temp Δ" value={`${hoverTemperatureDelta.toFixed(1)} °C`} />
					)}
					{hoverIceSummary && <Row label="Ice" value={hoverIceSummary} />}
					{hoverIceDebug && <div className="font-mono text-[8px] text-slate-500">{hoverIceDebug}</div>}
					{/* {terrainFeatureSwatches.length > 0 && <MultiSwatchRow label="Features" values={terrainFeatureSwatches} />} */}
					{hoverHazards && (
						<>
							<SwatchRow
								label="Danger"
								value={`${Math.round(hoverHazards.danger * 100)}%${
									hoverHazards.danger >= 0.2
										? hoverHazards.earthquake >= hoverHazards.volcano
											? " (quakes)"
											: " (volcanic)"
										: ""
								}`}
								color={rgbToCss(dangerColor(hoverHazards.danger))}
							/>
						</>
					)}
					{hoverTopography && <SwatchRow label="Topography" value={hoverTopography} color={topographySwatch} />}
					{hoverClimateDisplay && <SwatchRow label="Climate" value={hoverClimateDisplay} color={climateColor} />}
					{hoverBiome && <SwatchRow label="Veg" value={hoverBiome} color={vegetationSwatch} />}
					{hoverProvince !== null && hoverProvince >= 0 && (
						<>
							<Row
								label="Province"
								value={`#${hoverProvince}${world?.provinces?.desolate[hoverProvince] ? " (desolate)" : ""}`}
							/>
							{world?.population &&
								!world.provinces!.desolate[hoverProvince] &&
								(() => {
									const p = hoverProvince
									const pop = world.population.population[p]
									if (pop <= 0) return null
									const popStr =
										pop >= 1_000_000
											? `${(pop / 1_000_000).toFixed(1)}M`
											: pop >= 1_000
												? `${(pop / 1_000).toFixed(0)}K`
												: Math.round(pop).toLocaleString()
									const radiusKm = world.params.planetRadiusKm ?? 6371
									const cellAreaKm2 = (4 * Math.PI * radiusKm * radiusKm) / world.mesh.numRegions
									const areaKm2 = world.provinces.size[p] * cellAreaKm2
									const density = pop / areaKm2
									return <Row label="Pop" value={`${popStr} · ${density.toFixed(1)}/km²`} />
								})()}
						</>
					)}
					{/* {hoverBasinId !== null && <Row label="Basin" value={String(hoverBasinId)} />} */}
					{hoverOceanDist !== null && hoverOceanDist > 0 && (
						<Row
							label="Ocean dist"
							value={`${hoverOceanDist < 100 ? hoverOceanDist.toFixed(0) : Math.round(hoverOceanDist).toLocaleString()} km`}
						/>
					)}
					{hoverDistCoast !== null && (
						<Row
							label="Coast dist"
							value={`${hoverDistCoastKm === Infinity ? "∞" : hoverDistCoastKm !== null && hoverDistCoastKm < 100 ? hoverDistCoastKm.toFixed(0) : hoverDistCoastKm !== null ? Math.round(hoverDistCoastKm).toLocaleString() : "—"} km`}
						/>
					)}
					{isWindMode && hoverWind && (
						<Row
							label={`Wind ${windAnnual ? "avg" : monthLabels[globalMonth]}`}
							value={(() => {
								const { east: we, north: wn, speed: ws } = hoverWind
								const deg = (Math.atan2(-we, -wn) * 180) / Math.PI
								const from = ((deg % 360) + 360) % 360
								const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
								const dir = dirs[Math.round(from / 45) % 8]
								return `${dir} ${from.toFixed(0)}° · ${ws.toFixed(2)}`
							})()}
						/>
					)}
					{chartData && world?.climate && (
						<div className="space-y-2 border-t border-white/5 pt-1">
							<MiniBarChart
								values={chartData.daylight}
								label="Daylight"
								unit="h"
								colorFn={(v) => DAYLIGHT.color(v)}
								globalMonth={globalMonth}
							/>
							<MiniBarChart
								values={chartData.temps}
								label="Temp"
								unit="°C"
								colorFn={(v) => tempColor(v)}
								globalMonth={globalMonth}
								annualValue={annualTemp ?? undefined}
								annualDigits={1}
							/>
							{!!chartData.isLand && (
								<MiniBarChart
									values={chartData.precip}
									label="Precip"
									unit="mm"
									colorFn={(v) => rainColor(v)}
									globalMonth={globalMonth}
									annualValue={annualPrecip ?? undefined}
									annualDigits={0}
								/>
							)}
							{hoverRiver && hoverRiver.flow_monthly.length === 12 && (
								<MiniBarChart
									values={hoverRiver.flow_monthly}
									label={`River #${hoverRiver.riverId}`}
									unit="m³/s"
									colorFn={(v) => flowColor(v)}
									globalMonth={globalMonth}
									annualValue={hoverRiver.flow}
									formatValue={formatCompactNumber}
								/>
							)}
							{hoverRiver && hoverRiver.lengthKm > 0 && (
								<div className="-mt-1 font-mono text-[9px] text-slate-500">
									Length {formatCompactNumber(hoverRiver.lengthKm)} km
								</div>
							)}
						</div>
					)}
			</div>
		</div>
	)
}

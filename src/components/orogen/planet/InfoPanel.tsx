import React from "react"
import { DAYLIGHT } from "@/model/cells/daylight"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import { type ColorMode, dangerColor, windSpeedColor } from "../colors"
import { monthLabels } from "./constants"
import type {
	HoverDtr,
	HoverHazards,
	HoverHotspot,
	HoverInfo,
	HoverLandmark,
	HoverOceanCurrents,
	HoverRiver,
	HoverTerrainFeature,
	HoverWind,
} from "./hover"
import {
	buildClimateSwatchColor,
	buildHoverChartData,
	buildHoverWindData,
	buildPastaMonthlyData,
	buildProvinceDisplayData,
	buildTerrainFeatureSwatches,
	buildTopographySwatchColor,
	buildVegetationSwatchColor,
	formatWindSummary,
} from "./info-panel-model"
import { formatTemperatureC, rgbToCss } from "./ui-format"

const MONTH_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

function MiniBarChart({
	values,
	label,
	unit,
	colorFn,
	globalMonth,
	annualValue,
	annualDigits = 0,
	annualPrefix = "ANN",
	formatValue,
	showValues = false,
}: {
	values: number[]
	label: string
	unit: string
	colorFn: (v: number, i: number) => string
	globalMonth: number
	annualValue?: number
	annualDigits?: number
	annualPrefix?: string
	formatValue?: (v: number) => string
	showValues?: boolean
}) {
	const max = Math.max(...values.map(Math.abs), 0.001)
	const min = Math.min(...values, 0)
	const hasNeg = min < 0
	const range = hasNeg ? max - min : max
	const zeroY = hasNeg ? max / range : 1

	return (
		<div>
			<div className="mb-2 flex items-baseline justify-between">
				<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
					{label}
				</span>
				<span className="font-mono text-[9px] text-slate-500">
					{annualValue !== undefined
						? `${annualPrefix} ${formatValue ? formatValue(annualValue) : annualValue.toFixed(annualDigits)} ${unit}`.trim()
						: ""}
				</span>
			</div>
			<div className="relative flex h-7 gap-px">
				{hasNeg && (
					<div
						className="absolute left-0 right-0 border-t border-slate-500/30"
						style={{ top: `${zeroY * 100}%` }}
					/>
				)}
				{values.map((v, i) => {
					const barH = Math.abs(v) / range
					const isSelected = i === globalMonth - 1
					const valueLabel = formatValue
						? formatValue(v)
						: v.toFixed(label === "Temp" ? 1 : 0)
					const labelBottom =
						v >= 0
							? `calc(${(1 - zeroY) * 100 + barH * zeroY * 100}% + 2px)`
							: `calc(${(1 - zeroY) * 100}% + 2px)`
					return (
						<div
							key={i}
							className="relative h-full flex-1"
							title={`${monthLabels[i + 1]}: ${formatValue ? formatValue(v) : v.toFixed(label === "Temp" ? 1 : 0)} ${unit}`}
						>
							{showValues && (
								<span
									className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-[6px] leading-none ${isSelected ? "text-white" : "text-slate-500"}`}
									style={{
										bottom: labelBottom,
									}}
								>
									{valueLabel}
								</span>
							)}
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

function currentImpactColor(v: number): string {
	return v >= 0 ? "#f59e0b" : "#38bdf8"
}

function petColor(v: number): string {
	if (v < 20) return "#38bdf8"
	if (v < 50) return "#67e8f9"
	if (v < 100) return "#fbbf24"
	if (v < 150) return "#f97316"
	return "#ef4444"
}

function aetColor(v: number): string {
	if (v < 10) return "#a16207"
	if (v < 30) return "#65a30d"
	if (v < 60) return "#059669"
	if (v < 100) return "#0891b2"
	return "#2563eb"
}

function gddColor(v: number): string {
	if (v < 50) return "#64748b"
	if (v < 150) return "#84cc16"
	if (v < 300) return "#22c55e"
	if (v < 500) return "#f59e0b"
	return "#ef4444"
}

function gintColor(v: number): string {
	if (v < 5) return "#64748b"
	if (v < 10) return "#67e8f9"
	if (v < 15) return "#fbbf24"
	return "#f97316"
}

function dtrChartColor(v: number): string {
	if (v < 4) return "#38bdf8"
	if (v < 8) return "#67e8f9"
	if (v < 12) return "#facc15"
	if (v < 16) return "#fb923c"
	return "#ef4444"
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between">
			<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
				{label}
			</span>
			<span className="font-mono text-[10px] text-slate-100">{value}</span>
		</div>
	)
}

function SwatchRow({
	label,
	value,
	color,
	striped = false,
	stripeBackground = "rgba(15, 23, 42, 0.85)",
}: {
	label: string
	value: string
	color: string | null
	striped?: boolean
	stripeBackground?: string
}) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
				{label}
			</span>
			<span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-100">
				{color && (
					<span
						className="h-2 w-2 border border-white/15"
						style={
							striped
								? {
										backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, ${stripeBackground} 2px 4px)`,
									}
								: { backgroundColor: color }
						}
					/>
				)}
				<span>{value}</span>
			</span>
		</div>
	)
}

function MultiSwatchRow({
	label,
	values,
}: {
	label: string
	values: Array<{ label: string; color: string | null }>
}) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
				{label}
			</span>
			<span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 font-mono text-[10px] text-slate-100">
				{values.map((value, index) => (
					<React.Fragment key={`${value.label}-${index}`}>
						<span className="inline-flex items-center gap-1.5">
							{value.color && (
								<span
									className="h-2 w-2 border border-white/15"
									style={{ backgroundColor: value.color }}
								/>
							)}
							<span>{value.label}</span>
						</span>
						{index < values.length - 1 && (
							<span className="text-slate-500">,</span>
						)}
					</React.Fragment>
				))}
			</span>
		</div>
	)
}

function formatCompactNumber(value: number): string {
	if (!Number.isFinite(value)) return "0"
	if (value >= 1_000_000_000)
		return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`
	if (value >= 1_000_000)
		return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
	if (value >= 1_000)
		return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`
	return value
		.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)
		.replace(/\.0+$/, "")
		.replace(/(\.\d*[1-9])0+$/, "$1")
}

interface InfoPanelProps {
	hoverInfo: HoverInfo | null
	hoverElevationKm: number | null
	hoverTopography: string | null
	hoverCoordinates: string | null
	hoverLandmark: HoverLandmark | null
	hoverIsLand: boolean | null
	hoverTemperatureDelta: number | null
	hoverRainfall: number | null
	hoverDtr: HoverDtr | null
	hoverClimateDisplay: string | null
	hoverIceSummary: string | null
	hoverBiome: string | null
	hoverProvince: number | null
	hoverNationId: number | null
	hoverRegionColor: [number, number, number] | null
	hoverOccupation: {
		id: number
		color: string
		rebel: boolean
	} | null
	hoverOceanDist: number | null
	hoverDistCoast: number | null
	hoverDistCoastKm: number | null
	hoverWind: HoverWind | null
	hoverHazards: HoverHazards | null
	hoverHotspot: HoverHotspot | null
	hoverRiver: HoverRiver | null
	hoverTerrainFeature: HoverTerrainFeature | null
	hoverOceanCurrents: HoverOceanCurrents | null
	colorMode: ColorMode
	isClimateMode: boolean
	isSatelliteMode: boolean
	tempAnnual: boolean
	rainAnnual: boolean
	windAnnual: boolean
	dtrAnnual: boolean
	globalMonth: number
	world: SerializedOrogenWorld | null
	hoverCardRef: React.RefObject<HTMLDivElement | null>
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
	hoverInfo,
	hoverElevationKm,
	hoverTopography,
	hoverCoordinates,
	hoverLandmark,
	hoverTemperatureDelta,
	hoverDtr,
	hoverClimateDisplay,
	hoverIceSummary,
	hoverBiome,
	hoverProvince,
	hoverNationId,
	hoverRegionColor,
	hoverOccupation,
	hoverOceanDist,
	hoverDistCoast,
	hoverDistCoastKm,
	hoverWind,
	hoverHazards,
	hoverRiver,
	hoverTerrainFeature,
	hoverOceanCurrents,
	colorMode,
	windAnnual,
	dtrAnnual,
	globalMonth,
	world,
	hoverCardRef,
}) => {
	const chartData = buildHoverChartData(hoverInfo, hoverElevationKm, world)
	const windData = buildHoverWindData(hoverInfo, world)
	const pastaMonthlyData = buildPastaMonthlyData(hoverInfo, world)

	const hoverRegion = hoverInfo?.region ?? null
	const landmarkShare =
		hoverLandmark?.size != null && world?.mesh.numRegions
			? (hoverLandmark.size / world.mesh.numRegions) * 100
			: null
	const annualTemp = world.climate.temperature_avg[hoverRegion]
	const annualPrecip = chartData
		? chartData.precip.reduce((sum, value) => sum + value, 0)
		: null
	const climateColor = buildClimateSwatchColor(hoverRegion, world, colorMode)
	const vegetationSwatch = buildVegetationSwatchColor(hoverRegion, world)
	const topographySwatch = buildTopographySwatchColor(hoverRegion, world)
	const terrainFeatureSwatches =
		buildTerrainFeatureSwatches(hoverTerrainFeature)
	const slopeScoreByRegion = world?.slopeScore ?? null
	const hoverSlopePercent =
		hoverRegion !== null && slopeScoreByRegion
			? slopeScoreByRegion[hoverRegion] * 100
			: null
	const hasCurrentImpact =
		hoverOceanCurrents !== null &&
		hoverOceanCurrents.monthlyDelta.some((value) => Math.abs(value) > 0.01)
	const { provinceColor, provinceNation } = buildProvinceDisplayData({
		hoverProvince,
		hoverNationId,
		hoverRegionColor,
		world,
	})

	return (
		<div className="pointer-events-auto absolute top-3 left-3 z-20 w-64 rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
			<div ref={hoverCardRef} className="space-y-0.5">
				{hoverCoordinates && <Row label="Coords" value={hoverCoordinates} />}
				<Row
					label="Elev"
					value={`${hoverElevationKm.toFixed(2)} km${hoverSlopePercent !== null ? ` (${hoverSlopePercent.toFixed(1)}%)` : ""}`}
				/>
				{hoverLandmark && (
					<Row
						label="Landmark"
						value={`${hoverLandmark.type ?? "unknown"} #${hoverLandmark.id}${landmarkShare !== null ? ` (${landmarkShare.toFixed(1)}%)` : ""}`}
					/>
				)}
				{colorMode === "temperatureDelta" && hoverTemperatureDelta !== null && (
					<Row
						label="Temp Δ"
						value={formatTemperatureC(hoverTemperatureDelta)}
					/>
				)}
				{colorMode === "dtr" && hoverDtr !== null && (
					<Row
						label={`DTR ${dtrAnnual ? "avg" : monthLabels[globalMonth]}`}
						value={formatTemperatureC(hoverDtr.value)}
					/>
				)}
				{colorMode !== "nations" && hoverIceSummary && (
					<Row label="Ice" value={hoverIceSummary} />
				)}
				{colorMode === "terrainFeatures" &&
					terrainFeatureSwatches.length > 0 && (
						<MultiSwatchRow label="Features" values={terrainFeatureSwatches} />
					)}
				{colorMode !== "nations" && hoverHazards && (
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
				{hoverTopography && (
					<SwatchRow
						label="Topography"
						value={hoverTopography}
						color={topographySwatch}
					/>
				)}
				{hoverClimateDisplay && (
					<SwatchRow
						label="Climate"
						value={hoverClimateDisplay}
						color={climateColor}
					/>
				)}
				{hoverBiome && (
					<SwatchRow label="Veg" value={hoverBiome} color={vegetationSwatch} />
				)}
				{hoverProvince !== null && hoverProvince >= 0 && (
					<>
						<SwatchRow
							label="Province"
							value={`#${hoverProvince}${world?.provinces?.desolate[hoverProvince] ? " (desolate)" : ""}`}
							color={provinceColor}
						/>
						{provinceNation && (
							<SwatchRow
								label="Nation"
								value={`#${provinceNation.id}`}
								color={provinceNation.color}
							/>
						)}
						{hoverOccupation && (
							<SwatchRow
								label="Occupier"
								value={`#${hoverOccupation.id}${hoverOccupation.rebel ? " (rebels)" : ""}`}
								color={hoverOccupation.color}
								striped
								stripeBackground={"white"}
							/>
						)}
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
								const cellAreaKm2 =
									(4 * Math.PI * radiusKm * radiusKm) / world.mesh.numRegions
								const areaKm2 = world.provinces.size[p] * cellAreaKm2
								const density = pop / areaKm2
								return (
									<Row
										label="Pop"
										value={`${popStr} · ${density.toFixed(1)}/km²`}
									/>
								)
							})()}
						{world?.development &&
							!world.provinces!.desolate[hoverProvince] && (
								<Row
									label="Development"
									value={world.development[hoverProvince].toFixed(2)}
								/>
							)}
						{world?.urbanPopulation &&
							!world.provinces!.desolate[hoverProvince] && (
								<Row
									label="Urban Pop"
									value={Math.round(
										world.urbanPopulation[hoverProvince],
									).toLocaleString()}
								/>
							)}
					</>
				)}
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
				{hoverWind && (
					<Row
						label={`Wind ${windAnnual ? "avg" : monthLabels[globalMonth]}`}
						value={formatWindSummary(hoverWind)}
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
							annualValue={
								chartData.daylight.reduce((sum, value) => sum + value, 0) /
								chartData.daylight.length
							}
							annualDigits={1}
							annualPrefix="AVG"
							showValues
						/>
						<MiniBarChart
							values={chartData.temps}
							label="Temp"
							unit="°C"
							colorFn={(v) => tempColor(v)}
							globalMonth={globalMonth}
							annualValue={annualTemp ?? undefined}
							annualDigits={1}
							annualPrefix="AVG"
							showValues
						/>
						{(colorMode === "pastaClimate" || colorMode === "satellite") &&
							hoverRegion !== null &&
							world.pastaDebug?.minT &&
							world.pastaDebug?.maxT && (
								<div className="flex justify-between font-mono text-[9px] text-slate-400">
									<span>
										MIN{" "}
										<span className="text-slate-200">
											{formatTemperatureC(world.pastaDebug.minT[hoverRegion])}
										</span>
									</span>
									<span>
										MAX{" "}
										<span className="text-slate-200">
											{formatTemperatureC(world.pastaDebug.maxT[hoverRegion])}
										</span>
									</span>
								</div>
							)}
						{!!chartData.isLand && (
							<MiniBarChart
								values={chartData.precip}
								label="Precip"
								unit="mm"
								colorFn={(v) => rainColor(v)}
								globalMonth={globalMonth}
								annualValue={annualPrecip ?? undefined}
								annualDigits={0}
								showValues
							/>
						)}
						{windData && (
							<MiniBarChart
								values={windData.speeds}
								label="Wind"
								unit="m/s"
								colorFn={(v) => rgbToCss(windSpeedColor(v))}
								globalMonth={globalMonth}
								annualValue={windData.annualSpeed}
								annualDigits={2}
								annualPrefix="AVG"
								showValues
							/>
						)}
						{colorMode === "precipitation" && !!chartData?.isLand && (
							<>
								<MiniBarChart
									values={chartData.pet}
									label="PET"
									unit="mm"
									colorFn={(v) => petColor(v)}
									globalMonth={globalMonth}
									annualValue={chartData.pet.reduce((s, v) => s + v, 0)}
									annualDigits={0}
									showValues
								/>
								{chartData.aet.some((v) => v > 0) && (
									<MiniBarChart
										values={chartData.aet}
										label="AET"
										unit="mm"
										colorFn={(v) => aetColor(v)}
										globalMonth={globalMonth}
										annualValue={chartData.aet.reduce((s, v) => s + v, 0)}
										annualDigits={0}
										showValues
									/>
								)}
							</>
						)}
						{(colorMode === "pastaClimate" || colorMode === "satellite") &&
							pastaMonthlyData &&
							!!chartData?.isLand && (
								<>
									{(() => {
										const rawGdd =
											world.pastaDebug?.gdd[hoverRegion] ?? undefined
										const isInfGdd = rawGdd !== undefined && rawGdd >= 99999
										return (
											<MiniBarChart
												values={pastaMonthlyData.gdd}
												label="GDD"
												unit=""
												colorFn={(v) => gddColor(v)}
												globalMonth={globalMonth}
												annualValue={rawGdd}
												annualDigits={0}
												annualPrefix={isInfGdd ? "" : "ANN"}
												formatValue={(v) => (v >= 99999 ? "∞" : v.toFixed(0))}
												showValues
											/>
										)
									})()}
									<MiniBarChart
										values={pastaMonthlyData.gint}
										label="GInt"
										unit=""
										colorFn={(v) => gintColor(v)}
										globalMonth={globalMonth}
										annualValue={
											world.pastaDebug?.gint[hoverRegion] !== undefined
												? world.pastaDebug.gint[hoverRegion] >= 99999
													? 12
													: world.pastaDebug.gint[hoverRegion]
												: undefined
										}
										annualDigits={0}
										annualPrefix="ANN"
										formatValue={(v) => v.toFixed(0)}
										showValues
									/>
								</>
							)}
						{colorMode === "dtr" &&
							hoverDtr &&
							hoverDtr.monthly.length === 12 && (
								<MiniBarChart
									values={hoverDtr.monthly}
									label="DTR"
									unit="°C"
									colorFn={(v) => dtrChartColor(v)}
									globalMonth={globalMonth}
									annualValue={hoverDtr.annual}
									annualDigits={1}
									annualPrefix="AVG"
									formatValue={(value) =>
										formatTemperatureC(value).replace(" °C", "")
									}
									showValues
								/>
							)}
						{colorMode === "oceanCurrents" &&
							hasCurrentImpact &&
							hoverOceanCurrents !== null && (
								<div className="space-y-1 border-t border-white/5 pt-1">
									<MiniBarChart
										values={hoverOceanCurrents.monthlyDelta}
										label="Ocean Current"
										unit="°C"
										colorFn={(v) => currentImpactColor(v)}
										globalMonth={globalMonth}
										formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`}
										annualValue={hoverOceanCurrents.averageDelta}
										annualDigits={1}
										annualPrefix={`${hoverOceanCurrents.mode} · avg`}
										showValues
									/>
								</div>
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
								showValues
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

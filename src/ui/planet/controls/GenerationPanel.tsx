import {
	BarElement,
	CategoryScale,
	type ChartData,
	Chart as ChartJS,
	type ChartOptions,
	Legend,
	LinearScale,
	Tooltip,
} from "chart.js"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bar } from "react-chartjs-2"
import type { StageTiming } from "@/model"
import {
	computeEarthRelativeDensity as computeBodyEarthRelativeDensity,
	computeGravityG,
	massKgFromEarthRelativeDensity,
} from "@/model/celestial/body-metrics"
import {
	computeSolarDayHours,
	inferRetrogradeRotationFromAxialTiltDeg,
} from "@/model/celestial/day-length"
import type {
	AtmosphereProfile,
	MoonParams,
} from "@/model/celestial/moons/moon-types"
import { estimateMoonSizeClassFromDiameter } from "@/model/celestial/moons/moon-utils"
import {
	derivePlanetMassKg,
	moonOrbitalPeriodDaysFromSemiMajorAxisM,
	moonSemiMajorAxisM,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import {
	getHabitableZoneAU,
	getKeplerYearYears,
	getStarDiameterSol,
	getStarLabel,
	getStarLuminositySol,
	getStarMAO,
	getStarMassSol,
	getStarTemperatureK,
	isValidSpectralClass,
	MAIN_SEQUENCE_CLASSES,
	type MainSequenceClass,
} from "@/model/celestial/star/star-types"
import {
	getStarAgeGyr,
	type SystemBody,
} from "@/model/celestial/system/generate-system-bodies"
import { estimatePlanetarySizeClass } from "@/model/celestial/system/size-class"
import {
	SOL_MAIN_WORLD_NAME,
	SOL_SEED,
	SOL_STAR_NAME,
} from "@/model/celestial/system/sol-system"
import { estimateGreenhouseFactor } from "@/model/climate/ebm/greenhouse-estimate"
import {
	computeMoonSurfaceTidesM,
	computeMoonTidalSchedule,
	computeSurfaceTidesM,
	computeTidalSchedule,
	type SurfaceTidesBreakdown,
} from "@/model/climate/tidal-schedule"
import { SEED_MAX } from "@/model/shared/planet-code"
import { seedStringToNumber } from "@/model/shared/rng"
import { SLIDER_RANGES } from "@/model/shared/slider-ranges"
import { ERA_CONFIGS, ERA_ORDER, type SocietyEra } from "@/model/society/eras"
import {
	EditableStatValue,
	type StatEntry,
} from "@/ui/components/composites/EditableStatValue"
import { AxisRotateClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateClockwiseIcon"
import { AxisRotateCounterClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateCounterClockwiseIcon"
import { CrosshairsGpsIcon } from "@/ui/components/primitives/icons/CrosshairsGpsIcon"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { HistoryIcon } from "@/ui/components/primitives/icons/HistoryIcon"
import { LockIcon } from "@/ui/components/primitives/icons/LockIcon"
import { LockOpenIcon } from "@/ui/components/primitives/icons/LockOpenIcon"
import { StarIcon } from "@/ui/components/primitives/icons/StarIcon"
import { StarOutlineIcon } from "@/ui/components/primitives/icons/StarOutlineIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Surface } from "@/ui/components/primitives/Surface"
import { Tooltip as UITooltip } from "@/ui/components/primitives/Tooltip"
import { estimateAlbedo, useEbmPreview } from "@/ui/hooks/useEbmPreview"
import { useLockedClimatePreview } from "@/ui/hooks/useLockedClimatePreview"
import { LockedClimatePreview } from "@/ui/preview/LockedClimatePreview"
import { RegularClimatePreview } from "@/ui/preview/RegularClimatePreview"
import { TidalCalendarChart } from "@/ui/preview/TidalCalendarChart"
import type {
	ClimatePreviewData,
	LockedClimatePreviewData,
	RegularClimatePreviewData,
} from "@/ui/preview/types"
import {
	GENERATION_PREVIEW_TABS,
	type GenerationPreviewTab,
} from "../screen/generation/generation-preview"
import { getOrderedRecentCodes } from "../screen/generation/recent-codes"
import type { SliderDef } from "../screen/generation/sliders"
import { SPECTRAL_CLASS_COLORS } from "../screen/generation/star-utils"
import type { UnitSystem } from "../screen/shared/ui-format"
import { SocietyRunesPanel } from "./SocietyRunesPanel"

ChartJS.register(CategoryScale, LinearScale, BarElement, Legend, Tooltip)

interface GenerationPanelProps {
	worldTab: "planet" | "society"
	setWorldTab: (tab: "planet" | "society") => void
	resetWorldDefaults: () => void
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setObliquity: (v: number) => void
	moonCount: number
	moonSeed: number
	restSeed: number
	showRealSolNames: boolean
	setRestSeed: (v: number) => void
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	surfaceTidesM?: SurfaceTidesBreakdown
	orbitBodies?: SystemBody[]
	/** Full sorted system body list (orbits + main world), used to resolve a
	 * body's index for onFocusBody. */
	systemBodies?: SystemBody[]
	/** Focuses the 3D solar-system view's camera on a body. -1 = the star. */
	onFocusBody?: (bodyIndex: number, moonIndex?: number) => void
	currentFocus?: {
		bodyIndex: number
		moonIndex?: number
	} | null
	onUpdateSystemBody?: (
		bodyIndex: number,
		updater: (body: SystemBody) => SystemBody,
	) => void
	onUpdateSystemMoon?: (
		bodyIndex: number,
		moonIndex: number,
		updater: (moon: MoonParams, parentBody: SystemBody) => MoonParams,
	) => void
	daysPerYear: number
	hoursPerDay: number
	setHoursPerDay: (v: number) => void
	planetRadiusKm: number
	generatedMoons: MoonParams[]
	planetSliders: SliderDef[]
	terrainSliders: SliderDef[]
	spectralClass: string
	setSpectralClass: (v: string) => void
	starSubtype: number
	setStarSubtype: (v: number) => void
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	obliquity: number
	inclinationDeg: number
	setInclinationDeg: (v: number) => void
	longitudeOfAscendingNodeDeg: number
	era: SocietyEra
	setEra: (v: SocietyEra) => void
	planetCode: string
	codeInput: string
	setCodeInput: (v: string) => void
	onApplyCode: () => void
	codeError: boolean
	recentCodes: string[]
	starredRecentCodes: string[]
	onSelectRecentCode: (code: string) => void
	onToggleRecentCodeStar: (code: string) => void
	onRandomizeCode: () => void
	generating: boolean
	generationLabel: string
	generationProgress: number
	generationTimings?: StageTiming[] | null
	landCoverage: number
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	handleGenerate: () => void
	handleFileImport: (file: File) => void
	handleEarthImport: () => void
	onClose?: () => void
}

function formatTimingSeconds(ms: number): string {
	return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 2)} s`
}

interface TimingEntry {
	label: string
	ms: number
}

interface TimingSummary {
	entries: TimingEntry[]
	otherEntries: TimingEntry[]
	totalMs: number
}

interface RecentCodeSelectionHandlers {
	onSelectRecentCode: (code: string) => void
	setShowRecentCodes: (show: boolean) => void
}

const POST_TIMING_PREFIX = "Post:"
const HISTORY_TIMING_PREFIX = "initHistory:"

const COMPUTE_ROUTES_PREFIX = "computeRoutes:"

function handleRecentCodeSelection(
	recentCode: string,
	handlers: RecentCodeSelectionHandlers,
): void {
	handlers.setShowRecentCodes(false)
	handlers.onSelectRecentCode(recentCode)
}

function stripTimingPrefix(stage: string): string {
	if (stage.startsWith("genesis:")) return stage.slice("genesis:".length)
	if (stage.startsWith(`${POST_TIMING_PREFIX} `))
		return stage.slice(`${POST_TIMING_PREFIX} `.length)
	if (stage.startsWith(HISTORY_TIMING_PREFIX))
		return stage.slice(HISTORY_TIMING_PREFIX.length)
	if (stage.startsWith(COMPUTE_ROUTES_PREFIX))
		return stage.slice(COMPUTE_ROUTES_PREFIX.length)
	return stage
}

function parseTimingEntries(
	timings: StageTiming[] | null | undefined,
	filter: (stage: string) => boolean,
): TimingEntry[] {
	if (!timings?.length) return []

	return timings
		.map((entry) => {
			const ms = Number.parseFloat(entry.ms)
			if (!Number.isFinite(ms) || !filter(entry.Stage)) return null
			return { label: stripTimingPrefix(entry.Stage), ms }
		})
		.filter((entry): entry is TimingEntry => entry !== null)
}

function getGenerationTimingSummary(
	timings?: StageTiming[] | null,
): TimingSummary | null {
	const orderedEntries = parseTimingEntries(
		timings,
		(stage) =>
			!stage.startsWith(POST_TIMING_PREFIX) &&
			!stage.startsWith(HISTORY_TIMING_PREFIX) &&
			!stage.startsWith(COMPUTE_ROUTES_PREFIX),
	).sort((a, b) => b.ms - a.ms)

	if (!orderedEntries.length) return null

	const largeEntries = orderedEntries.filter((entry) => entry.ms >= 100)
	const otherEntries = orderedEntries.filter((entry) => entry.ms < 100)
	const otherMs = otherEntries.reduce((sum, entry) => sum + entry.ms, 0)
	const entries =
		otherMs > 0
			? [...largeEntries, { label: "Other", ms: otherMs }]
			: largeEntries

	entries.sort((a, b) => b.ms - a.ms)

	return {
		entries,
		otherEntries,
		totalMs: orderedEntries.reduce((sum, entry) => sum + entry.ms, 0),
	}
}

function getPostTimingSummary(
	timings?: StageTiming[] | null,
): TimingSummary | null {
	const orderedEntries = parseTimingEntries(timings, (stage) =>
		stage.startsWith(POST_TIMING_PREFIX),
	).sort((a, b) => b.ms - a.ms)

	if (!orderedEntries.length) return null

	const largeEntries = orderedEntries.filter((entry) => entry.ms >= 100)
	const otherEntries = orderedEntries.filter((entry) => entry.ms < 100)
	const otherMs = otherEntries.reduce((sum, entry) => sum + entry.ms, 0)
	const entries =
		otherMs > 0
			? [...largeEntries, { label: "Other", ms: otherMs }]
			: largeEntries

	entries.sort((a, b) => b.ms - a.ms)

	return {
		entries,
		otherEntries,
		totalMs: orderedEntries.reduce((sum, entry) => sum + entry.ms, 0),
	}
}

function getHistoryTimingSummary(
	timings?: StageTiming[] | null,
): TimingSummary | null {
	const orderedEntries = parseTimingEntries(timings, (stage) =>
		stage.startsWith(HISTORY_TIMING_PREFIX),
	).sort((a, b) => b.ms - a.ms)

	if (!orderedEntries.length) return null

	const largeEntries = orderedEntries.filter((entry) => entry.ms >= 100)
	const otherEntries = orderedEntries.filter((entry) => entry.ms < 100)
	const otherMs = otherEntries.reduce((sum, entry) => sum + entry.ms, 0)
	const entries =
		otherMs > 0
			? [...largeEntries, { label: "Other", ms: otherMs }]
			: largeEntries

	entries.sort((a, b) => b.ms - a.ms)

	return {
		entries,
		otherEntries,
		totalMs: orderedEntries.reduce((sum, entry) => sum + entry.ms, 0),
	}
}

function getComputeRoutesTimingSummary(
	timings?: StageTiming[] | null,
): TimingSummary | null {
	const orderedEntries = parseTimingEntries(timings, (stage) =>
		stage.startsWith(COMPUTE_ROUTES_PREFIX),
	).sort((a, b) => b.ms - a.ms)

	if (!orderedEntries.length) return null

	const largeEntries = orderedEntries.filter((entry) => entry.ms >= 100)
	const otherEntries = orderedEntries.filter((entry) => entry.ms < 100)
	const otherMs = otherEntries.reduce((sum, entry) => sum + entry.ms, 0)
	const entries =
		otherMs > 0
			? [...largeEntries, { label: "Other", ms: otherMs }]
			: largeEntries

	entries.sort((a, b) => b.ms - a.ms)

	return {
		entries,
		otherEntries,
		totalMs: orderedEntries.reduce((sum, entry) => sum + entry.ms, 0),
	}
}

const EARTH_DIAMETER_KM = 12742

function formatHours(hours: number): string {
	if (!Number.isFinite(hours)) return "Infinite"
	const days = hours / 24
	const years = days / 365
	if (years >= 100) return `${(years / 100).toFixed(1)} c`
	if (years >= 1) return `${years.toFixed(2)} y`
	if (days >= 1) return `${days.toFixed(1)} d`
	return `${hours.toFixed(1)} h`
}

function formatDays(days: number): string {
	return formatHours(days * 24)
}

function buildDayLengthStats(params: {
	siderealDayHours: number
	orbitalPeriodDays: number
	retrograde?: boolean
	siderealEditor?: StatEntry["editor"]
}): StatEntry[] {
	const solarDayHours = computeSolarDayHours({
		siderealDayHours: params.siderealDayHours,
		orbitalPeriodDays: params.orbitalPeriodDays,
		retrograde: params.retrograde,
	})
	return [
		{
			label: "Sidereal Day",
			value: formatHours(params.siderealDayHours),
			editor: params.siderealEditor,
		},
		{
			label: "Solar Day",
			value: solarDayHours === null ? "-" : formatHours(solarDayHours),
		},
	]
}

function formatClassificationLabel(classification: string): string {
	return classification
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("-")
}

function normalizeSeedLabel(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return normalized || "seed"
}

function randomSeedLabel(): string {
	return Math.floor(Math.random() * SEED_MAX)
		.toString(36)
		.padStart(6, "0")
}

function getMoonSeedBaseName(params: {
	moon: MoonParams | undefined
	moonIndex: number
	showRealSolNames: boolean
	lunaFallback?: boolean
}): string {
	const { moon, moonIndex, showRealSolNames, lunaFallback } = params
	if (moon?.name) return moon.name
	if (showRealSolNames && lunaFallback && moonIndex === 0) return "Luna"
	return `moon-${moonIndex + 1}`
}

function formatAtmosphereLabel(
	atmosphere: AtmosphereProfile | null | undefined,
): string {
	if (!atmosphere) return "Vacuum"
	return `${formatPressureBar(atmosphere.pressureBar)} · ${formatAtmosphereSuffix(atmosphere)}`
}

function buildPressureAtmosphereProfile(
	pressureBar: number,
): AtmosphereProfile {
	if (pressureBar < 0.001) {
		return { code: 0, pressureBar, type: "vacuum", breathable: false }
	}
	if (pressureBar < 0.1) {
		return { code: 1, pressureBar, type: "trace", breathable: false }
	}
	if (pressureBar < 10) {
		return {
			code: 6,
			pressureBar,
			type: "breathable",
			breathable: true,
		}
	}
	if (pressureBar < 100) {
		return {
			code: 13,
			pressureBar,
			type: "exotic",
			breathable: false,
		}
	}
	if (pressureBar < 1000) {
		return {
			code: 16,
			pressureBar,
			type: "gas",
			subtype: "helium",
			breathable: false,
		}
	}
	return {
		code: 17,
		pressureBar,
		type: "gas",
		subtype: "hydrogen",
		breathable: false,
	}
}

function formatAtmosphereSuffix(atmosphere: AtmosphereProfile): string {
	if (atmosphere.type === "vacuum") return "Vacuum"
	if (atmosphere.type === "trace") return "Trace"
	if (atmosphere.type === "breathable") return "Breathable"
	if (atmosphere.type === "corrosive") return "Corrosive"
	if (atmosphere.type === "insidious") return "Insidious"
	if (atmosphere.type === "gas" && atmosphere.subtype === "helium")
		return "Helium"
	if (atmosphere.type === "gas" && atmosphere.subtype === "hydrogen")
		return "Hydrogen"
	return "Exotic"
}

function formatPressureBar(pressureBar: number): string {
	if (pressureBar >= 100) return `${pressureBar.toFixed(0)} bar`
	if (pressureBar >= 10) return `${pressureBar.toFixed(1)} bar`
	if (pressureBar >= 1) return `${pressureBar.toFixed(2)} bar`
	if (pressureBar >= 0.1) return `${pressureBar.toFixed(2)} bar`
	if (pressureBar >= 0.01) return `${pressureBar.toFixed(3)} bar`
	return `${pressureBar.toFixed(4)} bar`
}

function computeEarthRelativeDensity(
	massKg: number,
	diameterKm: number,
): number {
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	const massEarths = massKg / EARTH_MASS_KG
	return massEarths / diameterEarths ** 3
}

const EARTH_MASS_KG = 5.972e24
const MOON_COLORS_CSS = ["text-sky-500", "text-violet-500", "text-emerald-500"]
const DAYS_PER_YEAR = 365.25

const ORBIT_STAT_HELP = {
	periapsis:
		"Argument of periapsis. Where the closest point of the orbit sits within the orbital plane.",
}

function updateBodyDiameter(body: SystemBody, diameterKm: number): SystemBody {
	const densityEarthRelative =
		body.density?.earthRelative ??
		computeBodyEarthRelativeDensity(body.massKg, body.diameterKm)
	const massKg = massKgFromEarthRelativeDensity(
		diameterKm,
		densityEarthRelative,
	)
	return {
		...body,
		diameterKm,
		massKg,
		gravityG: computeGravityG(massKg, diameterKm),
		sizeClass: estimatePlanetarySizeClass(diameterKm, body.group === "jovian"),
		density: body.density
			? {
					...body.density,
					earthRelative: densityEarthRelative,
				}
			: body.density,
	}
}

function updateBodyOrbitalDistance(
	body: SystemBody,
	orbitalDistanceAU: number,
	starMassSol: number,
): SystemBody {
	return {
		...body,
		orbitalDistanceAU,
		orbitalPeriodDays:
			getKeplerYearYears(orbitalDistanceAU, starMassSol) * DAYS_PER_YEAR,
	}
}

function updateMoonDiameter(moon: MoonParams, diameterKm: number): MoonParams {
	const densityEarthRelative =
		moon.densityEarthRelative ??
		computeBodyEarthRelativeDensity(moon.massKg, moon.diameterKm)
	const massKg = massKgFromEarthRelativeDensity(
		diameterKm,
		densityEarthRelative,
	)
	return {
		...moon,
		diameterKm,
		massKg,
		sizeClass: estimateMoonSizeClassFromDiameter(diameterKm),
		densityEarthRelative,
	}
}

function updateMoonSemiMajorAxis(
	moon: MoonParams,
	parentBody: SystemBody,
	pd: number,
	hoursPerDay: number,
): MoonParams {
	const semiMajorAxisM = pd * parentBody.diameterKm * 1000
	return {
		...moon,
		semiMajorAxisPlanetDiameters: pd,
		orbitalPeriodDays: moonOrbitalPeriodDaysFromSemiMajorAxisM(
			semiMajorAxisM,
			parentBody.massKg,
			hoursPerDay,
		),
	}
}

function GpsFocusButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={(event) => {
				event.preventDefault()
				onClick()
			}}
			className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
			aria-label="Focus on this body"
		>
			<CrosshairsGpsIcon className="h-3 w-3" />
		</button>
	)
}

function renderStatGrid(stats: StatEntry[]) {
	return stats.map((stat) => (
		<React.Fragment key={stat.label}>
			{stat.help ? (
				<UITooltip content={stat.help} position="top" align="start">
					<span className="cursor-help border-b border-dotted border-slate-300 text-[9px] text-slate-400">
						{stat.label}
					</span>
				</UITooltip>
			) : (
				<span className="text-[9px] text-slate-400">{stat.label}</span>
			)}
			<div className="flex">
				{stat.valueHelp ? (
					<UITooltip content={stat.valueHelp} position="top" align="start">
						<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
							<EditableStatValue stat={stat} />
						</span>
					</UITooltip>
				) : (
					<EditableStatValue stat={stat} />
				)}
			</div>
		</React.Fragment>
	))
}

function buildStatEditor(
	slider: SliderDef | undefined,
	label = slider?.label,
): StatEntry["editor"] | undefined {
	if (!slider || !label) return undefined
	return {
		label,
		value: slider.value,
		min: slider.min,
		max: slider.max,
		step: slider.step,
		display: slider.display,
		set: slider.set,
	}
}

function renderMiniSlider(
	slider: SliderDef,
	label = slider.label,
	value = slider.display,
) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
					{label}
				</span>
				<span className="font-mono text-[10px] text-slate-400">{value}</span>
			</div>
			<input
				type="range"
				min={slider.min}
				max={slider.max}
				step={slider.step}
				value={slider.value}
				onChange={(e) => slider.set(parseFloat(e.target.value))}
				className="h-1 w-full cursor-pointer rounded-lg accent-slate-900"
			/>
		</div>
	)
}

function buildSurfaceStats(
	planetSliders: SliderDef[],
	terrainSliders: SliderDef[],
): StatEntry[] {
	const hydrosphereSlider = planetSliders.find(
		(slider) => slider.label === "Land Coverage",
	)
	const compositionSlider = planetSliders.find(
		(slider) =>
			slider.label === "Land Concentration" ||
			slider.label === "Ocean Concentration",
	)
	const landVariationSlider = terrainSliders.find(
		(slider) => slider.label === "Size Variety",
	)
	const seaLevelSlider = terrainSliders.find(
		(slider) => slider.label === "Sea Level",
	)
	const maxElevationSlider = terrainSliders.find(
		(slider) => slider.label === "Max Elevation",
	)
	const volcanismSlider = terrainSliders.find(
		(slider) => slider.label === "Volcanism",
	)
	const hydrosphere = hydrosphereSlider ? 1 - hydrosphereSlider.value : 0
	const compositionLabel = hydrosphere >= 0.5 ? "Land" : "Water"
	const variationLabel = hydrosphere >= 0.5 ? "Land" : "Water"

	return [
		{
			label: "Hydrosphere",
			value: hydrosphereSlider ? `${Math.round(hydrosphere * 100)}%` : "50%",
			help: "Sets the overall water-to-land balance for the world.",
			editor: hydrosphereSlider
				? {
						label: "Hydrosphere",
						value: hydrosphere,
						min: 1 - hydrosphereSlider.max,
						max: 1 - hydrosphereSlider.min,
						step: hydrosphereSlider.step,
						display: `${Math.round(hydrosphere * 100)}%`,
						set: (value: number) => hydrosphereSlider.set(1 - value),
						content: (
							<div className="flex w-44 flex-col gap-3 px-1 pt-0.5 pb-2">
								{renderMiniSlider(
									{
										...hydrosphereSlider,
										value: hydrosphere,
										display: `${Math.round(hydrosphere * 100)}%`,
										set: (value: number) => hydrosphereSlider.set(1 - value),
									},
									"Hydrosphere",
									`${Math.round(hydrosphere * 100)}%`,
								)}
								{compositionSlider
									? renderMiniSlider(
											compositionSlider,
											`${compositionLabel} Concentration`,
										)
									: null}
								{landVariationSlider
									? renderMiniSlider(
											landVariationSlider,
											`${variationLabel} Variation`,
										)
									: null}
								{seaLevelSlider
									? renderMiniSlider(seaLevelSlider, "Sea Level")
									: null}
							</div>
						),
					}
				: undefined,
		},
		{
			label: "Max Elevation",
			value: maxElevationSlider?.display ?? "0.0 km",
			help: maxElevationSlider?.help,
			editor: buildStatEditor(maxElevationSlider),
		},
		{
			label: "Volcanism",
			value: volcanismSlider?.display ?? "1.00",
			help: volcanismSlider?.help,
			editor: buildStatEditor(volcanismSlider),
		},
	]
}

function buildStarStats(params: {
	starClass: MainSequenceClass
	starSubtype: number
	restSeed: number
	setSpectralClass?: (value: string) => void
	setStarSubtype?: (value: number) => void
}): StatEntry[] {
	const { starClass, starSubtype, restSeed, setSpectralClass, setStarSubtype } =
		params
	const typeStatValue = getStarLabel(starClass, starSubtype)
	const starTempK = Math.round(getStarTemperatureK(starClass, starSubtype))
	const starDiamSol = getStarDiameterSol(starClass, starSubtype).toFixed(3)
	const starLuminosity = getStarLuminositySol(starClass, starSubtype)
	const starLumSol = starLuminosity.toFixed(3)
	const starMassSolValue = getStarMassSol(starClass, starSubtype)
	const starMassSol = starMassSolValue.toFixed(3)
	const starHzAU = getHabitableZoneAU(starLuminosity).toFixed(3)
	const starMaoAU = getStarMAO(starClass, starSubtype).toFixed(3)
	const starAgeGyr = getStarAgeGyr(restSeed, starMassSolValue).toFixed(2)

	return [
		{
			label: "Type",
			value: typeStatValue,
			editor:
				setSpectralClass && setStarSubtype
					? {
							label: "Type",
							value: starSubtype,
							min: SLIDER_RANGES.starSubtype.min,
							max: SLIDER_RANGES.starSubtype.max,
							step: SLIDER_RANGES.starSubtype.step,
							display: typeStatValue,
							set: setStarSubtype,
							content: (
								<div className="flex w-56 flex-col gap-2 px-1 pt-0.5 pb-2">
									<div className="flex flex-wrap gap-1">
										{MAIN_SEQUENCE_CLASSES.map((spectralType) => {
											const color = SPECTRAL_CLASS_COLORS[spectralType]
											const active = spectralType === starClass
											return (
												<button
													key={spectralType}
													type="button"
													onClick={() => setSpectralClass(spectralType)}
													style={{
														backgroundColor: active ? color : undefined,
														borderColor: active ? "#0f172a" : undefined,
														color: active ? "#0f172a" : undefined,
													}}
													className={`rounded border px-2 py-0.5 text-[9px] font-bold transition-all ${
														active
															? ""
															: "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
													}`}
												>
													{spectralType}
												</button>
											)
										})}
									</div>
									<div className="flex flex-col gap-1">
										<div className="flex items-center justify-between">
											<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
												Subtype
											</span>
											<span className="font-mono text-[10px] text-slate-400">
												{typeStatValue}
											</span>
										</div>
										<input
											type="range"
											min={SLIDER_RANGES.starSubtype.min}
											max={SLIDER_RANGES.starSubtype.max}
											step={SLIDER_RANGES.starSubtype.step}
											value={starSubtype}
											onChange={(event) =>
												setStarSubtype(parseFloat(event.target.value))
											}
											className="mt-1 h-1 w-full cursor-pointer rounded-lg accent-slate-900"
										/>
									</div>
								</div>
							),
						}
					: undefined,
		},
		{ label: "Diameter", value: `${starDiamSol} R☉` },
		{ label: "Mass", value: `${starMassSol} M☉` },
		{ label: "Temperature", value: `${starTempK.toLocaleString()} K` },
		{ label: "Luminosity", value: `${starLumSol} L☉` },
		{ label: "HZ Center", value: `${starHzAU} AU` },
		{ label: "MAO", value: `${starMaoAU} AU` },
		{ label: "Age", value: `${starAgeGyr} Gyr` },
		{ label: "Inclination", value: "0.0°" },
	]
}

function SystemBodyCard({
	className,
	summaryClassName,
	title,
	stats,
	lockButton,
	gpsButton,
	defaultOpen = false,
	children,
	bodyContent,
}: {
	className: string
	summaryClassName: string
	title: string
	stats: StatEntry[]
	lockButton?: React.ReactNode
	gpsButton?: React.ReactNode
	defaultOpen?: boolean
	children?: React.ReactNode
	bodyContent?: React.ReactNode
}) {
	return (
		<details
			open={defaultOpen}
			className={`group rounded border bg-white/85 px-2 py-1.5 shadow-sm shadow-slate-200/20 ${className}`}
		>
			<summary
				className={`flex cursor-pointer list-none items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] ${summaryClassName}`}
			>
				<span>{title}</span>
				<div className="flex items-center gap-1">
					{lockButton}
					{gpsButton}
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-slate-400 transition-transform group-open:rotate-180"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</div>
			</summary>
			{bodyContent ? (
				<div className="mt-2">{bodyContent}</div>
			) : (
				<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
					{renderStatGrid(stats)}
				</div>
			)}
			{children ? (
				<div className="mt-2 flex flex-col gap-1.5">{children}</div>
			) : null}
		</details>
	)
}

function MoonSystemCard({
	className = "border-slate-100",
	summaryClassName,
	title,
	stats,
	lockButton,
	gpsButton,
	defaultOpen = false,
	children,
}: {
	className?: string
	summaryClassName: string
	title: string
	stats: StatEntry[]
	lockButton?: React.ReactNode
	gpsButton?: React.ReactNode
	defaultOpen?: boolean
	children?: React.ReactNode
}) {
	return (
		<SystemBodyCard
			className={className}
			summaryClassName={summaryClassName}
			title={title}
			stats={stats}
			lockButton={lockButton}
			gpsButton={gpsButton}
			defaultOpen={defaultOpen}
		>
			{children}
		</SystemBodyCard>
	)
}

function DataSectionSummary() {
	return (
		<summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
			<span>Preview</span>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="text-slate-400 transition-transform group-open:rotate-180"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</summary>
	)
}

function PlanetDetailContent({
	tidalSchedulePreview,
	moonCount,
	daysPerYear,
	isSolarLocked,
	climatePreview,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	tidesEmptyLabel,
}: {
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	moonCount: number
	daysPerYear: number
	isSolarLocked: boolean
	climatePreview: ClimatePreviewData
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	tidesEmptyLabel?: string
}) {
	const [detailTab, setDetailTab] = useState<GenerationPreviewTab | "tides">(
		generationPreviewTab,
	)

	return (
		<div className="mt-2">
			<div className="flex gap-0 border-b border-slate-100">
				{[
					...GENERATION_PREVIEW_TABS.map(([tab, label]) => ({
						tab,
						label: label.toLowerCase(),
					})),
					{ tab: "tides" as const, label: "tides" },
				].map(({ tab, label }) => (
					<button
						key={tab}
						type="button"
						onClick={() => {
							setDetailTab(tab)
							if (tab !== "tides") onSelectGenerationPreviewTab(tab)
						}}
						className={`px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors border-b-2 ${
							detailTab === tab
								? "border-slate-700 text-slate-900"
								: "border-transparent text-slate-400 hover:text-slate-600"
						}`}
					>
						{label}
					</button>
				))}
			</div>
			{detailTab === "tides" ? (
				<div className="px-1 py-1" style={{ minHeight: 140 }}>
					{tidalSchedulePreview && tidalSchedulePreview.events.length > 0 ? (
						<TidalCalendarChart
							schedule={tidalSchedulePreview}
							daysPerYear={daysPerYear}
							compact={true}
						/>
					) : (
						<div className="flex h-32 items-center justify-center text-[10px] text-slate-400">
							{tidesEmptyLabel ?? (moonCount === 0 ? "No moons" : "Computing…")}
						</div>
					)}
				</div>
			) : (
				<div className="pt-1">
					<div className="h-[248px] overflow-hidden">
						{isSolarLocked ? (
							<LockedClimatePreview
								preview={climatePreview as LockedClimatePreviewData}
								activeTab={generationPreviewTab}
								unitSystem={unitSystem}
								daysPerYear={daysPerYear}
							/>
						) : (
							<RegularClimatePreview
								preview={climatePreview as RegularClimatePreviewData}
								activeTab={generationPreviewTab}
								unitSystem={unitSystem}
								daysPerYear={daysPerYear}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

function isApproxSolarLocked(
	siderealDayHours: number,
	orbitalPeriodDays: number,
): boolean {
	return Math.abs(siderealDayHours - orbitalPeriodDays * 24) < 0.1
}

function LazyPlanetDetailTabs({
	seed,
	moonCount,
	moons,
	moonContext,
	moonTideContext,
	daysPerYear,
	hoursPerDay,
	planetRadiusKm,
	isSolarLocked,
	spectralClass,
	starSubtype,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	obliquity,
	hydrosphereFraction,
	atmosphere,
	albedo,
	greenhouseFactor,
	internalHeatTempK,
	tidalSchedulePreviewOverride,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	inline,
	tidesEmptyLabel,
}: {
	seed: number
	moonCount: number
	moons: MoonParams[]
	/** When this card is for a moon (not a planet), the tide raisers are its
	 * parent + peer orbits rather than its own children -- see
	 * computeMoonTidalSchedule. */
	moonContext?: {
		moon: MoonParams
		parent: {
			idx: number
			massKg: number
			diameterKm: number
			moons: MoonParams[]
		}
	}
	moonTideContext?: {
		daysPerYear: number
		hoursPerDay: number
	}
	daysPerYear: number
	hoursPerDay: number
	planetRadiusKm: number
	isSolarLocked: boolean
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	obliquity: number
	hydrosphereFraction: number
	atmosphere: AtmosphereProfile | null | undefined
	/** Real per-body EBM overrides -- see useEbmPreview.ts's EbmConfig doc.
	 * Pass these for an actual known body (sol-system.ts data); leave unset
	 * for a procedurally generated one, which falls back to the generic
	 * landFraction/pressure heuristics. */
	albedo?: number
	greenhouseFactor?: number
	internalHeatTempK?: number
	/** Overrides the tidal schedule this would otherwise compute internally --
	 * used only by the main world, whose own tides tab needs to switch to
	 * whichever moon is currently "focused" in the 3D view rather than always
	 * showing its own moons' aggregate schedule. Sibling bodies/moons don't
	 * pass this and just get the internally-computed one. */
	tidalSchedulePreviewOverride?: import("@/model/climate/tidal-schedule").TidalSchedule
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	inline?: boolean
	tidesEmptyLabel?: string
}) {
	const [enabled, setEnabled] = useState(false)
	const canRenderClimate =
		planetRadiusKm > 0 &&
		orbitalDistanceAU > 0 &&
		daysPerYear > 0 &&
		hoursPerDay > 0
	const content = canRenderClimate ? (
		<LazyPlanetDetailTabsContent
			seed={seed}
			moonCount={moonCount}
			moons={moons}
			moonContext={moonContext}
			moonTideContext={moonTideContext}
			daysPerYear={daysPerYear}
			hoursPerDay={hoursPerDay}
			planetRadiusKm={planetRadiusKm}
			isSolarLocked={isSolarLocked}
			spectralClass={spectralClass}
			starSubtype={starSubtype}
			orbitalDistanceAU={orbitalDistanceAU}
			eccentricity={eccentricity}
			perihelion={perihelion}
			obliquity={obliquity}
			hydrosphereFraction={hydrosphereFraction}
			atmosphere={atmosphere}
			albedo={albedo}
			greenhouseFactor={greenhouseFactor}
			internalHeatTempK={internalHeatTempK}
			tidalSchedulePreviewOverride={tidalSchedulePreviewOverride}
			generationPreviewTab={generationPreviewTab}
			onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
			unitSystem={unitSystem}
			tidesEmptyLabel={tidesEmptyLabel}
		/>
	) : (
		<div className="mt-2 flex h-32 items-center justify-center px-1 text-[10px] text-slate-400">
			No climate preview for this object
		</div>
	)

	if (inline) {
		return <div className="pt-1">{content}</div>
	}

	return (
		<details
			className="group border-t border-slate-100 pt-2"
			onToggle={(event) => {
				if ((event.currentTarget as HTMLDetailsElement).open) setEnabled(true)
			}}
		>
			<DataSectionSummary />
			{enabled ? content : null}
		</details>
	)
}

function LazyPlanetDetailTabsContent({
	seed,
	moonCount,
	moons,
	moonContext,
	moonTideContext,
	daysPerYear,
	hoursPerDay,
	planetRadiusKm,
	isSolarLocked,
	spectralClass,
	starSubtype,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	obliquity,
	hydrosphereFraction,
	atmosphere,
	albedo,
	greenhouseFactor,
	internalHeatTempK,
	tidalSchedulePreviewOverride,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	tidesEmptyLabel,
}: {
	seed: number
	moonCount: number
	moons: MoonParams[]
	moonContext?: {
		moon: MoonParams
		parent: {
			idx: number
			massKg: number
			diameterKm: number
			moons: MoonParams[]
		}
	}
	moonTideContext?: {
		daysPerYear: number
		hoursPerDay: number
	}
	daysPerYear: number
	hoursPerDay: number
	planetRadiusKm: number
	isSolarLocked: boolean
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	obliquity: number
	hydrosphereFraction: number
	atmosphere: AtmosphereProfile | null | undefined
	albedo?: number
	greenhouseFactor?: number
	internalHeatTempK?: number
	tidalSchedulePreviewOverride?: import("@/model/climate/tidal-schedule").TidalSchedule
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	tidesEmptyLabel?: string
}) {
	const pressureBar = atmosphere?.pressureBar ?? 0
	const landFraction = Math.max(0, Math.min(1, 1 - hydrosphereFraction))
	const regularPreviewConfig = useMemo(
		() => ({
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			hoursPerDay,
			daysPerYear,
			landFraction,
			radius: planetRadiusKm,
			pressure: pressureBar,
			albedo,
			greenhouseFactor,
			internalHeatTempK,
		}),
		[
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			hoursPerDay,
			daysPerYear,
			landFraction,
			planetRadiusKm,
			pressureBar,
			albedo,
			greenhouseFactor,
			internalHeatTempK,
		],
	)
	const lockedPreviewConfig = useMemo(
		() => ({
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			hoursPerDay,
			daysPerYear,
			radius: planetRadiusKm,
			pressure: pressureBar,
			planetRadiusKm,
			antistellarLon: 180,
		}),
		[
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			hoursPerDay,
			daysPerYear,
			planetRadiusKm,
			pressureBar,
		],
	)
	const regularPreview = useEbmPreview(regularPreviewConfig)
	const lockedPreview = useLockedClimatePreview(lockedPreviewConfig)
	const climatePreview = isSolarLocked ? lockedPreview : regularPreview
	const previewAxis = "lats" in climatePreview ? climatePreview.lats : null
	const previewRowMeans = useMemo(
		() =>
			climatePreview.heat.map((row) =>
				row.length > 0
					? row.reduce((sum, value) => sum + value, 0) / row.length
					: 0,
			),
		[climatePreview],
	)
	useEffect(() => {
		console.log("[ClimatePreview] lat means", {
			seed,
			isSolarLocked,
			previewAxis,
			previewRowMeans,
			generationPreviewTab,
		})
	}, [seed, isSolarLocked, previewAxis, previewRowMeans, generationPreviewTab])
	const computedTidalSchedulePreview = useMemo(
		() =>
			moonContext
				? computeMoonTidalSchedule(moonContext.moon, moonContext.parent, {
						daysPerYear: moonTideContext?.daysPerYear ?? daysPerYear,
						hoursPerDay: moonTideContext?.hoursPerDay ?? hoursPerDay,
						spectralClass,
						starSubtype,
						orbitalDistanceAU,
						eccentricity,
						perihelion,
					})
				: moonCount > 0
					? computeTidalSchedule(moons, {
							seed,
							daysPerYear,
							hoursPerDay,
							planetRadiusKm,
							tideLock: null,
							spectralClass,
							starSubtype,
							orbitalDistanceAU,
							eccentricity,
							perihelion,
						})
					: undefined,
		[
			moonContext,
			moonTideContext,
			moonCount,
			moons,
			seed,
			daysPerYear,
			hoursPerDay,
			planetRadiusKm,
			spectralClass,
			starSubtype,
			orbitalDistanceAU,
			eccentricity,
			perihelion,
		],
	)
	// The main world passes an override so its tides tab can switch to
	// whichever moon is currently "focused" in the 3D view; everything else
	// just uses what it computed for its own moons above.
	const tidalSchedulePreview =
		tidalSchedulePreviewOverride ?? computedTidalSchedulePreview

	return (
		<PlanetDetailContent
			tidalSchedulePreview={tidalSchedulePreview}
			moonCount={moonCount}
			daysPerYear={daysPerYear}
			isSolarLocked={isSolarLocked}
			climatePreview={climatePreview}
			generationPreviewTab={generationPreviewTab}
			onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
			unitSystem={unitSystem}
			tidesEmptyLabel={tidesEmptyLabel}
		/>
	)
}

function appendSizeToTitle(
	title: string,
	sizeClass: number | undefined,
): string {
	void sizeClass
	return title
}

function resolveOrbitBodyTitle(
	body: SystemBody,
	bodyNumber: number,
	showRealSolNames: boolean,
): string {
	const baseTitle =
		showRealSolNames && body.name
			? body.name
			: `${SIBLING_GROUP_LABEL[body.group]} ${bodyNumber}`
	return body.group === "asteroid belt"
		? baseTitle
		: appendSizeToTitle(baseTitle, body.sizeClass)
}

function resolveMoonTitle(
	moon: MoonParams,
	moonNumber: number,
	showRealSolNames: boolean,
	fallbackRealName?: string,
): string {
	const name =
		showRealSolNames && moon.name
			? moon.name
			: showRealSolNames && fallbackRealName
				? fallbackRealName
				: `Moon ${moonNumber}`
	void moon.orbitRange
	return appendSizeToTitle(name, moon.sizeClass)
}

// Shared by every "Surface Tides" stat entry (main world, orbit planets,
// every moon) so the value/help/tooltip formatting only needs to exist once.
function buildSurfaceTidesStat(breakdown: SurfaceTidesBreakdown): StatEntry {
	const contributions = breakdown.contributions
		.slice()
		.sort((a, b) => b.valueM - a.valueM)
		.map((c) => `${c.label}: ${c.valueM.toFixed(3)} m`)
		.join("\n")
	return {
		label: "Surface Tides",
		value: `${breakdown.totalM.toFixed(3)} m`,
		help: contributions
			? `Peak upper bound only.\n──────────\n${contributions}`
			: "Peak upper bound only.",
	}
}

function buildMoonStats({
	diameterKm,
	massKg,
	gravityG,
	sizeClass,
	densityEarthRelative,
	densityDescription,
	group,
	classification,
	hydrosphereFraction,
	atmosphere,
	albedo,
	greenhouseFactor,
	pd,
	orbitalPeriodDays,
	siderealDayHours,
	eccentricity,
	argumentOfPeriapsisDeg,
	inclinationDeg,
	axialTiltDeg,
	parentOrbitalPeriodDays,
	surfaceTidesM,
	editors,
}: {
	diameterKm: number
	massKg: number
	gravityG: number
	sizeClass?: number
	densityEarthRelative?: number
	densityDescription?: string
	group?: string
	classification?: string
	hydrosphereFraction?: number
	atmosphere?: AtmosphereProfile | null
	albedo?: number
	greenhouseFactor?: number
	surfaceTidesM?: SurfaceTidesBreakdown
	pd: number
	orbitalPeriodDays: number
	/** Moon's own sidereal rotation period, in hours — independent of
	 * orbitalPeriodDays (not assumed to be tidally locked). */
	siderealDayHours: number
	eccentricity: number
	argumentOfPeriapsisDeg: number
	inclinationDeg: number
	axialTiltDeg: number
	parentOrbitalPeriodDays?: number
	editors?: {
		diameter?: StatEntry["editor"]
		semiMajorAxis?: StatEntry["editor"]
		siderealDay?: StatEntry["editor"]
		eccentricity?: StatEntry["editor"]
		periapsis?: StatEntry["editor"]
		inclination?: StatEntry["editor"]
		axialTilt?: StatEntry["editor"]
	}
}) {
	const diameterRel = diameterKm / EARTH_DIAMETER_KM
	const massRel = massKg / EARTH_MASS_KG

	return [
		...(group
			? [
					{
						label: "Group",
						value: formatClassificationLabel(group),
					},
				]
			: []),
		...(classification
			? [
					{
						label: "Class",
						value: formatClassificationLabel(classification),
					},
				]
			: []),
		...(sizeClass !== undefined
			? [{ label: "Size", value: String(sizeClass) }]
			: []),
		{
			label: "Radius",
			value: `${diameterRel.toFixed(2)} R⊕`,
			editor: editors?.diameter,
		},
		{
			label: "Mass",
			value: `${massRel.toFixed(3)} M⊕`,
		},
		{ label: "Gravity", value: `${gravityG.toFixed(3)} g` },
		{
			label: "Semi Major Axis",
			value: `${pd.toFixed(1)} PD`,
			editor: editors?.semiMajorAxis,
		},
		{
			label: "Period",
			value: formatDays(orbitalPeriodDays),
		},
		...(parentOrbitalPeriodDays
			? buildDayLengthStats({
					siderealDayHours,
					orbitalPeriodDays: parentOrbitalPeriodDays,
					retrograde: inferRetrogradeRotationFromAxialTiltDeg(axialTiltDeg),
					siderealEditor: editors?.siderealDay,
				})
			: []),
		{
			label: "Eccentricity",
			value: eccentricity.toFixed(4),
			editor: editors?.eccentricity,
		},
		{
			label: "Periapsis",
			value: `${argumentOfPeriapsisDeg.toFixed(1)}°`,
			help: ORBIT_STAT_HELP.periapsis,
			editor: editors?.periapsis,
		},
		{
			label: "Inclination",
			value: `${inclinationDeg.toFixed(1)}°`,
			editor: editors?.inclination,
		},
		{
			label: "Axial Tilt",
			value: `${axialTiltDeg.toFixed(1)}°`,
			editor: editors?.axialTilt,
		},
		...(densityEarthRelative !== undefined
			? [
					{
						label: "Density",
						value: `${densityEarthRelative.toFixed(2)} rhoE${densityDescription ? ` · ${densityDescription}` : ""}`,
					},
				]
			: []),
		...(atmosphere !== undefined
			? [{ label: "Atmosphere", value: formatAtmosphereLabel(atmosphere) }]
			: []),
		...(hydrosphereFraction !== undefined
			? [
					{
						label: "Hydrosphere",
						value: `${Math.round(hydrosphereFraction * 100)}%`,
					},
				]
			: []),
		...(albedo !== undefined
			? [{ label: "Albedo", value: albedo.toFixed(3) }]
			: []),
		{ label: "Greenhouse", value: (greenhouseFactor ?? 0).toFixed(2) },
		...(surfaceTidesM ? [buildSurfaceTidesStat(surfaceTidesM)] : []),
	]
}

const SIBLING_GROUP_LABEL: Record<SystemBody["group"], string> = {
	"asteroid belt": "Asteroid Belt",
	dwarf: "Dwarf World",
	terrestrial: "Terrestrial Planet",
	helian: "Helian World",
	jovian: "Jovian Planet",
}

const SIBLING_GROUP_COLOR: Record<SystemBody["group"], string> = {
	"asteroid belt": "text-slate-500",
	dwarf: "text-stone-600",
	terrestrial: "text-blue-700",
	helian: "text-cyan-700",
	jovian: "text-amber-700",
}

function buildOrbitBodyStats(params: {
	body: SystemBody
	starMassSol: number
	surfaceTidesM?: SurfaceTidesBreakdown
	onUpdateBody?: (updater: (body: SystemBody) => SystemBody) => void
}): StatEntry[] {
	const { body, starMassSol, surfaceTidesM, onUpdateBody } = params
	if (body.group === "asteroid belt") {
		return [
			{
				label: "Group",
				value: formatClassificationLabel(body.group),
			},
			{
				label: "Class",
				value: formatClassificationLabel(body.classification),
			},
			{
				label: "Semi Major Axis",
				value: `${body.orbitalDistanceAU.toFixed(3)} AU`,
			},
			{ label: "Period", value: formatDays(body.orbitalPeriodDays) },
		]
	}
	return [
		{
			label: "Group",
			value: formatClassificationLabel(body.group),
		},
		{
			label: "Class",
			value: formatClassificationLabel(body.classification),
		},
		{
			label: "Radius",
			value: `${(body.diameterKm / EARTH_DIAMETER_KM).toFixed(2)} R⊕`,
			editor: onUpdateBody
				? {
						label: "Radius",
						value: body.diameterKm / EARTH_DIAMETER_KM,
						min: 0.1,
						max: 18,
						step: 0.01,
						display: `${(body.diameterKm / EARTH_DIAMETER_KM).toFixed(2)} R⊕`,
						set: (value: number) =>
							onUpdateBody((current) =>
								updateBodyDiameter(current, value * EARTH_DIAMETER_KM),
							),
					}
				: undefined,
		},
		{
			label: "Mass",
			value: `${(body.massKg / EARTH_MASS_KG).toFixed(2)} M⊕`,
		},
		{ label: "Gravity", value: `${body.gravityG.toFixed(3)} g` },
		{
			label: "Semi Major Axis",
			value: `${body.orbitalDistanceAU.toFixed(3)} AU`,
			editor: onUpdateBody
				? {
						label: "Semi Major Axis",
						value: body.orbitalDistanceAU,
						min: 0.01,
						max: 60,
						step: 0.01,
						display: `${body.orbitalDistanceAU.toFixed(3)} AU`,
						set: (value: number) =>
							onUpdateBody((current) =>
								updateBodyOrbitalDistance(current, value, starMassSol),
							),
					}
				: undefined,
		},
		{ label: "Period", value: formatDays(body.orbitalPeriodDays) },
		...buildDayLengthStats({
			siderealDayHours: body.siderealDayHours,
			orbitalPeriodDays: body.orbitalPeriodDays,
			retrograde: inferRetrogradeRotationFromAxialTiltDeg(body.axialTiltDeg),
			siderealEditor: onUpdateBody
				? {
						label: "Sidereal Day",
						value: body.siderealDayHours,
						min: 1,
						max: body.orbitalPeriodDays * 24 * 2,
						step: 0.1,
						display: formatHours(body.siderealDayHours),
						set: (value: number) =>
							onUpdateBody((current) => ({
								...current,
								siderealDayHours: value,
							})),
					}
				: undefined,
		}),
		{
			label: "Eccentricity",
			value: body.eccentricity.toFixed(4),
			editor: onUpdateBody
				? {
						label: "Eccentricity",
						value: body.eccentricity,
						min: 0,
						max: 0.99,
						step: 0.001,
						display: body.eccentricity.toFixed(4),
						set: (value: number) =>
							onUpdateBody((current) => ({ ...current, eccentricity: value })),
					}
				: undefined,
		},
		{
			label: "Periapsis",
			value: `${body.argumentOfPeriapsisDeg.toFixed(0)}°`,
			help: ORBIT_STAT_HELP.periapsis,
			editor: onUpdateBody
				? {
						label: "Periapsis",
						value: body.argumentOfPeriapsisDeg,
						min: 0,
						max: 360,
						step: 1,
						display: `${body.argumentOfPeriapsisDeg.toFixed(0)}°`,
						set: (value: number) =>
							onUpdateBody((current) => ({
								...current,
								argumentOfPeriapsisDeg: value,
							})),
					}
				: undefined,
		},
		{
			label: "Inclination",
			value: `${body.inclinationDeg.toFixed(1)}°`,
			editor: onUpdateBody
				? {
						label: "Inclination",
						value: body.inclinationDeg,
						min: 0,
						max: 180,
						step: 0.5,
						display: `${body.inclinationDeg.toFixed(1)}°`,
						set: (value: number) =>
							onUpdateBody((current) => ({
								...current,
								inclinationDeg: value,
							})),
					}
				: undefined,
		},
		{
			label: "Axial Tilt",
			value: `${body.axialTiltDeg.toFixed(1)}°`,
			editor: onUpdateBody
				? {
						label: "Axial Tilt",
						value: body.axialTiltDeg,
						min: 0,
						max: 180,
						step: 0.5,
						display: `${body.axialTiltDeg.toFixed(1)}°`,
						set: (value: number) =>
							onUpdateBody((current) => ({ ...current, axialTiltDeg: value })),
					}
				: undefined,
		},
		...(body.density
			? [
					{
						label: "Density",
						value: `${body.density.earthRelative.toFixed(2)} rhoE · ${body.density.description}`,
					},
				]
			: []),
		{ label: "Atmosphere", value: formatAtmosphereLabel(body.atmosphere) },
		{
			label: "Hydrosphere",
			value: `${Math.round(body.hydrosphereFraction * 100)}%`,
		},
		...(body.albedo !== undefined
			? [{ label: "Albedo", value: body.albedo.toFixed(3) }]
			: []),
		{
			label: "Greenhouse",
			value: (body.greenhouseFactor ?? 0).toFixed(2),
		},
		...(surfaceTidesM ? [buildSurfaceTidesStat(surfaceTidesM)] : []),
	]
}

interface MainBodyStatsConfig {
	group?: StatEntry
	classification?: StatEntry
	sizeClass?: StatEntry
	diameter: StatEntry
	mass: StatEntry
	gravity: StatEntry
	density?: StatEntry
	semiMajorAxis: StatEntry
	period: StatEntry
	dayLengths?: StatEntry[]
	eccentricity: StatEntry
	periapsis: StatEntry
	inclination: StatEntry
	axialTilt: StatEntry
	antistellarLon?: StatEntry
	atmosphere?: StatEntry
	extra?: StatEntry[]
}

// Single source of truth for the stat list/order shown on every "main body"
// card (the Terrestrial Planet card in TerrestrialSystemCards) — each caller
// still builds its own StatEntry objects (with whatever editor a given field
// has, since that varies per body), but the shape and the Inclination row
// only need to exist once.
function buildMainBodyStats(config: MainBodyStatsConfig): StatEntry[] {
	return [
		...(config.group ? [config.group] : []),
		...(config.classification ? [config.classification] : []),
		...(config.sizeClass ? [config.sizeClass] : []),
		config.diameter,
		config.mass,
		config.gravity,
		...(config.density ? [config.density] : []),
		config.semiMajorAxis,
		config.period,
		...(config.dayLengths ?? []),
		config.eccentricity,
		config.periapsis,
		config.inclination,
		config.axialTilt,
		...(config.antistellarLon ? [config.antistellarLon] : []),
		...(config.atmosphere ? [config.atmosphere] : []),
		...(config.extra ?? []),
	]
}

// Shares buildMoonStats with every other moon card in this panel (the main
// world's own moons, a gas giant's orbit moons) so all moons present the
// same stat set regardless of which body they orbit.
function buildOrbitMoonStats(params: {
	moon: MoonParams
	parentOrbitalPeriodDays: number
	hoursPerDay: number
	pdOverride?: number
	surfaceTidesM?: SurfaceTidesBreakdown
	onUpdateMoon?: (
		updater: (moon: MoonParams, parentBody: SystemBody) => MoonParams,
	) => void
}): StatEntry[] {
	const {
		moon,
		parentOrbitalPeriodDays,
		hoursPerDay,
		pdOverride,
		surfaceTidesM,
		onUpdateMoon,
	} = params
	const pd = moon.semiMajorAxisPlanetDiameters ?? pdOverride ?? 0
	const gravityG =
		(6.674e-11 * moon.massKg) / ((moon.diameterKm / 2) * 1000) ** 2 / 9.807
	return buildMoonStats({
		diameterKm: moon.diameterKm,
		massKg: moon.massKg,
		gravityG,
		sizeClass: moon.sizeClass,
		densityEarthRelative: moon.densityEarthRelative,
		densityDescription: moon.densityDescription,
		group: moon.group,
		classification: moon.classification,
		hydrosphereFraction: moon.hydrosphereFraction,
		atmosphere: moon.atmosphere,
		albedo: moon.albedo,
		greenhouseFactor: moon.greenhouseFactor,
		surfaceTidesM,
		pd,
		orbitalPeriodDays: moon.orbitalPeriodDays,
		siderealDayHours: moon.siderealDayHours,
		eccentricity: moon.eccentricity,
		argumentOfPeriapsisDeg: moon.argumentOfPeriapsisDeg,
		inclinationDeg: moon.inclinationDeg,
		axialTiltDeg: moon.axialTiltDeg,
		parentOrbitalPeriodDays,
		editors: onUpdateMoon
			? {
					diameter: {
						label: "Radius",
						value: moon.diameterKm / EARTH_DIAMETER_KM,
						min: 0.01,
						max: 3,
						step: 0.01,
						display: `${(moon.diameterKm / EARTH_DIAMETER_KM).toFixed(2)} R⊕`,
						set: (value: number) =>
							onUpdateMoon((current) =>
								updateMoonDiameter(current, value * EARTH_DIAMETER_KM),
							),
					},
					semiMajorAxis: {
						label: "Semi Major Axis",
						value: pd,
						min: 0.5,
						max: 120,
						step: 0.1,
						display: `${pd.toFixed(1)} PD`,
						set: (value: number) =>
							onUpdateMoon((current, body) =>
								updateMoonSemiMajorAxis(current, body, value, hoursPerDay),
							),
					},
					siderealDay: {
						label: "Sidereal Day",
						value: moon.siderealDayHours,
						min: 1,
						max: moon.orbitalPeriodDays * 24 * 2,
						step: 0.1,
						display: formatHours(moon.siderealDayHours),
						set: (value: number) =>
							onUpdateMoon((current) => ({
								...current,
								siderealDayHours: value,
							})),
					},
					eccentricity: {
						label: "Eccentricity",
						value: moon.eccentricity,
						min: 0,
						max: 0.99,
						step: 0.001,
						display: moon.eccentricity.toFixed(4),
						set: (value: number) =>
							onUpdateMoon((current) => ({ ...current, eccentricity: value })),
					},
					periapsis: {
						label: "Periapsis",
						value: moon.argumentOfPeriapsisDeg,
						min: 0,
						max: 360,
						step: 1,
						display: `${moon.argumentOfPeriapsisDeg.toFixed(1)}°`,
						set: (value: number) =>
							onUpdateMoon((current) => ({
								...current,
								argumentOfPeriapsisDeg: value,
							})),
					},
					inclination: {
						label: "Inclination",
						value: moon.inclinationDeg,
						min: 0,
						max: 180,
						step: 0.5,
						display: `${moon.inclinationDeg.toFixed(1)}°`,
						set: (value: number) =>
							onUpdateMoon((current) => ({
								...current,
								inclinationDeg: value,
							})),
					},
					axialTilt: {
						label: "Axial Tilt",
						value: moon.axialTiltDeg,
						min: 0,
						max: 180,
						step: 0.5,
						display: `${moon.axialTiltDeg.toFixed(1)}°`,
						set: (value: number) =>
							onUpdateMoon((current) => ({ ...current, axialTiltDeg: value })),
					},
				}
			: undefined,
	})
}

interface LabeledOrbitBody {
	body: SystemBody
	title: string
}

// Numbers orbits per group once, independent of where each card ends up
// rendered — the main world's own card is interleaved among these by AU,
// which would otherwise reset the counters if numbering were computed
// separately per render group.
function labelOrbitBodies(
	bodies: SystemBody[],
	showRealSolNames: boolean,
): LabeledOrbitBody[] {
	const groupCounters: Record<SystemBody["group"], number> = {
		"asteroid belt": 0,
		dwarf: 0,
		terrestrial: 0,
		helian: 0,
		jovian: 0,
	}
	return bodies.map((body) => {
		groupCounters[body.group] += 1
		return {
			body,
			title: resolveOrbitBodyTitle(
				body,
				groupCounters[body.group],
				showRealSolNames,
			),
		}
	})
}

function _OrbitBodyCard({
	body,
	title,
	bodyIndex,
	restSeed,
	showRealSolNames,
	starMassSol,
	spectralClass,
	starSubtype,
	hoursPerDay,
	unitSystem,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	onFocusBody,
	onUpdateSystemBody,
	onUpdateSystemMoon,
}: LabeledOrbitBody & {
	bodyIndex: number
	restSeed: number
	showRealSolNames: boolean
	starMassSol: number
	spectralClass: string
	starSubtype: number
	hoursPerDay: number
	unitSystem: UnitSystem
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	onFocusBody?: (bodyIndex: number, moonIndex?: number) => void
	onUpdateSystemBody?: (
		bodyIndex: number,
		updater: (body: SystemBody) => SystemBody,
	) => void
	onUpdateSystemMoon?: (
		bodyIndex: number,
		moonIndex: number,
		updater: (moon: MoonParams, parentBody: SystemBody) => MoonParams,
	) => void
}) {
	const gpsButton = onFocusBody ? (
		<GpsFocusButton onClick={() => onFocusBody(bodyIndex)} />
	) : undefined
	const bodySurfaceTidesM =
		body.group === "asteroid belt"
			? undefined
			: computeSurfaceTidesM(
					body.moons,
					{ diameterKm: body.diameterKm, tideLock: body.tideLock },
					{
						hoursPerDay,
						spectralClass,
						starSubtype,
						orbitalDistanceAU: body.orbitalDistanceAU,
						eccentricity: body.eccentricity,
						starName:
							showRealSolNames && restSeed === SOL_SEED
								? SOL_STAR_NAME
								: undefined,
					},
				)
	return (
		<SystemBodyCard
			className="border-slate-100"
			summaryClassName={SIBLING_GROUP_COLOR[body.group]}
			title={title}
			stats={buildOrbitBodyStats({
				body,
				starMassSol,
				surfaceTidesM: bodySurfaceTidesM,
				onUpdateBody:
					onUpdateSystemBody && bodyIndex >= 0
						? (updater) => onUpdateSystemBody(bodyIndex, updater)
						: undefined,
			})}
			gpsButton={gpsButton}
		>
			{body.moons.map((moon, moonIndex) => (
				<MoonSystemCard
					key={moon.idx ?? moonIndex}
					summaryClassName="text-emerald-700"
					title={resolveMoonTitle(moon, moonIndex + 1, showRealSolNames)}
					stats={buildOrbitMoonStats({
						moon,
						surfaceTidesM: computeMoonSurfaceTidesM(
							moon,
							{
								name: showRealSolNames ? body.name : undefined,
								massKg: body.massKg,
								diameterKm: body.diameterKm,
								moons: body.moons,
							},
							{
								hoursPerDay,
								spectralClass,
								starSubtype,
								orbitalDistanceAU: body.orbitalDistanceAU,
								eccentricity: body.eccentricity,
								starName:
									showRealSolNames && restSeed === SOL_SEED
										? SOL_STAR_NAME
										: undefined,
							},
						),
						parentOrbitalPeriodDays: body.orbitalPeriodDays,
						hoursPerDay,
						onUpdateMoon:
							onUpdateSystemMoon && bodyIndex >= 0
								? (updater) => onUpdateSystemMoon(bodyIndex, moonIndex, updater)
								: undefined,
					})}
					gpsButton={
						onFocusBody ? (
							<GpsFocusButton
								onClick={() => onFocusBody(bodyIndex, moonIndex)}
							/>
						) : undefined
					}
				>
					<LazyPlanetDetailTabs
						seed={restSeed}
						moonCount={0}
						moons={[]}
						moonContext={{
							moon,
							parent: {
								idx: body.idx,
								massKg: body.massKg,
								diameterKm: body.diameterKm,
								moons: body.moons,
							},
						}}
						daysPerYear={body.orbitalPeriodDays}
						hoursPerDay={moon.siderealDayHours}
						planetRadiusKm={moon.diameterKm / 2}
						isSolarLocked={false}
						spectralClass={spectralClass}
						starSubtype={starSubtype}
						orbitalDistanceAU={body.orbitalDistanceAU}
						eccentricity={body.eccentricity}
						perihelion={body.argumentOfPeriapsisDeg}
						obliquity={moon.axialTiltDeg}
						hydrosphereFraction={moon.hydrosphereFraction ?? 0}
						atmosphere={moon.atmosphere}
						albedo={moon.albedo}
						generationPreviewTab={generationPreviewTab}
						onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
						unitSystem={unitSystem}
					/>
				</MoonSystemCard>
			))}
			<LazyPlanetDetailTabs
				seed={restSeed}
				moonCount={body.moons.length}
				moons={body.moons}
				daysPerYear={body.orbitalPeriodDays}
				hoursPerDay={body.siderealDayHours}
				planetRadiusKm={body.diameterKm / 2}
				isSolarLocked={isApproxSolarLocked(
					body.siderealDayHours,
					body.orbitalPeriodDays,
				)}
				spectralClass={spectralClass}
				starSubtype={starSubtype}
				orbitalDistanceAU={body.orbitalDistanceAU}
				eccentricity={body.eccentricity}
				perihelion={body.argumentOfPeriapsisDeg}
				obliquity={body.axialTiltDeg}
				hydrosphereFraction={body.hydrosphereFraction}
				atmosphere={body.atmosphere}
				albedo={body.albedo}
				greenhouseFactor={body.greenhouseFactor}
				internalHeatTempK={body.internalHeatTempK}
				generationPreviewTab={generationPreviewTab}
				onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
				unitSystem={unitSystem}
			/>
		</SystemBodyCard>
	)
}

function _StellarSystemCard({
	spectralClass,
	starSubtype,
	restSeed,
	showRealSolNames,
	lockButton,
	gpsButton,
	setSpectralClass,
	setStarSubtype,
}: {
	spectralClass: string
	starSubtype: number
	restSeed: number
	showRealSolNames: boolean
	lockButton?: React.ReactNode
	gpsButton?: React.ReactNode
	setSpectralClass?: (v: string) => void
	setStarSubtype?: (v: number) => void
}) {
	const starClass: MainSequenceClass = isValidSpectralClass(spectralClass)
		? spectralClass
		: "G"
	const typeStatValue = getStarLabel(starClass, starSubtype)
	const title = showRealSolNames
		? `Sol · ${typeStatValue} Star`
		: `${typeStatValue} Star`
	const starStats = buildStarStats({
		starClass,
		starSubtype,
		restSeed,
		setSpectralClass,
		setStarSubtype,
	})

	return (
		<details className="group rounded border border-yellow-200 bg-white/85 px-2 py-1.5 shadow-sm shadow-slate-200/20">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-yellow-700">
				<span>{title}</span>
				<div className="flex items-center gap-1">
					{lockButton}
					{gpsButton}
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-slate-400 transition-transform group-open:rotate-180"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</div>
			</summary>
			<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
				{renderStatGrid(starStats)}
			</div>
		</details>
	)
}

function buildTerrestrialWorldStats(params: {
	group?: SystemBody["group"]
	classification?: SystemBody["classification"]
	sizeClass?: number
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	surfaceTidesM?: SurfaceTidesBreakdown
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setHoursPerDay: (v: number) => void
	radiusSlider?: SliderDef
	orbitalDistanceSlider?: SliderDef
	dayLengthSlider?: SliderDef
	antistellarLonSlider?: SliderDef
	pressureSlider?: SliderDef
	eccentricitySlider?: SliderDef
	perihelionSlider?: SliderDef
	axialTiltSlider?: SliderDef
	isRetrograde: boolean
	onToggleSpin?: () => void
	planetRadiusKm: number
	hoursPerDay: number
	daysPerYear: number
	surfaceStats: StatEntry[]
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	axialTiltDisplay: string
	landCoverage: number
	inclinationDeg: number
	setInclinationDeg: (v: number) => void
}): StatEntry[] {
	const {
		group,
		classification,
		radiusSlider,
		orbitalDistanceSlider,
		dayLengthSlider,
		antistellarLonSlider,
		pressureSlider,
		eccentricitySlider,
		perihelionSlider,
		axialTiltSlider,
		isRetrograde,
		onToggleSpin,
		planetRadiusKm,
		hoursPerDay,
		daysPerYear,
		surfaceStats,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
		axialTiltDisplay,
		landCoverage,
		inclinationDeg,
		setInclinationDeg,
		tideLock,
	} = params
	const planetDiamKm = planetRadiusKm * 2
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const planetMassEarths = planetMassKg / EARTH_MASS_KG
	const planetGravityG =
		(6.674e-11 * planetMassKg) / (planetRadiusKm * 1000) ** 2 / 9.807
	const planetDensityEarthRelative = computeEarthRelativeDensity(
		planetMassKg,
		planetDiamKm,
	)
	const earthDiamRel = (planetDiamKm / EARTH_DIAMETER_KM).toFixed(2)
	const isSolarLocked = tideLock?.type === "solar"

	return buildMainBodyStats({
		group: group
			? { label: "Group", value: formatClassificationLabel(group) }
			: undefined,
		classification: classification
			? {
					label: "Class",
					value: formatClassificationLabel(classification),
				}
			: undefined,
		diameter: {
			label: "Radius",
			value: `${earthDiamRel} R⊕`,
			editor: radiusSlider
				? {
						label: "Radius",
						value: radiusSlider.value * 2,
						min: radiusSlider.min * 2,
						max: radiusSlider.max * 2,
						step: radiusSlider.step * 2,
						display: `${((radiusSlider.value * 2) / EARTH_DIAMETER_KM).toFixed(2)} R⊕`,
						set: (v: number) => radiusSlider.set(v / 2),
					}
				: undefined,
		},
		mass: { label: "Mass", value: `${planetMassEarths.toFixed(2)} M⊕` },
		gravity: { label: "Gravity", value: `${planetGravityG.toFixed(3)} g` },
		density: {
			label: "Density",
			value: `${planetDensityEarthRelative.toFixed(2)} rhoE · Mostly Rock`,
		},
		semiMajorAxis: {
			label: "Semi Major Axis",
			value: `${orbitalDistanceAU.toFixed(3)} AU`,
			editor: orbitalDistanceSlider
				? {
						label: "Semi Major Axis",
						value: orbitalDistanceSlider.value,
						min: orbitalDistanceSlider.min,
						max: orbitalDistanceSlider.max,
						step: orbitalDistanceSlider.step,
						display: orbitalDistanceSlider.display,
						set: orbitalDistanceSlider.set,
					}
				: undefined,
		},
		period: { label: "Period", value: formatDays(daysPerYear) },
		dayLengths: buildDayLengthStats({
			siderealDayHours: hoursPerDay,
			orbitalPeriodDays: daysPerYear,
			retrograde: isRetrograde,
			siderealEditor: dayLengthSlider
				? {
						label: "Sidereal Day",
						value: dayLengthSlider.value,
						min: dayLengthSlider.min,
						max: dayLengthSlider.max,
						step: dayLengthSlider.step,
						display: dayLengthSlider.display,
						set: dayLengthSlider.set,
					}
				: undefined,
		}),
		eccentricity: {
			label: "Eccentricity",
			value: eccentricity.toFixed(4),
			editor: eccentricitySlider
				? {
						label: "Eccentricity",
						value: eccentricitySlider.value,
						min: eccentricitySlider.min,
						max: eccentricitySlider.max,
						step: eccentricitySlider.step,
						display: eccentricitySlider.display,
						set: (v: number) => eccentricitySlider.set(v),
					}
				: undefined,
		},
		periapsis: {
			label: "Periapsis",
			value: `${perihelion.toFixed(0)}°`,
			help: ORBIT_STAT_HELP.periapsis,
			editor: perihelionSlider
				? {
						label: "Periapsis",
						value: perihelionSlider.value,
						min: perihelionSlider.min,
						max: perihelionSlider.max,
						step: perihelionSlider.step,
						display: perihelionSlider.display,
						set: (v: number) => perihelionSlider.set(v),
					}
				: undefined,
		},
		inclination: {
			label: "Inclination",
			value: `${inclinationDeg.toFixed(1)}°`,
			editor: {
				label: "Inclination",
				value: inclinationDeg,
				min: 0,
				max: 180,
				step: 0.5,
				display: `${inclinationDeg.toFixed(1)}°`,
				set: setInclinationDeg,
			},
		},
		axialTilt: {
			label: "Axial Tilt",
			value: axialTiltDisplay,
			editor: axialTiltSlider
				? {
						label: "Axial Tilt",
						value: axialTiltSlider.value,
						min: axialTiltSlider.min,
						max: axialTiltSlider.max,
						step: axialTiltSlider.step,
						display: axialTiltSlider.display,
						set: (v: number) => axialTiltSlider.set(v),
						content: (
							<div className="flex w-44 flex-col px-1 pt-0.5 pb-2">
								<div className="flex items-center justify-between gap-2">
									<div className="flex items-center gap-2 min-w-0">
										{onToggleSpin ? (
											<UITooltip
												content={
													isRetrograde
														? "switch to prograde"
														: "switch to retrograde"
												}
												position="top"
												align="center"
											>
												<button
													type="button"
													onClick={onToggleSpin}
													className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
												>
													{isRetrograde ? (
														<AxisRotateCounterClockwiseIcon className="h-3 w-3" />
													) : (
														<AxisRotateClockwiseIcon className="h-3 w-3" />
													)}
												</button>
											</UITooltip>
										) : null}
										<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
											{axialTiltSlider.label}
										</span>
									</div>
									<span className="font-mono text-[10px] text-slate-400">
										{axialTiltSlider.display}
									</span>
								</div>
								<input
									type="range"
									min={axialTiltSlider.min}
									max={axialTiltSlider.max}
									step={axialTiltSlider.step}
									value={axialTiltSlider.value}
									onChange={(event) =>
										axialTiltSlider.set(parseFloat(event.target.value))
									}
									className="mt-3 h-1 w-full cursor-pointer rounded-lg accent-slate-900"
								/>
							</div>
						),
					}
				: undefined,
		},
		antistellarLon:
			isSolarLocked && antistellarLonSlider
				? {
						label: "Antistellar Lon",
						value: antistellarLonSlider.display,
						editor: {
							label: "Antistellar Lon",
							value: antistellarLonSlider.value,
							min: antistellarLonSlider.min,
							max: antistellarLonSlider.max,
							step: antistellarLonSlider.step,
							display: antistellarLonSlider.display,
							set: antistellarLonSlider.set,
						},
					}
				: undefined,
		atmosphere: {
			label: "Atmosphere",
			valuePrefix: formatPressureBar(pressureSlider?.value ?? 1),
			value: ` · ${formatAtmosphereSuffix(
				buildPressureAtmosphereProfile(pressureSlider?.value ?? 1),
			)}`,
			editor: pressureSlider
				? {
						label: "Atmosphere",
						value: pressureSlider.value,
						min: pressureSlider.min,
						max: pressureSlider.max,
						step: pressureSlider.step,
						display: pressureSlider.display,
						set: pressureSlider.set,
					}
				: undefined,
		},
		extra: [
			...surfaceStats,
			{ label: "Albedo", value: estimateAlbedo(landCoverage).toFixed(3) },
			{
				label: "Greenhouse",
				value: estimateGreenhouseFactor(pressureSlider?.value ?? 1).toFixed(2),
			},
			...(params.surfaceTidesM
				? [buildSurfaceTidesStat(params.surfaceTidesM)]
				: []),
		],
	})
}

function _TerrestrialSystemCards({
	generatedMoons,
	tidalSchedulePreview,
	surfaceTidesM,
	tideLock,
	setTideLock,
	setHoursPerDay,
	radiusSlider,
	orbitalDistanceSlider,
	dayLengthSlider,
	antistellarLonSlider,
	pressureSlider,
	eccentricitySlider,
	perihelionSlider,
	axialTiltSlider,
	isRetrograde,
	onToggleSpin,
	planetRadiusKm,
	restSeed,
	hoursPerDay,
	daysPerYear,
	moonCount,
	surfaceStats,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	axialTiltDisplay,
	obliquity,
	landCoverage,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	inclinationDeg,
	setInclinationDeg,
	bodyIndex,
	showRealSolNames,
	spectralClass,
	starSubtype,
	onFocusBody,
	onUpdateSystemMoon,
	group,
	classification,
	sizeClass,
}: {
	bodyIndex: number
	showRealSolNames: boolean
	spectralClass: string
	starSubtype: number
	onFocusBody?: (bodyIndex: number, moonIndex?: number) => void
	onUpdateSystemMoon?: (
		bodyIndex: number,
		moonIndex: number,
		updater: (moon: MoonParams, parentBody: SystemBody) => MoonParams,
	) => void
	group?: SystemBody["group"]
	classification?: SystemBody["classification"]
	sizeClass?: number
	generatedMoons: import("@/model/celestial/moons/moon-types").MoonParams[]
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	surfaceTidesM?: SurfaceTidesBreakdown
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setHoursPerDay: (v: number) => void
	radiusSlider?: SliderDef
	orbitalDistanceSlider?: SliderDef
	dayLengthSlider?: SliderDef
	antistellarLonSlider?: SliderDef
	pressureSlider?: SliderDef
	eccentricitySlider?: SliderDef
	perihelionSlider?: SliderDef
	axialTiltSlider?: SliderDef
	isRetrograde: boolean
	onToggleSpin?: () => void
	planetRadiusKm: number
	restSeed: number
	hoursPerDay: number
	daysPerYear: number
	moonCount: number
	surfaceStats: StatEntry[]
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	axialTiltDisplay: string
	obliquity: number
	landCoverage: number
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	inclinationDeg: number
	setInclinationDeg: (v: number) => void
}) {
	const planetDiamKm = planetRadiusKm * 2
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		hoursPerDay,
		tideLock,
	)
	const isSolarLocked = tideLock?.type === "solar"
	const worldStats = buildTerrestrialWorldStats({
		group,
		classification,
		sizeClass,
		tidalSchedulePreview,
		surfaceTidesM,
		tideLock,
		setTideLock,
		setHoursPerDay,
		radiusSlider,
		orbitalDistanceSlider,
		dayLengthSlider,
		antistellarLonSlider,
		pressureSlider,
		eccentricitySlider,
		perihelionSlider,
		axialTiltSlider,
		isRetrograde,
		onToggleSpin,
		planetRadiusKm,
		hoursPerDay,
		daysPerYear,
		surfaceStats,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
		axialTiltDisplay,
		landCoverage,
		inclinationDeg,
		setInclinationDeg,
	})

	const gpsButton = onFocusBody ? (
		<GpsFocusButton onClick={() => onFocusBody(bodyIndex)} />
	) : undefined

	return (
		<SystemBodyCard
			className="border-blue-200"
			summaryClassName="text-blue-700"
			title={appendSizeToTitle(
				showRealSolNames ? SOL_MAIN_WORLD_NAME : "Terrestrial Planet",
				sizeClass,
			)}
			defaultOpen
			stats={worldStats}
			gpsButton={gpsButton}
		>
			{generatedMoons.map((moon, i) => {
				const sma = moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay)
				const pd =
					moon.semiMajorAxisPlanetDiameters ?? sma / (planetRadiusKm * 2000)
				const isThisMoonLocked =
					tideLock?.type === "lunar" && tideLock.target === moon.idx
				const otherLockActive = tideLock !== null && !isThisMoonLocked

				return (
					<MoonSystemCard
						key={moon.idx}
						summaryClassName={
							MOON_COLORS_CSS[i % MOON_COLORS_CSS.length] ?? "text-slate-600"
						}
						title={resolveMoonTitle(
							moon,
							i + 1,
							showRealSolNames,
							i === 0 ? "Luna" : undefined,
						)}
						gpsButton={
							onFocusBody ? (
								<GpsFocusButton onClick={() => onFocusBody(bodyIndex, i)} />
							) : undefined
						}
						lockButton={
							<button
								type="button"
								disabled={otherLockActive}
								onClick={(event) => {
									event.preventDefault()
									if (isThisMoonLocked) {
										setTideLock(null)
										setHoursPerDay(24)
										return
									}
									setTideLock({
										type: "lunar",
										target: moon.idx,
									})
									setHoursPerDay(moon.orbitalPeriodDays * 24)
								}}
								className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
							>
								{isThisMoonLocked ? (
									<LockIcon className="h-3 w-3" />
								) : (
									<LockOpenIcon className="h-3 w-3" />
								)}
							</button>
						}
						stats={buildMoonStats({
							diameterKm: moon.diameterKm,
							massKg: moon.massKg,
							gravityG:
								(6.674e-11 * moon.massKg) /
								((moon.diameterKm / 2) * 1000) ** 2 /
								9.807,
							sizeClass: moon.sizeClass,
							densityEarthRelative: moon.densityEarthRelative,
							densityDescription: moon.densityDescription,
							group: moon.group,
							classification: moon.classification,
							hydrosphereFraction: moon.hydrosphereFraction,
							atmosphere: moon.atmosphere,
							greenhouseFactor: moon.greenhouseFactor,
							surfaceTidesM: computeMoonSurfaceTidesM(
								moon,
								{
									name: showRealSolNames ? SOL_MAIN_WORLD_NAME : undefined,
									massKg: planetMassKg,
									diameterKm: planetDiamKm,
									moons: generatedMoons,
								},
								{
									hoursPerDay,
									spectralClass,
									starSubtype,
									orbitalDistanceAU,
									eccentricity,
									starName:
										showRealSolNames && restSeed === SOL_SEED
											? SOL_STAR_NAME
											: undefined,
								},
							),
							pd,
							orbitalPeriodDays: moon.orbitalPeriodDays,
							siderealDayHours: moon.siderealDayHours,
							eccentricity: moon.eccentricity,
							argumentOfPeriapsisDeg: moon.argumentOfPeriapsisDeg,
							inclinationDeg: moon.inclinationDeg,
							axialTiltDeg: moon.axialTiltDeg,
							parentOrbitalPeriodDays: daysPerYear,
							editors:
								onUpdateSystemMoon && bodyIndex >= 0
									? {
											diameter: {
												label: "Radius",
												value: moon.diameterKm / EARTH_DIAMETER_KM,
												min: 0.01,
												max: 3,
												step: 0.01,
												display: `${(moon.diameterKm / EARTH_DIAMETER_KM).toFixed(2)} R⊕`,
												set: (value: number) =>
													onUpdateSystemMoon(bodyIndex, i, (current) =>
														updateMoonDiameter(
															current,
															value * EARTH_DIAMETER_KM,
														),
													),
											},
											semiMajorAxis: {
												label: "Semi Major Axis",
												value: pd,
												min: 0.5,
												max: 120,
												step: 0.1,
												display: `${pd.toFixed(1)} PD`,
												set: (value: number) =>
													onUpdateSystemMoon(
														bodyIndex,
														i,
														(current, parentBody) =>
															updateMoonSemiMajorAxis(
																current,
																parentBody,
																value,
																hoursPerDay,
															),
													),
											},
											siderealDay: {
												label: "Sidereal Day",
												value: moon.siderealDayHours,
												min: 1,
												max: moon.orbitalPeriodDays * 24 * 2,
												step: 0.1,
												display: formatHours(moon.siderealDayHours),
												set: (value: number) =>
													onUpdateSystemMoon(bodyIndex, i, (current) => ({
														...current,
														siderealDayHours: value,
													})),
											},
											eccentricity: {
												label: "Eccentricity",
												value: moon.eccentricity,
												min: 0,
												max: 0.99,
												step: 0.001,
												display: moon.eccentricity.toFixed(4),
												set: (value: number) =>
													onUpdateSystemMoon(bodyIndex, i, (current) => ({
														...current,
														eccentricity: value,
													})),
											},
											periapsis: {
												label: "Periapsis",
												value: moon.argumentOfPeriapsisDeg,
												min: 0,
												max: 360,
												step: 1,
												display: `${moon.argumentOfPeriapsisDeg.toFixed(1)}°`,
												set: (value: number) =>
													onUpdateSystemMoon(bodyIndex, i, (current) => ({
														...current,
														argumentOfPeriapsisDeg: value,
													})),
											},
											inclination: {
												label: "Inclination",
												value: moon.inclinationDeg,
												min: 0,
												max: 180,
												step: 0.5,
												display: `${moon.inclinationDeg.toFixed(1)}°`,
												set: (value: number) =>
													onUpdateSystemMoon(bodyIndex, i, (current) => ({
														...current,
														inclinationDeg: value,
													})),
											},
											axialTilt: {
												label: "Axial Tilt",
												value: moon.axialTiltDeg,
												min: 0,
												max: 180,
												step: 0.5,
												display: `${moon.axialTiltDeg.toFixed(1)}°`,
												set: (value: number) =>
													onUpdateSystemMoon(bodyIndex, i, (current) => ({
														...current,
														axialTiltDeg: value,
													})),
											},
										}
									: undefined,
						})}
					>
						<LazyPlanetDetailTabs
							seed={restSeed}
							moonCount={0}
							moons={[]}
							moonContext={{
								moon,
								parent: {
									// The main world's SystemBody.idx is always -1 (see
									// buildMainBody), regardless of its position in the
									// systemBodies array -- keep that in sync here so a
									// moon's tideLock: {type: "planet", target: -1} matches.
									idx: -1,
									massKg: planetMassKg,
									diameterKm: planetDiamKm,
									moons: generatedMoons,
								},
							}}
							daysPerYear={daysPerYear}
							hoursPerDay={moon.siderealDayHours}
							planetRadiusKm={moon.diameterKm / 2}
							isSolarLocked={false}
							spectralClass={spectralClass}
							starSubtype={starSubtype}
							orbitalDistanceAU={orbitalDistanceAU}
							eccentricity={eccentricity}
							perihelion={perihelion}
							obliquity={moon.axialTiltDeg}
							hydrosphereFraction={moon.hydrosphereFraction ?? 0}
							atmosphere={moon.atmosphere}
							generationPreviewTab={generationPreviewTab}
							onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
							unitSystem={unitSystem}
						/>
					</MoonSystemCard>
				)
			})}
			<LazyPlanetDetailTabs
				seed={restSeed}
				moonCount={moonCount}
				moons={generatedMoons}
				daysPerYear={daysPerYear}
				hoursPerDay={hoursPerDay}
				planetRadiusKm={planetRadiusKm}
				isSolarLocked={isSolarLocked}
				spectralClass={spectralClass}
				starSubtype={starSubtype}
				orbitalDistanceAU={orbitalDistanceAU}
				eccentricity={eccentricity}
				perihelion={perihelion}
				obliquity={obliquity}
				hydrosphereFraction={1 - landCoverage}
				atmosphere={buildPressureAtmosphereProfile(pressureSlider?.value ?? 1)}
				tidalSchedulePreviewOverride={tidalSchedulePreview}
				generationPreviewTab={generationPreviewTab}
				onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
				unitSystem={unitSystem}
			/>
		</SystemBodyCard>
	)
}

void _OrbitBodyCard
void _StellarSystemCard
void _TerrestrialSystemCards

type OrbitSelection =
	| { kind: "star" }
	| { kind: "orbit"; bodyIndex: number }
	| { kind: "orbit-moon"; bodyIndex: number; moonIndex: number }

interface OrbitChildCardModel {
	key: string
	title: string
	subtitle: string
	onClick: () => void
}

interface OrbitNavigatorViewModel {
	title: string
	typeLabel: string
	childrenLabel: string
	dataContent?: React.ReactNode
	onTypeClick?: () => void
	parent?: {
		label: string
		onClick: () => void
	}
	onFocus?: () => void
	headerAction?: React.ReactNode
	stats: StatEntry[]
	children: OrbitChildCardModel[]
	emptyChildrenLabel: string
}

function getSystemBodyKindLabel(body: SystemBody): string {
	if (body.group === "asteroid belt") return "Asteroid Belt"
	if (body.group === "dwarf") return "Dwarf Planet"
	return body.classification
		? `${formatClassificationLabel(body.classification)} Planet`
		: `${formatClassificationLabel(body.group)} Planet`
}

function OrbitHeader({
	title,
	typeLabel,
	seedInput,
	seedDisplay,
	onTypeClick,
	parent,
	onFocus,
	onClose,
	headerAction,
	onSeedInputChange,
	onSeedApply,
	onSeedRandomize,
}: {
	title: string
	typeLabel: string
	seedInput: string
	seedDisplay: string
	onTypeClick?: () => void
	parent?: {
		label: string
		onClick: () => void
	}
	onFocus?: () => void
	onClose?: () => void
	headerAction?: React.ReactNode
	onSeedInputChange: (value: string) => void
	onSeedApply: () => void
	onSeedRandomize: () => void
}) {
	const [seedEditorVisible, setSeedEditorVisible] = useState(false)
	const seedEditorRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!seedEditorVisible) return
		const handlePointerDown = (event: PointerEvent) => {
			if (!seedEditorRef.current?.contains(event.target as Node)) {
				setSeedEditorVisible(false)
			}
		}
		document.addEventListener("pointerdown", handlePointerDown)
		return () => document.removeEventListener("pointerdown", handlePointerDown)
	}, [seedEditorVisible])

	return (
		<div className="border-b border-slate-200 pb-3">
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-2">
						<h1
							className="min-w-0 flex-1 text-[30px] leading-snug text-slate-950"
							style={{ fontFamily: "var(--font-jedar)" }}
						>
							{title}
						</h1>
						<div className="flex items-center gap-1 pt-1">
							{headerAction}
							{onFocus ? <GpsFocusButton onClick={onFocus} /> : null}
							{onClose ? (
								<button
									type="button"
									onClick={onClose}
									title="Hide generation panel"
									className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
								>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
									>
										<line x1="18" y1="6" x2="6" y2="18" />
										<line x1="6" y1="6" x2="18" y2="18" />
									</svg>
								</button>
							) : null}
						</div>
					</div>
					<div className="mt-0.5 flex items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
							<button
								type="button"
								onClick={onTypeClick}
								className="transition-colors hover:text-slate-900"
							>
								{typeLabel}
							</button>
							{parent ? (
								<>
									<span className="text-slate-300">/</span>
									<button
										type="button"
										onClick={parent.onClick}
										className="transition-colors hover:text-slate-900"
									>
										{parent.label}
									</button>
								</>
							) : null}
						</div>
						<div
							ref={seedEditorRef}
							className="relative flex shrink-0 items-center gap-1.5"
						>
							{seedEditorVisible ? (
								<div className="absolute top-full right-0 z-30 mt-2 rounded-md border border-slate-200 bg-white shadow-lg">
									<div className="flex w-36 flex-col gap-2 px-1 pt-0.5 pb-2">
										<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
											Procedural Seed
										</span>
										<div className="flex items-center gap-1.5">
											<input
												autoFocus
												type="text"
												value={seedInput}
												onChange={(event) =>
													onSeedInputChange(event.target.value)
												}
												onBlur={() => {
													onSeedApply()
													setSeedEditorVisible(false)
												}}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault()
														onSeedApply()
														setSeedEditorVisible(false)
													}
												}}
												aria-label="Procedural seed"
												className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 outline-none transition-colors focus:border-slate-400"
											/>
											<button
												type="button"
												onClick={() => {
													onSeedRandomize()
													setSeedEditorVisible(false)
												}}
												aria-label="Randomize seed"
												className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
											>
												<DiceMultipleOutlineIcon className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
								</div>
							) : null}
							<button
								type="button"
								onClick={() => setSeedEditorVisible((current) => !current)}
								className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-slate-700"
							>
								{seedDisplay}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

function OrbitChildCard({ title, subtitle, onClick }: OrbitChildCardModel) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left transition-all hover:border-slate-300 hover:bg-slate-50"
		>
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0 text-[12px] leading-tight text-slate-950">
					{title}
				</div>
				<div className="shrink-0 text-[8px] uppercase tracking-[0.12em] text-slate-400">
					{subtitle}
				</div>
			</div>
		</button>
	)
}

function OrbitInsertPlaceholder() {
	return (
		<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1 text-center text-[9px] uppercase tracking-[0.16em] text-slate-400">
			... + ...
		</div>
	)
}

function buildMoonPreviewDataProps(params: {
	seed: number
	moon: MoonParams
	parent: {
		idx: number
		massKg: number
		diameterKm: number
		moons: MoonParams[]
	}
	parentHoursPerDay: number
	parentOrbitalPeriodDays: number
	parentOrbitalDistanceAU: number
	parentEccentricity: number
	parentPerihelionDeg: number
	spectralClass: string
	starSubtype: number
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
}): React.ComponentProps<typeof LazyPlanetDetailTabs> {
	const parentYearHours =
		params.parentOrbitalPeriodDays * params.parentHoursPerDay
	const climateHoursPerDay =
		computeSolarDayHours({
			siderealDayHours: params.moon.siderealDayHours,
			orbitalPeriodDays: parentYearHours / 24,
			retrograde: inferRetrogradeRotationFromAxialTiltDeg(
				params.moon.axialTiltDeg,
			),
		}) ?? params.moon.siderealDayHours
	const climateDaysPerYear =
		climateHoursPerDay > 0 ? parentYearHours / climateHoursPerDay : 0
	return {
		inline: true,
		seed: params.seed,
		moonCount: 0,
		moons: [],
		moonContext: {
			moon: params.moon,
			parent: params.parent,
		},
		moonTideContext: {
			daysPerYear: params.parentOrbitalPeriodDays,
			hoursPerDay: params.parentHoursPerDay,
		},
		daysPerYear: climateDaysPerYear,
		hoursPerDay: climateHoursPerDay,
		planetRadiusKm: params.moon.diameterKm / 2,
		isSolarLocked: params.moon.tideLock?.type === "solar",
		spectralClass: params.spectralClass,
		starSubtype: params.starSubtype,
		orbitalDistanceAU: params.parentOrbitalDistanceAU,
		eccentricity: params.parentEccentricity,
		perihelion: params.parentPerihelionDeg,
		obliquity: params.moon.axialTiltDeg,
		hydrosphereFraction: params.moon.hydrosphereFraction ?? 0,
		atmosphere: params.moon.atmosphere,
		albedo: params.moon.albedo,
		greenhouseFactor: params.moon.greenhouseFactor,
		generationPreviewTab: params.generationPreviewTab,
		onSelectGenerationPreviewTab: params.onSelectGenerationPreviewTab,
		unitSystem: params.unitSystem,
		tidesEmptyLabel: "Computing…",
	}
}

function GenerationPlanetNavigator({
	orbitBodies,
	systemBodies,
	onFocusBody,
	currentFocus,
	onUpdateSystemBody,
	onUpdateSystemMoon,
	surfaceTidesM,
	tideLock,
	setTideLock,
	setHoursPerDay,
	radiusSlider,
	orbitalDistanceSlider,
	dayLengthSlider,
	antistellarLonSlider,
	pressureSlider,
	eccentricitySlider,
	perihelionSlider,
	axialTiltSlider,
	isRetrograde,
	onToggleSpin,
	planetRadiusKm,
	restSeed,
	hoursPerDay,
	daysPerYear,
	moonCount,
	surfaceStats,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	axialTiltDisplay,
	landCoverage,
	inclinationDeg,
	setInclinationDeg,
	showRealSolNames,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	setRestSeed,
	setObliquity,
	tidalSchedulePreview,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	onClose,
}: {
	orbitBodies?: SystemBody[]
	systemBodies?: SystemBody[]
	onFocusBody?: (bodyIndex: number, moonIndex?: number) => void
	currentFocus?: {
		bodyIndex: number
		moonIndex?: number
	} | null
	onUpdateSystemBody?: (
		bodyIndex: number,
		updater: (body: SystemBody) => SystemBody,
	) => void
	onUpdateSystemMoon?: (
		bodyIndex: number,
		moonIndex: number,
		updater: (moon: MoonParams, parentBody: SystemBody) => MoonParams,
	) => void
	surfaceTidesM?: SurfaceTidesBreakdown
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setHoursPerDay: (v: number) => void
	radiusSlider?: SliderDef
	orbitalDistanceSlider?: SliderDef
	dayLengthSlider?: SliderDef
	antistellarLonSlider?: SliderDef
	pressureSlider?: SliderDef
	eccentricitySlider?: SliderDef
	perihelionSlider?: SliderDef
	axialTiltSlider?: SliderDef
	isRetrograde: boolean
	onToggleSpin?: () => void
	planetRadiusKm: number
	restSeed: number
	hoursPerDay: number
	daysPerYear: number
	moonCount: number
	surfaceStats: StatEntry[]
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	axialTiltDisplay: string
	landCoverage: number
	inclinationDeg: number
	setInclinationDeg: (v: number) => void
	showRealSolNames: boolean
	spectralClass: string
	setSpectralClass: (v: string) => void
	starSubtype: number
	setStarSubtype: (v: number) => void
	setRestSeed: (v: number) => void
	setObliquity: (v: number) => void
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	onClose?: () => void
}) {
	const [selection, setSelection] = useState<OrbitSelection>({
		kind: "star",
	})
	useEffect(() => {
		if (!currentFocus) return
		if (currentFocus.bodyIndex < 0) {
			setSelection({ kind: "star" })
			return
		}
		if (currentFocus.moonIndex !== undefined) {
			setSelection({
				kind: "orbit-moon",
				bodyIndex: currentFocus.bodyIndex,
				moonIndex: currentFocus.moonIndex,
			})
			return
		}
		setSelection({
			kind: "orbit",
			bodyIndex: currentFocus.bodyIndex,
		})
	}, [currentFocus])
	const [childrenExpanded, setChildrenExpanded] = useState(false)
	const [dataExpanded, setDataExpanded] = useState(false)
	const [seedOverrides, setSeedOverrides] = useState<Record<string, string>>({})
	const [rootSeedLabel, setRootSeedLabel] = useState(
		restSeed === SOL_SEED ? "sol" : restSeed.toString(36).padStart(6, "0"),
	)
	const [seedInput, setSeedInput] = useState(rootSeedLabel)
	const lastAppliedRootSeedRef = useRef<{
		numeric: number
		label: string
	} | null>(null)
	const starClass: MainSequenceClass = isValidSpectralClass(spectralClass)
		? spectralClass
		: "G"
	const starTitle = showRealSolNames ? SOL_STAR_NAME : "Primary Star"
	const labeledOrbits = useMemo(
		() => labelOrbitBodies(orbitBodies ?? [], showRealSolNames),
		[orbitBodies, showRealSolNames],
	)
	const starMassSol = getStarMassSol(starClass, starSubtype)
	const selectionKey = useCallback((target: OrbitSelection): string => {
		if (target.kind === "star") return "star"
		if (target.kind === "orbit") return `orbit:${target.bodyIndex}`
		return `orbit-moon:${target.bodyIndex}:${target.moonIndex}`
	}, [])
	const getDefaultSeedLabel = useCallback(
		(target: OrbitSelection): string => {
			if (target.kind === "star") return rootSeedLabel
			if (target.kind === "orbit") {
				const body = systemBodies?.[target.bodyIndex]
				return normalizeSeedLabel(
					body?.name ??
						(showRealSolNames && body?.isMainWorld
							? SOL_MAIN_WORLD_NAME
							: (labeledOrbits.find((entry) => entry.body === body)?.title ??
								(body?.isMainWorld
									? "world"
									: `orbit-${target.bodyIndex + 1}`))),
				)
			}
			const body = systemBodies?.[target.bodyIndex]
			const moon = body?.moons[target.moonIndex]
			return normalizeSeedLabel(
				getMoonSeedBaseName({
					moon,
					moonIndex: target.moonIndex,
					showRealSolNames,
				}),
			)
		},
		[labeledOrbits, rootSeedLabel, showRealSolNames, systemBodies],
	)
	const getSeedLabel = useCallback(
		(target: OrbitSelection): string =>
			seedOverrides[selectionKey(target)] ?? getDefaultSeedLabel(target),
		[getDefaultSeedLabel, seedOverrides, selectionKey],
	)
	const getDerivedSeedNumber = useCallback(
		(target: OrbitSelection): number => {
			const label = getSeedLabel(target)
			if (target.kind === "star") {
				return label === "sol" ? SOL_SEED : seedStringToNumber(label)
			}
			let parent: OrbitSelection
			if (target.kind === "orbit") {
				parent = { kind: "star" }
			} else {
				parent = { kind: "orbit", bodyIndex: target.bodyIndex }
			}
			const parentLabel = getSeedLabel(parent)
			return seedStringToNumber(`${parentLabel}/${label}`)
		},
		[getSeedLabel],
	)
	const seedDisplay = getSeedLabel(selection)
	useEffect(() => {
		const lastApplied = lastAppliedRootSeedRef.current
		if (
			lastApplied &&
			lastApplied.numeric === restSeed &&
			lastApplied.label === rootSeedLabel
		) {
			return
		}
		setRootSeedLabel(
			restSeed === SOL_SEED ? "sol" : restSeed.toString(36).padStart(6, "0"),
		)
	}, [restSeed, rootSeedLabel])
	useEffect(() => {
		setSeedInput(seedDisplay)
	}, [seedDisplay])
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		hoursPerDay,
		tideLock,
	)
	const isSolarLocked = tideLock?.type === "solar"
	const solarLockButton = (
		<UITooltip
			content={
				isSolarLocked
					? "remove solar tidal lock"
					: "add solar tidal lock (1:1 with star)"
			}
			position="top"
			align="center"
		>
			<button
				type="button"
				onClick={(event) => {
					event.preventDefault()
					if (isSolarLocked) {
						setTideLock(null)
						setHoursPerDay(24)
						return
					}
					setTideLock({ type: "solar", target: 0 })
					setObliquity(0)
					setHoursPerDay(daysPerYear * hoursPerDay)
				}}
				className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
			>
				{isSolarLocked ? (
					<LockIcon className="h-3 w-3" />
				) : (
					<LockOpenIcon className="h-3 w-3" />
				)}
			</button>
		</UITooltip>
	)

	const focusSelection = useCallback(
		(nextSelection: OrbitSelection) => {
			if (!onFocusBody) return
			if (nextSelection.kind === "star") {
				onFocusBody(-1)
				return
			}
			if (nextSelection.kind === "orbit") {
				onFocusBody(nextSelection.bodyIndex)
				return
			}
			onFocusBody(nextSelection.bodyIndex, nextSelection.moonIndex)
		},
		[onFocusBody],
	)

	const selectAndFocus = useCallback(
		(nextSelection: OrbitSelection) => {
			setSelection(nextSelection)
			focusSelection(nextSelection)
		},
		[focusSelection],
	)
	const applySeedInput = useCallback(() => {
		const normalized = normalizeSeedLabel(seedInput)
		if (seedInput.trim() === "") {
			setSeedInput(seedDisplay)
			return
		}
		if (selection.kind === "star") {
			const numericSeed =
				normalized === "sol" ? SOL_SEED : seedStringToNumber(normalized)
			lastAppliedRootSeedRef.current = {
				numeric: numericSeed,
				label: normalized,
			}
			setRootSeedLabel(normalized)
			setRestSeed(numericSeed)
			setSeedInput(normalized)
			return
		}
		setSeedOverrides((current) => ({
			...current,
			[selectionKey(selection)]: normalized,
		}))
		setSeedInput(normalized)
	}, [seedDisplay, seedInput, selection, selectionKey, setRestSeed])
	const randomizeSeed = useCallback(() => {
		const nextLabel = randomSeedLabel()
		if (selection.kind === "star") {
			const numericSeed = seedStringToNumber(nextLabel)
			lastAppliedRootSeedRef.current = {
				numeric: numericSeed,
				label: nextLabel,
			}
			setRootSeedLabel(nextLabel)
			setRestSeed(numericSeed)
			setSeedInput(nextLabel)
			return
		}
		setSeedOverrides((current) => ({
			...current,
			[selectionKey(selection)]: nextLabel,
		}))
		setSeedInput(nextLabel)
	}, [selection, selectionKey, setRestSeed])
	const getMainWorldMoonOrbitDistance = useCallback(
		(moon: MoonParams) =>
			moon.semiMajorAxisPlanetDiameters ??
			moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay) /
				(planetRadiusKm * 2000),
		[moonOrbitHoursPerDay, planetMassKg, planetRadiusKm],
	)
	const getBodyMoonOrbitDistance = useCallback(
		(body: SystemBody, moon: MoonParams) =>
			moon.semiMajorAxisPlanetDiameters ??
			moonSemiMajorAxisM(moon, body.massKg, body.siderealDayHours) /
				(body.diameterKm * 1000),
		[],
	)

	const viewModel = useMemo<OrbitNavigatorViewModel>(() => {
		if (selection.kind === "star") {
			const starChildren = (systemBodies ?? [])
				.map((body, bodyIndex) => ({
					key: `orbit-${body.idx}-${bodyIndex}`,
					au: body.orbitalDistanceAU,
					title:
						body.isMainWorld && !body.name
							? appendSizeToTitle(
									showRealSolNames ? SOL_MAIN_WORLD_NAME : "Terrestrial Planet",
									body.sizeClass,
								)
							: (labeledOrbits.find((entry) => entry.body === body)?.title ??
								resolveOrbitBodyTitle(body, bodyIndex + 1, showRealSolNames)),
					subtitle: getSystemBodyKindLabel(body),
					onClick: () => selectAndFocus({ kind: "orbit", bodyIndex }),
				}))
				.sort((a, b) => a.au - b.au)
			return {
				title: starTitle,
				typeLabel: "Star",
				childrenLabel: "Orbits",
				onTypeClick: () => focusSelection({ kind: "star" }),
				onFocus: onFocusBody
					? () => focusSelection({ kind: "star" })
					: undefined,
				headerAction: solarLockButton,
				stats: buildStarStats({
					starClass,
					starSubtype,
					restSeed: getDerivedSeedNumber({ kind: "star" }),
					setSpectralClass,
					setStarSubtype,
				}),
				children: starChildren.filter((entry) => entry.title),
				emptyChildrenLabel: "No child orbits.",
			}
		}

		if (selection.kind === "orbit") {
			const body = systemBodies?.[selection.bodyIndex]
			if (!body)
				return {
					title: "Orbit",
					typeLabel: "Planet",
					childrenLabel: "Moons",
					stats: [],
					children: [],
					emptyChildrenLabel: "No child orbits.",
				}
			const isMainWorld = body.isMainWorld
			const bodySurfaceTidesM =
				body.group === "asteroid belt"
					? undefined
					: isMainWorld
						? surfaceTidesM
						: computeSurfaceTidesM(
								body.moons,
								{ diameterKm: body.diameterKm, tideLock: body.tideLock },
								{
									hoursPerDay,
									spectralClass,
									starSubtype,
									orbitalDistanceAU: body.orbitalDistanceAU,
									eccentricity: body.eccentricity,
									starName:
										showRealSolNames && restSeed === SOL_SEED
											? SOL_STAR_NAME
											: undefined,
								},
							)
			const bodyTitle =
				isMainWorld && !body.name
					? appendSizeToTitle(
							showRealSolNames ? SOL_MAIN_WORLD_NAME : "Terrestrial Planet",
							body.sizeClass,
						)
					: (labeledOrbits.find((entry) => entry.body === body)?.title ??
						resolveOrbitBodyTitle(
							body,
							selection.bodyIndex + 1,
							showRealSolNames,
						))
			const orbitMoons = body.moons
			return {
				title: bodyTitle,
				typeLabel: getSystemBodyKindLabel(body),
				childrenLabel: "Moons",
				onTypeClick: () => focusSelection(selection),
				parent: {
					label: starTitle,
					onClick: () => selectAndFocus({ kind: "star" }),
				},
				onFocus: onFocusBody ? () => focusSelection(selection) : undefined,
				stats: isMainWorld
					? buildTerrestrialWorldStats({
							group: body.group,
							classification: body.classification,
							surfaceTidesM: bodySurfaceTidesM,
							tideLock,
							setTideLock,
							setHoursPerDay,
							radiusSlider,
							orbitalDistanceSlider,
							dayLengthSlider,
							antistellarLonSlider,
							pressureSlider,
							eccentricitySlider,
							perihelionSlider,
							axialTiltSlider,
							isRetrograde,
							onToggleSpin,
							planetRadiusKm,
							hoursPerDay,
							daysPerYear,
							surfaceStats,
							orbitalDistanceAU,
							eccentricity,
							perihelion,
							axialTiltDisplay,
							landCoverage,
							inclinationDeg,
							setInclinationDeg,
						})
					: buildOrbitBodyStats({
							body,
							starMassSol,
							surfaceTidesM: bodySurfaceTidesM,
							onUpdateBody:
								onUpdateSystemBody && selection.bodyIndex >= 0
									? (updater) =>
											onUpdateSystemBody(selection.bodyIndex, updater)
									: undefined,
						}),
				dataContent: (
					<LazyPlanetDetailTabs
						inline
						seed={getDerivedSeedNumber(selection)}
						moonCount={orbitMoons.length}
						moons={orbitMoons}
						daysPerYear={body.orbitalPeriodDays}
						hoursPerDay={body.siderealDayHours}
						planetRadiusKm={body.diameterKm / 2}
						isSolarLocked={
							isMainWorld
								? tideLock?.type === "solar"
								: isApproxSolarLocked(
										body.siderealDayHours,
										body.orbitalPeriodDays,
									)
						}
						spectralClass={spectralClass}
						starSubtype={starSubtype}
						orbitalDistanceAU={body.orbitalDistanceAU}
						eccentricity={body.eccentricity}
						perihelion={body.argumentOfPeriapsisDeg}
						obliquity={body.axialTiltDeg}
						hydrosphereFraction={body.hydrosphereFraction}
						atmosphere={
							isMainWorld
								? buildPressureAtmosphereProfile(pressureSlider?.value ?? 1)
								: body.atmosphere
						}
						albedo={body.albedo}
						greenhouseFactor={body.greenhouseFactor}
						internalHeatTempK={body.internalHeatTempK}
						tidalSchedulePreviewOverride={
							isMainWorld ? tidalSchedulePreview : undefined
						}
						generationPreviewTab={generationPreviewTab}
						onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
						unitSystem={unitSystem}
					/>
				),
				children: orbitMoons
					.map((moon, moonIndex) => ({
						key: `orbit-moon-${body.idx}-${moon.idx ?? moonIndex}`,
						order: isMainWorld
							? getMainWorldMoonOrbitDistance(moon)
							: getBodyMoonOrbitDistance(body, moon),
						title: resolveMoonTitle(
							moon,
							moonIndex + 1,
							showRealSolNames,
							isMainWorld && moonIndex === 0 ? "Luna" : undefined,
						),
						subtitle: "Moon",
						onClick: () =>
							selectAndFocus({
								kind: "orbit-moon",
								bodyIndex: selection.bodyIndex,
								moonIndex,
							}),
					}))
					.sort((a, b) => a.order - b.order),
				emptyChildrenLabel:
					isMainWorld && moonCount > 0 && orbitMoons.length === 0
						? "Computing moon parameters…"
						: orbitMoons.length === 0
							? "No child orbits."
							: "Computing moon parameters…",
			}
		}

		if (selection.kind === "orbit-moon") {
			const body = systemBodies?.[selection.bodyIndex]
			const sourceMoons = body?.moons
			const moon = sourceMoons?.[selection.moonIndex]
			if (!body || !moon) {
				return {
					title: "Orbit",
					typeLabel: "Moon",
					childrenLabel: "Orbits",
					stats: [],
					children: [],
					emptyChildrenLabel: "No child orbits.",
				}
			}
			const isMainWorld = body.isMainWorld
			const parentMassKg = body.massKg
			const parentDiameterKm = body.diameterKm
			const parentMoons = body.moons
			const parentHoursPerDay = body.siderealDayHours
			const parentOrbitalPeriodDays = body.orbitalPeriodDays
			const parentOrbitalDistanceAU = body.orbitalDistanceAU
			const parentEccentricity = body.eccentricity
			const parentPerihelionDeg = body.argumentOfPeriapsisDeg
			const isThisMoonLocked =
				isMainWorld &&
				tideLock?.type === "lunar" &&
				tideLock.target === moon.idx
			const otherLockActive =
				isMainWorld && tideLock !== null && !isThisMoonLocked
			const pd = isMainWorld
				? (moon.semiMajorAxisPlanetDiameters ??
					moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay) /
						(planetRadiusKm * 2000))
				: getBodyMoonOrbitDistance(body, moon)
			const parentTitle =
				isMainWorld && !body.name
					? appendSizeToTitle(
							showRealSolNames ? SOL_MAIN_WORLD_NAME : "Terrestrial Planet",
							body.sizeClass,
						)
					: (labeledOrbits.find((entry) => entry.body === body)?.title ??
						resolveOrbitBodyTitle(
							body,
							selection.bodyIndex + 1,
							showRealSolNames,
						))
			return {
				title: resolveMoonTitle(
					moon,
					selection.moonIndex + 1,
					showRealSolNames,
					isMainWorld && selection.moonIndex === 0 ? "Luna" : undefined,
				),
				typeLabel: "Moon",
				childrenLabel: "Orbits",
				onTypeClick: () => focusSelection(selection),
				parent: {
					label: parentTitle,
					onClick: () =>
						selectAndFocus({
							kind: "orbit",
							bodyIndex: selection.bodyIndex,
						}),
				},
				onFocus: onFocusBody ? () => focusSelection(selection) : undefined,
				headerAction: isMainWorld ? (
					<button
						type="button"
						disabled={otherLockActive}
						onClick={(event) => {
							event.preventDefault()
							if (isThisMoonLocked) {
								setTideLock(null)
								setHoursPerDay(24)
								return
							}
							setTideLock({ type: "lunar", target: moon.idx })
							setHoursPerDay(moon.orbitalPeriodDays * 24)
						}}
						className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
					>
						{isThisMoonLocked ? (
							<LockIcon className="h-3 w-3" />
						) : (
							<LockOpenIcon className="h-3 w-3" />
						)}
					</button>
				) : undefined,
				stats: buildOrbitMoonStats({
					moon,
					surfaceTidesM: computeMoonSurfaceTidesM(
						moon,
						{
							name:
								showRealSolNames && isMainWorld
									? SOL_MAIN_WORLD_NAME
									: showRealSolNames
										? body.name
										: undefined,
							massKg: parentMassKg,
							diameterKm: parentDiameterKm,
							moons: parentMoons,
						},
						{
							hoursPerDay: parentHoursPerDay,
							spectralClass,
							starSubtype,
							orbitalDistanceAU: parentOrbitalDistanceAU,
							eccentricity: parentEccentricity,
							starName:
								showRealSolNames && restSeed === SOL_SEED
									? SOL_STAR_NAME
									: undefined,
						},
					),
					pdOverride: pd,
					parentOrbitalPeriodDays,
					hoursPerDay: parentHoursPerDay,
					onUpdateMoon:
						onUpdateSystemMoon && selection.bodyIndex >= 0
							? (updater) =>
									onUpdateSystemMoon(
										selection.bodyIndex,
										selection.moonIndex,
										updater,
									)
							: undefined,
				}),
				dataContent: (
					<LazyPlanetDetailTabs
						{...buildMoonPreviewDataProps({
							seed: getDerivedSeedNumber(selection),
							moon,
							parent: {
								idx: body.idx,
								massKg: parentMassKg,
								diameterKm: parentDiameterKm,
								moons: parentMoons,
							},
							parentHoursPerDay,
							parentOrbitalPeriodDays,
							parentOrbitalDistanceAU,
							parentEccentricity,
							parentPerihelionDeg,
							spectralClass,
							starSubtype,
							generationPreviewTab,
							onSelectGenerationPreviewTab,
							unitSystem,
						})}
					/>
				),
				children: [],
				emptyChildrenLabel: "No child orbits.",
			}
		}
	}, [
		axialTiltDisplay,
		axialTiltSlider,
		dayLengthSlider,
		daysPerYear,
		eccentricity,
		eccentricitySlider,
		hoursPerDay,
		inclinationDeg,
		landCoverage,
		labeledOrbits,
		moonCount,
		getBodyMoonOrbitDistance,
		getDerivedSeedNumber,
		getMainWorldMoonOrbitDistance,
		generationPreviewTab,
		tidalSchedulePreview,
		moonOrbitHoursPerDay,
		onFocusBody,
		onSelectGenerationPreviewTab,
		onToggleSpin,
		onUpdateSystemBody,
		onUpdateSystemMoon,
		orbitalDistanceAU,
		orbitalDistanceSlider,
		perihelion,
		perihelionSlider,
		planetMassKg,
		planetRadiusKm,
		pressureSlider,
		radiusSlider,
		restSeed,
		selection,
		setHoursPerDay,
		setSpectralClass,
		setStarSubtype,
		showRealSolNames,
		solarLockButton,
		spectralClass,
		starMassSol,
		starClass,
		starSubtype,
		starTitle,
		surfaceStats,
		surfaceTidesM,
		systemBodies,
		tideLock,
		antistellarLonSlider,
		unitSystem,
		focusSelection,
		isRetrograde,
		selectAndFocus,
		setInclinationDeg,
		setTideLock,
	])

	return (
		<div className="space-y-3 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<OrbitHeader
					title={viewModel.title}
					typeLabel={viewModel.typeLabel}
					seedInput={seedInput}
					seedDisplay={seedDisplay}
					onTypeClick={viewModel.onTypeClick}
					parent={viewModel.parent}
					onFocus={viewModel.onFocus}
					onClose={onClose}
					headerAction={viewModel.headerAction}
					onSeedInputChange={setSeedInput}
					onSeedApply={applySeedInput}
					onSeedRandomize={randomizeSeed}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{viewModel.stats.length > 0 ? (
						renderStatGrid(viewModel.stats)
					) : (
						<div className="col-span-2 text-[11px] text-slate-400">
							No editable stats available.
						</div>
					)}
				</div>
			</Surface>

			{selection.kind === "star" || selection.kind === "orbit" ? (
				<Surface
					tone="panel"
					borderTone="default"
					radius="xl"
					className="border-t border-slate-200 px-3 py-3"
				>
					<div className="space-y-1.5">
						<button
							type="button"
							onClick={() => setChildrenExpanded((current) => !current)}
							className="flex w-full items-center justify-between gap-3 text-left"
						>
							<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
								{viewModel.childrenLabel} ({viewModel.children.length})
							</span>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className={`text-slate-400 transition-transform ${childrenExpanded ? "rotate-180" : ""}`}
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{childrenExpanded ? (
							<>
								<OrbitInsertPlaceholder />
								{viewModel.children.length > 0 ? (
									<div className="space-y-1.5">
										{viewModel.children.map((child, index) => (
											<React.Fragment key={child.key}>
												<OrbitChildCard {...child} />
												{index < viewModel.children.length - 1 ? (
													<OrbitInsertPlaceholder />
												) : null}
											</React.Fragment>
										))}
									</div>
								) : (
									<Surface
										tone="panelMuted"
										borderTone="default"
										radius="xl"
										className="px-3 py-3 text-[11px] text-slate-400"
									>
										{viewModel.emptyChildrenLabel}
									</Surface>
								)}
								<OrbitInsertPlaceholder />
							</>
						) : null}
					</div>
				</Surface>
			) : null}

			{viewModel.dataContent ? (
				<Surface
					tone="panel"
					borderTone="default"
					radius="xl"
					className="border-t border-slate-200 px-3 py-3"
				>
					<div className="space-y-1.5">
						<button
							type="button"
							onClick={() => setDataExpanded((current) => !current)}
							className="flex w-full items-center justify-between gap-3 text-left"
						>
							<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
								Preview
							</span>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className={`text-slate-400 transition-transform ${dataExpanded ? "rotate-180" : ""}`}
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{dataExpanded ? viewModel.dataContent : null}
					</div>
				</Surface>
			) : null}
		</div>
	)
}

const GenerationTimingChart: React.FC<{
	entries: TimingEntry[]
	onBarClick?: (label: string) => void
}> = ({ entries, onBarClick }) => {
	const chartState = useMemo(() => {
		if (!entries.length) return null

		const labels = entries.map((entry) => entry.label)
		const values = entries.map((entry) => entry.ms)
		const backgroundColor = entries.map((_, idx) =>
			idx === 0 ? "#0f172a" : idx < 4 ? "#1e293b" : "#334155",
		)

		const data: ChartData<"bar"> = {
			labels,
			datasets: [
				{
					label: "ms",
					data: values,
					backgroundColor,
					borderSkipped: false,
					borderRadius: 6,
					maxBarThickness: 18,
				},
			],
		}

		const options: ChartOptions<"bar"> = {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						title: (items) => {
							const idx = items[0]?.dataIndex ?? 0
							return entries[idx]?.label ?? ""
						},
						label: (item) => `${formatTimingSeconds(Number(item.raw))}`,
					},
				},
			},
			scales: {
				x: {
					beginAtZero: true,
					grid: { color: "rgba(148, 163, 184, 0.18)" },
					ticks: {
						font: { size: 9, family: "monospace" },
						callback: (value) => formatTimingSeconds(Number(value)),
					},
				},
				y: {
					grid: { display: false },
					ticks: {
						font: { size: 9, family: "monospace" },
					},
				},
			},
			onClick: (_event, elements) => {
				if (elements.length > 0 && onBarClick) {
					const idx = elements[0].index
					onBarClick(entries[idx]?.label ?? "")
				}
			},
		}

		return {
			data,
			options,
			height: Math.max(180, Math.min(420, entries.length * 24 + 56)),
		}
	}, [entries, onBarClick])

	if (!chartState) {
		return (
			<div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
				<p className="text-[11px] leading-relaxed text-slate-400">
					Run a generation or import to collect stage timings.
				</p>
			</div>
		)
	}

	return (
		<div style={{ height: chartState.height }}>
			<Bar data={chartState.data} options={chartState.options} />
		</div>
	)
}

export const GenerationPanel: React.FC<GenerationPanelProps> = ({
	worldTab,
	setWorldTab,
	resetWorldDefaults,
	tideLock,
	setTideLock,
	setObliquity,
	moonCount,
	restSeed,
	showRealSolNames,
	setRestSeed,
	tidalSchedulePreview,
	surfaceTidesM,
	orbitBodies,
	systemBodies,
	onFocusBody,
	currentFocus,
	onUpdateSystemBody,
	onUpdateSystemMoon,
	daysPerYear,
	hoursPerDay,
	setHoursPerDay,
	planetRadiusKm,
	generatedMoons,
	planetSliders,
	terrainSliders,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	obliquity,
	inclinationDeg,
	setInclinationDeg,
	era,
	setEra,
	planetCode,
	codeInput,
	setCodeInput,
	onApplyCode,
	codeError,
	recentCodes,
	starredRecentCodes,
	onSelectRecentCode,
	onToggleRecentCodeStar,
	onRandomizeCode,
	generating,
	generationLabel,
	generationProgress,
	generationTimings,
	landCoverage,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	handleGenerate,
	handleFileImport,
	handleEarthImport,
	onClose,
}) => {
	const [societySubtab, setSocietySubtab] = useState<"era" | "runes">("era")
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [showRecentCodes, setShowRecentCodes] = useState(false)
	const [showGenerationTimings, setShowGenerationTimings] = useState(false)
	void generatedMoons
	void obliquity
	void worldTab
	void setWorldTab
	void resetWorldDefaults
	void onClose
	type DrillDownState =
		| null
		| "post"
		| "history"
		| "computeRoutes"
		| {
				kind: "other"
				parent: "pipeline" | "post" | "history" | "computeRoutes"
		  }
	const [timingDrillDown, setTimingDrillDown] = useState<DrillDownState>(null)
	const generationTimingSummary = useMemo(
		() => getGenerationTimingSummary(generationTimings),
		[generationTimings],
	)
	const postTimingSummary = useMemo(
		() => getPostTimingSummary(generationTimings),
		[generationTimings],
	)
	const historyTimingSummary = useMemo(
		() => getHistoryTimingSummary(generationTimings),
		[generationTimings],
	)
	const computeRoutesTimingSummary = useMemo(
		() => getComputeRoutesTimingSummary(generationTimings),
		[generationTimings],
	)
	const orderedRecentCodes = useMemo(
		() => getOrderedRecentCodes(recentCodes, starredRecentCodes),
		[recentCodes, starredRecentCodes],
	)
	const selectRecentCode = (recentCode: string) =>
		handleRecentCodeSelection(recentCode, {
			onSelectRecentCode,
			setShowRecentCodes,
		})
	const dayLengthSlider = planetSliders.find(
		(slider) => slider.label === "Day Length",
	)
	const radiusSlider = planetSliders.find((slider) => slider.label === "Radius")
	const orbitalDistanceSlider = planetSliders.find(
		(slider) => slider.label === "Orbital Distance",
	)
	const pressureSlider = planetSliders.find(
		(slider) => slider.label === "Pressure",
	)
	const eccentricitySlider = planetSliders.find(
		(slider) => slider.label === "Eccentricity",
	)
	const perihelionSlider = planetSliders.find(
		(slider) => slider.label === "Periapsis",
	)
	const axialTiltSlider = planetSliders.find(
		(slider) => slider.label === "Axial Tilt",
	)
	const axialTiltDisplay = axialTiltSlider?.display ?? "0.0°"
	const spinSlider = planetSliders.find((slider) => slider.label === "Spin")
	const isRetrograde = spinSlider?.value === 1
	const onToggleSpin =
		spinSlider && !spinSlider.disabled
			? () => spinSlider.set(isRetrograde ? 0 : 1)
			: undefined
	const antistellarLonSlider = planetSliders.find(
		(slider) => slider.label === "Antistellar Lon",
	)
	const surfaceStats = buildSurfaceStats(planetSliders, terrainSliders)

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col px-4 py-4 lg:px-5 lg:py-5 border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
				<div className="rounded-[20px] bg-slate-50 px-3 py-3">
					<GenerationPlanetNavigator
						orbitBodies={orbitBodies}
						systemBodies={systemBodies}
						onFocusBody={onFocusBody}
						currentFocus={currentFocus}
						onUpdateSystemBody={onUpdateSystemBody}
						onUpdateSystemMoon={onUpdateSystemMoon}
						surfaceTidesM={surfaceTidesM}
						tideLock={tideLock}
						setTideLock={setTideLock}
						setHoursPerDay={setHoursPerDay}
						radiusSlider={radiusSlider}
						orbitalDistanceSlider={orbitalDistanceSlider}
						dayLengthSlider={dayLengthSlider}
						antistellarLonSlider={antistellarLonSlider}
						pressureSlider={pressureSlider}
						eccentricitySlider={eccentricitySlider}
						perihelionSlider={perihelionSlider}
						axialTiltSlider={axialTiltSlider}
						isRetrograde={isRetrograde}
						onToggleSpin={onToggleSpin}
						planetRadiusKm={planetRadiusKm}
						restSeed={restSeed}
						hoursPerDay={hoursPerDay}
						daysPerYear={daysPerYear}
						moonCount={moonCount}
						surfaceStats={surfaceStats}
						orbitalDistanceAU={orbitalDistanceAU}
						eccentricity={eccentricity}
						perihelion={perihelion}
						axialTiltDisplay={axialTiltDisplay}
						landCoverage={landCoverage}
						inclinationDeg={inclinationDeg}
						setInclinationDeg={setInclinationDeg}
						showRealSolNames={showRealSolNames && restSeed === SOL_SEED}
						spectralClass={spectralClass}
						setSpectralClass={setSpectralClass}
						starSubtype={starSubtype}
						setStarSubtype={setStarSubtype}
						setRestSeed={setRestSeed}
						setObliquity={setObliquity}
						tidalSchedulePreview={tidalSchedulePreview}
						generationPreviewTab={generationPreviewTab}
						onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
						unitSystem={unitSystem}
						onClose={onClose}
					/>
				</div>

				<div className="hidden" aria-hidden="true">
					<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
						<div className="flex items-center justify-between gap-2">
							<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 px-0.5">
								Society
							</p>
							<SegmentedControl
								options={[
									{ value: "era", label: "Era" },
									{ value: "runes", label: "Runes" },
								]}
								value={societySubtab}
								onChange={setSocietySubtab}
							/>
						</div>
						{societySubtab === "era" ? (
							<>
								<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 px-0.5">
									Era Preset
								</p>
								<div className="grid grid-cols-2 gap-1.5">
									{ERA_ORDER.map((eraId) => {
										const cfg = ERA_CONFIGS[eraId]
										const pop = cfg.targetPopulation
										const popLabel =
											pop >= 1e9
												? `${(pop / 1e9).toFixed(1)}B`
												: pop >= 1e6
													? `${Math.round(pop / 1e6)}M`
													: `${Math.round(pop / 1e3)}K`
										const active = era === eraId
										return (
											<button
												key={eraId}
												type="button"
												onClick={() => setEra(eraId)}
												className={`rounded-lg border px-2.5 py-2 text-left transition-all ${
													active
														? "border-slate-900 bg-slate-900 text-white"
														: "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
												}`}
											>
												<div
													className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${active ? "text-white" : "text-slate-700"}`}
												>
													{cfg.label}
												</div>
												<div
													className={`mt-0.5 font-mono text-[9px] ${active ? "text-slate-300" : "text-slate-400"}`}
												>
													~{popLabel} pop
												</div>
											</button>
										)
									})}
								</div>
								{(() => {
									const cfg = ERA_CONFIGS[era]
									return (
										<div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 space-y-1">
											<div className="flex justify-between text-[10px]">
												<span className="text-slate-500">Settled land</span>
												<span className="font-mono text-slate-700">
													{cfg.settlementFraction >= 1.0
														? "100%"
														: `${Math.round(cfg.settlementFraction * 100)}%`}
												</span>
											</div>
											<div className="flex justify-between text-[10px]">
												<span className="text-slate-500">Under states</span>
												<span className="font-mono text-slate-700">
													{!cfg.hasNations
														? "none"
														: cfg.statehoodFraction >= 1.0
															? "all settled"
															: `${Math.round(cfg.statehoodFraction * 100)}% of settled`}
												</span>
											</div>
										</div>
									)
								})()}
								<p className="text-[9px] text-slate-400 px-0.5 leading-relaxed">
									Applies on next Generate. White = settled stateless, gray =
									unsettled, on the nations map.
								</p>
							</>
						) : (
							<SocietyRunesPanel />
						)}
					</div>
				</div>

				<div className="space-y-2.5 pt-3 mt-1 border-t border-slate-100">
					<div className="space-y-2">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (file) handleFileImport(file)
								e.target.value = ""
							}}
						/>
						<div className="flex items-stretch gap-2">
							<div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
								<div className="flex items-center gap-2">
									<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
										Code
									</span>
									<input
										type="text"
										value={codeInput}
										onChange={(e) => setCodeInput(e.target.value)}
										onBlur={onApplyCode}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault()
												onApplyCode()
											}
										}}
										disabled={generating}
										placeholder="Planet code"
										className={`min-w-0 flex-1 bg-transparent border-none font-mono text-[11px] focus:ring-0 focus:outline-none placeholder:text-slate-300 disabled:opacity-50 ${
											codeError ? "text-red-500" : "text-slate-700"
										}`}
									/>
									{orderedRecentCodes.length > 0 && (
										<button
											type="button"
											onClick={() => setShowRecentCodes((current) => !current)}
											disabled={generating}
											aria-label={
												showRecentCodes
													? "Hide recent codes"
													: "Show recent codes"
											}
											className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<HistoryIcon className="h-4 w-4" />
										</button>
									)}
									<button
										type="button"
										onClick={onRandomizeCode}
										disabled={generating}
										aria-label="Generate new code"
										className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
										title="New code"
									>
										<DiceMultipleOutlineIcon className="h-4 w-4" />
									</button>
								</div>
							</div>
						</div>
						{codeError && (
							<p className="mt-1 border-t border-slate-200 pt-2 text-[11px] font-medium text-red-500">
								Invalid code
							</p>
						)}
						{showRecentCodes && orderedRecentCodes.length > 0 && (
							<div className="mt-2 flex flex-col gap-1.5 border-t border-slate-200 pt-2">
								{orderedRecentCodes.map((recentCode) => {
									const starred = starredRecentCodes.includes(recentCode)
									return (
										<div
											key={recentCode}
											className="flex w-full items-stretch overflow-hidden rounded-md border border-slate-200 bg-white"
										>
											<button
												type="button"
												onClick={() => selectRecentCode(recentCode)}
												disabled={generating}
												className={`min-w-0 flex-1 px-2 py-1 text-left font-mono text-[11px] transition-colors ${
													recentCode === codeInput || recentCode === planetCode
														? "bg-slate-900 text-white"
														: "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
												} disabled:opacity-50 disabled:cursor-not-allowed`}
												title="Use recent code"
											>
												{recentCode}
											</button>
											<button
												type="button"
												onClick={() => onToggleRecentCodeStar(recentCode)}
												disabled={generating}
												aria-label={
													starred
														? `Unstar recent code ${recentCode}`
														: `Star recent code ${recentCode}`
												}
												className={`border-l border-slate-200 p-1.5 transition-colors ${
													starred
														? "bg-amber-50 text-amber-500 hover:bg-amber-100 hover:text-amber-600"
														: "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
												} disabled:cursor-not-allowed disabled:opacity-50`}
												title={
													starred
														? "Remove pinned recent code"
														: "Pin recent code"
												}
											>
												{starred ? (
													<StarIcon className="h-4 w-4" />
												) : (
													<StarOutlineIcon className="h-4 w-4" />
												)}
											</button>
										</div>
									)
								})}
							</div>
						)}
					</div>

					<div className="flex gap-2">
						<button
							onClick={() => {
								setShowRecentCodes(false)
								handleGenerate()
							}}
							disabled={generating}
							className="flex-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2.5 text-[11px] font-semibold text-white transition-all hover:bg-slate-800 hover:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<span className="flex items-center gap-2">
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
								</svg>
								{generating ? "Generating..." : "Generate"}
							</span>
						</button>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={generating}
							className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
							title="Import an equirectangular B&W heightmap (PNG, JPEG, WebP)"
						>
							Import
						</button>
						<button
							type="button"
							onClick={handleEarthImport}
							disabled={generating}
							className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
							title="Load Earth's heightmap"
						>
							Earth
						</button>
					</div>

					<div className="space-y-1">
						<div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400">
							<span>{generating ? generationLabel : "Generation"}</span>
							<span>{Math.round(generationProgress)}%</span>
						</div>
						<div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
							<div
								className="h-full rounded-full bg-slate-900 transition-all duration-200"
								style={{
									width: `${Math.max(0, Math.min(100, generationProgress))}%`,
								}}
							/>
						</div>
					</div>

					{generationTimingSummary && (
						<div className="pt-1">
							<div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/20">
								<button
									type="button"
									onClick={() => {
										setShowGenerationTimings((current) => !current)
										if (showGenerationTimings) setTimingDrillDown(null)
									}}
									className="flex w-full items-center justify-between gap-3 text-left"
								>
									<div>
										<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
											Timing
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span className="font-mono text-[10px] text-slate-400">
											{formatTimingSeconds(generationTimingSummary.totalMs)}
										</span>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											className={`text-slate-400 transition-transform ${showGenerationTimings ? "rotate-180" : ""}`}
										>
											<polyline points="6 9 12 15 18 9" />
										</svg>
									</div>
								</button>
								{showGenerationTimings && (
									<div className="mt-3 space-y-3">
										{timingDrillDown === "post" && postTimingSummary ? (
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => setTimingDrillDown(null)}
														className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
													>
														<svg
															width="10"
															height="10"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
														>
															<polyline points="15 18 9 12 15 6" />
														</svg>
														Back
													</button>
													<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
														Post breakdown
													</div>
													<span className="ml-auto font-mono text-[10px] text-slate-400">
														{formatTimingSeconds(postTimingSummary.totalMs)}
													</span>
												</div>
												<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
													<GenerationTimingChart
														entries={postTimingSummary.entries}
														onBarClick={(label) => {
															if (label === "Other")
																setTimingDrillDown({
																	kind: "other",
																	parent: "post",
																})
														}}
													/>
												</div>
											</div>
										) : timingDrillDown === "history" &&
											historyTimingSummary ? (
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => setTimingDrillDown(null)}
														className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
													>
														<svg
															width="10"
															height="10"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
														>
															<polyline points="15 18 9 12 15 6" />
														</svg>
														Back
													</button>
													<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
														History breakdown
													</div>
													<span className="ml-auto font-mono text-[10px] text-slate-400">
														{formatTimingSeconds(historyTimingSummary.totalMs)}
													</span>
												</div>
												<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
													<GenerationTimingChart
														entries={historyTimingSummary.entries}
														onBarClick={(label) => {
															if (
																label === "computeRoutes" &&
																computeRoutesTimingSummary
															)
																setTimingDrillDown("computeRoutes")
															else if (label === "Other")
																setTimingDrillDown({
																	kind: "other",
																	parent: "history",
																})
														}}
													/>
												</div>
											</div>
										) : timingDrillDown === "computeRoutes" &&
											computeRoutesTimingSummary ? (
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => setTimingDrillDown("history")}
														className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
													>
														<svg
															width="10"
															height="10"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
														>
															<polyline points="15 18 9 12 15 6" />
														</svg>
														Back
													</button>
													<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
														Compute routes breakdown
													</div>
													<span className="ml-auto font-mono text-[10px] text-slate-400">
														{formatTimingSeconds(
															computeRoutesTimingSummary.totalMs,
														)}
													</span>
												</div>
												<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
													<GenerationTimingChart
														entries={computeRoutesTimingSummary.entries}
														onBarClick={(label) => {
															if (label === "Other")
																setTimingDrillDown({
																	kind: "other",
																	parent: "computeRoutes",
																})
														}}
													/>
												</div>
											</div>
										) : typeof timingDrillDown === "object" &&
											timingDrillDown?.kind === "other" ? (
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => {
															const parent = timingDrillDown.parent
															if (parent === "pipeline")
																setTimingDrillDown(null)
															else setTimingDrillDown(parent)
														}}
														className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
													>
														<svg
															width="10"
															height="10"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
														>
															<polyline points="15 18 9 12 15 6" />
														</svg>
														Back
													</button>
													<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
														Other items
													</div>
													<span className="ml-auto font-mono text-[10px] text-slate-400">
														{formatTimingSeconds(
															timingDrillDown.parent === "pipeline"
																? (generationTimingSummary?.totalMs ?? 0)
																: timingDrillDown.parent === "post"
																	? (postTimingSummary?.totalMs ?? 0)
																	: timingDrillDown.parent === "history"
																		? (historyTimingSummary?.totalMs ?? 0)
																		: (computeRoutesTimingSummary?.totalMs ??
																			0),
														)}
													</span>
												</div>
												<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
													<GenerationTimingChart
														entries={
															timingDrillDown.parent === "pipeline"
																? (generationTimingSummary?.otherEntries ?? [])
																: timingDrillDown.parent === "post"
																	? (postTimingSummary?.otherEntries ?? [])
																	: timingDrillDown.parent === "history"
																		? (historyTimingSummary?.otherEntries ?? [])
																		: (computeRoutesTimingSummary?.otherEntries ??
																			[])
														}
													/>
												</div>
											</div>
										) : (
											<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
												<div className="mb-2 flex items-center justify-between px-1">
													<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
														Pipeline
													</div>
													<span className="font-mono text-[10px] text-slate-400">
														{formatTimingSeconds(
															generationTimingSummary.totalMs,
														)}
													</span>
												</div>
												<GenerationTimingChart
													entries={generationTimingSummary.entries}
													onBarClick={(label) => {
														if (label === "post-pipeline" && postTimingSummary)
															setTimingDrillDown("post")
														else if (
															label === "initHistory" &&
															historyTimingSummary
														)
															setTimingDrillDown("history")
														else if (
															label === "Other" &&
															generationTimingSummary.otherEntries.length > 0
														)
															setTimingDrillDown({
																kind: "other",
																parent: "pipeline",
															})
													}}
												/>
											</div>
										)}
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

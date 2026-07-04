import Tippy from "@tippyjs/react"
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
import "tippy.js/dist/tippy.css"
import "tippy.js/themes/light-border.css"
import React, { useMemo, useRef, useState } from "react"
import { Bar } from "react-chartjs-2"
import type { StageTiming } from "@/model"
import { MAX_MOONS } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	isLunaMoonSeed,
	moonSemiMajorAxisM,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import {
	getHabitableZoneAU,
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
import { EARTH_MOON_TIDE_REFERENCE } from "@/model/climate/tidal-force"
import { SEED_MAX } from "@/model/shared/planet-code"
import { SLIDER_RANGES } from "@/model/shared/slider-ranges"
import { ERA_CONFIGS, ERA_ORDER, type SocietyEra } from "@/model/society/eras"
import {
	EditableStatValue,
	type StatEntry,
} from "@/ui/components/composites/EditableStatValue"
import { AxisRotateClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateClockwiseIcon"
import { AxisRotateCounterClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateCounterClockwiseIcon"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { HistoryIcon } from "@/ui/components/primitives/icons/HistoryIcon"
import { LockIcon } from "@/ui/components/primitives/icons/LockIcon"
import { LockOpenIcon } from "@/ui/components/primitives/icons/LockOpenIcon"
import { StarIcon } from "@/ui/components/primitives/icons/StarIcon"
import { StarOutlineIcon } from "@/ui/components/primitives/icons/StarOutlineIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Tooltip as UITooltip } from "@/ui/components/primitives/Tooltip"
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
	planetType: import("@/model/celestial/moons/moon-types").PlanetType
	setPlanetType: (
		v: import("@/model/celestial/moons/moon-types").PlanetType,
	) => void
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setObliquity: (v: number) => void
	moonCount: number
	setMoonCount: (v: number) => void
	moonSeed: number
	setMoonSeed: (v: number) => void
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	generatedMoons?: import("@/model/celestial/moons/moon-types").MoonParams[]
	gasGiantSystem?: import("@/model/celestial/moons/moon-types").GasGiantSystem
	daysPerYear: number
	hoursPerDay: number
	setHoursPerDay: (v: number) => void
	planetRadiusKm: number
	planetSliders: SliderDef[]
	terrainSliders: SliderDef[]
	spectralClass: string
	setSpectralClass: (v: string) => void
	starSubtype: number
	setStarSubtype: (v: number) => void
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
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
	climatePreview: ClimatePreviewData
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

const EARTH_MASS_KG = 5.972e24
const LUNA_DIAMETER_KM = 3474
const LUNA_MASS_KG = 7.342e22
const GAS_GIANT_AXIAL_TILT_DEG = 3.1
const MOON_COLORS_CSS = ["text-sky-500", "text-violet-500", "text-emerald-500"]

const ORBIT_STAT_HELP = {
	periapsis:
		"Argument of periapsis. Where the closest point of the orbit sits within the orbital plane.",
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
				<EditableStatValue stat={stat} />
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

function SystemBodyCard({
	className,
	summaryClassName,
	title,
	stats,
	lockButton,
	defaultOpen = false,
	children,
	bodyContent,
}: {
	className: string
	summaryClassName: string
	title: string
	stats: StatEntry[]
	lockButton?: React.ReactNode
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
			{children ? <div className="mt-2">{children}</div> : null}
		</details>
	)
}

function MoonSystemCard({
	className = "border-slate-100",
	summaryClassName,
	title,
	stats,
	lockButton,
	defaultOpen = false,
}: {
	className?: string
	summaryClassName: string
	title: string
	stats: StatEntry[]
	lockButton?: React.ReactNode
	defaultOpen?: boolean
}) {
	return (
		<SystemBodyCard
			className={className}
			summaryClassName={summaryClassName}
			title={title}
			stats={stats}
			lockButton={lockButton}
			defaultOpen={defaultOpen}
		/>
	)
}

function PlanetDetailTabs({
	tidalSchedulePreview,
	moonCount,
	daysPerYear,
	isSolarLocked,
	climatePreview,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
}: {
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	moonCount: number
	daysPerYear: number
	isSolarLocked: boolean
	climatePreview: ClimatePreviewData
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
}) {
	const [detailTab, setDetailTab] = useState<GenerationPreviewTab | "tides">(
		generationPreviewTab,
	)

	return (
		<details className="group border-t border-slate-100 pt-2">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
				<span>Data</span>
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
								{moonCount === 0 ? "No moons" : "Computing…"}
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
		</details>
	)
}

function buildMoonCardTitle(
	moonNumber: number,
	orbitRange: string | undefined,
	diameterKm: number,
) {
	return `Moon ${moonNumber} · ${orbitRange ?? "middle"} · ${(diameterKm / LUNA_DIAMETER_KM).toFixed(2)}× Luna`
}

function buildMoonStats({
	diameterKm,
	massKg,
	gravityG,
	pd,
	orbitalPeriodDays,
	eccentricity,
	argumentOfPeriapsisDeg,
	inclinationDeg,
	axialTiltDeg,
	peakTideMeters,
}: {
	diameterKm: number
	massKg: number
	gravityG: number
	pd: number
	orbitalPeriodDays: number
	eccentricity: number
	argumentOfPeriapsisDeg: number
	inclinationDeg: number
	axialTiltDeg: number
	peakTideMeters?: number
}) {
	const diameterRel = diameterKm / LUNA_DIAMETER_KM
	const massRel = massKg / LUNA_MASS_KG

	return [
		{
			label: "Diameter",
			value: `${diameterRel.toFixed(2)}× Luna`,
		},
		{
			label: "Mass",
			value: `${massRel.toFixed(3)}× Luna`,
		},
		{ label: "Gravity", value: `${gravityG.toFixed(3)} g` },
		{ label: "Semi Major Axis", value: `${pd.toFixed(1)} PD` },
		{
			label: "Period",
			value: formatDays(orbitalPeriodDays),
		},
		{ label: "Eccentricity", value: eccentricity.toFixed(4) },
		{
			label: "Periapsis",
			value: `${argumentOfPeriapsisDeg.toFixed(1)}°`,
			help: ORBIT_STAT_HELP.periapsis,
		},
		{
			label: "Inclination",
			value: `${inclinationDeg.toFixed(1)}°`,
		},
		{
			label: "Axial Tilt",
			value: `${axialTiltDeg.toFixed(1)}°`,
		},
		...(peakTideMeters === undefined
			? []
			: [
					{
						label: "Peak tide",
						value: `${peakTideMeters.toFixed(3)} m`,
					},
				]),
	]
}

function StellarSystemCard({
	spectralClass,
	starSubtype,
	peakTideMeters,
	lockButton,
	setSpectralClass,
	setStarSubtype,
}: {
	spectralClass: string
	starSubtype: number
	peakTideMeters?: number
	lockButton?: React.ReactNode
	setSpectralClass?: (v: string) => void
	setStarSubtype?: (v: number) => void
}) {
	const [starEditorVisible, setStarEditorVisible] = useState(false)
	const starClass: MainSequenceClass = isValidSpectralClass(spectralClass)
		? spectralClass
		: "G"
	const starTempK = Math.round(getStarTemperatureK(starClass, starSubtype))
	const starDiamSol = getStarDiameterSol(starClass, starSubtype).toFixed(3)
	const starLuminosity = getStarLuminositySol(starClass, starSubtype)
	const starLumSol = starLuminosity.toFixed(3)
	const starMassSol = getStarMassSol(starClass, starSubtype).toFixed(3)
	const starHzAU = getHabitableZoneAU(starLuminosity).toFixed(3)
	const starMaoAU = getStarMAO(starClass, starSubtype).toFixed(3)

	const typeStatValue = getStarLabel(starClass, starSubtype)

	return (
		<details className="group rounded border border-yellow-200 bg-white/85 px-2 py-1.5 shadow-sm shadow-slate-200/20">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-yellow-700">
				<span>{typeStatValue} Star</span>
				<div className="flex items-center gap-1">
					{lockButton}
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
				<span className="text-[9px] text-slate-400">Type</span>
				<div className="flex">
					{setSpectralClass && setStarSubtype ? (
						<Tippy
							visible={starEditorVisible}
							onClickOutside={() => setStarEditorVisible(false)}
							interactive
							placement="top"
							theme="light-border"
							content={
								<div className="flex w-56 flex-col gap-2 px-1 pt-0.5 pb-2">
									<div className="flex flex-wrap gap-1">
										{MAIN_SEQUENCE_CLASSES.map((c) => {
											const color = SPECTRAL_CLASS_COLORS[c]
											const active = c === starClass
											return (
												<button
													key={c}
													type="button"
													onClick={() => setSpectralClass(c)}
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
													{c}
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
											onChange={(e) =>
												setStarSubtype(parseFloat(e.target.value))
											}
											className="mt-1 h-1 w-full cursor-pointer rounded-lg accent-slate-900"
										/>
									</div>
								</div>
							}
						>
							<span
								onClick={() => setStarEditorVisible((v) => !v)}
								className="inline-block cursor-pointer text-[9px] font-mono text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
							>
								{typeStatValue}
							</span>
						</Tippy>
					) : (
						<span className="text-[9px] font-mono text-slate-700">
							{typeStatValue}
						</span>
					)}
				</div>
				{renderStatGrid([
					{ label: "Diameter", value: `${starDiamSol} R☉` },
					{ label: "Mass", value: `${starMassSol} M☉` },
					{ label: "Temperature", value: `${starTempK.toLocaleString()} K` },
					{ label: "Luminosity", value: `${starLumSol} L☉` },
					{ label: "HZ Center", value: `${starHzAU} AU` },
					{ label: "MAO", value: `${starMaoAU} AU` },
					...(peakTideMeters === undefined
						? []
						: [
								{ label: "Peak tide", value: `${peakTideMeters.toFixed(3)} m` },
							]),
				])}
			</div>
		</details>
	)
}

function GasGiantSystemCards({
	gasGiantSystem,
	tidalSchedulePreview,
	radiusSlider,
	orbitalDistanceSlider,
	eccentricitySlider,
	perihelionSlider,
	axialTiltSlider,
	dayLengthSlider,
	pressureSlider,
	planetRadiusKm,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	daysPerYear,
	hoursPerDay,
	isRetrograde,
	onToggleSpin,
	spectralClass,
	starSubtype,
	setSpectralClass,
	setStarSubtype,
	isGasGiantParentLocked,
	setTideLock,
	setHoursPerDay,
	moonCount,
	surfaceStats,
	climatePreview,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
}: {
	gasGiantSystem:
		| import("@/model/celestial/moons/moon-types").GasGiantSystem
		| undefined
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	radiusSlider?: SliderDef
	orbitalDistanceSlider?: SliderDef
	eccentricitySlider?: SliderDef
	perihelionSlider?: SliderDef
	axialTiltSlider?: SliderDef
	dayLengthSlider?: SliderDef
	pressureSlider?: SliderDef
	planetRadiusKm: number
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	daysPerYear: number
	hoursPerDay: number
	isRetrograde: boolean
	onToggleSpin?: () => void
	spectralClass: string
	starSubtype: number
	setSpectralClass: (v: string) => void
	setStarSubtype: (v: number) => void
	isGasGiantParentLocked: boolean
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setHoursPerDay: (v: number) => void
	moonCount: number
	surfaceStats: StatEntry[]
	climatePreview: ClimatePreviewData
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
}) {
	if (!gasGiantSystem) {
		return (
			<div className="text-[10px] text-slate-400 py-2">
				Generating gas giant system…
			</div>
		)
	}
	const {
		gasGiant,
		mainMoonPd,
		mainMoonOrbitalPeriodDays,
		mainMoonOrbitRange,
		mainMoonEccentricity,
		mainMoonInclinationDeg,
		mainMoonAxialTiltDeg,
		mainMoonArgumentOfPeriapsisDeg,
		siblingMoons,
	} = gasGiantSystem
	const planetDiamKm = planetRadiusKm * 2
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const planetMassEarths = planetMassKg / EARTH_MASS_KG
	const planetGravityG =
		(6.674e-11 * planetMassKg) / ((planetDiamKm / 2) * 1000) ** 2 / 9.807
	const earthDiamRel = (planetDiamKm / EARTH_DIAMETER_KM).toFixed(2)
	const starPeakForce =
		tidalSchedulePreview?.events.reduce(
			(max, ev) => Math.max(max, Math.abs(ev.starForce ?? 0)),
			0,
		) ?? 0

	return (
		<div className="flex flex-col gap-2">
			<StellarSystemCard
				spectralClass={spectralClass}
				starSubtype={starSubtype}
				peakTideMeters={starPeakForce * EARTH_MOON_TIDE_REFERENCE}
				setSpectralClass={setSpectralClass}
				setStarSubtype={setStarSubtype}
			/>

			<SystemBodyCard
				className="border-amber-200"
				summaryClassName="text-amber-700"
				title={`Jovian Planet · ${gasGiant.diameterEarths.toFixed(1)}× Earth`}
				lockButton={
					<button
						type="button"
						onClick={(event) => {
							event.preventDefault()
							if (isGasGiantParentLocked) {
								setTideLock(null)
								setHoursPerDay(24)
								return
							}
							setTideLock({ type: "lunar", target: 0 })
							setHoursPerDay(mainMoonOrbitalPeriodDays * 24)
						}}
						className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
						aria-label={
							isGasGiantParentLocked
								? "Unlock gas giant parent tide lock"
								: "Lock to gas giant parent"
						}
						title={
							isGasGiantParentLocked
								? "Unlock gas giant parent tide lock"
								: "Lock to gas giant parent"
						}
					>
						{isGasGiantParentLocked ? (
							<LockIcon className="h-3 w-3" />
						) : (
							<LockOpenIcon className="h-3 w-3" />
						)}
					</button>
				}
				stats={[
					{
						label: "Diameter",
						value: `${gasGiant.diameterEarths.toFixed(1)}× Earth`,
					},
					{ label: "Mass", value: `${gasGiant.massEarths.toFixed(0)}× Earth` },
					{ label: "Gravity", value: `${gasGiant.gravityG.toFixed(2)} g` },
					{
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
					{ label: "Period", value: formatDays(daysPerYear) },
					...(gasGiantSystem
						? [
								{
									label: "Solar Day",
									value: formatHours(gasGiantSystem.gasGiant.dayLengthHours),
								},
							]
						: []),
					{
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
					{
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
					{ label: "Inclination", value: "0.0°" },
					{
						label: "Axial Tilt",
						value: `${GAS_GIANT_AXIAL_TILT_DEG.toFixed(1)}°`,
					},
				]}
			>
				<PlanetDetailTabs
					tidalSchedulePreview={tidalSchedulePreview}
					moonCount={moonCount}
					daysPerYear={daysPerYear}
					isSolarLocked={false}
					climatePreview={climatePreview}
					generationPreviewTab={generationPreviewTab}
					onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
					unitSystem={unitSystem}
				/>
			</SystemBodyCard>

			<SystemBodyCard
				className="border-blue-200"
				summaryClassName="text-blue-700"
				title={`Terrestrial Moon · ${mainMoonOrbitRange} · ${earthDiamRel}× Earth`}
				defaultOpen
				stats={[
					{
						label: "Diameter",
						value: `${earthDiamRel}× Earth`,
						editor: radiusSlider
							? {
									label: "Diameter",
									value: radiusSlider.value * 2,
									min: radiusSlider.min * 2,
									max: radiusSlider.max * 2,
									step: radiusSlider.step * 2,
									display: `${((radiusSlider.value * 2) / EARTH_DIAMETER_KM).toFixed(2)}× Earth`,
									set: (v: number) => radiusSlider.set(v / 2),
								}
							: undefined,
					},
					{ label: "Mass", value: `${planetMassEarths.toFixed(2)}× Earth` },
					{ label: "Gravity", value: `${planetGravityG.toFixed(3)} g` },
					{ label: "Semi Major Axis", value: `${mainMoonPd.toFixed(1)} PD` },
					{ label: "Period", value: formatDays(mainMoonOrbitalPeriodDays) },
					{
						label: "Solar Day",
						value: formatHours(hoursPerDay),
						editor:
							dayLengthSlider && !isGasGiantParentLocked
								? {
										label: "Solar Day",
										value: dayLengthSlider.value,
										min: dayLengthSlider.min,
										max: dayLengthSlider.max,
										step: dayLengthSlider.step,
										display: dayLengthSlider.display,
										set: dayLengthSlider.set,
									}
								: undefined,
					},
					{
						label: "Eccentricity",
						value: mainMoonEccentricity.toFixed(4),
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
					{
						label: "Periapsis",
						value: `${mainMoonArgumentOfPeriapsisDeg.toFixed(1)}°`,
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
					{
						label: "Inclination",
						value: `${mainMoonInclinationDeg.toFixed(1)}°`,
					},
					{
						label: "Axial Tilt",
						value: `${mainMoonAxialTiltDeg.toFixed(1)}°`,
						editor: axialTiltSlider
							? {
									label: "Axial Tilt",
									value: axialTiltSlider.value,
									min: axialTiltSlider.min,
									max: axialTiltSlider.max,
									step: axialTiltSlider.step,
									display: axialTiltSlider.display,
									set: (v: number) => axialTiltSlider.set(v),
								}
							: undefined,
						valueAction: onToggleSpin ? (
							<UITooltip
								content={
									isRetrograde ? "switch to prograde" : "switch to retrograde"
								}
								position="top"
								align="center"
							>
								<button
									type="button"
									onClick={onToggleSpin}
									className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
								>
									{isRetrograde ? (
										<AxisRotateCounterClockwiseIcon className="h-3 w-3" />
									) : (
										<AxisRotateClockwiseIcon className="h-3 w-3" />
									)}
								</button>
							</UITooltip>
						) : undefined,
					},
					{
						label: "Atmosphere",
						value: pressureSlider
							? `${pressureSlider.value.toFixed(1)} bar`
							: "1.0 bar",
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
					...surfaceStats,
				]}
			>
				<PlanetDetailTabs
					tidalSchedulePreview={tidalSchedulePreview}
					moonCount={moonCount}
					daysPerYear={daysPerYear}
					isSolarLocked={false}
					climatePreview={climatePreview}
					generationPreviewTab={generationPreviewTab}
					onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
					unitSystem={unitSystem}
				/>
			</SystemBodyCard>

			{/* Sibling moons */}
			{siblingMoons.length === 0 && (
				<div className="text-[9px] text-slate-400">No sibling moons.</div>
			)}
			{siblingMoons.map((moon, i) => {
				const peakForce =
					tidalSchedulePreview?.events.reduce(
						(max, ev) => Math.max(max, ev.moonForces[i + 1] ?? 0),
						0,
					) ?? 0
				return (
					<MoonSystemCard
						key={moon.idx}
						summaryClassName={
							MOON_COLORS_CSS[i % MOON_COLORS_CSS.length] ?? "text-slate-600"
						}
						title={buildMoonCardTitle(i + 1, moon.orbitRange, moon.diameterKm)}
						stats={buildMoonStats({
							diameterKm: moon.diameterKm,
							massKg: moon.massKg,
							gravityG: moon.gravityG,
							pd: moon.pd,
							orbitalPeriodDays: moon.orbitalPeriodDays,
							eccentricity: moon.eccentricity,
							argumentOfPeriapsisDeg: moon.argumentOfPeriapsisDeg,
							inclinationDeg: moon.inclinationDeg,
							axialTiltDeg: moon.axialTiltDeg,
							peakTideMeters: peakForce * EARTH_MOON_TIDE_REFERENCE,
						})}
					/>
				)
			})}
		</div>
	)
}

function TerrestrialSystemCards({
	generatedMoons,
	tidalSchedulePreview,
	tideLock,
	setTideLock,
	setHoursPerDay,
	setObliquity,
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
	moonCount,
	surfaceStats,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	spectralClass,
	starSubtype,
	setSpectralClass,
	setStarSubtype,
	axialTiltDisplay,
	climatePreview,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
}: {
	generatedMoons: import("@/model/celestial/moons/moon-types").MoonParams[]
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setHoursPerDay: (v: number) => void
	setObliquity: (v: number) => void
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
	moonCount: number
	surfaceStats: StatEntry[]
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	setSpectralClass: (v: string) => void
	setStarSubtype: (v: number) => void
	axialTiltDisplay: string
	climatePreview: ClimatePreviewData
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
}) {
	const planetDiamKm = planetRadiusKm * 2
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const planetMassEarths = planetMassKg / EARTH_MASS_KG
	const planetGravityG =
		(6.674e-11 * planetMassKg) / (planetRadiusKm * 1000) ** 2 / 9.807
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		hoursPerDay,
		tideLock,
	)
	const earthDiamRel = (planetDiamKm / EARTH_DIAMETER_KM).toFixed(2)
	const starPeakForce =
		tidalSchedulePreview?.events.reduce(
			(max, ev) => Math.max(max, Math.abs(ev.starForce ?? 0)),
			0,
		) ?? 0
	const isSolarLocked = tideLock?.type === "solar"
	const worldStats: StatEntry[] = [
		{
			label: "Diameter",
			value: `${earthDiamRel}× Earth`,
			editor: radiusSlider
				? {
						label: "Diameter",
						value: radiusSlider.value * 2,
						min: radiusSlider.min * 2,
						max: radiusSlider.max * 2,
						step: radiusSlider.step * 2,
						display: `${((radiusSlider.value * 2) / EARTH_DIAMETER_KM).toFixed(2)}× Earth`,
						set: (v: number) => radiusSlider.set(v / 2),
					}
				: undefined,
		},
		{ label: "Mass", value: `${planetMassEarths.toFixed(2)}× Earth` },
		{ label: "Gravity", value: `${planetGravityG.toFixed(3)} g` },
		{
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
		{ label: "Period", value: formatDays(daysPerYear) },
		{
			label: "Solar Day",
			value: formatHours(hoursPerDay),
			editor: dayLengthSlider
				? {
						label: "Solar Day",
						value: dayLengthSlider.value,
						min: dayLengthSlider.min,
						max: dayLengthSlider.max,
						step: dayLengthSlider.step,
						display: dayLengthSlider.display,
						set: dayLengthSlider.set,
					}
				: undefined,
		},
		{
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
		{
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
		{
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
					}
				: undefined,
			valueAction: onToggleSpin && (
				<UITooltip
					content={isRetrograde ? "switch to prograde" : "switch to retrograde"}
					position="top"
					align="center"
				>
					<button
						type="button"
						onClick={onToggleSpin}
						className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
					>
						{isRetrograde ? (
							<AxisRotateCounterClockwiseIcon className="h-3 w-3" />
						) : (
							<AxisRotateClockwiseIcon className="h-3 w-3" />
						)}
					</button>
				</UITooltip>
			),
		},
		...(isSolarLocked && antistellarLonSlider
			? [
					{
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
					},
				]
			: []),
		{
			label: "Atmosphere",
			value: pressureSlider
				? `${pressureSlider.value.toFixed(1)} bar`
				: "1.0 bar",
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
		...surfaceStats,
	]

	return (
		<div className="flex flex-col gap-2">
			<StellarSystemCard
				spectralClass={spectralClass}
				starSubtype={starSubtype}
				peakTideMeters={starPeakForce * EARTH_MOON_TIDE_REFERENCE}
				setSpectralClass={setSpectralClass}
				setStarSubtype={setStarSubtype}
				lockButton={
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
				}
			/>
			<SystemBodyCard
				className="border-blue-200"
				summaryClassName="text-blue-700"
				title={`Terrestrial Planet · ${earthDiamRel}× Earth`}
				defaultOpen
				stats={worldStats}
			>
				<PlanetDetailTabs
					tidalSchedulePreview={tidalSchedulePreview}
					moonCount={moonCount}
					daysPerYear={daysPerYear}
					isSolarLocked={isSolarLocked}
					climatePreview={climatePreview}
					generationPreviewTab={generationPreviewTab}
					onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
					unitSystem={unitSystem}
				/>
			</SystemBodyCard>
			{generatedMoons.map((moon, i) => {
				const sma = moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay)
				const pd =
					moon.semiMajorAxisPlanetDiameters ?? sma / (planetRadiusKm * 2000)
				const peakForce =
					tidalSchedulePreview?.events.reduce(
						(max, ev) => Math.max(max, ev.moonForces[i] ?? 0),
						0,
					) ?? 0
				const isThisMoonLocked =
					tideLock?.type === "lunar" && tideLock.target === moon.idx
				const otherLockActive = tideLock !== null && !isThisMoonLocked

				return (
					<MoonSystemCard
						key={moon.idx}
						summaryClassName={
							MOON_COLORS_CSS[i % MOON_COLORS_CSS.length] ?? "text-slate-600"
						}
						title={buildMoonCardTitle(i + 1, moon.orbitRange, moon.diameterKm)}
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
							pd,
							orbitalPeriodDays: moon.orbitalPeriodDays,
							eccentricity: moon.eccentricity,
							argumentOfPeriapsisDeg: moon.argumentOfPeriapsisDeg,
							inclinationDeg: moon.inclinationDeg,
							axialTiltDeg: moon.axialTiltDeg,
							peakTideMeters: peakForce * EARTH_MOON_TIDE_REFERENCE,
						})}
					/>
				)
			})}
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
	planetType,
	setPlanetType,
	tideLock,
	setTideLock,
	setObliquity,
	moonCount,
	setMoonCount,
	moonSeed,
	setMoonSeed,
	tidalSchedulePreview,
	generatedMoons,
	gasGiantSystem,
	daysPerYear,
	hoursPerDay,
	setHoursPerDay,
	planetRadiusKm,
	planetSliders,
	terrainSliders,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
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
	climatePreview,
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
	const moonSeedLabel = isLunaMoonSeed(moonSeed)
		? `${moonCount}-luna`
		: `${moonCount}-${moonSeed.toString(36).padStart(6, "0")}`
	const rerollMoonSeed = () => setMoonSeed(Math.floor(Math.random() * SEED_MAX))
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
	const isSolarLocked = tideLock?.type === "solar"
	const isGasGiantParentLocked =
		planetType === "gas-giant-moon" &&
		tideLock?.type === "lunar" &&
		tideLock.target === 0

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col px-4 py-4 lg:px-5 lg:py-5 border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			{/* Header */}
			<div className="flex items-center gap-3 mb-5">
				<div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						className="text-white"
					>
						<circle
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							strokeWidth="2"
						/>
						<path
							d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
							stroke="currentColor"
							strokeWidth="1.5"
						/>
					</svg>
				</div>
				<span className="font-bold text-sm tracking-tight">GENESIS ENGINE</span>
				<button
					onClick={onClose}
					className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
					title="Hide generation panel"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
							{(
								[
									["planet", "Planet"],
									["society", "Society"],
								] as const
							).map(([tab, label]) => (
								<button
									key={tab}
									onClick={() => setWorldTab(tab)}
									className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all ${
										worldTab === tab
											? "bg-white text-slate-900 shadow-sm"
											: "text-slate-500 hover:text-slate-700"
									}`}
								>
									{label}
								</button>
							))}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={resetWorldDefaults}
							className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
						>
							Reset
						</button>
					</div>
				</div>

				{worldTab === "planet" && (
					<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
						{/* Moon box */}
						{(() => {
							const MOON_COLORS_CSS = [
								"text-sky-500",
								"text-violet-500",
								"text-emerald-500",
							]
							return (
								<div className="overflow-hidden rounded-lg">
									<div className="flex items-center border-b border-slate-100 px-2.5 pt-2 pb-2 gap-2">
										<div className="flex gap-0 rounded border border-slate-200 overflow-hidden">
											{(["terrestrial", "gas-giant-moon"] as const).map(
												(pt) => (
													<button
														key={pt}
														type="button"
														onClick={() => setPlanetType(pt)}
														className={`px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.07em] transition-colors ${
															planetType === pt
																? "bg-slate-700 text-white"
																: "bg-transparent text-slate-400 hover:text-slate-600"
														}`}
													>
														{pt === "terrestrial" ? "Planet" : "Moon"}
													</button>
												),
											)}
										</div>
									</div>
									<div className="px-2.5 py-2">
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-1.5 min-w-0">
												<UITooltip
													content={
														planetType === "gas-giant-moon"
															? "Reroll gas giant system"
															: "Reroll moon parameters"
													}
													position="top"
													align="start"
												>
													<button
														type="button"
														onClick={rerollMoonSeed}
														className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
													>
														<DiceMultipleOutlineIcon className="h-3 w-3" />
													</button>
												</UITooltip>
												<span
													className="font-mono text-[9px] text-slate-400 truncate"
													title={String(moonSeed)}
												>
													{moonSeedLabel}
												</span>
												<div className="flex gap-0.5 ml-1 self-center">
													{Array.from({ length: moonCount }, (_, i) => (
														<span
															key={i}
															className={`${MOON_COLORS_CSS[i % MOON_COLORS_CSS.length]} inline-block text-[9px]`}
														>
															●
														</span>
													))}
												</div>
											</div>
											<div className="flex items-center gap-1.5 shrink-0">
												<button
													type="button"
													disabled={moonCount === 0}
													onClick={() => setMoonCount(moonCount - 1)}
													className="flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
												>
													<span className="leading-none text-[11px]">−</span>
												</button>
												<span className="w-3 text-center text-[11px] font-mono text-slate-800">
													{moonCount}
												</span>
												<button
													type="button"
													disabled={
														moonCount >=
														(planetType === "gas-giant-moon" ? 5 : MAX_MOONS)
													}
													onClick={() => setMoonCount(moonCount + 1)}
													className="flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
												>
													<span className="leading-none text-[11px]">+</span>
												</button>
											</div>
										</div>
										{isSolarLocked && moonCount > 0 && (
											<p className="mt-1.5 text-[9px] text-slate-400 leading-tight">
												Solar tides suppressed · lunar tides active
											</p>
										)}
										<div className="mt-2">
											{planetType === "gas-giant-moon" ? (
												<GasGiantSystemCards
													gasGiantSystem={gasGiantSystem}
													tidalSchedulePreview={tidalSchedulePreview}
													radiusSlider={radiusSlider}
													orbitalDistanceSlider={orbitalDistanceSlider}
													eccentricitySlider={eccentricitySlider}
													perihelionSlider={perihelionSlider}
													axialTiltSlider={axialTiltSlider}
													dayLengthSlider={dayLengthSlider}
													pressureSlider={pressureSlider}
													planetRadiusKm={planetRadiusKm}
													orbitalDistanceAU={orbitalDistanceAU}
													eccentricity={eccentricity}
													perihelion={perihelion}
													daysPerYear={daysPerYear}
													hoursPerDay={hoursPerDay}
													isRetrograde={isRetrograde}
													onToggleSpin={onToggleSpin}
													spectralClass={spectralClass}
													starSubtype={starSubtype}
													setSpectralClass={setSpectralClass}
													setStarSubtype={setStarSubtype}
													isGasGiantParentLocked={isGasGiantParentLocked}
													setTideLock={setTideLock}
													setHoursPerDay={setHoursPerDay}
													moonCount={moonCount}
													surfaceStats={surfaceStats}
													climatePreview={climatePreview}
													generationPreviewTab={generationPreviewTab}
													onSelectGenerationPreviewTab={
														onSelectGenerationPreviewTab
													}
													unitSystem={unitSystem}
												/>
											) : !generatedMoons || generatedMoons.length === 0 ? (
												<div className="text-[10px] text-slate-400 py-2">
													{moonCount === 0
														? "No moons configured."
														: "Computing moon parameters…"}
												</div>
											) : (
												<TerrestrialSystemCards
													generatedMoons={generatedMoons}
													tidalSchedulePreview={tidalSchedulePreview}
													tideLock={tideLock}
													setTideLock={setTideLock}
													setHoursPerDay={setHoursPerDay}
													setObliquity={setObliquity}
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
													hoursPerDay={hoursPerDay}
													daysPerYear={daysPerYear}
													moonCount={moonCount}
													surfaceStats={surfaceStats}
													orbitalDistanceAU={orbitalDistanceAU}
													eccentricity={eccentricity}
													perihelion={perihelion}
													spectralClass={spectralClass}
													starSubtype={starSubtype}
													setSpectralClass={setSpectralClass}
													setStarSubtype={setStarSubtype}
													axialTiltDisplay={axialTiltDisplay}
													climatePreview={climatePreview}
													generationPreviewTab={generationPreviewTab}
													onSelectGenerationPreviewTab={
														onSelectGenerationPreviewTab
													}
													unitSystem={unitSystem}
												/>
											)}
										</div>
									</div>
								</div>
							)
						})()}
					</div>
				)}

				{worldTab === "society" && (
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
				)}

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

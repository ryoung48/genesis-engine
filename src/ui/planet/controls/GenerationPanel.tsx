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
	SOL_LUNA_DEFAULT,
	SOL_MAIN_WORLD_NAME,
	SOL_SEED,
	SOL_STAR_NAME,
} from "@/model/celestial/system/sol-system"
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
import { ContributionTooltipContent } from "@/ui/components/composites/ContributionTooltipContent"
import {
	EditableStatValue,
	type StatEntry,
} from "@/ui/components/composites/EditableStatValue"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { AxisRotateClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateClockwiseIcon"
import { AxisRotateCounterClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateCounterClockwiseIcon"
import { CrosshairsGpsIcon } from "@/ui/components/primitives/icons/CrosshairsGpsIcon"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { HistoryIcon } from "@/ui/components/primitives/icons/HistoryIcon"
import { MinusBoxIcon } from "@/ui/components/primitives/icons/MinusBoxIcon"
import { PlusBoxIcon } from "@/ui/components/primitives/icons/PlusBoxIcon"
import { RefreshIcon } from "@/ui/components/primitives/icons/RefreshIcon"
import { SproutIcon } from "@/ui/components/primitives/icons/SproutIcon"
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
	/** Rebuilds one body (and everything nested inside it, e.g. its own
	 * moons) back to its freshly-generated defaults for the current seed,
	 * without touching any other body -- or, called with no bodyIndex,
	 * rebuilds the whole system. */
	onRebuildSystemBody?: (bodyIndex?: number) => void
	/** Resets a single moon back to its freshly-generated defaults for the
	 * current seed, without touching its parent body or any sibling moon. */
	onResetSystemMoon?: (bodyIndex: number, moonIndex: number) => void
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
	tideLockStat?: StatEntry
	/** A locked sidereal day is derived from the lock target's orbital
	 * period (see resolveBodyTideLockSiderealDayHours), not hand-set --
	 * disable its editor rather than let an edit silently desync it. */
	tideLocked?: boolean
	substellarLonStat?: StatEntry
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
			editor: params.tideLocked ? undefined : params.siderealEditor,
		},
		{
			label: "Solar Day",
			value: solarDayHours === null ? "-" : formatHours(solarDayHours),
		},
		...(params.tideLockStat ? [params.tideLockStat] : []),
		...(params.substellarLonStat ? [params.substellarLonStat] : []),
	]
}

function buildTideLockOptionButton(params: {
	key: string
	label: string
	active: boolean
	onClick: () => void
}) {
	return (
		<button
			key={params.key}
			type="button"
			onClick={params.onClick}
			className={`rounded border px-2 py-1 text-left text-[9px] font-semibold transition-colors ${
				params.active
					? "border-slate-900 bg-slate-900 text-white"
					: "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
			}`}
		>
			{params.label}
		</button>
	)
}

function buildTideLockEditorContent(params: {
	tideLock:
		| import("@/model/celestial/moons/moon-types").TideLock
		| null
		| undefined
	onSetLock: (
		lock: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	starTitle: string
	starTarget: number
	/** Present for a moon's card: the parent planet it can lock to. */
	parent?: { title: string; target: number }
	/** Present for a planet's card: its own moons it can lock to. */
	moons?: { label: string; target: number }[]
}) {
	const { tideLock, onSetLock } = params
	return (
		<div className="flex w-40 flex-col gap-1 px-1 pt-0.5 pb-2">
			<span className="mb-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
				Tide Lock
			</span>
			{buildTideLockOptionButton({
				key: "none",
				label: "None",
				active: !tideLock,
				onClick: () => onSetLock(null),
			})}
			{params.parent
				? buildTideLockOptionButton({
						key: "parent",
						label: params.parent.title,
						active:
							tideLock?.type === "planet" &&
							tideLock.target === params.parent.target,
						onClick: () =>
							onSetLock({ type: "planet", target: params.parent!.target }),
					})
				: buildTideLockOptionButton({
						key: "star",
						label: params.starTitle,
						active: tideLock?.type === "solar",
						onClick: () =>
							onSetLock({ type: "solar", target: params.starTarget }),
					})}
			{params.moons?.map((moon) =>
				buildTideLockOptionButton({
					key: `moon-${moon.target}`,
					label: moon.label,
					active: tideLock?.type === "lunar" && tideLock.target === moon.target,
					onClick: () => onSetLock({ type: "lunar", target: moon.target }),
				}),
			)}
		</div>
	)
}

function buildTideLockStat(params: {
	tideLock:
		| import("@/model/celestial/moons/moon-types").TideLock
		| null
		| undefined
	starTitle: string
	onSelectStar: () => void
	parentTitle?: string
	onSelectParent?: () => void
	siblingMoons?: MoonParams[]
	onSelectSiblingMoon?: (moonIndex: number) => void
	resolveSiblingMoonLabel?: (moon: MoonParams, moonIndex: number) => string
	/** When set, the stat becomes editable: clicking the value opens a
	 * dropdown of valid lock targets for this body (star + own moons for a
	 * planet, or just its parent for a moon). */
	onSetLock?: (
		lock: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	/** Present only on a moon's card -- the parent planet's SystemBody idx. */
	parentTarget?: number
}): StatEntry {
	const { tideLock } = params

	const editorContent = params.onSetLock
		? buildTideLockEditorContent({
				tideLock,
				onSetLock: params.onSetLock,
				starTitle: params.starTitle,
				starTarget: 0,
				parent:
					params.parentTitle && params.parentTarget !== undefined
						? { title: params.parentTitle, target: params.parentTarget }
						: undefined,
				moons: params.parentTitle
					? undefined
					: params.siblingMoons?.map((moon, moonIndex) => ({
							label:
								params.resolveSiblingMoonLabel?.(moon, moonIndex) ??
								getMoonSeedBaseName({
									moon,
									moonIndex,
									showRealSolNames: true,
								}),
							target: moon.idx,
						})),
			})
		: undefined
	const editor: StatEntry["editor"] | undefined = editorContent
		? {
				label: "Tide Lock",
				value: 0,
				min: 0,
				max: 1,
				step: 1,
				display: "",
				set: () => void 0,
				content: editorContent,
			}
		: undefined

	if (!tideLock) {
		return { label: "Tide Lock", value: "None", editor }
	}

	if (tideLock.type === "solar") {
		return {
			label: "Tide Lock",
			value: "Solar",
			editor,
			valueAction: (
				<>
					{" · "}
					<InlineTextButton
						onClick={params.onSelectStar}
						className="text-slate-700"
					>
						{params.starTitle}
					</InlineTextButton>
				</>
			),
		}
	}

	if (tideLock.type === "planet") {
		return {
			label: "Tide Lock",
			value: "Planet",
			editor,
			valueAction:
				params.parentTitle && params.onSelectParent ? (
					<>
						{" · "}
						<InlineTextButton
							onClick={params.onSelectParent}
							className="text-slate-700"
						>
							{params.parentTitle}
						</InlineTextButton>
					</>
				) : undefined,
		}
	}

	const siblingMoonIndex =
		params.siblingMoons?.findIndex((moon) => moon.idx === tideLock.target) ?? -1
	const siblingMoon =
		siblingMoonIndex >= 0 ? params.siblingMoons?.[siblingMoonIndex] : undefined
	const siblingLabel =
		siblingMoon && siblingMoonIndex >= 0
			? (params.resolveSiblingMoonLabel?.(siblingMoon, siblingMoonIndex) ??
				getMoonSeedBaseName({
					moon: siblingMoon,
					moonIndex: siblingMoonIndex,
					showRealSolNames: true,
				}))
			: `moon-${tideLock.target}`

	return {
		label: "Tide Lock",
		value: "lunar",
		editor,
		valueAction:
			siblingMoonIndex >= 0 && params.onSelectSiblingMoon ? (
				<>
					{" "}
					(
					<InlineTextButton
						onClick={() => params.onSelectSiblingMoon?.(siblingMoonIndex)}
						className="text-slate-700"
					>
						{siblingLabel}
					</InlineTextButton>
					)
				</>
			) : (
				` (${siblingLabel})`
			),
	}
}

// Locking a body to a target means it always shows the same face toward
// that target, i.e. its sidereal day becomes equal to its orbital period
// around whatever it's now locked to. Returns undefined (leave the current
// sidereal day alone) for "None" or a target this stat card can't resolve.
function resolveBodyTideLockSiderealDayHours(
	lock: import("@/model/celestial/moons/moon-types").TideLock | null,
	body: SystemBody,
): number | undefined {
	if (!lock) return undefined
	if (lock.type === "solar") return body.orbitalPeriodDays * 24
	if (lock.type === "lunar") {
		const moon = body.moons.find((m) => m.idx === lock.target)
		return moon ? moon.orbitalPeriodDays * 24 : undefined
	}
	return undefined
}

function resolveMoonTideLockSiderealDayHours(
	lock: import("@/model/celestial/moons/moon-types").TideLock | null,
	moon: MoonParams,
): number | undefined {
	if (!lock) return undefined
	if (lock.type === "planet") return moon.orbitalPeriodDays * 24
	return undefined
}

function buildSubstellarLonStat(params: {
	tideLock:
		| import("@/model/celestial/moons/moon-types").TideLock
		| null
		| undefined
	substellarLon: number | undefined
	onSet?: (value: number) => void
}): StatEntry | null {
	if (params.tideLock?.type !== "solar") return null
	const value = params.substellarLon ?? 0
	return {
		label: "Substellar Lon",
		value: `${value.toFixed(0)}°`,
		editor: params.onSet
			? {
					label: "Substellar Lon",
					value,
					min: 0,
					max: 360,
					step: 1,
					display: `${value.toFixed(0)}°`,
					set: params.onSet,
				}
			: undefined,
	}
}

function buildDirectionalAngleEditorConfig(params: {
	label: string
	value: number
	onSet: (value: number) => void
	onToggleDirection: () => void
}): Pick<NonNullable<StatEntry["editor"]>, "min" | "max" | "content"> {
	const isRetrograde = params.value > 90
	const min = isRetrograde ? 90.5 : 0
	const max = isRetrograde ? 180 : 90

	return {
		min,
		max,
		content: (
			<div className="flex w-44 flex-col px-1 pt-0.5 pb-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<UITooltip
							content={
								isRetrograde ? "switch to prograde" : "switch to retrograde"
							}
							position="top"
							align="center"
						>
							<button
								type="button"
								onClick={params.onToggleDirection}
								className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
							>
								{isRetrograde ? (
									<AxisRotateCounterClockwiseIcon className="h-3 w-3" />
								) : (
									<AxisRotateClockwiseIcon className="h-3 w-3" />
								)}
							</button>
						</UITooltip>
						<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
							{params.label}
						</span>
					</div>
					<span className="font-mono text-[10px] text-slate-400">
						{params.value.toFixed(1)}°
					</span>
				</div>
				<input
					type="range"
					min={min}
					max={max}
					step={0.5}
					value={params.value}
					onChange={(event) => params.onSet(parseFloat(event.target.value))}
					className="mt-3 h-1 w-full cursor-pointer rounded-lg accent-slate-900"
				/>
			</div>
		),
	}
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
	if (showRealSolNames && lunaFallback && moonIndex === 0)
		return SOL_LUNA_DEFAULT.name
	return `moon-${moonIndex + 1}`
}

function formatAtmosphereLabel(
	atmosphere: AtmosphereProfile | null | undefined,
): string {
	if (!atmosphere) return "Vacuum"
	return `${formatPressureBar(atmosphere.pressureBar)} · ${formatAtmosphereSuffix(atmosphere)}`
}

export function buildPressureAtmosphereProfile(
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

const EARTH_MASS_KG = 5.973886146404331e24
const DAYS_PER_YEAR = 365.25

const ORBIT_STAT_HELP = {
	longitudeOfPerihelion:
		"Longitude of perihelion. Where the closest point of the orbit sits, measured from a fixed reference direction.",
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
				{stat.valueHelp && stat.valueHelpTarget !== "prefix" ? (
					<UITooltip content={stat.valueHelp} position="top" align="center">
						<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
							<EditableStatValue stat={stat} />
						</span>
					</UITooltip>
				) : stat.valueHelp &&
					stat.valueHelpTarget === "prefix" &&
					!stat.editor &&
					stat.valuePrefix ? (
					<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
						<UITooltip content={stat.valueHelp} position="top" align="center">
							<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
								{stat.valuePrefix}
							</span>
						</UITooltip>
						<span>{stat.value}</span>
						{stat.valueAction}
					</span>
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
	substellarLon,
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
	substellarLon: number
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
			substellarLon={substellarLon}
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
	substellarLon,
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
	substellarLon: number
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
			substellarLon,
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
			substellarLon,
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
	return {
		label: "Surface Tides",
		value: `${breakdown.totalM.toFixed(3)} m`,
		valueHelp: (
			<ContributionTooltipContent
				title="Surface Tide Sources"
				items={breakdown.contributions
					.slice()
					.sort((a, b) => b.valueM - a.valueM)
					.map((contribution) => ({
						label: contribution.label,
						value: `${contribution.valueM.toFixed(3)} m`,
						tone: "cool" as const,
					}))}
			/>
		),
	}
}

// seismology.totalHeating/regime already fold in surfaceTidesHeating (see
// system-seismology.ts's applySystemSeismology), so this only reads the
// profile itself -- it doesn't need a live surfaceTidesM to avoid
// double-counting the surface-tides contribution.
function buildSeismologyStats(
	seismology:
		| import("@/model/celestial/moons/moon-types").SeismologyProfile
		| undefined,
): StatEntry[] {
	if (!seismology) return []
	return [
		{
			label: "Seismology",
			valuePrefix: seismology.totalHeating.toFixed(2),
			value: `· ${formatClassificationLabel(seismology.regime)}`,
			valueHelp: (
				<ContributionTooltipContent
					title="Seismology Sources"
					items={[
						{
							label: "Residual",
							value: seismology.residualHeating.toFixed(2),
							tone: "neutral" as const,
						},
						{
							label: "Tidal Heating",
							value: seismology.tidalHeating.toFixed(2),
							tone: "warm" as const,
						},
						{
							label: "Surface Tides",
							value: seismology.surfaceTidesHeating.toFixed(3),
							tone: "cool" as const,
						},
					]}
				/>
			),
			valueHelpTarget: "prefix",
		},
	]
}

// Single stat-row builder shared by every orbit body's card in this panel --
// planets/dwarfs/jovians (via buildOrbitBodyStats) and moons (via
// buildMoonStats) -- so the two kinds of body can never drift out of field
// order with each other; only the handful of fields one kind lacks (a moon's
// sizeClass, a planet's terrain surfaceStats tail, the asteroid-belt short
// list) are conditional.
function buildBodyStats({
	kind,
	group,
	classification,
	sizeClass,
	semiMajorAxis,
	orbitalPeriodDays,
	dayLength,
	eccentricity,
	longitudeOfPerihelionDeg,
	inclinationDeg,
	axialTiltDeg,
	diameterKm,
	radiusEditor,
	massKg,
	gravityG,
	substellarLonStat,
	densityEarthRelative,
	densityDescription,
	atmosphereStat,
	hydrosphereFraction,
	greenhouseFactor,
	surfaceTidesM,
	seismology,
	albedo,
	surfaceStats,
}: {
	kind: "planet" | "moon"
	group?: string
	classification?: string
	/** Moons show a rolled size class; planets don't have an equivalent. */
	sizeClass?: number
	semiMajorAxis: {
		value: number
		unit: "AU" | "PD"
		precision: number
		editor?: StatEntry["editor"]
	}
	orbitalPeriodDays: number
	/** null omits the Sidereal/Solar Day (+ tide-lock) block entirely --
	 * a moon without a known parent orbital period can't compute it. */
	dayLength: {
		siderealDayHours: number
		orbitalPeriodDays: number
		retrograde?: boolean
		siderealEditor?: StatEntry["editor"]
		tideLockStat?: StatEntry
		tideLocked: boolean
	} | null
	eccentricity: { value: number; editor?: StatEntry["editor"] }
	longitudeOfPerihelionDeg: { value: number; editor?: StatEntry["editor"] }
	inclinationDeg: { value: number; editor?: StatEntry["editor"] }
	axialTiltDeg: { value: number; editor?: StatEntry["editor"] }
	diameterKm: number
	radiusEditor?: StatEntry["editor"]
	massKg: number
	gravityG: number
	substellarLonStat?: StatEntry
	densityEarthRelative?: number
	densityDescription?: string
	/** Omitted (not just falsy) when a moon has no known atmosphere. */
	atmosphereStat?: StatEntry
	/** Omitted when a surfaceStats tail already carries a Hydrosphere row. */
	hydrosphereFraction?: number
	greenhouseFactor?: number
	surfaceTidesM?: SurfaceTidesBreakdown
	seismology?: import("@/model/celestial/moons/moon-types").SeismologyProfile
	albedo?: number
	/** Terrain-generation fields -- only the main world's card supplies these. */
	surfaceStats?: StatEntry[]
}): StatEntry[] {
	const diameterRel = diameterKm / EARTH_DIAMETER_KM
	const massRel = massKg / EARTH_MASS_KG
	const semiMajorAxisLabel =
		semiMajorAxis.unit === "AU"
			? `${semiMajorAxis.value.toFixed(semiMajorAxis.precision)} AU`
			: `${semiMajorAxis.value.toFixed(semiMajorAxis.precision)} PD`

	return [
		...(group
			? [{ label: "Group", value: formatClassificationLabel(group) }]
			: []),
		...(classification
			? [
					{
						label: "Class",
						value: formatClassificationLabel(classification),
					},
				]
			: []),
		...(kind === "moon" && sizeClass !== undefined
			? [{ label: "Size", value: String(sizeClass) }]
			: []),
		{
			label: "Semi Major Axis",
			value: semiMajorAxisLabel,
			editor: semiMajorAxis.editor,
		},
		{ label: "Period", value: formatDays(orbitalPeriodDays) },
		...(dayLength
			? buildDayLengthStats({ ...dayLength, substellarLonStat })
			: []),
		{
			label: "Eccentricity",
			value: eccentricity.value.toFixed(4),
			editor: eccentricity.editor,
		},
		{
			label: "Perihelion",
			value: `${longitudeOfPerihelionDeg.value.toFixed(1)}°`,
			help: ORBIT_STAT_HELP.longitudeOfPerihelion,
			editor: longitudeOfPerihelionDeg.editor,
		},
		{
			label: "Inclination",
			value: `${inclinationDeg.value.toFixed(1)}°`,
			editor: inclinationDeg.editor,
		},
		{
			label: "Axial Tilt",
			value: `${axialTiltDeg.value.toFixed(1)}°`,
			editor: axialTiltDeg.editor,
		},
		{
			label: "Radius",
			value: `${diameterRel.toFixed(2)} R⊕`,
			editor: radiusEditor,
		},
		{ label: "Mass", value: `${massRel.toFixed(3)} M⊕` },
		{ label: "Gravity", value: `${gravityG.toFixed(3)} g` },
		...(densityEarthRelative !== undefined
			? [
					{
						label: "Density",
						value: `${densityEarthRelative.toFixed(2)} rhoE${densityDescription ? ` · ${densityDescription}` : ""}`,
					},
				]
			: []),
		...(atmosphereStat ? [atmosphereStat] : []),
		...(hydrosphereFraction !== undefined
			? [
					{
						label: "Hydrosphere",
						value: `${Math.round(hydrosphereFraction * 100)}%`,
					},
				]
			: []),
		{ label: "Greenhouse", value: (greenhouseFactor ?? 0).toFixed(2) },
		...(surfaceTidesM ? [buildSurfaceTidesStat(surfaceTidesM)] : []),
		...buildSeismologyStats(seismology),
		...(albedo !== undefined ? [{ label: "Albedo", value: albedo.toFixed(3) }] : []),
		...(surfaceStats ?? []),
	]
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
	seismology,
	pd,
	orbitalPeriodDays,
	siderealDayHours,
	eccentricity,
	longitudeOfPerihelionDeg,
	inclinationDeg,
	axialTiltDeg,
	parentOrbitalPeriodDays,
	surfaceTidesM,
	tideLockStat,
	tideLock,
	substellarLon,
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
	seismology?: import("@/model/celestial/moons/moon-types").SeismologyProfile
	surfaceTidesM?: SurfaceTidesBreakdown
	pd: number
	orbitalPeriodDays: number
	/** Moon's own sidereal rotation period, in hours — independent of
	 * orbitalPeriodDays (not assumed to be tidally locked). */
	siderealDayHours: number
	eccentricity: number
	longitudeOfPerihelionDeg: number
	inclinationDeg: number
	axialTiltDeg: number
	parentOrbitalPeriodDays?: number
	tideLockStat?: StatEntry
	tideLock?: import("@/model/celestial/moons/moon-types").TideLock | null
	substellarLon?: number
	editors?: {
		diameter?: StatEntry["editor"]
		semiMajorAxis?: StatEntry["editor"]
		siderealDay?: StatEntry["editor"]
		eccentricity?: StatEntry["editor"]
		longitudeOfPerihelion?: StatEntry["editor"]
		inclination?: StatEntry["editor"]
		axialTilt?: StatEntry["editor"]
		substellarLon?: (value: number) => void
	}
}): StatEntry[] {
	const substellarLonStat = buildSubstellarLonStat({
		tideLock,
		substellarLon,
		onSet: editors?.substellarLon,
	})
	return buildBodyStats({
		kind: "moon",
		group,
		classification,
		sizeClass,
		semiMajorAxis: {
			value: pd,
			unit: "PD",
			precision: 1,
			editor: editors?.semiMajorAxis,
		},
		orbitalPeriodDays,
		dayLength: parentOrbitalPeriodDays
			? {
					siderealDayHours,
					orbitalPeriodDays: parentOrbitalPeriodDays,
					retrograde: inferRetrogradeRotationFromAxialTiltDeg(axialTiltDeg),
					siderealEditor: editors?.siderealDay,
					tideLockStat,
					tideLocked: !!tideLock,
				}
			: null,
		eccentricity: { value: eccentricity, editor: editors?.eccentricity },
		longitudeOfPerihelionDeg: {
			value: longitudeOfPerihelionDeg,
			editor: editors?.longitudeOfPerihelion,
		},
		inclinationDeg: { value: inclinationDeg, editor: editors?.inclination },
		axialTiltDeg: { value: axialTiltDeg, editor: editors?.axialTilt },
		diameterKm,
		radiusEditor: editors?.diameter,
		massKg,
		gravityG,
		substellarLonStat: substellarLonStat ?? undefined,
		densityEarthRelative,
		densityDescription,
		atmosphereStat:
			atmosphere !== undefined
				? { label: "Atmosphere", value: formatAtmosphereLabel(atmosphere) }
				: undefined,
		hydrosphereFraction,
		greenhouseFactor,
		surfaceTidesM,
		seismology,
		albedo,
	})
}

const SIBLING_GROUP_LABEL: Record<SystemBody["group"], string> = {
	"asteroid belt": "Asteroid Belt",
	dwarf: "Dwarf World",
	terrestrial: "Terrestrial Planet",
	helian: "Helian World",
	jovian: "Jovian Planet",
}

function buildOrbitBodyStats(params: {
	body: SystemBody
	starMassSol: number
	surfaceTidesM?: SurfaceTidesBreakdown
	tideLockStat?: StatEntry
	onUpdateBody?: (updater: (body: SystemBody) => SystemBody) => void
	/** The one thing `isMainWorld` should ever gate here: which extra
	 * (terrain-generation) fields this body's stats card exposes -- every
	 * other field/editor is identical regardless of this flag. */
	isMainWorld?: boolean
	/** Only the main world's atmosphere is currently user-editable (a
	 * generated sibling's atmosphere is rolled, not hand-authored) -- passing
	 * this makes the Atmosphere row editable; omitting it keeps the
	 * generic read-only display. */
	pressureSlider?: SliderDef
	/** Terrain-generation fields (Hydrosphere/Max Elevation/Volcanism) --
	 * only the main world has an actual rendered surface to configure. */
	surfaceStats?: StatEntry[]
	/** Substellar-longitude editing only makes sense for a solar-locked
	 * body, and only the main world currently exposes a solar-lock control. */
	substellarLonSlider?: SliderDef
	onToggleSpin?: () => void
}): StatEntry[] {
	const {
		body,
		starMassSol,
		surfaceTidesM,
		tideLockStat,
		onUpdateBody,
		pressureSlider,
		surfaceStats,
		substellarLonSlider,
		onToggleSpin,
	} = params
	const surfaceStatLabels = new Set(
		surfaceStats?.map((stat) => stat.label) ?? [],
	)
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
	const substellarLonStat = body.tideLock?.type === "solar"
		? substellarLonSlider
			? ({
					label: "Substellar Lon",
					value: substellarLonSlider.display,
					editor: {
						label: "Substellar Lon",
						value: substellarLonSlider.value,
						min: substellarLonSlider.min,
						max: substellarLonSlider.max,
						step: substellarLonSlider.step,
						display: substellarLonSlider.display,
						set: substellarLonSlider.set,
					},
				} as StatEntry)
			: (buildSubstellarLonStat({
					tideLock: body.tideLock,
					substellarLon: body.substellarLon,
					onSet: onUpdateBody
						? (value: number) =>
								onUpdateBody((current) => ({
									...current,
									substellarLon: value,
								}))
						: undefined,
				}) as StatEntry)
		: undefined
	return buildBodyStats({
		kind: "planet",
		group: body.group,
		classification: body.classification,
		semiMajorAxis: {
			value: body.orbitalDistanceAU,
			unit: "AU",
			precision: 3,
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
		orbitalPeriodDays: body.orbitalPeriodDays,
		dayLength: {
			siderealDayHours: body.siderealDayHours,
			orbitalPeriodDays: body.orbitalPeriodDays,
			retrograde: inferRetrogradeRotationFromAxialTiltDeg(body.axialTiltDeg),
			tideLockStat,
			tideLocked: !!body.tideLock,
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
		},
		eccentricity: {
			value: body.eccentricity,
			editor: onUpdateBody
				? {
						label: "Eccentricity",
						value: body.eccentricity,
						min: 0,
						max: 0.9,
						step: 0.001,
						display: body.eccentricity.toFixed(4),
						set: (value: number) =>
							onUpdateBody((current) => ({ ...current, eccentricity: value })),
					}
				: undefined,
		},
		longitudeOfPerihelionDeg: {
			value: body.longitudeOfPerihelionDeg,
			editor: onUpdateBody
				? {
						label: "Perihelion",
						value: body.longitudeOfPerihelionDeg,
						min: 0,
						max: 360,
						step: 1,
						display: `${body.longitudeOfPerihelionDeg.toFixed(0)}°`,
						set: (value: number) =>
							onUpdateBody((current) => ({
								...current,
								longitudeOfPerihelionDeg: value,
							})),
					}
				: undefined,
		},
		inclinationDeg: {
			value: body.inclinationDeg,
			editor: onUpdateBody
				? (() => {
						const directionalEditor = buildDirectionalAngleEditorConfig({
							label: "Inclination",
							value: body.inclinationDeg,
							onSet: (value: number) =>
								onUpdateBody((current) => ({
									...current,
									inclinationDeg: value,
								})),
							onToggleDirection: () =>
								onUpdateBody((current) => ({
									...current,
									inclinationDeg: 180 - current.inclinationDeg,
								})),
						})
						return {
							label: "Inclination",
							value: body.inclinationDeg,
							min: directionalEditor.min,
							max: directionalEditor.max,
							step: 0.5,
							display: `${body.inclinationDeg.toFixed(1)}°`,
							set: (value: number) =>
								onUpdateBody((current) => ({
									...current,
									inclinationDeg: value,
								})),
							content: directionalEditor.content,
						}
					})()
				: undefined,
		},
		axialTiltDeg: {
			value: body.axialTiltDeg,
			editor: onUpdateBody
				? (() => {
						const directionalEditor = buildDirectionalAngleEditorConfig({
							label: "Axial Tilt",
							value: body.axialTiltDeg,
							onSet: (value: number) =>
								onUpdateBody((current) => ({
									...current,
									axialTiltDeg: value,
								})),
							onToggleDirection: () => {
								onUpdateBody((current) => ({
									...current,
									axialTiltDeg: 180 - current.axialTiltDeg,
								}))
								onToggleSpin?.()
							},
						})
						return {
							label: "Axial Tilt",
							value: body.axialTiltDeg,
							min: directionalEditor.min,
							max: directionalEditor.max,
							step: 0.5,
							display: `${body.axialTiltDeg.toFixed(1)}°`,
							set: (value: number) =>
								onUpdateBody((current) => ({
									...current,
									axialTiltDeg: value,
								})),
							content: directionalEditor.content,
						}
					})()
				: undefined,
		},
		diameterKm: body.diameterKm,
		radiusEditor: onUpdateBody
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
		massKg: body.massKg,
		gravityG: body.gravityG,
		substellarLonStat,
		densityEarthRelative: body.density?.earthRelative,
		densityDescription: body.density?.description,
		atmosphereStat: pressureSlider
			? {
					label: "Atmosphere",
					valuePrefix: formatPressureBar(pressureSlider.value),
					value: ` · ${formatAtmosphereSuffix(
						buildPressureAtmosphereProfile(pressureSlider.value),
					)}`,
					editor: {
						label: "Atmosphere",
						value: pressureSlider.value,
						min: pressureSlider.min,
						max: pressureSlider.max,
						step: pressureSlider.step,
						display: pressureSlider.display,
						set: pressureSlider.set,
					},
				}
			: { label: "Atmosphere", value: formatAtmosphereLabel(body.atmosphere) },
		hydrosphereFraction: surfaceStatLabels.has("Hydrosphere")
			? undefined
			: body.hydrosphereFraction,
		greenhouseFactor: body.greenhouseFactor,
		surfaceTidesM,
		seismology: body.seismology,
		albedo: body.albedo ?? estimateAlbedo(1 - body.hydrosphereFraction),
		surfaceStats,
	})
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
	tideLockStat?: StatEntry
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
		tideLockStat,
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
		seismology: moon.seismology,
		surfaceTidesM,
		pd,
		orbitalPeriodDays: moon.orbitalPeriodDays,
		siderealDayHours: moon.siderealDayHours,
		eccentricity: moon.eccentricity,
		longitudeOfPerihelionDeg: moon.longitudeOfPerihelionDeg,
		inclinationDeg: moon.inclinationDeg,
		axialTiltDeg: moon.axialTiltDeg,
		parentOrbitalPeriodDays,
		tideLockStat,
		tideLock: moon.tideLock,
		substellarLon: moon.substellarLon,
		editors: onUpdateMoon
			? {
					substellarLon: (value: number) =>
						onUpdateMoon((current) => ({ ...current, substellarLon: value })),
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
								updateMoonSemiMajorAxis(
									current,
									body,
									value,
									body.siderealDayHours,
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
							onUpdateMoon((current) => ({
								...current,
								siderealDayHours: value,
							})),
					},
					eccentricity: {
						label: "Eccentricity",
						value: moon.eccentricity,
						min: 0,
						max: 0.9,
						step: 0.001,
						display: moon.eccentricity.toFixed(4),
						set: (value: number) =>
							onUpdateMoon((current) => ({ ...current, eccentricity: value })),
					},
					longitudeOfPerihelion: {
						label: "Perihelion",
						value: moon.longitudeOfPerihelionDeg,
						min: 0,
						max: 360,
						step: 1,
						display: `${moon.longitudeOfPerihelionDeg.toFixed(1)}°`,
						set: (value: number) =>
							onUpdateMoon((current) => ({
								...current,
								longitudeOfPerihelionDeg: value,
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
	breadcrumbs: Array<{
		label: string
		onClick: () => void
	}>
	childrenLabel: string
	dataContent?: React.ReactNode
	onFocus?: () => void
	onReset?: () => void
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
	breadcrumbs,
	seedInput,
	seedDisplay,
	onFocus,
	onReset,
	onClose,
	headerAction,
	onSeedInputChange,
	onSeedApply,
	onSeedRandomize,
}: {
	title: string
	typeLabel: string
	breadcrumbs: Array<{
		label: string
		onClick: () => void
	}>
	seedInput: string
	seedDisplay: string
	onFocus?: () => void
	onReset?: () => void
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
							<span>{typeLabel}</span>
							{breadcrumbs.length > 0 ? (
								<>
									<span>·</span>
									<div className="flex flex-wrap items-center gap-2">
										{breadcrumbs.map((crumb, index) => (
											<React.Fragment key={`${crumb.label}-${index}`}>
												{index > 0 ? <span>/</span> : null}
												<InlineTextButton
													onClick={crumb.onClick}
													className="text-slate-500"
												>
													{crumb.label}
												</InlineTextButton>
											</React.Fragment>
										))}
									</div>
								</>
							) : null}
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							{onReset ? (
								<button
									type="button"
									onClick={onReset}
									title="Reset to defaults"
									aria-label="Reset to defaults"
									className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-700"
								>
									<RefreshIcon className="h-3.5 w-3.5" />
								</button>
							) : null}
							<div ref={seedEditorRef} className="relative flex items-center">
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
									title={`Seed: ${seedDisplay}`}
									aria-label={`Seed: ${seedDisplay}`}
									className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-700"
								>
									<SproutIcon className="h-3.5 w-3.5" />
								</button>
							</div>
							{onFocus ? <GpsFocusButton onClick={onFocus} /> : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

function OrbitChildCard({
	title,
	subtitle,
	onClick,
	insertRowsVisible,
	onToggleInsertRows,
}: OrbitChildCardModel & {
	insertRowsVisible: boolean
	onToggleInsertRows: () => void
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-all hover:border-slate-300 hover:bg-slate-50">
			<button
				type="button"
				onClick={onClick}
				className="min-w-0 flex-1 text-left"
			>
				<div className="text-[12px] leading-tight text-slate-950">{title}</div>
			</button>
			<div className="ml-auto flex shrink-0 items-center">
				<div className="mr-1.5 text-[8px] uppercase tracking-[0.12em] text-slate-400">
					{subtitle}
				</div>
				<button
					type="button"
					onClick={onToggleInsertRows}
					aria-label={
						insertRowsVisible
							? `Hide insert rows for ${title}`
							: `Show insert rows for ${title}`
					}
					aria-pressed={insertRowsVisible}
					className={`flex h-5 w-5 items-center justify-center rounded-l-md rounded-r-none border transition-colors ${
						insertRowsVisible
							? "border-slate-300 bg-slate-100 text-slate-700"
							: "border-slate-200 text-slate-400 hover:text-slate-700"
					}`}
				>
					<PlusBoxIcon className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					aria-label={`Hide orbit ${title}`}
					className="flex h-5 w-5 items-center justify-center rounded-r-md rounded-l-none border border-l-0 border-slate-200 text-slate-300"
				>
					<MinusBoxIcon className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
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
		substellarLon: params.moon.substellarLon ?? 0,
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
	onRebuildSystemBody,
	onResetSystemMoon,
	surfaceTidesM,
	tideLock,
	setTideLock,
	setHoursPerDay,
	radiusSlider,
	orbitalDistanceSlider,
	dayLengthSlider,
	substellarLonSlider,
	pressureSlider,
	eccentricitySlider,
	perihelionSlider,
	axialTiltSlider,
	onToggleSpin,
	planetRadiusKm,
	restSeed,
	hoursPerDay,
	moonCount,
	surfaceStats,
	showRealSolNames,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	setRestSeed,
	setObliquity,
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
	onRebuildSystemBody?: (bodyIndex?: number) => void
	onResetSystemMoon?: (bodyIndex: number, moonIndex: number) => void
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
	substellarLonSlider?: SliderDef
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
	// The solar-lock UI button that used setObliquity was removed; kept as a
	// prop for now since GenesisView still threads it through.
	void setObliquity
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
	const [orbitInsertRowsByKey, setOrbitInsertRowsByKey] = useState<
		Record<string, boolean>
	>({})
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
				breadcrumbs: [],
				childrenLabel: "Orbits",
				onFocus: onFocusBody
					? () => focusSelection({ kind: "star" })
					: undefined,
				onReset: onRebuildSystemBody ? () => onRebuildSystemBody() : undefined,
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
					breadcrumbs: [],
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
									// This body's own rotation, not the main world's
									// hoursPerDay slider -- matches the moon-level card's
									// parentHoursPerDay convention below.
									hoursPerDay: body.siderealDayHours,
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
				typeLabel: "Planet",
				breadcrumbs: [
					{
						label: starTitle,
						onClick: () => selectAndFocus({ kind: "star" }),
					},
				],
				childrenLabel: "Moons",
				onFocus: onFocusBody ? () => focusSelection(selection) : undefined,
				onReset: onRebuildSystemBody
					? () => onRebuildSystemBody(selection.bodyIndex)
					: undefined,
				// The main world's own physical fields (radius/orbital distance/day
				// length/eccentricity/periapsis/axial tilt) are still owned by the
				// top-level slider state (the 3D scene and terrain pipeline read
				// them directly there), so an edit from this generic stats card has
				// to be routed back into the matching slider rather than just
				// patching the SystemBody array -- everything else about this call
				// (which stats show, how they're edited) is identical to any other
				// orbit body's card.
				stats: buildOrbitBodyStats({
					body,
					starMassSol,
					surfaceTidesM: bodySurfaceTidesM,
					tideLockStat: buildTideLockStat({
						tideLock: body.tideLock,
						starTitle,
						onSelectStar: () => selectAndFocus({ kind: "star" }),
						siblingMoons: orbitMoons,
						onSelectSiblingMoon: (moonIndex) =>
							selectAndFocus({
								kind: "orbit-moon",
								bodyIndex: selection.bodyIndex,
								moonIndex,
							}),
						onSetLock: isMainWorld
							? (lock) => {
									setTideLock(lock)
									const siderealDayHours = resolveBodyTideLockSiderealDayHours(
										lock,
										body,
									)
									if (siderealDayHours !== undefined)
										setHoursPerDay(siderealDayHours)
								}
							: onUpdateSystemBody
								? (lock) =>
										onUpdateSystemBody(selection.bodyIndex, (current) => {
											const siderealDayHours =
												resolveBodyTideLockSiderealDayHours(lock, current)
											return {
												...current,
												tideLock: lock,
												...(siderealDayHours !== undefined
													? { siderealDayHours }
													: {}),
											}
										})
								: undefined,
						resolveSiblingMoonLabel: (moon, moonIndex) =>
							resolveMoonTitle(
								moon,
								moonIndex + 1,
								showRealSolNames,
								isMainWorld && moonIndex === 0 && restSeed === SOL_SEED
									? SOL_LUNA_DEFAULT.name
									: undefined,
							),
					}),
					isMainWorld,
					pressureSlider: isMainWorld ? pressureSlider : undefined,
					surfaceStats: isMainWorld ? surfaceStats : undefined,
					substellarLonSlider: isMainWorld ? substellarLonSlider : undefined,
					onToggleSpin: isMainWorld ? onToggleSpin : undefined,
					onUpdateBody: isMainWorld
						? (updater) => {
								const updated = updater(body)
								if (updated.diameterKm !== body.diameterKm)
									radiusSlider?.set(updated.diameterKm / 2)
								if (updated.orbitalDistanceAU !== body.orbitalDistanceAU)
									orbitalDistanceSlider?.set(updated.orbitalDistanceAU)
								if (updated.siderealDayHours !== body.siderealDayHours)
									dayLengthSlider?.set(updated.siderealDayHours)
								if (updated.eccentricity !== body.eccentricity)
									eccentricitySlider?.set(updated.eccentricity)
								if (
									updated.longitudeOfPerihelionDeg !==
									body.longitudeOfPerihelionDeg
								)
									perihelionSlider?.set(updated.longitudeOfPerihelionDeg)
								if (updated.axialTiltDeg !== body.axialTiltDeg)
									axialTiltSlider?.set(updated.axialTiltDeg)
								if (
									updated.inclinationDeg !== body.inclinationDeg ||
									updated.longitudeOfAscendingNodeDeg !==
										body.longitudeOfAscendingNodeDeg
								)
									onUpdateSystemBody?.(selection.bodyIndex, () => updated)
							}
						: onUpdateSystemBody && selection.bodyIndex >= 0
							? (updater) => onUpdateSystemBody(selection.bodyIndex, updater)
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
						isSolarLocked={isApproxSolarLocked(
							body.siderealDayHours,
							body.orbitalPeriodDays,
						)}
						spectralClass={spectralClass}
						starSubtype={starSubtype}
						orbitalDistanceAU={body.orbitalDistanceAU}
						eccentricity={body.eccentricity}
						perihelion={body.longitudeOfPerihelionDeg}
						obliquity={body.axialTiltDeg}
						substellarLon={body.substellarLon ?? 0}
						hydrosphereFraction={body.hydrosphereFraction}
						atmosphere={body.atmosphere}
						albedo={body.albedo}
						greenhouseFactor={body.greenhouseFactor}
						internalHeatTempK={body.internalHeatTempK}
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
							isMainWorld && moonIndex === 0 && restSeed === SOL_SEED
								? SOL_LUNA_DEFAULT.name
								: undefined,
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
					breadcrumbs: [],
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
			const parentPerihelionDeg = body.longitudeOfPerihelionDeg
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
					isMainWorld && selection.moonIndex === 0 && restSeed === SOL_SEED
						? SOL_LUNA_DEFAULT.name
						: undefined,
				),
				typeLabel: "Moon",
				breadcrumbs: [
					{
						label: starTitle,
						onClick: () => selectAndFocus({ kind: "star" }),
					},
					{
						label: parentTitle,
						onClick: () =>
							selectAndFocus({
								kind: "orbit",
								bodyIndex: selection.bodyIndex,
							}),
					},
				],
				childrenLabel: "Orbits",
				onFocus: onFocusBody ? () => focusSelection(selection) : undefined,
				onReset: onResetSystemMoon
					? () => onResetSystemMoon(selection.bodyIndex, selection.moonIndex)
					: undefined,
				stats: buildOrbitMoonStats({
					moon,
					tideLockStat: buildTideLockStat({
						tideLock: moon.tideLock,
						starTitle,
						onSelectStar: () => selectAndFocus({ kind: "star" }),
						parentTitle,
						parentTarget: body.idx,
						onSelectParent: () =>
							selectAndFocus({
								kind: "orbit",
								bodyIndex: selection.bodyIndex,
							}),
						onSetLock:
							onUpdateSystemMoon && selection.bodyIndex >= 0
								? (lock) =>
										onUpdateSystemMoon(
											selection.bodyIndex,
											selection.moonIndex,
											(current) => {
												const siderealDayHours =
													resolveMoonTideLockSiderealDayHours(lock, current)
												return {
													...current,
													tideLock: lock,
													...(siderealDayHours !== undefined
														? { siderealDayHours }
														: {}),
												}
											},
										)
								: undefined,
						siblingMoons: parentMoons,
						onSelectSiblingMoon: (moonIndex) =>
							selectAndFocus({
								kind: "orbit-moon",
								bodyIndex: selection.bodyIndex,
								moonIndex,
							}),
						resolveSiblingMoonLabel: (siblingMoon, moonIndex) =>
							resolveMoonTitle(
								siblingMoon,
								moonIndex + 1,
								showRealSolNames,
								isMainWorld && moonIndex === 0 && restSeed === SOL_SEED
									? SOL_LUNA_DEFAULT.name
									: undefined,
							),
					}),
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
		axialTiltSlider,
		dayLengthSlider,
		eccentricitySlider,
		hoursPerDay,
		labeledOrbits,
		moonCount,
		getBodyMoonOrbitDistance,
		getDerivedSeedNumber,
		getMainWorldMoonOrbitDistance,
		generationPreviewTab,
		moonOrbitHoursPerDay,
		onFocusBody,
		onSelectGenerationPreviewTab,
		onToggleSpin,
		onUpdateSystemBody,
		onUpdateSystemMoon,
		onRebuildSystemBody,
		onResetSystemMoon,
		orbitalDistanceSlider,
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
		spectralClass,
		starMassSol,
		starClass,
		starSubtype,
		starTitle,
		surfaceStats,
		surfaceTidesM,
		systemBodies,
		substellarLonSlider,
		unitSystem,
		focusSelection,
		selectAndFocus,
		setTideLock,
	])

	return (
		<div className="space-y-3 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<OrbitHeader
					title={viewModel.title}
					typeLabel={viewModel.typeLabel}
					breadcrumbs={viewModel.breadcrumbs}
					seedInput={seedInput}
					seedDisplay={seedDisplay}
					onFocus={viewModel.onFocus}
					onReset={viewModel.onReset}
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
								{viewModel.children.length > 0 ? (
									<div className="space-y-1.5">
										{viewModel.children.map((child) => (
											<React.Fragment key={child.key}>
												{orbitInsertRowsByKey[child.key] ? (
													<OrbitInsertPlaceholder />
												) : null}
												<OrbitChildCard
													{...child}
													insertRowsVisible={!!orbitInsertRowsByKey[child.key]}
													onToggleInsertRows={() =>
														setOrbitInsertRowsByKey((current) => ({
															...current,
															[child.key]: !current[child.key],
														}))
													}
												/>
												{orbitInsertRowsByKey[child.key] ? (
													<OrbitInsertPlaceholder />
												) : null}
											</React.Fragment>
										))}
									</div>
								) : (
									<OrbitInsertPlaceholder />
								)}
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
	onRebuildSystemBody,
	onResetSystemMoon,
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
		(slider) => slider.label === "Perihelion",
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
	const substellarLonSlider = planetSliders.find(
		(slider) => slider.label === "Substellar Lon",
	)
	const surfaceStats = buildSurfaceStats(planetSliders, terrainSliders)

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
				<div className="rounded-[20px] bg-slate-50 px-3 py-3">
					<GenerationPlanetNavigator
						orbitBodies={orbitBodies}
						systemBodies={systemBodies}
						onFocusBody={onFocusBody}
						currentFocus={currentFocus}
						onUpdateSystemBody={onUpdateSystemBody}
						onUpdateSystemMoon={onUpdateSystemMoon}
						onRebuildSystemBody={onRebuildSystemBody}
						onResetSystemMoon={onResetSystemMoon}
						surfaceTidesM={surfaceTidesM}
						tideLock={tideLock}
						setTideLock={setTideLock}
						setHoursPerDay={setHoursPerDay}
						radiusSlider={radiusSlider}
						orbitalDistanceSlider={orbitalDistanceSlider}
						dayLengthSlider={dayLengthSlider}
						substellarLonSlider={substellarLonSlider}
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

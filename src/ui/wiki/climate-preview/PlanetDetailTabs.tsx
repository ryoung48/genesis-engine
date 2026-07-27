import { useEffect, useMemo, useState } from "react"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { AtmosphereProfile } from "@/model/celestial/orbit-body/types"
import { TIDAL_SCHEDULE } from "@/model/climate/tidal-schedule"
import type { TidalSchedule } from "@/model/climate/tidal-schedule/types"
import { useEbmPreview } from "@/ui/hooks/useEbmPreview"
import { useLockedClimatePreview } from "@/ui/hooks/useLockedClimatePreview"
import {
	GENERATION_PREVIEW_TABS,
	type GenerationPreviewTab,
} from "@/ui/planet/screen/generation/generation-preview"
import type { UnitSystem } from "@/ui/planet/screen/shared/ui-format"
import { LockedClimatePreview } from "@/ui/preview/LockedClimatePreview"
import { RegularClimatePreview } from "@/ui/preview/RegularClimatePreview"
import { TidalCalendarChart } from "@/ui/preview/TidalCalendarChart"
import type {
	ClimatePreviewData,
	LockedClimatePreviewData,
	RegularClimatePreviewData,
} from "@/ui/preview/types"
import { DataSectionSummary } from "@/ui/wiki/shared/ui-atoms"

function PlanetDetailContent({
	tidalSchedulePreview,
	daysPerYear,
	isSolarLocked,
	climatePreview,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	tidesEmptyLabel,
}: {
	tidalSchedulePreview?: TidalSchedule
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
							{tidesEmptyLabel ?? "No tides"}
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

export function isApproxSolarLocked(
	siderealDayHours: number,
	orbitalPeriodDays: number,
): boolean {
	return Math.abs(siderealDayHours - orbitalPeriodDays * 24) < 0.1
}

export function LazyPlanetDetailTabs({
	seed,
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
	landCoverage,
	atmosphere,
	albedo,
	greenhouseFactor,
	internalHeatTempK,
	seismologyTotalHeatingK,
	tidalSchedulePreviewOverride,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	inline,
	tidesEmptyLabel,
}: {
	seed: number
	moons: MoonBody[]
	/** When this card is for a moon (not a planet), the tide raisers are its
	 * parent + peer orbits rather than its own children -- see
	 * computeMoonTidalSchedule. */
	moonContext?: {
		moon: MoonBody
		parent: {
			idx: number
			massKg: number
			diameterKm: number
			moons: MoonBody[]
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
	landCoverage: number
	atmosphere: AtmosphereProfile | null | undefined
	/** Real per-body EBM overrides -- see useEbmPreview.ts's EbmConfig doc.
	 * Pass these for an actual known body (sol-system.ts data); leave unset
	 * for a procedurally generated one, which falls back to the generic
	 * landFraction/pressure heuristics. */
	albedo?: number
	greenhouseFactor?: number
	internalHeatTempK?: number
	seismologyTotalHeatingK?: number
	/** Overrides the tidal schedule this would otherwise compute internally --
	 * used only by the main world, whose own tides tab needs to switch to
	 * whichever moon is currently "focused" in the 3D view rather than always
	 * showing its own moons' aggregate schedule. Sibling bodies/moons don't
	 * pass this and just get the internally-computed one. */
	tidalSchedulePreviewOverride?: TidalSchedule
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
			landCoverage={landCoverage}
			atmosphere={atmosphere}
			albedo={albedo}
			greenhouseFactor={greenhouseFactor}
			internalHeatTempK={internalHeatTempK}
			seismologyTotalHeatingK={seismologyTotalHeatingK}
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

/** Runs the same regular/locked EBM climate simulation as
 * LazyPlanetDetailTabsContent, but unconditionally (not gated by whether the
 * "Preview" section is expanded), so the stats card's Temperature row can
 * populate as soon as a body is selected. Returns the area-weighted average
 * surface temperature in Kelvin. */
export function useAvgTempKPreview(config: {
	isSolarLocked: boolean
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	landCoverage: number
	planetRadiusKm: number
	pressureBar: number
	albedo?: number
	greenhouseFactor?: number
	internalHeatTempK?: number
	seismologyTotalHeatingK?: number
	substellarLon: number
}): number {
	const {
		isSolarLocked,
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		hoursPerDay,
		daysPerYear,
		landCoverage,
		planetRadiusKm,
		pressureBar,
		albedo,
		greenhouseFactor,
		internalHeatTempK,
		seismologyTotalHeatingK,
		substellarLon,
	} = config
	const landFraction = Math.max(0, Math.min(1, landCoverage))
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
			seismologyTotalHeatingK,
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
			seismologyTotalHeatingK,
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
			seismologyTotalHeatingK,
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
			seismologyTotalHeatingK,
		],
	)
	const regularPreview = useEbmPreview(regularPreviewConfig)
	const lockedPreview = useLockedClimatePreview(lockedPreviewConfig)
	const climatePreview = isSolarLocked ? lockedPreview : regularPreview
	return climatePreview.avgTemp + 273.15
}

function LazyPlanetDetailTabsContent({
	seed,
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
	landCoverage,
	atmosphere,
	albedo,
	greenhouseFactor,
	internalHeatTempK,
	seismologyTotalHeatingK,
	tidalSchedulePreviewOverride,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	tidesEmptyLabel,
}: {
	seed: number
	moons: MoonBody[]
	moonContext?: {
		moon: MoonBody
		parent: {
			idx: number
			massKg: number
			diameterKm: number
			moons: MoonBody[]
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
	landCoverage: number
	atmosphere: AtmosphereProfile | null | undefined
	albedo?: number
	greenhouseFactor?: number
	internalHeatTempK?: number
	seismologyTotalHeatingK?: number
	tidalSchedulePreviewOverride?: TidalSchedule
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	tidesEmptyLabel?: string
}) {
	const pressureBar = atmosphere?.pressureBar ?? 0
	const landFraction = Math.max(0, Math.min(1, landCoverage))
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
			seismologyTotalHeatingK,
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
			seismologyTotalHeatingK,
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
			seismologyTotalHeatingK,
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
			seismologyTotalHeatingK,
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
				? TIDAL_SCHEDULE.computeMoonTidalSchedule({
						moon: moonContext.moon,
						parent: moonContext.parent,
						params: {
							daysPerYear: moonTideContext?.daysPerYear ?? daysPerYear,
							hoursPerDay: moonTideContext?.hoursPerDay ?? hoursPerDay,
							spectralClass,
							starSubtype,
							orbitalDistanceAU,
							eccentricity,
							perihelion,
						},
					})
				: moons.length > 0
					? TIDAL_SCHEDULE.computeTidalSchedule({
							moons,
							params: {
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
							},
						})
					: undefined,
		[
			moonContext,
			moonTideContext,
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

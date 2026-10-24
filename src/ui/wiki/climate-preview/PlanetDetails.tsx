import { useMemo, useState } from "react"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { Surface } from "@/ui/components/primitives/Surface"
import { LockedClimatePreview } from "@/ui/wiki/climate-preview/LockedClimatePreview"
import { TidalCalendarChart } from "@/ui/wiki/climate-preview/TidalCalendarChart"
import type {
	LockedAvgTempConfig,
	PlanetClimatePreviewProps,
	PlanetDetailDataProps,
	PlanetDetailSectionProps,
	PlanetDetailsProps,
} from "@/ui/wiki/climate-preview/types"
import { useLockedClimatePreview } from "@/ui/wiki/climate-preview/useLockedClimatePreview"

function PlanetDetailSection({
	label,
	initiallyExpanded,
	children,
}: PlanetDetailSectionProps) {
	const [expanded, setExpanded] = useState(initiallyExpanded)
	return (
		<Surface
			tone="panel"
			borderTone="default"
			radius="xl"
			className="px-3 py-2"
		>
			<DisclosureButton
				label={label}
				expanded={expanded}
				onClick={() => setExpanded((current) => !current)}
			/>
			{expanded ? <div className="pt-1">{children}</div> : null}
		</Surface>
	)
}

export function isApproxSolarLocked(
	siderealDayHours: number,
	orbitalPeriodDays: number,
): boolean {
	return Math.abs(siderealDayHours - orbitalPeriodDays * 24) < 0.1
}

export function PlanetDetails({
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
	starTemperatureK,
	starDiameterSol,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	obliquity,
	substellarLon,
	atmosphere,
	seismologyTotalHeatingK,
	tidalSchedulePreviewOverride,
	unitSystem,
	tidesEmptyLabel,
	generateContent,
	observerContent,
}: PlanetDetailsProps) {
	const canRenderClimate =
		planetRadiusKm > 0 &&
		orbitalDistanceAU > 0 &&
		daysPerYear > 0 &&
		hoursPerDay > 0
	return (
		<div className="space-y-3">
			{observerContent ? (
				<PlanetDetailSection label="Observer" initiallyExpanded={false}>
					{observerContent}
				</PlanetDetailSection>
			) : null}
			{canRenderClimate ? (
				<PlanetDetailData
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
					starTemperatureK={starTemperatureK}
					starDiameterSol={starDiameterSol}
					orbitalDistanceAU={orbitalDistanceAU}
					eccentricity={eccentricity}
					perihelion={perihelion}
					obliquity={obliquity}
					substellarLon={substellarLon}
					atmosphere={atmosphere}
					seismologyTotalHeatingK={seismologyTotalHeatingK}
					tidalSchedulePreviewOverride={tidalSchedulePreviewOverride}
					unitSystem={unitSystem}
					tidesEmptyLabel={tidesEmptyLabel}
				/>
			) : null}
			{generateContent ? (
				<PlanetDetailSection label="Generate" initiallyExpanded={true}>
					{generateContent}
				</PlanetDetailSection>
			) : null}
		</div>
	)
}

function usePlanetClimatePreview(config: LockedAvgTempConfig) {
	const {
		obliquity,
		eccentricity,
		perihelion,
		spectralClass,
		starSubtype,
		starTemperatureK,
		starDiameterSol,
		orbitalDistanceAU,
		hoursPerDay,
		daysPerYear,
		planetRadiusKm,
		pressureBar,
		seismologyTotalHeatingK,
		substellarLon,
	} = config
	const lockedPreviewConfig = useMemo(
		() => ({
			obliquity,
			eccentricity,
			perihelion,
			spectralClass,
			starSubtype,
			starTemperatureK,
			starDiameterSol,
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
			starTemperatureK,
			starDiameterSol,
			orbitalDistanceAU,
			hoursPerDay,
			daysPerYear,
			planetRadiusKm,
			pressureBar,
			substellarLon,
			seismologyTotalHeatingK,
		],
	)
	return useLockedClimatePreview(lockedPreviewConfig)
}

export function useLockedAvgTempK(
	config: LockedAvgTempConfig,
): number | undefined {
	const preview = usePlanetClimatePreview(config)
	return config.isSolarLocked ? preview.avgTemp + 273.15 : undefined
}

function PlanetClimatePreview({
	config,
	unitSystem,
}: PlanetClimatePreviewProps) {
	const preview = usePlanetClimatePreview(config)
	return <LockedClimatePreview preview={preview} unitSystem={unitSystem} />
}

function PlanetDetailData({
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
	starTemperatureK,
	starDiameterSol,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	obliquity,
	substellarLon,
	atmosphere,
	seismologyTotalHeatingK,
	tidalSchedulePreviewOverride,
	unitSystem,
	tidesEmptyLabel,
}: PlanetDetailDataProps) {
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
		<>
			<PlanetDetailSection label="Tides" initiallyExpanded={false}>
				{tidalSchedulePreview && tidalSchedulePreview.events.length > 0 ? (
					<TidalCalendarChart
						schedule={tidalSchedulePreview}
						daysPerYear={daysPerYear}
						compact={true}
					/>
				) : (
					<EmptyState minHeight={128} message={tidesEmptyLabel ?? "No tides"} />
				)}
			</PlanetDetailSection>
			{isSolarLocked ? (
				<PlanetDetailSection label="Preview" initiallyExpanded={false}>
					<div className="h-[248px] overflow-hidden">
						<PlanetClimatePreview
							config={{
								isSolarLocked,
								obliquity,
								eccentricity,
								perihelion,
								spectralClass,
								starSubtype,
								starTemperatureK,
								starDiameterSol,
								orbitalDistanceAU,
								hoursPerDay,
								daysPerYear,
								planetRadiusKm,
								pressureBar: atmosphere?.pressureBar ?? 0,
								substellarLon,
								seismologyTotalHeatingK,
							}}
							unitSystem={unitSystem}
						/>
					</div>
				</PlanetDetailSection>
			) : null}
		</>
	)
}

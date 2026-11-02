import { useMemo, useState } from "react"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { Surface } from "@/ui/components/primitives/Surface"
import { TidalCalendarChart } from "@/ui/wiki/climate-preview/TidalCalendarChart"
import type {
	PlanetDetailDataProps,
	PlanetDetailSectionProps,
	PlanetDetailsProps,
} from "@/ui/wiki/climate-preview/types"

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

export function PlanetDetails({
	seed,
	moons,
	moonContext,
	moonTideContext,
	daysPerYear,
	hoursPerDay,
	planetRadiusKm,
	spectralClass,
	starSubtype,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	tidalSchedulePreviewOverride,
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
					spectralClass={spectralClass}
					starSubtype={starSubtype}
					orbitalDistanceAU={orbitalDistanceAU}
					eccentricity={eccentricity}
					perihelion={perihelion}
					tidalSchedulePreviewOverride={tidalSchedulePreviewOverride}
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

function PlanetDetailData({
	seed,
	moons,
	moonContext,
	moonTideContext,
	daysPerYear,
	hoursPerDay,
	planetRadiusKm,
	spectralClass,
	starSubtype,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	tidalSchedulePreviewOverride,
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
		</>
	)
}

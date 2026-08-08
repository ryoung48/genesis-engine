import type React from "react"
import type { MoonBody, MoonOrbitRange } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	AtmosphereProfile,
	SeismologyProfile,
	TideLock,
} from "@/model/celestial/orbit-body/types"
import type { SystemBody } from "@/model/celestial/system/types"
import type { SurfaceTidesBreakdown } from "@/model/climate/ocean/tides/tidal-schedule/types"
import { ContributionTooltipContent } from "@/ui/components/composites/ContributionTooltipContent"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { Slider } from "@/ui/components/primitives/Slider"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import type { SliderDef } from "@/ui/genesis/generation/sliders"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import { classificationSwatchColor } from "@/ui/genesis/solar-system/overlay/constants"
import { LazyPlanetDetailTabs } from "@/ui/wiki/climate-preview/PlanetDetailTabs"
import { estimateAlbedo } from "@/ui/wiki/climate-preview/useEbmPreview"
import {
	updateBodyDiameter,
	updateBodyOrbitalDistance,
	updateMoonDiameter,
	updateMoonSemiMajorAxis,
} from "@/ui/wiki/stats/orbit/body-mutations"
import {
	buildPressureAtmosphereProfile,
	describeTemperatureK,
	formatAtmosphereLabel,
	formatAtmosphereSuffix,
	formatAvgTempValue,
	formatClassificationLabel,
	formatDays,
	formatHours,
	formatHydrosphereValuePrefix,
	formatHydrosphereValueSuffix,
	formatPressureBar,
} from "@/ui/wiki/stats/orbit/formatters"
import { buildSeismologyStats } from "@/ui/wiki/stats/orbit/seismology-stats"
import {
	buildDayLengthStats,
	buildDirectionalAngleEditorConfig,
	buildSubstellarLonStat,
} from "@/ui/wiki/stats/orbit/tide-lock-stats"

interface OrbitalShapeEditorParams {
	eccentricity: number
	perihelionDeg: number
	onSetEccentricity: (value: number) => void
	onSetPerihelion: (value: number) => void
}

function buildOrbitalShapeEditor(
	params: OrbitalShapeEditorParams,
): NonNullable<StatEntry["editor"]> {
	return {
		label: "Eccentricity",
		value: params.eccentricity,
		min: 0,
		max: 0.9,
		step: 0.001,
		display: params.eccentricity.toFixed(4),
		set: params.onSetEccentricity,
		content: (
			<div className="flex w-44 flex-col gap-3 px-1 pt-0.5 pb-2">
				<Slider
					label="Eccentricity"
					value={params.eccentricity.toFixed(4)}
					min={0}
					max={0.9}
					step={0.001}
					inputValue={params.eccentricity}
					onChange={params.onSetEccentricity}
				/>
				<Slider
					label="Perihelion"
					value={`${params.perihelionDeg.toFixed(1)}°`}
					min={0}
					max={360}
					step={1}
					inputValue={params.perihelionDeg}
					onChange={params.onSetPerihelion}
				/>
			</div>
		),
	}
}

function buildGroupClassStat(
	group: string | undefined,
	classification: string | undefined,
): StatEntry[] {
	if (!group) return []
	const groupLabel = formatClassificationLabel(group)
	const classLabel = classification
		? formatClassificationLabel(classification)
		: undefined
	return [
		{
			label: "Class",
			value: classLabel ?? groupLabel,
			swatchColor: classificationSwatchColor(classification),
		},
	]
}

function buildBodyStats({
	group,
	classification,
	sizeClass,
	semiMajorAxis,
	orbitalPeriodDays,
	dayLength,
	eccentricity,
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
	landCoverage,
	hydrosphereCode,
	landCoverageEditor,
	avgTempK,
	unitSystem,
	greenhouseFactor,
	surfaceTidesM,
	seismology,
	albedo,
}: {
	kind: "planet" | "moon"
	group?: string
	classification?: string
	/** Shown as a " · Size N" suffix on the Radius row rather than its own
	 * row. */
	sizeClass?: number
	semiMajorAxis: {
		value: number
		unit: "AU" | "PD"
		precision: number
		editor?: StatEntry["editor"]
		/** Shown as a " · <suffix>" after the distance. */
		rangeLabel?: string
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
		/** See formatLocalCalendarValue's doc -- only ever set for a moon's
		 * own card. */
		moonOrbitalPeriodDays?: number
	} | null
	eccentricity: { value: number; editor?: StatEntry["editor"] }
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
	landCoverage?: number
	hydrosphereCode?: number
	/** Only the main world's Hydrosphere row is directly editable (with the
	 * composition/variation/sea-level mini-sliders) -- a generated sibling or
	 * moon's land coverage is rolled, not hand-authored. */
	landCoverageEditor?: StatEntry["editor"]
	/** Area-weighted average surface temperature (Kelvin) from whichever
	 * climate preview actually ran for this body -- see LazyPlanetDetailTabs'
	 * onAvgTempKChange. Undefined until that preview has produced a result. */
	avgTempK?: number
	unitSystem: UnitSystem
	greenhouseFactor?: number
	surfaceTidesM?: SurfaceTidesBreakdown
	seismology?: SeismologyProfile
	albedo?: number
}): StatEntry[] {
	const diameterRel = diameterKm / ORBIT_BODY.earthDiameterKm
	const massRelEarth = massKg / ORBIT_BODY.earthMassKg
	const semiMajorAxisLabel =
		semiMajorAxis.unit === "AU"
			? `${semiMajorAxis.value.toFixed(semiMajorAxis.precision)} AU`
			: `${semiMajorAxis.value.toFixed(semiMajorAxis.precision)} PD`

	return [
		...buildGroupClassStat(group, classification),
		{
			label: "Semi Major Axis",
			valuePrefix: semiMajorAxisLabel,
			value: semiMajorAxis.rangeLabel ? ` · ${semiMajorAxis.rangeLabel}` : "",
			editor: semiMajorAxis.editor,
		},
		...(dayLength
			? []
			: [{ label: "Period", value: formatDays(orbitalPeriodDays) }]),
		...(dayLength
			? buildDayLengthStats({ ...dayLength, substellarLonStat })
			: []),
		{
			label: "Eccentricity",
			value: eccentricity.value.toFixed(4),
			editor: eccentricity.editor,
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
			valuePrefix: `${diameterRel.toFixed(2)} R⊕`,
			value: sizeClass !== undefined ? ` · Size ${sizeClass}` : "",
			editor: radiusEditor,
		},
		{
			label: "Mass",
			valuePrefix: `${massRelEarth.toFixed(3)} M⊕`,
			value: ` · ${gravityG.toFixed(3)} g`,
		},
		...(densityEarthRelative !== undefined
			? [
					{
						label: "Density",
						value: `${densityEarthRelative.toFixed(2)} rhoE${densityDescription ? ` · ${densityDescription}` : ""}`,
					},
				]
			: []),
		...(atmosphereStat ? [atmosphereStat] : []),
		...(landCoverage !== undefined
			? [
					{
						// Displayed as "Hydrosphere" (water fraction) even though the
						// underlying state is landCoverage (land fraction). Always sits
						// right after Atmosphere for every body -- only the main world
						// supplies landCoverageEditor, making this row editable there.
						label: "Hydrosphere",
						valuePrefix: formatHydrosphereValuePrefix(landCoverage),
						value: formatHydrosphereValueSuffix(hydrosphereCode),
						editor: landCoverageEditor,
					},
				]
			: []),
		...(avgTempK !== undefined
			? [
					{
						label: "Temperature",
						valuePrefix: formatAvgTempValue(avgTempK, unitSystem),
						value: ` · ${describeTemperatureK(avgTempK)}`,
						valueHelp: (
							<ContributionTooltipContent
								title="Climate Inputs"
								items={[
									{
										label: "Greenhouse",
										value: (greenhouseFactor ?? 0).toFixed(2),
										tone: "warm" as const,
									},
									...(albedo !== undefined
										? [
												{
													label: "Albedo",
													value: albedo.toFixed(3),
													tone: "cool" as const,
												},
											]
										: []),
								]}
							/>
						),
						valueHelpTarget: "prefix" as const,
					},
				]
			: []),
		...buildSeismologyStats(seismology, surfaceTidesM),
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
	landCoverage,
	hydrosphereCode,
	avgTempK,
	unitSystem,
	atmosphere,
	albedo,
	greenhouseFactor,
	seismology,
	pd,
	orbitRange,
	orbitalPeriodDays,
	siderealDayHours,
	eccentricity,
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
	landCoverage?: number
	hydrosphereCode?: number
	avgTempK?: number
	unitSystem: UnitSystem
	atmosphere?: AtmosphereProfile | null
	albedo?: number
	greenhouseFactor?: number
	seismology?: SeismologyProfile
	surfaceTidesM?: SurfaceTidesBreakdown
	pd: number
	orbitRange?: MoonOrbitRange
	orbitalPeriodDays: number
	/** Moon's own sidereal rotation period, in hours — independent of
	 * orbitalPeriodDays (not assumed to be tidally locked). */
	siderealDayHours: number
	eccentricity: number
	inclinationDeg: number
	axialTiltDeg: number
	parentOrbitalPeriodDays?: number
	tideLockStat?: StatEntry
	tideLock?: TideLock | null
	substellarLon?: number
	editors?: {
		diameter?: StatEntry["editor"]
		semiMajorAxis?: StatEntry["editor"]
		siderealDay?: StatEntry["editor"]
		eccentricity?: StatEntry["editor"]
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
			rangeLabel: orbitRange
				? formatClassificationLabel(orbitRange)
				: undefined,
		},
		orbitalPeriodDays,
		dayLength: parentOrbitalPeriodDays
			? {
					siderealDayHours,
					orbitalPeriodDays: parentOrbitalPeriodDays,
					retrograde:
						ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(axialTiltDeg),
					siderealEditor: editors?.siderealDay,
					tideLockStat,
					tideLocked: !!tideLock,
					moonOrbitalPeriodDays: orbitalPeriodDays,
				}
			: null,
		eccentricity: { value: eccentricity, editor: editors?.eccentricity },
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
		landCoverage,
		hydrosphereCode,
		avgTempK,
		unitSystem,
		greenhouseFactor,
		surfaceTidesM,
		seismology,
		albedo,
	})
}

export function buildOrbitBodyStats(params: {
	body: SystemBody
	starMassSol: number
	starLuminositySol: number
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
	/** Only the main world's Hydrosphere row is directly editable (with the
	 * composition/variation/sea-level mini-sliders) -- only it has an actual
	 * rendered surface to configure. */
	landCoverageEditor?: StatEntry["editor"]
	/** Substellar-longitude editing only makes sense for a solar-locked
	 * body, and only the main world currently exposes a solar-lock control. */
	substellarLonSlider?: SliderDef
	onToggleSpin?: () => void
	/** Area-weighted average surface temperature (Kelvin) from whichever
	 * climate preview actually ran for this body -- see LazyPlanetDetailTabs'
	 * onAvgTempKChange. Undefined until that preview has produced a result. */
	avgTempK?: number
	unitSystem: UnitSystem
	/** The Semi Major Axis editor's min/max are always ±10% of this value
	 * (defaults to the body's own current orbitalDistanceAU, i.e. no fixed
	 * baseline) rather than one fixed 0.01-60 AU span for every body --
	 * callers that track a frozen post-generation baseline (see
	 * GenerationPlanetNavigator) pass it here so the range stays a stable,
	 * balanced window instead of recentering on every edit. */
	orbitalDistanceBaselineAU?: number
}): StatEntry[] {
	const {
		body,
		starMassSol,
		starLuminositySol,
		surfaceTidesM,
		tideLockStat,
		onUpdateBody,
		pressureSlider,
		landCoverageEditor,
		substellarLonSlider,
		onToggleSpin,
		avgTempK,
		unitSystem,
		orbitalDistanceBaselineAU,
	} = params
	if (body.group === "asteroid belt") {
		return [
			...buildGroupClassStat(body.group, body.classification),
			{
				label: "Semi Major Axis",
				valuePrefix: `${body.orbitalDistanceAU.toFixed(3)} AU`,
				value: body.zone ? ` · ${formatClassificationLabel(body.zone)}` : "",
			},
			{ label: "Period", value: formatDays(body.orbitalPeriodDays) },
		]
	}
	const substellarLonStat =
		body.tideLock?.type === "solar"
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
		sizeClass: body.sizeClass,
		semiMajorAxis: {
			value: body.orbitalDistanceAU,
			unit: "AU",
			precision: 3,
			rangeLabel: body.zone ? formatClassificationLabel(body.zone) : undefined,
			editor: onUpdateBody
				? {
						label: "Semi Major Axis",
						value: body.orbitalDistanceAU,
						min: (orbitalDistanceBaselineAU ?? body.orbitalDistanceAU) * 0.9,
						max: (orbitalDistanceBaselineAU ?? body.orbitalDistanceAU) * 1.1,
						step: 0.01,
						display: `${body.orbitalDistanceAU.toFixed(3)} AU`,
						set: (value: number) =>
							onUpdateBody((current) =>
								updateBodyOrbitalDistance(
									current,
									value,
									starMassSol,
									starLuminositySol,
								),
							),
					}
				: undefined,
		},
		orbitalPeriodDays: body.orbitalPeriodDays,
		dayLength: {
			siderealDayHours: body.siderealDayHours,
			orbitalPeriodDays: body.orbitalPeriodDays,
			retrograde: ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(
				body.axialTiltDeg,
			),
			tideLockStat,
			tideLocked: !!body.tideLock,
			siderealEditor: onUpdateBody
				? {
						label: "Rotation",
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
				? buildOrbitalShapeEditor({
						eccentricity: body.eccentricity,
						perihelionDeg: body.lsAphelionDeg ?? body.longitudeOfPerihelionDeg,
						onSetEccentricity: (value: number) =>
							onUpdateBody((current) => ({ ...current, eccentricity: value })),
						onSetPerihelion: (value: number) =>
							onUpdateBody((current) => ({
								...current,
								lsAphelionDeg: value,
							})),
					})
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
					value: body.diameterKm / ORBIT_BODY.earthDiameterKm,
					min: 0.1,
					max: 18,
					step: 0.01,
					display: `${(body.diameterKm / ORBIT_BODY.earthDiameterKm).toFixed(2)} R⊕`,
					set: (value: number) =>
						onUpdateBody((current) =>
							updateBodyDiameter(current, value * ORBIT_BODY.earthDiameterKm),
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
		landCoverage: body.landCoverage,
		hydrosphereCode: body.hydrosphereCode,
		avgTempK,
		unitSystem,
		landCoverageEditor,
		greenhouseFactor: body.greenhouseFactor,
		surfaceTidesM,
		seismology: body.seismology,
		albedo: body.albedo ?? estimateAlbedo(body.landCoverage),
	})
}

// Shares buildMoonStats with every other moon card in this panel (the main
// world's own moons, a gas giant's orbit moons) so all moons present the
// same stat set regardless of which body they orbit.
export function buildOrbitMoonStats(params: {
	moon: MoonBody
	parentOrbitalPeriodDays: number
	pdOverride?: number
	surfaceTidesM?: SurfaceTidesBreakdown
	tideLockStat?: StatEntry
	avgTempK?: number
	unitSystem: UnitSystem
	onUpdateMoon?: (
		updater: (moon: MoonBody, parentBody: SystemBody) => MoonBody,
	) => void
}): StatEntry[] {
	const {
		moon,
		parentOrbitalPeriodDays,
		pdOverride,
		surfaceTidesM,
		tideLockStat,
		avgTempK,
		unitSystem,
		onUpdateMoon,
	} = params
	const pd = moon.semiMajorAxisPlanetDiameters ?? pdOverride ?? 0
	const gravityG = ORBIT_BODY.computeGravityG({
		massKg: moon.massKg,
		diameterKm: moon.diameterKm,
	})
	return buildMoonStats({
		diameterKm: moon.diameterKm,
		massKg: moon.massKg,
		gravityG,
		sizeClass: moon.sizeClass,
		densityEarthRelative: moon.density?.earthRelative,
		densityDescription: moon.density?.description,
		group: moon.group,
		classification: moon.classification,
		landCoverage: moon.landCoverage,
		hydrosphereCode: moon.hydrosphereCode,
		avgTempK,
		unitSystem,
		atmosphere: moon.atmosphere,
		albedo: moon.albedo,
		greenhouseFactor: moon.greenhouseFactor,
		seismology: moon.seismology,
		surfaceTidesM,
		pd,
		orbitRange: moon.orbitRange,
		orbitalPeriodDays: moon.orbitalPeriodDays,
		siderealDayHours: moon.siderealDayHours,
		eccentricity: moon.eccentricity,
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
						value: moon.diameterKm / ORBIT_BODY.earthDiameterKm,
						min: 0.01,
						max: 3,
						step: 0.01,
						display: `${(moon.diameterKm / ORBIT_BODY.earthDiameterKm).toFixed(2)} R⊕`,
						set: (value: number) =>
							onUpdateMoon((current) =>
								updateMoonDiameter(current, value * ORBIT_BODY.earthDiameterKm),
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
								updateMoonSemiMajorAxis(current, body, value),
							),
					},
					siderealDay: {
						label: "Rotation",
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
					eccentricity: buildOrbitalShapeEditor({
						eccentricity: moon.eccentricity,
						perihelionDeg: moon.longitudeOfPerihelionDeg,
						onSetEccentricity: (value: number) =>
							onUpdateMoon((current) => ({
								...current,
								eccentricity: value,
							})),
						onSetPerihelion: (value: number) =>
							onUpdateMoon((current) => ({
								...current,
								longitudeOfPerihelionDeg: value,
							})),
					}),
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

export function buildMoonPreviewDataProps(params: {
	seed: number
	moon: MoonBody
	parent: {
		idx: number
		massKg: number
		diameterKm: number
		moons: MoonBody[]
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
		ORBIT_BODY.computeSolarDayHours({
			siderealDayHours: params.moon.siderealDayHours,
			orbitalPeriodDays: parentYearHours / 24,
			retrograde: ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(
				params.moon.axialTiltDeg,
			),
		}) ?? params.moon.siderealDayHours
	const climateDaysPerYear =
		climateHoursPerDay > 0 ? parentYearHours / climateHoursPerDay : 0
	return {
		inline: true,
		seed: params.seed,
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
		landCoverage: params.moon.landCoverage,
		atmosphere: params.moon.atmosphere,
		albedo: params.moon.albedo,
		greenhouseFactor: params.moon.greenhouseFactor,
		seismologyTotalHeatingK: params.moon.seismology?.totalHeating,
		generationPreviewTab: params.generationPreviewTab,
		onSelectGenerationPreviewTab: params.onSelectGenerationPreviewTab,
		unitSystem: params.unitSystem,
		tidesEmptyLabel: "Computing…",
	}
}

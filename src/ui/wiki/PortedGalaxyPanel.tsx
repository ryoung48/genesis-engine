import React, { useEffect, useMemo, useState } from "react"
import type {
	GalaxyStar,
	GalaxySystem,
} from "@/model/celestial/galaxy/systems/types"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { SystemBody } from "@/model/celestial/system/types"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { Popover } from "@/ui/components/composites/Popover"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { Button } from "@/ui/components/primitives/Button"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { ProgressBar } from "@/ui/components/primitives/ProgressBar"
import { Slider } from "@/ui/components/primitives/Slider"
import { Surface } from "@/ui/components/primitives/Surface"
import type { PortedGalaxyParams } from "@/ui/genesis/galaxy/view/portedGalaxyParams"
import { SPECTRAL_CLASS_COLORS } from "@/ui/genesis/generation/star-utils"
import type { OrbitAddress } from "@/ui/genesis/solar-system/overlay/types"
import type { SpecialCircumstance } from "@/ui/wiki/galaxy-generation-panel/types"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	ATMOSPHERE_CATEGORIES,
	BIOSPHERE_CATEGORIES,
	buildAtmosphereDistribution,
	buildAxialTiltDistribution,
	buildBiosphereDistribution,
	buildCompositionDistribution,
	buildEccentricityDistribution,
	buildHydrosphereDistribution,
	buildMoonClassificationDistribution,
	buildMoonCountDistribution,
	buildMoonOrbitRangeDistribution,
	buildPlanetClassificationDistribution,
	buildRotationDistribution,
	buildSizeDistribution,
	buildSystemHabitabilityDistribution,
	buildSystemSizeDistribution,
	buildTemperatureDistribution,
	COMPOSITION_CATEGORIES,
	collectBodiesByClassification,
	countSystemBodies,
	HABITABILITY_CATEGORY_LABELS,
	HYDROSPHERE_CATEGORIES,
	TEMPERATURE_CATEGORIES,
} from "@/ui/wiki/stats/galaxy/galaxy-body-distributions"
import {
	filterSystemIndices,
	findBodyClassificationConditions,
	hasBodyFilter,
	hasBodyFilterForKind,
	hasStarAttributeFilter,
	matchesBodyFilter,
	matchesStarFilter,
} from "@/ui/wiki/system-filter/evaluate-system-filter"
import { SystemFilterBuilder } from "@/ui/wiki/system-filter/SystemFilterBuilder"
import type { SystemFilterRoot } from "@/ui/wiki/system-filter/types"

// The built-in preset table (GalaxyRendererThree.ts's initSimulation) has no
// names of its own -- these are original descriptive labels picked from
// each preset's actual shape (winding tightness, eccentricity, core size),
// in the same push order as initSimulation so index i always lines up with
// renderer.presets[i].
const PRESET_NAMES = [
	"Classic Spiral",
	"Grand Design",
	"Tightly Wound",
	"Barred Core",
	"Flocculent Arms",
	"Strong Bar",
	"Giant Bulge",
	"Compact Core",
	"Mild Spiral",
] as const

interface GalaxySystemSearchStar {
	spectralClass: string
	luminosityClass: string
	/** Very young (age<0.01 Gyr, mass<8 Msol) -- a strict subset of primordial.
	 * See body/index.ts's proto/primordial derivation. */
	proto: boolean
	/** Young (age<0.1 Gyr). */
	primordial: boolean
}

interface GalaxySystemSearchEntry {
	systemIndex: number
	stars: GalaxySystemSearchStar[]
}

interface AdvancedStarFilterMatchInput {
	star: GalaxyStar
	filter: SystemFilterRoot
}

function matchesAdvancedStarFilter({
	star,
	filter,
}: AdvancedStarFilterMatchInput): boolean {
	return matchesStarFilter({
		node: filter,
		star: {
			spectralClass: star.spectralClass,
			luminosityClass: star.luminosityClass,
			proto: star.ageGyr < 0.01 && star.massSol < 8,
			primordial: star.ageGyr < 0.1,
		},
	})
}

type StarYouthFilter = "all" | "proto" | "primordial"
type StarCountFilter = "all" | "1" | "2" | "3" | "4+"

function matchesStarCountFilter(
	count: number,
	filter: StarCountFilter,
): boolean {
	if (filter === "all") return true
	if (filter === "4+") return count > 3
	return count === Number(filter)
}

const SPECIAL_CIRCUMSTANCE_OPTIONS: SpecialCircumstance[] = [
	"Trojan Orbit",
	"Minor Rings",
	"Major Rings",
	"Twin Moon",
	"Asteroid Body",
]

interface GalaxyBodyClassificationTemperaturePair {
	classification: string
	compositionClass: string | undefined
	zone: string | undefined
	temperatureClass: string | undefined
	hydrosphereClass: string | undefined
	atmosphereClass: string | undefined
	breathable: boolean
	biosphereClass: string | undefined
	habitabilityClass: string | undefined
	specialCircumstances: SpecialCircumstance[]
}

interface GalaxySystemBodySearchEntry {
	systemIndex: number
	planetClassifications: string[]
	moonClassifications: string[]
	planetClassificationTemperaturePairs: GalaxyBodyClassificationTemperaturePair[]
	moonClassificationTemperaturePairs: GalaxyBodyClassificationTemperaturePair[]
}

interface SimpleBodyFilter {
	classification: string
	temperature: string
	hydrosphere: string
	atmosphere: string
	specialCircumstances: string
}

function matchesSimpleBodyFilter({
	pair,
	filter,
}: {
	pair: GalaxyBodyClassificationTemperaturePair
	filter: SimpleBodyFilter
}): boolean {
	return (
		(filter.classification === "all" ||
			pair.classification === filter.classification) &&
		(filter.temperature === "all" ||
			pair.temperatureClass === filter.temperature) &&
		(filter.hydrosphere === "all" ||
			pair.hydrosphereClass === filter.hydrosphere) &&
		(filter.atmosphere === "all" ||
			pair.atmosphereClass === filter.atmosphere) &&
		(filter.specialCircumstances === "all" ||
			pair.specialCircumstances.includes(
				filter.specialCircumstances as SpecialCircumstance,
			))
	)
}

interface SystemSearchResult {
	systemIndex: number
	match: string
}

interface SystemSearchResults {
	matches: SystemSearchResult[]
	matchingSystemIndices: number[]
	isFiltered: boolean
	total: number
}

type SystemSearchTab = "systems" | "stars" | "planets" | "moons"
type SystemBodyCountComparator = "greaterThan" | "lessThan"

const MIN_SYSTEM_COUNT = 50
const MAX_SYSTEM_COUNT = 200_000
const SEARCH_RESULTS_PER_PAGE = 5
const EMPTY_SYSTEM_FILTER: SystemFilterRoot = {
	kind: "group",
	id: "root",
	operator: "and",
	nodes: [],
}

// Systems count spans too wide a range (50-200,000) for a slider to give
// useful precision, so it gets a plain number input instead -- clamped to
// [MIN_SYSTEM_COUNT, MAX_SYSTEM_COUNT] on commit (blur/Enter), matching the
// seed input's edit-then-commit pattern below.
const SystemCountEditor: React.FC<{
	systemCount: number
	setSystemCount: (v: number) => void
}> = ({ systemCount, setSystemCount }) => {
	const [input, setInput] = useState(String(systemCount))
	useEffect(() => {
		setInput(String(systemCount))
	}, [systemCount])

	const commit = () => {
		const parsed = Number.parseInt(input, 10)
		if (Number.isFinite(parsed)) {
			const clamped = Math.min(
				MAX_SYSTEM_COUNT,
				Math.max(MIN_SYSTEM_COUNT, Math.round(parsed)),
			)
			setSystemCount(clamped)
			setInput(String(clamped))
		} else {
			setInput(String(systemCount))
		}
	}

	return (
		<div className="w-36 px-1 pt-0.5 pb-2 flex flex-col gap-1">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[9px] uppercase tracking-wide text-slate-500">
					Systems
				</span>
				<span className="font-mono text-[10px] text-slate-400">
					max {MAX_SYSTEM_COUNT.toLocaleString()}
				</span>
			</div>
			<input
				type="number"
				min={MIN_SYSTEM_COUNT}
				max={MAX_SYSTEM_COUNT}
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur()
				}}
				className="w-full rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[10px] text-slate-700"
			/>
		</div>
	)
}

const RadiusRangeEditor: React.FC<{
	coreRadius: number
	radius: number
	onCoreRadiusChange: (coreRadius: number) => void
	onRadiusChange: (radius: number) => void
}> = ({ coreRadius, radius, onCoreRadiusChange, onRadiusChange }) => {
	const [coreEditorOpen, setCoreEditorOpen] = useState(false)
	const [radiusEditorOpen, setRadiusEditorOpen] = useState(false)

	return (
		<span className="inline-flex items-center text-[9px] font-mono text-slate-700">
			<Popover
				open={coreEditorOpen}
				onDismiss={() => setCoreEditorOpen(false)}
				panelClassName="bottom-full left-1/2 mb-2 -translate-x-1/2"
				trigger={
					<span
						onClick={() => setCoreEditorOpen((open) => !open)}
						className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-slate-900"
					>
						{coreRadius.toLocaleString()}
					</span>
				}
			>
				<div className="w-36 px-1 pt-0.5 pb-2">
					<Slider
						label="Galaxy Core Radius"
						value={`${coreRadius.toLocaleString()} ly`}
						min={0.01}
						max={radius}
						step={0.01}
						inputValue={coreRadius}
						onChange={onCoreRadiusChange}
					/>
				</div>
			</Popover>
			<span>–</span>
			<Popover
				open={radiusEditorOpen}
				onDismiss={() => setRadiusEditorOpen(false)}
				panelClassName="bottom-full left-1/2 mb-2 -translate-x-1/2"
				trigger={
					<span
						onClick={() => setRadiusEditorOpen((open) => !open)}
						className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-slate-900"
					>
						{radius.toLocaleString()}
					</span>
				}
			>
				<div className="w-36 px-1 pt-0.5 pb-2">
					<Slider
						label="Galaxy Radius"
						value={`${radius.toLocaleString()} ly`}
						min={coreRadius}
						max={30000}
						step={100}
						inputValue={radius}
						onChange={onRadiusChange}
					/>
				</div>
			</Popover>
			<span className="ml-1">ly</span>
		</span>
	)
}

interface PortedGalaxyPanelProps {
	name: string
	seed: number
	setSeed: (v: number) => void
	systemCount: number
	setSystemCount: (v: number) => void
	params: PortedGalaxyParams
	onParamsChange: (params: PortedGalaxyParams) => void
	generating: boolean
	generationLabel: string
	generationProgress: number
	/** When on, the next generate() pre-generates full bodies (planets/moons,
	 * no climate) for every system up front instead of only on entering one. */
	pregenerateAllSystems: boolean
	setPregenerateAllSystems: (v: boolean) => void
	/** Bodies-only (unnamed) systems from the last generate() that had
	 * pregenerateAllSystems on -- feeds the body-stat distribution charts
	 * below. Null before that's ever run for the current galaxy. */
	pregeneratedSystems: GalaxySystem[] | null
	onGenerate: () => void
	onClose?: () => void
	systemSearchEntries: GalaxySystemSearchEntry[]
	/** [JUSTIFICATION] Planet and moon classifications only exist after the
	 * user has requested all systems be pre-generated. */
	systemBodySearchEntries: GalaxySystemBodySearchEntry[] | null
	onFocusSystem: (systemIndex: number) => void
	onOpenSystem: (systemIndex: number, focus: OrbitAddress) => void
	/** Built-in density-wave shape presets (see GalaxyRendererThree.ts's
	 * initSimulation) -- drive the packing's own eccentricity/winding, not
	 * the system count/radius/seed fields above. */
	presetCount: number
	/** null when nothing has been explicitly selected yet, or after some
	 * other interaction changed the params away from a preset. */
	selectedPresetIndex: number | null
	onSelectPreset: (index: number) => void
}

/** Left sidebar for the /galaxy route -- built from the same wiki-page shell
 * as GenerationPlanetNavigator (WikiPageHeader hero + Surface stat-grid card
 * with editable/popover stats), just with galaxy-scoped fields (name/seed/
 * params) instead of a planet's. Mirrors GenerationPanel.tsx's outer sidebar
 * chrome so both routes read as the same panel system.
 *
 * Combines the old GalaxyGenerationPanel's full generation/search UI (seed,
 * system count, radius, pregeneration, spectral/body distribution charts,
 * system search) with the ported density-wave renderer's built-in shape
 * preset picker, since PortedGalaxyView is now the only mounted galaxy view
 * -- see PortedGalaxyView.tsx's own doc comment. */
export const PortedGalaxyPanel: React.FC<PortedGalaxyPanelProps> = ({
	name,
	seed,
	setSeed,
	systemCount,
	setSystemCount,
	params,
	onParamsChange,
	generating,
	generationLabel,
	generationProgress,
	pregenerateAllSystems,
	setPregenerateAllSystems,
	pregeneratedSystems,
	onGenerate,
	onClose,
	systemSearchEntries,
	systemBodySearchEntries,
	onFocusSystem,
	onOpenSystem,
	presetCount,
	selectedPresetIndex,
	onSelectPreset,
}) => {
	const [seedInput, setSeedInput] = useState(seed.toString(36).padStart(6, "0"))
	const [isStatisticsExpanded, setIsStatisticsExpanded] = useState(false)
	const [isSearchExpanded, setIsSearchExpanded] = useState(false)
	const [isSearchResultsExpanded, setIsSearchResultsExpanded] = useState(false)
	const [searchResultsPage, setSearchResultsPage] = useState(0)
	const [advancedFilter, setAdvancedFilter] =
		useState<SystemFilterRoot>(EMPTY_SYSTEM_FILTER)
	const [searchTab, setSearchTab] = useState<SystemSearchTab>("stars")
	const [spectralClassFilter, setSpectralClassFilter] = useState("all")
	const [luminosityClassFilter, setLuminosityClassFilter] = useState("all")
	const [starYouthFilter, setStarYouthFilter] = useState<StarYouthFilter>("all")
	const [starCountFilter, setStarCountFilter] = useState<StarCountFilter>("all")
	const [systemBodyCountComparator, setSystemBodyCountComparator] =
		useState<SystemBodyCountComparator>("greaterThan")
	const [systemBodyCount, setSystemBodyCount] = useState(10)
	const [planetClassificationFilter, setPlanetClassificationFilter] =
		useState("all")
	const [moonClassificationFilter, setMoonClassificationFilter] =
		useState("all")
	const [planetTemperatureFilter, setPlanetTemperatureFilter] = useState("all")
	const [moonTemperatureFilter, setMoonTemperatureFilter] = useState("all")
	const [planetHydrosphereFilter, setPlanetHydrosphereFilter] = useState("all")
	const [moonHydrosphereFilter, setMoonHydrosphereFilter] = useState("all")
	const [planetAtmosphereFilter, setPlanetAtmosphereFilter] = useState("all")
	const [moonAtmosphereFilter, setMoonAtmosphereFilter] = useState("all")
	const [
		planetSpecialCircumstancesFilter,
		setPlanetSpecialCircumstancesFilter,
	] = useState("all")
	const [moonSpecialCircumstancesFilter, setMoonSpecialCircumstancesFilter] =
		useState("all")
	useEffect(() => {
		setSeedInput(seed.toString(36).padStart(6, "0"))
	}, [seed])

	const applySeedInput = () => {
		const trimmed = seedInput.trim()
		if (trimmed === "") {
			setSeedInput(seed.toString(36).padStart(6, "0"))
			return
		}
		const numeric = Number.parseInt(trimmed, 36)
		if (Number.isFinite(numeric)) setSeed(Math.abs(numeric) % 1000000)
	}

	const randomizeSeed = () => {
		const next = Math.floor(Math.random() * 1000000)
		setSeed(next)
		setSeedInput(next.toString(36).padStart(6, "0"))
	}

	const stats: StatEntry[] = [
		{
			label: "Systems",
			value: systemCount.toLocaleString(),
			editor: {
				label: "Systems",
				value: systemCount,
				min: MIN_SYSTEM_COUNT,
				max: MAX_SYSTEM_COUNT,
				step: 50,
				display: systemCount.toLocaleString(),
				set: (v) => setSystemCount(Math.round(v)),
				content: (
					<SystemCountEditor
						systemCount={systemCount}
						setSystemCount={setSystemCount}
					/>
				),
			},
		},
		{
			label: "Radius",
			value: "",
			valueAction: (
				<RadiusRangeEditor
					coreRadius={params.coreRad}
					radius={params.rad}
					onCoreRadiusChange={(coreRad) =>
						onParamsChange({ ...params, coreRad })
					}
					onRadiusChange={(rad) => onParamsChange({ ...params, rad })}
				/>
			),
		},
		{
			label: "Angular Offset",
			value: `${params.angleOffset.toFixed(5)}°`,
			editor: {
				label: "Angular Offset",
				value: params.angleOffset,
				min: 0,
				max: 0.002,
				step: 0.00001,
				display: `${params.angleOffset.toFixed(5)}°`,
				set: (angleOffset) => onParamsChange({ ...params, angleOffset }),
			},
		},
		{
			label: "Inner Eccentricity",
			value: params.exInner.toFixed(2),
			editor: {
				label: "Inner Eccentricity",
				value: params.exInner,
				min: 0.1,
				max: 1,
				step: 0.01,
				display: params.exInner.toFixed(2),
				set: (exInner) => onParamsChange({ ...params, exInner }),
			},
		},
		{
			label: "Outer Eccentricity",
			value: params.exOuter.toFixed(2),
			editor: {
				label: "Outer Eccentricity",
				value: params.exOuter,
				min: 0.1,
				max: 1,
				step: 0.01,
				display: params.exOuter.toFixed(2),
				set: (exOuter) => onParamsChange({ ...params, exOuter }),
			},
		},
		{
			label: "Ellipse Disturbances",
			value: params.pertN.toLocaleString(),
			editor: {
				label: "Ellipse Disturbances",
				value: params.pertN,
				min: 0,
				max: 12,
				step: 1,
				display: params.pertN.toLocaleString(),
				set: (pertN) => onParamsChange({ ...params, pertN }),
			},
		},
		{
			label: "Ellipse Disturbance Damping Factor",
			value: params.pertAmp.toLocaleString(),
			editor: {
				label: "Ellipse Disturbance Damping Factor",
				value: params.pertAmp,
				min: 1,
				max: 100,
				step: 1,
				display: params.pertAmp.toLocaleString(),
				set: (pertAmp) => onParamsChange({ ...params, pertAmp }),
			},
		},
		{
			label: "Base Temperature",
			value: `${params.baseTemp.toLocaleString()} K`,
			editor: {
				label: "Base Temperature",
				value: params.baseTemp,
				min: 1000,
				max: 10000,
				step: 100,
				display: `${params.baseTemp.toLocaleString()} K`,
				set: (baseTemp) => onParamsChange({ ...params, baseTemp }),
			},
		},
	]
	const spectralClassOptions = useMemo(
		() =>
			[
				...new Set(
					systemSearchEntries.flatMap((entry) =>
						entry.stars
							.filter(
								(star) =>
									luminosityClassFilter === "all" ||
									star.luminosityClass === luminosityClassFilter,
							)
							.map((star) => star.spectralClass),
					),
				),
			].sort(),
		[systemSearchEntries, luminosityClassFilter],
	)
	const luminosityClassOptions = useMemo(
		() =>
			[
				...new Set(
					systemSearchEntries.flatMap((entry) =>
						entry.stars
							.filter(
								(star) =>
									spectralClassFilter === "all" ||
									star.spectralClass === spectralClassFilter,
							)
							.map((star) => star.luminosityClass),
					),
				),
			].sort(),
		[systemSearchEntries, spectralClassFilter],
	)
	useEffect(() => {
		if (
			spectralClassFilter !== "all" &&
			!spectralClassOptions.includes(spectralClassFilter)
		) {
			setSpectralClassFilter("all")
		}
	}, [spectralClassFilter, spectralClassOptions])
	useEffect(() => {
		if (
			luminosityClassFilter !== "all" &&
			!luminosityClassOptions.includes(luminosityClassFilter)
		) {
			setLuminosityClassFilter("all")
		}
	}, [luminosityClassFilter, luminosityClassOptions])
	const starYouthOptions = useMemo(
		() =>
			(["proto", "primordial"] as const).filter((category) =>
				systemSearchEntries.some((entry) =>
					entry.stars.some((star) =>
						category === "proto" ? star.proto : star.primordial,
					),
				),
			),
		[systemSearchEntries],
	)
	useEffect(() => {
		if (
			starYouthFilter !== "all" &&
			!starYouthOptions.includes(starYouthFilter)
		) {
			setStarYouthFilter("all")
		}
	}, [starYouthFilter, starYouthOptions])
	const starCountOptions = useMemo(
		() =>
			(["1", "2", "3", "4+"] as const).filter((bucket) =>
				systemSearchEntries.some((entry) =>
					matchesStarCountFilter(entry.stars.length, bucket),
				),
			),
		[systemSearchEntries],
	)
	useEffect(() => {
		if (
			starCountFilter !== "all" &&
			!starCountOptions.includes(starCountFilter)
		) {
			setStarCountFilter("all")
		}
	}, [starCountFilter, starCountOptions])
	const planetClassificationOptions = useMemo(
		() =>
			[
				...new Set(
					(systemBodySearchEntries ?? []).flatMap(
						(entry) => entry.planetClassifications,
					),
				),
			].sort(),
		[systemBodySearchEntries],
	)
	const moonClassificationOptions = useMemo(
		() =>
			[
				...new Set(
					(systemBodySearchEntries ?? []).flatMap(
						(entry) => entry.moonClassifications,
					),
				),
			].sort(),
		[systemBodySearchEntries],
	)
	const bodyClassificationOptions = useMemo(
		() =>
			[
				...new Set([
					...planetClassificationOptions,
					...moonClassificationOptions,
				]),
			].sort(),
		[planetClassificationOptions, moonClassificationOptions],
	)
	const planetTemperatureOptions = useMemo(
		() =>
			TEMPERATURE_CATEGORIES.filter((category) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.planetClassificationTemperaturePairs.some(
						(pair) => pair.temperatureClass === category,
					),
				),
			),
		[systemBodySearchEntries],
	)
	const moonTemperatureOptions = useMemo(
		() =>
			TEMPERATURE_CATEGORIES.filter((category) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.moonClassificationTemperaturePairs.some(
						(pair) => pair.temperatureClass === category,
					),
				),
			),
		[systemBodySearchEntries],
	)
	const planetHydrosphereOptions = useMemo(
		() =>
			HYDROSPHERE_CATEGORIES.filter((category) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.planetClassificationTemperaturePairs.some(
						(pair) => pair.hydrosphereClass === category,
					),
				),
			),
		[systemBodySearchEntries],
	)
	const moonHydrosphereOptions = useMemo(
		() =>
			HYDROSPHERE_CATEGORIES.filter((category) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.moonClassificationTemperaturePairs.some(
						(pair) => pair.hydrosphereClass === category,
					),
				),
			),
		[systemBodySearchEntries],
	)
	const planetAtmosphereOptions = useMemo(
		() =>
			ATMOSPHERE_CATEGORIES.filter((category) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.planetClassificationTemperaturePairs.some(
						(pair) => pair.atmosphereClass === category,
					),
				),
			),
		[systemBodySearchEntries],
	)
	const moonAtmosphereOptions = useMemo(
		() =>
			ATMOSPHERE_CATEGORIES.filter((category) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.moonClassificationTemperaturePairs.some(
						(pair) => pair.atmosphereClass === category,
					),
				),
			),
		[systemBodySearchEntries],
	)
	const planetSpecialCircumstancesOptions = useMemo(
		() =>
			SPECIAL_CIRCUMSTANCE_OPTIONS.filter((circumstance) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.planetClassificationTemperaturePairs.some((pair) =>
						pair.specialCircumstances.includes(circumstance),
					),
				),
			),
		[systemBodySearchEntries],
	)
	const moonSpecialCircumstancesOptions = useMemo(
		() =>
			SPECIAL_CIRCUMSTANCE_OPTIONS.filter((circumstance) =>
				(systemBodySearchEntries ?? []).some((entry) =>
					entry.moonClassificationTemperaturePairs.some((pair) =>
						pair.specialCircumstances.includes(circumstance),
					),
				),
			),
		[systemBodySearchEntries],
	)
	const advancedFilterSystemIndices = useMemo(
		() =>
			filterSystemIndices(advancedFilter, {
				systems: pregeneratedSystems,
				starEntries: systemSearchEntries,
				bodyEntries: systemBodySearchEntries,
			}),
		[
			advancedFilter,
			pregeneratedSystems,
			systemSearchEntries,
			systemBodySearchEntries,
		],
	)
	const bodyClassificationSelections = useMemo(() => {
		const advancedSelections = findBodyClassificationConditions(advancedFilter)
		if (advancedSelections.length > 0) return advancedSelections
		if (searchTab === "planets" && planetClassificationFilter !== "all") {
			return [
				{
					bodyKind: "planet" as const,
					classification: planetClassificationFilter,
				},
			]
		}
		if (searchTab === "moons" && moonClassificationFilter !== "all") {
			return [
				{ bodyKind: "moon" as const, classification: moonClassificationFilter },
			]
		}
		return []
	}, [
		advancedFilter,
		searchTab,
		planetClassificationFilter,
		moonClassificationFilter,
	])
	const hasPlanetClassSelection = bodyClassificationSelections.some(
		(selection) => selection.bodyKind === "planet",
	)
	const hasMoonClassSelection = bodyClassificationSelections.some(
		(selection) => selection.bodyKind === "moon",
	)
	const hasAdvancedBodyFilter = hasBodyFilter(advancedFilter)
	const hasAdvancedPlanetFilter = hasBodyFilterForKind(advancedFilter, "planet")
	const hasAdvancedMoonFilter = hasBodyFilterForKind(advancedFilter, "moon")
	const hasAdvancedStarFilter = hasStarAttributeFilter(advancedFilter)
	// The tab-based search UI (searchTab and its per-tab classification/
	// temperature/etc dropdowns) is currently rendered inside a `hidden` div
	// further down this file -- unreachable, so the rule-builder (advancedFilter)
	// is the only live source of a search match. This only ever resolves
	// against advancedFilter for that reason; see the `hidden` wrapper's own
	// plan note for the tab UI's dead-code status generally.
	const firstMatchedAddress = (system: GalaxySystem): OrbitAddress => {
		const entry = systemBodySearchEntries?.find(
			(candidate) => candidate.systemIndex === system.systemIndex,
		)
		if (entry && hasAdvancedBodyFilter) {
			let planetIndex = 0
			let moonIndex = 0
			for (const star of system.stars) {
				for (const [bodyIdx, body] of star.bodies.entries()) {
					const pair = entry.planetClassificationTemperaturePairs[planetIndex++]
					if (
						pair &&
						hasAdvancedPlanetFilter &&
						matchesBodyFilter(advancedFilter, "planet", pair)
					)
						return { kind: "body", starIndex: star.index, bodyIdx }
					for (const [moonIdx, moon] of body.moons.entries()) {
						const moonPair =
							entry.moonClassificationTemperaturePairs[moonIndex++]
						if (
							moon &&
							moonPair &&
							hasAdvancedMoonFilter &&
							matchesBodyFilter(advancedFilter, "moon", moonPair)
						)
							return { kind: "moon", starIndex: star.index, bodyIdx, moonIdx }
					}
				}
			}
		}
		if (hasAdvancedStarFilter) {
			const matchingStar = system.stars.find((star) =>
				matchesAdvancedStarFilter({ star, filter: advancedFilter }),
			)
			if (matchingStar) return { kind: "star", starIndex: matchingStar.index }
		}
		return { kind: "star", starIndex: 0 }
	}
	const systemSearchResults = useMemo<SystemSearchResults>(() => {
		if (advancedFilterSystemIndices !== null) {
			return {
				matches: advancedFilterSystemIndices.slice(0, 8).map((systemIndex) => {
					const system = pregeneratedSystems?.find(
						(entry) => entry.systemIndex === systemIndex,
					)
					return {
						systemIndex,
						match: system
							? `${countSystemBodies(system).toLocaleString()} bodies`
							: "Matches active rules",
					}
				}),
				matchingSystemIndices: advancedFilterSystemIndices,
				isFiltered: true,
				total: advancedFilterSystemIndices.length,
			}
		}
		if (searchTab === "systems") {
			if (pregeneratedSystems === null)
				return {
					matches: [],
					matchingSystemIndices: [],
					isFiltered: false,
					total: 0,
				}
			const matches = (pregeneratedSystems ?? []).flatMap((system) => {
				const bodyCount = countSystemBodies(system)
				const matchesComparator =
					systemBodyCountComparator === "greaterThan"
						? bodyCount > systemBodyCount
						: bodyCount < systemBodyCount
				if (!matchesComparator) return []
				return [
					{
						systemIndex: system.systemIndex,
						match: `${bodyCount} bodies`,
					},
				]
			})
			return {
				matches: matches.slice(0, 8),
				matchingSystemIndices: matches.map((match) => match.systemIndex),
				isFiltered: true,
				total: matches.length,
			}
		}
		if (searchTab === "stars") {
			const hasFilter =
				spectralClassFilter !== "all" ||
				luminosityClassFilter !== "all" ||
				starYouthFilter !== "all" ||
				starCountFilter !== "all"
			if (!hasFilter)
				return {
					matches: [],
					matchingSystemIndices: [],
					isFiltered: false,
					total: 0,
				}
			const matches = systemSearchEntries.flatMap((entry) => {
				if (!matchesStarCountFilter(entry.stars.length, starCountFilter))
					return []
				const matchingStar = entry.stars.find(
					(star) =>
						(spectralClassFilter === "all" ||
							star.spectralClass === spectralClassFilter) &&
						(luminosityClassFilter === "all" ||
							star.luminosityClass === luminosityClassFilter) &&
						(starYouthFilter === "all" ||
							(starYouthFilter === "proto" ? star.proto : star.primordial)),
				)
				if (!matchingStar) return []
				const classLabel = ["L", "T", "Y", "D"].includes(
					matchingStar.spectralClass,
				)
					? matchingStar.spectralClass
					: `${matchingStar.spectralClass} ${matchingStar.luminosityClass}`
				const details = [
					starYouthFilter !== "all"
						? starYouthFilter === "proto"
							? "Proto"
							: "Primordial"
						: null,
					starCountFilter !== "all"
						? `${entry.stars.length} star${entry.stars.length === 1 ? "" : "s"}`
						: null,
				].filter((detail): detail is string => detail !== null)
				const match =
					details.length === 0
						? classLabel
						: `${classLabel} (${details.join(", ")})`
				return [{ systemIndex: entry.systemIndex, match }]
			})
			return {
				matches: matches.slice(0, 8),
				matchingSystemIndices: matches.map((match) => match.systemIndex),
				isFiltered: true,
				total: matches.length,
			}
		}
		const classificationFilter =
			searchTab === "planets"
				? planetClassificationFilter
				: moonClassificationFilter
		const temperatureFilter =
			searchTab === "planets" ? planetTemperatureFilter : moonTemperatureFilter
		const hydrosphereFilter =
			searchTab === "planets" ? planetHydrosphereFilter : moonHydrosphereFilter
		const atmosphereFilter =
			searchTab === "planets" ? planetAtmosphereFilter : moonAtmosphereFilter
		const specialCircumstancesFilter =
			searchTab === "planets"
				? planetSpecialCircumstancesFilter
				: moonSpecialCircumstancesFilter
		if (
			classificationFilter === "all" &&
			temperatureFilter === "all" &&
			hydrosphereFilter === "all" &&
			atmosphereFilter === "all" &&
			specialCircumstancesFilter === "all"
		)
			return {
				matches: [],
				matchingSystemIndices: [],
				isFiltered: false,
				total: 0,
			}
		const simpleFilter: SimpleBodyFilter = {
			classification: classificationFilter,
			temperature: temperatureFilter,
			hydrosphere: hydrosphereFilter,
			atmosphere: atmosphereFilter,
			specialCircumstances: specialCircumstancesFilter,
		}
		const matches = (systemBodySearchEntries ?? [])
			.filter((entry) => {
				const pairs =
					searchTab === "planets"
						? entry.planetClassificationTemperaturePairs
						: entry.moonClassificationTemperaturePairs
				return pairs.some((pair) =>
					matchesSimpleBodyFilter({ pair, filter: simpleFilter }),
				)
			})
			.map((entry) => ({
				systemIndex: entry.systemIndex,
				match: [
					classificationFilter,
					temperatureFilter,
					hydrosphereFilter,
					atmosphereFilter,
					specialCircumstancesFilter,
				]
					.filter((value) => value !== "all")
					.join(" / "),
			}))
		return {
			matches: matches.slice(0, 8),
			matchingSystemIndices: matches.map((match) => match.systemIndex),
			isFiltered: true,
			total: matches.length,
		}
	}, [
		searchTab,
		advancedFilterSystemIndices,
		spectralClassFilter,
		luminosityClassFilter,
		starYouthFilter,
		starCountFilter,
		systemBodyCountComparator,
		systemBodyCount,
		planetClassificationFilter,
		moonClassificationFilter,
		planetTemperatureFilter,
		moonTemperatureFilter,
		planetHydrosphereFilter,
		moonHydrosphereFilter,
		planetAtmosphereFilter,
		moonAtmosphereFilter,
		planetSpecialCircumstancesFilter,
		moonSpecialCircumstancesFilter,
		systemSearchEntries,
		systemBodySearchEntries,
		pregeneratedSystems,
	])
	const filteredSystemIndices = useMemo(
		() => new Set(systemSearchResults.matchingSystemIndices),
		[systemSearchResults.matchingSystemIndices],
	)
	const spectralClassDistribution = useMemo(() => {
		const counts = new Map<string, number>()
		for (const entry of systemSearchEntries) {
			if (
				systemSearchResults.isFiltered &&
				!filteredSystemIndices.has(entry.systemIndex)
			)
				continue
			for (const star of entry.stars) {
				if (
					hasAdvancedStarFilter &&
					!matchesStarFilter({ node: advancedFilter, star })
				)
					continue
				counts.set(
					star.spectralClass,
					(counts.get(star.spectralClass) ?? 0) + 1,
				)
			}
		}
		return Array.from(counts.entries())
			.map(([spectralClass, count]) => ({
				label: spectralClass,
				count,
				color:
					SPECTRAL_CLASS_COLORS[
						spectralClass as keyof typeof SPECTRAL_CLASS_COLORS
					] ?? "#94a3b8",
			}))
			.sort((a, b) => b.count - a.count)
	}, [
		systemSearchEntries,
		systemSearchResults.isFiltered,
		filteredSystemIndices,
		hasAdvancedStarFilter,
		advancedFilter,
	])
	const bodyDistributions = useMemo(() => {
		if (!pregeneratedSystems || pregeneratedSystems.length === 0) return null
		const systems = systemSearchResults.isFiltered
			? pregeneratedSystems.filter((system) =>
					filteredSystemIndices.has(system.systemIndex),
				)
			: pregeneratedSystems
		const stars = systems.flatMap((system) =>
			system.stars.filter(
				(star) =>
					!hasAdvancedStarFilter ||
					matchesAdvancedStarFilter({ star, filter: advancedFilter }),
			),
		)
		const scopedPlanets = stars
			.flatMap((star) => star.bodies)
			.filter((body) => body.classification !== "asteroid belt")
		const scopedMoons = scopedPlanets
			.flatMap((body) => body.moons)
			.filter((moon) => moon.classification !== "asteroid belt")
		const scopedPlanetSet = new Set(scopedPlanets)
		const scopedMoonSet = new Set(scopedMoons)
		const classifiedBodies = bodyClassificationSelections.map((selection) =>
			collectBodiesByClassification({ systems, ...selection }),
		)
		const planets: SystemBody[] = []
		const moons: MoonBody[] = []
		if (hasAdvancedBodyFilter) {
			for (const system of systems) {
				const entry = systemBodySearchEntries?.find(
					(candidate) => candidate.systemIndex === system.systemIndex,
				)
				if (!entry) continue
				let planetIndex = 0
				let moonIndex = 0
				for (const star of system.stars) {
					const matchesStar =
						!hasAdvancedStarFilter ||
						matchesAdvancedStarFilter({ star, filter: advancedFilter })
					for (const body of star.bodies) {
						const pair =
							entry.planetClassificationTemperaturePairs[planetIndex++]
						if (
							matchesStar &&
							hasAdvancedPlanetFilter &&
							pair &&
							matchesBodyFilter(advancedFilter, "planet", pair)
						)
							planets.push(body)
						for (const moon of body.moons) {
							const moonPair =
								entry.moonClassificationTemperaturePairs[moonIndex++]
							if (
								matchesStar &&
								hasAdvancedMoonFilter &&
								moonPair &&
								matchesBodyFilter(advancedFilter, "moon", moonPair)
							)
								moons.push(moon)
						}
					}
				}
			}
		} else {
			if (bodyClassificationSelections.length === 0) {
				planets.push(...scopedPlanets)
				moons.push(...scopedMoons)
			} else {
				planets.push(
					...classifiedBodies
						.flatMap((bodies) => bodies.planets)
						.filter((body) => scopedPlanetSet.has(body)),
				)
				moons.push(
					...classifiedBodies
						.flatMap((bodies) => bodies.moons)
						.filter((moon) => scopedMoonSet.has(moon)),
				)
			}
		}
		const bodies =
			hasAdvancedBodyFilter ||
			hasAdvancedStarFilter ||
			bodyClassificationSelections.length > 0
				? [...planets, ...moons]
				: systems
		return {
			systemSize: buildSystemSizeDistribution(systems),
			planetClassification: buildPlanetClassificationDistribution(
				hasAdvancedBodyFilter ||
					hasAdvancedStarFilter ||
					bodyClassificationSelections.length > 0
					? planets
					: systems,
			),
			moonClassification: buildMoonClassificationDistribution(
				hasAdvancedBodyFilter ||
					hasAdvancedStarFilter ||
					bodyClassificationSelections.length > 0
					? moons
					: systems,
			),
			moonOrbitRange: buildMoonOrbitRangeDistribution(
				hasAdvancedBodyFilter ||
					hasAdvancedStarFilter ||
					bodyClassificationSelections.length > 0
					? moons
					: systems,
			),
			moonCount: buildMoonCountDistribution(
				hasAdvancedBodyFilter ||
					hasAdvancedStarFilter ||
					bodyClassificationSelections.length > 0
					? planets
					: systems,
			),
			size: buildSizeDistribution(bodies),
			eccentricity: buildEccentricityDistribution(bodies),
			axialTilt: buildAxialTiltDistribution(bodies),
			rotation: buildRotationDistribution(bodies),
			atmosphere: buildAtmosphereDistribution(bodies),
			composition: buildCompositionDistribution(bodies),
			hydrosphere: buildHydrosphereDistribution(bodies),
			biosphere: buildBiosphereDistribution(bodies),
			temperature: buildTemperatureDistribution(bodies),
			systemHabitability: buildSystemHabitabilityDistribution(systems),
		}
	}, [
		pregeneratedSystems,
		systemSearchResults.isFiltered,
		filteredSystemIndices,
		bodyClassificationSelections,
		hasAdvancedBodyFilter,
		hasAdvancedStarFilter,
		advancedFilter,
		systemBodySearchEntries,
		hasAdvancedPlanetFilter,
		hasAdvancedMoonFilter,
	])
	const searchResultsPageCount = Math.ceil(
		systemSearchResults.total / SEARCH_RESULTS_PER_PAGE,
	)
	const visibleSearchResults = useMemo(() => {
		const matchesBySystemIndex = new Map(
			systemSearchResults.matches.map((match) => [match.systemIndex, match]),
		)
		const start = searchResultsPage * SEARCH_RESULTS_PER_PAGE
		return systemSearchResults.matchingSystemIndices
			.slice(start, start + SEARCH_RESULTS_PER_PAGE)
			.map((systemIndex) => {
				const match = matchesBySystemIndex.get(systemIndex)
				if (match) return match
				const system = pregeneratedSystems?.find(
					(entry) => entry.systemIndex === systemIndex,
				)
				return {
					systemIndex,
					match: system
						? `${countSystemBodies(system).toLocaleString()} bodies`
						: "Matches active rules",
				}
			})
	}, [
		pregeneratedSystems,
		searchResultsPage,
		systemSearchResults.matches,
		systemSearchResults.matchingSystemIndices,
	])
	useEffect(() => {
		setSearchResultsPage(0)
	}, [])

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
				<div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-3 py-3">
					<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
						<WikiPageHeader
							title={name}
							action={
								onClose ? (
									<IconButton
										tone="borderless"
										size="xs"
										onClick={onClose}
										title="Hide generation panel"
										aria-label="Hide generation panel"
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
									</IconButton>
								) : undefined
							}
							meta={<span>{generating ? "Generating…" : "Galaxy"}</span>}
							metaAction={
								<div className="flex items-center gap-1.5">
									<input
										type="text"
										value={seedInput}
										onChange={(event) => setSeedInput(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault()
												event.currentTarget.blur()
											}
										}}
										onBlur={applySeedInput}
										aria-label="Galaxy seed"
										title="Galaxy seed"
										className="w-20 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-700 outline-none transition-colors focus:border-slate-400"
									/>
									<IconButton
										tone="borderless"
										size="xs"
										onClick={randomizeSeed}
										title="Randomize seed"
										aria-label="Randomize seed"
									>
										<DiceMultipleOutlineIcon className="h-4 w-4" />
									</IconButton>
								</div>
							}
						/>
						<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
							{renderStatGrid(stats)}
						</div>
					</Surface>

					<div className="flex items-center justify-between gap-2 px-0.5">
						<label className="flex items-center gap-1.5 text-[10px] text-slate-500">
							<input
								type="checkbox"
								checked={pregenerateAllSystems}
								onChange={(event) =>
									setPregenerateAllSystems(event.target.checked)
								}
								disabled={generating}
								className="h-3 w-3 rounded-sm border-slate-300"
							/>
							Pre-generate all systems
						</label>
						<select
							value={selectedPresetIndex ?? ""}
							onChange={(e) => {
								const idx = Number(e.target.value)
								if (Number.isFinite(idx)) onSelectPreset(idx)
							}}
							aria-label="Density-wave shape preset"
							title="Density-wave shape preset"
							className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700"
						>
							<option value="" disabled>
								Shape…
							</option>
							{Array.from({ length: presetCount }, (_, i) => (
								<option key={i} value={i}>
									{PRESET_NAMES[i] ?? `Preset ${i + 1}`}
								</option>
							))}
						</select>
					</div>

					<Button
						tone="panel"
						selected
						onClick={onGenerate}
						disabled={generating}
						aria-label={generating ? "Generating" : "Generate"}
						title={generating ? "Generating..." : "Generate"}
						className="w-full px-2.5 py-1.5"
					>
						Generate
					</Button>

					{generating ? (
						<ProgressBar label={generationLabel} percent={generationProgress} />
					) : null}

					<div className="order-2 rounded-lg border border-slate-200 bg-white p-2.5">
						<DisclosureButton
							label={
								systemSearchResults.isFiltered
									? `Statistics (${systemSearchResults.total.toLocaleString()} systems)`
									: "Statistics"
							}
							expanded={isStatisticsExpanded}
							onClick={() => setIsStatisticsExpanded((current) => !current)}
						/>
						{isStatisticsExpanded ? (
							<div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
								{bodyDistributions &&
								bodyClassificationSelections.length === 0 ? (
									<DistributionChart
										title="System Size"
										buckets={bodyDistributions.systemSize}
										variant="compact"
										showTotal={false}
									/>
								) : null}
								{bodyClassificationSelections.length === 0 &&
								spectralClassDistribution.length > 0 ? (
									<DistributionChart
										title="Stars"
										buckets={spectralClassDistribution}
										variant="compact"
										showTotal={false}
									/>
								) : null}
								{bodyDistributions ? (
									<>
										{bodyClassificationSelections.length === 0 ||
										hasPlanetClassSelection ? (
											<DistributionChart
												title="Planets"
												buckets={bodyDistributions.planetClassification}
												variant="compact"
												showTotal={false}
											/>
										) : null}
										{bodyClassificationSelections.length === 0 ||
										hasMoonClassSelection ? (
											<>
												<DistributionChart
													title="Moons"
													buckets={bodyDistributions.moonClassification}
													variant="compact"
													showTotal={false}
												/>
												<DistributionChart
													title="Moon Count"
													buckets={bodyDistributions.moonCount}
													variant="compact"
													showTotal={false}
												/>
												<DistributionChart
													title="Moon Orbit"
													buckets={bodyDistributions.moonOrbitRange}
													variant="compact"
													showTotal={false}
												/>
											</>
										) : null}
										<DistributionChart
											title="Size"
											buckets={bodyDistributions.size}
											variant="compact"
											showTotal={false}
										/>
										<DistributionChart
											title="Composition"
											buckets={bodyDistributions.composition}
											variant="compact"
											showTotal={false}
										/>
										<DistributionChart
											title="Eccentricity"
											buckets={bodyDistributions.eccentricity}
											variant="compact"
											showTotal={false}
										/>
										<DistributionChart
											title="Axial Tilt"
											buckets={bodyDistributions.axialTilt}
											variant="compact"
											showTotal={false}
										/>
										<DistributionChart
											title="Rotation"
											buckets={bodyDistributions.rotation}
											variant="compact"
											showTotal={false}
										/>
										<DistributionChart
											title="Atmosphere"
											buckets={bodyDistributions.atmosphere}
											variant="compact"
											showTotal={false}
										/>
										<DistributionChart
											title="Hydrosphere"
											buckets={bodyDistributions.hydrosphere}
											variant="compact"
											showTotal={false}
										/>
										<DistributionChart
											title="Temperature"
											buckets={bodyDistributions.temperature}
											variant="compact"
											showTotal={false}
										/>
										{bodyDistributions.biosphere.length > 0 ? (
											<DistributionChart
												title="Biosphere"
												buckets={bodyDistributions.biosphere}
												variant="compact"
												showTotal={false}
											/>
										) : null}
										{bodyDistributions.systemHabitability.length > 0 ? (
											<DistributionChart
												title="Habitability"
												buckets={bodyDistributions.systemHabitability}
												variant="compact"
												showTotal={false}
											/>
										) : null}
									</>
								) : null}
							</div>
						) : null}
					</div>

					<div className="order-1 rounded-lg border border-slate-200 bg-white p-2.5">
						<DisclosureButton
							label="Filter systems"
							expanded={isSearchExpanded}
							onClick={() => setIsSearchExpanded((current) => !current)}
						/>
						{isSearchExpanded ? (
							<div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
								<SystemFilterBuilder
									value={advancedFilter}
									onChange={setAdvancedFilter}
									disabled={generating}
									options={{
										spectralClasses: spectralClassOptions,
										luminosityClasses: luminosityClassOptions,
										classifications: bodyClassificationOptions,
										zones: ["epistellar", "inner", "outer"],
										compositionClasses: COMPOSITION_CATEGORIES,
										temperatureClasses: TEMPERATURE_CATEGORIES,
										hydrosphereClasses: HYDROSPHERE_CATEGORIES,
										atmosphereClasses: ["Breathable", ...ATMOSPHERE_CATEGORIES],
										biosphereClasses: BIOSPHERE_CATEGORIES,
										habitabilityClasses: HABITABILITY_CATEGORY_LABELS,
										specialCircumstances: SPECIAL_CIRCUMSTANCE_OPTIONS,
									}}
								/>
								<div className="hidden">
									<div className="flex gap-0 border-b border-slate-100">
										{(["systems", "stars", "planets", "moons"] as const).map(
											(tab) => (
												<button
													key={tab}
													type="button"
													onClick={() => setSearchTab(tab)}
													className={`px-2 pb-1.5 text-[10px] font-medium capitalize transition-colors border-b-2 ${
														searchTab === tab
															? "border-slate-700 text-slate-900"
															: "border-transparent text-slate-400 hover:text-slate-600"
													}`}
												>
													{tab}
												</button>
											),
										)}
									</div>
									{searchTab === "systems" ? (
										<>
											<div className="grid grid-cols-2 gap-1.5">
												<select
													value={systemBodyCountComparator}
													onChange={(event) =>
														setSystemBodyCountComparator(
															event.target.value as SystemBodyCountComparator,
														)
													}
													disabled={generating || pregeneratedSystems === null}
													aria-label="System body count comparison"
													className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
												>
													<option value="greaterThan">More than</option>
													<option value="lessThan">Fewer than</option>
												</select>
												<input
													type="number"
													min="0"
													step="1"
													value={systemBodyCount}
													onChange={(event) => {
														const count = Number.parseInt(
															event.target.value,
															10,
														)
														setSystemBodyCount(
															Number.isFinite(count) ? Math.max(0, count) : 0,
														)
													}}
													disabled={generating || pregeneratedSystems === null}
													aria-label="System body count"
													className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
												/>
											</div>
											<p className="text-[10px] text-slate-500">
												Counts bodies and moons across companion-star systems.
											</p>
											{pregeneratedSystems === null ? (
												<p className="text-[10px] text-slate-500">
													Generate with “Pre-generate all systems” enabled to
													search system size.
												</p>
											) : null}
										</>
									) : searchTab === "stars" ? (
										<div className="grid grid-cols-2 gap-1.5">
											<select
												value={spectralClassFilter}
												onChange={(event) =>
													setSpectralClassFilter(event.target.value)
												}
												disabled={
													generating || systemSearchEntries.length === 0
												}
												aria-label="Spectral class"
												className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
											>
												<option value="all">Any spectral class</option>
												{spectralClassOptions.map((value) => (
													<option key={value} value={value}>
														{value}
													</option>
												))}
											</select>
											<select
												value={luminosityClassFilter}
												onChange={(event) =>
													setLuminosityClassFilter(event.target.value)
												}
												disabled={
													generating || systemSearchEntries.length === 0
												}
												aria-label="Luminosity class"
												className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
											>
												<option value="all">Any luminosity class</option>
												{luminosityClassOptions.map((value) => (
													<option key={value} value={value}>
														{value}
													</option>
												))}
											</select>
											<select
												value={starCountFilter}
												onChange={(event) =>
													setStarCountFilter(
														event.target.value as StarCountFilter,
													)
												}
												disabled={generating || starCountOptions.length === 0}
												aria-label="Star count"
												className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
											>
												<option value="all">Any star count</option>
												{starCountOptions.map((bucket) => (
													<option key={bucket} value={bucket}>
														{bucket} star{bucket === "1" ? "" : "s"}
													</option>
												))}
											</select>
											<select
												value={starYouthFilter}
												onChange={(event) =>
													setStarYouthFilter(
														event.target.value as StarYouthFilter,
													)
												}
												disabled={generating || starYouthOptions.length === 0}
												aria-label="Star age"
												className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
											>
												<option value="all">Any star age</option>
												{starYouthOptions.includes("proto") ? (
													<option value="proto">Proto (very young)</option>
												) : null}
												{starYouthOptions.includes("primordial") ? (
													<option value="primordial">Primordial (young)</option>
												) : null}
											</select>
										</div>
									) : (
										<>
											<div className="grid grid-cols-2 gap-1.5">
												<select
													value={
														searchTab === "planets"
															? planetClassificationFilter
															: moonClassificationFilter
													}
													onChange={(event) => {
														if (searchTab === "planets")
															setPlanetClassificationFilter(event.target.value)
														else setMoonClassificationFilter(event.target.value)
													}}
													disabled={
														generating || systemBodySearchEntries === null
													}
													aria-label={`${searchTab} classification`}
													className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
												>
													<option value="all">Any classification</option>
													{(searchTab === "planets"
														? planetClassificationOptions
														: moonClassificationOptions
													).map((value) => (
														<option key={value} value={value}>
															{value}
														</option>
													))}
												</select>
												<select
													value={
														searchTab === "planets"
															? planetTemperatureFilter
															: moonTemperatureFilter
													}
													onChange={(event) => {
														if (searchTab === "planets")
															setPlanetTemperatureFilter(event.target.value)
														else setMoonTemperatureFilter(event.target.value)
													}}
													disabled={
														generating || systemBodySearchEntries === null
													}
													aria-label={`${searchTab} temperature class`}
													className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
												>
													<option value="all">Any temperature</option>
													{(searchTab === "planets"
														? planetTemperatureOptions
														: moonTemperatureOptions
													).map((value) => (
														<option key={value} value={value}>
															{value}
														</option>
													))}
												</select>
											</div>
											<div className="grid grid-cols-2 gap-1.5">
												<select
													value={
														searchTab === "planets"
															? planetHydrosphereFilter
															: moonHydrosphereFilter
													}
													onChange={(event) => {
														if (searchTab === "planets")
															setPlanetHydrosphereFilter(event.target.value)
														else setMoonHydrosphereFilter(event.target.value)
													}}
													disabled={
														generating || systemBodySearchEntries === null
													}
													aria-label={`${searchTab} hydrosphere`}
													className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
												>
													<option value="all">Any hydrosphere</option>
													{(searchTab === "planets"
														? planetHydrosphereOptions
														: moonHydrosphereOptions
													).map((value) => (
														<option key={value} value={value}>
															{value}
														</option>
													))}
												</select>
												<select
													value={
														searchTab === "planets"
															? planetAtmosphereFilter
															: moonAtmosphereFilter
													}
													onChange={(event) => {
														if (searchTab === "planets")
															setPlanetAtmosphereFilter(event.target.value)
														else setMoonAtmosphereFilter(event.target.value)
													}}
													disabled={
														generating || systemBodySearchEntries === null
													}
													aria-label={`${searchTab} atmosphere`}
													className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
												>
													<option value="all">Any atmosphere</option>
													{(searchTab === "planets"
														? planetAtmosphereOptions
														: moonAtmosphereOptions
													).map((value) => (
														<option key={value} value={value}>
															{value}
														</option>
													))}
												</select>
											</div>
											<div className="grid grid-cols-2 gap-1.5">
												<select
													value={
														searchTab === "planets"
															? planetSpecialCircumstancesFilter
															: moonSpecialCircumstancesFilter
													}
													onChange={(event) => {
														if (searchTab === "planets")
															setPlanetSpecialCircumstancesFilter(
																event.target.value,
															)
														else
															setMoonSpecialCircumstancesFilter(
																event.target.value,
															)
													}}
													disabled={
														generating || systemBodySearchEntries === null
													}
													aria-label={`${searchTab} special circumstances`}
													className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400 disabled:bg-slate-100"
												>
													<option value="all">Any special circumstances</option>
													{(searchTab === "planets"
														? planetSpecialCircumstancesOptions
														: moonSpecialCircumstancesOptions
													).map((value) => (
														<option key={value} value={value}>
															{value}
														</option>
													))}
												</select>
											</div>
											{systemBodySearchEntries === null ? (
												<p className="text-[10px] text-slate-500">
													Generate with “Pre-generate all systems” enabled to
													search bodies.
												</p>
											) : null}
										</>
									)}
								</div>
								{systemSearchResults.total > 0 ? (
									<div className="border-t border-slate-100 pt-2">
										<DisclosureButton
											label={`${systemSearchResults.total.toLocaleString()} matching systems`}
											expanded={isSearchResultsExpanded}
											onClick={() =>
												setIsSearchResultsExpanded((current) => !current)
											}
										/>
										{isSearchResultsExpanded ? (
											<>
												<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
													<table className="w-full text-left text-[10px] text-slate-600">
														<thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-400">
															<tr>
																<th className="px-2 py-1 font-medium">
																	System
																</th>
																<th className="px-2 py-1 font-medium">Match</th>
																<th className="w-8 px-2 py-1" />
															</tr>
														</thead>
														<tbody>
															{visibleSearchResults.map(
																({ systemIndex, match }) => (
																	<tr
																		key={systemIndex}
																		onClick={() => onFocusSystem(systemIndex)}
																		className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
																	>
																		<td className="px-2 py-1.5 font-mono text-slate-700">
																			#{systemIndex + 1}
																		</td>
																		<td className="max-w-0 truncate px-2 py-1.5 text-slate-400">
																			{match}
																		</td>
																		<td className="px-1 py-1 text-right">
																			<button
																				type="button"
																				onClick={(event) => {
																					event.stopPropagation()
																					onFocusSystem(systemIndex)
																				}}
																				title="Zoom to system"
																				aria-label="Zoom to system"
																				className="px-1 text-slate-400 hover:text-slate-700"
																			>
																				◎
																			</button>
																			<button
																				type="button"
																				onClick={(event) => {
																					event.stopPropagation()
																					const system =
																						pregeneratedSystems?.find(
																							(entry) =>
																								entry.systemIndex ===
																								systemIndex,
																						)
																					if (system)
																						onOpenSystem(
																							systemIndex,
																							firstMatchedAddress(system),
																						)
																				}}
																				title="Open solar system"
																				aria-label="Open solar system"
																				className="px-1 text-slate-400 hover:text-slate-700"
																			>
																				◉
																			</button>
																		</td>
																	</tr>
																),
															)}
														</tbody>
													</table>
												</div>
												{searchResultsPageCount > 1 ? (
													<div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
														<button
															type="button"
															onClick={() =>
																setSearchResultsPage((page) =>
																	Math.max(0, page - 1),
																)
															}
															disabled={searchResultsPage === 0}
															className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:text-slate-200"
														>
															Previous
														</button>
														<span>
															Page {searchResultsPage + 1} of{" "}
															{searchResultsPageCount}
														</span>
														<button
															type="button"
															onClick={() =>
																setSearchResultsPage((page) =>
																	Math.min(
																		searchResultsPageCount - 1,
																		page + 1,
																	),
																)
															}
															disabled={
																searchResultsPage === searchResultsPageCount - 1
															}
															className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:text-slate-200"
														>
															Next
														</button>
													</div>
												) : null}
											</>
										) : null}
									</div>
								) : null}
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	)
}

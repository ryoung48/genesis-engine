import React, { useEffect, useMemo, useState } from "react"
import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { Button } from "@/ui/components/primitives/Button"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { ProgressBar } from "@/ui/components/primitives/ProgressBar"
import { Surface } from "@/ui/components/primitives/Surface"
import { SPECTRAL_CLASS_COLORS } from "@/ui/genesis/generation/star-utils"
import type { SpecialCircumstance } from "@/ui/wiki/galaxy-generation-panel/types"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	ATMOSPHERE_CATEGORIES,
	buildAtmosphereDistribution,
	buildAxialTiltDistribution,
	buildBiosphereDistribution,
	buildEccentricityDistribution,
	buildHydrosphereDistribution,
	buildMoonClassificationDistribution,
	buildMoonOrbitRangeDistribution,
	buildPlanetClassificationDistribution,
	buildRotationDistribution,
	buildSizeDistribution,
	buildSystemHabitabilityDistribution,
	buildTemperatureDistribution,
	HYDROSPHERE_CATEGORIES,
	TEMPERATURE_CATEGORIES,
} from "@/ui/wiki/stats/galaxy/galaxy-body-distributions"

interface GalaxyGenerationPanelProps {
	name: string
	seed: number
	setSeed: (v: number) => void
	systemCount: number
	setSystemCount: (v: number) => void
	radiusMin: number
	setRadiusMin: (v: number) => void
	radiusMax: number
	setRadiusMax: (v: number) => void
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
}

interface GalaxySystemSearchEntry {
	systemIndex: number
	stars: GalaxySystemSearchStar[]
}

interface GalaxySystemSearchStar {
	spectralClass: string
	luminosityClass: string
	/** Very young (age<0.01 Gyr, mass<8 Msol) -- a strict subset of primordial.
	 * See body/index.ts's proto/primordial derivation. */
	proto: boolean
	/** Young (age<0.1 Gyr). */
	primordial: boolean
}

type StarYouthFilter = "all" | "proto" | "primordial"
type StarCountFilter = "all" | "1" | "2" | "3" | "4+"

function matchesStarCountFilter(count: number, filter: StarCountFilter): boolean {
	if (filter === "all") return true
	if (filter === "4+") return count > 3
	return count === Number(filter)
}

const SPECIAL_CIRCUMSTANCE_OPTIONS: SpecialCircumstance[] = [
	"Trojan Orbit",
	"Minor Rings",
	"Major Rings",
	"Twin Moon",
]

interface GalaxyBodyClassificationTemperaturePair {
	classification: string
	temperatureClass: string | undefined
	hydrosphereClass: string | undefined
	atmosphereClass: string | undefined
	specialCircumstances: SpecialCircumstance[]
}

interface GalaxySystemBodySearchEntry {
	systemIndex: number
	planetClassifications: string[]
	moonClassifications: string[]
	planetClassificationTemperaturePairs: GalaxyBodyClassificationTemperaturePair[]
	moonClassificationTemperaturePairs: GalaxyBodyClassificationTemperaturePair[]
}

interface SystemSearchResult {
	systemIndex: number
	match: string
}

interface SystemSearchResults {
	matches: SystemSearchResult[]
	total: number
}

type SystemSearchTab = "stars" | "planets" | "moons"

const MIN_SYSTEM_COUNT = 50
const MAX_SYSTEM_COUNT = 200_000

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

/** Left sidebar for the /galaxy route -- built from the same wiki-page shell
 * as GenerationPlanetNavigator (WikiPageHeader hero + Surface stat-grid card
 * with editable/popover stats), just with galaxy-scoped fields (name/seed/
 * params) instead of a planet's. Mirrors GenerationPanel.tsx's outer sidebar
 * chrome so both routes read as the same panel system. */
export const GalaxyGenerationPanel: React.FC<GalaxyGenerationPanelProps> = ({
	name,
	seed,
	setSeed,
	systemCount,
	setSystemCount,
	radiusMin,
	setRadiusMin,
	radiusMax,
	setRadiusMax,
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
}) => {
	const [seedInput, setSeedInput] = useState(seed.toString(36).padStart(6, "0"))
	const [isSearchExpanded, setIsSearchExpanded] = useState(false)
	const [searchTab, setSearchTab] = useState<SystemSearchTab>("stars")
	const [spectralClassFilter, setSpectralClassFilter] = useState("all")
	const [luminosityClassFilter, setLuminosityClassFilter] = useState("all")
	const [starYouthFilter, setStarYouthFilter] = useState<StarYouthFilter>("all")
	const [starCountFilter, setStarCountFilter] = useState<StarCountFilter>("all")
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
			label: "Radius Min",
			value: `${radiusMin} ly`,
			editor: {
				label: "Radius Min",
				value: radiusMin,
				min: 10,
				max: radiusMax,
				step: 10,
				display: `${radiusMin} ly`,
				set: (v) => setRadiusMin(Math.round(v)),
			},
		},
		{
			label: "Radius Max",
			value: `${radiusMax} ly`,
			editor: {
				label: "Radius Max",
				value: radiusMax,
				min: radiusMin,
				max: 1000,
				step: 10,
				display: `${radiusMax} ly`,
				set: (v) => setRadiusMax(Math.round(v)),
			},
		},
	]
	const spectralClassDistribution = useMemo(() => {
		const counts = new Map<string, number>()
		for (const entry of systemSearchEntries) {
			for (const star of entry.stars) {
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
	}, [systemSearchEntries])
	const bodyDistributions = useMemo(() => {
		if (!pregeneratedSystems || pregeneratedSystems.length === 0) return null
		return {
			planetClassification:
				buildPlanetClassificationDistribution(pregeneratedSystems),
			moonClassification:
				buildMoonClassificationDistribution(pregeneratedSystems),
			moonOrbitRange: buildMoonOrbitRangeDistribution(pregeneratedSystems),
			size: buildSizeDistribution(pregeneratedSystems),
			eccentricity: buildEccentricityDistribution(pregeneratedSystems),
			axialTilt: buildAxialTiltDistribution(pregeneratedSystems),
			rotation: buildRotationDistribution(pregeneratedSystems),
			atmosphere: buildAtmosphereDistribution(pregeneratedSystems),
			hydrosphere: buildHydrosphereDistribution(pregeneratedSystems),
			biosphere: buildBiosphereDistribution(pregeneratedSystems),
			temperature: buildTemperatureDistribution(pregeneratedSystems),
			systemHabitability:
				buildSystemHabitabilityDistribution(pregeneratedSystems),
		}
	}, [pregeneratedSystems])
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
	const systemSearchResults = useMemo<SystemSearchResults>(() => {
		if (searchTab === "stars") {
			const hasFilter =
				spectralClassFilter !== "all" ||
				luminosityClassFilter !== "all" ||
				starYouthFilter !== "all" ||
				starCountFilter !== "all"
			if (!hasFilter) return { matches: [], total: 0 }
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
			return { matches: matches.slice(0, 8), total: matches.length }
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
			return { matches: [], total: 0 }
		const matches = (systemBodySearchEntries ?? [])
			.filter((entry) => {
				const pairs =
					searchTab === "planets"
						? entry.planetClassificationTemperaturePairs
						: entry.moonClassificationTemperaturePairs
				return pairs.some(
					(pair) =>
						(classificationFilter === "all" ||
							pair.classification === classificationFilter) &&
						(temperatureFilter === "all" ||
							pair.temperatureClass === temperatureFilter) &&
						(hydrosphereFilter === "all" ||
							pair.hydrosphereClass === hydrosphereFilter) &&
						(atmosphereFilter === "all" ||
							pair.atmosphereClass === atmosphereFilter) &&
						(specialCircumstancesFilter === "all" ||
							pair.specialCircumstances.includes(
								specialCircumstancesFilter as SpecialCircumstance,
							)),
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
		return { matches: matches.slice(0, 8), total: matches.length }
	}, [
		searchTab,
		spectralClassFilter,
		luminosityClassFilter,
		starYouthFilter,
		starCountFilter,
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
	])

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
				<div className="rounded-2xl bg-slate-50 px-3 py-3 space-y-3">
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
							meta={<span>Galaxy</span>}
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
										className="mr-1 w-20 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-700 outline-none transition-colors focus:border-slate-400"
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
						{spectralClassDistribution.length > 0 ? (
							<div className="mt-3">
								<DistributionChart
									title="Stars"
									buckets={spectralClassDistribution}
									variant="compact"
									showTotal={false}
								/>
							</div>
						) : null}
						{bodyDistributions ? (
							<div className="mt-2 space-y-2">
								<DistributionChart
									title="Planets"
									buckets={bodyDistributions.planetClassification}
									variant="compact"
									showTotal={false}
								/>
								<DistributionChart
									title="Moons"
									buckets={bodyDistributions.moonClassification}
									variant="compact"
									showTotal={false}
								/>
								<DistributionChart
									title="Moon Orbit"
									buckets={bodyDistributions.moonOrbitRange}
									variant="compact"
									showTotal={false}
								/>
								<DistributionChart
									title="Size"
									buckets={bodyDistributions.size}
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
							</div>
						) : null}
					</Surface>

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

					<label className="flex items-center gap-1.5 px-0.5 text-[10px] text-slate-500">
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

					{generating ? (
						<ProgressBar label={generationLabel} percent={generationProgress} />
					) : null}

					<div className="rounded-lg border border-slate-200 bg-white p-2.5">
						<DisclosureButton
							label="Find systems"
							expanded={isSearchExpanded}
							onClick={() => setIsSearchExpanded((current) => !current)}
						/>
						{isSearchExpanded ? (
							<div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
								<div className="flex gap-0 border-b border-slate-100">
									{(["stars", "planets", "moons"] as const).map((tab) => (
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
									))}
								</div>
								{searchTab === "stars" ? (
									<div className="grid grid-cols-2 gap-1.5">
										<select
											value={spectralClassFilter}
											onChange={(event) =>
												setSpectralClassFilter(event.target.value)
											}
											disabled={generating || systemSearchEntries.length === 0}
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
											disabled={generating || systemSearchEntries.length === 0}
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
								{systemSearchResults.total > 0 ? (
									<>
										<p className="text-[10px] text-slate-500">
											{systemSearchResults.total.toLocaleString()} matching
											systems
										</p>
										<div className="overflow-hidden rounded-md border border-slate-200 bg-white">
											{systemSearchResults.matches.map(
												({ systemIndex, match }) => (
													<button
														key={systemIndex}
														type="button"
														onClick={() => onFocusSystem(systemIndex)}
														className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50"
													>
														<span>{match}</span>
														<span className="font-mono text-[10px] text-slate-400">
															System #{systemIndex + 1}
														</span>
													</button>
												),
											)}
										</div>
									</>
								) : null}
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	)
}

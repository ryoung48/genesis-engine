import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import type { WeatherReportCondition as WeatherCondition } from "@/model/climate/weather/local/description/types"
import type {
	LocalWeatherValues,
	WeatherTriggerTrace,
} from "@/model/climate/weather/local/types"
import type {
	WeatherEnvironmentReport,
	WeatherEnvironmentState,
} from "@/test/earth/weather-distributions/environment/types"
export interface DistributionSite {
	region: number
	climate: string
	latitude: number
	longitude: number
	elevationKm: number
	coastKm: number
}
export interface DistributionPair {
	first: number
	second: number
	distanceKm: number
}
export interface CreateDistributionsParams {
	sites: DistributionSite[]
	pairs: DistributionPair[]
	stepHours: number
	years: number
}
export interface FrequencyBin {
	dimension: string
	label: string
	samples: number
	sampleHours: number
	sites: Set<number>
	conditionSamples: Record<string, number>
}
export interface EventRun {
	previous: boolean | null
	activeSteps: number
	startsAtBoundary: boolean
	completed: number
	completeSteps: number
	maxObservedSteps: number
	leftCensored: number
	rightCensored: number
	histogram: Record<string, number>
	gaps: Record<string, number>
	lastEndStep: number | null
	transitions: { offOff: number; offOn: number; onOff: number; onOn: number }
	onsetsByYear: number[]
	activeByYear: number[]
	activeDaysByYear: number[]
	lastActiveDay: number | null
	lastActiveYear: number
}
export interface GateCounter {
	name: string
	evaluated: number
	passed: number
	failed: number
	notEvaluated: number
	funnelReached: number
	funnelPassed: number
	funnelRejected: number
}
export interface SpatialCounter {
	both: number
	firstOnly: number
	secondOnly: number
	neither: number
}
export interface ConditionRange {
	minTemperatureC: number
	maxTemperatureC: number
	maxWindMs: number
	maxRainMmH: number
}
export interface SystemPrecipitationCounter {
	drySamples: number
	wetSamples: number
}

export interface DistributionState {
	systemPrecipitation: Record<string, SystemPrecipitationCounter>
	environment: WeatherEnvironmentState
	sites: DistributionSite[]
	pairs: DistributionPair[]
	stepHours: number
	years: number
	inventory: WeatherCondition[]
	seen: number[]
	localDay: number[]
	lastPhase: (number | null)[]
	lastObservedDay: (number | null)[]
	lastObservedYear: number[]
	sampledDaysByYear: number[][]
	runs: Map<WeatherCondition, EventRun>[]
	bins: Map<string, FrequencyBin>
	gates: Map<string, Map<WeatherCondition, GateCounter[]>>
	spatial: Map<WeatherCondition, SpatialCounter>[]
	ranges: Map<WeatherCondition, ConditionRange>
	maxWindMs: number
	maxGustMs: number
}
export interface RecordDistributionParams {
	state: DistributionState
	site: number
	instant: WeatherInstant
	values: LocalWeatherValues
	traces: WeatherTriggerTrace[]
}
export interface RecordSpatialParams {
	state: DistributionState
	active: Set<WeatherCondition>[]
}
export interface CloseEventParams {
	run: EventRun
	rightCensored: boolean
	stepHours: number
}
export interface UpdateEventParams {
	run: EventRun
	active: boolean
	step: number
	year: number
	day: number | null
	stepHours: number
}
export interface RecordGatesParams {
	state: DistributionState
	group: string
	traces: WeatherTriggerTrace[]
}

export interface ConditionDistribution {
	kind: WeatherCondition
	samples: number
	fraction: number
	sitesWithEvents: number
	sampledDays: number
	meanSampledDaysPerSiteYear: number | null
	onsets: number
	completedRuns: number
	meanCompletedRunHours: number | null
	maxObservedRunHours: number
	leftCensoredRuns: number
	rightCensoredRuns: number
	completedRunHistogramHours: Record<string, number>
	gapHistogramHours: Record<string, number>
	transitions: EventRun["transitions"]
	continuationProbability: number | null
	activationProbability: number | null
	persistenceLift: number | null
	eventRanges: {
		minTemperatureC: number | null
		maxTemperatureC: number | null
		maxWindMs: number
		maxRainMmH: number
	}
	bySite: {
		region: number
		onsetsByYear: number[]
		activeSamplesByYear: number[]
		activeDaysByYear: number[]
		onsetFano: number | null
	}[]
}
export interface FrequencyReportBin extends Omit<FrequencyBin, "sites"> {
	sites: number[]
	conditions: Record<
		string,
		{ samples: number; sampleHours: number; fraction: number }
	>
}
export interface SpatialDistribution extends DistributionPair {
	conditions: Record<
		string,
		SpatialCounter & {
			jaccard: number | null
			neighborGivenFirst: number | null
			jointLift: number | null
		}
	>
}
export interface DistributionReport {
	systemPrecipitation: Record<string, SystemPrecipitationCounter>
	environment: WeatherEnvironmentReport
	configuration: {
		stepHours: number
		years: number
		weighting: string
		season: string
		localTime: string
		duration: string
		dayDefinition: string
	}
	sites: DistributionSite[]
	siteExposure: { region: number; sampledDaysByYear: number[] }[]
	conditions: ConditionDistribution[]
	bins: FrequencyReportBin[]
	triggerGates: Record<string, Record<string, GateCounter[]>>
	spatial: SpatialDistribution[]
	weatherExtremes: { maxSustainedWindMs: number; maxGustMs: number }
}
export interface WeatherEventExposure {
	hours: number
	events: number
}

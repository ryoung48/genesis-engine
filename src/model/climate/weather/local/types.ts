import type {
	WeatherBaseline,
	WeatherParticleSource,
} from "@/model/climate/weather/local/baseline/types"
import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import type { CloudOccurrence } from "@/model/climate/weather/local/clouds/types"
import type {
	WeatherRegime,
	WeatherSystem,
} from "@/model/climate/weather/local/decision/types"
import type { WeatherOutlook } from "@/model/climate/weather/local/outlook/types"
import type {
	WeatherCloudDescription,
	WeatherPhenomenon,
} from "@/model/climate/weather/local/vocabulary/types"
import type { ProvinceLocation } from "@/model/geography/terrain/provinces/locations/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface WeatherProvince {
	location: ProvinceLocation
	baselines: WeatherBaseline[]
}

export interface WeatherContext {
	revision: number
	seed: number
	radiusKm: number
	provinces: WeatherProvince[]
}

export interface CreateLocalWeatherParams {
	world: SerializedGenesisWorld
	revision: number
	representatives: Map<number, [number, number]>
	yearSeconds: number
}

export interface WeatherPartition {
	liquid: number
	snow: number
	ice: number
}
export interface ConditionOccurrence {
	kind: WeatherPhenomenon
	share: number
}

export interface LocalWeatherValues {
	cloudDescription: WeatherCloudDescription | null
	regime: WeatherRegime
	system: WeatherSystem
	particleSource: WeatherParticleSource | null
	precipitation: WeatherPartition
	visibilityM: number
	temperatureC: number
	temperatureNormalC: number
	latitudeDeg: number
	solarElevationDeg: number
	dewPointC: number | null
	rainRateMmH: number
	windU: number
	windV: number
	windSpeedMs: number
	windDirectionDeg: number | null
	gustMs: number
	pressureTendencyHpa: number
	cloudCover: number | null
	clouds: CloudOccurrence[] | null
	conditions: ConditionOccurrence[]
	dominant: WeatherPhenomenon | null
	localHour: number | null
	daylight: boolean
}

export interface LocalWeatherSample {
	region: number
	weight: number
	values: LocalWeatherValues | null
}

export interface WeatherSnapshot {
	revision: number
	province: number
	instant: WeatherInstant
	status: "ready" | "unavailable"
	reason: string | null
	approximateLocation: boolean
	values: LocalWeatherValues | null
	samples: LocalWeatherSample[]
}

export interface SampleProvinceWeatherParams {
	context: WeatherContext
	province: number
	instant: WeatherInstant
}

export interface SampleWeatherRegionParams {
	context: WeatherContext
	baseline: WeatherBaseline
	instant: WeatherInstant
}

export interface AggregateWeatherParams {
	samples: LocalWeatherSample[]
}

export type LocalWeatherRequest =
	| {
			type: "init"
			revision: number
			requestId: number
			context: WeatherContext
	  }
	| {
			type: "snapshot"
			revision: number
			requestId: number
			province: number
			instant: WeatherInstant
	  }
	| { type: "dispose"; revision: number; requestId: number }

export type LocalWeatherResponse =
	| { type: "initialized"; revision: number; requestId: number }
	| {
			type: "snapshot"
			revision: number
			requestId: number
			snapshot: WeatherSnapshot
			outlook: WeatherOutlook
	  }
	| { type: "error"; revision: number; requestId: number; message: string }

export interface LocalWeatherWorkerScope {
	onmessage: ((event: MessageEvent<LocalWeatherRequest>) => void) | null
	postMessage: (message: LocalWeatherResponse) => void
}

export interface WeatherTriggerGate {
	name: string
	passed: boolean | null
}
export interface WeatherTriggerTrace {
	condition: WeatherPhenomenon
	gates: WeatherTriggerGate[]
}
export type WeatherTraceSink = (trace: WeatherTriggerTrace) => void
export interface ProvinceWeatherSampleTrace {
	region: number
	weight: number
	triggers: WeatherTriggerTrace[]
}
export interface ProvinceWeatherInspection {
	snapshot: WeatherSnapshot
	traces: ProvinceWeatherSampleTrace[]
}
export interface ProvinceWeatherEvaluationParams {
	weather: SampleProvinceWeatherParams
	trace: ((sample: ProvinceWeatherSampleTrace) => void) | null
}

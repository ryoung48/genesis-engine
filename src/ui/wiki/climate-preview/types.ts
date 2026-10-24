import type { ReactNode } from "react"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { AtmosphereProfile } from "@/model/celestial/orbit-body/types"
import type { TidalSchedule } from "@/model/climate/ocean/tides/tidal-schedule/types"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"

interface ClimatePreviewCommon {
	insolation: number[][]
	insolColorFn: (value: number) => string
	daylight: number[][]
	daylightColorFn: (value: number) => string
	columnValues: number[]
	columnLabels: string[]
	tidalSchedule?: TidalSchedule
}

export interface LockedClimatePreviewData extends ClimatePreviewCommon {
	avgTemp: number
	heat: number[][]
	longitudes: number[]
}

export interface LockedAvgTempConfig {
	isSolarLocked: boolean
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	// [JUSTIFICATION] Rolled stars supply their own values; authored stars use class and subtype.
	starTemperatureK?: number
	// [JUSTIFICATION] Rolled stars supply their own values; authored stars use class and subtype.
	starDiameterSol?: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	planetRadiusKm: number
	pressureBar: number
	// [JUSTIFICATION] Gas giants and bodies without a seismology profile have no tidal heating.
	seismologyTotalHeatingK?: number
	substellarLon: number
}

export interface PlanetDetailSectionProps {
	label: string
	initiallyExpanded: boolean
	children: ReactNode
}

export interface PlanetClimatePreviewProps {
	config: LockedAvgTempConfig
	unitSystem: UnitSystem
}

export interface PlanetDetailDataProps {
	seed: number
	moons: MoonBody[]
	// [JUSTIFICATION] Only moons need their parent and peer orbits as tide raisers.
	moonContext?: {
		moon: MoonBody
		parent: {
			idx: number
			massKg: number
			diameterKm: number
			moons: MoonBody[]
		}
	}
	// [JUSTIFICATION] Moon tides use the parent calendar instead of the local climate calendar.
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
	// [JUSTIFICATION] Rolled stars supply their own value; authored stars use class and subtype.
	starTemperatureK?: number
	// [JUSTIFICATION] Rolled stars supply their own value; authored stars use class and subtype.
	starDiameterSol?: number
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	obliquity: number
	substellarLon: number
	atmosphere: AtmosphereProfile | null | undefined
	// [JUSTIFICATION] Bodies without a seismology profile have no tidal heating.
	seismologyTotalHeatingK?: number
	// [JUSTIFICATION] The main world can display the currently focused moon schedule.
	tidalSchedulePreviewOverride?: TidalSchedule
	unitSystem: UnitSystem
	// [JUSTIFICATION] Callers can customize the default empty tides message.
	tidesEmptyLabel?: string
}

export interface PlanetDetailsProps extends PlanetDetailDataProps {
	// [JUSTIFICATION] Generation controls are only available for the main world.
	generateContent?: ReactNode
	// [JUSTIFICATION] Observer content depends on whether the caller has apparent-size data.
	observerContent?: ReactNode
}

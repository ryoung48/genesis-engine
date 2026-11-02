import type { ReactNode } from "react"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { TidalSchedule } from "@/model/climate/ocean/tides/tidal-schedule/types"

export interface PlanetDetailSectionProps {
	label: string
	initiallyExpanded: boolean
	children: ReactNode
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
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	// [JUSTIFICATION] The main world can display the currently focused moon schedule.
	tidalSchedulePreviewOverride?: TidalSchedule
	// [JUSTIFICATION] Callers can customize the default empty tides message.
	tidesEmptyLabel?: string
}

export interface PlanetDetailsProps extends PlanetDetailDataProps {
	// [JUSTIFICATION] Generation controls are only available for the main world.
	generateContent?: ReactNode
	// [JUSTIFICATION] Observer content depends on whether the caller has apparent-size data.
	observerContent?: ReactNode
}

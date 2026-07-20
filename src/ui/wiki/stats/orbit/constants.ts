import type { SystemBody } from "@/model/celestial/system/generate-system-bodies"

export const EARTH_DIAMETER_KM = 12742

export const EARTH_MASS_KG = 5.973886146404331e24

export const DAYS_PER_YEAR = 365.25

export const ORBIT_STAT_HELP = {
	longitudeOfPerihelion:
		"Longitude of perihelion. Where the closest point of the orbit sits, measured from a fixed reference direction.",
}

export const SIBLING_GROUP_LABEL: Record<SystemBody["group"], string> = {
	"asteroid belt": "Asteroid Belt",
	dwarf: "Dwarf World",
	terrestrial: "Terrestrial Planet",
	helian: "Helian World",
	jovian: "Jovian Planet",
}

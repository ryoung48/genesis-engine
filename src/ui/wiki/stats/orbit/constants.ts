import type { SystemBody } from "@/model/celestial/system"

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

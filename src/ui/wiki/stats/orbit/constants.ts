import type { SystemBody } from "@/model/celestial/system/types"

export const ORBIT_STAT_HELP = {
	lsAphelion:
		"Solar longitude at aphelion in degrees. Sets when peak insolation occurs during the year.",
}

export const SIBLING_GROUP_LABEL: Record<SystemBody["group"], string> = {
	"asteroid belt": "Asteroid Belt",
	dwarf: "Dwarf World",
	terrestrial: "Terrestrial Planet",
	helian: "Helian World",
	jovian: "Jovian Planet",
}

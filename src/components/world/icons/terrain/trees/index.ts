import { IconDef } from "../../types"
import { boreal__icons } from "./boreal"
import { savanna__icons } from "./savanna"
import { swamp__icons } from "./swamp"
import { temperate__icons } from "./temperate"
import { tropical__icons } from "./tropical"
import { tree__icon } from "./types"
import { withered__icons } from "./withered"

export const tree__icons: Record<tree__icon, IconDef> = {
	...boreal__icons,
	...temperate__icons,
	...savanna__icons,
	...tropical__icons,
	...swamp__icons,
	...withered__icons,
}

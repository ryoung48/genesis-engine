import { IconDef } from "../../types"
import { battle__icons } from "./battles"
import { city__icons } from "./cities"
import { ship__icons } from "./ships"
import { town__icons } from "./towns"
import { element__icon } from "./types"

export const element__icons: Record<element__icon, IconDef> = {
	...battle__icons,
	...ship__icons,
	...city__icons,
	...town__icons,
	city: {
		height: 2,
		path: "terrain/elements/cities/2.png",
		opacity: 1,
	},
	town: {
		height: 0.8,
		path: "terrain/elements/towns/3.png",
		opacity: 1,
	},
}

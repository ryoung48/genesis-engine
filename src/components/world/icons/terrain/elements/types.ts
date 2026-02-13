/* eslint-disable camelcase */
import { battle_icon } from "./battles/types"
import { CityIcon } from "./cities/types"
import { ship_icon } from "./ships/types"
import { TownIcon } from "./towns/types"

export type element__icon =
	| battle_icon
	| ship_icon
	| "city"
	| "town"
	| TownIcon
	| CityIcon

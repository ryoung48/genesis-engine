/* eslint-disable camelcase */
import { IconDef } from "../../../types"
import { battle_icon } from "./types"

const height = 1.1

export const battle__icons: Record<battle_icon, IconDef> = {
	battle_old: {
		height,
		path: "terrain/elements/battles/old.png",
		opacity: 1,
	},
	battle_pending: {
		height,
		path: "terrain/elements/battles/pending.png",
		opacity: 1,
	},
}

import type {
	RockKeyCodesParams,
	RockKeyFlagsParams,
	RockKeyTableParams,
} from "@/model/geography/terrain/groundwater/rock-key/types"
import type { HydraulicKey } from "@/model/geography/terrain/groundwater-config/types"
import { ROCKS } from "@/model/geography/terrain/rocks"

const keys: readonly HydraulicKey[] = [
	"young",
	"river",
	"loess",
	"till",
	"erg",
	"sandstone",
	"shale",
	"limestone",
	"salt",
	"basalt",
	"volcanic",
	"granite",
	"slate",
	"gneiss",
	"shield",
	"greenstone",
	"ophiolite",
]

const NO_KEY = 255

function codes({ rock, youngKind }: RockKeyCodesParams): Uint8Array {
	const out = new Uint8Array(rock.length).fill(NO_KEY)
	for (let r = 0; r < rock.length; r++) {
		const kind = ROCKS.kinds[rock[r]]
		if (kind === "sea") continue
		if (kind === "young") {
			const tag = ROCKS.youngKinds[youngKind[r]]
			out[r] = keys.indexOf(tag === "none" ? "young" : tag)
		} else out[r] = keys.indexOf(kind)
	}
	return out
}

function table({ values }: RockKeyTableParams): Float64Array {
	return Float64Array.from(keys, (key) => values[key])
}

function flags({ members }: RockKeyFlagsParams): Float64Array {
	return Float64Array.from(keys, (key) => (members.includes(key) ? 1 : 0))
}

const youngKeys: readonly HydraulicKey[] = [
	"young",
	"river",
	"loess",
	"till",
	"erg",
]

export const ROCK_KEY = {
	keys,
	youngKeys,
	codes,
	table,
	flags,
	none: NO_KEY,
}

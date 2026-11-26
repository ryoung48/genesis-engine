import { PASTA } from "@/model/climate/classification/pasta"
import { ROCK_KEY } from "@/model/geography/terrain/groundwater/rock-key"
import { SHORE_EXPOSURE } from "@/model/geography/terrain/shore/exposure"
import type {
	MaterialOfParams,
	MaterialOfResult,
	ShoreMaterial,
	ShoreMaterialLayer,
	ShoreMaterialParams,
} from "@/model/geography/terrain/shore/material/types"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"

const C = SHORE_CONFIG

const kinds: readonly ShoreMaterial[] = [
	"none",
	"ice",
	"rock",
	"gravel",
	"sand",
	"mud",
]

const code = Object.fromEntries(kinds.map((kind, i) => [kind, i])) as Record<
	ShoreMaterial,
	number
>

const resistByKey = ROCK_KEY.table({ values: C.resist })
const tillKey = ROCK_KEY.keys.indexOf("till")
const volcanicKeys = C.volcanicKeys.map((key) => ROCK_KEY.keys.indexOf(key))

function materialOf({
	resist,
	isTill,
	isIce,
	freshVolcanic,
	relief,
	exposureClass,
	sandShare,
	flowM3s,
}: MaterialOfParams): MaterialOfResult {
	const flat = relief === SHORE_RELIEF.code.low
	const steep = relief === SHORE_RELIEF.code.steep
	if (isIce) return { material: code.ice, volcanicSand: false }
	const volcanicSand = freshVolcanic
	if (
		resist >= C.resistMin &&
		(!flat || exposureClass >= 1) &&
		!(freshVolcanic && !steep)
	)
		return { material: code.rock, volcanicSand }
	if (isTill || steep) return { material: code.gravel, volcanicSand }
	if (freshVolcanic) return { material: code.sand, volcanicSand }
	if (
		sandShare < C.sandMin &&
		(exposureClass === 0 || flowM3s >= C.deltaFlowM3s)
	)
		return { material: code.mud, volcanicSand }
	return { material: code.sand, volcanicSand }
}

function classify({
	coastal,
	keyCode,
	sand,
	pastaClimate,
	relief,
	exposureOpenM,
	flow,
	volcano,
}: ShoreMaterialParams): ShoreMaterialLayer {
	const material = new Uint8Array(coastal.length)
	const volcanicSand = new Uint8Array(coastal.length)
	for (let r = 0; r < coastal.length; r++) {
		if (!coastal[r]) continue
		const key = keyCode[r]
		const known = key !== ROCK_KEY.none
		const result = materialOf({
			resist: known ? resistByKey[key] : 0,
			isTill: known && key === tillKey,
			isIce: pastaClimate[r] === PASTA.iceCode,
			freshVolcanic:
				known &&
				volcanicKeys.includes(key) &&
				volcano[r] >= C.volcanicSandActivity,
			relief: relief[r],
			exposureClass: SHORE_EXPOSURE.classOf({ exposureM: exposureOpenM[r] }),
			sandShare: sand[r],
			flowM3s: flow[r],
		})
		material[r] = result.material
		volcanicSand[r] = result.volcanicSand ? 1 : 0
	}
	return { material, volcanicSand }
}

export const SHORE_MATERIAL = { kinds, code, materialOf, classify }

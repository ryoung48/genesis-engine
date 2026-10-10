import type {
	Country,
	Territory,
} from "@/model/history/distribution/territory/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface SeedParams {
	territory: Territory
	country: Country
	rng: SharedRng
}
export interface SizesParams {
	total: number
	limit: number
}
export interface GrowParams {
	territory: Territory
	country: Country
	seed: number
	size: number
}
export interface CarveParams extends GrowParams {
	limit: number
}
export interface CenterParams {
	territory: Territory
	provinces: number[]
}

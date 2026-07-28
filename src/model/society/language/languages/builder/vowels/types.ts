import type { SharedRng } from "@/model/shared/random/rng"

export interface DiphthongsParams {
	vowels: string[]
	consonants: string[]
	dice: SharedRng
}

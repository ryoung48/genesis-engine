import type { GenerateSystemBodiesParams } from "@/model/celestial/system/generation/types"
import type { SystemBody } from "@/model/celestial/system/types"

export type SolSeedGenerationParams = GenerateSystemBodiesParams
export type SolSeedGenerationResult = SystemBody[] | null

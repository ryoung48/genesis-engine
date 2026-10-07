import type { GenesisParams } from "@/model/pipelines/types"

export interface CachedWorldParams {
	params: GenesisParams
}

export interface ResolveImportParams {
	from: string
	specifier: string
}

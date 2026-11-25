import type { RockKind, YoungKind } from "@/model/geography/terrain/rocks/types"

export type HydraulicKey = Exclude<RockKind, "sea"> | Exclude<YoungKind, "none">

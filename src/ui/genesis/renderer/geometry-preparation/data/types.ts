import type { PreparedGeometry } from "@/ui/genesis/renderer/geometry-preparation/types"

export type GeometryBuffers = Pick<PreparedGeometry, "terrain" | "map">

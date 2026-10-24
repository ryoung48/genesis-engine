import type { GenesisParams } from "@/model/pipelines/types"

export type CalendarParams = Pick<GenesisParams, "daysPerYear" | "hoursPerDay">

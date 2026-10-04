import type { CommandParams } from "@/model/history/sim/engine/events/battle/command/types"
import { GOVERNOR } from "@/model/history/sim/engine/governor"

function multiplier(params: CommandParams): number {
	return GOVERNOR.factor({
		attribute: "martial",
		value: GOVERNOR.attribute({ ...params, attribute: "martial" }),
	})
}
export const COMMAND = { multiplier }

import type { ReligionSelection } from "@/ui/genesis/view/types"

export const NO_RELIGION_SELECTION: ReligionSelection = {
	forKey: () => undefined,
	selectKey: () => undefined,
	resolve: () => null,
	select: () => undefined,
}

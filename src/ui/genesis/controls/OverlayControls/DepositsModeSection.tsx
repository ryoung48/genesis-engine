import React, { useMemo } from "react"
import { DEPOSITS_VIEW } from "@/ui/genesis/shared/deposits-view"
import type { DepositsView } from "@/ui/genesis/shared/deposits-view/types"
import { SwatchDropdown } from "./SwatchDropdown"

export interface DepositsModeSectionProps {
	hasDeposits: boolean
	depositsView: DepositsView
	setDepositsView: (v: DepositsView) => void
}

export const DepositsModeSection: React.FC<DepositsModeSectionProps> = ({
	hasDeposits,
	depositsView,
	setDepositsView,
}) => {
	const options = useMemo(() => DEPOSITS_VIEW.options(), [])
	if (!hasDeposits) return null
	return (
		<SwatchDropdown
			label="Deposits"
			options={options}
			value={depositsView}
			onChange={setDepositsView}
		/>
	)
}

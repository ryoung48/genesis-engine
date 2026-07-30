import { MinusBoxIcon } from "@/ui/components/primitives/icons/MinusBoxIcon"
import { PlusBoxIcon } from "@/ui/components/primitives/icons/PlusBoxIcon"

export function OrbitChildCard({
	title,
	subtitle,
	onClick,
	insertRowsVisible,
	onToggleInsertRows,
}: Omit<OrbitChildCardModel, "key"> & {
	insertRowsVisible: boolean
	onToggleInsertRows: () => void
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-all hover:border-slate-300 hover:bg-slate-50">
			<button
				type="button"
				onClick={onClick}
				className="min-w-0 flex-1 text-left"
			>
				<div className="text-[12px] leading-tight text-slate-950">{title}</div>
			</button>
			<div className="ml-auto flex shrink-0 items-center">
				<div className="mr-1.5 text-[8px] uppercase tracking-[0.12em] text-slate-400">
					{subtitle}
				</div>
				<button
					type="button"
					onClick={onToggleInsertRows}
					aria-label={
						insertRowsVisible
							? `Hide insert rows for ${title}`
							: `Show insert rows for ${title}`
					}
					aria-pressed={insertRowsVisible}
					className={`flex h-5 w-5 items-center justify-center rounded-l-md rounded-r-none border transition-colors ${
						insertRowsVisible
							? "border-slate-300 bg-slate-100 text-slate-700"
							: "border-slate-200 text-slate-400 hover:text-slate-700"
					}`}
				>
					<PlusBoxIcon className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					aria-label={`Hide orbit ${title}`}
					className="flex h-5 w-5 items-center justify-center rounded-r-md rounded-l-none border border-l-0 border-slate-200 text-slate-300"
				>
					<MinusBoxIcon className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	)
}

export interface OrbitChildCardModel {
	key: string
	title: string
	subtitle: string
	onClick: () => void
}

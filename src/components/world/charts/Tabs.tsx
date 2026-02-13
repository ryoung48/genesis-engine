interface TabItem<T extends string> {
	id: T
	label: string
}

interface TabsProps<T extends string> {
	tabs: TabItem<T>[]
	activeTab: T
	onTabSelect: (id: T) => void
	className?: string
}

export const Tabs = <T extends string>({
	tabs,
	activeTab,
	onTabSelect,
	className = "",
}: TabsProps<T>) => {
	return (
		<div
			className={`flex items-center justify-between mb-2 overflow-x-auto pb-1 no-scrollbar ${className}`}
		>
			<div className="flex gap-x-4 whitespace-nowrap">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						onClick={() => onTabSelect(t.id)}
						className={`font-mono text-[10px] font-bold uppercase tracking-wider transition-colors py-1 border-b-2 ${
							activeTab === t.id
								? "text-slate-900 border-slate-900"
								: "text-slate-400 border-transparent hover:text-slate-600"
						}`}
					>
						{t.label}
					</button>
				))}
			</div>
		</div>
	)
}

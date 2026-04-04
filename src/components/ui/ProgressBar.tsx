export const ProgressBar = ({ progress }: { progress: number }) => {
	const segments = 40
	const filled = Math.floor((progress / 100) * segments)
	return (
		<div className="flex gap-0.5 w-full overflow-hidden">
			{Array.from({ length: segments }).map((_, i) => (
				<div
					key={i}
					className={`h-2 flex-1 transition-all duration-300 ${
						i < filled ? "bg-slate-900 scale-y-100" : "bg-slate-100 scale-y-75"
					}`}
				/>
			))}
		</div>
	)
}

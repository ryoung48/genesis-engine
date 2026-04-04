export const ConstellationBackground = () => (
	<div className="absolute inset-0 overflow-hidden pointer-events-none">
		<div
			className="absolute inset-0 opacity-[0.03]"
			style={{
				backgroundImage: `
					linear-gradient(to right, #0f172a 1px, transparent 1px),
					linear-gradient(to bottom, #0f172a 1px, transparent 1px)
				`,
				backgroundSize: "60px 60px",
			}}
		/>
	</div>
)

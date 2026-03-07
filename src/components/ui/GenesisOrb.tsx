import React from "react"

export const GenesisOrb = ({ className }: { className?: string }) => (
	<div className={`relative flex items-center justify-center ${className}`}>
		{/* Outer glow */}
		<div className="absolute w-80 h-80 bg-slate-300/10 rounded-full blur-3xl animate-pulse" />

		{/* Orbital rings */}
		<svg
			width="280"
			height="280"
			viewBox="0 0 280 280"
			fill="none"
			className="absolute animate-[spin_30s_linear_infinite]"
		>
			<ellipse
				cx="140"
				cy="140"
				rx="130"
				ry="50"
				stroke="currentColor"
				strokeWidth="0.5"
				className="text-slate-400 opacity-40"
			/>
		</svg>

		<svg
			width="280"
			height="280"
			viewBox="0 0 280 280"
			fill="none"
			className="absolute animate-[spin_25s_linear_infinite_reverse]"
			style={{ transform: "rotateX(70deg) rotateZ(30deg)" }}
		>
			<ellipse
				cx="140"
				cy="140"
				rx="110"
				ry="40"
				stroke="currentColor"
				strokeWidth="0.5"
				className="text-slate-300 opacity-30"
			/>
		</svg>

		{/* Rotating outer ring */}
		<svg
			width="180"
			height="180"
			viewBox="0 0 180 180"
			fill="none"
			className="absolute animate-[spin_20s_linear_infinite]"
		>
			<circle
				cx="90"
				cy="90"
				r="85"
				stroke="currentColor"
				strokeWidth="0.5"
				strokeDasharray="2 8"
				className="text-slate-300"
			/>
			<circle
				cx="90"
				cy="90"
				r="85"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray="40 200"
				strokeLinecap="round"
				className="text-slate-900"
			/>
		</svg>

		{/* Inner rotating ring */}
		<svg
			width="120"
			height="120"
			viewBox="0 0 120 120"
			fill="none"
			className="absolute animate-[spin_12s_linear_infinite_reverse]"
		>
			<circle
				cx="60"
				cy="60"
				r="55"
				stroke="currentColor"
				strokeWidth="0.5"
				className="text-slate-200"
			/>
			<circle
				cx="60"
				cy="60"
				r="55"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeDasharray="30 150"
				strokeLinecap="round"
				className="text-slate-700"
			/>
		</svg>

		{/* Core sphere */}
		<div className="relative w-16 h-16">
			<div
				className="absolute inset-0 rounded-full"
				style={{
					background:
						"radial-gradient(circle at 35% 35%, #f8fafc, #94a3b8 40%, #0f172a 100%)",
					boxShadow:
						"0 0 60px rgba(15, 23, 42, 0.3), inset -4px -4px 20px rgba(0,0,0,0.5)",
				}}
			/>
			<div
				className="absolute inset-0 rounded-full bg-white/20"
				style={{ clipPath: "ellipse(40% 30% at 35% 35%)" }}
			/>
		</div>

		{/* Orbiting dots */}
		<div className="absolute w-[180px] h-[180px] animate-[spin_8s_linear_infinite]">
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-900 rounded-full shadow-[0_0_10px_rgba(15,23,42,0.6)]" />
		</div>
		<div className="absolute w-[140px] h-[140px] animate-[spin_6s_linear_infinite_reverse]">
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-slate-500 rounded-full shadow-[0_0_8px_rgba(100,116,139,0.6)]" />
		</div>
	</div>
)

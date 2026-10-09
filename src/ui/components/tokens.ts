export const uiPalette = {
	war: "#b91c1c",
	siege: "#7f1d1d",
	treasury: {
		critical: "#b91c1c",
		caution: "#f59e0b",
		healthy: "#22c55e",
	},
	giantStar: "#ef4444",
	moonHighland: "#c2c2c2",
	martianHighland: "#d7724d",
	brownDwarfL: "#a95632",
	brownDwarfT: "#895949",
	brownDwarfY: "#685b60",
	neutronStarGlow: "#8cecff",
	accent: "#4f46e5",
	sectorBoundary: "#cbd5e1",
	sectorCapital: "#38bdf8",
	nationCapital: "#fbbf24",
	rebel: "#000000",
	activeDark: "#0f172a",
	person: {
		noHouse: "#94a3b8",
		health: {
			Excellent: "#15803d",
			Good: "#22c55e",
			Fine: "#84cc16",
			Poor: "#f59e0b",
			"Near death": "#ea580c",
			Dying: "#b91c1c",
		},
	},
	swatch: {
		stripeBackground: "rgba(15, 23, 42, 0.85)",
		stripedBorder: "rgba(255, 255, 255, 0.15)",
		plainBorder: "rgba(203, 213, 225, 0.8)",
	},
} as const

export const uiChartPalette = {
	moon: ["#0ea5e9", "#8b5cf6", "#10b981"] as const,
	solar: "#f59e0b",
	total: "#1e293b",
	timingTiers: ["#0f172a", "#1e293b", "#334155"] as const,
	successFill: "rgba(22, 163, 74, 0.1)",
	successStroke: "#16a34a",
	axisText: "#64748b",
	axisTextStrong: "#475569",
	gridLine: "#e2e8f0",
	gridLineTranslucent: "rgba(148, 163, 184, 0.2)",
	referenceLine: "#94a3b8",
	tooltipBg: "#ffffff",
	tone: {
		neutral: "bg-slate-500",
		warm: "bg-amber-500",
		cool: "bg-sky-500",
	},
} as const

export const uiTokens = {
	wiki: {
		page: "space-y-2 overflow-x-hidden",
		stats: "mt-3 grid grid-cols-2 gap-x-3 gap-y-1",
		rows: "space-y-1",
		row: "flex items-baseline justify-between gap-2",
	},
	surface: {
		canvas: "bg-slate-100",
		panel: "bg-white/95",
		panelMuted: "bg-slate-50/90",
		panelAccent: "bg-white/90",
		overlay: "bg-slate-950/85 text-white",
		overlaySubtle: "bg-slate-950/75 text-white",
	},
	border: {
		default: "border-slate-200",
		muted: "border-slate-200/80",
		inverse: "border-white/10",
		inverseStrong: "border-white/20",
	},
	text: {
		primary: "text-slate-950",
		muted: "text-slate-500",
		subtle: "text-slate-400",
		inverse: "text-white",
		inverseMuted: "text-slate-400",
		inverseSubtle: "text-slate-500",
		sectorCapital: "text-sky-400",
		nationCapital: "text-amber-400",
	},
	radius: {
		sm: "rounded-md",
		md: "rounded-lg",
		lg: "rounded-xl",
		xl: "rounded-2xl",
		pill: "rounded-full",
	},
	shadow: {
		sm: "shadow-sm",
		md: "shadow-lg",
		lg: "shadow-2xl",
	},
	blur: {
		sm: "backdrop-blur-sm",
		md: "backdrop-blur-md",
	},
	type: {
		label: "font-mono text-[9px] uppercase tracking-[0.12em]",
		labelWide: "font-mono text-[9px] uppercase tracking-[0.16em]",
		labelSm: "text-[8px] font-semibold uppercase tracking-[0.08em]",
		control: "text-[10px] font-semibold uppercase tracking-[0.08em]",
		controlSm: "text-[9px] font-semibold uppercase tracking-[0.08em]",
		controlTextSm: "text-[9px] font-semibold tracking-[0.08em]",
		controlWide: "text-[10px] font-semibold uppercase tracking-[0.12em]",
		controlLoose: "text-[10px] font-semibold uppercase tracking-[0.14em]",
		value: "font-mono text-[11px]",
		valueSm: "font-mono text-[10px]",
		title: "text-sm font-semibold tracking-tight",
		hero: "text-[30px] leading-snug [font-family:var(--font-jedar)]",
	},
} as const

export type UiSurfaceTone = keyof typeof uiTokens.surface
export type UiBorderTone = keyof typeof uiTokens.border
export type UiRadius = keyof typeof uiTokens.radius
export type UiShadow = keyof typeof uiTokens.shadow
export type UiBlur = keyof typeof uiTokens.blur

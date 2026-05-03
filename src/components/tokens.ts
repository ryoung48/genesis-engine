export const uiTokens = {
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
		control: "text-[10px] font-semibold uppercase tracking-[0.08em]",
		controlWide: "text-[10px] font-semibold uppercase tracking-[0.12em]",
		value: "font-mono text-[11px]",
		valueSm: "font-mono text-[10px]",
		title: "text-sm font-semibold tracking-tight",
	},
} as const

export type UiSurfaceTone = keyof typeof uiTokens.surface
export type UiBorderTone = keyof typeof uiTokens.border
export type UiRadius = keyof typeof uiTokens.radius
export type UiShadow = keyof typeof uiTokens.shadow
export type UiBlur = keyof typeof uiTokens.blur

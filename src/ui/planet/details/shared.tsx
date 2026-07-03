import React from "react"
import type { PlanetType } from "@/model/celestial/moons/moon-types"
import { type DistributionChartBucket as DistributionBucket } from "@/ui/components/composites/DistributionChart"
import { Button } from "@/ui/components/primitives/Button"
import { LabeledValueRow } from "@/ui/components/primitives/LabeledValueRow"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { uiTokens } from "@/ui/components/tokens"
import type { PlanetStat } from "../screen/display/planet-stats"

export type { DistributionBucket }

export interface NationDetailsData {
	id: number
	name: string
	ruler?: {
		name: string
		age: number | null
		genderSymbol: string | null
		claimStrength: string | null
		isRegency: boolean
		dynasty: string | null
		dynastyColor: string | null
	} | null
	provinceCount: number
	totalPopulation: number
	color: string | null
	neighbors: Array<{
		id: number
		name: string
		color: string | null
		relation: string
		threat: number | null
	}>
	activeWars: Array<{
		id: number
		opponentId: number
		opponentName: string
		opponentColor: string | null
		role: string
		rebel: boolean
	}>
	governmentType: string | null
	governmentColor: string | null
	cultureDistribution: DistributionBucket[]
	heritageDistribution: DistributionBucket[]
	religionDistribution: DistributionBucket[]
}

export interface DetailsDrawerBaseProps {
	planetName: string
	planetType: PlanetType
	planetStats: PlanetStat[]
	worldPopulation: number | null
	activeWarCount: number | null
	cultureCount: number | null
	heritageCount: number | null
	religionCount: number | null
	nationSizeDistribution: DistributionBucket[]
	governmentDistribution: DistributionBucket[]
	religionDistribution: DistributionBucket[]
	conflictDistribution: DistributionBucket[]
	relationDistribution: DistributionBucket[]
	climateDistribution: DistributionBucket[]
	vegetationDistribution: DistributionBucket[]
	topographyDistribution: DistributionBucket[]
	tradeGoodsDistribution: DistributionBucket[]
}

export function formatPopulation(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0"
	if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`
	}
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
	}
	return Math.round(value).toLocaleString()
}

export function DetailRow({ label, value }: { label: string; value: string }) {
	return <LabeledValueRow label={label} value={value} />
}

export function WikiHeader({
	title,
	subtitle,
	color,
	onClose,
}: {
	title: string
	subtitle: string
	color?: string | null
	onClose?: () => void
}) {
	return (
		<div className="border-b border-slate-200 pb-2">
			<div className="flex items-center gap-1.5">
				{color != null && <Swatch color={color} />}
				<div className="flex-1 min-w-0">
					<div className="flex items-center">
						<h1
							className="text-[30px] leading-snug text-slate-950 flex-1"
							style={{ fontFamily: "var(--font-jedar)" }}
						>
							{title}
						</h1>
						{onClose != null && (
							<button
								type="button"
								onClick={onClose}
								title="Hide details"
								className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						)}
					</div>
					<span className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-400 leading-none mt-0.5 block">
						{subtitle}
					</span>
				</div>
			</div>
		</div>
	)
}

export function InfoboxGrid({ children }: { children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
			{children}
		</div>
	)
}

export function InfoboxStat({
	label,
	value,
}: {
	label: string
	value: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-0 min-w-0">
			<span className={`${uiTokens.type.label} text-slate-400`}>{label}</span>
			<span className="font-mono text-[11px] text-slate-950 truncate leading-snug">
				{value}
			</span>
		</div>
	)
}

export function AccordionSection({
	title,
	open,
	onToggle,
	children,
}: {
	title: string
	open: boolean
	onToggle: () => void
	children: React.ReactNode
}) {
	return (
		<Surface
			tone="panelMuted"
			borderTone="default"
			radius="lg"
			className="overflow-hidden"
		>
			<Button
				onClick={onToggle}
				tone="panel"
				shape="rounded"
				size="sm"
				className="flex w-full items-center justify-between gap-3 rounded-none border-0 bg-transparent px-2.5 py-1.5 text-left text-slate-600 shadow-none hover:bg-slate-100"
			>
				<span
					className={`${uiTokens.type.label} font-semibold tracking-[0.14em] text-slate-600`}
				>
					{title}
				</span>
				<span
					className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
				>
					▾
				</span>
			</Button>
			{open ? (
				<div className="border-t border-slate-200 px-2.5 py-1.5">{children}</div>
			) : null}
		</Surface>
	)
}

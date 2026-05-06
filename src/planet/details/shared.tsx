import React from "react"
import {
	Button,
	type DistributionChartBucket as DistributionBucket,
	LabeledValueRow,
	Surface,
	uiTokens,
} from "@/components"
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
	cultureDistribution: DistributionBucket[]
	heritageDistribution: DistributionBucket[]
	faithDistribution: DistributionBucket[]
	religionDistribution: DistributionBucket[]
}

export interface DetailsDrawerBaseProps {
	planetStats: PlanetStat[]
	worldPopulation: number | null
	activeWarCount: number | null
	cultureCount: number | null
	heritageCount: number | null
	faithCount: number | null
	religionCount: number | null
	nationSizeDistribution: DistributionBucket[]
	conflictDistribution: DistributionBucket[]
	relationDistribution: DistributionBucket[]
	climateDistribution: DistributionBucket[]
	vegetationDistribution: DistributionBucket[]
	topographyDistribution: DistributionBucket[]
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
				className="flex w-full items-center justify-between gap-3 rounded-none border-0 bg-transparent px-3 py-2 text-left text-slate-600 shadow-none hover:bg-slate-100"
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
				<div className="border-t border-slate-200 px-3 py-2">{children}</div>
			) : null}
		</Surface>
	)
}

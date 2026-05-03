import React, { type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { YEAR_MS } from "@/model/history/state"
import type { DistributionBucket } from "../shared"
import {
	NationDetails,
	PoliticalNeighborsTable,
	WarList,
} from "./NationDetails"

const emptyBuckets: DistributionBucket[] = []
const emptyDistributions = {
	cultureDistribution: emptyBuckets,
	heritageDistribution: emptyBuckets,
	faithDistribution: emptyBuckets,
	religionDistribution: emptyBuckets,
}

type ChildrenProps = {
	children?: ReactNode
}

type ClickableProps = {
	onClick?: React.MouseEventHandler<HTMLButtonElement>
}

describe("NationDetails", () => {
	it("renders political neighbors as a sortable paginated table", () => {
		const markup = renderToStaticMarkup(
			<NationDetails
				nation={{
					id: 7,
					name: "Aurelian League",
					provinceCount: 12,
					totalPopulation: 3_400_000,
					color: "#abcdef",
					neighbors: Array.from({ length: 7 }, (_, index) => ({
						id: index + 1,
						name: `Neighbor ${index + 1}`,
						color: "#123456",
						relation: index % 2 === 0 ? "Neutral" : "Hostile",
						threat: index === 6 ? null : (7 - index) / 10,
					})),
					activeWars: [],
					...emptyDistributions,
				}}
				section="political"
				onSectionChange={vi.fn()}
				onNationClick={vi.fn()}
			/>,
		)

		expect(markup).toContain(">Neighbors<")
		expect(markup).toContain(">Nation<")
		expect(markup).toContain(">Relation<")
		expect(markup).toContain(">Threat<")
		expect(markup).toContain("Sort neighbors by nation")
		expect(markup).toContain("Sort neighbors by threat")
		expect(markup).toContain("1-6 of 7")
		expect(markup).toContain(">Next<")
	})

	it("renders active wars when the political section is open", () => {
		const markup = renderToStaticMarkup(
			<NationDetails
				nation={{
					id: 3,
					name: "River Crown",
					provinceCount: 5,
					totalPopulation: 250_000,
					color: "#fedcba",
					neighbors: [],
					activeWars: [
						{
							id: 9,
							opponentId: 8,
							opponentName: "Vale",
							opponentColor: "#654321",
							role: "Attacker",
							rebel: true,
						},
					],
					...emptyDistributions,
				}}
				section="political"
				onSectionChange={vi.fn()}
				onNationClick={vi.fn()}
			/>,
		)

		expect(markup).toContain("vs Vale · Attacker · Rebel")
		expect(markup).toContain(">Active Wars<")
	})

	it("renders history when historical inputs are present", () => {
		const markup = renderToStaticMarkup(
			<NationDetails
				nation={{
					id: 3,
					name: "River Crown",
					provinceCount: 5,
					totalPopulation: 250_000,
					color: "#fedcba",
					neighbors: [],
					activeWars: [],
					...emptyDistributions,
				}}
				section="history"
				onSectionChange={vi.fn()}
				nationHistory={[
					{ timeMs: 0, size: 2, wealth: 4, optimalWealth: 5 },
					{ timeMs: YEAR_MS, size: 3, wealth: 6, optimalWealth: 7 },
				]}
				windowedEvents={[]}
				allPastEvents={[]}
				selectedTimeMs={YEAR_MS}
				currentTimeMs={YEAR_MS}
				onTimeSelect={vi.fn()}
				onNationClick={vi.fn()}
			/>,
		)

		expect(markup).toContain(">History<")
		expect(markup).toContain('role="img"')
		expect(markup).toContain("Year 1")
	})

	it("defaults history event collections and non-rebel wars cleanly", () => {
		const historyMarkup = renderToStaticMarkup(
			<NationDetails
				nation={{
					id: 2,
					name: "Stone Vale",
					provinceCount: 2,
					totalPopulation: 90_000,
					color: "#999999",
					neighbors: [],
					activeWars: [],
					...emptyDistributions,
				}}
				section="history"
				onSectionChange={vi.fn()}
				nationHistory={[{ timeMs: 0, size: 1, wealth: 1, optimalWealth: 2 }]}
				selectedTimeMs={0}
				currentTimeMs={0}
				onTimeSelect={vi.fn()}
				onNationClick={vi.fn()}
			/>,
		)

		expect(historyMarkup).toContain(">History<")

		const warMarkup = renderToStaticMarkup(
			WarList({
				items: [
					{
						id: 1,
						opponentId: 4,
						opponentName: "Northmarch",
						opponentColor: "#444444",
						role: "Defender",
						rebel: false,
					},
				],
			}),
		)

		expect(warMarkup).toContain("vs Northmarch · Defender")
		expect(warMarkup).not.toContain("Rebel")
	})

	it("renders demographic distributions and omits history when inputs are incomplete", () => {
		const markup = renderToStaticMarkup(
			<NationDetails
				nation={{
					id: 5,
					name: "Cedar Coast",
					provinceCount: 8,
					totalPopulation: 1_250_000,
					color: "#00aaee",
					neighbors: [],
					activeWars: [],
					cultureDistribution: [
						{ label: "Lowland", count: 3, color: "#112233" },
						{ label: "Highland", count: 1, color: "#445566" },
					],
					heritageDistribution: [
						{ label: "Coastal", count: 4, color: "#778899" },
					],
					faithDistribution: [
						{ label: "Sun Faith", count: 2, color: "#ffaa00" },
					],
					religionDistribution: [],
				}}
				section="demographics"
				onSectionChange={vi.fn()}
				nationHistory={[{ timeMs: 0, size: 1, wealth: 1, optimalWealth: 1 }]}
				selectedTimeMs={0}
				currentTimeMs={0}
				onNationClick={vi.fn()}
			/>,
		)

		expect(markup).toContain(">Demographics<")
		expect(markup).toContain("1.3M")
		expect(markup).toContain("Cultures")
		expect(markup).toContain("Lowland (3, 75.0%)")
		expect(markup).toContain("Heritages")
		expect(markup).toContain("Faiths")
		expect(markup).not.toContain(">History<")
		expect(markup).not.toContain("Religions")
	})

	it("wires neighbor table actions through table cells and pagination", () => {
		const onSort = vi.fn()
		const onPageChange = vi.fn()
		const onNationClick = vi.fn()
		const tree = PoliticalNeighborsTable({
			neighbors: [
				{
					id: 1,
					name: "Amber Coast",
					color: "#111111",
					relation: "Neutral",
					threat: 0.4,
				},
				{
					id: 2,
					name: "Beryl March",
					color: "#222222",
					relation: "Hostile",
					threat: 0.2,
				},
			],
			visibleNeighbors: [
				{
					id: 1,
					name: "Amber Coast",
					color: "#111111",
					relation: "Neutral",
					threat: 0.4,
				},
			],
			sort: { key: "threat", direction: "desc" },
			onSort,
			pageIndex: 1,
			onPageChange,
			onNationClick,
		}) as ReactElement<ChildrenProps>

		const children = React.Children.toArray(
			tree.props.children,
		) as ReactElement[]
		const dataTable = children[1] as ReactElement<{
			columns: Array<{
				cell: (row: {
					id: number
					name: string
					color: string | null
					relation: string
					threat: number | null
				}) => ReactNode
			}>
			onSort?: (columnId: string) => void
		}>
		const pagination = children[2] as ReactElement<{
			onPageChange?: (pageIndex: number) => void
		}>

		const nationCell = dataTable.props.columns[0].cell({
			id: 1,
			name: "Amber Coast",
			color: "#111111",
			relation: "Neutral",
			threat: 0.4,
		}) as ReactElement<ClickableProps>

		nationCell.props.onClick?.(undefined as never)
		dataTable.props.onSort?.("name")
		pagination.props.onPageChange?.(0)

		expect(onNationClick).toHaveBeenCalledWith(1)
		expect(onSort).toHaveBeenCalledWith("name")
		expect(onPageChange).toHaveBeenCalledWith(0)
	})

	it("forwards active war opponent clicks", () => {
		const onNationClick = vi.fn()
		const tree = WarList({
			items: [
				{
					id: 10,
					opponentId: 3,
					opponentName: "Cinder Reach",
					opponentColor: "#333333",
					role: "Defender",
					rebel: true,
				},
			],
			onNationClick,
		}) as ReactElement<ChildrenProps>

		const button = (
			tree.props.children as ReactElement[]
		)[0] as ReactElement<ClickableProps>
		button.props.onClick?.(undefined as never)

		expect(onNationClick).toHaveBeenCalledWith(3)
	})

	it("renders empty helpers and null-nation fallbacks", () => {
		expect(renderToStaticMarkup(WarList({ items: [] }))).toContain("None")
		const markup = renderToStaticMarkup(
			<NationDetails
				nation={null}
				section="political"
				onSectionChange={vi.fn()}
			/>,
		)
		expect(markup).toContain("N/A")
		expect(markup).not.toContain("role=&quot;img&quot;")
	})
})

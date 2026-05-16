import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
	Button,
	CheckIcon,
	CopyIcon,
	DataTable,
	FloatingPanel,
	fadeBackdropClassName,
	fadeVisibilityClassName,
	GearIcon,
	GlobeIcon,
	IconButton,
	LabeledValueRow,
	MapIcon,
	Pagination,
	SegmentedControl,
	Surface,
	Swatch,
} from "."

type ChildrenProps = {
	children?: React.ReactNode
}

type ClickableProps = {
	onClick?: React.MouseEventHandler<HTMLButtonElement>
}

describe("planet ui primitives", () => {
	it("renders semantic overlay and panel surfaces", () => {
		const markup = renderToStaticMarkup(
			<>
				<Surface tone="panelAccent" borderTone="default" radius="md" />
				<FloatingPanel className="test-panel">Panel</FloatingPanel>
			</>,
		)

		expect(markup).toContain("bg-white/90")
		expect(markup).toContain("bg-slate-950/85 text-white")
		expect(markup).toContain("test-panel")
	})

	it("renders segmented controls and buttons with selected states", () => {
		const onChange = vi.fn()
		const markup = renderToStaticMarkup(
			<>
				<SegmentedControl
					options={[
						{
							value: "globe",
							label: <GlobeIcon className="h-4 w-4" />,
							ariaLabel: "Globe view",
						},
						{
							value: "map",
							label: <MapIcon className="h-4 w-4" />,
							ariaLabel: "Map view",
						},
					]}
					value="map"
					onChange={onChange}
					tone="overlay"
				/>
				<Button tone="overlay" selected shape="pill">
					Time
				</Button>
				<IconButton tone="panel" shape="rounded" title="Close">
					X
				</IconButton>
				<GlobeIcon className="h-4 w-4" />
				<MapIcon className="h-4 w-4" />
				<GearIcon className="h-4 w-4" />
				<CopyIcon className="h-4 w-4" />
				<CheckIcon className="h-4 w-4" />
			</>,
		)

		expect(markup).toContain('aria-label="Globe view"')
		expect(markup).toContain('aria-label="Map view"')
		expect(markup).toContain("bg-white/15 text-white shadow-sm")
		expect(markup).toContain("rounded-full")
		expect(markup).toContain("rounded-lg")
		expect(markup).toContain('viewBox="0 0 24 24"')
	})

	it("honors segmented control active overrides and click handlers", () => {
		const onChange = vi.fn()
		const tree = SegmentedControl({
			options: [
				{
					value: "globe",
					label: "Globe",
					title: "Focus globe",
				},
				{
					value: "map",
					label: "Map",
					disabled: true,
				},
			],
			value: "map",
			onChange,
			isActive: (value) => value === "globe",
			buttonClassName: "extra-button",
		}) as React.ReactElement<ChildrenProps>

		const buttons = React.Children.toArray(
			tree.props.children,
		) as React.ReactElement<
			ClickableProps & {
				className?: string
				disabled?: boolean
				title?: string
			}
		>[]
		const globeButton = buttons[0]
		const mapButton = buttons[1]

		expect(globeButton.props.className).toContain(
			"bg-white text-slate-900 shadow-sm",
		)
		expect(globeButton.props.className).toContain("extra-button")
		expect(globeButton.props.title).toBe("Focus globe")
		expect(mapButton.props.disabled).toBe(true)

		globeButton.props.onClick?.(undefined as never)

		expect(onChange).toHaveBeenCalledWith("globe")
	})

	it("renders labeled values and swatches for panel rows", () => {
		const markup = renderToStaticMarkup(
			<LabeledValueRow
				label="Climate"
				value={
					<span className="inline-flex items-center gap-1.5">
						<Swatch color="#abcdef" striped />
						<span>Temperate</span>
					</span>
				}
				tone="overlay"
			/>,
		)

		expect(markup).toContain("Climate")
		expect(markup).toContain("Temperate")
		expect(markup).toContain("repeating-linear-gradient")
		expect(markup).toContain("text-slate-100")
	})

	it("renders reusable tables and pagination controls", () => {
		const markup = renderToStaticMarkup(
			<>
				<DataTable
					columns={[
						{
							id: "name",
							header: "Nation",
							sortable: true,
							cell: (row) => row.name,
						},
						{
							id: "threat",
							header: "Threat",
							align: "end",
							sortable: true,
							cell: (row) => row.threat,
						},
					]}
					rows={[
						{ id: 1, name: "Amber Coast", threat: "42%" },
						{ id: 2, name: "Beryl March", threat: "12%" },
					]}
					rowKey={(row) => row.id}
					sort={{ columnId: "threat", direction: "desc" }}
					onSort={vi.fn()}
				/>
				<Pagination
					pageIndex={1}
					pageSize={5}
					totalItems={12}
					onPageChange={vi.fn()}
				/>
			</>,
		)

		expect(markup).toContain("Amber Coast")
		expect(markup).toContain("Threat")
		expect(markup).toContain("↓")
		expect(markup).toContain("6-10 of 12")
		expect(markup).toContain(">Prev<")
		expect(markup).toContain(">Next<")
	})

	it("wires reusable table sorting and pagination clicks", () => {
		const onSort = vi.fn()
		const onPageChange = vi.fn()

		const tableTree = DataTable({
			columns: [
				{
					id: "name",
					header: "Nation",
					sortable: true,
					cell: (row) => row.name,
				},
			],
			rows: [{ id: 1, name: "Amber Coast" }],
			rowKey: (row) => row.id,
			sort: { columnId: "name", direction: "asc" },
			onSort,
		}) as React.ReactElement<ChildrenProps>

		const table = React.Children.only(
			tableTree.props.children,
		) as React.ReactElement<ChildrenProps>
		const thead = React.Children.toArray(
			table.props.children,
		)[0] as React.ReactElement<ChildrenProps>
		const headerRow = React.Children.only(
			thead.props.children,
		) as React.ReactElement<ChildrenProps>
		const headerCell = React.Children.toArray(
			headerRow.props.children,
		)[0] as React.ReactElement<ChildrenProps>
		const headerButton = React.Children.only(
			headerCell.props.children,
		) as React.ReactElement<ClickableProps>

		headerButton.props.onClick?.(undefined as never)

		const paginationTree = Pagination({
			pageIndex: 1,
			pageSize: 5,
			totalItems: 12,
			onPageChange,
		}) as React.ReactElement<ChildrenProps>
		const paginationChildren = React.Children.toArray(
			paginationTree.props.children,
		) as React.ReactElement[]
		const paginationActions =
			paginationChildren[1] as React.ReactElement<ChildrenProps>
		const paginationButtons = React.Children.toArray(
			paginationActions.props.children,
		) as React.ReactElement[]
		const previousButton =
			paginationButtons[0] as React.ReactElement<ClickableProps>
		const nextButton =
			paginationButtons[2] as React.ReactElement<ClickableProps>

		previousButton.props.onClick?.(undefined as never)
		nextButton.props.onClick?.(undefined as never)

		expect(onSort).toHaveBeenCalledWith("name")
		expect(onPageChange).toHaveBeenNthCalledWith(1, 0)
		expect(onPageChange).toHaveBeenNthCalledWith(2, 2)
		expect(
			Pagination({
				pageIndex: 0,
				pageSize: 10,
				totalItems: 8,
				onPageChange,
			}),
		).toBeNull()
		expect(
			DataTable({
				columns: [{ id: "name", header: "Nation", cell: (row) => row.name }],
				rows: [],
				rowKey: (row) => row.id,
				empty: "No rows",
			}),
		).toBeTruthy()
	})

	it("builds shared fade animation classes", () => {
		expect(fadeVisibilityClassName(true, "panel")).toContain(
			"transition-opacity duration-150 ease-out opacity-100 panel",
		)
		expect(fadeBackdropClassName(false, "backdrop")).toContain(
			"pointer-events-none opacity-0 bg-slate-950/20 backdrop",
		)
	})
})

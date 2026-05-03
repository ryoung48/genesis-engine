import type React from "react"

export interface DataTableColumn<Row> {
	id: string
	header: React.ReactNode
	cell: (row: Row) => React.ReactNode
	align?: "start" | "end"
	sortable?: boolean
	sortLabel?: string
}

interface DataTableSortState {
	columnId: string
	direction: "asc" | "desc"
}

interface DataTableProps<Row> {
	columns: ReadonlyArray<DataTableColumn<Row>>
	rows: ReadonlyArray<Row>
	rowKey: (row: Row) => React.Key
	sort?: DataTableSortState
	onSort?: (columnId: string) => void
	empty?: React.ReactNode
}

export function DataTable<Row>({
	columns,
	rows,
	rowKey,
	sort,
	onSort,
	empty = "No rows",
}: DataTableProps<Row>) {
	if (rows.length === 0) {
		return <div className="font-mono text-[11px] text-slate-950">{empty}</div>
	}

	return (
		<div className="overflow-x-auto">
			<table className="min-w-full border-collapse text-left font-mono text-[11px] text-slate-950">
				<thead>
					<tr className="border-b border-slate-200">
						{columns.map((column) => {
							const isSorted = sort?.columnId === column.id
							const directionLabel =
								isSorted && sort
									? sort.direction === "asc"
										? " ascending"
										: " descending"
									: ""

							return (
								<th
									key={column.id}
									className={`px-2 py-1 font-medium ${column.align === "end" ? "text-right" : "text-left"}`}
								>
									{column.sortable && onSort ? (
										<button
											type="button"
											onClick={() => onSort(column.id)}
											className="inline-flex items-center gap-1 hover:underline"
											aria-label={`${column.sortLabel ?? String(column.header)}${directionLabel}`}
										>
											<span>{column.header}</span>
											{isSorted ? (
												<span aria-hidden="true">
													{sort.direction === "asc" ? "↑" : "↓"}
												</span>
											) : null}
										</button>
									) : (
										column.header
									)}
								</th>
							)
						})}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={rowKey(row)} className="border-b border-slate-100">
							{columns.map((column) => (
								<td
									key={column.id}
									className={`px-2 py-1 ${column.align === "end" ? "text-right" : "text-left"}`}
								>
									{column.cell(row)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

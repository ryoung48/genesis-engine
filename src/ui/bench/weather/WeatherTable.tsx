import { useState } from "react"
import { WEATHER_BENCH_FORMAT } from "@/ui/bench/weather/format"
import type {
	WeatherBenchRow,
	WeatherBenchSort,
	WeatherBenchTableProps,
} from "@/ui/bench/weather/types"
import type { DataTableColumn } from "@/ui/components/primitives/DataTable"
import { DataTable } from "@/ui/components/primitives/DataTable"
export function WeatherTable({ table }: WeatherBenchTableProps) {
	const [sort, setSort] = useState<WeatherBenchSort | null>(null)
	const columns = table.columns.map(
		(column): DataTableColumn<WeatherBenchRow> => ({
			id: column.id,
			header: column.label,
			cell: (row) => row.cells[column.id],
			sortable: true,
			align: [
				"category",
				"range",
				"condition",
				"stage",
				"metric",
				"pair",
				"bin",
			].includes(column.id)
				? "start"
				: "end",
		}),
	)
	const rows = sort
		? [...table.rows].sort((a, b) =>
				WEATHER_BENCH_FORMAT.compare({
					a: a.cells[sort.columnId] ?? "",
					b: b.cells[sort.columnId] ?? "",
					direction: sort.direction === "asc" ? 1 : -1,
				}),
			)
		: table.rows
	return (
		<DataTable
			columns={columns}
			rows={rows}
			rowKey={(row) => row.id}
			sort={sort ?? undefined}
			onSort={(columnId) =>
				setSort(
					sort?.columnId === columnId
						? sort.direction === "asc"
							? { columnId, direction: "desc" }
							: null
						: { columnId, direction: "asc" },
				)
			}
			empty="No measurements recorded for this selection."
		/>
	)
}

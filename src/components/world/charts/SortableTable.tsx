import React, { useMemo, useState } from "react"

export type Column<T> = {
	header: string
	accessor: (item: T) => React.ReactNode
	sortValue?: (item: T) => number | string
	className?: string
}

interface SortableTableProps<T> {
	data: T[]
	columns: Column<T>[]
	pageSize?: number
	initialSort?: {
		key: number // Index of column
		direction: "asc" | "desc"
	}
}

export const SortableTable = <T,>({
	data,
	columns,
	pageSize = 10,
	initialSort,
}: SortableTableProps<T>) => {
	const [currentPage, setCurrentPage] = useState(0)
	const [sortConfig, setSortConfig] = useState<{
		key: number
		direction: "asc" | "desc"
	} | null>(initialSort || null)

	const sortedData = useMemo(() => {
		if (!sortConfig) return data

		const sorted = [...data].sort((a, b) => {
			const col = columns[sortConfig.key]
			if (!col.sortValue) return 0

			const aVal = col.sortValue(a)
			const bVal = col.sortValue(b)

			if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1
			if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1
			return 0
		})

		return sorted
	}, [data, sortConfig, columns])

	const pageCount = Math.ceil(sortedData.length / pageSize)
	const paginatedData = sortedData.slice(
		currentPage * pageSize,
		(currentPage + 1) * pageSize,
	)

	const handleSort = (colIndex: number) => {
		if (!columns[colIndex].sortValue) return

		setSortConfig((current) => {
			if (current?.key === colIndex) {
				return {
					key: colIndex,
					direction: current.direction === "asc" ? "desc" : "asc",
				}
			}
			return { key: colIndex, direction: "asc" }
		})
	}

	return (
		<div className="flex flex-col h-full">
			<div className="overflow-x-auto">
				<table className="w-full text-left border-collapse">
					<thead>
						<tr className="border-b border-gray-200">
							{columns.map((col, idx) => (
								<th
									key={idx}
									className={`py-2 px-2 text-[10px] uppercase font-bold text-gray-400 bg-gray-50 sticky top-0 z-10 ${
										col.sortValue ? "cursor-pointer hover:bg-gray-100" : ""
									} ${col.className || ""}`}
									onClick={() => handleSort(idx)}
								>
									<div className="flex items-center gap-1">
										{col.header}
										{sortConfig?.key === idx && (
											<span>{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
										)}
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{paginatedData.map((item, rowIdx) => (
							<tr
								key={rowIdx}
								className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
							>
								{columns.map((col, colIdx) => (
									<td
										key={colIdx}
										className={`py-1.5 px-2 text-xs ${col.className || ""}`}
									>
										{col.accessor(item)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{pageCount > 1 && (
				<div className="flex justify-between items-center mt-2 px-2 py-1 border-t border-gray-100">
					<button
						disabled={currentPage === 0}
						onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
						className="text-[10px] uppercase font-bold text-gray-500 disabled:text-gray-300 hover:text-gray-800 disabled:hover:text-gray-300"
					>
						Prev
					</button>
					<span className="text-[10px] text-gray-400">
						Page {currentPage + 1} of {pageCount}
					</span>
					<button
						disabled={currentPage === pageCount - 1}
						onClick={() =>
							setCurrentPage((p) => Math.min(pageCount - 1, p + 1))
						}
						className="text-[10px] uppercase font-bold text-gray-500 disabled:text-gray-300 hover:text-gray-800 disabled:hover:text-gray-300"
					>
						Next
					</button>
				</div>
			)}
		</div>
	)
}

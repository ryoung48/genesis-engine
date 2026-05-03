import React from "react"
import { cx } from "../lib"
import { Button } from "./Button"

interface PaginationProps {
	pageIndex: number
	pageSize: number
	totalItems: number
	onPageChange: (pageIndex: number) => void
	className?: string
}

export const Pagination: React.FC<PaginationProps> = ({
	pageIndex,
	pageSize,
	totalItems,
	onPageChange,
	className,
}) => {
	const pageCount = Math.ceil(totalItems / Math.max(1, pageSize))

	if (pageCount <= 1) {
		return null
	}

	const start = pageIndex * pageSize + 1
	const end = Math.min(totalItems, (pageIndex + 1) * pageSize)

	return (
		<div className={cx("flex items-center justify-between gap-2", className)}>
			<span className="font-mono text-[10px] text-slate-500">
				{start}-{end} of {totalItems}
			</span>
			<div className="flex items-center gap-1.5">
				<Button
					tone="panel"
					size="sm"
					shape="pill"
					onClick={() => onPageChange(pageIndex - 1)}
					disabled={pageIndex <= 0}
					title="Previous page"
				>
					Prev
				</Button>
				<span className="font-mono text-[10px] text-slate-500">
					{pageIndex + 1}/{pageCount}
				</span>
				<Button
					tone="panel"
					size="sm"
					shape="pill"
					onClick={() => onPageChange(pageIndex + 1)}
					disabled={pageIndex >= pageCount - 1}
					title="Next page"
				>
					Next
				</Button>
			</div>
		</div>
	)
}

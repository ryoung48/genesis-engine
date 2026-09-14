import React from "react"
import type {
	SystemFilterCondition,
	SystemFilterField,
	SystemFilterGroup,
	SystemFilterNode,
	SystemFilterOptions,
	SystemFilterRoot,
} from "@/ui/wiki/system-filter/types"

interface SystemFilterBuilderProps {
	value: SystemFilterRoot
	onChange: (value: SystemFilterRoot) => void
	options: SystemFilterOptions
	disabled: boolean
}

const FIELD_LABELS: Record<SystemFilterField, string> = {
	systemBodyCount: "System body count",
	starSpectralClass: "Star spectral class",
	starLuminosityClass: "Star luminosity class",
	starYouth: "Star age",
	starCount: "Star count",
	bodyType: "Body type",
	bodyClassification: "Body classification",
	bodyComposition: "Body composition",
	bodyZone: "Body zone",
	bodyTemperature: "Body temperature",
	bodyHydrosphere: "Body hydrosphere",
	bodyAtmosphere: "Body atmosphere",
	bodyBiosphere: "Body biosphere",
	bodyHabitability: "Body habitability",
	bodySpecialCircumstance: "Body special circumstance",
}

const FIELDS = Object.keys(FIELD_LABELS) as SystemFilterField[]

function isOrdinalField(field: SystemFilterField): boolean {
	return (
		field.endsWith("Temperature") ||
		field.endsWith("Hydrosphere") ||
		field.endsWith("Atmosphere") ||
		field.endsWith("Biosphere") ||
		field.endsWith("Habitability")
	)
}

function defaultCondition(): SystemFilterCondition {
	return {
		kind: "condition",
		id: crypto.randomUUID(),
		field: "systemBodyCount",
		comparison: "greaterThan",
		value: 10,
	}
}

function defaultGroup(): SystemFilterGroup {
	return { kind: "group", id: crypto.randomUUID(), operator: "and", nodes: [] }
}

function optionsForField(
	field: SystemFilterField,
	options: SystemFilterOptions,
): readonly string[] {
	switch (field) {
		case "starSpectralClass":
			return options.spectralClasses
		case "starLuminosityClass":
			return options.luminosityClasses
		case "starYouth":
			return ["proto", "primordial"]
		case "starCount":
			return ["1", "2", "3", "4+"]
		case "bodyType":
			return ["planet", "moon"]
		case "bodyClassification":
			return options.classifications
		case "bodyZone":
			return options.zones
		case "bodyComposition":
			return options.compositionClasses
		case "bodyTemperature":
			return options.temperatureClasses
		case "bodyHydrosphere":
			return options.hydrosphereClasses
		case "bodyAtmosphere":
			return options.atmosphereClasses
		case "bodyBiosphere":
			return options.biosphereClasses
		case "bodyHabitability":
			return options.habitabilityClasses
		case "bodySpecialCircumstance":
			return options.specialCircumstances
		case "systemBodyCount":
			return []
	}
}

function updateNode(
	node: SystemFilterNode,
	updated: SystemFilterNode,
): SystemFilterNode {
	if (node.id === updated.id) return updated
	if (node.kind === "condition") return node
	return {
		...node,
		nodes: node.nodes.map((child) => updateNode(child, updated)),
	}
}

function removeNode(node: SystemFilterGroup, id: string): SystemFilterGroup {
	return {
		...node,
		nodes: node.nodes
			.filter((child) => child.id !== id)
			.map((child) => (child.kind === "group" ? removeNode(child, id) : child)),
	}
}

interface GroupEditorProps extends SystemFilterBuilderProps {
	group: SystemFilterGroup
	root: boolean
	onRemove: (() => void) | null
}

const GroupEditor: React.FC<GroupEditorProps> = ({
	group,
	value,
	onChange,
	options,
	disabled,
	root,
	onRemove,
}) => {
	const updateGroup = (updated: SystemFilterGroup) =>
		onChange(updateNode(value, updated) as SystemFilterRoot)
	const addNode = (node: SystemFilterNode) =>
		updateGroup({ ...group, nodes: [...group.nodes, node] })
	return (
		<div
			className={
				root
					? "space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 shadow-sm"
					: "space-y-2 rounded-md border border-slate-200 bg-white p-2"
			}
		>
			<div className="flex items-center justify-between gap-1.5">
				<span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
					{root ? "Rule builder" : "Nested group"}
				</span>
				<select
					value={group.operator}
					disabled={disabled}
					onChange={(event) =>
						updateGroup({
							...group,
							operator: event.target.value as SystemFilterGroup["operator"],
						})
					}
					aria-label="Group operator"
					className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 shadow-sm disabled:bg-slate-100"
				>
					<option value="and">Match all (AND)</option>
					<option value="or">Match any (OR)</option>
				</select>
				{onRemove ? (
					<button
						type="button"
						disabled={disabled}
						onClick={onRemove}
						aria-label="Remove group"
						className="rounded px-1 text-slate-400 transition-colors hover:text-slate-700 disabled:text-slate-200"
					>
						×
					</button>
				) : null}
			</div>
			{group.nodes.map((node) =>
				node.kind === "group" ? (
					<GroupEditor
						key={node.id}
						group={node}
						value={value}
						onChange={onChange}
						options={options}
						disabled={disabled}
						root={false}
						onRemove={() =>
							onChange(removeNode(value, node.id) as SystemFilterRoot)
						}
					/>
				) : (
					<ConditionEditor
						key={node.id}
						condition={node}
						options={options}
						disabled={disabled}
						onChange={(updated) =>
							onChange(updateNode(value, updated) as SystemFilterRoot)
						}
						onRemove={() =>
							onChange(removeNode(value, node.id) as SystemFilterRoot)
						}
					/>
				),
			)}
			<div className="flex gap-1.5 border-t border-slate-200 pt-2">
				<button
					type="button"
					disabled={disabled}
					onClick={() => addNode(defaultCondition())}
					className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 disabled:text-slate-300"
				>
					+ Condition
				</button>
				<button
					type="button"
					disabled={disabled}
					onClick={() => addNode(defaultGroup())}
					className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 disabled:text-slate-300"
				>
					+ Group
				</button>
			</div>
		</div>
	)
}

interface ConditionEditorProps {
	condition: SystemFilterCondition
	options: SystemFilterOptions
	disabled: boolean
	onChange: (condition: SystemFilterCondition) => void
	onRemove: () => void
}

const ConditionEditor: React.FC<ConditionEditorProps> = ({
	condition,
	options,
	disabled,
	onChange,
	onRemove,
}) => {
	const values = optionsForField(condition.field, options)
	const isCount = condition.field === "systemBodyCount"
	const hasComparison = true
	return (
		<div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1.5 shadow-sm">
			<select
				value={condition.field}
				disabled={disabled}
				onChange={(event) => {
					const field = event.target.value as SystemFilterField
					const nextValues = optionsForField(field, options)
					onChange({
						...condition,
						field,
						comparison: field === "systemBodyCount" ? "greaterThan" : "is",
						value: field === "systemBodyCount" ? 10 : (nextValues[0] ?? ""),
					})
				}}
				aria-label="Filter field"
				className="min-w-32 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 disabled:bg-slate-100"
			>
				{FIELDS.map((field) => (
					<option key={field} value={field}>
						{FIELD_LABELS[field]}
					</option>
				))}
			</select>
			{hasComparison ? (
				<select
					value={condition.comparison}
					disabled={disabled}
					onChange={(event) =>
						onChange({
							...condition,
							comparison: event.target
								.value as SystemFilterCondition["comparison"],
						})
					}
					aria-label="Filter comparison"
					className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 disabled:bg-slate-100"
				>
					<option value="is">equals</option>
					<option value="isNot">does not equal</option>
					{isCount || isOrdinalField(condition.field) ? (
						<>
							<option value="greaterThan">more than</option>
							<option value="lessThan">less than</option>
						</>
					) : null}
				</select>
			) : null}
			{isCount ? (
				<input
					type="number"
					min="0"
					step="1"
					value={condition.value}
					disabled={disabled}
					onChange={(event) =>
						onChange({
							...condition,
							value: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
						})
					}
					aria-label="System body count"
					className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 disabled:bg-slate-100"
				/>
			) : (
				<select
					value={condition.value}
					disabled={disabled || values.length === 0}
					onChange={(event) =>
						onChange({ ...condition, value: event.target.value })
					}
					aria-label="Filter value"
					className="min-w-24 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 disabled:bg-slate-100"
				>
					{values.map((value) => (
						<option key={value} value={value}>
							{value}
						</option>
					))}
				</select>
			)}
			<button
				type="button"
				disabled={disabled}
				onClick={onRemove}
				aria-label="Remove condition"
				className="px-1 text-slate-400 hover:text-slate-700 disabled:text-slate-200"
			>
				×
			</button>
		</div>
	)
}

export const SystemFilterBuilder: React.FC<SystemFilterBuilderProps> = (
	props,
) => <GroupEditor {...props} group={props.value} root onRemove={null} />

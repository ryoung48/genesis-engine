import {
	ATMOSPHERE_CATEGORIES,
	BIOSPHERE_CATEGORIES,
	countSystemBodies,
	HABITABILITY_CATEGORY_LABELS,
	HYDROSPHERE_CATEGORIES,
	TEMPERATURE_CATEGORIES,
} from "@/ui/wiki/stats/galaxy/galaxy-body-distributions"
import type {
	SystemFilterBodyPair,
	SystemFilterCondition,
	SystemFilterData,
	SystemFilterNode,
	SystemFilterRoot,
} from "@/ui/wiki/system-filter/types"

export function findBodyClassificationConditions(
	node: SystemFilterNode,
): { bodyKind: "planet" | "moon"; classification: string }[] {
	if (node.kind === "group") {
		return node.nodes.flatMap(findBodyClassificationConditions)
	}
	if (node.field === "planetClassification" && typeof node.value === "string") {
		return [{ bodyKind: "planet", classification: node.value }]
	}
	if (node.field === "moonClassification" && typeof node.value === "string") {
		return [{ bodyKind: "moon", classification: node.value }]
	}
	return []
}

function isBodyField(field: SystemFilterCondition["field"]): boolean {
	return field.startsWith("planet") || field.startsWith("moon")
}

function isMatchingBodyKind(
	field: SystemFilterCondition["field"],
	bodyKind: "planet" | "moon",
): boolean {
	return field.startsWith(bodyKind)
}

export function hasBodyFilter(node: SystemFilterNode): boolean {
	return node.kind === "condition"
		? isBodyField(node.field)
		: node.nodes.some(hasBodyFilter)
}

export function hasBodyFilterForKind(
	node: SystemFilterNode,
	bodyKind: "planet" | "moon",
): boolean {
	return node.kind === "condition"
		? isMatchingBodyKind(node.field, bodyKind)
		: node.nodes.some((child) => hasBodyFilterForKind(child, bodyKind))
}

export function matchesBodyFilter(
	node: SystemFilterNode,
	bodyKind: "planet" | "moon",
	pair: SystemFilterBodyPair,
): boolean {
	if (node.kind === "condition") {
		return !isMatchingBodyKind(node.field, bodyKind)
			? true
			: matchesBodyPair(pair, node)
	}
	const bodyNodes = node.nodes.filter((child) =>
		hasBodyFilterForKind(child, bodyKind),
	)
	if (bodyNodes.length === 0) return true
	return node.operator === "and"
		? bodyNodes.every((child) => matchesBodyFilter(child, bodyKind, pair))
		: bodyNodes.some((child) => matchesBodyFilter(child, bodyKind, pair))
}

function matchesCategory(
	actual: string | undefined,
	condition: SystemFilterCondition,
	categories: readonly string[],
): boolean {
	if (actual === undefined) return false
	if (condition.comparison === "is") return actual === condition.value
	if (condition.comparison === "isNot") return actual !== condition.value
	const actualIndex = categories.indexOf(actual)
	const expectedIndex = categories.indexOf(String(condition.value))
	if (actualIndex < 0 || expectedIndex < 0) return false
	return condition.comparison === "greaterThan"
		? actualIndex > expectedIndex
		: actualIndex < expectedIndex
}

function matchesValue(
	actual: string,
	condition: SystemFilterCondition,
): boolean {
	return condition.comparison === "isNot"
		? actual !== condition.value
		: actual === condition.value
}

function matchesBodyPair(
	pair: SystemFilterBodyPair,
	condition: SystemFilterCondition,
): boolean {
	switch (condition.field) {
		case "planetClassification":
		case "moonClassification":
			return matchesValue(pair.classification, condition)
		case "planetZone":
			return condition.comparison === "isNot"
				? pair.zone !== condition.value
				: pair.zone === condition.value
		case "planetTemperature":
		case "moonTemperature":
			return matchesCategory(
				pair.temperatureClass,
				condition,
				TEMPERATURE_CATEGORIES,
			)
		case "planetHydrosphere":
		case "moonHydrosphere":
			return matchesCategory(
				pair.hydrosphereClass,
				condition,
				HYDROSPHERE_CATEGORIES,
			)
		case "planetAtmosphere":
		case "moonAtmosphere":
			if (condition.value === "Breathable") return pair.breathable
			return matchesCategory(
				pair.atmosphereClass,
				condition,
				ATMOSPHERE_CATEGORIES,
			)
		case "planetBiosphere":
		case "moonBiosphere":
			return matchesCategory(
				pair.biosphereClass,
				condition,
				BIOSPHERE_CATEGORIES,
			)
		case "planetHabitability":
		case "moonHabitability":
			return matchesCategory(
				pair.habitabilityClass,
				condition,
				HABITABILITY_CATEGORY_LABELS,
			)
		case "planetSpecialCircumstance":
		case "moonSpecialCircumstance":
			return condition.comparison === "isNot"
				? !pair.specialCircumstances.includes(condition.value as never)
				: pair.specialCircumstances.includes(condition.value as never)
		default:
			return false
	}
}

function matchesCondition(
	condition: SystemFilterCondition,
	data: SystemFilterData,
	systemIndex: number,
): boolean {
	if (condition.field === "systemBodyCount") {
		const system = data.systems?.find(
			(entry) => entry.systemIndex === systemIndex,
		)
		if (!system) return false
		const count = countSystemBodies(system)
		const threshold = Number(condition.value)
		if (condition.comparison === "is") return count === threshold
		if (condition.comparison === "isNot") return count !== threshold
		return condition.comparison === "greaterThan"
			? count > threshold
			: count < threshold
	}
	const stars = data.starEntries.find(
		(entry) => entry.systemIndex === systemIndex,
	)?.stars
	if (stars) {
		switch (condition.field) {
			case "starSpectralClass":
				return stars.some((star) => matchesValue(star.spectralClass, condition))
			case "starLuminosityClass":
				return stars.some((star) =>
					matchesValue(star.luminosityClass, condition),
				)
			case "starYouth":
				return stars.some((star) =>
					condition.comparison === "isNot"
						? !(condition.value === "proto" ? star.proto : star.primordial)
						: condition.value === "proto"
							? star.proto
							: star.primordial,
				)
			case "starCount": {
				const matchesCount =
					condition.value === "4+"
						? stars.length >= 4
						: stars.length === Number(condition.value)
				return condition.comparison === "isNot" ? !matchesCount : matchesCount
			}
		}
	}
	const bodyEntry = data.bodyEntries?.find(
		(entry) => entry.systemIndex === systemIndex,
	)
	if (!bodyEntry) return false
	const pairs = condition.field.startsWith("planet")
		? bodyEntry.planetClassificationTemperaturePairs
		: bodyEntry.moonClassificationTemperaturePairs
	return pairs.some((pair) => matchesBodyPair(pair, condition))
}

function matchesNode(
	node: SystemFilterNode,
	data: SystemFilterData,
	systemIndex: number,
): boolean {
	if (node.kind === "condition")
		return matchesCondition(node, data, systemIndex)
	if (node.nodes.length === 0) return true
	if (node.operator === "or")
		return node.nodes.some((child) => matchesNode(child, data, systemIndex))
	const planetConditions = node.nodes.filter(
		(child) => child.kind === "condition" && child.field.startsWith("planet"),
	) as SystemFilterCondition[]
	const moonConditions = node.nodes.filter(
		(child) => child.kind === "condition" && child.field.startsWith("moon"),
	) as SystemFilterCondition[]
	const remainingNodes = node.nodes.filter(
		(child) =>
			child.kind === "group" ||
			(!child.field.startsWith("planet") && !child.field.startsWith("moon")),
	)
	const bodyEntry = data.bodyEntries?.find(
		(entry) => entry.systemIndex === systemIndex,
	)
	const matchesPlanets =
		planetConditions.length === 0 ||
		bodyEntry?.planetClassificationTemperaturePairs.some((pair) =>
			planetConditions.every((condition) => matchesBodyPair(pair, condition)),
		) === true
	const matchesMoons =
		moonConditions.length === 0 ||
		bodyEntry?.moonClassificationTemperaturePairs.some((pair) =>
			moonConditions.every((condition) => matchesBodyPair(pair, condition)),
		) === true
	return (
		matchesPlanets &&
		matchesMoons &&
		remainingNodes.every((child) => matchesNode(child, data, systemIndex))
	)
}

export function filterSystemIndices(
	root: SystemFilterRoot,
	data: SystemFilterData,
): number[] | null {
	if (root.nodes.length === 0) return null
	const systemIndices = new Set<number>(
		data.starEntries.map((entry) => entry.systemIndex),
	)
	for (const system of data.systems ?? []) systemIndices.add(system.systemIndex)
	return [...systemIndices].filter((systemIndex) =>
		matchesNode(root, data, systemIndex),
	)
}

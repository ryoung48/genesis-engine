import {
	ATMOSPHERE_CATEGORIES,
	BIOSPHERE_CATEGORIES,
	countSystemBodies,
	HABITABILITY_CATEGORY_LABELS,
	HYDROSPHERE_CATEGORIES,
	TEMPERATURE_CATEGORIES,
} from "@/ui/wiki/stats/galaxy/galaxy-body-distributions"
import type {
	SystemFilterBodyEntry,
	SystemFilterBodyPair,
	SystemFilterCondition,
	SystemFilterData,
	SystemFilterGroup,
	SystemFilterNode,
	SystemFilterRoot,
	SystemFilterStarMatchInput,
	SystemFilterStarNodeMatchInput,
} from "@/ui/wiki/system-filter/types"

function bodyKindsInGroup(group: SystemFilterGroup): ("planet" | "moon")[] {
	let kinds: ("planet" | "moon")[] = ["planet", "moon"]
	for (const child of group.nodes) {
		if (child.kind !== "condition" || child.field !== "bodyType") continue
		if (child.comparison === "isNot") {
			kinds = kinds.filter((kind) => kind !== child.value)
		} else {
			kinds = kinds.filter((kind) => kind === child.value)
		}
	}
	return kinds
}

export function findBodyClassificationConditions(
	node: SystemFilterNode,
): { bodyKind: "planet" | "moon"; classification: string }[] {
	if (node.kind === "group") {
		if (node.operator === "or") {
			return node.nodes.flatMap(findBodyClassificationConditions)
		}
		const kinds = bodyKindsInGroup(node)
		const direct = node.nodes.flatMap((child) =>
			child.kind === "condition" &&
			child.field === "bodyClassification" &&
			typeof child.value === "string"
				? kinds.map((bodyKind) => ({
						bodyKind,
						classification: child.value as string,
					}))
				: [],
		)
		const nested = node.nodes
			.filter((child) => child.kind === "group")
			.flatMap(findBodyClassificationConditions)
		return [...direct, ...nested]
	}
	if (node.field === "bodyClassification" && typeof node.value === "string") {
		return [
			{ bodyKind: "planet", classification: node.value },
			{ bodyKind: "moon", classification: node.value },
		]
	}
	return []
}

function isBodyField(field: SystemFilterCondition["field"]): boolean {
	return field.startsWith("body")
}

function taggedBodyPairs(entry: SystemFilterBodyEntry): {
	kind: "planet" | "moon"
	pair: SystemFilterBodyPair
}[] {
	return [
		...entry.planetClassificationTemperaturePairs.map((pair) => ({
			kind: "planet" as const,
			pair,
		})),
		...entry.moonClassificationTemperaturePairs.map((pair) => ({
			kind: "moon" as const,
			pair,
		})),
	]
}

function isStarAttributeField(field: SystemFilterCondition["field"]): boolean {
	return (
		field === "starSpectralClass" ||
		field === "starLuminosityClass" ||
		field === "starYouth"
	)
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
	if (node.kind === "condition") {
		if (!isBodyField(node.field)) return false
		if (node.field !== "bodyType") return true
		return node.comparison === "isNot"
			? node.value !== bodyKind
			: node.value === bodyKind
	}
	return node.nodes.some((child) => hasBodyFilterForKind(child, bodyKind))
}

export function matchesBodyFilter(
	node: SystemFilterNode,
	bodyKind: "planet" | "moon",
	pair: SystemFilterBodyPair,
): boolean {
	if (node.kind === "condition") {
		return !isBodyField(node.field)
			? true
			: matchesBodyPair(pair, node, bodyKind)
	}
	const bodyNodes = node.nodes.filter(hasBodyFilter)
	if (bodyNodes.length === 0) return true
	return node.operator === "and"
		? bodyNodes.every((child) => matchesBodyFilter(child, bodyKind, pair))
		: bodyNodes.some((child) => matchesBodyFilter(child, bodyKind, pair))
}

export function hasStarAttributeFilter(node: SystemFilterNode): boolean {
	return node.kind === "condition"
		? isStarAttributeField(node.field)
		: node.nodes.some(hasStarAttributeFilter)
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

function matchesStar({ star, condition }: SystemFilterStarMatchInput): boolean {
	switch (condition.field) {
		case "starSpectralClass":
			return matchesValue(star.spectralClass, condition)
		case "starLuminosityClass":
			return matchesValue(star.luminosityClass, condition)
		case "starYouth":
			return condition.comparison === "isNot"
				? !(condition.value === "proto" ? star.proto : star.primordial)
				: condition.value === "proto"
					? star.proto
					: star.primordial
		default:
			return false
	}
}

export function matchesStarFilter({
	node,
	star,
}: SystemFilterStarNodeMatchInput): boolean {
	if (node.kind === "condition") {
		return (
			!isStarAttributeField(node.field) ||
			matchesStar({ star, condition: node })
		)
	}
	const starNodes = node.nodes.filter(hasStarAttributeFilter)
	if (starNodes.length === 0) return true
	return node.operator === "and"
		? starNodes.every((child) => matchesStarFilter({ node: child, star }))
		: starNodes.some((child) => matchesStarFilter({ node: child, star }))
}

function matchesBodyPair(
	pair: SystemFilterBodyPair,
	condition: SystemFilterCondition,
	pairKind: "planet" | "moon",
): boolean {
	switch (condition.field) {
		case "bodyType":
			return matchesValue(pairKind, condition)
		case "bodyClassification":
			return matchesValue(pair.classification, condition)
		case "bodyComposition":
			if (pair.compositionClass === undefined) return false
			return matchesValue(pair.compositionClass, condition)
		case "bodyZone":
			return condition.comparison === "isNot"
				? pair.zone !== condition.value
				: pair.zone === condition.value
		case "bodyTemperature":
			return matchesCategory(
				pair.temperatureClass,
				condition,
				TEMPERATURE_CATEGORIES,
			)
		case "bodyHydrosphere":
			return matchesCategory(
				pair.hydrosphereClass,
				condition,
				HYDROSPHERE_CATEGORIES,
			)
		case "bodyAtmosphere":
			if (condition.value === "Breathable") return pair.breathable
			return matchesCategory(
				pair.atmosphereClass,
				condition,
				ATMOSPHERE_CATEGORIES,
			)
		case "bodyBiosphere":
			return matchesCategory(
				pair.biosphereClass,
				condition,
				BIOSPHERE_CATEGORIES,
			)
		case "bodyHabitability":
			return matchesCategory(
				pair.habitabilityClass,
				condition,
				HABITABILITY_CATEGORY_LABELS,
			)
		case "bodySpecialCircumstance":
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
			case "starLuminosityClass":
			case "starYouth":
				return stars.some((star) => matchesStar({ star, condition }))
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
	return taggedBodyPairs(bodyEntry).some(({ kind, pair }) =>
		matchesBodyPair(pair, condition, kind),
	)
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
	const bodyConditions = node.nodes.filter(
		(child) => child.kind === "condition" && isBodyField(child.field),
	) as SystemFilterCondition[]
	const starNodes = node.nodes.filter(hasStarAttributeFilter)
	const remainingNodes = node.nodes.filter(
		(child) =>
			child.kind === "group" ||
			(!isBodyField(child.field) && !isStarAttributeField(child.field)),
	)
	const stars = data.starEntries.find(
		(entry) => entry.systemIndex === systemIndex,
	)?.stars
	const bodyEntry = data.bodyEntries?.find(
		(entry) => entry.systemIndex === systemIndex,
	)
	const matchesBodies =
		bodyConditions.length === 0 ||
		(bodyEntry !== undefined &&
			taggedBodyPairs(bodyEntry).some(({ kind, pair }) =>
				bodyConditions.every((condition) =>
					matchesBodyPair(pair, condition, kind),
				),
			))
	const matchesStars =
		starNodes.length === 0 ||
		stars?.some((star) =>
			starNodes.every((node) => matchesStarFilter({ node, star })),
		) === true
	return (
		matchesBodies &&
		matchesStars &&
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

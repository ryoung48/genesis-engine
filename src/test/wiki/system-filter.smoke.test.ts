import { describe, expect, it } from "vitest"
import {
	filterSystemIndices,
	findBodyClassificationConditions,
	hasBodyFilterForKind,
} from "@/ui/wiki/system-filter/evaluate-system-filter"
import type {
	SystemFilterBodyPair,
	SystemFilterData,
	SystemFilterRoot,
} from "@/ui/wiki/system-filter/types"

const root: SystemFilterRoot = {
	kind: "group",
	id: "root",
	operator: "and",
	nodes: [
		{
			kind: "condition",
			id: "spectral-class",
			field: "starSpectralClass",
			comparison: "is",
			value: "G",
		},
		{
			kind: "condition",
			id: "luminosity-class",
			field: "starLuminosityClass",
			comparison: "is",
			value: "III",
		},
		{
			kind: "condition",
			id: "age",
			field: "starYouth",
			comparison: "is",
			value: "proto",
		},
	],
}

const data: SystemFilterData = {
	systems: null,
	bodyEntries: null,
	starEntries: [
		{
			systemIndex: 1,
			stars: [
				{
					spectralClass: "G",
					luminosityClass: "V",
					proto: false,
					primordial: false,
				},
				{
					spectralClass: "K",
					luminosityClass: "III",
					proto: true,
					primordial: true,
				},
			],
		},
		{
			systemIndex: 2,
			stars: [
				{
					spectralClass: "G",
					luminosityClass: "III",
					proto: true,
					primordial: true,
				},
			],
		},
	],
}

describe("filterSystemIndices", () => {
	it("requires class, luminosity, and age conditions to match one star", () => {
		expect(filterSystemIndices(root, data)).toEqual([2])
	})
})

function bodyPair(pair: Partial<SystemFilterBodyPair>): SystemFilterBodyPair {
	return {
		classification: "tectonic",
		compositionClass: undefined,
		zone: undefined,
		temperatureClass: undefined,
		hydrosphereClass: undefined,
		atmosphereClass: undefined,
		breathable: false,
		biosphereClass: undefined,
		habitabilityClass: undefined,
		specialCircumstances: [],
		...pair,
	}
}

const bodyData: SystemFilterData = {
	systems: null,
	starEntries: [
		{ systemIndex: 1, stars: [] },
		{ systemIndex: 2, stars: [] },
	],
	bodyEntries: [
		{
			systemIndex: 1,
			planetClassificationTemperaturePairs: [
				bodyPair({
					classification: "tectonic",
					compositionClass: "Mostly Rock",
					temperatureClass: "Temperate (0-30C)",
				}),
			],
			moonClassificationTemperaturePairs: [
				bodyPair({
					classification: "snowball",
					compositionClass: "Mostly Ice",
					temperatureClass: "Frozen (<-50C)",
				}),
			],
		},
		{
			systemIndex: 2,
			planetClassificationTemperaturePairs: [
				bodyPair({
					classification: "jovian",
					compositionClass: "Hydrogen-Helium Envelope",
					temperatureClass: "Cold (-50-0C)",
				}),
			],
			moonClassificationTemperaturePairs: [],
		},
	],
}

function bodyRoot(nodes: SystemFilterRoot["nodes"]): SystemFilterRoot {
	return { kind: "group", id: "root", operator: "and", nodes }
}

describe("unified body filters", () => {
	it("matches composition on either planets or moons without a body type", () => {
		const filter = bodyRoot([
			{
				kind: "condition",
				id: "composition",
				field: "bodyComposition",
				comparison: "is",
				value: "Mostly Ice",
			},
		])
		expect(filterSystemIndices(filter, bodyData)).toEqual([1])
	})

	it("scopes attribute conditions to a single body within an and group", () => {
		const filter = bodyRoot([
			{
				kind: "condition",
				id: "composition",
				field: "bodyComposition",
				comparison: "is",
				value: "Mostly Rock",
			},
			{
				kind: "condition",
				id: "temperature",
				field: "bodyTemperature",
				comparison: "is",
				value: "Frozen (<-50C)",
			},
		])
		expect(filterSystemIndices(filter, bodyData)).toEqual([])
	})

	it("narrows matches with a body type condition on the same body", () => {
		const moonOnly = bodyRoot([
			{
				kind: "condition",
				id: "kind",
				field: "bodyType",
				comparison: "is",
				value: "moon",
			},
			{
				kind: "condition",
				id: "composition",
				field: "bodyComposition",
				comparison: "is",
				value: "Mostly Rock",
			},
		])
		expect(filterSystemIndices(moonOnly, bodyData)).toEqual([])
		const planetOnly = bodyRoot([
			{
				kind: "condition",
				id: "kind",
				field: "bodyType",
				comparison: "is",
				value: "planet",
			},
			{
				kind: "condition",
				id: "composition",
				field: "bodyComposition",
				comparison: "is",
				value: "Mostly Rock",
			},
		])
		expect(filterSystemIndices(planetOnly, bodyData)).toEqual([1])
	})

	it("treats body type isNot as the other kind", () => {
		const filter = bodyRoot([
			{
				kind: "condition",
				id: "kind",
				field: "bodyType",
				comparison: "isNot",
				value: "planet",
			},
			{
				kind: "condition",
				id: "composition",
				field: "bodyComposition",
				comparison: "is",
				value: "Mostly Ice",
			},
		])
		expect(filterSystemIndices(filter, bodyData)).toEqual([1])
		const kindOnly = bodyRoot([
			{
				kind: "condition",
				id: "kind",
				field: "bodyType",
				comparison: "is",
				value: "planet",
			},
		])
		expect(hasBodyFilterForKind(kindOnly, "planet")).toBe(true)
		expect(hasBodyFilterForKind(kindOnly, "moon")).toBe(false)
	})

	it("derives classification selections from the body type in the same group", () => {
		const filter = bodyRoot([
			{
				kind: "condition",
				id: "kind",
				field: "bodyType",
				comparison: "is",
				value: "planet",
			},
			{
				kind: "condition",
				id: "classification",
				field: "bodyClassification",
				comparison: "is",
				value: "tectonic",
			},
		])
		expect(findBodyClassificationConditions(filter)).toEqual([
			{ bodyKind: "planet", classification: "tectonic" },
		])
		const unscoped = bodyRoot([
			{
				kind: "condition",
				id: "classification",
				field: "bodyClassification",
				comparison: "is",
				value: "tectonic",
			},
		])
		expect(findBodyClassificationConditions(unscoped)).toEqual([
			{ bodyKind: "planet", classification: "tectonic" },
			{ bodyKind: "moon", classification: "tectonic" },
		])
	})
})

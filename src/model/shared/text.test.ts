import { describe, expect, it } from "vitest"
import { capitalize, titleCase } from "./text"

describe("capitalize", () => {
	it("uppercases the first character", () => {
		expect(capitalize("example")).toBe("Example")
	})

	it("returns an empty string unchanged", () => {
		expect(capitalize("")).toBe("")
	})
})

describe("titleCase", () => {
	it("uppercases each space-delimited word", () => {
		expect(titleCase("cold north sea")).toBe("Cold North Sea")
	})
})

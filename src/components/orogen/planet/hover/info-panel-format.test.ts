import { describe, expect, it } from "vitest"
import {
	aetColor,
	currentImpactColor,
	dtrChartColor,
	flowColor,
	formatCompactNumber,
	gddColor,
	gintColor,
	petColor,
	rainColor,
	tempColor,
} from "./info-panel-format"

describe("formatCompactNumber", () => {
	it("formats billions", () => {
		expect(formatCompactNumber(1_500_000_000)).toBe("1.5B")
		expect(formatCompactNumber(10_000_000_000)).toBe("10B")
	})

	it("formats millions", () => {
		expect(formatCompactNumber(2_500_000)).toBe("2.5M")
		expect(formatCompactNumber(10_000_000)).toBe("10M")
	})

	it("formats thousands", () => {
		expect(formatCompactNumber(1_500)).toBe("1.5k")
		expect(formatCompactNumber(10_000)).toBe("10k")
	})

	it("formats small values with appropriate decimals", () => {
		expect(formatCompactNumber(500)).toBe("500")
		expect(formatCompactNumber(15)).toBe("15")
		expect(formatCompactNumber(1.5)).toBe("1.5")
		expect(formatCompactNumber(0.123)).toBe("0.12")
	})

	it("returns 0 for non-finite values", () => {
		expect(formatCompactNumber(Number.NaN)).toBe("0")
		expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toBe("0")
	})
})

describe("tempColor", () => {
	it("returns cold color for very low temperatures", () => {
		expect(tempColor(-30)).toBe("#6366f1")
		expect(tempColor(-20)).toBe("#818cf8") // boundary: -20 is not < -20
	})

	it("returns warm color for hot temperatures", () => {
		expect(tempColor(30)).toBe("#ef4444")
		expect(tempColor(100)).toBe("#ef4444")
	})

	it("returns mid-range color for temperate values", () => {
		expect(tempColor(15)).toBe("#fbbf24")
	})
})

describe("rainColor", () => {
	it("returns desert color for very low precipitation", () => {
		expect(rainColor(0)).toBe("#a16207")
	})

	it("returns wet color for high precipitation", () => {
		expect(rainColor(200)).toBe("#2563eb")
	})

	it("returns boundary color correctly at threshold", () => {
		expect(rainColor(10)).toBe("#65a30d") // 10 is not < 10
	})
})

describe("flowColor", () => {
	it("covers all buckets", () => {
		expect(flowColor(0)).toBe("#64748b")
		expect(flowColor(5)).toBe("#7dd3fc")
		expect(flowColor(50)).toBe("#38bdf8")
		expect(flowColor(500)).toBe("#0284c7")
		expect(flowColor(5000)).toBe("#1d4ed8")
	})
})

describe("currentImpactColor", () => {
	it("returns warm color for positive impact", () => {
		expect(currentImpactColor(1)).toBe("#f59e0b")
		expect(currentImpactColor(0)).toBe("#f59e0b")
	})

	it("returns cool color for negative impact", () => {
		expect(currentImpactColor(-1)).toBe("#38bdf8")
	})
})

describe("petColor", () => {
	it("covers cold to hot range", () => {
		expect(petColor(10)).toBe("#38bdf8")
		expect(petColor(200)).toBe("#ef4444")
	})
})

describe("aetColor", () => {
	it("covers dry to wet range", () => {
		expect(aetColor(5)).toBe("#a16207")
		expect(aetColor(200)).toBe("#2563eb")
	})
})

describe("gddColor", () => {
	it("covers low to high growing degree days", () => {
		expect(gddColor(0)).toBe("#64748b")
		expect(gddColor(600)).toBe("#ef4444")
	})
})

describe("gintColor", () => {
	it("covers all buckets", () => {
		expect(gintColor(0)).toBe("#64748b")
		expect(gintColor(7)).toBe("#67e8f9")
		expect(gintColor(12)).toBe("#fbbf24")
		expect(gintColor(20)).toBe("#f97316")
	})
})

describe("dtrChartColor", () => {
	it("covers all buckets", () => {
		expect(dtrChartColor(0)).toBe("#38bdf8")
		expect(dtrChartColor(6)).toBe("#67e8f9")
		expect(dtrChartColor(10)).toBe("#facc15")
		expect(dtrChartColor(14)).toBe("#fb923c")
		expect(dtrChartColor(20)).toBe("#ef4444")
	})
})

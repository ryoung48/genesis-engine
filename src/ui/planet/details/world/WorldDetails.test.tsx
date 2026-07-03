import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { WorldDetails } from "./WorldDetails"

function renderWorldDetails(
	overrides: Partial<React.ComponentProps<typeof WorldDetails>> = {},
) {
	return renderToStaticMarkup(
		<WorldDetails
			openSections={new Set(["planetary"])}
			onSectionToggle={vi.fn()}
			planetName="Velaryn"
			planetType="terrestrial"
			planetStats={[
				{ label: "Radius", value: "6,371 km" },
				{ label: "Sun", value: "G2V" },
				{ label: "Tilt", value: "—" },
				{ label: "Ecc", value: "-" },
				{ label: "Day", value: "  " },
				{ label: "Avg Temp", value: "15 C" },
				{ label: "Avg Rain", value: "900 mm" },
			]}
			worldPopulation={1_250_000}
			activeWarCount={12}
			cultureCount={145}
			heritageCount={28}
			religionCount={11}
			nationSizeDistribution={[{ label: "III", count: 1, color: "#abcdef" }]}
			conflictDistribution={[{ label: "Peace", count: 4, color: "#111111" }]}
			climateDistribution={[{ label: "Temperate", count: 6, color: "#333333" }]}
			vegetationDistribution={[{ label: "Forest", count: 7, color: "#444444" }]}
			topographyDistribution={[
				{ label: "Highland", count: 8, color: "#555555" },
			]}
			relationDistribution={[{ label: "Allied", count: 2, color: "#0000ff" }]}
			tradeGoodsDistribution={[
				{ label: "Lumber", count: 100, color: "#4a7c59" },
				{ label: "Fish", count: 50, color: "#4488aa" },
			]}
			governmentDistribution={[
				{ label: "Chiefdom", count: 3, color: "#cc8844" },
			]}
			religionDistribution={[
				{ label: "Animistic", count: 5, color: "#66cc66" },
				{ label: "Monotheistic", count: 3, color: "#7a9cc8" },
			]}
			{...overrides}
		/>,
	)
}

describe("WorldDetails", () => {
	it("renders filtered planetary and environmental details", () => {
		const planetaryMarkup = renderWorldDetails({
			openSections: new Set(["planetary"]),
		})
		const environmentalMarkup = renderWorldDetails({
			openSections: new Set(["environmental"]),
		})

		expect(planetaryMarkup).toContain("Radius")
		expect(planetaryMarkup).toContain("G2V")
		expect(planetaryMarkup).not.toContain("Tilt")
		expect(planetaryMarkup).not.toContain("Ecc")
		expect(planetaryMarkup).not.toContain(">Day<")
		expect(environmentalMarkup).toContain("Avg Temp")
		expect(environmentalMarkup).toContain("Climate")
		expect(environmentalMarkup).toContain("Vegetation")
		expect(environmentalMarkup).toContain("Topography")
	})

	it("renders location count and avg location area in planetary section", () => {
		const markup = renderWorldDetails({
			openSections: new Set(["planetary"]),
			planetStats: [
				{ label: "Radius", value: "6,371 km" },
				{ label: "Locations", value: "90" },
				{ label: "Avg Location Area", value: "12k km²" },
			],
		})

		expect(markup).toContain("Locations")
		expect(markup).toContain("90")
		expect(markup).toContain("Avg Location Area")
		expect(markup).toContain("12k km²")
	})

	it("renders all section titles and opens the correct section", () => {
		const sections: Array<[string, WorldSection]> = [
			["Planetary", "planetary"],
			["Environmental", "environmental"],
			["Social", "social"],
			["Trade Goods", "trade-goods"],
		]
		for (const [title, key] of sections) {
			const markup = renderWorldDetails({ openSections: new Set([key]) })
			expect(markup).toContain(title)
		}
	})

	it("renders social section with fallback values for null stats", () => {
		const markup = renderWorldDetails({
			openSections: new Set(["social"]),
			worldPopulation: null,
			activeWarCount: null,
			cultureCount: null,
			heritageCount: null,
			religionCount: null,
		})

		expect(markup).toContain("Population")
		expect(markup).toContain("N/A")
		expect(markup).toContain("Culture Count")
		expect(markup).toContain("Heritage Count")
		expect(markup).toContain("Religion Count")
		expect(markup).toContain("Nation Size")
		expect(markup).toContain("Religion")
		expect(markup).toContain("Conflicts")
		expect(markup).not.toContain("Avg Development")
		expect(markup).not.toContain("Nation Avg Dev")
		expect(markup).toContain("Relations")
	})

	it("renders trade goods distribution in trade-goods section", () => {
		const markup = renderWorldDetails({
			openSections: new Set(["trade-goods"]),
			tradeGoodsDistribution: [
				{ label: "Lumber", count: 200, color: "#4a7c59" },
				{ label: "Fish", count: 100, color: "#4488aa" },
			],
		})
		expect(markup).toContain("Trade Goods")
		expect(markup).toContain("Lumber")
		expect(markup).toContain("200")
		expect(markup).toContain("66.7%")
		expect(markup).toContain("Fish")
		expect(markup).toContain("100")
		expect(markup).toContain("33.3%")
	})
})

type WorldSection = "planetary" | "environmental" | "social" | "trade-goods"

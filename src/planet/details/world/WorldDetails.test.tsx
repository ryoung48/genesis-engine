import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { WorldDetails } from "./WorldDetails"

function renderWorldDetails(
	overrides: Partial<React.ComponentProps<typeof WorldDetails>> = {},
) {
	return renderToStaticMarkup(
		<WorldDetails
			section="planetary"
			onSectionChange={vi.fn()}
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
			faithCount={52}
			religionCount={11}
			nationSizeDistribution={[{ label: "III", count: 1, color: "#abcdef" }]}
			conflictDistribution={[{ label: "Peace", count: 4, color: "#111111" }]}
			climateDistribution={[{ label: "Temperate", count: 6, color: "#333333" }]}
			vegetationDistribution={[{ label: "Forest", count: 7, color: "#444444" }]}
			topographyDistribution={[
				{ label: "Highland", count: 8, color: "#555555" },
			]}
			relationDistribution={[{ label: "Allied", count: 2, color: "#0000ff" }]}
			{...overrides}
		/>,
	)
}

describe("WorldDetails", () => {
	it("renders filtered planetary and environmental details", () => {
		const planetaryMarkup = renderWorldDetails({ section: "planetary" })
		const environmentalMarkup = renderWorldDetails({ section: "environmental" })

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

	it("renders social fallbacks and toggles each section", () => {
		const onSectionChange = vi.fn()
		const element = WorldDetails({
			section: "social",
			onSectionChange,
			planetStats: [],
			worldPopulation: null,
			activeWarCount: null,
			cultureCount: null,
			heritageCount: null,
			faithCount: null,
			religionCount: null,
			nationSizeDistribution: [{ label: "III", count: 1, color: "#abcdef" }],
			conflictDistribution: [{ label: "Peace", count: 4, color: "#111111" }],
			climateDistribution: [{ label: "Temperate", count: 6, color: "#333333" }],
			vegetationDistribution: [{ label: "Forest", count: 7, color: "#444444" }],
			topographyDistribution: [
				{ label: "Highland", count: 8, color: "#555555" },
			],
			relationDistribution: [],
		}) as React.ReactElement<{ children?: React.ReactNode }>

		const sections = React.Children.toArray(element.props.children) as Array<
			React.ReactElement<{ onToggle: () => void; open: boolean; title: string }>
		>

		expect(
			sections.map((section) => [section.props.title, section.props.open]),
		).toEqual([
			["Planetary", false],
			["Environmental", false],
			["Social", true],
		])

		for (const section of sections) {
			section.props.onToggle()
		}

		expect(onSectionChange).toHaveBeenNthCalledWith(1, "planetary")
		expect(onSectionChange).toHaveBeenNthCalledWith(2, "environmental")
		expect(onSectionChange).toHaveBeenNthCalledWith(3, "social")

		const markup = renderWorldDetails({
			section: "social",
			worldPopulation: null,
			activeWarCount: null,
			cultureCount: null,
			heritageCount: null,
			faithCount: null,
			religionCount: null,
		})

		expect(markup).toContain("Population")
		expect(markup).toContain("N/A")
		expect(markup).toContain("Culture Count")
		expect(markup).toContain("Heritage Count")
		expect(markup).toContain("Faith Count")
		expect(markup).toContain("Religion Count")
		expect(markup).toContain("Nation Size")
		expect(markup).toContain("Conflicts")
		expect(markup).not.toContain("Avg Development")
		expect(markup).not.toContain("Nation Avg Dev")
		expect(markup).toContain("Relations")
	})
})

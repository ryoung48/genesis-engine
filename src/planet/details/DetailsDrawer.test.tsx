import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { DetailsDrawer } from "./DetailsDrawer"

function renderDrawer(
	overrides: Partial<React.ComponentProps<typeof DetailsDrawer>> = {},
) {
	return renderToStaticMarkup(
		<DetailsDrawer
			open
			onToggle={vi.fn()}
			nation={null}
			planetStats={[]}
			worldPopulation={null}
			activeWarCount={null}
			cultureCount={null}
			heritageCount={null}
			faithCount={null}
			religionCount={null}
			nationSizeDistribution={[]}
			conflictDistribution={[]}
			climateDistribution={[]}
			vegetationDistribution={[]}
			topographyDistribution={[]}
			relationDistribution={[]}
			{...overrides}
		/>,
	)
}

describe("DetailsDrawer", () => {
	it("renders a reopen button when the drawer is closed", () => {
		const markup = renderDrawer({ open: false })

		expect(markup).toContain('title="Show details"')
		expect(markup).toContain("absolute right-3 bottom-3")
		expect(markup).not.toContain("Hide details")
		expect(markup).not.toContain("Start simulation")
	})

	it("renders the drawer shell when open", () => {
		const markup = renderDrawer()

		expect(markup).toContain("DETAILS")
		expect(markup).toContain('title="Hide details"')
	})
})

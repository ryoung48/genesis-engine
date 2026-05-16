import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { DistributionChart } from "@/ui/components/composites/DistributionChart"
import { AccordionSection, DetailRow, formatPopulation } from "./shared"

describe("details shared helpers", () => {
	it("formats population across invalid, small, and large ranges", () => {
		expect(formatPopulation(-1)).toBe("0")
		expect(formatPopulation(523)).toBe("523")
		expect(formatPopulation(1_500)).toBe("1.5K")
		expect(formatPopulation(2_300_000)).toBe("2.3M")
		expect(formatPopulation(12_000_000_000)).toBe("12B")
	})

	it("renders detail rows, accordion states, and non-empty distributions", () => {
		const markup = renderToStaticMarkup(
			<>
				<DetailRow label="Population" value="1.5M" />
				<AccordionSection title="Open" open onToggle={vi.fn()}>
					<span>Visible body</span>
				</AccordionSection>
				<AccordionSection title="Closed" open={false} onToggle={vi.fn()}>
					<span>Hidden body</span>
				</AccordionSection>
				<DistributionChart
					title="Biomes"
					buckets={[
						{ label: "Forest", count: 3, color: "#0f0" },
						{ label: "Desert", count: 0, color: "#ff0" },
						{ label: "Tundra", count: 1, color: "#00f" },
					]}
				/>
			</>,
		)

		expect(markup).toContain("Population")
		expect(markup).toContain("1.5M")
		expect(markup).toContain("Visible body")
		expect(markup).not.toContain("Hidden body")
		expect(markup).toContain("rotate-180")
		expect(markup).toContain("overflow-hidden")
		expect(markup).toContain("rounded-none")
		expect(markup).toContain("Biomes")
		expect(markup).toContain("Forest (3, 75.0%)")
		expect(markup).toContain("Tundra (1, 25.0%)")
		expect(markup).not.toContain("Desert")
	})

	it("skips empty distributions", () => {
		expect(
			renderToStaticMarkup(
				<DistributionChart
					title="Empty"
					buckets={[{ label: "None", count: 0, color: "#000" }]}
				/>,
			),
		).toBe("")
	})
})

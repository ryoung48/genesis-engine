import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
	GenerationPanel,
	getGenerationTimingSummary,
	getPostTimingSummary,
	handleRecentCodeSelection,
} from "./GenerationPanel"

vi.mock("chart.js", () => ({
	BarElement: {},
	CategoryScale: {},
	Chart: { register: vi.fn() },
	Legend: {},
	LinearScale: {},
	Tooltip: {},
}))

vi.mock("react-chartjs-2", () => ({
	Bar: (): null => null,
}))

type GenerationPanelProps = ComponentProps<typeof GenerationPanel>

function createProps(
	overrides: Partial<GenerationPanelProps> = {},
): GenerationPanelProps {
	return {
		worldTab: "planet",
		setWorldTab: vi.fn(),
		resetWorldDefaults: vi.fn(),
		tidallyLocked: false,
		setTidallyLocked: vi.fn(),
		setObliquity: vi.fn(),
		planetSliders: [],
		terrainSliders: [],
		planetCode: "ABCD",
		codeInput: "ABCD",
		setCodeInput: vi.fn(),
		onApplyCode: vi.fn(),
		codeError: false,
		recentCodes: [],
		onSelectRecentCode: vi.fn(),
		onRandomizeCode: vi.fn(),
		generating: false,
		generationLabel: "Idle",
		generationProgress: 0,
		generationTimings: null,
		showClimatePreview: false,
		onToggleClimatePreview: vi.fn(),
		handleGenerate: vi.fn(),
		handleFileImport: vi.fn(),
		handleEarthImport: vi.fn(),
		era: "lateMedieval",
		setEra: vi.fn(),
		...overrides,
	}
}

describe("GenerationPanel", () => {
	it("renders preview beside reset in the header actions", () => {
		const markup = renderToStaticMarkup(<GenerationPanel {...createProps()} />)

		expect(markup).toMatch(/>Preview<\/button><button[^>]*>Reset<\/button>/)
	})

	it("renders the recent-codes toggle and randomize control with icons", () => {
		const markup = renderToStaticMarkup(
			<GenerationPanel {...createProps({ recentCodes: ["ABCD"] })} />,
		)

		expect(markup).toContain('aria-label="Show recent codes"')
		expect(markup).toContain('aria-label="Generate new code"')
		expect(
			markup.match(/rounded-md border border-slate-200 bg-white p-1\.5/g),
		).toHaveLength(2)
		expect(markup).toContain("M13.5,8H12V13L16.28,15.54")
		expect(markup).toContain("M19 5V19H5V5H19M19 3H5C3.9 3 3 3.9 3 5V19")
	})

	it("keeps post breakdown out of the top-level timing total", () => {
		const summary = getGenerationTimingSummary([
			{ Stage: "orogen:mesh", ms: "120.0" },
			{ Stage: "orogen:post-pipeline", ms: "980.0" },
			{ Stage: "Post: rainfall", ms: "310.0" },
			{ Stage: "Post: rivers", ms: "220.0" },
		])

		expect(summary).toEqual({
			entries: [
				{ label: "post-pipeline", ms: 980 },
				{ label: "mesh", ms: 120 },
			],
			otherEntries: [],
			totalMs: 1100,
		})
	})

	it("extracts post breakdown entries for the dedicated timing view", () => {
		const summary = getPostTimingSummary([
			{ Stage: "orogen:mesh", ms: "120.0" },
			{ Stage: "Post: rainfall", ms: "310.0" },
			{ Stage: "Post: rivers", ms: "220.0" },
			{ Stage: "Post: topography", ms: "95.0" },
		])

		expect(summary).toEqual({
			entries: [
				{ label: "rainfall", ms: 310 },
				{ label: "rivers", ms: 220 },
				{ label: "Other", ms: 95 },
			],
			otherEntries: [{ label: "topography", ms: 95 }],
			totalMs: 625,
		})
	})

	it("drops invalid timings and groups short generation stages into Other", () => {
		expect(getGenerationTimingSummary()).toBeNull()
		expect(
			getGenerationTimingSummary([
				{ Stage: "mesh", ms: "90" },
				{ Stage: "orogen:detail", ms: "50" },
				{ Stage: "Post: rainfall", ms: "300" },
				{ Stage: "ignored", ms: "NaN" },
			]),
		).toEqual({
			entries: [{ label: "Other", ms: 140 }],
			otherEntries: [
				{ label: "mesh", ms: 90 },
				{ label: "detail", ms: 50 },
			],
			totalMs: 140,
		})
	})

	it("ignores non-post timings in the post summary and preserves descending order", () => {
		expect(
			getPostTimingSummary([
				{ Stage: "mesh", ms: "120" },
				{ Stage: "Post: topography", ms: "95" },
				{ Stage: "Post: rainfall", ms: "310" },
				{ Stage: "Post: invalid", ms: "oops" },
			]),
		).toEqual({
			entries: [
				{ label: "rainfall", ms: 310 },
				{ label: "Other", ms: 95 },
			],
			otherEntries: [{ label: "topography", ms: 95 }],
			totalMs: 405,
		})
	})

	it("keeps exact-hundred stages out of Other and returns null when no post timings remain", () => {
		expect(
			getGenerationTimingSummary([
				{ Stage: "Standalone", ms: "100" },
				{ Stage: "orogen:detail", ms: "99.9" },
			]),
		).toEqual({
			entries: [
				{ label: "Standalone", ms: 100 },
				{ label: "Other", ms: 99.9 },
			],
			otherEntries: [{ label: "detail", ms: 99.9 }],
			totalMs: 199.9,
		})
		expect(getPostTimingSummary([{ Stage: "mesh", ms: "120" }])).toBeNull()
	})

	it("renders terrain controls, error state, and timing summaries when data is available", () => {
		const markup = renderToStaticMarkup(
			<GenerationPanel
				{...createProps({
					worldTab: "terrain",
					showClimatePreview: true,
					codeError: true,
					terrainSliders: [
						{
							label: "Roughness",
							help: "Terrain detail",
							display: "0.50",
							min: 0,
							max: 1,
							step: 0.1,
							value: 0.5,
							set: vi.fn(),
							disabled: true,
						},
					],
					generationTimings: [
						{ Stage: "orogen:mesh", ms: "250" },
						{ Stage: "orogen:detail", ms: "90" },
						{ Stage: "Post: rainfall", ms: "180" },
					],
				})}
			/>,
		)

		expect(markup).toContain(">Globe<")
		expect(markup).toContain("Roughness")
		expect(markup).toContain("opacity-40 pointer-events-none")
		expect(markup).toContain("Invalid code")
		expect(markup).toContain(">Timing<")
		expect(markup).toContain("0.34 s")
	})

	it("disables the axial tilt spin-direction toggle when tidal lock is active", () => {
		const markup = renderToStaticMarkup(
			<GenerationPanel
				{...createProps({
					tidallyLocked: true,
					planetSliders: [
						{
							label: "Axial Tilt",
							help: "Tilt",
							display: "0.0°",
							min: 0,
							max: 90,
							step: 0.5,
							value: 0,
							set: vi.fn(),
						},
						{
							label: "Spin",
							help: "Spin",
							display: "Prograde",
							min: 0,
							max: 1,
							step: 1,
							value: 0,
							set: vi.fn(),
							disabled: true,
						},
					],
				})}
			/>,
		)

		expect(markup).toContain("spin locked by tidal lock")
		expect(markup).toContain("disabled")
		expect(markup).toContain("disabled:cursor-not-allowed")
	})

	it("renders rounded whole-second timing labels for long runs", () => {
		const markup = renderToStaticMarkup(
			<GenerationPanel
				{...createProps({
					generationTimings: [{ Stage: "orogen:mesh", ms: "12500" }],
				})}
			/>,
		)

		expect(markup).toContain("13 s")
	})

	it("closes the recent-code dropdown after selecting a code", () => {
		const onSelectRecentCode = vi.fn()
		const setShowRecentCodes = vi.fn()

		handleRecentCodeSelection("WXYZ", {
			onSelectRecentCode,
			setShowRecentCodes,
		})

		expect(setShowRecentCodes).toHaveBeenCalledWith(false)
		expect(onSelectRecentCode).toHaveBeenCalledWith("WXYZ")
		expect(setShowRecentCodes).toHaveBeenCalledBefore(onSelectRecentCode)
	})
})

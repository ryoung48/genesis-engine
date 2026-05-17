import React, { type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

type PanelModule = typeof import("./GenerationPanel")

type ElementLike = React.ReactElement<{
	children?: ReactNode
	[key: string]: unknown
}>

function textContent(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node)
	if (Array.isArray(node)) return node.map(textContent).join("")
	if (React.isValidElement(node))
		return textContent((node as ElementLike).props.children)
	return ""
}

function findElement(
	node: ReactNode,
	predicate: (element: ElementLike) => boolean,
): ElementLike | null {
	if (!React.isValidElement(node)) return null
	const element = node as ElementLike
	if (predicate(element)) return element
	for (const child of React.Children.toArray(element.props.children)) {
		const match = findElement(child, predicate)
		if (match) return match
	}
	return null
}

async function loadStatefulPanel(): Promise<{
	GenerationPanel: PanelModule["GenerationPanel"]
	fileClick: ReturnType<typeof vi.fn>
	setShowRecentCodes: ReturnType<typeof vi.fn>
	setShowGenerationTimings: ReturnType<typeof vi.fn>
}> {
	vi.resetModules()
	const fileClick = vi.fn()
	const setShowRecentCodes = vi.fn()
	const setShowGenerationTimings = vi.fn()

	vi.doMock("react", async () => {
		const actual = await vi.importActual<typeof import("react")>("react")
		let callCount = 0
		return {
			...actual,
			default: actual,
			useMemo: <T,>(factory: () => T) => factory(),
			useRef: () => ({ current: { click: fileClick } }),
			useState: () => {
				callCount++
				return callCount % 2 === 1
					? [true, setShowRecentCodes]
					: [true, setShowGenerationTimings]
			},
		}
	})
	vi.doMock("chart.js", () => ({
		BarElement: {},
		CategoryScale: {},
		Chart: { register: vi.fn() },
		Legend: {},
		LinearScale: {},
		Tooltip: {},
	}))
	vi.doMock("react-chartjs-2", () => ({
		Bar: (): null => null,
	}))

	const mod = await import("./GenerationPanel")
	return {
		GenerationPanel: mod.GenerationPanel,
		fileClick,
		setShowRecentCodes,
		setShowGenerationTimings,
	}
}

async function loadCollapsedPanel(): Promise<{
	GenerationPanel: PanelModule["GenerationPanel"]
}> {
	vi.resetModules()

	vi.doMock("react", async () => {
		const actual = await vi.importActual<typeof import("react")>("react")
		return {
			...actual,
			default: actual,
			useMemo: <T,>(factory: () => T) => factory(),
			useRef: <T,>() => ({ current: null as T | null }),
			useState: () => [false, vi.fn()],
		}
	})
	vi.doMock("chart.js", () => ({
		BarElement: {},
		CategoryScale: {},
		Chart: { register: vi.fn() },
		Legend: {},
		LinearScale: {},
		Tooltip: {},
	}))
	vi.doMock("react-chartjs-2", () => ({
		Bar: (): null => null,
	}))

	const mod = await import("./GenerationPanel")
	return {
		GenerationPanel: mod.GenerationPanel,
	}
}

describe("GenerationPanel stateful branches", () => {
	it("renders expanded recent-code and timing sections when both toggles are open", async () => {
		const { GenerationPanel } = await loadStatefulPanel()
		const markup = renderToStaticMarkup(
			React.createElement(GenerationPanel, {
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
				recentCodes: ["ABCD", "WXYZ"],
				onSelectRecentCode: vi.fn(),
				onRandomizeCode: vi.fn(),
				generating: true,
				generationLabel: "Orogen",
				generationProgress: 42.4,
				generationTimings: [
					{ Stage: "orogen:mesh", ms: "250" },
					{ Stage: "orogen:detail", ms: "80" },
					{ Stage: "Post: rainfall", ms: "180" },
				],
				showClimatePreview: false,
				onToggleClimatePreview: vi.fn(),
				handleGenerate: vi.fn(),
				handleFileImport: vi.fn(),
				handleEarthImport: vi.fn(),
				onClose: vi.fn(),
			}),
		)

		expect(markup).toContain("Hide Recent")
		expect(markup).toContain("WXYZ")
		expect(markup).toContain("Generating...")
		expect(markup).toContain("Orogen")
		expect(markup).toContain("42%")
		expect(markup).toContain("Pipeline")
	})

	it("wires the interactive controls to their handlers", async () => {
		const {
			GenerationPanel,
			fileClick,
			setShowRecentCodes,
			setShowGenerationTimings,
		} = await loadStatefulPanel()
		const setWorldTab = vi.fn()
		const setTidallyLocked = vi.fn()
		const setObliquity = vi.fn()
		const planetSet = vi.fn()
		const setCodeInput = vi.fn()
		const onApplyCode = vi.fn()
		const onSelectRecentCode = vi.fn()
		const handleGenerate = vi.fn()
		const handleFileImport = vi.fn()

		const tree = await Promise.resolve(
			GenerationPanel({
				worldTab: "planet",
				setWorldTab,
				resetWorldDefaults: vi.fn(),
				tidallyLocked: false,
				setTidallyLocked,
				setObliquity,
				planetSliders: [
					{
						label: "Orbit",
						help: "Planet orbit",
						display: "1.00",
						min: 0,
						max: 2,
						step: 0.1,
						value: 1,
						set: planetSet,
					},
				],
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
					},
				],
				planetCode: "ABCD",
				codeInput: "ABCD",
				setCodeInput,
				onApplyCode,
				codeError: false,
				recentCodes: ["ABCD", "WXYZ"],
				onSelectRecentCode,
				onRandomizeCode: vi.fn(),
				generating: false,
				generationLabel: "Idle",
				generationProgress: 0,
				generationTimings: [{ Stage: "orogen:mesh", ms: "250" }],
				showClimatePreview: false,
				onToggleClimatePreview: vi.fn(),
				handleGenerate,
				handleFileImport,
				handleEarthImport: vi.fn(),
				onClose: vi.fn(),
			}),
		)

		const terrainButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				textContent(element.props.children) === "Terrain",
		)
		const tidallyLockedSlider = findElement(
			tree,
			(element) =>
				element.type === "input" &&
				element.props.type === "range" &&
				element.props.min === 0 &&
				element.props.max === 1 &&
				element.props.value === 0,
		)
		const slider = findElement(
			tree,
			(element) =>
				element.type === "input" &&
				element.props.type === "range" &&
				element.props.min === 0 &&
				element.props.max === 2,
		)
		const fileInput = findElement(
			tree,
			(element) => element.type === "input" && element.props.type === "file",
		)
		const codeInput = findElement(
			tree,
			(element) => element.type === "input" && element.props.type === "text",
		)
		const recentToggle = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				textContent(element.props.children) === "Hide Recent",
		)
		const recentCode = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				textContent(element.props.children) === "WXYZ",
		)
		const generateButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				textContent(element.props.children).includes("Generate"),
		)
		const importButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				element.props.title ===
					"Import an equirectangular B&W heightmap (PNG, JPEG, WebP)",
		)
		const timingButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				textContent(element.props.children).includes("Timing"),
		)

		;(terrainButton?.props.onClick as (() => void) | undefined)?.()
		;(
			tidallyLockedSlider?.props.onChange as
				| ((event: { target: { value: string } }) => void)
				| undefined
		)?.({ target: { value: "1" } })
		;(
			slider?.props.onChange as
				| ((event: { target: { value: string } }) => void)
				| undefined
		)?.({ target: { value: "1.5" } })
		const uploadedFile = new File(["x"], "height.png", { type: "image/png" })
		const fileTarget = { files: [uploadedFile], value: "filled" }
		;(
			fileInput?.props.onChange as
				| ((event: { target: typeof fileTarget }) => void)
				| undefined
		)?.({ target: fileTarget })
		;(
			codeInput?.props.onChange as
				| ((event: { target: { value: string } }) => void)
				| undefined
		)?.({ target: { value: "ZXCV" } })
		const preventDefault = vi.fn()
		;(
			codeInput?.props.onKeyDown as
				| ((event: { key: string; preventDefault: () => void }) => void)
				| undefined
		)?.({ key: "Enter", preventDefault })
		;(recentToggle?.props.onClick as (() => void) | undefined)?.()
		;(recentCode?.props.onClick as (() => void) | undefined)?.()
		;(generateButton?.props.onClick as (() => void) | undefined)?.()
		;(importButton?.props.onClick as (() => void) | undefined)?.()
		;(timingButton?.props.onClick as (() => void) | undefined)?.()

		expect(setWorldTab).toHaveBeenCalledWith("terrain")
		expect(setTidallyLocked).toHaveBeenCalledWith(true)
		expect(setObliquity).toHaveBeenCalledWith(0)
		expect(planetSet).toHaveBeenCalledWith(1.5)
		expect(handleFileImport).toHaveBeenCalledWith(uploadedFile)
		expect(fileTarget.value).toBe("")
		expect(setCodeInput).toHaveBeenCalledWith("ZXCV")
		expect(preventDefault).toHaveBeenCalledTimes(1)
		expect(onApplyCode).toHaveBeenCalledTimes(1)
		expect(setShowRecentCodes).toHaveBeenCalled()
		expect(onSelectRecentCode).toHaveBeenCalledWith("WXYZ")
		expect(handleGenerate).toHaveBeenCalledTimes(1)
		expect(fileClick).toHaveBeenCalledTimes(1)
		expect(setShowGenerationTimings).toHaveBeenCalled()
	})

	it("supports header actions and ignores non-applicable input branches", async () => {
		const { GenerationPanel } = await loadCollapsedPanel()
		const resetWorldDefaults = vi.fn()
		const onToggleClimatePreview = vi.fn()
		const onRandomizeCode = vi.fn()
		const handleEarthImport = vi.fn()
		const onClose = vi.fn()
		const onApplyCode = vi.fn()
		const handleFileImport = vi.fn()
		const setTidallyLocked = vi.fn()

		const tree = await Promise.resolve(
			GenerationPanel({
				worldTab: "planet",
				setWorldTab: vi.fn(),
				resetWorldDefaults,
				tidallyLocked: true,
				setTidallyLocked,
				setObliquity: vi.fn(),
				planetSliders: [],
				terrainSliders: [],
				planetCode: "ABCD",
				codeInput: "ABCD",
				setCodeInput: vi.fn(),
				onApplyCode,
				codeError: false,
				recentCodes: ["ABCD"],
				onSelectRecentCode: vi.fn(),
				onRandomizeCode,
				generating: false,
				generationLabel: "Idle",
				generationProgress: 12,
				generationTimings: [{ Stage: "orogen:mesh", ms: "12500" }],
				showClimatePreview: true,
				onToggleClimatePreview,
				handleGenerate: vi.fn(),
				handleFileImport,
				handleEarthImport,
				onClose,
			}),
		)

		const closeButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				element.props.title === "Hide generation panel",
		)
		const previewButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				element.props.title ===
					"Toggle the climate preview in the main viewport",
		)
		const resetButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				textContent(element.props.children) === "Reset",
		)
		const tidallyLockedSlider = findElement(
			tree,
			(element) =>
				element.type === "input" &&
				element.props.type === "range" &&
				element.props.min === 0 &&
				element.props.max === 1 &&
				element.props.value === 1,
		)
		const fileInput = findElement(
			tree,
			(element) => element.type === "input" && element.props.type === "file",
		)
		const codeInput = findElement(
			tree,
			(element) => element.type === "input" && element.props.type === "text",
		)
		const randomizeButton = findElement(
			tree,
			(element) =>
				element.type === "button" && element.props.title === "New code",
		)
		const importButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				element.props.title ===
					"Import an equirectangular B&W heightmap (PNG, JPEG, WebP)",
		)
		const earthButton = findElement(
			tree,
			(element) =>
				element.type === "button" &&
				element.props.title === "Load Earth's heightmap",
		)

		;(closeButton?.props.onClick as (() => void) | undefined)?.()
		;(previewButton?.props.onClick as (() => void) | undefined)?.()
		;(resetButton?.props.onClick as (() => void) | undefined)?.()
		;(
			tidallyLockedSlider?.props.onChange as
				| ((event: { target: { value: string } }) => void)
				| undefined
		)?.({ target: { value: "0" } })
		const emptyTarget: { files: File[]; value: string } = {
			files: [],
			value: "filled",
		}
		;(
			fileInput?.props.onChange as
				| ((event: { target: typeof emptyTarget }) => void)
				| undefined
		)?.({ target: emptyTarget })
		const preventDefault = vi.fn()
		;(
			codeInput?.props.onKeyDown as
				| ((event: { key: string; preventDefault: () => void }) => void)
				| undefined
		)?.({ key: "Escape", preventDefault })
		;(codeInput?.props.onBlur as (() => void) | undefined)?.()
		;(randomizeButton?.props.onClick as (() => void) | undefined)?.()
		;(importButton?.props.onClick as (() => void) | undefined)?.()
		;(earthButton?.props.onClick as (() => void) | undefined)?.()

		expect(onClose).toHaveBeenCalledTimes(1)
		expect(onToggleClimatePreview).toHaveBeenCalledTimes(1)
		expect(resetWorldDefaults).toHaveBeenCalledTimes(1)
		expect(setTidallyLocked).toHaveBeenCalledWith(false)
		expect(handleFileImport).not.toHaveBeenCalled()
		expect(emptyTarget.value).toBe("")
		expect(preventDefault).not.toHaveBeenCalled()
		expect(onApplyCode).toHaveBeenCalledTimes(1)
		expect(onRandomizeCode).toHaveBeenCalledTimes(1)
		expect(handleEarthImport).toHaveBeenCalledTimes(1)
	})

	it("renders timing chart fallbacks and exposes chart callbacks for sparse tooltip input", async () => {
		const { GenerationPanel } = await loadStatefulPanel()
		const tree = await Promise.resolve(
			GenerationPanel({
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
				generationTimings: [
					{ Stage: "orogen:mesh", ms: "250" },
					{ Stage: "orogen:detail", ms: "240" },
					{ Stage: "orogen:erosion", ms: "230" },
					{ Stage: "orogen:climate", ms: "220" },
					{ Stage: "orogen:rivers", ms: "210" },
				],
				showClimatePreview: false,
				onToggleClimatePreview: vi.fn(),
				handleGenerate: vi.fn(),
				handleFileImport: vi.fn(),
				handleEarthImport: vi.fn(),
				onClose: vi.fn(),
			}),
		)

		const chartElement = findElement(
			tree,
			(element) =>
				typeof element.type === "function" &&
				Array.isArray(
					(element.props as { entries?: Array<{ label: string; ms: number }> })
						.entries,
				),
		) as React.ReactElement<{
			entries: Array<{ label: string; ms: number }>
		}> | null
		expect(chartElement).not.toBeNull()

		const chartTree = (
			chartElement?.type as (props: {
				entries: Array<{ label: string; ms: number }>
			}) => React.ReactElement
		)(
			chartElement?.props as {
				entries: Array<{ label: string; ms: number }>
			},
		)
		const barElement = findElement(
			chartTree,
			(element) =>
				typeof element.type === "function" &&
				"data" in element.props &&
				"options" in element.props,
		)
		expect(barElement).not.toBeNull()

		const datasets = (
			barElement?.props as {
				data: { datasets: Array<{ backgroundColor: string[] }> }
				options: {
					plugins: {
						tooltip: {
							callbacks: {
								title: (items: Array<{ dataIndex?: number }>) => string
							}
						}
					}
				}
			}
		).data.datasets
		const title = (
			barElement?.props as {
				options: {
					plugins: {
						tooltip: {
							callbacks: {
								title: (items: Array<{ dataIndex?: number }>) => string
							}
						}
					}
				}
			}
		).options.plugins.tooltip.callbacks.title

		expect(datasets[0]?.backgroundColor).toEqual([
			"#0f172a",
			"#1e293b",
			"#1e293b",
			"#1e293b",
			"#334155",
		])
		expect(title([])).toBe("mesh")
		expect(title([{ dataIndex: 99 }])).toBe("")

		const emptyChart = (
			chartElement?.type as (props: {
				entries: Array<{ label: string; ms: number }>
			}) => React.ReactElement
		)({
			entries: [],
		})

		expect(renderToStaticMarkup(emptyChart)).toContain(
			"Run a generation or import to collect stage timings.",
		)
	})
})

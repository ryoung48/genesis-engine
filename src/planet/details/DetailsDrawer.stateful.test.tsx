import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

async function loadDrawerWithState(options: {
	tab: "world" | "nation"
	worldSection: "planetary" | "environmental" | "social"
	nationSection: "political" | "demographics" | "history"
	nextState?: {
		tab: "world" | "nation"
		worldSection: "planetary" | "environmental" | "social"
		nationSection: "political" | "demographics" | "history"
	}
}) {
	vi.resetModules()
	const setTab = vi.fn()
	const setWorldSection = vi.fn()
	const setNationSection = vi.fn()
	const resolveDrawerStateOnOpen = vi.fn(
		() =>
			options.nextState ?? {
				tab: options.tab,
				worldSection: options.worldSection,
				nationSection: options.nationSection,
			},
	)

	vi.doMock("react", async () => {
		const actual = await vi.importActual<typeof import("react")>("react")
		let callCount = 0
		return {
			...actual,
			default: actual,
			useEffect: (effect: () => void) => {
				effect()
			},
			useRef: <T,>() => ({ current: null as T | null }),
			useState: () => {
				callCount++
				if (callCount === 1) return [options.tab, setTab]
				if (callCount === 2) return [options.worldSection, setWorldSection]
				return [options.nationSection, setNationSection]
			},
		}
	})
	vi.doMock("./drawer-state", async () => {
		const actual =
			await vi.importActual<typeof import("./drawer-state")>("./drawer-state")
		return {
			...actual,
			resolveDrawerStateOnOpen,
		}
	})

	const mod = await import("./DetailsDrawer")
	return {
		DetailsDrawer: mod.DetailsDrawer,
		resolveDrawerStateOnOpen,
		setTab,
		setWorldSection,
		setNationSection,
	}
}

describe("DetailsDrawer stateful branches", () => {
	it("applies drawer-state updates when opening with a new nation", async () => {
		const {
			DetailsDrawer,
			resolveDrawerStateOnOpen,
			setTab,
			setWorldSection,
			setNationSection,
		} = await loadDrawerWithState({
			tab: "world",
			worldSection: "planetary",
			nationSection: "political",
			nextState: {
				tab: "nation",
				worldSection: "social",
				nationSection: "history",
			},
		})

		renderToStaticMarkup(
			<DetailsDrawer
				open
				onToggle={vi.fn()}
				nation={{
					id: 7,
					name: "Aurelian League",
					provinceCount: 12,
					totalPopulation: 3_400_000,
					color: "#abcdef",
					neighbors: [],
					activeWars: [],
					cultureDistribution: [],
					heritageDistribution: [],
					faithDistribution: [],
					religionDistribution: [],
				}}
				planetStats={[]}
				worldPopulation={null}
				activeWarCount={null}
				averageDevelopment={null}
				nationAverageDevelopment={null}
				developmentDistribution={[]}
				nationDevelopmentDistribution={[]}
				nationSizeDistribution={[]}
				conflictDistribution={[]}
				relationDistribution={[]}
				climateDistribution={[]}
				vegetationDistribution={[]}
				topographyDistribution={[]}
			/>,
		)

		expect(resolveDrawerStateOnOpen).toHaveBeenCalled()
		expect(setTab).toHaveBeenCalledWith("nation")
		expect(setWorldSection).toHaveBeenCalledWith("social")
		expect(setNationSection).toHaveBeenCalledWith("history")
	})

	it("renders the nation tab when the drawer state starts on a nation", async () => {
		const { DetailsDrawer } = await loadDrawerWithState({
			tab: "nation",
			worldSection: "planetary",
			nationSection: "political",
		})

		const markup = renderToStaticMarkup(
			<DetailsDrawer
				open
				onToggle={vi.fn()}
				nation={{
					id: 7,
					name: "Aurelian League",
					provinceCount: 12,
					totalPopulation: 3_400_000,
					color: "#abcdef",
					neighbors: [],
					activeWars: [
						{
							id: 4,
							opponentId: 8,
							opponentName: "Vale",
							opponentColor: "#654321",
							role: "Attacker",
							rebel: false,
						},
					],
					cultureDistribution: [],
					heritageDistribution: [],
					faithDistribution: [],
					religionDistribution: [],
				}}
				planetStats={[]}
				worldPopulation={null}
				activeWarCount={null}
				averageDevelopment={null}
				nationAverageDevelopment={null}
				developmentDistribution={[]}
				nationDevelopmentDistribution={[]}
				nationSizeDistribution={[]}
				conflictDistribution={[]}
				relationDistribution={[]}
				climateDistribution={[]}
				vegetationDistribution={[]}
				topographyDistribution={[]}
				onNationClick={vi.fn()}
			/>,
		)

		expect(markup).toContain("Aurelian League")
		expect(markup).toContain(">Political<")
		expect(markup).toContain("vs Vale · Attacker")
		expect(markup).not.toContain(">Planetary<")
	})
})

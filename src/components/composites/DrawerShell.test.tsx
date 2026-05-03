import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DrawerShell } from "./DrawerShell"

describe("DrawerShell", () => {
	it("renders header content without a close button by default", () => {
		const markup = renderToStaticMarkup(
			<DrawerShell title="Climate" className="drawer-shell">
				<div>Panel body</div>
			</DrawerShell>,
		)

		expect(markup).toContain("Climate")
		expect(markup).toContain("Panel body")
		expect(markup).toContain("drawer-shell")
		expect(markup).not.toContain("Close panel")
	})

	it("renders icon and close button affordances when closable", () => {
		const markup = renderToStaticMarkup(
			<DrawerShell
				title="History"
				icon={<span>★</span>}
				onClose={() => undefined}
				closeTitle="Dismiss drawer"
			>
				<div>Events</div>
			</DrawerShell>,
		)

		expect(markup).toContain("History")
		expect(markup).toContain("★")
		expect(markup).toContain("Dismiss drawer")
		expect(markup).toContain("ml-auto h-6 w-6")
		expect(markup).toContain("Events")
	})
})

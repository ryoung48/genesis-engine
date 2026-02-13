import { BATTLE_EVENT } from "./events/battle"
import { POPULATION_EVENT } from "./events/population"
import { SUCCESSION_EVENT } from "./events/succession"
import { TAX_EVENT } from "./events/tax"
import { WAR_EVENT } from "./events/war"

export const HISTORY = {
	// Initialize the simulation without running it
	init: () => {
		// WAR_EVENT.init()
		// SUCCESSION_EVENT.init()
		// TAX_EVENT.init()
		POPULATION_EVENT.init()
	},

	// Process a target number of events, returns the final world time
	tick: (targetEventCount: number): number => {
		let eventsProcessed = 0
		while (
			eventsProcessed < targetEventCount &&
			!window.world.future.isEmpty()
		) {
			const currentEvent = window.world.future.front()

			window.world.future.dequeue()
			window.world.time = currentEvent.time
			eventsProcessed++

			switch (currentEvent.type) {
				case "war":
					WAR_EVENT.run(currentEvent)
					break
				case "battle":
					BATTLE_EVENT.run(currentEvent)
					break
				case "succession":
					SUCCESSION_EVENT.run(currentEvent)
					break
				case "tax":
					TAX_EVENT.run(currentEvent)
					break
				case "census":
					POPULATION_EVENT.run(currentEvent)
					break
			}
		}
		return window.world.time
	},
}

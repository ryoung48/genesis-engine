import { BATTLE_KIND } from "@/model/history/sim/engine/events/battle/kind"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { ARMY_STRENGTH } from "@/model/history/sim/engine/military/strength"
import { STATE } from "@/model/history/sim/engine/state"
import { TERRAIN } from "@/model/history/sim/engine/terrain"
import type { BattlefieldReportParams } from "@/test/history-run/report/military/battlefields/types"

function initial({ engine }: BattlefieldReportParams) {
	let towns = 0
	let rivers = 0
	for (let p = 0; p < engine.P; p++) {
		if (BATTLE_KIND.isTown({ state: engine, province: p })) towns++
		if (TERRAIN.hasRiver({ state: engine, p })) rivers++
	}
	const ratios: number[] = []
	for (const id of engine.activeWarIds) {
		const war = engine.wars[id]
		for (const province of STATE.getNationProvinces({
			state: engine,
			root: war.defender,
		})) {
			if (!BATTLE_KIND.isTown({ state: engine, province })) continue
			const siege = SIEGE.prepare({
				state: engine,
				war,
				attacker: war.attacker,
				province,
			})
			if (siege === null) continue
			const garrison = Object.values(siege.garrison).reduce(
				(sum, men) => sum + ARMY_STRENGTH.of(men),
				0,
			)
			ratios.push(siege.startBesiegerStrength / garrison)
		}
	}
	ratios.sort((a, b) => a - b)
	return {
		townProvinces: towns,
		riverProvinces: rivers,
		eligibleSiegeTargets: ratios.length,
		besiegerGarrisonRatios: ratios,
		ratioMin: ratios[0] ?? null,
		ratioMedian: ratios[Math.floor(ratios.length / 2)] ?? null,
		ratioP90: ratios[Math.floor(ratios.length * 0.9)] ?? null,
		ratioMax: ratios.at(-1) ?? null,
	}
}
function lifecycle({ engine }: BattlefieldReportParams) {
	const pending = new Map<number, number>()
	let starts = 0
	let endings = 0
	for (const note of engine.events) {
		const id = note.data.war as number
		if (note.tag === "siege started") {
			if (pending.has(id)) throw new Error(`Concurrent sieges in war ${id}`)
			pending.set(id, note.time)
			starts++
		} else if (note.tag === "siege ended") {
			const start = pending.get(id)
			if (start === undefined || note.time < start)
				throw new Error(`Unmatched siege ending in war ${id}`)
			const warEnd = engine.wars[id].endTime
			if (warEnd !== undefined && note.time > warEnd)
				throw new Error(`Siege outlived war ${id}`)
			pending.delete(id)
			endings++
		} else if (note.tag === "siege beat" && !pending.has(id))
			throw new Error(`Beat outside a siege in war ${id}`)
	}
	for (const war of engine.wars) {
		if (war.endTime !== undefined && war.siege !== null)
			throw new Error(`Ended war ${war.idx} retains a siege`)
		if ((war.siege !== null) !== pending.has(war.idx))
			throw new Error(`Siege state and journal disagree in war ${war.idx}`)
	}
	return { starts, endings, running: pending.size }
}
export const BATTLEFIELD_REPORT = { initial, lifecycle }

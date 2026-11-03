import fs from "node:fs"
import { it } from "vitest"
import { HISTORY_RUN } from "@/test/history-run"

it("tmp", () => {
	const out: unknown[] = []
	for (const seed of [14963991, 7, 123456]) {
		const { generated } = HISTORY_RUN.createFreshEngine({
			seed,
			era: "lateMedieval",
			numPoints: 204000,
		})
		const prov = generated.provinces!
		const arr = generated.population!.arrivalYear!
		let habitable = 0,
			settled867 = 0,
			reached = 0
		for (let p = 0; p < prov.count; p++) {
			if (prov.desolate[p]) continue
			habitable++
			if (arr[p] !== 2147483647) {
				reached++
				if (arr[p] <= 867) settled867++
			}
		}
		const years = Array.from(arr)
			.filter((y) => y !== 2147483647)
			.sort((a, b) => a - b)
		out.push({
			seed,
			habitable,
			s867: +(settled867 / habitable).toFixed(3),
			reached: +(reached / habitable).toFixed(3),
			median: years[Math.floor(years.length / 2)],
		})
	}
	fs.writeFileSync("node_modules/.cache/proc-check.json", JSON.stringify(out))
}, 900000)

import { titleCase } from "@/model/shared/text"
import { LANGUAGE } from "@/model/society/language/languages"

export function generatePlanetName(seed: number): string {
	const lang = LANGUAGE.spawn(`planet:${seed}`)
	const { word } = LANGUAGE.word.simple({
		lang,
		key: "region",
		namespace: "planet",
		slot: "planet:0",
	})
	return titleCase(word)
}

import { TEXT } from "@/model/shared/text"
import { LANGUAGE } from "@/model/society/language/languages"

/** The galaxy's own name, from a language spawned off its own seed --
 * mirrors STAR_IDENTITY.generateStarName's per-system naming (same
 * LANGUAGE.spawn/word.simple shape), just keyed to `galaxy:${seed}` instead
 * of `system:${seed}` so a galaxy's name never collides with any system
 * inside it that happens to share the same numeric seed. */
function generateGalaxyName(seed: number): string {
	const lang = LANGUAGE.spawn(`galaxy:${seed}`)
	return TEXT.titleCase(
		LANGUAGE.word.simple({
			lang,
			key: "region",
			namespace: "galaxy",
			slot: "galaxy",
		}).word,
	)
}

export const GALAXY_IDENTITY = { generateGalaxyName }

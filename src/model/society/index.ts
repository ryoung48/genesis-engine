export { computeCultures } from "./culture"
export type { GovernmentType, SocietyEra } from "./eras"
export {
	DEFAULT_ERA,
	ERA_ORDER,
	GOVERNMENT_TYPE_LABELS,
	GOVERNMENT_TYPES,
	getEraConfig,
	wavePercentileThreshold,
} from "./eras"
export type { CultureGenderSystem } from "./gender-system"
export {
	CULTURE_GENDER_SYSTEM,
	normalizeCultureGenderSystem,
	resolveLeaderGender,
} from "./gender-system"
export { computeHeritages } from "./heritage"
export {
	fanoutRangesForSize,
	maxFanoutForNationSize,
	rebalanceHierarchy,
} from "./hierarchy"

export type { LanguageNames } from "./language/names"
export { createWorldNames } from "./language/names"
export { computeNations } from "./nations"
export type { ProvincePopulation } from "./population"
export {
	computeMigration,
	computePopulation,
	computeProvinceHabitability,
} from "./population"
export {
	assignReligionTypes,
	buildReligionColors,
	computeReligions,
	RELIGION_TYPE_COLORS,
	RELIGION_TYPE_NAMES,
} from "./religion"
export type { HeritageScript } from "./script/index"
export { compressName, SCRIPT } from "./script/index"

export { layoutGlyphText } from "./script/runegen/glyph-module"

export {
	getRuneDotRadius,
	getRuneDots,
	prepareRuneStrokes,
} from "./script/runegen/rune-renderer"
export {
	getSettlementEraTuning,
	getSettlementRenderThresholds,
} from "./settlement-tuning"
export { deriveChildColors } from "./shared"
export {
	regionTimezoneLabel,
	regionTimezoneOffset,
	timezoneLandColor,
	timezoneWaterColor,
} from "./timezone"
export { computeUrbanization } from "./urbanization"

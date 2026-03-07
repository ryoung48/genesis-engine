import { Cell } from "../../cells/types"
import { Ethos, TraditionCategory } from "./types"

export type Tradition = {
	key: string
	name: string
	description: string
	category: TraditionCategory
	preferredEthos: Ethos[]
	/** True → eligible for this origin cell. False → tradition never assigned. */
	condition: (cell: Cell) => boolean
	/** Tradition cannot be assigned if culture has one of these ethos. */
	excludedEthos?: Ethos[]
}

// ─── Condition helpers ────────────────────────────────────────────────────────
const isForest = (c: Cell) => c.vegetation === "woods" || c.vegetation === "forest"
const isJungle = (c: Cell) => c.vegetation === "jungle"
const isDesert = (c: Cell) => c.vegetation === "desert"
const isDry = (c: Cell) => c.vegetation === "desert" || c.vegetation === "sparse"
const isGrassland = (c: Cell) => c.vegetation === "grasslands"
const isHills = (c: Cell) => c.topography === "hills"
const isMountains = (c: Cell) => c.topography === "mountains" || !!c.isMountains
const isMarsh = (c: Cell) => c.topography === "marsh"
const isFlat = (c: Cell) => c.topography === "flat" || c.topography === "coastal" || c.topography === "plateau"
const isCoastal = (c: Cell) => c.topography === "coastal"
const isWarm = (c: Cell) => c.climate === "subtropical" || c.climate === "tropical"
const isFarmland = (c: Cell) => isGrassland(c) && isFlat(c)
const always = (_c: Cell) => true

// ─── Traditions ───────────────────────────────────────────────────────────────
export const TRADITIONS: Tradition[] = [
	// ── REALM ─────────────────────────────────────────────────────────────────
	{
		key: "agrarian",
		name: "Agrarian",
		description:
			"Known for very productive farmlands and advanced agricultural practices.",
		category: "realm",
		preferredEthos: ["communal", "bureaucratic", "egalitarian"],
		condition: (c) => isFarmland(c) || isGrassland(c),
	},
	{
		key: "desert_dwellers",
		name: "Desert Dwellers",
		description:
			"Nomads of harsh deserts, adapting to extreme conditions with advanced hydraulic engineering; excel in stealth and endurance in desert warfare.",
		category: "realm",
		preferredEthos: ["stoic", "spiritual", "bellicose"],
		condition: (c) => isDesert(c) || isDry(c),
	},
	{
		key: "forest_folk",
		name: "Forest Folk",
		description:
			"Dwellers in dense woodlands, using the forest for shelter and resources; skilled archers and guerilla tacticians.",
		category: "realm",
		preferredEthos: ["communal", "spiritual"],
		condition: (c) => isForest(c),
	},
	{
		key: "hill_folk",
		name: "Hill Folk",
		description:
			"Masters of hill terrain, cultivating it for agriculture and defense; use elevation for strategic advantages in conflicts.",
		category: "realm",
		preferredEthos: ["stoic", "communal"],
		condition: (c) => isHills(c),
	},
	{
		key: "jungle_folk",
		name: "Jungle Folk",
		description:
			"Residents of the jungle, using the forest for shelter and resources; skilled archers and guerilla tacticians.",
		category: "realm",
		preferredEthos: ["communal", "spiritual", "bellicose"],
		condition: (c) => isJungle(c),
	},
	{
		key: "marsh_folk",
		name: "Marsh Folk",
		description:
			"Navigators of waterways, excelling in fishing; employ marshes for ambush tactics and hidden retreats in warfare.",
		category: "realm",
		preferredEthos: ["communal", "stoic"],
		condition: (c) => isMarsh(c),
	},
	{
		key: "mountain_folk",
		name: "Mountain Folk",
		description:
			"Residents of high altitudes, specializing in mining and herding; they make use of fortified mountain passes against invasions.",
		category: "realm",
		preferredEthos: ["stoic", "bellicose"],
		condition: (c) => isMountains(c) || isHills(c),
	},
	{
		key: "plains_dwellers",
		name: "Plains Dwellers",
		description:
			"Agriculturists and horse breeders on vast plains; cavalry experts in wars.",
		category: "realm",
		preferredEthos: ["bellicose", "communal", "egalitarian"],
		condition: (c) => isGrassland(c) && isFlat(c),
	},
	{
		key: "seafarers",
		name: "Seafarers",
		description:
			"Navigators of vast oceans, engaging in trade and exploration; adept at naval warfare and amphibious strategies.",
		category: "realm",
		preferredEthos: ["bellicose", "bureaucratic"],
		condition: (c) => isCoastal(c),
	},
	{
		key: "hydraulic_builders",
		name: "Hydraulic Builders",
		description:
			"They are masters of water engineering, building canals, dikes, spillways, and vast reservoirs to control floods, irrigate fields, and keep towns supplied through droughts.",
		category: "realm",
		preferredEthos: ["bureaucratic", "communal"],
		condition: (c) => isMarsh(c) || isCoastal(c) || isFarmland(c),
	},
	{
		key: "caravaneers",
		name: "Caravaneers",
		description:
			"Long-distance caravan travel is a way of life, producing shrewd guides and merchants who move goods and news safely across hostile distances.",
		category: "realm",
		preferredEthos: ["bureaucratic", "communal", "stoic"],
		condition: (c) => isDry(c) || isGrassland(c) || isFlat(c),
	},
	{
		key: "coastal_raiders",
		name: "Coastal Raiders",
		description:
			"Sea raiding is treated as legitimate enterprise, with bold crews striking rich shores and returning with plunder, captives, and hard-won sea-lore.",
		category: "realm",
		preferredEthos: ["bellicose"],
		condition: (c) => isCoastal(c),
		excludedEthos: ["communal", "egalitarian"],
	},
	{
		key: "industrious",
		name: "Industrious",
		description:
			"Relentless work is a civic virtue, and idleness is shameful; communities build fast, repair often, and measure worth by what one produces.",
		category: "realm",
		preferredEthos: ["bureaucratic", "stoic", "communal"],
		condition: always,
	},
	{
		key: "isolationists",
		name: "Isolationists",
		description:
			"They keep to their own ways and guard borders jealously, limiting foreign influence and contact even when it would be profitable.",
		category: "realm",
		preferredEthos: ["stoic", "spiritual"],
		condition: always,
		excludedEthos: ["egalitarian"],
	},
	{
		key: "night_markets",
		name: "Night Markets",
		description:
			"Commerce thrives after dark, boosting trade and stewardship in cities while breeding intrigue and making holdings harder to police.",
		category: "realm",
		preferredEthos: ["bureaucratic", "communal"],
		condition: always,
	},
	{
		key: "salt_monopoly",
		name: "Salt Monopoly",
		description:
			"Salt is crown-sacred and strictly measured, enriching the state and controlling hunger while making smugglers folk heroes and enemies.",
		category: "realm",
		preferredEthos: ["bureaucratic"],
		condition: always,
	},
	{
		key: "family_business",
		name: "Family Business",
		description:
			"Businesses are encouraged to develop along family lines, accumulating extensive skill for their trade across generations.",
		category: "realm",
		preferredEthos: ["communal", "bureaucratic"],
		condition: always,
	},

	// ── SOCIAL ────────────────────────────────────────────────────────────────
	{
		key: "abolished_slavery",
		name: "Abolished Slavery",
		description:
			"They have declared slavery illegal and look upon all those who still permit this practice with disdain.",
		category: "social",
		preferredEthos: ["egalitarian", "communal"],
		condition: always,
		excludedEthos: ["bellicose"],
	},
	{
		key: "caste_system",
		name: "Caste System",
		description:
			"Society is divided into rigid social classes, with limited mobility between them; each caste has specific roles and responsibilities.",
		category: "social",
		preferredEthos: ["bureaucratic", "ceremonious"],
		condition: always,
		excludedEthos: ["egalitarian"],
	},
	{
		key: "court_eunuchs",
		name: "Court Eunuchs",
		description:
			"This culture makes great use of eunuchs as domestic servants, bureaucratic administrators, and even military officers.",
		category: "social",
		preferredEthos: ["bureaucratic", "ceremonious"],
		condition: always,
	},
	{
		key: "esteemed_hospitality",
		name: "Esteemed Hospitality",
		description:
			"They are known for their welcoming and friendly service to their guests.",
		category: "social",
		preferredEthos: ["communal", "egalitarian", "ceremonious"],
		condition: always,
	},
	{
		key: "extended_family",
		name: "Extended Family",
		description:
			"They place great importance on extended family ties, with multiple generations living together and supporting each other; family loyalty is paramount.",
		category: "social",
		preferredEthos: ["communal", "stoic"],
		condition: always,
	},
	{
		key: "legalistic",
		name: "Legalistic",
		description:
			"They regard the rule of law and its codification as being the most important parameter of a civilized society.",
		category: "social",
		preferredEthos: ["bureaucratic", "stoic"],
		condition: always,
	},
	{
		key: "matriarchal_society",
		name: "Matriarchal Society",
		description:
			"They enforce a matriarchal hierarchy, where the ruling class is overwhelmingly comprised of women.",
		category: "social",
		preferredEthos: ["ceremonious", "communal", "egalitarian"],
		condition: always,
	},
	{
		key: "astute_diplomats",
		name: "Astute Diplomats",
		description:
			"Known for building webs of complex alliances and resolving conflicts without violence.",
		category: "social",
		preferredEthos: ["bureaucratic", "egalitarian"],
		condition: always,
	},
	{
		key: "nature_veneration",
		name: "Nature Veneration",
		description:
			"They hold a deep respect for the natural world and seek harmony with their surroundings; vegetarian diets are common.",
		category: "social",
		preferredEthos: ["spiritual", "communal"],
		condition: (c) => isForest(c) || isJungle(c) || isGrassland(c),
	},
	{
		key: "xenophilic",
		name: "Xenophilic",
		description:
			"Strangers are welcomed as potential friends and teachers, and foreign customs are adopted freely when they prove useful or beautiful.",
		category: "social",
		preferredEthos: ["egalitarian", "communal"],
		condition: always,
		excludedEthos: ["bellicose"],
	},
	{
		key: "pacifists",
		name: "Pacifists",
		description:
			"They see war as a moral failure and prize negotiation, trade, and restraint, preferring to outlast enemies rather than destroy them.",
		category: "social",
		preferredEthos: ["egalitarian", "communal", "spiritual"],
		condition: always,
		excludedEthos: ["bellicose"],
	},
	{
		key: "forbearing",
		name: "Forbearing",
		description:
			"Endurance and self-control are admired above passion, and their people meet hardship with quiet patience that outsiders mistake for weakness.",
		category: "social",
		preferredEthos: ["stoic", "spiritual"],
		condition: always,
	},
	{
		key: "equitable",
		name: "Equitable",
		description:
			"Justice is expected to be impartial and public, with strong norms against favoritism; rulers gain legitimacy by being fair even when it hurts them.",
		category: "social",
		preferredEthos: ["egalitarian", "bureaucratic"],
		condition: always,
	},
	{
		key: "charitable",
		name: "Charitable",
		description:
			"Giving to the needy is a social obligation, with reputations built on generosity and communities organized around mutual aid.",
		category: "social",
		preferredEthos: ["communal", "spiritual", "egalitarian"],
		condition: always,
	},
	{
		key: "gallows_humor",
		name: "Gallows Humor",
		description:
			"They cope with tragedy through sharp wit and communal laughter, using jokes and stories to defy fear and keep morale unbreakable.",
		category: "social",
		preferredEthos: ["stoic", "communal"],
		condition: always,
	},
	{
		key: "blood_feuds",
		name: "Blood Feuds",
		description:
			"Old insults are remembered for generations, and clan vengeance is treated as duty, creating cycles of retaliation that rarely truly end.",
		category: "social",
		preferredEthos: ["bellicose", "stoic"],
		condition: always,
		excludedEthos: ["egalitarian"],
	},
	{
		key: "color_castes",
		name: "Color Castes",
		description:
			"Assigns social rank through permitted dye colors, reinforcing hierarchy and court order while making social mobility a slow, expensive negotiation.",
		category: "social",
		preferredEthos: ["ceremonious", "bureaucratic"],
		condition: always,
		excludedEthos: ["egalitarian"],
	},
	{
		key: "hearth_councils",
		name: "Hearth Councils",
		description:
			"Household elders meet nightly to settle neighborhood disputes before they reach formal courts.",
		category: "social",
		preferredEthos: ["communal", "egalitarian"],
		condition: always,
	},
	{
		key: "plague_taboos",
		name: "Plague Taboos",
		description:
			"Strict cleanliness customs govern touch, food, and gathering; violating them brings communal penalties and ritual quarantine.",
		category: "social",
		preferredEthos: ["bureaucratic", "spiritual"],
		condition: always,
	},

	// ── WARFARE ───────────────────────────────────────────────────────────────
	{
		key: "warrior_culture",
		name: "Warrior Culture",
		description:
			"They value martial prowess and strength above everything else; disputes often settled through formalized duels and trials by combat.",
		category: "warfare",
		preferredEthos: ["bellicose"],
		condition: always,
		excludedEthos: ["communal", "egalitarian"],
	},
	{
		key: "master_smiths",
		name: "Master Smiths",
		description:
			"Known for the production of durable and high quality weapons and armor.",
		category: "warfare",
		preferredEthos: ["bellicose", "stoic", "bureaucratic"],
		condition: (c) => isMountains(c) || isHills(c),
	},
	{
		key: "merciful_blinding",
		name: "Merciful Blinding",
		description:
			"Prefers mutilation to execution, using sanctioned blinding as \"mercy\" and earning piety for harsh restraint.",
		category: "warfare",
		preferredEthos: ["ceremonious", "stoic"],
		condition: always,
	},
	{
		key: "chivalric_code",
		name: "Chivalric Code",
		description:
			"An ideal of honorable warriors and courtly conduct shapes politics and war alike, with duels, vows, and romantic pageantry used to police behavior.",
		category: "warfare",
		preferredEthos: ["ceremonious", "bellicose"],
		condition: always,
	},
	{
		key: "mass_levies",
		name: "Mass Levies",
		description:
			"They rely on large citizen militias and deep reserves of manpower, favoring endurance and numbers over small groups of elite specialists.",
		category: "warfare",
		preferredEthos: ["communal", "egalitarian"],
		condition: always,
	},
	{
		key: "elite_knights",
		name: "Elite Knights",
		description:
			"A small caste of heavily trained champions dominates warfare and status, with personal prowess and reputation valued more than common soldiery.",
		category: "warfare",
		preferredEthos: ["bellicose", "ceremonious"],
		condition: always,
		excludedEthos: ["egalitarian"],
	},
	{
		key: "frugal_armorers",
		name: "Frugal Armorers",
		description:
			"They favor practical, standardized gear and efficient outfitting, fielding bigger armies by avoiding costly extravagance in arms and armor.",
		category: "warfare",
		preferredEthos: ["bureaucratic", "stoic"],
		condition: always,
	},
	{
		key: "formation_experts",
		name: "Formation Experts",
		description:
			"Discipline and unit coordination are prized, with drilled tactics that let mixed troops fight as one machine rather than as scattered heroes.",
		category: "warfare",
		preferredEthos: ["bureaucratic", "stoic", "bellicose"],
		condition: always,
	},
	{
		key: "ritual_duels",
		name: "Ritual Duels",
		description:
			"Conflicts between families are resolved by appointed champions under strict rules, with outcomes treated as binding law.",
		category: "warfare",
		preferredEthos: ["bellicose", "ceremonious"],
		condition: always,
	},
	{
		key: "sword_schools",
		name: "Sword Schools",
		description:
			"Blades are trained as an art and moral discipline, with duels regulated by strict etiquette and licensed masters.",
		category: "warfare",
		preferredEthos: ["bellicose", "ceremonious", "stoic"],
		condition: always,
	},

	// ── RITUAL ────────────────────────────────────────────────────────────────
	{
		key: "culinary_artistry",
		name: "Culinary Artistry",
		description:
			"Cooking is considered a high art, leading to innovative and exquisite dishes.",
		category: "ritual",
		preferredEthos: ["ceremonious", "communal"],
		condition: always,
	},
	{
		key: "exquisite_calligraphy",
		name: "Exquisite Calligraphy",
		description:
			"The art of beautiful handwriting is highly valued; calligraphers are respected for their skill and their work is used for important documents and decorations.",
		category: "ritual",
		preferredEthos: ["ceremonious", "bureaucratic", "spiritual"],
		condition: always,
	},
	{
		key: "frequent_festivals",
		name: "Frequent Festivals",
		description:
			"A variety of festivals are celebrated throughout the year, marked by colorful traditions and raucous celebrations.",
		category: "ritual",
		preferredEthos: ["communal", "ceremonious"],
		condition: always,
	},
	{
		key: "musical_theorists",
		name: "Musical Theorists",
		description:
			"Many individuals take up the noble and celebrated pursuit of musical study from a young age.",
		category: "ritual",
		preferredEthos: ["ceremonious", "spiritual"],
		condition: always,
	},
	{
		key: "philosophical_debates",
		name: "Philosophical Debates",
		description:
			"They have a strong tradition of philosophical inquiry and debate, with scholars engaging in lively discussions about ethics, metaphysics, and other topics.",
		category: "ritual",
		preferredEthos: ["egalitarian", "bureaucratic", "spiritual"],
		condition: always,
	},
	{
		key: "refined_poetry",
		name: "Refined Poetry",
		description:
			"Poetry is considered a noble art and many spend their time piecing words together with meaning and thought.",
		category: "ritual",
		preferredEthos: ["ceremonious", "spiritual"],
		condition: always,
	},
	{
		key: "ritual_scarification",
		name: "Ritual Scarification",
		description:
			"Ritual scarification is used to mark important life events and demonstrate their devotion to a cause; the scars are often elaborate and intricate.",
		category: "ritual",
		preferredEthos: ["spiritual", "bellicose"],
		condition: always,
	},
	{
		key: "sacred_herds",
		name: "Sacred Herds",
		description:
			"Vast herds of holy animals roam freely, untouchable and revered.",
		category: "ritual",
		preferredEthos: ["spiritual", "communal"],
		condition: (c) => isGrassland(c) || isFlat(c),
	},
	{
		key: "storytellers",
		name: "Storytellers",
		description:
			"The past is preserved through ritualistic storytelling, where the heroes and legends of the past are passed down through generations.",
		category: "ritual",
		preferredEthos: ["communal", "spiritual", "ceremonious"],
		condition: always,
	},
	{
		key: "temple_patronage",
		name: "Temple Patronage",
		description:
			"Buys legacy through holy construction, turning temples into massive piety and renown engines across eras.",
		category: "ritual",
		preferredEthos: ["spiritual", "ceremonious", "bureaucratic"],
		condition: always,
	},
	{
		key: "temple_citadels",
		name: "Temple Citadels",
		description:
			"Temple-fortress culture fusing religion and governance into fortified sacred cities, treating new strongholds as holy prestige.",
		category: "ritual",
		preferredEthos: ["spiritual", "bellicose", "ceremonious"],
		condition: always,
	},
	{
		key: "esoteric_power",
		name: "Esoteric Power",
		description:
			"Rulers prove their right to govern through elaborate rites and the public display of holy relics, with ritual weapons and consecrated regalia standing in for crowns.",
		category: "ritual",
		preferredEthos: ["spiritual", "ceremonious"],
		condition: always,
	},
	{
		key: "ritualized_friendship",
		name: "Ritualized Friendship",
		description:
			"Friendship is sealed by formal oaths and binding ceremonies, making sworn companions nearly family—and betrayal a crime that can shake the realm.",
		category: "ritual",
		preferredEthos: ["communal", "ceremonious"],
		condition: always,
	},
	{
		key: "tattoo_lineage",
		name: "Tattoo Lineage",
		description:
			"Genealogy is recorded on the skin through tattoos that mark ancestry, vows, and achievements.",
		category: "ritual",
		preferredEthos: ["ceremonious", "communal", "spiritual"],
		condition: always,
	},
	{
		key: "spice_covenants",
		name: "Spice Covenants",
		description:
			"Merchant families control rare spices and perfumes through marriage pacts and secret recipes, turning cuisine into geopolitics.",
		category: "ritual",
		preferredEthos: ["bureaucratic", "ceremonious"],
		condition: (c) => isWarm(c) || isCoastal(c),
	},
	{
		key: "thunder_drums",
		name: "Thunder Drums",
		description:
			"Massive drums are used as long-distance communication and as ritual instruments said to \"wake\" the storm.",
		category: "ritual",
		preferredEthos: ["spiritual", "bellicose"],
		condition: always,
	},
	{
		key: "cliff_monasteries",
		name: "Cliff Monasteries",
		description:
			"Reclusive sanctuaries cling to sheer rock faces, reachable only by hidden ladders and rope paths.",
		category: "ritual",
		preferredEthos: ["spiritual", "stoic"],
		condition: (c) => isMountains(c) || isHills(c),
	},
]

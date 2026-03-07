import { Ethos } from "./types"

export type EthosInfo = {
	ethos: Ethos
	name: string
	description: string
	weight: number
}

/** All seven ethos with descriptions and weighted frequencies. */
export const ETHOS_WEIGHTS: EthosInfo[] = [
	{
		ethos: "bellicose",
		name: "Bellicose",
		description:
			"Conflict is not incidental to this culture — it is structural. Military capacity is the primary measure by which polities are assessed, warriors occupy the highest rungs of social aspiration, and the experience of organized violence is treated as a normal condition of life rather than a failure of it. This does not mean the culture is reckless: bellicose cultures can be sophisticated, patient, and even peaceful for long stretches. It means that when the question of force arises, it is answered without particular reluctance.",
		weight: 50,
	},
	{
		ethos: "bureaucratic",
		name: "Bureaucratic",
		description:
			"Order is the foundation of everything else, and order requires documentation. This culture maintains meticulous records of land, population, taxation, and law, and authority flows through defined institutional channels rather than personal reputation or charisma alone. The scribe, the administrator, and the census-taker are understood to be as necessary to the functioning of civilization as the soldier or the priest — a conclusion that many cultures reach in theory but few maintain in practice.",
		weight: 10,
	},
	{
		ethos: "ceremonious",
		name: "Ceremonious",
		description:
			"Social life is organized around ritual, and ritual is taken seriously. The correct performance of ceremony is understood to be the mechanism through which legitimacy is expressed, alliances are formed, and the social hierarchy is reproduced and reaffirmed. Deviation from established protocol is rarely accidental and rarely inconsequential. A culture with this orientation tends to produce elaborate court life, detailed systems of rank and precedence, and leaders who are judged as much on the quality of their public presentation as on their practical decisions.",
		weight: 20,
	},
	{
		ethos: "communal",
		name: "Communal",
		description:
			"The group precedes the individual. Resources, labor, and major decisions are organized around collective benefit rather than private accumulation, and the social bonds of family, neighborhood, and tribe are treated as the primary units of political life. This culture is often cohesive to a degree that outside observers find remarkable, and correspondingly resistant to the kind of internal fragmentation that individualistic cultures experience. The cost is a certain pressure toward conformity that can be suffocating for those who do not fit the pattern.",
		weight: 60,
	},
	{
		ethos: "egalitarian",
		name: "Egalitarian",
		description:
			"Inherited rank is tolerated where it proves useful and contested where it does not. This culture is skeptical of claims to authority that cannot be demonstrated through practical competence, and it tends to be more open than most to outsiders, converts, and those of unconventional origin who can show their worth. The preference for merit over birth is a genuine value rather than merely rhetorical — it shapes inheritance law, military promotion, and the criteria by which leaders are judged and replaced.",
		weight: 20,
	},
	{
		ethos: "spiritual",
		name: "Spiritual",
		description:
			"The invisible world is taken to be as real as the visible one, and the relationship between this culture and whatever forces or beings inhabit it shapes decisions at every level of social life — agricultural, military, medical, and political. Religious specialists occupy positions of genuine authority, not merely ceremonial ones, and the calendar of religious obligation structures the year in ways that practical necessity must accommodate rather than override. Theological disputes here have political consequences.",
		weight: 40,
	},
	{
		ethos: "stoic",
		name: "Stoic",
		description:
			"Endurance is a virtue, and the expectation of hardship is built into this culture's self-conception from an early age. Their demeanor in the face of difficulty is measured and undemonstrative — what outsiders sometimes read as coldness or resignation is, from within, considered simple dignity. The culture has a high tolerance for sustained adversity and a correspondingly low tolerance for complaint. Those who cope well under pressure are admired; those who do not are regarded with something between sympathy and quiet contempt.",
		weight: 50,
	},
]

/**
 * Pick one ethos using weighted random selection via dice primitives.
 */
export function pickEthos(): Ethos {
	const weighted = ETHOS_WEIGHTS.map((e) => ({ v: e.ethos, w: e.weight }))
	return window.dice.weightedChoice(weighted) ?? "communal"
}

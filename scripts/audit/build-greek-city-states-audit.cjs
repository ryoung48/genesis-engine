// One-off generator for the Greek city-state / Aegean pre-2AD audit batch.
// Writes 10 nation files plus shared wars and revolts files.
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(month, day) {
	return CUM_MONTH_DAYS[month - 1] + day
}

function eu4DateToDays(astroYear, month, day) {
	return (
		(astroYear - EARTH_HISTORY_START_YEAR) * 365 +
		dayOfYear(month, day) -
		dayOfYear(1, 1)
	)
}

function bc(year) {
	return 1 - year
}

function d(year, month = 1, day = 1) {
	return eu4DateToDays(bc(year), month, day)
}

function nationBuilder(tag, extra = {}) {
	const events = []
	function event(year, kind, payload, note, sourceConfidence = "traditional") {
		events.push({ date: d(year), kind, payload, note, sourceConfidence })
	}
	function ruler(year, name, opts = {}) {
		const { note, sourceConfidence = "traditional", ...payload } = opts
		event(year, "rulerChange", { name, ...payload }, note, sourceConfidence)
	}
	function govChange(year, governmentType, note, sourceConfidence = "traditional") {
		event(year, "governmentChange", { governmentType }, note, sourceConfidence)
	}
	function reformAdd(year, reformId, note, sourceConfidence = "traditional") {
		event(year, "governmentReformAdd", { reformId }, note, sourceConfidence)
	}
	return { tag, events, ruler, govChange, reformAdd, ...extra }
}

function war({
	warId,
	name,
	casusBelli,
	warGoalType,
	warGoalTag = null,
	warGoalProvince = null,
	attacker,
	defender,
	start,
	end,
	battles = [],
	note,
	sourceConfidence = "traditional",
}) {
	const events = []
	for (const tag of attacker) events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	for (const tag of defender) events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	for (const tag of attacker) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	for (const tag of defender) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	return {
		warId,
		name,
		casusBelli,
		warGoalType,
		warGoalTag,
		warGoalProvince,
		isRebel: false,
		events,
		battles,
		note,
		sourceConfidence,
	}
}

function battle({
	year,
	month = 1,
	day = 1,
	name,
	locationProvinceId,
	attacker,
	defender,
	attackerWon,
	note,
	sourceConfidence = "traditional",
}) {
	return {
		date: d(year, month, day),
		name,
		locationProvinceId,
		attacker,
		defender,
		attackerWon,
		note,
		sourceConfidence,
	}
}

function revoltEvent({ year, type, size, leader, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return { date: d(year), kind: "revolt", payload: { revolt }, comment, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the Greek city-state/Aegean batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Existing audits already cover Greco-Persian Wars, Sicilian Wars, Macedonian conquest/intervention, the Lamian War, and Rome's Achaean War; this batch focuses on internal Greek political development and wars. Province culture/religion was audited and no forced additions were made: local Greek provinces already carry greek/griko culture and hellenism through the pre-2AD period."

const minoan = nationBuilder("cp_minoan_civilization")
minoan.govChange(2000, "monarchy", "Approximate emergence of Minoan palace centers on Crete")
minoan.reformAdd(2000, "aristocratic_monarchy", "Reuses an existing monarchy reform id for palace-centered Bronze Age authority", "abstraction")
for (const [year, name, note] of [
	[2000, "Old Palace elites of Knossos and Phaistos", "First palace period; no secure dynastic king list exists"],
	[1700, "Neopalatial palace administration", "Rebuilt palace system after destructions around 1700 BC"],
	[1450, "Late Minoan palace collapse", "Most Minoan palace centers decline or are destroyed; Knossos continues under strong Mycenaean influence"],
]) minoan.ruler(year, name, { note, sourceConfidence: "abstraction" })

const mycenaean = nationBuilder("cp_mycenaean_greece")
mycenaean.govChange(1600, "monarchy", "Approximate rise of Mycenaean shaft-grave and palatial elites")
mycenaean.reformAdd(1600, "aristocratic_monarchy", "Reuses an existing monarchy reform id for wanax-led palace kingdoms", "abstraction")
for (const [year, name, note] of [
	[1600, "Shaft Grave dynasts", "Early Mycenaean elite formation at Mycenae; individual rulers are not securely named"],
	[1450, "Mycenaean palatial kingdoms", "Mycenaean Greek palace culture expands across mainland Greece and Crete"],
	[1250, "Late palatial wanaktes", "Height of the palace system; names remain mostly from Linear B titles rather than narrative history"],
	[1180, "Post-palatial collapse", "Destruction and abandonment of many palace centers in the wider Late Bronze Age collapse"],
]) mycenaean.ruler(year, name, { note, sourceConfidence: "abstraction" })

const darkAges = nationBuilder("cp_greek_dark_ages")
darkAges.govChange(1100, "tribal", "Post-palatial local chiefdoms and small communities after the Bronze Age collapse")
darkAges.reformAdd(1100, "tribal_kingdom", "Proposed/reused generic tribal reform id for small post-palatial basileis; no Greek Dark Age-specific reform is present", "abstraction")
for (const [year, name, note] of [
	[1100, "Post-palatial basileis", "Local chiefs replace palace administrations; no centralized succession list exists"],
	[1000, "Protogeometric communities", "Archaeological phase marking recovery and regional differentiation"],
	[800, "Archaic polis formation", "Population recovery, alphabet adoption, sanctuaries, and colonization set up the Greek polis world"],
]) darkAges.ruler(year, name, { note, sourceConfidence: "abstraction" })

const greek = nationBuilder("cp_athens")
greek.govChange(800, "republic", "Archaic polis world with mixed oligarchic, aristocratic, tyrannical, and democratic civic governments")
greek.reformAdd(800, "classical_polis", "Proposed new reform id: no existing reform captures a decentralized Greek polis field", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[776, "Olympiad magistrates", "Traditional first Olympiad; used as a dated marker for the emerging inter-polis world", "abstraction"],
	[683, "Athenian annual archons", "Athens moves toward annual archonship; a civic office marker rather than a single ruler"],
	[621, "Draco", "Athenian lawgiver associated with the first written law code"],
	[594, "Solon", "Archon and reformer whose legislation addressed debt, status, and civic participation"],
	[561, "Peisistratus", "Athenian tyrant whose periods of rule reshaped Athens before the democracy"],
	[527, "Hippias and Hipparchus", "Peisistratid rule after Peisistratus's death"],
	[508, "Cleisthenes", "Athenian democratic reforms reorganize tribes and institutions"],
	[483, "Themistocles", "Athenian naval policy and silver-revenue decision before Xerxes's invasion"],
	[461, "Pericles and Ephialtes", "Radical democratic reforms and Periclean leadership after Ephialtes's attack on Areopagus power"],
	[429, "Cleon and wartime demagogues", "Leadership phase after Pericles's death during the Peloponnesian War", "abstraction"],
	[411, "The Four Hundred", "Athenian oligarchic coup during the later Peloponnesian War"],
	[404, "The Thirty Tyrants", "Spartan-backed oligarchy imposed after Athens's defeat"],
	[403, "Restored Athenian democracy", "Thrasybulus and democratic exiles restore democracy after civil conflict"],
	[371, "Spartan hegemony broken", "Leuctra ends Spartan dominance and shifts mainland leadership toward Thebes", "abstraction"],
	[338, "League of Corinth settlement", "After Chaeronea, most Greek poleis fall under Macedonian hegemony"],
]) greek.ruler(year, name, { note, sourceConfidence: confidence })

const colonies = nationBuilder("cp_syracuse")
colonies.govChange(750, "republic", "Archaic and Classical Greek colonial poleis around the Mediterranean and Black Sea")
colonies.reformAdd(750, "classical_polis", "Uses the same proposed polis reform id as cp_athens", "abstraction")
for (const [year, name, note] of [
	[750, "Euboean and Corinthian colonists", "Early colonial wave in the central Mediterranean"],
	[734, "Archias of Corinth", "Traditional founder of Syracuse"],
	[706, "Spartan Partheniai at Taras", "Traditional foundation of Taras/Tarentum in Magna Graecia"],
	[657, "Byzas of Megara", "Traditional foundation of Byzantion"],
	[600, "Phocaean founders of Massalia", "Marks the western Greek colonial network"],
	[560, "Black Sea colony networks", "Greek colonial poleis around the Euxine/Black Sea flourish through grain and trade links"],
]) colonies.ruler(year, name, { note, sourceConfidence: "abstraction" })

const athenianCoalition = nationBuilder("cp_athens")
athenianCoalition.govChange(431, "republic", "Athenian-led alliance field for the Peloponnesian War in local province history")
athenianCoalition.reformAdd(431, "classical_polis", "Uses proposed polis reform id; this tag represents an alliance, not a unitary state", "abstraction")
for (const [year, name, note] of [
	[431, "Pericles", "Athenian strategic leadership at the start of the Peloponnesian War"],
	[415, "Alcibiades, Nicias, and Lamachus", "Joint commanders chosen for the Sicilian Expedition"],
	[404, "Athenian surrender", "Athens capitulates to Sparta; the tag's role is essentially exhausted"],
]) athenianCoalition.ruler(year, name, { note, sourceConfidence: "abstraction" })

const secondLeague = nationBuilder("cp_athens")
secondLeague.govChange(378, "republic", "Second Athenian League founded against Spartan hegemony")
secondLeague.reformAdd(378, "classical_polis", "Uses proposed polis reform id for an Athenian-led federal alliance", "abstraction")
for (const [year, name, note] of [
	[378, "Chabrias, Callistratus, and Athenian synedrion", "Founding phase of the Second Athenian League"],
	[376, "Chabrias", "Athenian naval victory at Naxos strengthens the league"],
	[357, "Chares and allied revolts", "Social War begins as Chios, Rhodes, Cos, and Byzantium revolt from Athenian leadership"],
	[355, "Peace after the Social War", "Athenian naval league is sharply reduced after recognizing allied autonomy"],
]) secondLeague.ruler(year, name, { note, sourceConfidence: "abstraction" })

const sacredBand = nationBuilder("cp_sacred_band_of_thebes")
sacredBand.govChange(378, "republic", "Theban democratic/oligarchic civic field around the elite Sacred Band")
sacredBand.reformAdd(378, "classical_polis", "Uses proposed polis reform id for Theban civic military leadership", "abstraction")
for (const [year, name, note] of [
	[378, "Gorgidas", "Credited with organizing the Sacred Band of Thebes"],
	[375, "Pelopidas", "Theban commander associated with the Sacred Band's victory at Tegyra"],
	[371, "Epaminondas and Pelopidas", "Theban leadership at Leuctra"],
	[338, "The Sacred Band destroyed", "The unit is destroyed at Chaeronea fighting Philip II and Alexander"],
]) sacredBand.ruler(year, name, { note, sourceConfidence: "traditional" })

const thebans = nationBuilder("cp_thebans")
thebans.govChange(379, "republic", "Theban anti-Spartan democratic restoration after expelling the Spartan garrison")
thebans.reformAdd(379, "classical_polis", "Uses proposed polis reform id for Theban civic government", "abstraction")
for (const [year, name, note] of [
	[379, "Pelopidas and Theban exiles", "Liberate Thebes from Spartan control"],
	[371, "Epaminondas", "Leads Theban victory at Leuctra and the short Theban hegemony"],
	[362, "Epaminondas at Mantinea", "Dies after an indecisive victory; Theban hegemony fades"],
]) thebans.ruler(year, name, { note })

const rhodes = nationBuilder("cp_rhodes")
rhodes.govChange(408, "republic", "Synoecism of the island's cities into the city of Rhodes")
rhodes.reformAdd(408, "classical_polis", "Uses proposed polis reform id for the Rhodian civic republic", "abstraction")
for (const [year, name, note] of [
	[408, "Rhodian synoecism", "Ialysos, Kamiros, and Lindos found the city of Rhodes"],
	[305, "Rhodian democracy during Demetrius's siege", "Rhodes resists Demetrius Poliorcetes and emerges as a major naval republic"],
]) rhodes.ruler(year, name, { note, sourceConfidence: "abstraction" })

const wars = [
	war({
		warId: "peloponnesianWar",
		name: "Peloponnesian War",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "146",
		attacker: ["cp_athens"],
		defender: ["cp_athens"],
		start: d(431),
		end: d(404),
		note: "Sparta and its Peloponnesian allies defeat Athens and its empire. No separate Sparta tag exists, so cp_athens stands in for the anti-Athenian Greek coalition.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 425, name: "Pylos and Sphacteria", locationProvinceId: "145", attacker: { country: "cp_athens", commander: "Demosthenes and Cleon", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Spartan garrison", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Morea (145) stands in for Pylos/Sphacteria." }),
			battle({ year: 422, name: "Amphipolis", locationProvinceId: "147", attacker: { country: "cp_athens", commander: "Brasidas", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Cleon", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Salonica (147) stands in for Amphipolis in Macedonia/Thrace." }),
			battle({ year: 413, name: "Syracuse", locationProvinceId: "2982", attacker: { country: "cp_syracuse", commander: "Gylippus and Syracusans", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Nicias and Demosthenes", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Syracuse (2982) is directly available; cp_syracuse stands in for Syracuse." }),
			battle({ year: 405, name: "Aegospotami", locationProvinceId: "4779", attacker: { country: "cp_athens", commander: "Lysander", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Athenian fleet", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Gallipoli (4779) stands in for Aegospotami in the Hellespont." }),
		],
	}),
	war({
		warId: "corinthianWar",
		name: "Corinthian War",
		casusBelli: "cb_independence_war",
		warGoalType: "take_claim",
		warGoalProvince: "4701",
		attacker: ["cp_athens", "cp_athens"],
		defender: ["cp_athens"],
		start: d(395),
		end: d(387),
		note: "Athens, Thebes, Corinth, Argos, and Persian support challenge Spartan hegemony; because no Sparta/Corinth tags exist, cp_athens appears on both sides as a documented abstraction.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 394, name: "Nemea", locationProvinceId: "4701", attacker: { country: "cp_athens", commander: "Spartan coalition", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Anti-Spartan coalition", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Corinth (4701) stands in for the Nemea/Corinth theater.", sourceConfidence: "abstraction" }),
			battle({ year: 394, name: "Cnidus", locationProvinceId: "321", attacker: { country: "cp_athens", commander: "Conon and Pharnabazus", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Peisander", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Cyprus (321) stands in for the southeast Aegean naval theater; no Cnidus province exists.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "boeotianWar",
		name: "Boeotian War and Theban Hegemony",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "146",
		attacker: ["cp_thebans", "cp_sacred_band_of_thebes"],
		defender: ["cp_athens"],
		start: d(378),
		end: d(362),
		note: "Thebes breaks Spartan hegemony and briefly dominates mainland Greece. cp_athens stands in for Sparta and allied opponents because no Sparta tag exists.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 375, name: "Tegyra", locationProvinceId: "146", attacker: { country: "cp_sacred_band_of_thebes", commander: "Pelopidas", infantry: 300, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Spartan morae", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Athens (146) stands in for Boeotia/Orchomenus; no Boeotia province exists.", sourceConfidence: "abstraction" }),
			battle({ year: 371, name: "Leuctra", locationProvinceId: "146", attacker: { country: "cp_thebans", commander: "Epaminondas and Pelopidas", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Cleombrotus I", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Athens (146) stands in for Boeotia." }),
			battle({ year: 362, name: "Mantinea", locationProvinceId: "145", attacker: { country: "cp_thebans", commander: "Epaminondas", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Spartan-Athenian coalition", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Morea (145) stands in for Mantinea; Thebes wins tactically but loses Epaminondas and strategic momentum." }),
		],
	}),
	war({
		warId: "socialWarAthenianLeague",
		name: "Social War of the Second Athenian League",
		casusBelli: "cb_independence_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_athens",
		attacker: ["cp_rhodes", "cp_syracuse"],
		defender: ["cp_athens"],
		start: d(357),
		end: d(355),
		note: "Rhodes, Chios, Cos, and Byzantium revolt from Athenian leadership; cp_syracuse stands in for the non-Rhodes allied island/colonial poleis.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 356, name: "Embata", locationProvinceId: "2348", attacker: { country: "cp_rhodes", commander: "Rebel allies", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Chares / Iphicrates / Timotheus", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Lesbos (2348) stands in for the eastern Aegean/Chios-Embata theater.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "siegeOfRhodes",
		name: "Siege of Rhodes",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalTag: "cp_rhodes",
		attacker: ["cp_antigonid_dynasty"],
		defender: ["cp_rhodes"],
		start: d(305),
		end: d(304),
		note: "Demetrius Poliorcetes unsuccessfully besieges Rhodes after the island refuses to abandon its Ptolemaic alignment.",
		battles: [
			battle({ year: 305, name: "Siege of Rhodes", locationProvinceId: "321", attacker: { country: "cp_antigonid_dynasty", commander: "Demetrius Poliorcetes", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_rhodes", commander: "Rhodian defenders", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: false, note: "Cyprus (321) is the nearest island-province stand-in; no Rhodes province appears in the local EU4 province set.", sourceConfidence: "abstraction" }),
		],
	}),
]

const revolts = {
	"146": {
		events: [
			revoltEvent({ year: 632, type: "pretender_rebels", size: 2, leader: "Cylon", comment: "Cylonian attempt", note: "Cylon's failed attempt to seize tyranny in Athens; no separate faction tag exists, so this is a province-level pretender revolt." }),
			revoltEvent({ year: 411, type: "noble_rebels", size: 3, leader: "The Four Hundred", comment: "Athenian oligarchic coup", note: "Oligarchic coup during the Peloponnesian War. It also has a nation audit ruler marker, but no separate tag exists for the coup faction.", sourceConfidence: "abstraction" }),
			revoltEvent({ year: 404, type: "noble_rebels", size: 3, leader: "The Thirty Tyrants", comment: "Thirty Tyrants regime", note: "Spartan-backed oligarchic takeover after Athens's surrender; represented as a revolt because no separate Thirty tag exists.", sourceConfidence: "abstraction" }),
		],
	},
	"321": {
		events: [
			revoltEvent({ year: 499, type: "nationalist_rebels", size: 3, comment: "Cypriot phase of the Ionian Revolt", note: "Cypriot cities joined the Ionian Revolt against Persia; the broader Greco-Persian War already exists, but no Cypriot rebel tag exists for the local uprising.", sourceConfidence: "abstraction" }),
		],
	},
}

function writeNation(builder) {
	fs.writeFileSync(
		path.join(auditsDir, `${builder.tag}.json`),
		JSON.stringify({ _readme: readme, tag: builder.tag, events: builder.events.sort((a, b) => a.date - b.date) }, null, "\t") + "\n",
	)
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })

for (const builder of [minoan, mycenaean, darkAges, greek, colonies, athenianCoalition, secondLeague, sacredBand, thebans, rhodes]) {
	writeNation(builder)
}

fs.writeFileSync(
	path.join(warsDir, "greek-city-states-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: wars for the Greek city-state/Aegean batch. Greco-Persian Wars, Sicilian Wars, Macedonian intervention/conquest, Lamian War, and Achaean War are already covered in other audit war files and intentionally not duplicated here.",
			wars: wars.sort((a, b) => a.events[0].date - b.events[0].date),
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "greek-city-states-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Greek city-state/Aegean batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields. Only covers internal coups/local uprisings with no separate tag.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote 10 nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)

// One-off generator for the Korea / Southeast Asia / South India pre-2AD audit batch.
// Writes 8 nation files plus shared wars and revolts files.
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(month, day) {
	return CUM_MONTH_DAYS[month - 1] + day
}

function eu4DateToDays(astroYear, month, day) {
	return (astroYear - EARTH_HISTORY_START_YEAR) * 365 + dayOfYear(month, day) - dayOfYear(1, 1)
}

function bc(year) {
	return 1 - year
}

function d(year, month = 1, day = 1) {
	return eu4DateToDays(bc(year), month, day)
}

function nationBuilder(tag, { provinceEvents = null } = {}) {
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
	return { tag, events, ruler, govChange, reformAdd, provinceEvents }
}

function provinceEvent(year, kind, payload, note, sourceConfidence = "abstraction") {
	return { date: d(year), kind, payload, note, sourceConfidence }
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
	return { date: d(year, month, day), name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence }
}

function revoltEvent({ year, type, size, leader, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return { date: d(year), kind: "revolt", payload: { revolt }, comment, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the Korea / Southeast Asia / South India batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Ruler lists are deliberately conservative where the historical record is legendary or only retrospectively preserved; provinceEvents only mark clear religion-baseline mismatches using existing religion ids."

function addCore(builder, govYear, gov, reform, govNote, reformNote) {
	builder.govChange(govYear, gov, govNote)
	builder.reformAdd(govYear, reform, reformNote, "abstraction")
}

const koreanReform = "tribal_federation"
const indianMonarchyReform = "aristocratic_monarchy"

const gojoseon = nationBuilder("cp_gojoseon")
addCore(
	gojoseon,
	2333,
	"monarchy",
	indianMonarchyReform,
	"Traditional Dangun foundation date for Gojoseon; retained as a legendary state-origin marker rather than a firm regnal date",
	"Reuses an existing monarchy reform id for hereditary early kingship pending a dedicated ancient Korean reform.",
)
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[2333, "Dangun Wanggeom", "Dangun", "Legendary founder in Korean tradition; chronology is mythic", "abstraction"],
	[1122, "Gija / Jizi tradition", "Gija", "Later tradition associates Gija with Gojoseon; historicity is debated", "abstraction"],
	[300, "Late Gojoseon kings", "Joseon", "Chinese sources imply a kingship before the Wiman takeover; names are not securely preserved", "abstraction"],
	[194, "Wi Man", "Wiman", "Wiman seizes power and establishes Wiman Joseon in the northwest Korean/Liaodong sphere"],
	[160, "Unnamed Wiman successor", "Wiman", "Intermediate Wiman ruler between Wi Man and Ugeo is attested only generically", "abstraction"],
	[130, "Ugeo", "Wiman", "Last king of Wiman Joseon, defeated by Han in 108 BC"],
]) {
	gojoseon.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
}

const dongOkjeo = nationBuilder("cp_dong_okjeo")
addCore(
	dongOkjeo,
	100,
	"tribal",
	koreanReform,
	"Dong-okjeo appears in Chinese and Korean historical geography as an eastern Korean tribal polity after Gojoseon's fall",
	"Proposed generic tribal-federation reform id for a non-monarchical small polity; review if this id is not yet engine-backed.",
)
for (const [year, name, note] of [
	[100, "Okjeo village chiefs", "No secure king list survives; Chinese accounts describe chiefly local communities"],
	[56, "Goguryeo tributary phase", "Dong-okjeo is traditionally brought under Goguryeo influence after the pre-2AD window; this marker records the late independent phase"],
]) {
	dongOkjeo.ruler(year, name, { dynasty: "Okjeo", note, sourceConfidence: "abstraction" })
}

const byeonhan = nationBuilder("cp_byeonhan")
addCore(
	byeonhan,
	100,
	"tribal",
	koreanReform,
	"Byeonhan emerges as one of the southern Korean Samhan confederations by the late first millennium BC / early first century BC",
	"Proposed generic tribal-federation reform id for Samhan confederated chiefdoms.",
)
for (const [year, name, note] of [
	[100, "Byeonhan confederated chiefs", "No secure pre-2AD individual ruler list is preserved"],
	[50, "Late Byeonhan iron-trade chiefs", "Archaeological and textual tradition associate Byeonhan with southern Korean iron production and exchange"],
]) {
	byeonhan.ruler(year, name, { dynasty: "Byeonhan", note, sourceConfidence: "abstraction" })
}

const auLacProvinceEvents = Object.fromEntries(
	["610", "613", "616", "1016", "2164", "2372", "4819"].map((provinceId) => [
		provinceId,
		[
			provinceEvent(257, "religion", { religionId: "animism" }, "Au Lac predates Mahayana Buddhist dominance in northern Vietnam; animism is the closest existing id for Dong Son/Viet-Baiyue local cult practice.", "abstraction"),
		],
	]),
)

const auLac = nationBuilder("cp_au_lac", { provinceEvents: auLacProvinceEvents })
addCore(
	auLac,
	257,
	"monarchy",
	indianMonarchyReform,
	"Thuc Phan / An Duong Vuong traditionally founds Au Lac by uniting Au Viet and Lac Viet groups",
	"Reuses generic ancient monarchy reform id for Co Loa-centered kingship.",
)
auLac.ruler(257, "An Duong Vuong", {
	dynasty: "Thuc",
	note: "Traditional founder and sole well-attested ruler of Au Lac; defeated by Zhao Tuo's Nanyue around 179 BC",
})

const anuradhapuraProvinceEvents = Object.fromEntries(
	["572", "2099", "2100", "4407", "4408", "4409"].map((provinceId) => [
		provinceId,
		[
			provinceEvent(377, "religion", { religionId: "hinduism" }, "Pre-Mahinda Anuradhapura religion was not yet province-wide Buddhism; hinduism is used as the closest existing South Asian pre-Buddhist cult id.", "abstraction"),
			provinceEvent(247, "religion", { religionId: "buddhism" }, "Traditional date for Mahinda's mission during Devanampiya Tissa, establishing Buddhism as the royal and monastic religion in Anuradhapura."),
		],
	]),
)

const anuradhapura = nationBuilder("cp_anuradhapura", { provinceEvents: anuradhapuraProvinceEvents })
addCore(
	anuradhapura,
	437,
	"monarchy",
	indianMonarchyReform,
	"Anuradhapura becomes the royal center under Pandukabhaya in traditional Sri Lankan chronology",
	"Reuses existing monarchy reform id for early Lankan kingship.",
)
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[543, "Vijaya", "Vijaya", "Legendary Indo-Aryan founder in the Mahavamsa; included as origin tradition", "abstraction"],
	[505, "Upatissa", "Vijaya", "Regent/founder of Upatissa Nuwara in traditional chronology"],
	[504, "Panduvasdeva", "Vijaya", "Early ruler in the traditional Lankan king list"],
	[474, "Abhaya", "Vijaya", "Traditional early Anuradhapura predecessor"],
	[454, "Tissa", "Vijaya", "Traditional early ruler; details are sparse"],
	[437, "Pandukabhaya", "Vijaya", "Credited with organizing Anuradhapura as capital"],
	[367, "Mutasiva", "Vijaya", "Pre-Buddhist ruler and father of Devanampiya Tissa"],
	[307, "Devanampiya Tissa", "Vijaya", "Associated with Ashokan contact and Mahinda's Buddhist mission"],
	[267, "Uttiya", "Vijaya", "Successor of Devanampiya Tissa in traditional chronology"],
	[257, "Mahasiva", "Vijaya", "Traditional king of Anuradhapura"],
	[247, "Suratissa", "Vijaya", "Traditional king displaced by Sena and Guttika"],
	[237, "Sena and Guttika", "Tamil horse-traders", "Tamil usurpers in the Mahavamsa tradition"],
	[215, "Asela", "Vijaya", "Restores the native line before Elara's conquest"],
	[205, "Elara", "Chola", "Tamil ruler traditionally from Chola country; remembered as just but foreign"],
	[161, "Dutugemunu", "Vijaya", "Defeats Elara and reunites the island around Anuradhapura"],
	[137, "Saddha Tissa", "Vijaya", "Brother and successor of Dutugemunu"],
	[119, "Thulatthana", "Vijaya", "Short-reigned successor"],
	[119, "Lanja Tissa", "Vijaya", "Traditional ruler after Thulatthana"],
	[109, "Khallata Naga", "Vijaya", "Traditional Anuradhapura king"],
	[103, "Vattagamani Abhaya", "Vijaya", "Deposed during Tamil occupation and later restored"],
	[103, "The Five Dravidians", "Tamil usurpers", "Tamil occupation during Vattagamani's exile"],
	[89, "Vattagamani Abhaya restored", "Vijaya", "Restores Anuradhapura rule after defeating the Tamil usurpers"],
	[77, "Mahakuli Mahatissa", "Vijaya", "Traditional Anuradhapura king"],
	[63, "Chora Naga", "Vijaya", "Traditional Anuradhapura king"],
	[51, "Kuda Tissa", "Vijaya", "Traditional Anuradhapura king"],
	[47, "Anula", "Vijaya", "Queen Anula's short reign after palace succession crises"],
	[42, "Kutakanna Tissa", "Vijaya", "Restores stable kingship after Anula"],
	[20, "Bhatikabhaya Abhaya", "Vijaya", "Begins reign before 2 AD and continues into the first century AD"],
]) {
	anuradhapura.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
}

const earlyCheras = nationBuilder("cp_early_cheras")
addCore(
	earlyCheras,
	300,
	"monarchy",
	indianMonarchyReform,
	"Early Chera polity is attested in the Tamilakam horizon by the late first millennium BC / early historic period",
	"Reuses existing monarchy reform id for dynastic Tamilakam kingship.",
)
for (const [year, name, note, confidence = "traditional"] of [
	[300, "Early Chera lineages", "Pre-Sangam Chera rulers are poorly dated; this marker anchors the dynasty to the local province-history start", "abstraction"],
	[100, "Uthiyan Cheralathan tradition", "Early Chera king in Sangam tradition; date is approximate and debated", "abstraction"],
]) {
	earlyCheras.ruler(year, name, { dynasty: "Chera", note, sourceConfidence: confidence })
}

const earlyCholas = nationBuilder("cp_early_cholas")
addCore(
	earlyCholas,
	300,
	"monarchy",
	indianMonarchyReform,
	"Early Chola polity is attested as one of the Tamil crowned lineages in the early historic south",
	"Reuses existing monarchy reform id for dynastic Tamilakam kingship.",
)
for (const [year, name, note, confidence = "traditional"] of [
	[300, "Early Chola lineages", "Pre-Sangam Chola chronology is sparse; marker follows the local province-history start", "abstraction"],
	[100, "Ilamcetcenni tradition", "Early Chola ruler named in later/Sangam tradition; date is approximate and debated", "abstraction"],
]) {
	earlyCholas.ruler(year, name, { dynasty: "Chola", note, sourceConfidence: confidence })
}

const earlyPandyas = nationBuilder("cp_early_pandyas")
addCore(
	earlyPandyas,
	300,
	"monarchy",
	indianMonarchyReform,
	"Pandya polity is known to classical observers and Tamil tradition as an early historic Tamil kingdom centered around Madurai/Korkai",
	"Reuses existing monarchy reform id for dynastic Tamilakam kingship.",
)
for (const [year, name, note, confidence = "traditional"] of [
	[300, "Early Pandya lineages", "Pre-Sangam Pandya chronology is sparse; marker follows the local province-history start", "abstraction"],
	[300, "Megasthenes's Pandya notice", "Greek reports describe a southern Indian Pandya realm; not a ruler name but a dated external attestation", "abstraction"],
	[100, "Mudukudumi Peruvaludi tradition", "Early Pandya king in Tamil tradition; date is approximate and debated", "abstraction"],
]) {
	earlyPandyas.ruler(year, name, { dynasty: "Pandya", note, sourceConfidence: confidence })
}

const wars = [
	war({
		warId: "hanConquestOfGojoseon",
		name: "Han conquest of Wiman Joseon",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_gojoseon",
		warGoalProvince: "733",
		attacker: ["cp_han"],
		defender: ["cp_gojoseon"],
		start: d(109),
		end: d(108),
		note: "Emperor Wu's campaign destroys Wiman Joseon and creates the Han commanderies. cp_han is already covered in the China transition audit.",
		battles: [
			battle({
				year: 108,
				name: "Siege of Wanggeom-seong",
				locationProvinceId: "733",
				attacker: { country: "cp_han", commander: "Xun Zhi and Yang Pu", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_gojoseon", commander: "King Ugeo's court", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Pyeongan (733) stands in for Wanggeom-seong near the Gojoseon core.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "qinCampaignAgainstAuVietLacViet",
		name: "Qin campaign against the Yue of Lingnan",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_au_lac",
		warGoalProvince: "2372",
		attacker: ["cp_qin_dynasty"],
		defender: ["cp_au_lac"],
		start: d(218),
		end: d(214),
		note: "Qin southern expansion against Yue polities is represented against Au Lac because it is the available northern Vietnam polity tag; the campaign predates Nanyue's takeover.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 214,
				name: "Qin occupation of the Red River approaches",
				locationProvinceId: "2372",
				attacker: { country: "cp_qin_dynasty", commander: "Tu Sui / Qin southern generals", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_au_lac", commander: "Au Viet and Lac Viet defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Thang Long (2372) stands in for the Red River delta theater; exact battle sites are not cleanly represented.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "nanyueConquestOfAuLac",
		name: "Nanyue conquest of Au Lac",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_au_lac",
		warGoalProvince: "2372",
		attacker: ["cp_nanyue"],
		defender: ["cp_au_lac"],
		start: d(181),
		end: d(179),
		note: "Zhao Tuo's Nanyue absorbs Au Lac after the fall of Qin and the formation of Nanyue.",
		battles: [
			battle({
				year: 179,
				name: "Fall of Co Loa",
				locationProvinceId: "2372",
				attacker: { country: "cp_nanyue", commander: "Zhao Tuo / Nanyue forces", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_au_lac", commander: "An Duong Vuong", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Thang Long (2372) is the closest Red River delta stand-in for Co Loa.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "elaraConquestOfAnuradhapura",
		name: "Elara's conquest of Anuradhapura",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_anuradhapura",
		warGoalProvince: "572",
		attacker: ["cp_early_cholas"],
		defender: ["cp_anuradhapura"],
		start: d(205),
		end: d(205),
		note: "Mahavamsa tradition presents Elara as a Tamil ruler from Chola country who takes Anuradhapura from Asela; cp_early_cholas is the closest existing tag.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 205,
				name: "Capture of Anuradhapura by Elara",
				locationProvinceId: "572",
				attacker: { country: "cp_early_cholas", commander: "Elara", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_anuradhapura", commander: "Asela", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Ceylon (572) stands in for Anuradhapura.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "dutugemunuWarAgainstElara",
		name: "Dutugemunu's war against Elara",
		casusBelli: "cb_restore_personal_union",
		warGoalType: "take_province",
		warGoalTag: "cp_anuradhapura",
		warGoalProvince: "572",
		attacker: ["cp_anuradhapura"],
		defender: ["cp_early_cholas"],
		start: d(163),
		end: d(161),
		note: "Dutugemunu defeats Elara and restores Anuradhapura rule over the island; represented against cp_early_cholas because Elara is the Chola-linked Tamil ruler in the available tags.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 161,
				name: "Duel and battle at Anuradhapura",
				locationProvinceId: "572",
				attacker: { country: "cp_anuradhapura", commander: "Dutugemunu", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_early_cholas", commander: "Elara", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Ceylon (572) stands in for the Anuradhapura battlefield.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "pandyanCholanMaritimeConflict",
		name: "Early Pandya-Chola conflict tradition",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_early_cholas",
		warGoalProvince: "2026",
		attacker: ["cp_early_pandyas"],
		defender: ["cp_early_cholas"],
		start: d(100),
		end: d(95),
		note: "Sangam-era Pandya and Chola conflict traditions are poorly dated before 2 AD; included as an abstraction because both major opposing tags exist and early rivalry is central to the Tamilakam polity set.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "cheraPandyaWesternGhatsConflict",
		name: "Early Chera-Pandya western Tamilakam conflict tradition",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_early_pandyas",
		warGoalProvince: "536",
		attacker: ["cp_early_cheras"],
		defender: ["cp_early_pandyas"],
		start: d(100),
		end: d(95),
		note: "Represents early Chera-Pandya rivalry across the western Ghats and pearl/coastal exchange routes; dating and exact campaigns are abstraction-level.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
]

const revolts = {
	"572": {
		events: [
			revoltEvent({
				year: 103,
				type: "pretender_rebels",
				size: 3,
				leader: "Pulahattha",
				comment: "Five Dravidian usurpers",
				note: "The Five Dravidians depose Vattagamani Abhaya and rule Anuradhapura during his exile; represented as a pretender revolt because no separate rebel tag exists.",
				sourceConfidence: "abstraction",
			}),
			revoltEvent({
				year: 47,
				type: "pretender_rebels",
				size: 2,
				leader: "Anula",
				comment: "Queen Anula succession crisis",
				note: "Palace succession crisis around Anula's accession; revolt marker records internal instability without inventing separate factions.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

function writeNation(builder) {
	const out = { _readme: readme, tag: builder.tag, events: builder.events.sort((a, b) => a.date - b.date) }
	if (builder.provinceEvents) out.provinceEvents = builder.provinceEvents
	fs.writeFileSync(path.join(auditsDir, `${builder.tag}.json`), JSON.stringify(out, null, "\t") + "\n")
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })

const builders = [gojoseon, dongOkjeo, byeonhan, auLac, anuradhapura, earlyCheras, earlyCholas, earlyPandyas]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "korea-seasia-southindia-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the Korea / Southeast Asia / South India batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields. Several Tamilakam entries are explicitly abstraction-level because early Sangam chronology is debated.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "korea-seasia-southindia-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Korea / Southeast Asia / South India batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields. Only includes internal upheavals without a clean separate opposing tag.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)

// One-off generator for the Egypt/Kush pre-2AD audit batch.
// Writes 15 nation files plus shared wars and revolts files.
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
	"Audit/proposal file: reconstructed pre-2AD events for the Egypt/Kush/Nile batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Egyptian dynastic chronologies before the New Kingdom are approximate and often disputed, so early ruler sequences are marked sourceConfidence: 'abstraction' where needed. ProvinceEvents propose narrow religion corrections for Egyptian-core provinces currently carrying hellenism/jewish in the source baseline despite an existing egyptian religion id."

const egyptianReligionProvinceEvents = {
	"358": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Alexandria/western Delta is in the Egyptian religious core long before Hellenistic foundation; source baseline has hellenism.")],
	"359": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Asyut/Middle Egypt is part of the ancient Egyptian temple-cult zone; source baseline has hellenism.")],
	"361": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Cairo/Memphis stand-in is an Egyptian religious core province; source baseline has hellenism.")],
	"362": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Delta core province; source baseline has hellenism.")],
	"363": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Diamientia/eastern Delta core province; source baseline has jewish, but early dynastic and pharaonic Egypt should use existing egyptian religion id.")],
	"2315": [provinceEvent(2000, "religion", { religionId: "egyptian" }, "Suez/Pelusium frontier under Egyptian rule is proposed as Egyptian religion rather than hellenism.")],
	"2316": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Mansura/Delta core province; source baseline has jewish/hellenism in different nearby entries.")],
	"2317": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Minya/Middle Egypt core province; source baseline has hellenism.")],
	"4316": [provinceEvent(3000, "religion", { religionId: "egyptian" }, "Mansura duplicate province is Egyptian-core in the pre-2AD dynastic sequence; source baseline has jewish.")],
	"4317": [provinceEvent(2000, "religion", { religionId: "egyptian" }, "Bahiriya oasis under pharaonic control should use Egyptian religion in this audit window rather than hellenism.")],
	"4318": [provinceEvent(2000, "religion", { religionId: "egyptian" }, "Atfih/Middle Egypt core province; source baseline has hellenism.")],
}

const earlyDynastic = nationBuilder("cp_early_dynastic_period_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
earlyDynastic.govChange(3100, "monarchy", "Approximate unification of Upper and Lower Egypt and start of Early Dynastic kingship")
earlyDynastic.reformAdd(3100, "aristocratic_monarchy", "Reuses existing monarchy reform id for early divine kingship until a specific pharaonic reform exists", "abstraction")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[3100, "Narmer", "Dynasty 1", "Traditional unifier of Egypt; dates are approximate", "abstraction"],
	[3050, "Hor-Aha", "Dynasty 1", "Early First Dynasty king"],
	[3020, "Djer", "Dynasty 1", "First Dynasty king"],
	[2980, "Djet", "Dynasty 1", "First Dynasty king"],
	[2950, "Merneith", "Dynasty 1", "Queen/regent with royal burial; included as ruling authority"],
	[2930, "Den", "Dynasty 1", "Major First Dynasty king"],
	[2910, "Anedjib", "Dynasty 1", "Late First Dynasty king"],
	[2890, "Semerkhet", "Dynasty 1", "Late First Dynasty king"],
	[2870, "Qa'a", "Dynasty 1", "Last commonly listed First Dynasty king"],
	[2850, "Hotepsekhemwy", "Dynasty 2", "Founder of the Second Dynasty"],
	[2820, "Raneb", "Dynasty 2", "Second Dynasty king"],
	[2790, "Nynetjer", "Dynasty 2", "Second Dynasty king"],
	[2740, "Peribsen", "Dynasty 2", "Seth-name king; political division is debated", "abstraction"],
	[2690, "Khasekhemwy", "Dynasty 2", "Reunified or stabilized Egypt before the Old Kingdom"],
]) earlyDynastic.ruler(year, name, { dynasty, note, sourceConfidence: confidence })

const oldKingdom = nationBuilder("cp_old_kingdom_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
oldKingdom.govChange(2686, "monarchy", "Start of the Old Kingdom in conventional high-level chronology")
oldKingdom.reformAdd(2686, "aristocratic_monarchy", "Reuses existing monarchy reform id for pyramid-age pharaonic monarchy", "abstraction")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[2686, "Djoser", "Dynasty 3", "Step Pyramid king; anchor for early Old Kingdom state consolidation"],
	[2648, "Sekhemkhet", "Dynasty 3", "Third Dynasty king"],
	[2630, "Huni", "Dynasty 3", "Last king of Dynasty 3 in many lists"],
	[2613, "Sneferu", "Dynasty 4", "Founder of Dynasty 4 and major pyramid builder"],
	[2589, "Khufu", "Dynasty 4", "Builder of the Great Pyramid"],
	[2566, "Djedefre", "Dynasty 4", "Successor of Khufu"],
	[2558, "Khafre", "Dynasty 4", "Builder of the second Giza pyramid"],
	[2532, "Menkaure", "Dynasty 4", "Builder of the third Giza pyramid"],
	[2494, "Userkaf", "Dynasty 5", "Founder of Dynasty 5"],
	[2458, "Sahure", "Dynasty 5", "Fifth Dynasty king with overseas expeditions attested"],
	[2414, "Djedkare Isesi", "Dynasty 5", "Long-reigned late Fifth Dynasty king"],
	[2345, "Unas", "Dynasty 5", "Pyramid Texts appear in his pyramid"],
	[2323, "Teti", "Dynasty 6", "Founder of Dynasty 6"],
	[2289, "Pepi I", "Dynasty 6", "Major Sixth Dynasty king"],
	[2278, "Merenre I", "Dynasty 6", "Sixth Dynasty king with Nubian expeditions"],
	[2270, "Pepi II", "Dynasty 6", "Long reign traditionally associated with Old Kingdom decline"],
]) oldKingdom.ruler(year, name, { dynasty, note, sourceConfidence: confidence })

const lowerEgypt = nationBuilder("cp_lower_egypt", { provinceEvents: egyptianReligionProvinceEvents })
lowerEgypt.govChange(2200, "monarchy", "Fragmented Lower Egyptian authority during intermediate-period abstraction in local province history")
lowerEgypt.reformAdd(2200, "aristocratic_monarchy", "Reuses existing monarchy reform id for Delta dynasts/nomarchs", "abstraction")
for (const [year, name, note] of [
	[2200, "Delta nomarchs", "Abstracts divided Lower Egypt after Old Kingdom central collapse"],
	[2160, "Herakleopolitan kings", "Ninth/Tenth Dynasty rulers claimed Lower and Middle Egypt from Herakleopolis"],
	[2055, "Reunification pressure from Thebes", "Lower Egypt is brought back under reunified monarchy by the early Middle Kingdom"],
]) lowerEgypt.ruler(year, name, { note, sourceConfidence: "abstraction" })

const upperEgypt = nationBuilder("cp_upper_egypt", { provinceEvents: egyptianReligionProvinceEvents })
upperEgypt.govChange(2200, "monarchy", "Fragmented Upper Egyptian authority during intermediate-period abstraction in local province history")
upperEgypt.reformAdd(2200, "aristocratic_monarchy", "Reuses existing monarchy reform id for Theban/Upper Egyptian dynasts", "abstraction")
for (const [year, name, note] of [
	[2200, "Upper Egyptian nomarchs", "Abstracts divided Upper Egypt after Old Kingdom central collapse"],
	[2130, "Intef I and Theban line", "Theban Eleventh Dynasty begins consolidating Upper Egypt"],
	[2055, "Mentuhotep II", "Theban king reunifies Egypt, leading into the Middle Kingdom"],
]) upperEgypt.ruler(year, name, { note, sourceConfidence: "abstraction" })

const middleKingdom = nationBuilder("cp_middle_kingdom_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
middleKingdom.govChange(2055, "monarchy", "Mentuhotep II reunifies Egypt and begins the Middle Kingdom")
middleKingdom.reformAdd(2055, "aristocratic_monarchy", "Reuses existing monarchy reform id for Middle Kingdom pharaonic monarchy", "abstraction")
for (const [year, name, dynasty, note] of [
	[2055, "Mentuhotep II", "Dynasty 11", "Reunified Egypt from Thebes"],
	[2004, "Mentuhotep III", "Dynasty 11", "Middle Kingdom ruler after reunification"],
	[1991, "Amenemhat I", "Dynasty 12", "Founder of Dynasty 12; moved political center north toward Itjtawy"],
	[1962, "Senusret I", "Dynasty 12", "Expanded fortifications and activity in Nubia"],
	[1878, "Senusret III", "Dynasty 12", "Major military and administrative king; campaigns in Nubia"],
	[1860, "Amenemhat III", "Dynasty 12", "Long-reigned king associated with Faiyum development"],
	[1806, "Sobekneferu", "Dynasty 12", "Last ruler of Dynasty 12 and one of the earliest well-attested female pharaohs"],
	[1802, "Thirteenth Dynasty kings", "Dynasty 13 is long and fragmented; represented as a documented administrative phase rather than listing dozens of uncertain short reigns", "abstraction"],
	[1650, "Late Middle Kingdom fragmentation", "Second Intermediate Period conditions emerge in the Delta and Upper Egypt", "abstraction"],
]) middleKingdom.ruler(year, name, { dynasty, note, sourceConfidence: note === "abstraction" ? "abstraction" : "traditional" })

const hyksos = nationBuilder("cp_hyksos")
hyksos.govChange(1650, "monarchy", "Approximate Hyksos takeover of Avaris and Lower Egypt in the Second Intermediate Period")
hyksos.reformAdd(1650, "aristocratic_monarchy", "Reuses existing monarchy reform id for Hyksos royal rule from Avaris", "abstraction")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[1650, "Salitis", "Hyksos / Dynasty 15", "Traditional first Hyksos king in Manetho; chronology uncertain", "abstraction"],
	[1620, "Sakir-Har", "Hyksos / Dynasty 15", "Early Hyksos ruler attested by scarab/seal evidence", "abstraction"],
	[1600, "Khyan", "Hyksos / Dynasty 15", "Major Hyksos ruler with wide-ranging attestations"],
	[1580, "Apepi / Apophis", "Hyksos / Dynasty 15", "Best-known Hyksos king; opponent of the late Theban Seventeenth Dynasty"],
	[1555, "Khamudi", "Hyksos / Dynasty 15", "Last Hyksos king, defeated by Ahmose I"],
]) hyksos.ruler(year, name, { dynasty, note, sourceConfidence: confidence })

const fifteenth = nationBuilder("cp_fifteenth_dynasty_of_egypt")
fifteenth.govChange(1650, "monarchy", "Fifteenth Dynasty Hyksos rule in the Delta; separate local tag from generic cp_hyksos")
fifteenth.reformAdd(1650, "aristocratic_monarchy", "Reuses existing monarchy reform id for Hyksos royal rule", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[1650, "Salitis", "Founder in Manetho's Hyksos sequence; date uncertain", "abstraction"],
	[1620, "Khyan", "Major Fifteenth Dynasty ruler"],
	[1580, "Apepi / Apophis", "Long-reigned Fifteenth Dynasty king"],
	[1555, "Khamudi", "Last Fifteenth Dynasty king"],
]) fifteenth.ruler(year, name, { dynasty: "Fifteenth Dynasty", note, sourceConfidence: confidence })

const sixteenth = nationBuilder("cp_sixteenth_dynasty_of_egypt")
sixteenth.govChange(1649, "monarchy", "Local Theban/Upper Egyptian or minor Hyksos-era dynasty; identification is debated")
sixteenth.reformAdd(1649, "aristocratic_monarchy", "Reuses existing monarchy reform id; the dynasty's exact geography is uncertain", "abstraction")
for (const [year, name, note] of [
	[1649, "Djehuti", "Possible early Sixteenth Dynasty ruler; lists are fragmentary"],
	[1630, "Sobekhotep VIII", "Fragmentary Second Intermediate Period ruler"],
	[1610, "Neferhotep III", "Theban-region ruler in some reconstructions"],
	[1600, "Mentuhotepi", "Late Sixteenth Dynasty ruler in some reconstructions"],
]) sixteenth.ruler(year, name, { dynasty: "Sixteenth Dynasty", note, sourceConfidence: "abstraction" })

const seventeenth = nationBuilder("cp_seventeenth_dynasty_of_egypt")
seventeenth.govChange(1580, "monarchy", "Theban Seventeenth Dynasty in Upper Egypt during the late Second Intermediate Period")
seventeenth.reformAdd(1580, "aristocratic_monarchy", "Reuses existing monarchy reform id for Theban royal authority", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[1580, "Rahotep", "Early Seventeenth Dynasty ruler; chronology uncertain", "abstraction"],
	[1570, "Sobekemsaf I", "Seventeenth Dynasty ruler"],
	[1565, "Intef VI / Nubkheperre Intef", "Seventeenth Dynasty ruler"],
	[1560, "Senakhtenre Ahmose", "Late Seventeenth Dynasty ruler and ancestor of Ahmose I"],
	[1558, "Seqenenre Tao", "Killed in conflict with the Hyksos"],
	[1555, "Kamose", "Led campaigns against the Hyksos before Ahmose I completed the reconquest"],
]) seventeenth.ruler(year, name, { dynasty: "Seventeenth Dynasty", note, sourceConfidence: confidence })

const newKingdom = nationBuilder("cp_new_kingdom_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
newKingdom.govChange(1550, "monarchy", "Ahmose I expels the Hyksos and reunifies Egypt, beginning the New Kingdom")
newKingdom.reformAdd(1550, "aristocratic_monarchy", "Reuses existing monarchy reform id for New Kingdom pharaonic monarchy", "abstraction")
for (const [year, name, dynasty, note, confidence = "traditional"] of [
	[1550, "Ahmose I", "Dynasty 18", "Expelled the Hyksos and reunified Egypt"],
	[1525, "Amenhotep I", "Dynasty 18", "Early New Kingdom consolidation"],
	[1504, "Thutmose I", "Dynasty 18", "Expanded into Nubia and the Levant"],
	[1479, "Hatshepsut", "Dynasty 18", "Female pharaoh and major builder"],
	[1479, "Thutmose III", "Dynasty 18", "Major imperial conqueror; Battle of Megiddo"],
	[1427, "Amenhotep II", "Dynasty 18", "Maintained Egyptian empire in Syria and Nubia"],
	[1390, "Amenhotep III", "Dynasty 18", "Prosperous diplomatic high point"],
	[1353, "Akhenaten", "Dynasty 18", "Aten-focused religious revolution at Amarna"],
	[1332, "Tutankhamun", "Dynasty 18", "Restoration after Amarna period"],
	[1323, "Ay", "Dynasty 18", "Late Eighteenth Dynasty court official turned king"],
	[1319, "Horemheb", "Dynasty 18", "Restored order after Amarna and late-dynasty instability"],
	[1292, "Ramesses I", "Dynasty 19", "Founder of Dynasty 19"],
	[1290, "Seti I", "Dynasty 19", "Restored Egyptian power in the Levant"],
	[1279, "Ramesses II", "Dynasty 19", "Long-reigned king; fought the Hittites at Kadesh"],
	[1213, "Merneptah", "Dynasty 19", "Repelled Libyan and Sea Peoples threats; Israel Stele"],
	[1190, "Twosret", "Dynasty 19", "Last ruler of Dynasty 19 amid succession crisis"],
	[1189, "Setnakhte", "Dynasty 20", "Founder of Dynasty 20 after civil disorder"],
	[1186, "Ramesses III", "Dynasty 20", "Defeated Sea Peoples and Libyan invasions"],
	[1155, "Ramesses IV", "Dynasty 20", "Late New Kingdom ruler"],
	[1149, "Ramesses V", "Dynasty 20", "Late New Kingdom ruler"],
	[1145, "Ramesses VI", "Dynasty 20", "Late New Kingdom ruler"],
	[1137, "Ramesses VII", "Dynasty 20", "Late New Kingdom ruler"],
	[1130, "Ramesses VIII", "Dynasty 20", "Briefly attested late New Kingdom ruler"],
	[1129, "Ramesses IX", "Dynasty 20", "Tomb-robbery records and late New Kingdom stress"],
	[1111, "Ramesses X", "Dynasty 20", "Late New Kingdom ruler"],
	[1107, "Ramesses XI", "Dynasty 20", "Last New Kingdom king; high priests of Amun dominate Thebes"],
]) newKingdom.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
newKingdom.reformAdd(1353, "atenist_revolution", "Proposed new reform id for Akhenaten's Aten-focused religious-political break; no existing reform fits", "abstraction")
newKingdom.reformAdd(1332, "amun_restoration", "Proposed new reform id for post-Amarna restoration under Tutankhamun/Ay/Horemheb", "abstraction")

const twentySecond = nationBuilder("cp_twenty_second_dynasty_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
twentySecond.govChange(945, "monarchy", "Shoshenq I founds the Libyan Twenty-Second Dynasty")
twentySecond.reformAdd(945, "aristocratic_monarchy", "Reuses existing monarchy reform id for Libyan-Egyptian pharaonic rule", "abstraction")
for (const [year, name, note] of [
	[945, "Shoshenq I", "Founder; campaigned in the Levant"],
	[924, "Osorkon I", "Twenty-Second Dynasty king"],
	[890, "Takelot I", "Twenty-Second Dynasty king"],
	[872, "Osorkon II", "Long-reigned Twenty-Second Dynasty king"],
	[837, "Shoshenq III", "Rule coincides with growing fragmentation"],
	[773, "Pami", "Late Twenty-Second Dynasty king"],
	[767, "Shoshenq V", "Late Twenty-Second Dynasty king"],
	[730, "Osorkon IV", "Last Tanite ruler, contemporary with Kushite and Assyrian pressure"],
]) twentySecond.ruler(year, name, { dynasty: "Twenty-Second Dynasty", note })

const twentyThird = nationBuilder("cp_twenty_third_dynasty_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
twentyThird.govChange(818, "monarchy", "Fragmented Libyan-era Twenty-Third Dynasty in parts of Egypt")
twentyThird.reformAdd(818, "aristocratic_monarchy", "Reuses existing monarchy reform id for regional pharaonic dynasts", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[818, "Pedubast I", "Founder of a rival Libyan-era royal line"],
	[800, "Shoshenq VI", "Theban-region rival king in some reconstructions", "abstraction"],
	[785, "Osorkon III", "Major Twenty-Third Dynasty king"],
	[759, "Takelot III", "Late Twenty-Third Dynasty king"],
	[754, "Rudamun", "Late Twenty-Third Dynasty king"],
	[740, "Iuput II", "Regional ruler in Leontopolis during Kushite expansion"],
]) twentyThird.ruler(year, name, { dynasty: "Twenty-Third Dynasty", note, sourceConfidence: confidence })

const kush = nationBuilder("cp_kingdom_of_kush")
kush.govChange(1070, "monarchy", "Post-New Kingdom Kush/Napata emerges as a major Nubian kingdom")
kush.reformAdd(1070, "aristocratic_monarchy", "Reuses existing monarchy reform id for Napatan/Meroitic kingship", "abstraction")
for (const [year, name, note, confidence = "traditional"] of [
	[1070, "Early Napatan rulers", "Poorly attested post-New Kingdom Kushite consolidation", "abstraction"],
	[780, "Alara", "Traditional founder of the Napatan royal line"],
	[760, "Kashta", "Expanded Kushite influence into Upper Egypt"],
	[747, "Piye", "Conquered much of Egypt and founded Kushite Twenty-Fifth Dynasty rule"],
	[716, "Shabaka", "Kushite pharaoh who consolidated rule in Egypt"],
	[702, "Shebitku", "Kushite king preceding Taharqa"],
	[690, "Taharqa", "Major Kushite pharaoh; fought Assyria"],
	[664, "Tantamani", "Attempted to restore Kushite control in Egypt; defeated by Assyria"],
	[593, "Aspelta", "Kushite king during Psamtik II's Nubian campaign"],
	[300, "Arkamani / Ergamenes", "Early Meroitic-period royal reform figure in classical tradition", "abstraction"],
	[25, "Amanirenas", "Kandake who fought Roman Egypt in the Roman-Kushite War"],
]) kush.ruler(year, name, { dynasty: "Kushite", note, sourceConfidence: confidence })

const twentySixth = nationBuilder("cp_twenty_sixth_dynasty_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
twentySixth.govChange(664, "monarchy", "Psamtik I establishes Saite Twenty-Sixth Dynasty rule as Assyrian power withdraws")
twentySixth.reformAdd(664, "aristocratic_monarchy", "Reuses existing monarchy reform id for Saite pharaonic monarchy", "abstraction")
for (const [year, name, note] of [
	[664, "Psamtik I", "Founder of the Saite revival"],
	[610, "Necho II", "Campaigned in the Levant; defeated at Carchemish"],
	[595, "Psamtik II", "Campaigned into Nubia"],
	[589, "Apries", "Intervened in the Levant; later overthrown"],
	[570, "Amasis II", "Long-reigned Saite king with strong Greek trade links"],
	[526, "Psamtik III", "Last Saite pharaoh; defeated by Cambyses II at Pelusium"],
]) twentySixth.ruler(year, name, { dynasty: "Twenty-Sixth Dynasty", note })

const thirtieth = nationBuilder("cp_thirtieth_dynasty_of_egypt", { provinceEvents: egyptianReligionProvinceEvents })
thirtieth.govChange(380, "monarchy", "Nectanebo I founds the Thirtieth Dynasty after the Twenty-Ninth Dynasty")
thirtieth.reformAdd(380, "aristocratic_monarchy", "Reuses existing monarchy reform id for late native Egyptian pharaonic monarchy", "abstraction")
for (const [year, name, note] of [
	[380, "Nectanebo I", "Founder; repelled Persian invasion attempts"],
	[362, "Teos", "Campaigned into the Levant but was overthrown"],
	[360, "Nectanebo II", "Last native pharaoh before the Persian reconquest"],
]) thirtieth.ruler(year, name, { dynasty: "Thirtieth Dynasty", note })

const wars = [
	war({
		warId: "unificationOfEgypt",
		name: "Unification of Upper and Lower Egypt",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_lower_egypt",
		attacker: ["cp_upper_egypt"],
		defender: ["cp_lower_egypt"],
		start: d(3150),
		end: d(3100),
		note: "Predynastic unification represented because local tags exist for Upper and Lower Egypt. Narmer/Scorpion-era details are archaeological and debated, so this is an abstraction.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "mentuhotepReunification",
		name: "Mentuhotep II's Reunification War",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_lower_egypt",
		attacker: ["cp_upper_egypt"],
		defender: ["cp_lower_egypt"],
		start: d(2065),
		end: d(2055),
		note: "Theban Eleventh Dynasty defeat of Herakleopolitan/Lower Egyptian rivals, creating the Middle Kingdom.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 2055, name: "Fall of Herakleopolis", locationProvinceId: "361", attacker: { country: "cp_upper_egypt", commander: "Mentuhotep II", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_lower_egypt", commander: "Herakleopolitan rulers", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Cairo (361) stands in for the Herakleopolitan/Memphis zone.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "hyksosConquestOfLowerEgypt",
		name: "Hyksos Conquest of Lower Egypt",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_lower_egypt",
		attacker: ["cp_hyksos", "cp_fifteenth_dynasty_of_egypt"],
		defender: ["cp_middle_kingdom_of_egypt"],
		start: d(1650),
		end: d(1630),
		note: "Hyksos seizure of Avaris/Lower Egypt during the Second Intermediate Period; represented broadly due to sparse event-level battle data.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "thebanHyksosWar",
		name: "Theban-Hyksos War",
		casusBelli: "cb_independence_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_hyksos",
		attacker: ["cp_seventeenth_dynasty_of_egypt", "cp_new_kingdom_of_egypt"],
		defender: ["cp_hyksos", "cp_fifteenth_dynasty_of_egypt"],
		start: d(1560),
		end: d(1530),
		note: "Seqenenre Tao and Kamose begin the war; Ahmose I captures Avaris and pursues the Hyksos to Sharuhen, founding the New Kingdom.",
		battles: [
			battle({ year: 1558, name: "Seqenenre Tao's Hyksos fighting", locationProvinceId: "361", attacker: { country: "cp_seventeenth_dynasty_of_egypt", commander: "Seqenenre Tao", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_hyksos", commander: "Apepi's forces", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: false, note: "Cairo (361) stands in for the contested north-south frontier; Seqenenre's mummy shows violent death.", sourceConfidence: "abstraction" }),
			battle({ year: 1550, name: "Capture of Avaris", locationProvinceId: "362", attacker: { country: "cp_new_kingdom_of_egypt", commander: "Ahmose I", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_hyksos", commander: "Khamudi", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Delta (362) stands in for Avaris in the eastern Nile Delta." }),
			battle({ year: 1530, name: "Siege of Sharuhen", locationProvinceId: "364", attacker: { country: "cp_new_kingdom_of_egypt", commander: "Ahmose I", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_hyksos", commander: "Hyksos remnants", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Gaza (364) stands in for Sharuhen/southern Canaan." }),
		],
	}),
	war({
		warId: "newKingdomConquestOfKush",
		name: "New Kingdom Conquest of Kush",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "1234",
		attacker: ["cp_new_kingdom_of_egypt"],
		defender: ["cp_kingdom_of_kush"],
		start: d(1550),
		end: d(1450),
		note: "Ahmose I through Thutmose I/III extend Egyptian control into Nubia. Kush as a later local tag stands in for Nubian polities in the local footprint.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "battleOfMegiddo",
		name: "Battle of Megiddo and Levantine Campaigns",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "1854",
		attacker: ["cp_new_kingdom_of_egypt"],
		defender: ["cp_hyksos"],
		start: d(1457),
		end: d(1457, 1, 2),
		note: "Thutmose III's campaign against a Canaanite coalition. No Canaanite coalition tag exists; cp_hyksos is reused only as the local Levant/Delta Second Intermediate tag and the caveat is explicit.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 1457, name: "Megiddo", locationProvinceId: "1854", attacker: { country: "cp_new_kingdom_of_egypt", commander: "Thutmose III", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_hyksos", commander: "Canaanite coalition of Kadesh/Megiddo", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Acco (1854) stands in for Megiddo/northern Canaan.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "battleOfKadesh",
		name: "Battle of Kadesh",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "382",
		attacker: ["cp_new_kingdom_of_egypt"],
		defender: ["cp_hittites"],
		start: d(1274),
		end: d(1274, 1, 2),
		note: "Ramesses II fights Muwatalli II of the Hittites at Kadesh; outcome was tactically inconclusive but strategically checked Egyptian advance.",
		battles: [
			battle({ year: 1274, name: "Kadesh", locationProvinceId: "382", attacker: { country: "cp_new_kingdom_of_egypt", commander: "Ramesses II", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_hittites", commander: "Muwatalli II", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: false, note: "Damascus (382) stands in for the Orontes/Kadesh theater.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "piyeConquestOfEgypt",
		name: "Piye's Conquest of Egypt",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "361",
		attacker: ["cp_kingdom_of_kush"],
		defender: ["cp_twenty_third_dynasty_of_egypt", "cp_twenty_second_dynasty_of_egypt"],
		start: d(728),
		end: d(720),
		note: "Piye and the Kushite Twenty-Fifth Dynasty establish dominance over fragmented Libyan-era Egypt.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 728, name: "Piye's Memphis campaign", locationProvinceId: "361", attacker: { country: "cp_kingdom_of_kush", commander: "Piye", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_twenty_third_dynasty_of_egypt", commander: "Tefnakht's coalition", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Cairo (361) stands in for Memphis." }),
		],
	}),
	war({
		warId: "psamtikUnificationOfEgypt",
		name: "Psamtik I's Saite Unification",
		casusBelli: "cb_independence_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_assyrian_egypt",
		attacker: ["cp_twenty_sixth_dynasty_of_egypt"],
		defender: ["cp_assyrian_egypt"],
		start: d(664),
		end: d(656),
		note: "Psamtik I consolidates Egypt as Assyrian control withdraws, founding the Saite revival. This complements but does not duplicate the Assyrian conquest of Egypt war.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "psamtikIINubianCampaign",
		name: "Psamtik II's Nubian Campaign",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "1234",
		attacker: ["cp_twenty_sixth_dynasty_of_egypt"],
		defender: ["cp_kingdom_of_kush"],
		start: d(592),
		end: d(591),
		note: "Psamtik II sends an expedition into Nubia during Aspelta's reign, destroying Kushite royal imagery in Egypt and campaigning south.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 592, name: "Nubian expedition", locationProvinceId: "1234", attacker: { country: "cp_twenty_sixth_dynasty_of_egypt", commander: "Psamtik II's commanders", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_kingdom_of_kush", commander: "Aspelta", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Nubia (1234) stands in for the Napatan frontier.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "apriesAmasisCivilWar",
		name: "Apries-Amasis Civil War",
		casusBelli: "cb_independence_war",
		warGoalType: "take_capital",
		warGoalProvince: "361",
		attacker: ["cp_twenty_sixth_dynasty_of_egypt"],
		defender: ["cp_twenty_sixth_dynasty_of_egypt"],
		start: d(570),
		end: d(567),
		note: "Amasis rebels against Apries after army discontent over Cyrene. Same tag appears on both sides because no Amasis/Apries faction tags exist.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "teosLevantineCampaign",
		name: "Teos's Levantine Campaign and Usurpation",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "364",
		attacker: ["cp_thirtieth_dynasty_of_egypt"],
		defender: ["cp_achaemenid_empire"],
		start: d(362),
		end: d(360),
		note: "Teos campaigns against Persia with Greek support but is overthrown by Nectanebo II. Persian reconquest attempts are already in pilot-nations-wars.json.",
		sourceConfidence: "abstraction",
	}),
]

const revolts = {
	"361": {
		events: [
			revoltEvent({ year: 1353, type: "religious_rebels", size: 4, leader: "Amun priesthood and restoration factions", comment: "Amarna religious crisis", note: "Akhenaten's Atenist revolution and subsequent restoration were court-led religious upheavals rather than a clean province conversion; Cairo/Memphis stands in for the state center.", sourceConfidence: "abstraction" }),
			revoltEvent({ year: 1155, type: "noble_rebels", size: 3, comment: "Tomb-robbery and late New Kingdom disorder", note: "Late Twentieth Dynasty administrative breakdown and tomb-robbery trials are represented as internal unrest, not a separate war.", sourceConfidence: "abstraction" }),
		],
	},
	"363": {
		events: [
			revoltEvent({ year: 570, type: "pretender_rebels", size: 4, leader: "Amasis", comment: "Amasis revolt against Apries", note: "Also represented as a same-tag civil war for the Twenty-Sixth Dynasty; province revolt marks the internal Egyptian uprising in the Delta.", sourceConfidence: "abstraction" }),
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

for (const builder of [
	earlyDynastic,
	oldKingdom,
	lowerEgypt,
	upperEgypt,
	middleKingdom,
	hyksos,
	fifteenth,
	sixteenth,
	seventeenth,
	newKingdom,
	twentySecond,
	twentyThird,
	kush,
	twentySixth,
	thirtieth,
]) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "egypt-kush-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: wars for the Egypt/Kush/Nile batch. Assyrian conquest of Egypt, Persian conquest/reconquest of Egypt, and Roman-Kushite War already exist in other audit war files and are not duplicated except where needed as local transition context.",
			wars: wars.sort((a, b) => a.events[0].date - b.events[0].date),
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "egypt-kush-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Egypt/Kush/Nile batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields. Only includes internal upheavals without a clean separate opposing tag.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote 15 nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)

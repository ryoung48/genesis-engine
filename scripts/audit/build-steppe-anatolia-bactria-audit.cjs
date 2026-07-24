// One-off generator for the Steppe / Anatolia-Caucasus / Bactria-India pre-2AD audit batch.
// Writes 16 nation files plus shared wars and revolts files.
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

function provinceEvent(year, kind, payload, note, sourceConfidence = "abstraction") {
	return { date: d(year), kind, payload, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the combined Steppe / Anatolia-Caucasus / Bactria-India batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. This batch intentionally does not duplicate Darius's Scythian campaign, Kadesh, the Mithridatic Wars, or Roman-Pontic wars already present in earlier audit war files. Province culture/religion was reviewed at the footprint level; provinceEvents only mark clear local baseline mismatches where existing culture/religion IDs support a conservative correction."

function addEvents(builder, govYear, gov, reform, rows) {
	builder.govChange(govYear, gov, rows.govNote)
	builder.reformAdd(govYear, reform, rows.reformNote || "Reuses an existing generic reform id appropriate to the local polity type", "abstraction")
	for (const row of rows.rulers) {
		const [year, name, dynasty, note, confidence = "traditional"] = row
		builder.ruler(year, name, { dynasty, note, sourceConfidence: confidence })
	}
}

const scythianProvinceIds = [
	"158",
	"261",
	"268",
	"280",
	"281",
	"282",
	"283",
	"287",
	"288",
	"289",
	"290",
	"291",
	"298",
	"299",
	"302",
	"463",
	"464",
	"465",
	"466",
	"467",
	"468",
	"469",
	"470",
	"471",
	"1756",
	"1856",
	"1940",
	"1942",
	"1943",
	"1944",
	"1945",
	"1971",
	"1974",
	"2195",
	"2197",
	"2199",
	"2208",
	"2365",
	"2367",
	"2405",
	"2406",
	"2407",
	"2408",
	"2409",
	"2411",
	"2412",
	"2413",
	"2414",
	"2415",
	"2416",
	"2417",
	"2998",
	"3061",
	"3249",
	"4255",
	"4529",
	"4530",
	"4539",
	"4540",
	"4541",
	"4542",
	"4543",
]
const scythianProvinceEvents = Object.fromEntries(
	scythianProvinceIds.map((provinceId) => [
		provinceId,
		[
			provinceEvent(700, "culture", { cultureId: "scythian" }, "The Scythian audit footprint currently inherits later or neighboring cultures in many steppe provinces. Uses the existing scythian culture id for non-Greek Scythian-controlled steppe provinces."),
			provinceEvent(700, "religion", { religionId: "tengri_pagan_reformed" }, "Closest existing steppe-pagan religion id for pre-Christian/pre-Islamic Scythian cult practice; marked as an abstraction, not a literal Tengri identity."),
		],
	]),
)

const scythia = nationBuilder("cp_scythia", { provinceEvents: scythianProvinceEvents })
addEvents(scythia, 700, "tribal", "steppe_horde", {
	govNote: "Approximate rise of Scythian/Saka nomad dominance north of the Black Sea and across the steppe",
	reformNote: "Reuses existing horde-style reform id for mobile steppe confederations if available; otherwise review as a proposed reform",
	rulers: [
		[700, "Early Royal Scythians", "Scythian", "Formation of the classical Scythian steppe horizon", "abstraction"],
		[630, "Ishpakai / Partatua horizon", "Scythian", "Early Scythian leaders known from Assyrian-era sources; identifications are debated", "abstraction"],
		[513, "Idanthyrsus", "Scythian", "Scythian king associated with resisting Darius I's campaign; war already in pilot-nations-wars.json"],
		[430, "Ariapeithes", "Scythian", "Royal Scythian king known through Herodotean tradition"],
		[340, "Ateas", "Scythian", "Powerful Scythian king killed fighting Philip II of Macedon"],
		[110, "Scilurus", "Scythian", "Late Crimean Scythian king centered near Neapolis Scythica"],
		[100, "Palacus", "Scythian", "Late Scythian king defeated by Diophantus of Pontus", "abstraction"],
	],
})

const yuezhi = nationBuilder("cp_yuezhi")
addEvents(yuezhi, 405, "tribal", "steppe_horde", {
	govNote: "Yuezhi confederation in the Gansu/Tarim world before westward migration; date aligned to the first Yuezhi owner-history footprint",
	rulers: [
		[405, "Early Yuezhi chiefs", "Yuezhi", "Earliest owner-history footprint for the Yuezhi; named leadership is not preserved", "abstraction"],
		[300, "Early Yuezhi chiefs", "Yuezhi", "Pre-migration Yuezhi leadership is unnamed in the surviving record", "abstraction"],
		[176, "Yuezhi king killed by Modu's successors", "Yuezhi", "Xiongnu defeat triggers westward Yuezhi displacement; the king's skull-cup story belongs to Chinese historical tradition", "abstraction"],
		[160, "Great Yuezhi migration chiefs", "Yuezhi", "Movement into the Ili/Sogdian-Bactrian zone after Xiongnu pressure", "abstraction"],
		[130, "Yuezhi yabghus in Bactria", "Yuezhi", "Zhang Qian reports the Yuezhi settled north of the Oxus/Bactria", "abstraction"],
	],
})

const indoScythians = nationBuilder("cp_indo_scythians")
addEvents(indoScythians, 100, "monarchy", "steppe_horde", {
	govNote: "Saka/Indo-Scythian royal houses enter Arachosia, Gandhara, Sindh, and western India",
	rulers: [
		[100, "Saka migration chiefs", "Saka", "Early Saka pressure into Bactria/Arachosia after Yuezhi movement", "abstraction"],
		[85, "Maues", "Indo-Scythian", "Early Indo-Scythian king in Gandhara/Punjab"],
		[58, "Azes I", "Indo-Scythian", "Major Indo-Scythian ruler associated with the Azes era"],
		[35, "Azilises", "Indo-Scythian", "Indo-Scythian king known from coinage"],
		[20, "Azes II", "Indo-Scythian", "Late pre-2AD Indo-Scythian king; identity/dating overlaps with Azes I in scholarship", "abstraction"],
	],
})

const grecoBactrian = nationBuilder("cp_greco_bactrian_kingdom")
addEvents(grecoBactrian, 256, "monarchy", "satrap_diadochi", {
	govNote: "Diodotus I separates Bactria from Seleucid rule, founding the Greco-Bactrian kingdom",
	rulers: [
		[256, "Diodotus I", "Diodotid", "Satrap of Bactria who became independent from the Seleucids"],
		[235, "Diodotus II", "Diodotid", "Son of Diodotus I; overthrown by Euthydemus"],
		[224, "Euthydemus I", "Euthydemid", "Founder of the Euthydemid dynasty; withstood Antiochus III's siege of Bactra"],
		[200, "Demetrius I", "Euthydemid", "Expanded Greco-Bactrian power into the northwest Indian subcontinent"],
		[185, "Euthydemus II / Pantaleon / Agathocles", "Euthydemid", "Fragmented successor phase known mainly from coinage", "abstraction"],
		[171, "Eucratides I", "Eucratid", "Usurper and major Greco-Bactrian king; fought Indo-Greek rivals"],
		[145, "Heliocles I", "Eucratid", "Last major Greco-Bactrian king north of the Hindu Kush before nomad pressure"],
	],
})

const indoGreeks = nationBuilder("cp_indo_greeks")
addEvents(indoGreeks, 180, "monarchy", "satrap_diadochi", {
	govNote: "Demetrius and later Indo-Greek kings establish Hellenistic kingdoms south of the Hindu Kush",
	rulers: [
		[180, "Demetrius I", "Euthydemid", "Greco-Bactrian expansion into India begins the Indo-Greek field"],
		[175, "Apollodotus I", "Indo-Greek", "Important early Indo-Greek ruler in western India"],
		[165, "Menander I Soter", "Indo-Greek", "Best-known Indo-Greek ruler; associated with Buddhist Milinda tradition"],
		[130, "Agathocleia and Strato I", "Indo-Greek", "Regency and successor phase after Menander"],
		[115, "Lysias and Antialcidas", "Indo-Greek", "Important successor kings; Antialcidas is linked to the Heliodorus pillar"],
		[100, "Philoxenus", "Indo-Greek", "Temporarily reunified parts of the Indo-Greek realm"],
		[80, "Archebius", "Indo-Greek", "Late Indo-Greek king in the northwest"],
		[35, "Hermaeus", "Indo-Greek", "Late Indo-Greek ruler in the Kabul/Paropamisadae zone"],
	],
})

const indoParthians = nationBuilder("cp_indo_parthians")
addEvents(indoParthians, 20, "monarchy", "aristocratic_monarchy", {
	govNote: "Indo-Parthian/Surenid-linked rulers begin replacing Indo-Scythian power in Arachosia, Seistan, and Sindh",
	rulers: [
		[20, "Vonones", "Indo-Parthian", "Early Indo-Parthian ruler known from coinage; chronology is debated", "abstraction"],
		[10, "Spalirises", "Indo-Parthian", "Early Indo-Parthian ruler associated with Arachosia/Seistan", "abstraction"],
		[1, "Gondophares", "Indo-Parthian", "Early reign likely begins around the turn of the era; later central Indo-Parthian king"],
	],
})

const hittites = nationBuilder("cp_hittites")
addEvents(hittites, 1650, "monarchy", "aristocratic_monarchy", {
	govNote: "Old Hittite kingdom forms in central Anatolia",
	rulers: [
		[1650, "Labarna I", "Old Hittite", "Traditional founder of Hittite royal power", "abstraction"],
		[1620, "Hattusili I", "Old Hittite", "Expanded from Hattusa into northern Syria"],
		[1595, "Mursili I", "Old Hittite", "Sacked Babylon and extended Hittite reach"],
		[1525, "Telepinu", "Old Hittite", "Issued succession edict after dynastic disorder"],
		[1430, "Tudhaliya I/II", "Middle Hittite", "Early imperial recovery phase; numbering debated", "abstraction"],
		[1350, "Suppiluliuma I", "Empire", "Major imperial conqueror in Syria and Anatolia"],
		[1321, "Mursili II", "Empire", "Suppressed revolts and campaigned widely"],
		[1295, "Muwatalli II", "Empire", "Fought Ramesses II at Kadesh; war already in egypt-kush-wars.json"],
		[1267, "Hattusili III", "Empire", "Concluded treaty with Egypt and stabilized succession"],
		[1237, "Tudhaliya IV", "Empire", "Late imperial ruler before collapse pressures"],
		[1207, "Suppiluliuma II", "Empire", "Last known Hittite Great King during Bronze Age collapse"],
	],
})

const neoHittite = nationBuilder("cp_neo_hittite_states")
addEvents(neoHittite, 1180, "monarchy", "aristocratic_monarchy", {
	govNote: "Neo-Hittite/Luwian successor states emerge after the Hittite imperial collapse",
	rulers: [
		[1180, "Luwian successor dynasts", "Neo-Hittite", "Carchemish, Tabal, Melid, and related states preserve Hittite-Luwian traditions", "abstraction"],
		[950, "Carchemish and Tabal kings", "Neo-Hittite", "Regional successor kings known through inscriptions and Assyrian records", "abstraction"],
		[717, "Last independent Carchemish rulers", "Neo-Hittite", "Assyrian conquest ends the major independent Neo-Hittite centers", "abstraction"],
	],
})

const phrygia = nationBuilder("cp_phrygia", {
	provinceEvents: {
		"326": [
			provinceEvent(900, "culture", { cultureId: "phrygian" }, "Ancyra/central Anatolia is Galatian in the source baseline, but Galatian settlement is later than the Phrygian kingdom phase."),
		],
		"4312": [
			provinceEvent(900, "culture", { cultureId: "phrygian" }, "Central Anatolian province in the Phrygian footprint currently carries later Galatian culture."),
		],
		"4313": [
			provinceEvent(900, "culture", { cultureId: "phrygian" }, "Halys-frontier province in the Phrygian/Lydian footprint currently carries later Galatian culture."),
		],
	},
})
addEvents(phrygia, 900, "monarchy", "aristocratic_monarchy", {
	govNote: "Phrygian kingdom emerges in central Anatolia after the Bronze Age collapse",
	rulers: [
		[900, "Early Phrygian kings", "Phrygian", "Pre-Midas Phrygian kingdom phase", "abstraction"],
		[738, "Midas", "Phrygian", "Best-known Phrygian king; Assyrian sources mention Mita of Mushki"],
		[695, "Cimmerian crisis", "Phrygian", "Cimmerian attacks devastate Phrygia; exact succession is unclear", "abstraction"],
	],
})

const lydia = nationBuilder("cp_lydia")
addEvents(lydia, 700, "monarchy", "aristocratic_monarchy", {
	govNote: "Lydian monarchy in western Anatolia; date aligned to the first Lydian owner-history footprint before the Mermnad dynasty",
	rulers: [
		[700, "Early Lydian kings", "Lydian", "Pre-Mermnad Lydian royal phase before Gyges; exact sequence is compressed", "abstraction"],
		[680, "Gyges", "Mermnad", "Founder of the Mermnad dynasty"],
		[644, "Ardys", "Mermnad", "Lydian king after Cimmerian pressure"],
		[625, "Sadyattes", "Mermnad", "Lydian king before Alyattes"],
		[610, "Alyattes", "Mermnad", "Expanded Lydia and fought Media; father of Croesus"],
		[560, "Croesus", "Mermnad", "Last Lydian king, defeated by Cyrus; conquest already in pilot-nations-wars.json"],
	],
})

const urartu = nationBuilder("cp_kingdom_of_urartu")
addEvents(urartu, 860, "monarchy", "aristocratic_monarchy", {
	govNote: "Urartian kingdom centered around Lake Van appears in Assyrian records",
	rulers: [
		[860, "Arame", "Urartu", "Early Urartian king known from Assyrian sources"],
		[840, "Sarduri I", "Urartu", "Founded/fortified Tushpa according to royal inscriptions"],
		[810, "Menua", "Urartu", "Expansionist Urartian king"],
		[785, "Argishti I", "Urartu", "Founded Erebuni and expanded northward"],
		[764, "Sarduri II", "Urartu", "Major Urartian ruler before Assyrian reverses"],
		[735, "Rusa I", "Urartu", "Defeated by Sargon II; later Urartian decline begins"],
		[685, "Rusa II", "Urartu", "Late Urartian revival and building activity"],
		[590, "Late Urartian collapse", "Urartu", "Final collapse under Median/Scythian/Armenian pressure is poorly documented", "abstraction"],
	],
})

const armenia = nationBuilder("cp_kingdom_of_armenia")
addEvents(armenia, 331, "monarchy", "aristocratic_monarchy", {
	govNote: "Orontid Armenia emerges from Achaemenid satrapal structures after Alexander",
	rulers: [
		[331, "Orontes III", "Orontid", "Early Orontid Armenian king after Gaugamela"],
		[260, "Sames", "Orontid", "Orontid/Commagene-linked ruler; chronology is uncertain", "abstraction"],
		[212, "Xerxes of Armenia", "Orontid", "Armenian ruler subdued by Antiochus III"],
		[190, "Artaxias I", "Artaxiad", "Founder of the Artaxiad dynasty after Seleucid defeat by Rome"],
		[160, "Artavasdes I", "Artaxiad", "Successor in early Artaxiad Armenia"],
		[95, "Tigranes II the Great", "Artaxiad", "Expanded Armenia into a short-lived empire"],
		[55, "Artavasdes II", "Artaxiad", "Ruled during Roman-Parthian rivalry"],
		[20, "Tigranes III", "Artaxiad", "Late pre-2AD Artaxiad ruler under Roman influence"],
	],
})

const pontus = nationBuilder("cp_kingdom_of_pontus")
addEvents(pontus, 281, "monarchy", "aristocratic_monarchy", {
	govNote: "Mithridatic Kingdom of Pontus forms in northern Anatolia after the Diadochi period",
	rulers: [
		[281, "Mithridates I Ctistes", "Mithridatic", "Founder of the Kingdom of Pontus"],
		[266, "Ariobarzanes", "Mithridatic", "Early Pontic king"],
		[250, "Mithridates II", "Mithridatic", "Expanded Pontic diplomatic and dynastic ties"],
		[220, "Mithridates III", "Mithridatic", "Poorly attested Pontic king", "abstraction"],
		[185, "Pharnaces I", "Mithridatic", "Aggressively expanded Pontus and seized Sinope"],
		[155, "Mithridates IV Philopator Philadelphus", "Mithridatic", "Pontic king allied with Rome"],
		[150, "Mithridates V Euergetes", "Mithridatic", "Expanded influence in Anatolia before assassination"],
		[120, "Mithridates VI Eupator", "Mithridatic", "Last great Pontic king and opponent of Rome; Mithridatic Wars already in republic-wars.json"],
	],
})

const cappadocia = nationBuilder("cp_kingdom_of_cappadocia")
addEvents(cappadocia, 331, "monarchy", "aristocratic_monarchy", {
	govNote: "Cappadocian kingdom emerges from Achaemenid satrapal and Ariarathid structures",
	rulers: [
		[331, "Ariarathes I", "Ariarathid", "Former Persian satrap who resisted Macedonian successors"],
		[301, "Ariarathes II", "Ariarathid", "Restored Cappadocian dynastic rule"],
		[255, "Ariarathes III", "Ariarathid", "Took the royal title"],
		[220, "Ariarathes IV", "Ariarathid", "Ruled during Seleucid and Pontic pressures"],
		[163, "Ariarathes V", "Ariarathid", "Philhellene Cappadocian king and Roman ally"],
		[130, "Ariarathes VI", "Ariarathid", "Murdered amid Pontic interference"],
		[96, "Ariarathes VII/VIII crisis", "Ariarathid", "Dynastic crisis driven by Mithridates VI", "abstraction"],
		[95, "Ariobarzanes I", "Ariobarzanid", "Roman-backed Cappadocian king"],
	],
})

const colchis = nationBuilder("cp_colchis")
addEvents(colchis, 600, "monarchy", "aristocratic_monarchy", {
	govNote: "Colchian kingdom/coastal polities appear on the eastern Black Sea",
	rulers: [
		[600, "Early Colchian kings", "Colchian", "Archaeological and Greek literary Colchis before firm king lists", "abstraction"],
		[300, "Aetes tradition and local dynasts", "Colchian", "Mythic Aetes is not treated as literal; marker for Greek-recognized Colchian kingship", "abstraction"],
		[110, "Pontic-aligned Colchis", "Colchian", "Colchis falls into the Pontic sphere before Roman intervention", "abstraction"],
	],
})

const caucasianIberia = nationBuilder("cp_caucasian_iberia")
addEvents(caucasianIberia, 302, "monarchy", "aristocratic_monarchy", {
	govNote: "Traditional foundation of Caucasian Iberia/Kartli under Pharnavazid kings",
	rulers: [
		[302, "Pharnavaz I", "Pharnavazid", "Traditional founder of Iberian kingship; chronology is partly legendary", "abstraction"],
		[237, "Saurmag I", "Pharnavazid", "Traditional successor in early Iberian lists", "abstraction"],
		[162, "Mirian I", "Pharnavazid", "Early Iberian king in Georgian tradition", "abstraction"],
		[100, "Artaxiad/Pharnavazid-linked kings", "Iberian", "Sparse pre-2AD Caucasian Iberian succession marker", "abstraction"],
	],
})

const wars = [
	war({
		warId: "yuezhiSakaMigrationWars",
		name: "Yuezhi-Saka Migration Wars",
		casusBelli: "cb_migration",
		warGoalType: "take_claim",
		warGoalProvince: "453",
		attacker: ["cp_yuezhi"],
		defender: ["cp_scythia"],
		start: d(176),
		end: d(130),
		note: "Xiongnu pressure displaced the Yuezhi westward, which in turn pushed Saka/Scythian groups toward Sogdia, Bactria, and India. No Xiongnu tag was found in this local pre-2AD footprint, so this models the Yuezhi-Saka displacement only.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "seleucidBactrianWar",
		name: "Seleucid-Bactrian War",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "450",
		attacker: ["cp_seleucid_empire"],
		defender: ["cp_greco_bactrian_kingdom"],
		start: d(209),
		end: d(206),
		note: "Antiochus III campaigns against Euthydemus I, wins at the Arius, but recognizes the Greco-Bactrian monarchy after the siege of Bactra.",
		battles: [
			battle({ year: 208, name: "Battle of the Arius", locationProvinceId: "446", attacker: { country: "cp_seleucid_empire", commander: "Antiochus III", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_greco_bactrian_kingdom", commander: "Euthydemus I", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Herat (446) stands in for the Arius/Herat river theater.", sourceConfidence: "abstraction" }),
			battle({ year: 206, name: "Siege of Bactra", locationProvinceId: "450", attacker: { country: "cp_seleucid_empire", commander: "Antiochus III", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_greco_bactrian_kingdom", commander: "Euthydemus I", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: false, note: "Balkh (450) stands in for Bactra." }),
		],
	}),
	war({
		warId: "indoGreekExpansion",
		name: "Indo-Greek Expansion",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "506",
		attacker: ["cp_indo_greeks"],
		defender: ["cp_shunga_empire"],
		start: d(180),
		end: d(160),
		note: "Indo-Greek/Yavana incursions into northwestern and northern India. This complements the Shunga-Greek war entry in india-successor-wars.json and focuses on the Indo-Greek side.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "eucratidEuthydemidCivilWar",
		name: "Eucratid-Euthydemid Civil War",
		casusBelli: "cb_independence_war",
		warGoalType: "take_capital",
		warGoalProvince: "450",
		attacker: ["cp_greco_bactrian_kingdom"],
		defender: ["cp_greco_bactrian_kingdom"],
		start: d(171),
		end: d(160),
		note: "Eucratides I's usurpation and wars against Euthydemid/Indo-Greek rivals. Same tag on both sides because no separate Eucratid tag exists.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "sakaConquestOfIndoGreekLands",
		name: "Saka Conquest of Indo-Greek Lands",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "506",
		attacker: ["cp_indo_scythians"],
		defender: ["cp_indo_greeks"],
		start: d(85),
		end: d(35),
		note: "Indo-Scythian Saka rulers displace Indo-Greek power across Gandhara, Punjab, Sindh, and western India.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 58, name: "Azes's Gandhara-Punjab consolidation", locationProvinceId: "506", attacker: { country: "cp_indo_scythians", commander: "Azes I", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_indo_greeks", commander: "Late Indo-Greek kings", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Multan (506) stands in for the Punjab/Gandhara transition zone.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "indoParthianExpansion",
		name: "Indo-Parthian Expansion",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "448",
		attacker: ["cp_indo_parthians"],
		defender: ["cp_indo_scythians"],
		start: d(20),
		end: d(1),
		note: "Indo-Parthian rulers begin replacing Indo-Scythian authorities in Arachosia, Seistan, and Sindh around the turn of the era. End date is 1 BC to stay inside the pre-2AD audit window.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "hittiteOldKingdomExpansion",
		name: "Old Hittite Expansion",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "2301",
		attacker: ["cp_hittites"],
		defender: ["cp_hittites"],
		start: d(1650),
		end: d(1595),
		note: "Hattusili I and Mursili I expand Hittite power into Anatolia and Syria; no separate Hattian/Yamhad/Babylon target tags are available for the core targets in this local set, so this is same-tag expansion context.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "urartuAssyrianWars",
		name: "Urartu-Assyrian Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "331",
		attacker: ["cp_kingdom_of_urartu"],
		defender: ["cp_neo_assyrian_empire"],
		start: d(830),
		end: d(714),
		note: "Long Urartian-Assyrian rivalry over eastern Anatolia and the Caucasus, ending with Sargon II's devastating eighth campaign.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 714, name: "Sargon II's eighth campaign", locationProvinceId: "331", attacker: { country: "cp_neo_assyrian_empire", commander: "Sargon II", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_kingdom_of_urartu", commander: "Rusa I", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Erserum (331) stands in for the Urartu frontier; Lake Van-specific sites map imperfectly.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "phrygianCimmerianCrisis",
		name: "Phrygian-Cimmerian Crisis",
		casusBelli: "cb_conquest",
		warGoalType: "take_capital",
		warGoalProvince: "326",
		attacker: ["cp_scythia"],
		defender: ["cp_phrygia"],
		start: d(705),
		end: d(695),
		note: "Cimmerian/steppe attacks devastate Phrygia and are traditionally associated with Midas's death. No Cimmerian tag exists; cp_scythia stands in for the steppe invaders.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "lydianMedianWar",
		name: "Lydian-Median War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "4313",
		attacker: ["cp_lydia"],
		defender: ["cp_median_kingdom"],
		start: d(590),
		end: d(585),
		note: "War between Alyattes of Lydia and Cyaxares of Media, ending after the eclipse battle and a negotiated Halys frontier.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 585, name: "Battle of the Eclipse", locationProvinceId: "4313", attacker: { country: "cp_lydia", commander: "Alyattes", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_median_kingdom", commander: "Cyaxares", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: false, note: "Cangiri (4313) stands in for the Halys frontier.", sourceConfidence: "abstraction" }),
		],
	}),
	war({
		warId: "artaxiadArmenianExpansion",
		name: "Artaxiad Armenian Expansion",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "418",
		attacker: ["cp_kingdom_of_armenia"],
		defender: ["cp_seleucid_empire"],
		start: d(190),
		end: d(160),
		note: "Artaxias I establishes an independent Armenian kingdom after Seleucid defeat by Rome and expands Armenian control.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "tigranesArmenianEmpire",
		name: "Tigranes II's Armenian Empire",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "377",
		attacker: ["cp_kingdom_of_armenia"],
		defender: ["cp_seleucid_empire"],
		start: d(83),
		end: d(69),
		note: "Tigranes II conquers Syria and northern Mesopotamian territories before Roman intervention. The later Roman-Armenian/Pontic phase is covered under Roman/Pontic wars elsewhere.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "pharnacesPonticExpansion",
		name: "Pharnaces I's Pontic Expansion",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "328",
		attacker: ["cp_kingdom_of_pontus"],
		defender: ["cp_athens"],
		start: d(183),
		end: d(179),
		note: "Pharnaces I captures Sinope and expands Pontus along the Black Sea coast; cp_athens stands in for Sinope/Greek coastal poleis.",
		sourceConfidence: "abstraction",
		battles: [
			battle({ year: 183, name: "Capture of Sinope", locationProvinceId: "328", attacker: { country: "cp_kingdom_of_pontus", commander: "Pharnaces I", infantry: null, cavalry: null, artillery: null, losses: null }, defender: { country: "cp_athens", commander: "Sinope defenders", infantry: null, cavalry: null, artillery: null, losses: null }, attackerWon: true, note: "Sinope (328) is directly available." }),
		],
	}),
	war({
		warId: "ponticColchianExpansion",
		name: "Pontic Expansion into Colchis",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "2196",
		attacker: ["cp_kingdom_of_pontus"],
		defender: ["cp_colchis"],
		start: d(110),
		end: d(100),
		note: "Mithridates VI brings Colchis and the eastern Black Sea into the Pontic sphere. Represented because both Pontus and Colchis tags exist.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "cappadocianPonticDynasticWars",
		name: "Cappadocian-Pontic Dynastic Wars",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "323",
		attacker: ["cp_kingdom_of_pontus"],
		defender: ["cp_kingdom_of_cappadocia"],
		start: d(116),
		end: d(95),
		note: "Mithridates VI and allied factions manipulate, invade, and dominate Cappadocia until Rome installs Ariobarzanes I.",
		sourceConfidence: "abstraction",
	}),
]

const revolts = {
	"450": {
		events: [
			revoltEvent({ year: 256, type: "noble_rebels", size: 4, leader: "Diodotus I", comment: "Bactrian secession from Seleucid rule", note: "Diodotus I's secession is also represented as the founding event for cp_greco_bactrian_kingdom; revolt marker records the satrapal break because no separate Diodotid rebel tag exists." }),
			revoltEvent({ year: 171, type: "pretender_rebels", size: 4, leader: "Eucratides I", comment: "Eucratid usurpation", note: "Eucratides's seizure of Bactria is recorded as internal Greco-Bactrian conflict with no separate tag.", sourceConfidence: "abstraction" }),
		],
	},
	"318": {
		events: [
			revoltEvent({ year: 88, type: "nationalist_rebels", size: 4, comment: "Asiatic Vespers", note: "Smyrna/western Anatolia stands in for the urban massacre of Romans and Italians during Mithridates VI's opening offensive. The Mithridatic Wars already live in republic-wars.json; this revolt entry marks the anti-Roman urban uprising component without duplicating the war.", sourceConfidence: "abstraction" }),
		],
	},
}

function writeNation(builder) {
	const out = { _readme: readme, tag: builder.tag, events: builder.events.sort((a, b) => a.date - b.date) }
	if (builder.provinceEvents) out.provinceEvents = builder.provinceEvents
	fs.writeFileSync(
		path.join(auditsDir, `${builder.tag}.json`),
		JSON.stringify(out, null, "\t") + "\n",
	)
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })

const builders = [
	scythia,
	yuezhi,
	indoScythians,
	grecoBactrian,
	indoGreeks,
	indoParthians,
	hittites,
	neoHittite,
	phrygia,
	lydia,
	urartu,
	armenia,
	pontus,
	cappadocia,
	colchis,
	caucasianIberia,
]

for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "steppe-anatolia-bactria-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: wars for the Steppe / Anatolia-Caucasus / Bactria-India batch. Existing war files already cover Darius's Scythian campaign, Kadesh, Alexander's Achaemenid war, Lydian conquest by Persia, Mithridatic Wars, and Roman-Pontic wars; those are not duplicated here.",
			wars: wars.sort((a, b) => a.events[0].date - b.events[0].date),
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "steppe-anatolia-bactria-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Steppe / Anatolia-Caucasus / Bactria-India batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields. Only includes internal upheavals without a clean separate opposing tag.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, and ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts`)

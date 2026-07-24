// One-off generator for the Anatolia / Caucasus / Iranian frontier / Black Sea pre-2AD audit batch.
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
	function govChange(year, governmentType, note, sourceConfidence = "abstraction") {
		event(year, "governmentChange", { governmentType }, note, sourceConfidence)
	}
	function reformAdd(year, reformId, note, sourceConfidence = "abstraction") {
		event(year, "governmentReformAdd", { reformId }, note, sourceConfidence)
	}
	return { tag, events, ruler, govChange, reformAdd, provinceEvents }
}

function provinceEvent(year, kind, payload, note, sourceConfidence = "abstraction") {
	return { date: d(year), kind, payload, note, sourceConfidence }
}

function cultureReligionEvents(entries) {
	const out = {}
	for (const { provinceIds, year, cultureId, religionId, note } of entries) {
		for (const provinceId of provinceIds) {
			if (!out[provinceId]) out[provinceId] = []
			if (cultureId) out[provinceId].push(provinceEvent(year, "culture", { cultureId }, note))
			if (religionId) out[provinceId].push(provinceEvent(year, "religion", { religionId }, note))
		}
	}
	return out
}

function war({ warId, name, casusBelli, warGoalType, warGoalTag = null, warGoalProvince = null, attacker, defender, start, end, battles = [], note, sourceConfidence = "traditional" }) {
	const events = []
	for (const tag of attacker) events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	for (const tag of defender) events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	for (const tag of attacker) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	for (const tag of defender) events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	return { warId, name, casusBelli, warGoalType, warGoalTag, warGoalProvince, isRebel: false, events, battles, note, sourceConfidence }
}

function battle({ year, name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence = "traditional" }) {
	return { date: d(year), name, locationProvinceId, attacker, defender, attackerWon, note, sourceConfidence }
}

function revoltEvent({ year, type, size, leader, comment, note, sourceConfidence = "traditional" }) {
	const revolt = { type, size }
	if (leader) revolt.leader = leader
	return { date: d(year), kind: "revolt", payload: { revolt }, comment, note, sourceConfidence }
}

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the Anatolia / Caucasus / Iranian frontier / Black Sea batch. Same methodology as scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. ProvinceEvents reuse existing Greek/Galatian/Phrygian/Armenian/Georgian/Zoroastrian/Hellenism ids where adequate, and propose only narrow ancient culture ids for Tabal, Atropatene, Caucasian Albania, and Lazica where reference coverage is missing or too modern/coarse."

const monarchyReform = "autocracy_reform"
const tribalReform = "tribal_kingdom"
const republicReform = "oligarchy_reform"

function addCore(builder, year, governmentType, reformId, govNote, reformNote) {
	builder.govChange(year, governmentType, govNote)
	builder.reformAdd(year, reformId, reformNote)
}

const tabal = nationBuilder("cp_tabal_kingdom", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["327", "332"],
			year: 900,
			cultureId: "tabalian",
			religionId: "hellenism",
			note: "Proposes tabalian culture for the Neo-Hittite/Luwian Tabal sphere; existing Aramaic baseline is too Mesopotamian for central Anatolia.",
		},
	]),
})
addCore(tabal, 900, "monarchy", monarchyReform, "Tabal appears among Neo-Hittite/Luwian kingdoms in central Anatolia", "Reuses autocracy reform for Neo-Hittite royal city-state rule.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[900, "Tabalian city-kings", "Collective marker for early Tabal before securely named rulers", "abstraction"],
	[837, "Tuwati of Tabal", "Tabalian ruler known from Assyrian records"],
	[730, "Wasusarma", "Tabalian ruler deposed under Assyrian pressure"],
	[713, "Ambaris", "Ruler of Bit-Burutash/Tabal caught between Assyria and Phrygia"],
	[650, "Late Tabal dynasts", "Tabal fragments under Assyrian, Cimmerian, and Anatolian pressure", "abstraction"],
]) {
	tabal.ruler(year, name, { dynasty: "Tabal", note, sourceConfidence })
}

const bithynia = nationBuilder("cp_kingdom_of_bithynia")
addCore(bithynia, 297, "monarchy", monarchyReform, "Zipoetes I assumes royal authority in Bithynia after resisting Diadochi pressure", "Reuses autocracy reform for Hellenistic Anatolian kingship.")
for (const [year, name, note] of [
	[327, "Bas", "Bithynian dynast who resisted Alexander's successor Kalas"],
	[297, "Zipoetes I", "Founder of the Bithynian kingdom"],
	[278, "Nicomedes I", "Brought Galatian allies into Anatolia and founded Nicomedia"],
	[255, "Ziaelas", "Bithynian king after dynastic conflict"],
	[228, "Prusias I", "Expanded Bithynian power and fought Pergamon"],
	[182, "Prusias II", "Bithynian king in conflicts with Pergamon and Rome"],
	[149, "Nicomedes II", "Overthrew Prusias II with Pergamene support"],
	[94, "Nicomedes III", "Late Hellenistic Bithynian king involved in Cappadocian affairs"],
	[74, "Nicomedes IV", "Last Bithynian king; bequeathed the kingdom to Rome"],
]) {
	bithynia.ruler(year, name, { dynasty: "Bithynian", note })
}

const atropatene = nationBuilder("ATR", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["416", "417", "426", "2207", "2211", "2212", "2215", "4300", "4338", "4339"],
			year: 323,
			cultureId: "atropatenian_median",
			religionId: "zoroastrian",
			note: "Proposes atropatenian_median culture for Media Atropatene; existing Talysh/Mazandarani/Persian labels are later or too broad.",
		},
	]),
})
addCore(atropatene, 323, "monarchy", monarchyReform, "Atropates preserves an independent Median satrapal kingdom after Alexander's death", "Reuses autocracy reform for Iranian dynastic kingship.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[323, "Atropates", "Founder of Media Atropatene after Alexander's empire fractured"],
	[280, "Artabazanes", "Early Atropatenian king; chronology approximate", "abstraction"],
	[220, "Atropatenian kings", "Local dynasty maintains autonomy between Seleucid, Armenian, and Parthian powers", "abstraction"],
	[67, "Darius of Media Atropatene", "Atropatenian ruler in the Mithridatic/Roman diplomatic sphere"],
	[36, "Artavasdes I of Atropatene", "Opposed Mark Antony's Parthian campaign and later aligned with Rome"],
]) {
	atropatene.ruler(year, name, { dynasty: "Atropatid", note, sourceConfidence })
}

const galatia = nationBuilder("cp_galatia", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["323", "326", "4314"],
			year: 278,
			cultureId: "galatian",
			religionId: "hellenism",
			note: "Uses existing galatian culture for the Celtic settlement in central Anatolia; hellenism is the existing local ancient cult bucket.",
		},
	]),
})
addCore(galatia, 278, "tribal", tribalReform, "Galatian Celtic groups cross into Anatolia and settle around Ancyra, Pessinus, and Tavium", "Reuses tribal kingdom reform for Galatian tetrarchic tribal rule.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[278, "Leonnorius and Lutarius", "Traditional leaders of the Galatian migration into Anatolia"],
	[240, "Galatian tetrarchs", "Galatian tribes consolidate in central Anatolia", "abstraction"],
	[189, "Galatian chiefs", "Defeated by Rome in the Galatian War after supporting Antiochus III"],
	[64, "Deiotarus", "Powerful Galatian tetrarch and later king, allied with Rome"],
	[25, "Amyntas", "Last Galatian king before Roman annexation"],
]) {
	galatia.ruler(year, name, { dynasty: "Galatian", note, sourceConfidence })
}

const paphlagonia = nationBuilder("cp_paphlagonia")
addCore(paphlagonia, 281, "monarchy", monarchyReform, "Paphlagonian dynasts maneuver between Pontus, Bithynia, and Seleucid successors", "Reuses autocracy reform for local Anatolian dynasts.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[281, "Paphlagonian dynasts", "Local rulers survive between Diadochi kingdoms; early names are uncertain", "abstraction"],
	[183, "Morzius", "Paphlagonian ruler in the Roman/Pergamene diplomatic sphere"],
	[108, "Pylaemenes of Paphlagonia", "Late Paphlagonian dynastic name used by multiple rulers; chronology approximate", "abstraction"],
	[64, "Paphlagonian client rulers", "Pompeian settlement reshapes Paphlagonia into client arrangements", "abstraction"],
])
	paphlagonia.ruler(year, name, { dynasty: "Paphlagonian", note, sourceConfidence })

const sophene = nationBuilder("cp_kingdom_of_sophene", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["2305"],
			year: 200,
			cultureId: "armenian",
			religionId: "armenian_religion",
			note: "Uses existing Armenian culture and Armenian Religion for Sophene; source baseline has hellenism despite Armenian highland identity.",
		},
	]),
})
addCore(sophene, 200, "monarchy", monarchyReform, "Sophene emerges as an Armenian highland kingdom between Seleucid, Armenian, and Roman spheres", "Reuses autocracy reform for Orontid/Armenian dynastic rule.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[200, "Zariadres", "Founder/ruler of Sophene after Seleucid weakening"],
	[188, "Artaxiad-linked Sophene kings", "Sophene remains a separate Armenian kingdom after Apamea", "abstraction"],
	[95, "Artanes of Sophene", "Last Sophene king before Tigranes II incorporated the kingdom"],
]) {
	sophene.ruler(year, name, { dynasty: "Orontid", note, sourceConfidence })
}

const pergamon = nationBuilder("cp_kingdom_of_pergamon")
addCore(pergamon, 281, "monarchy", monarchyReform, "Philetaerus establishes Pergamene independence after Lysimachus's death", "Reuses autocracy reform for Attalid Hellenistic kingship.")
for (const [year, name, note] of [
	[281, "Philetaerus", "Founder of the Attalid power base at Pergamon"],
	[263, "Eumenes I", "Secured independence from the Seleucids"],
	[241, "Attalus I", "Took royal title after victories over Galatians"],
	[197, "Eumenes II", "Pergamon's high point; Roman ally against Antiochus III and Macedon"],
	[159, "Attalus II Philadelphus", "Attalid king and Roman ally"],
	[138, "Attalus III", "Last Attalid king; bequeathed Pergamon to Rome"],
	[133, "Aristonicus", "Claimant who resisted Roman takeover as Eumenes III"],
	[129, "Roman settlement of Asia", "Pergamon's independent kingdom is dissolved into Roman Asia", "abstraction"],
]) {
	pergamon.ruler(year, name, { dynasty: "Attalid", note })
}

const bosporus = nationBuilder("cp_cimmerian_bosporus")
addCore(bosporus, 480, "monarchy", monarchyReform, "Greek cities around the Cimmerian Bosporus consolidate into the Bosporan Kingdom", "Reuses autocracy reform for Spartocid/Greek Bosporan kingship.")
for (const [year, name, note, sourceConfidence = "traditional"] of [
	[480, "Archaeanactid rulers", "Early Greek ruling house of the Bosporus; dates approximate"],
	[438, "Spartocus I", "Founder of the Spartocid dynasty"],
	[389, "Leucon I", "Major Bosporan king who expanded grain exports and territory"],
	[349, "Paerisades I", "Long-reigned Bosporan king in the Spartocid high point"],
	[310, "Eumelus", "Won the Bosporan succession war"],
	[250, "Spartocid kings", "Later Spartocid succession is compressed where exact dates are sparse", "abstraction"],
	[110, "Paerisades V", "Last Spartocid ruler, killed during the Scythian/Sarmatian crisis"],
	[107, "Mithridates VI's Bosporan settlement", "Bosporus enters the Pontic sphere under Mithridates VI", "abstraction"],
]) {
	bosporus.ruler(year, name, { dynasty: "Spartocid", note, sourceConfidence })
}

const albania = nationBuilder("CAA", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["420", "4305"],
			year: 65,
			cultureId: "aghwan",
			religionId: "zoroastrian",
			note: "Formalizes existing Aghwan province-event culture for Caucasian Albania and keeps existing Zoroastrian religion in the eastern Caucasus provinces.",
		},
		{
			provinceIds: ["423", "2203"],
			year: 65,
			cultureId: "georgian",
			religionId: "georgian_religion",
			note: "Keeps Georgian culture/religion for Kartli/Kakheti provinces within the local Caucasian Albania owner footprint.",
		},
	]),
})
addCore(albania, 65, "monarchy", tribalReform, "Caucasian Albania appears as a kingdom north of Armenia in Roman-Parthian frontier politics", "Reuses tribal kingdom reform for Caucasian highland royal-confederate structure.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[65, "Oroezes of Albania", "Albanian ruler in Pompey's Caucasian campaign tradition"],
	[36, "Zober of Albania", "Later Albanian royal name in Roman campaign accounts; dates approximate"],
	[1, "Early Arsacid-linked Albanian kings", "Late pre-2AD marker for Albanian kingship between Armenia, Iberia, and Parthia"],
]) {
	albania.ruler(year, name, { dynasty: "Albanian", note, sourceConfidence })
}

const lazica = nationBuilder("LAZ", {
	provinceEvents: cultureReligionEvents([
		{
			provinceIds: ["462", "1856", "2196"],
			year: 65,
			cultureId: "lazic",
			religionId: "georgian_religion",
			note: "Proposes lazic culture for Colchian/Laz coastal Georgia; existing Georgian/Circassian split is too broad for Lazica.",
		},
	]),
})
addCore(lazica, 65, "monarchy", tribalReform, "Lazica/Colchian successor rule appears on the eastern Black Sea frontier", "Reuses tribal kingdom reform for early Laz/Colchian royal structures.")
for (const [year, name, note, sourceConfidence = "abstraction"] of [
	[65, "Colchian-Laz rulers", "Pompeian and Roman frontier period marker for eastern Black Sea client kingship"],
	[1, "Early Lazic dynasts", "Late pre-2AD marker before better-attested late antique Lazica"],
]) {
	lazica.ruler(year, name, { dynasty: "Lazic", note, sourceConfidence })
}

const wars = [
	war({
		warId: "assyrianCampaignsAgainstTabal",
		name: "Assyrian campaigns against Tabal",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_tabal_kingdom",
		warGoalProvince: "327",
		attacker: ["cp_neo_assyrian_empire"],
		defender: ["cp_tabal_kingdom"],
		start: d(738),
		end: d(713),
		note: "Tiglath-Pileser III and Sargon II impose and enforce Assyrian control over Tabal/Bit-Burutash.",
		battles: [],
	}),
	war({
		warId: "bithynianWarsWithPergamon",
		name: "Bithynian wars with Pergamon",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_kingdom_of_pergamon",
		warGoalProvince: "317",
		attacker: ["cp_kingdom_of_bithynia"],
		defender: ["cp_kingdom_of_pergamon"],
		start: d(186),
		end: d(183),
		note: "Prusias I fights Eumenes II of Pergamon with Hannibal's support in Bithynian service.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "galatianWar",
		name: "Roman-Galatian War",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_galatia",
		warGoalProvince: "326",
		attacker: ["cp_roman_republic", "cp_kingdom_of_pergamon"],
		defender: ["cp_galatia"],
		start: d(189),
		end: d(189),
		note: "Gnaeus Manlius Vulso campaigns against Galatian tribes after the Roman-Seleucid War.",
		battles: [
			battle({
				year: 189,
				name: "Battle of Mount Olympus",
				locationProvinceId: "326",
				attacker: { country: "cp_roman_republic", commander: "Gnaeus Manlius Vulso", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_galatia", commander: "Galatian tribal chiefs", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Angora (326) stands in for the Galatian highland battlefield.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "pergameneSeleucidWar",
		name: "Pergamene-Seleucid war",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_kingdom_of_pergamon",
		warGoalProvince: "2297",
		attacker: ["cp_kingdom_of_pergamon"],
		defender: ["cp_seleucid_empire"],
		start: d(263),
		end: d(261),
		note: "Eumenes I defeats Antiochus I near Sardis and secures Pergamene independence.",
		battles: [
			battle({
				year: 261,
				name: "Battle near Sardis",
				locationProvinceId: "2297",
				attacker: { country: "cp_kingdom_of_pergamon", commander: "Eumenes I", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_seleucid_empire", commander: "Antiochus I", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Saruhan (2297) stands in for Sardis/Lydia.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "aristonicusWar",
		name: "War of Aristonicus",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_kingdom_of_pergamon",
		warGoalProvince: "318",
		attacker: ["cp_kingdom_of_pergamon"],
		defender: ["cp_roman_republic"],
		start: d(133),
		end: d(129),
		note: "Aristonicus/Eumenes III resists Roman annexation after Attalus III's bequest.",
		battles: [],
	}),
	war({
		warId: "bosporanSuccessionWar",
		name: "Bosporan succession war",
		casusBelli: "cb_independence_war",
		warGoalType: "take_province",
		warGoalTag: "cp_cimmerian_bosporus",
		warGoalProvince: "2447",
		attacker: ["cp_cimmerian_bosporus"],
		defender: ["cp_scythia"],
		start: d(310),
		end: d(309),
		note: "Eumelus defeats rival claimants with local steppe support; Scythia stands in for the non-Greek steppe-aligned faction.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "mithridaticBosporanTakeover",
		name: "Mithridatic takeover of the Bosporus",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "cp_cimmerian_bosporus",
		warGoalProvince: "2447",
		attacker: ["cp_kingdom_of_pontus"],
		defender: ["cp_cimmerian_bosporus", "cp_scythia"],
		start: d(110),
		end: d(107),
		note: "Mithridates VI intervenes as Bosporan rulers face Scythian pressure and brings the kingdom into the Pontic sphere.",
		sourceConfidence: "abstraction",
		battles: [],
	}),
	war({
		warId: "pompeysCaucasianCampaign",
		name: "Pompey's Caucasian campaign",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "CAA",
		warGoalProvince: "420",
		attacker: ["cp_roman_republic"],
		defender: ["CAA", "LAZ"],
		start: d(65),
		end: d(65),
		note: "Pompey campaigns into the Caucasus against Iberian, Albanian, and Colchian/Laz frontier powers after the Mithridatic War.",
		battles: [
			battle({
				year: 65,
				name: "Battle of the Abas",
				locationProvinceId: "420",
				attacker: { country: "cp_roman_republic", commander: "Pompey", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "CAA", commander: "Oroezes", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Qarabagh (420) stands in for Caucasian Albania's river battlefield.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "antonysAtropateneCampaign",
		name: "Antony's Atropatene campaign",
		casusBelli: "cb_conquest",
		warGoalType: "take_province",
		warGoalTag: "ATR",
		warGoalProvince: "416",
		attacker: ["ROM"],
		defender: ["ATR", "PRT"],
		start: d(36),
		end: d(36),
		note: "Mark Antony's Parthian campaign fails around Media Atropatene; Parthia remains for a later full audit but is an existing tag.",
		battles: [],
	}),
]

const revolts = {
	"318": {
		events: [
			revoltEvent({
				year: 133,
				type: "pretender_rebels",
				size: 4,
				leader: "Aristonicus",
				comment: "Aristonicus claims Pergamon as Eumenes III",
				note: "Companion revolt marker for resistance to Roman annexation of Pergamon.",
			}),
		],
	},
	"326": {
		events: [
			revoltEvent({
				year: 189,
				type: "particularist_rebels",
				size: 3,
				comment: "Galatian resistance to Roman punitive campaign",
				note: "Local tribal resistance during Manlius Vulso's Galatian campaign.",
				sourceConfidence: "abstraction",
			}),
		],
	},
}

const heritageAudit = [
	{
		id: "byzantine",
		name: "Byzantine",
		cultures: [
			{
				id: "tabalian",
				name: "Tabalian",
				primaryTag: "cp_tabal_kingdom",
				color: [124, 128, 82],
			},
		],
	},
	{
		id: "iranian",
		name: "Iranian",
		cultures: [
			{
				id: "atropatenian_median",
				name: "Atropatenian Median",
				primaryTag: "ATR",
				color: [119, 142, 102],
			},
		],
	},
	{
		id: "caucasian",
		name: "Caucasian",
		cultures: [
			{
				id: "lazic",
				name: "Lazic",
				primaryTag: "LAZ",
				color: [138, 108, 128],
			},
		],
	},
]

function writeNation(builder) {
	const out = { _readme: readme, tag: builder.tag, events: builder.events.sort((a, b) => a.date - b.date) }
	if (builder.provinceEvents) out.provinceEvents = builder.provinceEvents
	fs.writeFileSync(path.join(auditsDir, `${builder.tag}.json`), JSON.stringify(out, null, "\t") + "\n")
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
const revoltsDir = path.join(auditsDir, "revolts")
const heritagesDir = path.join(auditsDir, "heritages")
fs.mkdirSync(warsDir, { recursive: true })
fs.mkdirSync(revoltsDir, { recursive: true })
fs.mkdirSync(heritagesDir, { recursive: true })

const builders = [tabal, bithynia, atropatene, galatia, paphlagonia, sophene, pergamon, bosporus, albania, lazica]
for (const builder of builders) writeNation(builder)

fs.writeFileSync(
	path.join(warsDir, "anatolia-caucasus-frontier-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: reconstructed pre-2AD wars for the Anatolia / Caucasus / Iranian frontier / Black Sea batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields. Parthia is referenced where it is an unavoidable opposing tag, but the full Parthian audit remains for a later batch.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(
	path.join(revoltsDir, "anatolia-caucasus-frontier-revolts.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: revolts for the Anatolia / Caucasus / Iranian frontier / Black Sea batch. Mirrors events/provinces.json's revolt event schema plus note/sourceConfidence fields.",
			provinces: revolts,
		},
		null,
		"\t",
	) + "\n",
)

fs.writeFileSync(path.join(heritagesDir, "anatolia-caucasus-frontier-heritages.json"), JSON.stringify(heritageAudit, null, "\t") + "\n")

console.log(`wrote ${builders.length} nation files, ${wars.length} wars, ${Object.values(revolts).reduce((sum, entry) => sum + entry.events.length, 0)} revolts, and ${heritageAudit.reduce((sum, group) => sum + group.cultures.length, 0)} heritage cultures`)

// One-off generator for the post-Mauryan India successor pre-2AD audit batch.
// Writes five nation audit files plus a shared wars file:
//   - public/earth-history/audits/cp_nanda_empire.json
//   - public/earth-history/audits/cp_shunga_empire.json
//   - public/earth-history/audits/cp_kanva_dynasty.json
//   - public/earth-history/audits/cp_satavahana_dynasty.json
//   - public/earth-history/audits/cp_mahameghavahana_dynasty.json
//   - public/earth-history/audits/wars/india-successor-wars.json
// Follows scripts/audit/ancient-nation-audit-prompt.md methodology; dates use real
// historical BCE years and the project day encoding (day 0 = 2 AD Jan 1).
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(month, day) {
	return CUM_MONTH_DAYS[month - 1] + day
}

function eu4DateToDays(astroYear, month, day) {
	const startDay = dayOfYear(1, 1)
	return (
		(astroYear - EARTH_HISTORY_START_YEAR) * 365 +
		dayOfYear(month, day) -
		startDay
	)
}

function bc(year) {
	return 1 - year
}

function d(year, month = 1, day = 1) {
	return eu4DateToDays(bc(year), month, day)
}

function nationBuilder(tag) {
	const events = []
	function event(year, kind, payload, note, sourceConfidence = "traditional") {
		events.push({
			date: d(year),
			kind,
			payload,
			note,
			sourceConfidence,
		})
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
	return { tag, events, ruler, govChange, reformAdd }
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
	for (const tag of attacker) {
		events.push({ date: start, nationTag: tag, kind: "warStart", side: "attacker" })
	}
	for (const tag of defender) {
		events.push({ date: start, nationTag: tag, kind: "warStart", side: "defender" })
	}
	for (const tag of attacker) {
		events.push({ date: end, nationTag: tag, kind: "warEnd", side: "attacker" })
	}
	for (const tag of defender) {
		events.push({ date: end, nationTag: tag, kind: "warEnd", side: "defender" })
	}
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

const readme =
	"Audit/proposal file: reconstructed pre-2AD events for the post-Mauryan India successor batch (Nanda, Shunga, Kanva, Satavahana, and Mahameghavahana/Kalinga). Same methodology as audits/cp_maurya_empire.json and scripts/audit/ancient-nation-audit-prompt.md. Not wired into the engine. Dates use real historical BCE years rather than imperialis/countries.json relative-year numbering. The Nanda and Kalinga/Mahameghavahana records are especially thin and disputed, so sparse or inscription-derived stretches are flagged as sourceConfidence: 'abstraction'."

// =======================================================================
// NANDA EMPIRE (cp_nanda_empire) -- capital Pataliputra / Patna (4447)
// =======================================================================
const nanda = nationBuilder("cp_nanda_empire")
nanda.govChange(345, "monarchy", "Approximate establishment of Nanda supremacy over Magadha and the Gangetic plain from Pataliputra")
nanda.reformAdd(345, "vedic_kingdom", "Reuses the existing Indian monarchy reform id already used by the Maurya audit for the pre-Ashokan Magadhan imperial tradition", "abstraction")
nanda.ruler(345, "Mahapadma Nanda", {
	dynasty: "Nanda",
	note: "First Nanda king in the Puranic tradition; credited with broad conquests over Kshatriya polities including Kalinga, Kosala, Kuru-Panchala, Haihaya, and Ashmaka",
})
nanda.ruler(329, "Dhana Nanda", {
	dynasty: "Nanda",
	note: "Last Nanda king; commonly identified with the Agrammes/Xandrames of Greco-Roman accounts encountered during Alexander's Indian campaign",
})
nanda.ruler(323, "Dhana Nanda and Bhaddasala", {
	dynasty: "Nanda",
	note: "Dhana Nanda remains king while general Bhaddasala leads Nanda forces in the Nanda-Mauryan War; included because the Milinda Panha preserves Bhaddasala as the named Nanda commander",
	sourceConfidence: "abstraction",
})

// =======================================================================
// SHUNGA EMPIRE (cp_shunga_empire) -- Pataliputra / Vidisha
// =======================================================================
const shunga = nationBuilder("cp_shunga_empire")
shunga.govChange(185, "monarchy", "Pushyamitra Shunga, Mauryan commander-in-chief, kills Brihadratha Maurya and founds the Shunga dynasty")
shunga.reformAdd(185, "vedic_kingdom", "Reuses the existing Indian monarchy reform id; Shunga political legitimacy is usually tied to Brahmanical/Vedic restoration", "abstraction")
for (const [year, name, note] of [
	[185, "Pushyamitra Shunga", "Founder; former Mauryan commander-in-chief; traditionally credited with Ashvamedha sacrifices and resistance to Yavana/Indo-Greek incursions"],
	[149, "Agnimitra", "Son of Pushyamitra; known from Kalidasa's Malavikagnimitram and associated with Vidisha"],
	[141, "Vasujyeshtha", "Third Shunga ruler in the Puranic king list"],
	[131, "Vasumitra", "Traditionally credited with defeating Yavanas near the Sindhu during Pushyamitra's Ashvamedha"],
	[124, "Bhadraka", "Short-reigned Shunga ruler; included to preserve the full attested dynastic sequence"],
	[122, "Pulindaka", "Short-reigned Shunga ruler; included to preserve the full attested dynastic sequence"],
	[119, "Ghosha or Vajramitra", "Name varies in the lists; included as the disputed seventh Shunga ruler"],
	[114, "Bhagabhadra", "Late Shunga ruler known from the Heliodorus pillar context at Besnagar/Vidisha"],
	[83, "Devabhuti", "Last Shunga ruler; assassinated by his minister Vasudeva Kanva around 73 BC"],
]) {
	shunga.ruler(year, name, { dynasty: "Shunga", note, sourceConfidence: name.includes(" or ") ? "abstraction" : "traditional" })
}

// =======================================================================
// KANVA DYNASTY (cp_kanva_dynasty) -- Pataliputra / Vidisha
// =======================================================================
const kanva = nationBuilder("cp_kanva_dynasty")
kanva.govChange(73, "monarchy", "Vasudeva Kanva overthrows the last Shunga ruler, Devabhuti")
kanva.reformAdd(73, "aristocratic_monarchy", "Reuses an existing monarchy reform id; Kanva rule begins as a ministerial usurpation from the Shunga court", "abstraction")
for (const [year, name, note] of [
	[73, "Vasudeva Kanva", "Founder; minister of Devabhuti who killed the last Shunga ruler"],
	[64, "Bhumimitra", "Second Kanva ruler; coins bearing his name are known from northern India"],
	[50, "Narayana", "Third Kanva ruler in the Puranic sequence"],
	[38, "Susarman", "Last Kanva ruler; Puranic tradition says the dynasty was ended by the Andhras/Satavahanas around 28 BC"],
]) {
	kanva.ruler(year, name, { dynasty: "Kanva", note })
}

// =======================================================================
// SATAVAHANA DYNASTY (cp_satavahana_dynasty) -- Pratishthana/Nasik/Deccan
// =======================================================================
const satavahana = nationBuilder("cp_satavahana_dynasty")
satavahana.govChange(100, "monarchy", "Approximate late-2nd/1st-century BC start for epigraphically visible early Satavahana power in the western Deccan")
satavahana.reformAdd(100, "vedic_kingdom", "Reuses the existing Indian monarchy reform id; early Satavahana rulers performed Vedic sacrifices while also patronizing Buddhist institutions", "abstraction")
satavahana.ruler(100, "Simuka", {
	dynasty: "Satavahana",
	note: "Founder in the Naneghat royal list; exact chronology is disputed, but modern scholarship usually places secure Satavahana rule in the 1st century BC",
	sourceConfidence: "abstraction",
})
satavahana.ruler(70, "Kanha (Krishna)", {
	dynasty: "Satavahana",
	note: "Early Satavahana ruler known from the Nasik cave inscription, usually dated around 100-70 BC in modern scholarship",
})
satavahana.ruler(60, "Satakarni I", {
	dynasty: "Satavahana",
	note: "Early expansionist ruler; Naneghat inscription records major Vedic sacrifices performed under or around his reign",
})
satavahana.ruler(50, "Satakarni II", {
	dynasty: "Satavahana",
	note: "Associated with Sanchi donations dated roughly 50 BC-0 AD; included as the final pre-2AD Satavahana ruler in this audit",
	sourceConfidence: "abstraction",
})

// =======================================================================
// MAHAMEGHAVAHANA / KALINGA (cp_mahameghavahana_dynasty)
// =======================================================================
const mahameghavahana = nationBuilder("cp_mahameghavahana_dynasty")
mahameghavahana.govChange(185, "monarchy", "Post-Mauryan re-emergence of Kalinga under the Chedi/Mahameghavahana line after Ashoka's Kalinga conquest")
mahameghavahana.reformAdd(185, "aristocratic_monarchy", "Reuses an existing monarchy reform id; no more specific Kalinga/Chedi reform exists in the current pool", "abstraction")
mahameghavahana.ruler(185, "Mahameghavahana", {
	dynasty: "Mahameghavahana",
	note: "Eponymous early ruler of the line; included as an abstraction because the pre-Kharavela succession is poorly attested",
	sourceConfidence: "abstraction",
})
mahameghavahana.ruler(180, "Lalaka", {
	dynasty: "Mahameghavahana",
	note: "Father or predecessor of Kharavela in some readings of the Hathigumpha inscription; included cautiously because the inscription is damaged and readings vary",
	sourceConfidence: "abstraction",
})
mahameghavahana.ruler(170, "Kharavela", {
	dynasty: "Mahameghavahana",
	note: "Best-attested Mahameghavahana ruler; known from the Hathigumpha inscription, which records public works, Jain patronage, and campaigns against Satakarni and Magadha",
	sourceConfidence: "abstraction",
})

// =======================================================================
// WARS
// =======================================================================
const wars = [
	war({
		warId: "nandaMauryanWar",
		name: "Nanda-Mauryan War",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_nanda_empire",
		attacker: ["cp_maurya_empire"],
		defender: ["cp_nanda_empire"],
		start: d(323),
		end: d(321),
		note: "Chandragupta Maurya and Chanakya overthrow Dhana Nanda and take Pataliputra, creating the Maurya Empire. The exact campaign chronology is sparse; 323-321 BC follows the conventional range.",
		battles: [
			battle({
				year: 321,
				name: "Fall of Pataliputra",
				locationProvinceId: "4447",
				attacker: { country: "cp_maurya_empire", commander: "Chandragupta Maurya and Chanakya", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_nanda_empire", commander: "Dhana Nanda / Bhaddasala", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Pataliputra is represented by Patna (4447). Milinda Panha preserves Bhaddasala as the Nanda commander but its casualty figures are legendary, so force sizes are left null.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "kalingaWar",
		name: "Kalinga War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalTag: "KLI",
		warGoalProvince: "549",
		attacker: ["cp_maurya_empire"],
		defender: ["KLI"],
		start: d(262),
		end: d(261),
		note: "Ashoka's conquest of Kalinga. This complements audits/cp_maurya_empire.json, where Ashoka's post-war Buddhist patronage is already recorded.",
		battles: [
			battle({
				year: 261,
				name: "Kalinga campaign",
				locationProvinceId: "549",
				attacker: { country: "cp_maurya_empire", commander: "Ashoka", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "KLI", commander: "Kalinga defenders", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Kalingandhra (549) stands in for the Kalinga heartland; Ashoka's edicts give enormous casualties/deportations but not a conventional battle order.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "shungaCoup",
		name: "Shunga Coup and Mauryan Collapse",
		casusBelli: "cb_independence_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_maurya_empire",
		attacker: ["cp_shunga_empire"],
		defender: ["cp_maurya_empire"],
		start: d(185),
		end: d(185, 1, 2),
		note: "Pushyamitra Shunga assassinates Brihadratha Maurya during a military review and seizes Magadha. This is represented as a one-day successor war because both tags exist in the province history.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "shungaGreekWar",
		name: "Shunga-Greek War",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "4447",
		attacker: ["cp_indo_greeks"],
		defender: ["cp_shunga_empire"],
		start: d(180),
		end: d(160),
		note: "Yavana/Indo-Greek incursions into the Gangetic plain during the Shunga period; traditions connect Pushyamitra/Vasumitra with resistance to these campaigns, but the sequence and leaders remain debated.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 175,
				name: "Yavana advance toward Pataliputra",
				locationProvinceId: "4447",
				attacker: { country: "cp_indo_greeks", commander: "Demetrius or Menander", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_shunga_empire", commander: "Pushyamitra Shunga / Vasumitra", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: false,
				note: "The Yuga Purana and later traditions preserve a Yavana advance to Saketa/Panchala/Mathura/Pataliputra, but exact battle sites and commanders are uncertain; Patna (4447) marks the strategic objective.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "kharavelaSatavahanaWar",
		name: "Kharavela's Satavahana Campaign",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "542",
		attacker: ["cp_mahameghavahana_dynasty"],
		defender: ["cp_satavahana_dynasty"],
		start: d(170),
		end: d(169),
		note: "Hathigumpha inscription records Kharavela sending forces west and alarming a king Satakarni/Satakamini; chronology and identification are disputed, so this is treated as an abstraction.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 170,
				name: "Western Kalinga campaign",
				locationProvinceId: "542",
				attacker: { country: "cp_mahameghavahana_dynasty", commander: "Kharavela", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_satavahana_dynasty", commander: "Satakarni", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Colconda (542) stands in for the western/eastern Deccan contact zone; exact ancient location is debated.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "kharavelaMagadhaCampaign",
		name: "Kharavela's Magadha Campaign",
		casusBelli: "cb_conquest",
		warGoalType: "take_claim",
		warGoalProvince: "4447",
		attacker: ["cp_mahameghavahana_dynasty"],
		defender: ["cp_shunga_empire"],
		start: d(165),
		end: d(164),
		note: "Hathigumpha inscription records Kharavela's northern campaign against Magadha and the retrieval of a Jain image formerly taken by a Nanda king; exact chronology and opponent-name readings are disputed.",
		sourceConfidence: "abstraction",
		battles: [
			battle({
				year: 165,
				name: "Raid on Magadha",
				locationProvinceId: "4447",
				attacker: { country: "cp_mahameghavahana_dynasty", commander: "Kharavela", infantry: null, cavalry: null, artillery: null, losses: null },
				defender: { country: "cp_shunga_empire", commander: "Brihaspatimitra or Shunga Magadha authorities", infantry: null, cavalry: null, artillery: null, losses: null },
				attackerWon: true,
				note: "Patna (4447) stands in for Pataliputra/Magadha; the defeated ruler's name is one of the disputed Hathigumpha readings.",
				sourceConfidence: "abstraction",
			}),
		],
	}),
	war({
		warId: "kanvaUsurpation",
		name: "Kanva Usurpation",
		casusBelli: "cb_independence_war",
		warGoalType: "annex_country",
		warGoalTag: "cp_shunga_empire",
		attacker: ["cp_kanva_dynasty"],
		defender: ["cp_shunga_empire"],
		start: d(73),
		end: d(73, 1, 2),
		note: "Vasudeva Kanva, minister of Devabhuti, assassinates the last Shunga ruler and establishes the Kanva dynasty. Represented as a one-day successor war because both tags exist.",
		sourceConfidence: "abstraction",
	}),
	war({
		warId: "satavahanaKanvaWar",
		name: "Satavahana-Kanva War",
		casusBelli: "cb_conquest",
		warGoalType: "annex_country",
		warGoalTag: "cp_kanva_dynasty",
		attacker: ["cp_satavahana_dynasty"],
		defender: ["cp_kanva_dynasty"],
		start: d(30),
		end: d(28),
		note: "Puranic tradition says the Andhras/Satavahanas ended Kanva rule around 28 BC; the event appears localized in central/eastern India rather than a well-documented pitched campaign.",
		sourceConfidence: "abstraction",
	}),
]

function writeNation(builder) {
	const out = {
		_readme: readme,
		tag: builder.tag,
		events: builder.events.sort((a, b) => a.date - b.date),
	}
	fs.writeFileSync(
		path.join(auditsDir, `${builder.tag}.json`),
		JSON.stringify(out, null, "\t") + "\n",
	)
}

const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
const warsDir = path.join(auditsDir, "wars")
fs.mkdirSync(warsDir, { recursive: true })

for (const builder of [nanda, shunga, kanva, satavahana, mahameghavahana]) {
	writeNation(builder)
}

wars.sort((a, b) => a.events[0].date - b.events[0].date)
fs.writeFileSync(
	path.join(warsDir, "india-successor-wars.json"),
	JSON.stringify(
		{
			_readme:
				"Audit/proposal file: wars for the post-Mauryan India successor batch. Mirrors events/wars.json's schema plus note/sourceConfidence fields for review. Not wired into the engine.",
			wars,
		},
		null,
		"\t",
	) + "\n",
)

console.log(`wrote 5 nation files and ${wars.length} wars`)

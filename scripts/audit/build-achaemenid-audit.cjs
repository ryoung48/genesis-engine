// One-off generator for the exhaustive Achaemenid Persia (cp_achaemenid_empire)
// pre-2AD audit. Replaces public/earth-history/audits/cp_achaemenid_empire.json
// and merges Achaemenid's additional wars/revolts into the shared 5-nation
// pilot batch files:
//   - public/earth-history/audits/wars/pilot-nations-wars.json
//   - public/earth-history/audits/revolts/pilot-nations-revolts.json
// Follows scripts/audit/ancient-nation-audit-prompt.md methodology; day-encoding
// helpers match scripts/audit/build-carthage-audit.cjs / build-rome-wars-audit.cjs
// (365-day years, day 0 = 2 AD Jan 1).
const fs = require("fs")
const path = require("path")

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const EARTH_HISTORY_START_YEAR = 2

function dayOfYear(m, dd) {
	return CUM_MONTH_DAYS[m - 1] + dd
}
function eu4DateToDays(astroYear, m, dd) {
	const startD = dayOfYear(1, 1)
	const yearDays = (astroYear - EARTH_HISTORY_START_YEAR) * 365
	return yearDays + dayOfYear(m, dd) - startD
}
function bc(year) {
	return 1 - year
}
function d(year, m = 1, dd = 1) {
	return eu4DateToDays(bc(year), m, dd)
}

// ---------------------------------------------------------------------
// cp_achaemenid_empire.json -- rulers / government / reforms
// ---------------------------------------------------------------------
const events = [
	{
		date: d(550),
		kind: "governmentChange",
		payload: { governmentType: "monarchy" },
		note: "Cyrus II defeats his grandfather Astyages of Media and unites the Persians and Medes, founding the Achaemenid Empire",
		narrative: "Cyrus the Great overthrows the Medes and founds the Achaemenid Empire",
		sourceConfidence: "traditional",
	},
	{
		date: d(550),
		kind: "governmentReformAdd",
		payload: { reformId: "persian_achaemenid_monarchy" },
		note: "Matches Imperium Universalis countries.json PSE history[0]",
		narrative: "The Achaemenid monarchy is formally established as Persia's government",
		sourceConfidence: "traditional",
	},
	{
		date: d(559),
		kind: "rulerChange",
		payload: {
			name: "Cyrus the Great",
			dynasty: "Achaemenid",
			note: "King of Anshan from 559 BC; overthrew Median overlordship and founded the Achaemenid Empire in 550 BC; conquered Lydia (547 BC) and Babylon (539 BC)",
		},
		note: "Accession as King of Anshan, 559 BC, predates the 550 BC unification event above",
		narrative: "Cyrus the Great becomes King of Anshan",
		sourceConfidence: "traditional",
	},
	{
		date: d(530),
		kind: "governmentReformAdd",
		payload: { reformId: "local_administrations" },
		note: "Matches Imperium Universalis countries.json PSE history[1] -- early Achaemenid administrative organization of conquered territories under local governors, predating Darius I's formal satrapy system",
		narrative: "Conquered territories are organized under local governors",
		sourceConfidence: "abstraction",
	},
	{
		date: d(530),
		kind: "rulerChange",
		payload: {
			name: "Cambyses II",
			dynasty: "Achaemenid",
			note: "Conquered Egypt, 525 BC",
		},
		note: "Conquered Egypt, 525 BC",
		sourceConfidence: "traditional",
	},
	{
		date: d(522, 3, 1),
		kind: "rulerChange",
		payload: {
			name: "Bardiya",
			dynasty: "Achaemenid",
			note: "Brother of Cambyses II (or, per Darius I's Behistun Inscription, an imposter named Gaumata); reigned roughly March-September 522 BC before being killed by Darius and six co-conspirators. The historicity of the 'real Bardiya vs. imposter' question is genuinely disputed in the ancient sources themselves.",
		},
		note: "Brief, contested reign (c. 7 months); Behistun Inscription (Darius's own account) calls him an imposter, but this is a self-interested source for the man who killed him and seized the throne",
		sourceConfidence: "abstraction",
	},
	{
		date: d(522, 9, 29),
		kind: "rulerChange",
		payload: {
			name: "Darius I",
			dynasty: "Achaemenid",
			note: "Reorganized the empire into satrapies",
		},
		note: "Reorganized the empire into satrapies",
		sourceConfidence: "traditional",
	},
	{
		date: d(518),
		kind: "governmentReformAdd",
		payload: { reformId: "district_divisions" },
		note: "Matches Imperium Universalis countries.json PSE history[2] -- Darius I's satrapy/administrative reforms, traditionally dated c. 518 BC per the Behistun Inscription's list of satrapies",
		sourceConfidence: "traditional",
	},
	{
		date: d(486, 11, 1),
		kind: "rulerChange",
		payload: {
			name: "Xerxes I",
			dynasty: "Achaemenid",
			note: "Led the second Persian invasion of Greece, 480 BC",
		},
		note: "Led the second Persian invasion of Greece, 480 BC",
		sourceConfidence: "traditional",
	},
	{
		date: d(465, 8, 1),
		kind: "rulerChange",
		payload: {
			name: "Artaxerxes I",
			dynasty: "Achaemenid",
			note: "Acceded after the assassination of Xerxes I by Artabanus, commander of the royal bodyguard",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(424, 1, 1),
		kind: "rulerChange",
		payload: {
			name: "Xerxes II",
			dynasty: "Achaemenid",
			note: "Reigned c. 45 days before being murdered in a drunken state by his half-brother Sogdianus",
		},
		note: "Extremely brief reign (c. 45 days), 424 BC",
		sourceConfidence: "abstraction",
	},
	{
		date: d(424, 3, 1),
		kind: "rulerChange",
		payload: {
			name: "Sogdianus",
			dynasty: "Achaemenid",
			note: "Reigned c. 6 months (424 BC) after murdering Xerxes II; overthrown and executed by his half-brother Ochus (Darius II)",
		},
		note: "Brief reign (c. 6 months), 424 BC; usurper, later himself overthrown",
		sourceConfidence: "abstraction",
	},
	{
		date: d(423, 9, 1),
		kind: "rulerChange",
		payload: {
			name: "Darius II",
			dynasty: "Achaemenid",
			note: "Born Ochus; illegitimate son of Artaxerxes I who overthrew Sogdianus",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(404, 4, 1),
		kind: "rulerChange",
		payload: {
			name: "Artaxerxes II",
			dynasty: "Achaemenid",
			note: "Longest-reigning Achaemenid king; survived his brother Cyrus the Younger's rebellion (401 BC, Battle of Cunaxa) but lost Egypt permanently to native rule the same year he acceded",
		},
		note: "Longest-reigning Achaemenid king",
		sourceConfidence: "traditional",
	},
	{
		date: d(380),
		kind: "governmentReformAdd",
		payload: { reformId: "cavalry_focus" },
		note: "Matches Imperium Universalis countries.json PSE history[3] -- military reforms emphasizing Persian/Iranian cavalry after the losses of the Egyptian secession (404 BC) and Cyrus the Younger's revolt (401 BC); re-anchored to Artaxerxes II's mid-reign army rebuilding since the mod's internal relative-year epoch could not be reliably re-derived for this tag (see readme)",
		sourceConfidence: "abstraction",
	},
	{
		date: d(358, 1, 1),
		kind: "rulerChange",
		payload: {
			name: "Artaxerxes III",
			dynasty: "Achaemenid",
			note: "Born Ochus; purged rival claimants on accession; reconquered Egypt in 343 BC, ending the independent 28th-30th Dynasties",
		},
		note: "Reconquered Egypt, 343 BC",
		sourceConfidence: "traditional",
	},
	{
		date: d(338, 8, 1),
		kind: "rulerChange",
		payload: {
			name: "Artaxerxes IV Arses",
			dynasty: "Achaemenid",
			note: "Installed by the eunuch vizier Bagoas after poisoning Artaxerxes III; himself poisoned by Bagoas c. 336 BC",
		},
		sourceConfidence: "traditional",
	},
	{
		date: d(336, 7, 1),
		kind: "rulerChange",
		payload: {
			name: "Darius III",
			dynasty: "Achaemenid",
			note: "Last Achaemenid King of Kings; distant cousin installed by Bagoas, whom he then forced to drink his own poison; defeated by Alexander the Great (audits/wars/pilot-nations-wars.json), empire falls 330 BC",
		},
		note: "Last Achaemenid King of Kings; defeated by Alexander the Great (audits/wars/pilot-nations-wars.json), empire falls 330 BC",
		sourceConfidence: "traditional",
	},
]

events.sort((a, b) => a.date - b.date)

const achaemenidAudit = {
	_readme:
		"Audit/proposal file: reconstructed pre-2AD events for 'cp_achaemenid_empire', part of the 5-nation Tier-A pilot batch (Carthage, Achaemenid Persia, Ptolemaic Egypt, Seleucid Empire, Maurya Empire). Same methodology as audits/ROM.json and audits/cp_carthage.json. Not wired into the engine. Reform ids and government types are drawn from geo-explorer's public/imperialis/countries.json PSE entry (persian_achaemenid_monarchy, local_administrations, district_divisions, cavalry_focus); event dates use real historical years rather than the mod's internal relative-year numbering, which could not be reliably re-derived for this tag (see the pilot-nations-wars.json readme for the same caveat re: Carthage). This pass expands the prior thin draft (13 events, 0 dedicated wars beyond the shared Greco-Persian/Alexander entries, 0 revolts) to the full attested Achaemenid king list (Cyrus the Great through Darius III, including the brief/contested reigns of Bardiya, Xerxes II, and Sogdianus), adds 5 new wars (Conquest of Lydia, Conquest of Babylon, Conquest of Egypt, Darius I's Scythian campaign, the Egyptian War of Independence, and the Persian Reconquest of Egypt) and expands the existing greekPersianWars/warsOfAlexander battle lists in audits/wars/pilot-nations-wars.json, and adds 6 internal revolts (486 BC Egyptian revolt, Inaros Revolt, Cyrus the Younger's rebellion, the Great Satraps' Revolt, Evagoras's Cyprus revolt, and Cadusii unrest) to audits/revolts/pilot-nations-revolts.json. sourceConfidence: 'traditional' = well-attested history; 'abstraction' = game-design stand-in for a poorly-attested date/gap.",
	tag: "cp_achaemenid_empire",
	events,
}

// ---------------------------------------------------------------------
// Wars
// ---------------------------------------------------------------------
function battle({ year, m = 1, day = 1, name, locationProvinceId, attacker, defender, attackerWon, note }) {
	return { date: d(year, m, day), name, locationProvinceId, attacker, defender, attackerWon, note }
}

const conquestOfLydia = {
	warId: "conquestOfLydia",
	name: "Conquest of Lydia",
	casusBelli: "cb_conquest",
	warGoalType: "annex_country",
	warGoalTag: "cp_lydia",
	warGoalProvince: null,
	isRebel: false,
	events: [
		{ date: d(547), nationTag: "cp_achaemenid_empire", kind: "warStart", side: "attacker" },
		{ date: d(547), nationTag: "cp_lydia", kind: "warStart", side: "defender" },
		{ date: d(546), nationTag: "cp_achaemenid_empire", kind: "warEnd", side: "attacker" },
		{ date: d(546), nationTag: "cp_lydia", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 547,
			name: "Pteria",
			locationProvinceId: "326",
			attacker: { country: "cp_lydia", commander: "Croesus", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_achaemenid_empire", commander: "Cyrus the Great", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: false,
			note: "Indecisive engagement in Cappadocia; Croesus withdraws to Sardis to muster more troops for the campaigning season, a decision Cyrus exploits with a winter pursuit. Angora (326) stands in for Cappadocia.",
		}),
		battle({
			year: 547,
			m: 12,
			name: "Thymbra",
			locationProvinceId: "2297",
			attacker: { country: "cp_achaemenid_empire", commander: "Cyrus the Great", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_lydia", commander: "Croesus", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Decisive battle outside Sardis; Cyrus's use of camels to unsettle the famed Lydian cavalry is the best-attested tactical detail (Herodotus I.80). Saruhan (2297) stands in for the Sardis region.",
		}),
		battle({
			year: 546,
			name: "Siege of Sardis",
			locationProvinceId: "2297",
			attacker: { country: "cp_achaemenid_empire", commander: "Cyrus the Great", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_lydia", commander: "Croesus", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "14-day siege ends with the city's fall and Croesus's capture, ending the Lydian kingdom. Saruhan (2297) stands in for Sardis, matching provinces.json's own cp_lydia -> cp_achaemenid_empire transition on this province.",
		}),
	],
	note: "Cyrus the Great's conquest of Lydia under Croesus, 547-546 BC (Herodotus I.71-84). provinces.json records the matching cp_lydia -> cp_achaemenid_empire ownership transition (internally dated to game-year 540) on Saruhan and the other former Lydian provinces.",
	sourceConfidence: "traditional",
}

const conquestOfBabylon = {
	warId: "conquestOfBabylon",
	name: "Conquest of Babylon",
	casusBelli: "cb_conquest",
	warGoalType: "annex_country",
	warGoalTag: "cp_neo_babylonian_empire",
	warGoalProvince: null,
	isRebel: false,
	events: [
		{ date: d(539), nationTag: "cp_achaemenid_empire", kind: "warStart", side: "attacker" },
		{ date: d(539), nationTag: "cp_neo_babylonian_empire", kind: "warStart", side: "defender" },
		{ date: d(539, 10, 29), nationTag: "cp_achaemenid_empire", kind: "warEnd", side: "attacker" },
		{ date: d(539, 10, 29), nationTag: "cp_neo_babylonian_empire", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 539,
			m: 10,
			day: 10,
			name: "Opis",
			locationProvinceId: "408",
			attacker: { country: "cp_achaemenid_empire", commander: "Cyrus the Great", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_neo_babylonian_empire", commander: "Belshazzar", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Decisive battle on the Tigris; the Nabonidus Chronicle records the Babylonian army routed and the city of Sippar taken without a fight soon after. Basra (408) stands in for the lower Mesopotamian battle zone; no dedicated Babylon/Opis province exists in this dataset.",
		}),
		battle({
			year: 539,
			m: 10,
			day: 29,
			name: "Fall of Babylon",
			locationProvinceId: "408",
			attacker: { country: "cp_achaemenid_empire", commander: "Cyrus the Great / Ugbaru", infantry: null, cavalry: null, artillery: null, losses: 0 },
			defender: { country: "cp_neo_babylonian_empire", commander: "Nabonidus", infantry: null, cavalry: null, artillery: null, losses: 0 },
			attackerWon: true,
			note: "Cyrus's forces under Ugbaru (Gobryas) enter Babylon without a battle, per the Nabonidus Chronicle and Cyrus Cylinder; Nabonidus is captured. Basra (408) stands in for Babylon.",
		}),
	],
	note: "Cyrus the Great's conquest of the Neo-Babylonian Empire, 539 BC, ending Chaldean/Neo-Babylonian rule and adding Mesopotamia and the Levant to the Achaemenid Empire.",
	sourceConfidence: "traditional",
}

const conquestOfEgypt = {
	warId: "conquestOfEgypt",
	name: "Conquest of Egypt",
	casusBelli: "cb_conquest",
	warGoalType: "annex_country",
	warGoalTag: "cp_twenty_sixth_dynasty_of_egypt",
	warGoalProvince: null,
	isRebel: false,
	events: [
		{ date: d(525), nationTag: "cp_achaemenid_empire", kind: "warStart", side: "attacker" },
		{ date: d(525), nationTag: "cp_twenty_sixth_dynasty_of_egypt", kind: "warStart", side: "defender" },
		{ date: d(525, 6, 1), nationTag: "cp_achaemenid_empire", kind: "warEnd", side: "attacker" },
		{ date: d(525, 6, 1), nationTag: "cp_twenty_sixth_dynasty_of_egypt", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 525,
			m: 5,
			name: "Pelusium",
			locationProvinceId: "2315",
			attacker: { country: "cp_achaemenid_empire", commander: "Cambyses II", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_twenty_sixth_dynasty_of_egypt", commander: "Psamtik III", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Decisive battle opening the Persian conquest of Egypt; Psamtik III retreats to Memphis, which falls soon after under siege. Suez (2315) stands in for Pelusium, at the eastern edge of the Nile Delta.",
		}),
	],
	note: "Cambyses II's conquest of Saite Egypt, 525 BC, ending the 26th Dynasty and adding Egypt to the Achaemenid Empire as a satrapy (the '27th Dynasty' in Egyptian king-lists).",
	sourceConfidence: "traditional",
}

const scythianCampaign = {
	warId: "scythianCampaignOfDarius",
	name: "Scythian Campaign of Darius I",
	casusBelli: "cb_conquest",
	warGoalType: "take_claim",
	warGoalTag: null,
	warGoalProvince: "268",
	isRebel: false,
	events: [
		{ date: d(513), nationTag: "cp_achaemenid_empire", kind: "warStart", side: "attacker" },
		{ date: d(513), nationTag: "cp_scythia", kind: "warStart", side: "defender" },
		{ date: d(512), nationTag: "cp_achaemenid_empire", kind: "warEnd", side: "attacker" },
		{ date: d(512), nationTag: "cp_scythia", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 513,
			name: "Scythian scorched-earth campaign",
			locationProvinceId: "268",
			attacker: { country: "cp_achaemenid_empire", commander: "Darius I", infantry: 700000, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_scythia", commander: "Idanthyrsus", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: false,
			note: "No pitched battle: Herodotus (IV.83-142) describes the Scythians refusing engagement and drawing Darius's army across the Danube into the steppe using a scorched-earth retreat, forcing a costly Persian withdrawal. Recorded as a single symbolic 'battle' entry since no engagement has a specific attested site. Suceava (268), near the Danube delta, stands in for the campaign's northern extent.",
		}),
	],
	note: "Darius I's failed punitive campaign against the European Scythians north of the Danube, 513 BC (Herodotus IV.83-142); a strategic failure that nonetheless extended nominal Persian authority into Thrace.",
	sourceConfidence: "traditional",
}

const egyptianWarOfIndependence = {
	warId: "egyptianWarOfIndependence",
	name: "Egyptian War of Independence",
	casusBelli: "cb_independence",
	warGoalType: "independence",
	warGoalTag: null,
	warGoalProvince: "363",
	isRebel: false,
	events: [
		{ date: d(405), nationTag: "cp_thirtieth_dynasty_of_egypt", kind: "warStart", side: "attacker" },
		{ date: d(405), nationTag: "cp_achaemenid_empire", kind: "warStart", side: "defender" },
		{ date: d(400), nationTag: "cp_thirtieth_dynasty_of_egypt", kind: "warEnd", side: "attacker" },
		{ date: d(400), nationTag: "cp_achaemenid_empire", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 404,
			name: "Revolt of Amyrtaeus",
			locationProvinceId: "363",
			attacker: { country: "cp_thirtieth_dynasty_of_egypt", commander: "Amyrtaeus", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_achaemenid_empire", commander: null, infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Amyrtaeus of Sais leads a native uprising exploiting the succession chaos after Darius II's death, founding the 28th Dynasty and expelling Persian garrisons; independent native rule continues through the 29th and 30th Dynasties until 343 BC. No tag exists in provinces.json for the 28th/29th Dynasties specifically -- cp_thirtieth_dynasty_of_egypt is reused here as the only owner tag covering the whole 404-343 BC independent interval (it is also the tag provinces.json itself uses for the direct successor to Achaemenid rule on these provinces). Diamientia (363) stands in for the Delta heartland of the revolt.",
		}),
	],
	note: "Egypt's successful secession from the Achaemenid Empire, 404-400 BC, ending 120 years of Persian rule (the '27th Dynasty') until the reconquest of 343 BC (see persianReconquestOfEgypt).",
	sourceConfidence: "abstraction",
}

const persianReconquestOfEgypt = {
	warId: "persianReconquestOfEgypt",
	name: "Persian Reconquest of Egypt",
	casusBelli: "cb_reconquest",
	warGoalType: "annex_country",
	warGoalTag: "cp_thirtieth_dynasty_of_egypt",
	warGoalProvince: null,
	isRebel: false,
	events: [
		{ date: d(373), nationTag: "cp_achaemenid_empire", kind: "warStart", side: "attacker" },
		{ date: d(373), nationTag: "cp_thirtieth_dynasty_of_egypt", kind: "warStart", side: "defender" },
		{ date: d(343), nationTag: "cp_achaemenid_empire", kind: "warEnd", side: "attacker" },
		{ date: d(343), nationTag: "cp_thirtieth_dynasty_of_egypt", kind: "warEnd", side: "defender" },
	],
	battles: [
		battle({
			year: 373,
			name: "Failed invasion under Pharnabazus",
			locationProvinceId: "2315",
			attacker: { country: "cp_achaemenid_empire", commander: "Pharnabazus II / Iphicrates", infantry: 200000, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_thirtieth_dynasty_of_egypt", commander: "Nectanebo I", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: false,
			note: "Large Persian expeditionary force (with the Athenian mercenary general Iphicrates) fails to exploit an early breach at Pelusium, giving Nectanebo I time to fortify the Delta; the Nile flood season then forces a Persian withdrawal. Suez (2315) stands in for Pelusium.",
		}),
		battle({
			year: 351,
			name: "Failed invasion under Artaxerxes III",
			locationProvinceId: "361",
			attacker: { country: "cp_achaemenid_empire", commander: "Artaxerxes III", infantry: null, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_thirtieth_dynasty_of_egypt", commander: "Nectanebo II", infantry: null, cavalry: null, artillery: null, losses: null },
			attackerWon: false,
			note: "Artaxerxes III's first personal attempt to retake Egypt is repulsed with heavy losses, encouraging the near-simultaneous revolts of Phoenicia and Cyprus. Cairo (361) stands in for the Memphis theater.",
		}),
		battle({
			year: 343,
			name: "Conquest of Pelusium and Memphis",
			locationProvinceId: "2315",
			attacker: { country: "cp_achaemenid_empire", commander: "Artaxerxes III", infantry: 330000, cavalry: null, artillery: null, losses: null },
			defender: { country: "cp_thirtieth_dynasty_of_egypt", commander: "Nectanebo II", infantry: 100000, cavalry: null, artillery: null, losses: null },
			attackerWon: true,
			note: "Artaxerxes III's second campaign takes Pelusium and then Memphis; Nectanebo II flees to Nubia, ending the 30th Dynasty and native Egyptian rule until Alexander's conquest. Suez (2315) stands in for Pelusium, matching provinces.json's own cp_thirtieth_dynasty_of_egypt -> cp_achaemenid_empire transition.",
		}),
	],
	note: "Persia's decades-long effort to reconquer independent Egypt, 373-343 BC, succeeding on the third attempt under Artaxerxes III. The first two failed attempts (385-383 BC under Artaxerxes II, not separately battled here for lack of a named engagement, and 373 BC under Pharnabazus) are folded into this single war entry along with the 351 BC and 343 BC campaigns, matching this dataset's existing pattern for multi-round wars (see syrianWars, sicilianWars).",
	sourceConfidence: "traditional",
}

const warsPath = path.join(__dirname, "..", "..", "public", "earth-history", "audits", "wars", "pilot-nations-wars.json")
const warsFile = JSON.parse(fs.readFileSync(warsPath, "utf8"))

// Expand greekPersianWars with the missing major battles
const greekPersianWars = warsFile.wars.find((w) => w.warId === "greekPersianWars")
greekPersianWars.battles.push(
	battle({
		year: 480,
		m: 9,
		day: 1,
		name: "Artemisium",
		locationProvinceId: "146",
		attacker: { country: "cp_achaemenid_empire", commander: "Xerxes I (fleet)", infantry: null, cavalry: null, artillery: null, losses: null },
		defender: { country: "cp_athens", commander: "Themistocles / Eurybiades", infantry: null, cavalry: null, artillery: null, losses: null },
		attackerWon: false,
		note: "Inconclusive naval battle fought simultaneously with Thermopylae; the Greek fleet withdraws in good order once Thermopylae falls. Artemisium (off Euboea) has no dedicated province; Athens (146) stands in.",
	}),
	battle({
		year: 480,
		m: 9,
		day: 20,
		name: "Salamis",
		locationProvinceId: "146",
		attacker: { country: "cp_athens", commander: "Themistocles", infantry: null, cavalry: null, artillery: null, losses: 40 },
		defender: { country: "cp_achaemenid_empire", commander: "Xerxes I", infantry: null, cavalry: null, artillery: null, losses: 200 },
		attackerWon: true,
		note: "Decisive Greek naval victory in the straits of Salamis; Xerxes I withdraws to Asia, leaving Mardonius in command of the land army. Salamis has no dedicated province; Athens (146) stands in.",
	}),
	battle({
		year: 479,
		m: 8,
		day: 1,
		name: "Plataea",
		locationProvinceId: "146",
		attacker: { country: "cp_athens", commander: "Pausanias of Sparta", infantry: 40000, cavalry: null, artillery: null, losses: null },
		defender: { country: "cp_achaemenid_empire", commander: "Mardonius", infantry: 300000, cavalry: null, artillery: null, losses: null },
		attackerWon: true,
		note: "Decisive land battle ending the Persian invasion of the Greek mainland; Mardonius is killed. Plataea (Boeotia) has no dedicated province; Athens (146) stands in for mainland Greece.",
	}),
	battle({
		year: 479,
		m: 8,
		day: 27,
		name: "Mycale",
		locationProvinceId: "4309",
		attacker: { country: "cp_athens", commander: "Leotychidas / Xanthippus", infantry: null, cavalry: null, artillery: null, losses: null },
		defender: { country: "cp_achaemenid_empire", commander: "Tigranes", infantry: null, cavalry: null, artillery: null, losses: null },
		attackerWon: true,
		note: "Traditionally fought the same day as Plataea; Greek victory on the Ionian coast sparks renewed Ionian revolts against Persian rule. Aydin (4309), near ancient Mycale/Miletus, stands in.",
	}),
	battle({
		year: 469,
		name: "Eurymedon",
		locationProvinceId: "319",
		attacker: { country: "cp_athens", commander: "Cimon", infantry: null, cavalry: null, artillery: null, losses: null },
		defender: { country: "cp_achaemenid_empire", commander: null, infantry: null, cavalry: null, artillery: null, losses: null },
		attackerWon: true,
		note: "Cimon's double land-and-sea victory over a Persian fleet and army at the mouth of the Eurymedon river in Pamphylia effectively ends major Persian naval activity in the Aegean for a generation. Antalya (319), in ancient Pamphylia, stands in.",
	}),
)
greekPersianWars.note = greekPersianWars.note + " Expanded from 2 to 7 battles (Marathon, Thermopylae, Artemisium, Salamis, Plataea, Mycale, Eurymedon) in the Achaemenid exhaustive-audit pass."

// Expand warsOfAlexander with the missing major battles/sieges
const warsOfAlexander = warsFile.wars.find((w) => w.warId === "warsOfAlexander")
warsOfAlexander.battles.push(
	battle({
		year: 332,
		m: 1,
		day: 1,
		name: "Siege of Tyre",
		locationProvinceId: "4286",
		attacker: { country: "cp_macedonian_empire", commander: "Alexander the Great", infantry: null, cavalry: null, artillery: null, losses: 400 },
		defender: { country: "cp_achaemenid_empire", commander: null, infantry: null, cavalry: null, artillery: null, losses: 8000 },
		attackerWon: true,
		note: "Seven-month siege of the island fortress of Tyre, taken via a causeway built from the mainland; the city is sacked and thousands enslaved. Sur (4286), the modern Arabic name for Tyre, is used directly.",
	}),
	battle({
		year: 332,
		m: 10,
		day: 1,
		name: "Siege of Gaza",
		locationProvinceId: "364",
		attacker: { country: "cp_macedonian_empire", commander: "Alexander the Great", infantry: null, cavalry: null, artillery: null, losses: null },
		defender: { country: "cp_achaemenid_empire", commander: "Batis", infantry: null, cavalry: null, artillery: null, losses: null },
		attackerWon: true,
		note: "Two-month siege of the last fortified city barring Alexander's route to Egypt; the eunuch commander Batis is killed after a prolonged defense.",
	}),
	battle({
		year: 330,
		m: 1,
		day: 20,
		name: "Persian Gate",
		locationProvinceId: "4289",
		attacker: { country: "cp_macedonian_empire", commander: "Alexander the Great", infantry: null, cavalry: null, artillery: null, losses: null },
		defender: { country: "cp_achaemenid_empire", commander: "Ariobarzanes of Persis", infantry: null, cavalry: null, artillery: null, losses: null },
		attackerWon: true,
		note: "Ariobarzanes holds a mountain pass on the road to Persepolis for about a month before being outflanked and routed via a shepherd's path (echoing Thermopylae); Persepolis falls and is later burned. Shushtar (4289) stands in for the Persis heartland; no dedicated Persepolis province exists in this dataset.",
	}),
)
warsOfAlexander.note = warsOfAlexander.note + " Expanded from 3 to 6 battles (Granicus, Issus, Gaugamela, Siege of Tyre, Siege of Gaza, Persian Gate) in the Achaemenid exhaustive-audit pass."

warsFile.wars.push(conquestOfLydia, conquestOfBabylon, conquestOfEgypt, scythianCampaign, egyptianWarOfIndependence, persianReconquestOfEgypt)
warsFile._readme =
	warsFile._readme +
	" Achaemenid exhaustive-audit pass: expanded greekPersianWars (2->7 battles) and warsOfAlexander (3->6 battles), and added 6 new wars (conquestOfLydia, conquestOfBabylon, conquestOfEgypt, scythianCampaignOfDarius, egyptianWarOfIndependence, persianReconquestOfEgypt). Ptolemaic/Seleucid/Maurya entries (syrianWars) untouched."

// ---------------------------------------------------------------------
// Revolts
// ---------------------------------------------------------------------
const revoltsPath = path.join(__dirname, "..", "..", "public", "earth-history", "audits", "revolts", "pilot-nations-revolts.json")
const revoltsFile = JSON.parse(fs.readFileSync(revoltsPath, "utf8"))

function addRevolt(provinceId, ev) {
	if (!revoltsFile.provinces[provinceId]) revoltsFile.provinces[provinceId] = { events: [] }
	revoltsFile.provinces[provinceId].events.push(ev)
}

addRevolt("363", {
	date: d(486),
	kind: "revolt",
	payload: { revolt: { type: "nationalist_rebels", size: 4 } },
	comment: "Egyptian revolt against Darius I",
	note: "Egypt revolts against Persian rule and heavy taxation late in Darius I's reign; suppressed by Xerxes I early in his own reign (484 BC). No opposing tag exists for this revolt -- Egypt does not regain independence until 404 BC (see egyptianWarOfIndependence). Diamientia (363) stands in for the Delta heartland.",
	sourceConfidence: "traditional",
})

addRevolt("363", {
	date: d(460),
	kind: "revolt",
	payload: { revolt: { type: "nationalist_rebels", size: 5, leader: "Inaros" } },
	comment: "Inaros Revolt",
	note: "Inaros II of Libya, backed by an Athenian/Delian League expeditionary fleet, leads a major revolt that captures most of Egypt and kills the satrap Achaemenes; Persia under Artaxerxes I eventually crushes the revolt at the Battle of Prosopitis (454 BC) and Inaros is executed. No opposing tag exists -- Egypt remains an Achaemenid satrapy until 404 BC. Diamientia (363) stands in for the Delta.",
	sourceConfidence: "traditional",
})

addRevolt("408", {
	date: d(401, 9, 3),
	kind: "revolt",
	payload: { revolt: { type: "pretender_rebels", size: 5, leader: "Cyrus the Younger" } },
	comment: "Revolt of Cyrus the Younger",
	note: "Cyrus the Younger, satrap of Lydia and younger son of Darius II, marches an army (including the Greek 'Ten Thousand' mercenaries) against his brother Artaxerxes II to seize the throne; killed at the Battle of Cunaxa near Babylon. No opposing tag exists -- this is a succession/claimant revolt within the empire, not a war against a separate nation. Basra (408) stands in for the Babylon/Cunaxa region.",
	sourceConfidence: "traditional",
})

addRevolt("2297", {
	date: d(366),
	kind: "revolt",
	payload: { revolt: { type: "noble_rebels", size: 5, leader: "Datames" } },
	comment: "Great Satraps' Revolt",
	note: "Coordinated revolt of several western satraps (Datames of Cappadocia, Ariobarzanes of Phrygia, Autophradates, Orontes of Mysia, and Mausolus of Caria, among others) against Artaxerxes II and III, c. 366-360 BC, ultimately suppressed piecemeal through bribery and disunity among the rebels rather than outright defeat. No opposing tag exists -- these are internal satrapal revolts, not wars against separate nations. Saruhan (2297), in western Anatolia near the revolt's epicenter, stands in.",
	sourceConfidence: "traditional",
})

addRevolt("321", {
	date: d(391),
	kind: "revolt",
	payload: { revolt: { type: "nationalist_rebels", size: 4, leader: "Evagoras I" } },
	comment: "Revolt of Evagoras of Salamis",
	note: "Evagoras I, king of Salamis in Cyprus, leads a decade-long revolt against Persian rule with Athenian and Egyptian support, eventually suppressed by Artaxerxes II in 380 BC though Evagoras retains local rule as a tributary. No opposing tag exists for Cyprus in provinces.json. Cyprus (321) is used directly.",
	sourceConfidence: "traditional",
})

addRevolt("417", {
	date: d(385),
	kind: "revolt",
	payload: { revolt: { type: "noble_rebels", size: 3 } },
	comment: "Cadusii unrest",
	note: "The mountain Cadusii people of the southwestern Caspian coast were never fully subdued by the Achaemenids and are recorded (Diodorus XV.8, Plutarch's Artaxerxes) as launching recurring revolts/raids through Artaxerxes II and III's reigns, including a costly failed punitive campaign by Artaxerxes II c. 385 BC. No opposing tag exists for the Cadusii. Gilan (417), on the Caspian coast, stands in; leader and precise date are not well-attested, flagged as an abstraction accordingly.",
	sourceConfidence: "abstraction",
})

revoltsFile._readme =
	revoltsFile._readme +
	" Achaemenid exhaustive-audit pass: added 6 revolts (486 BC Egyptian revolt and the Inaros Revolt on province 363, Cyrus the Younger's rebellion on province 408, the Great Satraps' Revolt on province 2297, Evagoras's Cyprus revolt on province 321, and Cadusii unrest on province 417). Carthage's and the Seleucid Maccabean Revolt entries are untouched."

// ---------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------
const auditsDir = path.join(__dirname, "..", "..", "public", "earth-history", "audits")
fs.writeFileSync(path.join(auditsDir, "cp_achaemenid_empire.json"), JSON.stringify(achaemenidAudit, null, "\t") + "\n")
fs.writeFileSync(warsPath, JSON.stringify(warsFile, null, "\t") + "\n")
fs.writeFileSync(revoltsPath, JSON.stringify(revoltsFile, null, "\t") + "\n")

console.log("rulers/gov events:", achaemenidAudit.events.length)
console.log(
	"new wars:",
	[conquestOfLydia, conquestOfBabylon, conquestOfEgypt, scythianCampaign, egyptianWarOfIndependence, persianReconquestOfEgypt]
		.map((w) => `${w.warId} (${w.battles.length} battles)`)
		.join(", "),
)
console.log("greekPersianWars battles:", greekPersianWars.battles.length)
console.log("warsOfAlexander battles:", warsOfAlexander.battles.length)
console.log("total wars in pilot file:", warsFile.wars.length)
console.log(
	"Achaemenid revolts added:",
	["363", "408", "2297", "321", "417"].map((id) => `${id}:${revoltsFile.provinces[id].events.length}`).join(", "),
)

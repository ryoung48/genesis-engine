import { eu4DateToDays } from "../date"

/** Ported from geo-explorer's src/components/map/DateControls.tsx era-grouped
 * preset list (hardcoded there too -- no separate bookmark data file exists
 * upstream). See docs/earth-history-plan.md "Bookmarks". */
interface EarthHistoryBookmark {
	date: number
	eu4Date: string
	label: string
	era: string
}

const RAW_BOOKMARKS: { eu4Date: string; label: string; era: string }[] = [
	// Prehistoric Era -- pre-2AD coverage is sourced from Cliopatria's
	// per-polity dated polygon history (scripts/build-cliopatria-events.py),
	// which unlike the old world_bc*.geojson snapshot series is already
	// continuous (real per-feature date ranges, not fixed snapshot years) and
	// pre-filtered to actual polities -- so these bookmark dates are just
	// convenient, evocative milestones, not tied to any particular source
	// file's coverage the way the old snapshot-era bookmarks were. Dates use
	// astronomical year numbering (1 BC = year 0), same as eu4DateToDays
	// elsewhere. 3400 BC is roughly where Cliopatria's own coverage begins
	// (earliest polity slice: Sumerian City-States).
	{
		eu4Date: "-3399.1.1",
		label: "3400 BC First Cities",
		era: "Prehistoric Era",
	},
	{
		eu4Date: "-2999.1.1",
		label: "3000 BC Early Dynastic Egypt",
		era: "Prehistoric Era",
	},
	{
		eu4Date: "-2499.1.1",
		label: "2500 BC Bronze Age Kingdoms",
		era: "Prehistoric Era",
	},
	// Ancient Era -- Bronze/Iron Age, pre-Classical
	{
		eu4Date: "-1999.1.1",
		label: "2000 BC Middle Bronze Age",
		era: "Ancient Era",
	},
	{
		eu4Date: "-1499.1.1",
		label: "1500 BC Late Bronze Age",
		era: "Ancient Era",
	},
	{ eu4Date: "-999.1.1", label: "1000 BC Iron Age Begins", era: "Ancient Era" },
	{
		eu4Date: "-699.1.1",
		label: "700 BC Rise of City-States",
		era: "Ancient Era",
	},
	// Classical Era -- Greece and Rome
	{
		eu4Date: "-499.1.1",
		label: "500 BC Classical Greece",
		era: "Classical Era",
	},
	{
		eu4Date: "-399.1.1",
		label: "400 BC Golden Age of Athens",
		era: "Classical Era",
	},
	{
		eu4Date: "-322.1.1",
		label: "323 BC Death of Alexander",
		era: "Classical Era",
	},
	{
		eu4Date: "-299.1.1",
		label: "300 BC Hellenistic Era",
		era: "Classical Era",
	},
	{ eu4Date: "-199.1.1", label: "200 BC Punic Wars", era: "Classical Era" },
	{
		eu4Date: "-99.1.1",
		label: "100 BC Late Roman Republic",
		era: "Classical Era",
	},
	{ eu4Date: "2.1.1", label: "2 Roman Expansion", era: "Classical Era" },
	{ eu4Date: "58.2.1", label: "58 Roman-Parthian War", era: "Classical Era" },
	{ eu4Date: "224.4.24", label: "224 Rise of Sassanids", era: "Classical Era" },
	{
		eu4Date: "395.1.17",
		label: "395 Barbarian Invasions",
		era: "Classical Era",
	},
	{ eu4Date: "476.9.4", label: "476 Fall of Rome", era: "Classical Era" },
	// Medieval Era
	{ eu4Date: "527.8.1", label: "527 Justinian", era: "Medieval Era" },
	{ eu4Date: "637.1.1", label: "637 Rise of Islam", era: "Medieval Era" },
	{ eu4Date: "769.1.1", label: "769 Charlemagne", era: "Medieval Era" },
	{ eu4Date: "867.1.1", label: "867 The Old Gods", era: "Medieval Era" },
	{ eu4Date: "936.8.7", label: "936 Iron Century", era: "Medieval Era" },
	{ eu4Date: "962.2.2", label: "962 HRE Founded", era: "Medieval Era" },
	{ eu4Date: "1066.9.15", label: "1066 Stamford Bridge", era: "Medieval Era" },
	{ eu4Date: "1187.10.2", label: "1187 Third Crusade", era: "Medieval Era" },
	{ eu4Date: "1206.1.1", label: "1206 Mongol Empire", era: "Medieval Era" },
	{ eu4Date: "1241.5.1", label: "1241 Mongol Invasion", era: "Medieval Era" },
	{ eu4Date: "1337.1.1", label: "1337 Hundred Years War", era: "Medieval Era" },
	{ eu4Date: "1399.10.14", label: "1399 Grand Campaign", era: "Medieval Era" },
	// Early Modern Era
	{
		eu4Date: "1444.11.11",
		label: "1444 Rise of Ottomans",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1453.5.29",
		label: "1453 Fall of Byzantium",
		era: "Early Modern Era",
	},
	{ eu4Date: "1492.1.1", label: "1492 New World", era: "Early Modern Era" },
	{
		eu4Date: "1508.12.10",
		label: "1508 League of Cambrai",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1579.1.23",
		label: "1579 Eighty Years War",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1618.5.23",
		label: "1618 Thirty Years War",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1701.9.1",
		label: "1701 Spanish Succession",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1718.12.17",
		label: "1718 Quadruple Alliance",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1756.5.15",
		label: "1756 Seven Years War",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1776.7.4",
		label: "1776 American Revolution",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1789.7.14",
		label: "1789 French Revolution",
		era: "Early Modern Era",
	},
	{
		eu4Date: "1792.9.21",
		label: "1792 Revolutionary France",
		era: "Early Modern Era",
	},
	// Modern Era
	{ eu4Date: "1836.1.1", label: "1836 Victorian Era", era: "Modern Era" },
	{ eu4Date: "1861.7.1", label: "1861 American Civil War", era: "Modern Era" },
	{
		eu4Date: "1870.7.19",
		label: "1870 Franco-Prussian War",
		era: "Modern Era",
	},
	{ eu4Date: "1914.7.28", label: "1914 World War I", era: "Modern Era" },
	{ eu4Date: "1939.9.3", label: "1939 World War II", era: "Modern Era" },
	{ eu4Date: "1947.1.1", label: "1947 Cold War", era: "Modern Era" },
	{ eu4Date: "1991.12.25", label: "1991 Fall of USSR", era: "Modern Era" },
	{ eu4Date: "2026.1.12", label: "2026 Present Day", era: "Modern Era" },
]

export const EARTH_HISTORY_BOOKMARKS: EarthHistoryBookmark[] =
	RAW_BOOKMARKS.map((b) => ({
		...b,
		date: eu4DateToDays(b.eu4Date),
	}))

export const EARTH_HISTORY_BOOKMARK_ERAS: string[] = Array.from(
	new Set(EARTH_HISTORY_BOOKMARKS.map((b) => b.era)),
)

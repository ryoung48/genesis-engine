const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..", "..")

const TAGS = {
	CJN: { tag: "cp_state_of_jin", name: "State of Jin", alias: "State of Jin" },
	MRN: { tag: "cp_mauretania", name: "Mauretania", alias: "Kingdom of Mauretania" },
	SNG: { tag: "cp_state_of_song", name: "State of Song", alias: "State of Song" },
	WEI: { tag: "cp_state_of_wei", name: "State of Wei", alias: "State of Wei" },
	WUU: { tag: "cp_state_of_wu", name: "State of Wu", alias: "State of Wu" },
	YUA: { tag: "cp_dayuan", name: "Dayuan", alias: "Dayuan" },
}

function readJson(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"))
}

function writeJson(relativePath, data, pretty = false) {
	fs.writeFileSync(path.join(root, relativePath), JSON.stringify(data, null, pretty ? 2 : 0) + "\n")
}

function hashColor(key) {
	let h = 0
	for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
	const hue = (h % 360) / 360
	return hslToRgb(hue, 0.55, 0.5).map((v) => Math.round(v * 255))
}

function hslToRgb(h, s, l) {
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
	const m = l - c / 2
	const parts = [
		[c, x, 0],
		[x, c, 0],
		[0, c, x],
		[0, x, c],
		[x, 0, c],
		[c, 0, x],
	][Math.min(Math.floor(h * 6), 5)]
	return parts.map((v) => v + m)
}

function replaceTagPayload(value, date) {
	if (!value || typeof value !== "object") return 0
	let changes = 0
	if (Array.isArray(value)) {
		for (const item of value) changes += replaceTagPayload(item, date)
		return changes
	}
	const ownDate = typeof value.date === "number" ? value.date : date
	for (const key of ["tag", "nationTag", "warGoalTag", "country", "primaryTag"]) {
		if (typeof value[key] === "string" && TAGS[value[key]] && (ownDate === undefined || ownDate < 0)) {
			value[key] = TAGS[value[key]].tag
			changes++
		}
	}
	for (const child of Object.values(value)) changes += replaceTagPayload(child, ownDate)
	return changes
}

function migrateProvinces() {
	const provinces = readJson("public/earth-history/events/provinces.json")
	let changes = 0
	for (const province of Object.values(provinces)) {
		for (const event of province.events || []) changes += replaceTagPayload(event, event.date)
	}
	writeJson("public/earth-history/events/provinces.json", provinces)
	return changes
}

function migrateNationsEvents() {
	const nations = readJson("public/earth-history/events/nations.json")
	let moved = 0
	for (const [oldTag, next] of Object.entries(TAGS)) {
		const source = nations[oldTag]
		if (!source) continue
		const oldEvents = source.events || []
		const ancientEvents = oldEvents.filter((event) => event.date < 0)
		if (!ancientEvents.length) continue
		const target = (nations[next.tag] ||= { base: { reforms: [], capital: null }, events: [] })
		target.events = [...(target.events || []), ...ancientEvents].sort((a, b) => a.date - b.date)
		source.events = oldEvents.filter((event) => event.date >= 0)
		moved += ancientEvents.length
	}
	writeJson("public/earth-history/events/nations.json", nations)
	return moved
}

function migrateReferenceNations() {
	const nations = readJson("public/earth-history/reference/nations.json")
	const tags = new Set(nations.map((nation) => nation.tag))
	let added = 0
	for (const next of Object.values(TAGS)) {
		if (tags.has(next.tag)) continue
		nations.push({
			tag: next.tag,
			name: next.name,
			color: hashColor(next.tag),
			graphicalCulture: "westerngfx",
			initialGovernmentType: null,
			primaryCulture: null,
			religion: null,
		})
		tags.add(next.tag)
		added++
	}
	writeJson("public/earth-history/reference/nations.json", nations, true)
	return added
}

function migrateConflictAliases() {
	const aliases = readJson("public/earth-history/reference/conflict-country-aliases.json")
	for (const entry of aliases) {
		if (entry.sourceName === "Duke of Wu" && entry.tag === "cp_state_of_wu") entry.tag = "cp_state_of_wu"
		if (entry.sourceName === "Mauretania" && entry.tag === "cp_mauretania") entry.tag = "cp_mauretania"
		if (entry.sourceName === "State of Jin" && entry.tag === "JIN") entry.tag = "cp_state_of_jin"
	}
	const seen = new Set(aliases.map((entry) => `${entry.sourceName}\u0000${entry.tag || ""}\u0000${(entry.tags || []).join(",")}`))
	let added = 0
	for (const next of Object.values(TAGS)) {
		const key = `${next.alias}\u0000${next.tag}\u0000`
		if (seen.has(key)) continue
		aliases.push({ sourceName: next.alias, tag: next.tag })
		seen.add(key)
		added++
	}
	writeJson("public/earth-history/reference/conflict-country-aliases.json", aliases, true)
	return added
}

function walkFiles(dir, predicate, out = []) {
	if (!fs.existsSync(dir)) return out
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walkFiles(full, predicate, out)
		else if (predicate(full)) out.push(full)
	}
	return out
}

function migrateAuditJson() {
	const auditDir = path.join(root, "public/earth-history/audits")
	let files = 0
	let changes = 0
	for (const file of walkFiles(auditDir, (full) => full.endsWith(".json"))) {
		const data = JSON.parse(fs.readFileSync(file, "utf8"))
		const before = JSON.stringify(data)
		if (typeof data.tag === "string" && TAGS[data.tag]) data.tag = TAGS[data.tag].tag
		replaceTagPayload(data)
		if (JSON.stringify(data) !== before) {
			fs.writeFileSync(file, JSON.stringify(data, null, "\t") + "\n")
			files++
		}
	}
	for (const [oldTag, next] of Object.entries(TAGS)) {
		const from = path.join(auditDir, `${oldTag}.json`)
		const to = path.join(auditDir, `${next.tag}.json`)
		if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to)
		else if (fs.existsSync(from) && fs.existsSync(to)) fs.unlinkSync(from)
	}
	return { files, changes }
}

function migrateTextFiles() {
	const scriptFiles = walkFiles(path.join(root, "scripts"), (full) => /\.(cjs|py|md)$/.test(full))
	let files = 0
	for (const file of scriptFiles) {
		let text = fs.readFileSync(file, "utf8")
		const before = text
		for (const [oldTag, next] of Object.entries(TAGS)) {
			text = text.replaceAll(`"${oldTag}"`, `"${next.tag}"`)
			text = text.replaceAll(`'${oldTag}'`, `'${next.tag}'`)
			text = text.replaceAll(` ${oldTag} `, ` ${next.tag} `)
		}
		if (text !== before) {
			fs.writeFileSync(file, text)
			files++
		}
	}
	return files
}

const result = {
	provinceTagEventsChanged: migrateProvinces(),
	nationEventsMoved: migrateNationsEvents(),
	referenceNationsAdded: migrateReferenceNations(),
	conflictAliasesAdded: migrateConflictAliases(),
	auditJsonFilesChanged: migrateAuditJson().files,
	textFilesChanged: migrateTextFiles(),
}

console.log(JSON.stringify(result, null, 2))

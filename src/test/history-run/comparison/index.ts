import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import type {
	CompareParams,
	DiagnosticsParams,
	FlattenParams,
	JsonObject,
	JsonValue,
	MatchParams,
	MetricRow,
	ReportPair,
	RowsParams,
	SavedReport,
} from "./types.ts"

function object(value: JsonValue | undefined): JsonObject {
	return value && typeof value === "object" && !Array.isArray(value)
		? value
		: {}
}

function diagnostics({ report, seed }: DiagnosticsParams): JsonObject {
	if (!report.seeds.includes(seed)) return {}
	return object(
		object(report.data.diagnosticsBySeed)[seed] ?? report.data.diagnostics,
	)
}

function read(path: string): SavedReport {
	const data: JsonObject = JSON.parse(readFileSync(path, "utf8"))
	const seeds = Object.keys(data)
		.filter((key) => /^\d+$/.test(key))
		.sort()
	if (!seeds.length) throw new Error(`Not a detailed history report: ${path}`)
	const report = { path: resolve(path), data, seeds }
	if (
		Array.isArray(data.expectedSeeds) &&
		!isDeepStrictEqual(data.expectedSeeds.map(String).sort(), seeds)
	)
		throw new Error(`Partial multi-seed report: ${path}`)
	for (const seed of seeds) {
		const windows = data[seed]
		const diag = diagnostics({ report, seed })
		if (
			!Array.isArray(windows) ||
			!windows.length ||
			!Array.isArray(diag.annualTicks)
		)
			throw new Error(`Missing timeline in ${path}, seed ${seed}`)
		let end = object(windows[0]).from
		const start = end
		for (const window of windows) {
			const row = object(window)
			if (
				row.from !== end ||
				typeof row.to !== "number" ||
				typeof end !== "number" ||
				row.to <= end
			)
				throw new Error(`Incomplete timeline in ${path}, seed ${seed}`)
			end = row.to
		}
		if (
			typeof start !== "number" ||
			typeof end !== "number" ||
			end - start !== diag.annualTicks.length ||
			diag.completed === false
		)
			throw new Error(`Partial report: ${path}, seed ${seed}`)
		const expected = Number(basename(path).match(/^(\d+)\.json$/)?.[1])
		if (expected && expected !== end - start)
			throw new Error(`Partial report: ${path}`)
	}
	return report
}

function files(root: string): string[] {
	if (!existsSync(root)) return []
	return readdirSync(root, { withFileTypes: true })
		.flatMap((entry) => {
			if (entry.isDirectory() && !["pipeline", "profiled"].includes(entry.name))
				return files(join(root, entry.name))
			return entry.isFile() && /^\d+\.json$/.test(entry.name)
				? [join(root, entry.name)]
				: []
		})
		.sort()
}

function startedAt(path: string): number {
	const timestamp = path.match(
		/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/,
	)?.[0]
	return timestamp
		? Date.parse(
				timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, "T$1:$2:$3.$4Z"),
			)
		: statSync(path).mtimeMs
}

function configuration(report: SavedReport): JsonObject {
	const result: JsonObject = { seeds: report.seeds }
	for (const seed of report.seeds) {
		const diag = diagnostics({ report, seed })
		const windows = report.data[seed] as JsonValue[]
		result[seed] = {
			era: diag.era ?? null,
			requestedPoints: diag.requestedPoints ?? null,
			from: object(windows[0]).from,
			to: object(windows.at(-1)).to,
			lateKnowledgeBand: diag.lateKnowledgeBand ?? null,
		}
	}
	return result
}

function matches({ current, previous }: MatchParams): boolean {
	const a = configuration(current)
	const b = configuration(previous)
	for (const seed of current.seeds) {
		if (
			object(a[seed]).lateKnowledgeBand === null ||
			object(b[seed]).lateKnowledgeBand === null
		) {
			delete object(a[seed]).lateKnowledgeBand
			delete object(b[seed]).lateKnowledgeBand
		}
	}
	return isDeepStrictEqual(a, b)
}

function flatten({ value, prefix, output }: FlattenParams): void {
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			flatten({ value: item, prefix: `${prefix}[${index}]`, output }),
		)
	} else if (value && typeof value === "object") {
		for (const [key, item] of Object.entries(value))
			flatten({
				value: item,
				prefix: prefix ? `${prefix}.${key}` : key,
				output,
			})
	} else if (value !== undefined) output.set(prefix, value)
}

function addRows({ before, after, section, period, rows }: RowsParams): void {
	const a = new Map<string, JsonValue>()
	const b = new Map<string, JsonValue>()
	flatten({ value: before, prefix: "", output: a })
	flatten({ value: after, prefix: "", output: b })
	for (const metric of new Set([...a.keys(), ...b.keys()]))
		rows.push({
			section,
			period,
			metric,
			before: a.get(metric),
			after: b.get(metric),
		})
}

function byYear(value: JsonValue | undefined): Map<string, JsonObject> {
	return new Map(
		Array.isArray(value)
			? value.map((item) => {
					const row = object(item)
					return [String(row.year), row]
				})
			: [],
	)
}

function tickSummary(value: JsonValue | undefined): JsonObject {
	if (!Array.isArray(value) || !value.length) return {}
	const ticks = (value as number[]).toSorted((a, b) => a - b)
	const total = ticks.reduce((sum, tick) => sum + tick, 0)
	return {
		simulationTotalMs: total,
		annualTickMeanMs: total / ticks.length,
		annualTickP50Ms: ticks[Math.floor((ticks.length - 1) * 0.5)],
		annualTickP95Ms: ticks[Math.floor((ticks.length - 1) * 0.95)],
	}
}

function metrics({ current, previous }: ReportPair): MetricRow[] {
	const rows: MetricRow[] = []
	addRows({
		before: previous ? configuration(previous) : undefined,
		after: configuration(current),
		section: "Configuration",
		period: "Run",
		rows,
	})
	for (const seed of new Set([...current.seeds, ...(previous?.seeds ?? [])])) {
		const windows = (report: SavedReport | null) =>
			new Map(
				(Array.isArray(report?.data[seed])
					? (report.data[seed] as JsonValue[])
					: []
				).map((value) => {
					const row = object(value)
					return [`${row.from}–${row.to}`, row]
				}),
			)
		const a = windows(previous)
		const b = windows(current)
		for (const period of new Set([...a.keys(), ...b.keys()])) {
			const before = { ...a.get(period) }
			const after = { ...b.get(period) }
			const beforeMs = object(before.people).msPerYear
			const afterMs = object(after.people).msPerYear
			before.people = { ...object(before.people) }
			after.people = { ...object(after.people) }
			delete object(before.people).msPerYear
			delete object(after.people).msPerYear
			delete before.from
			delete before.to
			delete after.from
			delete after.to
			addRows({
				before,
				after,
				section: "Century statistics",
				period: `${seed} / ${period}`,
				rows,
			})
			rows.push({
				before: beforeMs,
				after: afterMs,
				section: "Performance",
				period: `${seed} / ${period}`,
				metric: "people.msPerYear",
			})
		}
		const da = previous ? diagnostics({ report: previous, seed }) : {}
		const db = diagnostics({ report: current, seed })
		addRows({
			before: tickSummary(da.annualTicks),
			after: tickSummary(db.annualTicks),
			section: "Performance",
			period: seed,
			rows,
		})
		for (const key of ["generationMs", "engineMs", "wallMs", "peakMemoryKb"])
			rows.push({
				before: da[key],
				after: db[key],
				section: "Performance",
				period: seed,
				metric: key,
			})
		const ta = Array.isArray(da.annualTicks) ? (da.annualTicks as number[]) : []
		const tb = Array.isArray(db.annualTicks) ? (db.annualTicks as number[]) : []
		for (let i = 0; i < Math.max(ta.length, tb.length); i++)
			rows.push({
				section: "Performance",
				period: `${seed} / year ${Number(object(b.values().next().value ?? a.values().next().value).from) + i + 1}`,
				metric: "annualTickMs",
				before: ta[i],
				after: tb[i],
			})
		for (const key of ["recruitment", "snapshots"]) {
			const ya = byYear(da[key])
			const yb = byYear(db[key])
			for (const year of new Set([...ya.keys(), ...yb.keys()])) {
				const before = { ...ya.get(year) }
				const after = { ...yb.get(year) }
				delete before.top
				delete after.top
				delete before.year
				delete after.year
				addRows({
					before,
					after,
					section:
						key === "recruitment" ? "Annual armies and economy" : "Knowledge",
					period: `${seed} / ${year}`,
					rows,
				})
				rows.push({
					section: "Raw diagnostics",
					period: `${seed} / ${year}`,
					metric: `${key}.top entries identical`,
					before: ya.has(year) ? true : undefined,
					after: yb.has(year)
						? isDeepStrictEqual(ya.get(year)?.top, yb.get(year)?.top)
						: undefined,
				})
			}
		}
		for (const key of [
			"rebelLogistics",
			"rebellionEvents",
			"rebellionAttempts",
			"armyReconstitutions",
			"rebelWarOutcomes",
		]) {
			const va = da[key]
			const vb = db[key]
			rows.push({
				section: "Raw diagnostics",
				period: seed,
				metric: `${key}.count`,
				before: Array.isArray(va) ? va.length : undefined,
				after: Array.isArray(vb) ? vb.length : undefined,
			})
			rows.push({
				section: "Raw diagnostics",
				period: seed,
				metric: `${key}.entries identical`,
				before: va === undefined ? undefined : true,
				after: vb === undefined ? undefined : isDeepStrictEqual(va, vb),
			})
		}
		for (const key of [
			"revision",
			"sourceHash",
			"generatedPoints",
			"provinces",
		])
			rows.push({
				section: "Provenance",
				period: seed,
				metric: key,
				before: da[key],
				after: db[key],
			})
	}
	return rows
}

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				character
			]!,
	)
}

function html({ current, previous }: ReportPair): string {
	const rows = metrics({ current, previous })
	const changed = rows.filter(
		(row) => !isDeepStrictEqual(row.before, row.after),
	)
	const simulationChanges = changed.filter((row) =>
		[
			"Century statistics",
			"Annual armies and economy",
			"Knowledge",
			"Raw diagnostics",
		].includes(row.section),
	)
	const configMatches =
		previous &&
		isDeepStrictEqual(configuration(current), configuration(previous))
	const link = (report: SavedReport) =>
		`<a href="${escapeHtml(relative(dirname(current.path), report.path).replace(/\\/g, "/"))}">${escapeHtml(report.path)}</a>`
	return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>History benchmark comparison</title>
<style>:root{font-family:system-ui;color:#17212b;background:#f5f7fa}body{max-width:1400px;margin:32px auto;padding:0 24px}h1{margin-bottom:8px}p{line-height:1.5;overflow-wrap:anywhere}.warning{background:#fff0cc;padding:16px;border-radius:8px}.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:24px 0}input,select,button{font:inherit;padding:8px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;text-align:left;border-bottom:1px solid #dce1e7;overflow-wrap:anywhere}th{background:#e8edf3}td:nth-child(n+4){font-variant-numeric:tabular-nums}tr.changed{background:#fff8e8}.scroll{overflow:auto}button:disabled{opacity:.5}</style>
<h1>History benchmark comparison</h1><p>Current: ${link(current)}<br>Previous: ${previous ? link(previous) : "No earlier completed matching report found."}</p>
${!previous || !configMatches ? '<p class="warning">' + (!previous ? "First comparable run: values are shown without a baseline." : "Configuration differs or is missing from an older report. Review Configuration before interpreting changes as regressions.") + "</p>" : ""}
<p>Simulation and diagnostics: ${simulationChanges.filter((row) => row.before !== undefined && row.after !== undefined).length.toLocaleString("en-US")} changed existing values, ${simulationChanges.filter((row) => row.before === undefined).length.toLocaleString("en-US")} added, ${simulationChanges.filter((row) => row.after === undefined).length.toLocaleString("en-US")} removed. Timing and memory: ${changed.filter((row) => row.section === "Performance").length.toLocaleString("en-US")} differences. Numerical changes show current minus previous. No increase or decrease is automatically judged better.</p>
<p>Century statistics cover the full timeline. Annual rows include army totals, cohorts and concentration. Raw event logs and top-realm lists are checked for exact equality; their full contents remain in the linked JSON files. Performance values use milliseconds, except peakMemoryKb (KiB).</p>
<div class="controls"><label>Section <select id="section"><option value="">All sections</option>${[...new Set(rows.map((row) => row.section))].map((section) => `<option>${escapeHtml(section)}</option>`).join("")}</select></label><label>Search <input id="search" type="search" placeholder="Metric, seed or year"></label><label><input id="changed" type="checkbox" checked> Changes only</label><button id="prev">Previous page</button><button id="next">Next page</button><span id="count" aria-live="polite"></span></div>
<div class="scroll"><table><thead><tr><th>Section</th><th>Seed / period</th><th>Metric</th><th>Previous</th><th>Current</th><th>Δ</th><th>Δ %</th></tr></thead><tbody id="rows"></tbody></table></div>
<script type="application/json" id="data">${JSON.stringify(rows).replace(/</g, "\\u003c")}</script>
<script>const data=JSON.parse(document.getElementById('data').textContent);const section=document.getElementById('section'),search=document.getElementById('search'),changed=document.getElementById('changed'),body=document.getElementById('rows');let page=0;const size=200;const format=v=>v===undefined?'Missing':v===null?'null':typeof v==='number'?v.toLocaleString('en-US',{maximumSignificantDigits:6}):String(v);function render(){const q=search.value.toLowerCase();const found=data.filter(r=>(!section.value||r.section===section.value)&&(!changed.checked||r.before!==r.after)&&(!q||(r.metric+' '+r.period).toLowerCase().includes(q)));page=Math.min(page,Math.max(0,Math.ceil(found.length/size)-1));body.replaceChildren();for(const r of found.slice(page*size,(page+1)*size)){const tr=document.createElement('tr');tr.className=r.before!==r.after?'changed':'';const numeric=typeof r.before==='number'&&typeof r.after==='number';const delta=numeric?r.after-r.before:null;const values=[r.section,r.period,r.metric,format(r.before),format(r.after),delta===null?'—':format(delta),!numeric?'—':r.before===0?(r.after===0?'0%':'n/a (zero baseline)'):(100*delta/Math.abs(r.before)).toLocaleString('en-US',{maximumFractionDigits:2})+'%'];for(const [index,value] of values.entries()){const td=document.createElement('td');td.textContent=value;if(index===3&&r.before!==undefined)td.title=String(r.before);if(index===4&&r.after!==undefined)td.title=String(r.after);tr.append(td)}body.append(tr)}document.getElementById('count').textContent=found.length+' rows · page '+(page+1)+' / '+Math.max(1,Math.ceil(found.length/size));document.getElementById('prev').disabled=page===0;document.getElementById('next').disabled=(page+1)*size>=found.length}for(const control of [section,search,changed])control.addEventListener('input',()=>{page=0;render()});document.getElementById('prev').onclick=()=>{page--;render()};document.getElementById('next').onclick=()=>{page++;render()};render();</script></html>`
}

function write({ current, baseline }: CompareParams): string {
	const report = read(current)
	let previous: SavedReport | null = baseline ? read(baseline) : null
	if (!baseline) {
		for (const path of files("stats/history").sort(
			(a, b) => startedAt(b) - startedAt(a),
		)) {
			if (
				resolve(path) === report.path ||
				startedAt(path) >= startedAt(report.path)
			)
				continue
			let candidate: SavedReport
			try {
				candidate = read(path)
			} catch {
				continue
			}
			if (matches({ current: report, previous: candidate })) {
				previous = candidate
				break
			}
		}
	}
	if (previous?.path === report.path)
		throw new Error("Current and baseline must be different reports")
	const outPath = join(
		dirname(report.path),
		`${basename(report.path, ".json")}-diff.html`,
	)
	writeFileSync(outPath, html({ current: report, previous }))
	return outPath
}

export const HISTORY_COMPARISON = { write, files }

// Flags loose `.ts` files sitting directly inside a domain folder (a folder
// that has its own `index.ts`), other than `index.ts`/`types.ts` themselves.
// Per AGENTS.md: "Nest sub-folders only for real sub-domains... A type used
// by exactly one file counts as that file owning a real sub-domain: if that
// file is not the domain's index.ts entry point, promote it to its own
// `<name>/{index.ts, types.ts}` submodule."
//
// This generalizes the flat-file/same-named-folder case: once a folder is a
// barrel (has index.ts), any other file living directly in it is an
// unpromoted sub-concern — especially damning when *sibling* concerns in
// that same folder already got their own submodule folder (e.g. `body/`,
// `environment/`), showing the loose file is the odd one out, not the norm.
//
// --fix promotes each loose `bar.ts` into its own `bar/index.ts` submodule
// (creating the `bar/` folder if one doesn't already exist — if it does,
// that's the same file check-flat-file-sibling-folder.mjs would also flag,
// and this reuses the existing folder rather than erroring), and rewrites
// the moved file's own relative imports to compensate for now living one
// directory deeper. Mechanical move + import-path fixup only; it does not
// split out `types.ts` or decide whether the result should be split further.

import fs from "node:fs"
import path from "node:path"
import { movePathAndRewriteImports } from "./lib/move-and-rewrite-imports.mjs"

const projectRoot = process.cwd()
const defaultRoot = path.join(projectRoot, "src", "model")

const args = process.argv.slice(2)
const shouldFix = args.includes("--fix")
const filterArg = args.find((a) => a !== "--fix")
const scanRoot = filterArg ? path.resolve(projectRoot, filterArg) : defaultRoot

/** @type {{folder: string, looseFile: string, siblingSubmodules: number}[]} */
const violations = []

function walk(dir) {
	if (["node_modules", "dist", "coverage"].includes(path.basename(dir))) return
	const entries = fs.readdirSync(dir, { withFileTypes: true })

	const hasIndex = entries.some((e) => e.isFile() && (e.name === "index.ts" || e.name === "index.tsx"))

	if (hasIndex) {
		const looseFiles = entries.filter(
			(e) =>
				e.isFile() &&
				/\.tsx?$/.test(e.name) &&
				!e.name.endsWith(".d.ts") &&
				!/\.test\.tsx?$/.test(e.name) &&
				!/\.smoke\.test\.tsx?$/.test(e.name) &&
				e.name !== "index.ts" &&
				e.name !== "index.tsx" &&
				e.name !== "types.ts" &&
				e.name !== "types.tsx",
		)
		const siblingSubmodules = entries.filter(
			(e) =>
				e.isDirectory() &&
				(fs.existsSync(path.join(dir, e.name, "index.ts")) ||
					fs.existsSync(path.join(dir, e.name, "index.tsx"))),
		).length

		for (const f of looseFiles) {
			violations.push({
				folder: dir,
				looseFile: path.join(dir, f.name),
				siblingSubmodules,
			})
		}
	}

	for (const entry of entries) {
		if (entry.isDirectory() && !["node_modules", "dist", "coverage"].includes(entry.name)) {
			walk(path.join(dir, entry.name))
		}
	}
}

walk(scanRoot)

violations.sort((a, b) => a.looseFile.localeCompare(b.looseFile))

console.log(`=== Loose files inside a domain folder that already has index.ts (${violations.length}) ===`)
for (const v of violations) {
	const note =
		v.siblingSubmodules > 0
			? ` (folder already has ${v.siblingSubmodules} sibling submodule${v.siblingSubmodules === 1 ? "" : "s"} - this file is the outlier)`
			: ""
	console.log(`${path.relative(projectRoot, v.looseFile)}${note}`)
}
if (violations.length === 0) console.log("none")

if (shouldFix) {
	console.log("\n--- applying fixes ---")
	let fixedCount = 0
	for (const v of violations) {
		const ext = path.extname(v.looseFile)
		const baseName = path.basename(v.looseFile, ext)
		const destFolder = path.join(v.folder, baseName)
		const dest = path.join(destFolder, `index${ext}`)

		if (fs.existsSync(dest)) {
			console.log(`skip (destination already exists): ${path.relative(projectRoot, dest)}`)
			continue
		}
		if (!fs.existsSync(destFolder)) {
			fs.mkdirSync(destFolder)
		} else if (!fs.statSync(destFolder).isDirectory()) {
			console.log(`skip (destination path is not a folder): ${path.relative(projectRoot, destFolder)}`)
			continue
		}
		try {
			movePathAndRewriteImports(v.looseFile, dest, projectRoot)
		} catch (err) {
			console.log(`skip (move failed): ${path.relative(projectRoot, v.looseFile)} - ${err.message}`)
			continue
		}
		console.log(`moved ${path.relative(projectRoot, v.looseFile)} -> ${path.relative(projectRoot, dest)}`)
		fixedCount++
	}
	console.log(`\n${fixedCount} file(s) moved. Type-extraction into types.ts and any further splitting still needs manual review.`)
}

process.exit(violations.length === 0 ? 0 : 1)

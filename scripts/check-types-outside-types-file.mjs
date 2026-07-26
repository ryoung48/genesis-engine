// Flags `type`/`interface` declarations defined outside a `types.ts` file.
// Per AGENTS.md: "`types.ts` = shape, `index.ts` = behavior... Never inline
// a type into its logic file just because only one file uses it — even a
// single-consumer type belongs in a `types.ts`."
//
// Scoped to src/model by default (that's where this convention is
// documented); pass a folder to narrow further, e.g.:
//   node scripts/check-types-outside-types-file.mjs src/model/celestial

import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const projectRoot = process.cwd()
const defaultRoot = path.join(projectRoot, "src", "model")

const filterArg = process.argv[2]
const scanRoot = filterArg ? path.resolve(projectRoot, filterArg) : defaultRoot

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (["node_modules", "dist", "coverage"].includes(entry.name)) continue
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walk(full, out)
		else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full)
	}
	return out
}

const files = walk(scanRoot).filter((f) => {
	const base = path.basename(f)
	return base !== "types.ts" && base !== "types.tsx" && !/\.test\.tsx?$/.test(base) && !/\.smoke\.test\.tsx?$/.test(base)
})

/** @type {{file: string, line: number, kind: string, name: string}[]} */
const violations = []

for (const file of files) {
	const text = fs.readFileSync(file, "utf8")
	const sourceFile = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	)

	ts.forEachChild(sourceFile, function visit(node) {
		if (ts.isTypeAliasDeclaration(node)) {
			const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
			violations.push({ file, line: line + 1, kind: "type", name: node.name.text })
		} else if (ts.isInterfaceDeclaration(node)) {
			const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
			violations.push({ file, line: line + 1, kind: "interface", name: node.name.text })
		}
		ts.forEachChild(node, visit)
	})
}

violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

console.log(`=== Types/interfaces declared outside types.ts (${violations.length}) ===`)
for (const v of violations) {
	console.log(`${path.relative(projectRoot, v.file)}:${v.line} - ${v.kind} \`${v.name}\``)
}
if (violations.length === 0) console.log("none")

process.exit(violations.length === 0 ? 0 : 1)

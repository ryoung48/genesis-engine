// Flags "pass-through" files: files that import something from elsewhere
// and then just re-export it, with no namespace object wrapping it. Per
// AGENTS.md: "The barrel is the entry point, not a pass-through... not just
// re-export free functions/constants pulled in from sibling files with no
// namespace wrapping them - that's a re-export shim, not an API."
//
// Each violation is classified along two independent axes so the failure
// mode is explicit instead of just "something looks re-exported":
//
// PATTERN (the syntax that triggered it):
//   star  - `export * from "./foo"`
//   named - `export { a, b } from "./foo"`
//   bare  - `import { a } from "./foo"` ... `export { a }` elsewhere, unchanged
//
// FILE SHAPE (what else is in the file besides imports/re-exports):
//   pure-shim    - the whole file is nothing but imports and re-exports;
//                  it exists only to forward another module. Fix: delete it
//                  and point its importers at the real module.
//   raw-in-barrel - the file has other real content (e.g. a namespace
//                  object), but this particular export bypasses it,
//                  leaking a sibling's raw symbol through the barrel
//                  instead of hanging it off the namespace object. Fix:
//                  wrap the symbol into the namespace object instead of
//                  re-exporting it bare.

import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const projectRoot = process.cwd()
const srcRoot = path.join(projectRoot, "src")

const filterArg = process.argv[2]
const filterPath = filterArg ? path.resolve(projectRoot, filterArg) : null
function passesFilter(file) {
	if (!filterPath) return true
	const resolved = path.resolve(file)
	return resolved === filterPath || resolved.startsWith(filterPath + path.sep)
}

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (["node_modules", "dist", "coverage"].includes(entry.name)) continue
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walk(full, out)
		else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full)
	}
	return out
}

const files = walk(srcRoot).filter(passesFilter)

/** @type {{file: string, line: number, pattern: string, shape: string, detail: string}[]} */
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

	// A file is a "pure shim" only if every top-level statement is either an
	// import or a re-export - i.e. it has zero real content of its own.
	let hasSubstantialContent = false
	for (const stmt of sourceFile.statements) {
		if (!ts.isImportDeclaration(stmt) && !ts.isExportDeclaration(stmt)) {
			hasSubstantialContent = true
			break
		}
	}
	const fileShape = hasSubstantialContent ? "raw-in-barrel" : "pure-shim"

	const importedNames = new Map() // local name -> module specifier
	const fileViolations = []

	ts.forEachChild(sourceFile, (node) => {
		// export * from "./foo"  /  export { a, b } from "./foo"
		if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
			const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
			if (node.exportClause && ts.isNamedExports(node.exportClause)) {
				fileViolations.push({
					line: line + 1,
					pattern: "named",
					detail: `re-exports { ${node.exportClause.elements.map((e) => e.name.text).join(", ")} } from "${node.moduleSpecifier.text}"`,
				})
			} else {
				fileViolations.push({
					line: line + 1,
					pattern: "star",
					detail: `re-exports * from "${node.moduleSpecifier.text}"`,
				})
			}
		}

		// import { a } from "./foo"
		if (
			ts.isImportDeclaration(node) &&
			node.importClause?.namedBindings &&
			ts.isNamedImports(node.importClause.namedBindings)
		) {
			const specifier = node.moduleSpecifier.text
			for (const el of node.importClause.namedBindings.elements) {
				importedNames.set(el.name.text, specifier)
			}
		}
	})

	// export { a } (bare, no "from") where `a` was imported unchanged
	ts.forEachChild(sourceFile, (node) => {
		if (
			ts.isExportDeclaration(node) &&
			!node.moduleSpecifier &&
			node.exportClause &&
			ts.isNamedExports(node.exportClause)
		) {
			for (const el of node.exportClause.elements) {
				const localName = (el.propertyName ?? el.name).text
				if (importedNames.has(localName)) {
					const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
					fileViolations.push({
						line: line + 1,
						pattern: "bare",
						detail: `re-exports \`${localName}\` unchanged, originally imported from "${importedNames.get(localName)}"`,
					})
				}
			}
		}
	})

	for (const v of fileViolations) {
		violations.push({ file, line: v.line, pattern: v.pattern, shape: fileShape, detail: v.detail })
	}
}

violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

const shapeLabel = {
	"pure-shim": "PURE SHIM (whole file is just a re-export - delete it, repoint importers)",
	"raw-in-barrel": "RAW EXPORT IN BARREL (file has real content, but this export bypasses its namespace object)",
}

console.log(`=== Pass-through re-exports (${violations.length}) ===`)
for (const v of violations) {
	console.log(
		`${path.relative(projectRoot, v.file)}:${v.line} [${v.pattern}/${v.shape}] - ${v.detail}`,
	)
}
if (violations.length === 0) console.log("none")

console.log("\n--- summary ---")
for (const shape of Object.keys(shapeLabel)) {
	const count = violations.filter((v) => v.shape === shape).length
	console.log(`${shapeLabel[shape]}: ${count}`)
}
for (const pattern of ["star", "named", "bare"]) {
	const count = violations.filter((v) => v.pattern === pattern).length
	console.log(`pattern "${pattern}": ${count}`)
}

process.exit(violations.length === 0 ? 0 : 1)

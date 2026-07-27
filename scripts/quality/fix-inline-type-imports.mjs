// Auto-fixes inline `import("...").Type` type expressions (found by
// find-inline-type-imports.mjs) into normal top-level `import type { Type }
// from "..."` statements.
//
// Usage:
//   node scripts/quality/fix-inline-type-imports.mjs          # apply fixes
//   node scripts/quality/fix-inline-type-imports.mjs --check   # dry run, report only
//
// Handles the common case: `import("module").Identifier` or
// `import("module").Identifier<TypeArgs>`. Skips (and reports) anything it
// can't safely rewrite: `typeof import(...)`, dotted/namespace qualifiers
// (`import("mod").NS.Foo`), or a name that would collide with an existing
// import of the same identifier from a different module.
import { readFileSync, writeFileSync, globSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "..", "src")
const CHECK_ONLY = process.argv.includes("--check")

const files = globSync("**/*.{ts,tsx}", { cwd: SRC_ROOT }).map((f) =>
	path.join(SRC_ROOT, f),
)

let totalFixed = 0
let totalSkipped = 0
let filesChanged = 0

for (const file of files) {
	const text = readFileSync(file, "utf8")
	const sourceFile = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	)

	// Existing top-level import specifiers already in scope, so we don't
	// double-import or collide with a differently-sourced same-named type.
	const existingNames = new Set()
	let lastImportEnd = 0
	for (const stmt of sourceFile.statements) {
		if (!ts.isImportDeclaration(stmt)) continue
		lastImportEnd = stmt.getEnd()
		const clause = stmt.importClause
		if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings))
			continue
		for (const el of clause.namedBindings.elements) {
			existingNames.add((el.propertyName ?? el.name).text)
		}
	}

	/** @type {{ node: ts.ImportTypeNode, name: string, typeArgsText: string }[]} */
	const fixable = []
	let skipped = 0

	function visit(node) {
		if (ts.isImportTypeNode(node)) {
			const moduleSpecifier = node.argument.literal.text
			const isDefaultDot = node.qualifier && ts.isIdentifier(node.qualifier)
			if (node.isTypeOf || !node.qualifier || !isDefaultDot) {
				skipped++
			} else {
				const typeArgsText = node.typeArguments
					? `<${node.typeArguments.map((t) => t.getText(sourceFile)).join(", ")}>`
					: ""
				fixable.push({
					node,
					name: node.qualifier.text,
					moduleSpecifier,
					typeArgsText,
				})
			}
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)

	if (fixable.length === 0) {
		totalSkipped += skipped
		continue
	}

	// Group needed imports by module, dropping names already in scope or
	// that collide (same name, different module already queued).
	const importsByModule = new Map()
	const nameToModule = new Map()
	const edits = []

	for (const { node, name, moduleSpecifier, typeArgsText } of fixable) {
		if (existingNames.has(name)) {
			edits.push({
				start: node.getStart(sourceFile),
				end: node.getEnd(),
				replacement: name + typeArgsText,
			})
			continue
		}
		const priorModule = nameToModule.get(name)
		if (priorModule && priorModule !== moduleSpecifier) {
			skipped++
			continue
		}
		nameToModule.set(name, moduleSpecifier)
		if (!importsByModule.has(moduleSpecifier))
			importsByModule.set(moduleSpecifier, new Set())
		importsByModule.get(moduleSpecifier).add(name)
		edits.push({
			start: node.getStart(sourceFile),
			end: node.getEnd(),
			replacement: name + typeArgsText,
		})
	}

	if (edits.length === 0) {
		totalSkipped += skipped
		continue
	}

	edits.sort((a, b) => b.start - a.start)
	let newText = text
	for (const { start, end, replacement } of edits) {
		newText = newText.slice(0, start) + replacement + newText.slice(end)
	}

	const importLines = [...importsByModule.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(
			([mod, names]) =>
				`import type { ${[...names].sort().join(", ")} } from "${mod}"\n`,
		)
		.join("")

	newText =
		newText.slice(0, lastImportEnd) +
		(lastImportEnd > 0 ? "\n" : "") +
		importLines.slice(0, -1) +
		newText.slice(lastImportEnd)

	totalFixed += edits.length
	totalSkipped += skipped
	filesChanged++

	const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/")
	console.log(
		`${CHECK_ONLY ? "[dry-run] " : ""}${rel}: ${edits.length} fixed, ${skipped} skipped`,
	)

	if (!CHECK_ONLY) writeFileSync(file, newText, "utf8")
}

console.log(
	`\n${CHECK_ONLY ? "Would fix" : "Fixed"} ${totalFixed} inline type import(s) across ${filesChanged} file(s). ${totalSkipped} skipped (manual review needed).`,
)

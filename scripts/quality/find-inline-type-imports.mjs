// Finds inline `import("...").Type` type expressions (TS ImportTypeNode) in
// src/. Biome has no rule for this (checked: noRestrictedImports,
// noNamespaceImport, noPrivateImports, noExportedImports, etc. don't cover
// it) — these should be normal top-level `import type { Type } from "..."`
// statements instead.
import { readFileSync, globSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "..", "src")

const files = globSync("**/*.{ts,tsx}", { cwd: SRC_ROOT }).map((f) =>
	path.join(SRC_ROOT, f),
)

/** @type {{ file: string, line: number, text: string }[]} */
const hits = []

for (const file of files) {
	const text = readFileSync(file, "utf8")
	const sourceFile = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	)

	function visit(node) {
		if (ts.isImportTypeNode(node)) {
			const { line } = sourceFile.getLineAndCharacterOfPosition(
				node.getStart(sourceFile),
			)
			hits.push({
				file,
				line: line + 1,
				text: node.getText(sourceFile),
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
}

if (hits.length === 0) {
	console.log("No inline type imports found.")
} else {
	console.log(`Inline type imports (${hits.length}):`)
	for (const { file, line, text } of hits.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	)) {
		console.log(
			`  ${path.relative(SRC_ROOT, file).replace(/\\/g, "/")}:${line}  ${text}`,
		)
	}
}

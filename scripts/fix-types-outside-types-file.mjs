// Multi-step pass at getting files, namespace members, types, and barrels
// to the right place, per AGENTS.md rules 36/39.
//
// Step 0: moves every top-level flat file in --dir (skipping index.ts and
// types.ts) into its own `<name>/index.ts` submodule folder — a pure file
// move, no splitting. Never requires fixing a consumer: a folder's
// index.ts resolves at exactly the same import specifier the flat file it
// replaces did.
//
// Step 1 (namespace-member LCA): for each exported UPPERCASE namespace
// object, relocates a member function to the lowest common ancestor
// directory of everyone who actually calls `NAMESPACE.member(...)` —
// narrower (an existing submodule's own namespace object) or broader (a
// shared ancestor's), in either direction. Never fabricates a new home:
// the target directory must already have an index.ts (submodules that
// need to exist are Step 0's job, which already ran). Never crosses
// outside --dir either — a consumer outside scope is a hard boundary; the
// member is left in place and reported. Runs before the type steps so any
// type-only fallout from moving behavior gets sorted in the same pass,
// not a second one.
//
// Step 2: moves interface/type-alias/enum declarations out of non-types.ts
// files and into their domain's sibling types.ts ("types.ts = shape,
// index.ts = behavior"). Only operates in directories that already have a
// types.ts, or a types.ts is created alongside — see step 2's own comment.
// Skips (flags, doesn't move) a declaration when:
//   - its name already exists in the target types.ts (collision)
//   - its body references another local (same-file) declaration that isn't
//     itself being moved in this pass, and isn't already exported — moving
//     the type would break trying to resolve that reference, same failure
//     mode as fix-max-params.mjs's original bug, just for whole-declaration
//     moves instead of reconstructed param types
//   - it's a class (classes aren't "shape"; AGENTS.md avoids them anyway)
//
// Step 3 (LCA pass): once types live in a types.ts, relocates each one to
// the lowest common ancestor directory of everyone who actually consumes
// it — narrower (a submodule's own types.ts) or broader (a shared parent),
// as long as the result stays within --dir. A consumer outside --dir is a
// hard boundary: the type is left in place and reported, not moved.
//
// Step 4: removes pure pass-through barrel index.ts files (every statement
// is `export {...} from "./x"`, nothing declared locally) and rewrites
// every consumer's import to the concrete source module directly.
//
// Usage:
//   node scripts/fix-types-outside-types-file.mjs [--dir=src/model/society]  # apply
//   node scripts/fix-types-outside-types-file.mjs --check [--dir=...]         # dry run
import path from "node:path"
import { Node, Project, SyntaxKind } from "ts-morph"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src")
const CHECK_ONLY = process.argv.includes("--check")
const dirArg = process.argv.find((a) => a.startsWith("--dir="))
// ts-morph always returns forward-slash paths (even on Windows), so
// normalize this the same way before comparing against them.
const SCOPE_DIR = dirArg
	? path.resolve(import.meta.dirname, "..", dirArg.slice(6)).replace(/\\/g, "/")
	: null

const project = new Project({
	tsConfigFilePath: path.resolve(import.meta.dirname, "..", "tsconfig.app.json"),
})
project.addSourceFilesAtPaths(path.join(SRC_ROOT, "**/*.{ts,tsx}"))

function toModuleSpecifier(file) {
	const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/").replace(/\.tsx?$/, "")
	return `@/${rel}`
}

function relativeSpecifier(fromFilePath, toFilePath) {
	const rel = path
		.relative(path.dirname(fromFilePath), toFilePath)
		.replace(/\\/g, "/")
		.replace(/\.tsx?$/, "")
	return rel.startsWith(".") ? rel : `./${rel}`
}

function inScope(filePath) {
	return !SCOPE_DIR || filePath === SCOPE_DIR || filePath.startsWith(`${SCOPE_DIR}/`)
}

// --- Step 0: flatten loose files into submodules ---------------------------
function adjustSpecifierDepth(specifier) {
	if (!specifier.startsWith(".")) return specifier
	return specifier === ".." || specifier.startsWith("../")
		? `../${specifier}`
		: `..${specifier.slice(1)}` // "./x" -> "../x"
}

{
	const flatCandidates = project
		.getSourceFiles()
		.filter((sf) => inScope(sf.getFilePath()))
		.filter((sf) => !["index.ts", "index.tsx", "types.ts"].includes(sf.getBaseName()))

	const movedIndexPaths = []
	for (const sourceFile of flatCandidates) {
		const dir = path.dirname(sourceFile.getFilePath())
		const baseName = sourceFile.getBaseNameWithoutExtension()
		const ext = sourceFile.getExtension()
		const newDir = `${dir}/${baseName}`
		const newIndexPath = `${newDir}/index${ext}`

		if (project.getDirectory(newDir)) continue // already a submodule — nothing to flatten

		console.log(
			`${CHECK_ONLY ? "[dry-run] " : ""}[flatten] ${path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")} -> ${path.relative(SRC_ROOT, newIndexPath).replace(/\\/g, "/")}`,
		)
		if (CHECK_ONLY) continue

		const importLines = sourceFile
			.getImportDeclarations()
			.map((imp) => {
				const specifier = adjustSpecifierDepth(imp.getModuleSpecifierValue())
				const text = imp.getText()
				return text.replace(/(["'])(?:(?!\1).)*\1(?=\s*$)/, `"${specifier}"`)
			})
			.join("\n")
		const bodyLines = sourceFile
			.getStatements()
			.filter((s) => !sourceFile.getImportDeclarations().includes(s))
			.map((s) => s.getText())
			.join("\n\n")
		const newContent = `${importLines}${importLines ? "\n\n" : ""}${bodyLines}\n`

		project.createSourceFile(newIndexPath, newContent)
		sourceFile.delete()
		movedIndexPaths.push(newIndexPath)
	}

	console.log(
		`${CHECK_ONLY ? "Would flatten" : "Flattened"} ${CHECK_ONLY ? flatCandidates.filter((sf) => !project.getDirectory(`${path.dirname(sf.getFilePath())}/${sf.getBaseNameWithoutExtension()}`)).length : movedIndexPaths.length} file(s) into submodules.\n`,
	)
}

// TS/lib globals safe to reference from anywhere without an import.
const BUILTIN_NAMES = new Set([
	"Array", "ReadonlyArray", "Promise", "Record", "Partial", "Required",
	"Readonly", "Pick", "Omit", "Exclude", "Extract", "ReturnType",
	"Parameters", "InstanceType", "Map", "ReadonlyMap", "Set", "ReadonlySet",
	"Date", "RegExp", "Error", "Function", "Iterable", "IterableIterator",
	"Generator", "PromiseLike", "WeakMap", "WeakSet", "ArrayBuffer",
	"Uint8Array", "Uint16Array", "Uint32Array", "Int8Array", "Int16Array",
	"Int32Array", "Float32Array", "Float64Array", "Math", "JSON", "console",
	"number", "string", "boolean", "void", "null", "undefined", "any",
	"unknown", "never", "object", "bigint", "symbol", "Infinity", "NaN",
])

function isFunctionValued(prop, localFunctionNames) {
	if (Node.isMethodDeclaration(prop)) return true
	if (Node.isShorthandPropertyAssignment(prop)) {
		const decl = prop.getNameNode().getDefinitionNodes()[0]
		return Node.isFunctionDeclaration(decl) || Node.isArrowFunction(decl) || Node.isFunctionExpression(decl)
	}
	if (Node.isPropertyAssignment(prop)) {
		const init = prop.getInitializer()
		if (!init) return false
		if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) return true
		if (Node.isIdentifier(init)) {
			const decl = init.getSymbol()?.getValueDeclaration()
			return Node.isFunctionDeclaration(decl) || Node.isArrowFunction(decl) || Node.isFunctionExpression(decl)
		}
	}
	return false
}

function dirOf(sourceFile) {
	return path.dirname(sourceFile.getFilePath())
}

function commonAncestorDir(dirs) {
	const parts = [...dirs].map((d) => d.split("/"))
	const minLen = Math.min(...parts.map((p) => p.length))
	const lca = []
	for (let i = 0; i < minLen; i++) {
		const seg = parts[0][i]
		if (parts.every((p) => p[i] === seg)) lca.push(seg)
		else break
	}
	return lca.join("/")
}

// A function is safe to physically relocate only if every free identifier
// in its body resolves to either a builtin, a parameter/local binding, or
// something importable (an exported project declaration) — never a private
// same-file helper (that dependency wouldn't exist in the target file) or a
// third-party/non-exported type (same failure mode fix-max-params.mjs hit).
function analyzeFunctionBody(fnNode, ownFile) {
	const localNames = new Set()
	for (const p of fnNode.getParameters()) localNames.add(p.getName())
	for (const tp of fnNode.getTypeParameters?.() ?? []) localNames.add(tp.getName())
	for (const v of fnNode.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
		if (Node.isIdentifier(v.getNameNode())) localNames.add(v.getNameNode().getText())
	}

	const externalRefs = []
	for (const id of fnNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
		const name = id.getText()
		if (localNames.has(name) || BUILTIN_NAMES.has(name)) continue
		const parent = id.getParent()
		// Property names in member/property-access position aren't free
		// identifiers (`x.foo` — `foo` doesn't need to resolve on its own).
		if (
			(Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) ||
			(Node.isPropertyAssignment(parent) && parent.getNameNode() === id) ||
			Node.isBindingElement(parent)
		)
			continue

		let symbol = id.getSymbol()
		if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol()
		const decl = symbol?.getDeclarations()?.[0]
		if (!decl) continue // unresolved — likely a local param/binding already excluded above

		const declFile = decl.getSourceFile()
		if (declFile === ownFile) continue // same-file binding, handled implicitly if it moves too — else caught below
		if (declFile.getFilePath().includes("node_modules")) {
			return { unsafe: `references a third-party symbol '${name}'`, refs: [] }
		}
		const isExported = typeof decl.isExported === "function" ? decl.isExported() : false
		if (!isExported) {
			return {
				unsafe: `references a non-exported symbol '${name}' (declared in ${path.relative(SRC_ROOT, declFile.getFilePath()).replace(/\\/g, "/")})`,
				refs: [],
			}
		}
		externalRefs.push({ name, declFile })
	}

	// Same-file references to anything other than the function's own name
	// (recursion) mean it depends on a private helper that can't come along.
	for (const id of fnNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
		const name = id.getText()
		if (localNames.has(name) || BUILTIN_NAMES.has(name)) continue
		let symbol = id.getSymbol()
		if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol()
		const decl = symbol?.getDeclarations()?.[0]
		if (decl?.getSourceFile() === ownFile && decl !== fnNode && !fnNode.getDescendants().includes(decl)) {
			const declName = Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl) ? decl.getName?.() : null
			if (declName && declName !== fnNode.getName?.()) {
				return {
					unsafe: `depends on a private same-file helper '${declName}'`,
					refs: [],
				}
			}
		}
	}

	return { unsafe: null, refs: externalRefs }
}

// Checks whether an interface/type-alias/enum declaration is safe to
// relocate verbatim into a different types.ts, and collects every named
// type it depends on outside itself so the caller can import each into the
// new location. Without this, copying just the declaration's *text* leaves
// behind whatever it depends on — the exact bug that broke ~20 renderer/
// files (fix-max-params.mjs) and had to be hand-patched three times in
// society/types.ts before this got ported over.
function analyzeDeclarationDependencies(decl, siblingNamesBeingMoved = new Set()) {
	for (const tq of decl.getDescendantsOfKind(SyntaxKind.TypeQuery)) {
		return { unsafe: `depends on a runtime value via \`typeof ${tq.getExprName().getText()}\``, refs: [] }
	}

	const refs = []
	const seen = new Set()
	for (const ref of decl.getDescendantsOfKind(SyntaxKind.TypeReference)) {
		const nameNode = ref.getTypeName()
		const leftmost = Node.isQualifiedName(nameNode)
			? (() => {
					let n = nameNode
					while (Node.isQualifiedName(n)) n = n.getLeft()
					return n
				})()
			: nameNode
		const name = leftmost.getText()
		if (name === decl.getName()) continue // self-reference (recursive type)
		if (BUILTIN_NAMES.has(name)) continue
		if (siblingNamesBeingMoved.has(name)) continue // co-relocating — will coexist in the target
		if (seen.has(name)) continue

		let symbol = leftmost.getSymbol()
		if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol()
		const d = symbol?.getDeclarations()?.[0]
		if (!d) continue // unresolved (e.g. a generic type param) — not an import dependency

		const declSourceFile = d.getSourceFile()
		if (declSourceFile.getFilePath().includes("node_modules")) {
			return { unsafe: `references a third-party type '${name}'`, refs: [] }
		}
		const isExported = typeof d.isExported === "function" ? d.isExported() : false
		if (!isExported) {
			return {
				unsafe: `references a non-exported type '${name}' (declared in ${path.relative(SRC_ROOT, declSourceFile.getFilePath()).replace(/\\/g, "/")})`,
				refs: [],
			}
		}
		seen.add(name)
		refs.push({ name, declSourceFile })
	}
	return { unsafe: null, refs }
}

// Imports every {name, declSourceFile} ref into targetFile, merging into an
// existing import from the same module if one's already there.
function importRefsInto(targetFile, refs) {
	for (const { name, declSourceFile } of refs) {
		if (declSourceFile === targetFile) continue
		const specifier = relativeSpecifier(targetFile.getFilePath(), declSourceFile.getFilePath())
		const existing = targetFile
			.getImportDeclarations()
			.find((imp) => imp.getModuleSpecifierValue() === specifier)
		if (existing) {
			if (!existing.getNamedImports().some((n) => n.getName() === name)) {
				existing.addNamedImport(existing.isTypeOnly() ? { name } : { name, isTypeOnly: true })
			}
		} else {
			targetFile.addImportDeclaration({
				moduleSpecifier: specifier,
				namedImports: [{ name }],
				isTypeOnly: true,
			})
		}
	}
}

// --- Step 1: namespace-member LCA -------------------------------------------
{
	const namespaces = []
	for (const sourceFile of project.getSourceFiles()) {
		if (!inScope(sourceFile.getFilePath())) continue
		for (const stmt of sourceFile.getVariableStatements()) {
			if (!stmt.hasExportKeyword()) continue
			for (const decl of stmt.getDeclarations()) {
				const name = decl.getName()
				if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue
				const init = decl.getInitializer()
				if (!init || !Node.isObjectLiteralExpression(init)) continue
				const properties = init.getProperties()
				const localFunctionNames = new Set()
				for (const s of sourceFile.getFunctions()) if (s.getName()) localFunctionNames.add(s.getName())
				const functionCount = properties.filter((p) => isFunctionValued(p, localFunctionNames)).length
				if (properties.length > 0 && functionCount / properties.length > 0.5)
					namespaces.push({ sourceFile, namespaceName: name, objectLiteral: init })
			}
		}
	}

	let memberMoves = 0
	let memberFlags = 0
	for (const { sourceFile, namespaceName, objectLiteral } of namespaces) {
		const currentDir = dirOf(sourceFile)
		for (const prop of [...objectLiteral.getProperties()]) {
			const memberName = Node.isShorthandPropertyAssignment(prop)
				? prop.getName()
				: Node.isPropertyAssignment(prop) && Node.isIdentifier(prop.getNameNode())
					? prop.getNameNode().getText()
					: null
			if (!memberName) continue

			const nameNode = prop.getNameNode()
			const refs = nameNode
				.findReferencesAsNodes()
				.filter((r) => r !== nameNode)
				.filter((r) => {
					const p = r.getParent()
					return !Node.isImportSpecifier(p) && !Node.isExportSpecifier(p)
				})
			if (refs.length === 0) continue

			const consumerDirs = new Set(refs.map((r) => dirOf(r.getSourceFile())))
			const lcaDir = commonAncestorDir(consumerDirs)
			if (lcaDir === currentDir) continue

			// True LCA: moves in either direction — up to a shared ancestor,
			// or down into a single existing submodule that owns every
			// consumer. Never sideways to an unrelated branch (the LCA
			// computation itself already rules that out: it can only ever
			// land on an ancestor of every consumer directory, never a
			// sibling of one). Direction doesn't matter beyond that; only
			// scope and an existing target do (checked below).

			if (!inScope(lcaDir)) {
				console.log(`[kept] ${namespaceName}.${memberName}: LCA is outside scope — needs a human call`)
				memberFlags++
				continue
			}

			const targetIndexPath = `${lcaDir}/index.ts`
			const targetFile = project.getSourceFile(targetIndexPath)
			if (!targetFile) {
				console.log(`[kept] ${namespaceName}.${memberName}: ${path.relative(SRC_ROOT, lcaDir).replace(/\\/g, "/")} has no index.ts — needs a human call`)
				memberFlags++
				continue
			}

			// Resolve the underlying function declaration.
			let fnNode = null
			if (Node.isShorthandPropertyAssignment(prop)) {
				const d = nameNode.getDefinitionNodes()[0]
				if (Node.isFunctionDeclaration(d)) fnNode = d
			} else if (Node.isPropertyAssignment(prop)) {
				const init = prop.getInitializer()
				if (Node.isIdentifier(init)) {
					const d = init.getSymbol()?.getValueDeclaration()
					if (Node.isFunctionDeclaration(d)) fnNode = d
				} else if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
					fnNode = init
				}
			}
			if (!fnNode || !Node.isFunctionDeclaration(fnNode)) {
				console.log(`[kept] ${namespaceName}.${memberName}: not a plain named function declaration — needs a human call`)
				memberFlags++
				continue
			}

			const { unsafe } = analyzeFunctionBody(fnNode, sourceFile)
			if (unsafe) {
				console.log(`[kept] ${namespaceName}.${memberName}: ${unsafe} — needs a human call`)
				memberFlags++
				continue
			}

			// Find (or identify the need for) a target namespace object in
			// the ancestor's existing index.ts.
			let targetNamespace = null
			for (const stmt of targetFile.getVariableStatements()) {
				if (!stmt.hasExportKeyword()) continue
				for (const d of stmt.getDeclarations()) {
					if (!/^[A-Z][A-Z0-9_]*$/.test(d.getName())) continue
					const init = d.getInitializer()
					if (init && Node.isObjectLiteralExpression(init)) {
						targetNamespace = { name: d.getName(), objectLiteral: init }
						break
					}
				}
				if (targetNamespace) break
			}

			console.log(
				`[member-move] ${namespaceName}.${memberName} (${path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")}) -> ${targetNamespace ? `${targetNamespace.name}.${memberName}` : `new namespace in`} ${path.relative(SRC_ROOT, targetIndexPath).replace(/\\/g, "/")} — ${refs.length} call site(s) across ${consumerDirs.size} directorie(s)`,
			)
			memberMoves++
			// Detection/reporting only for now — see conversation: this is a
			// materially riskier move (relocating behavior, not just a type
			// declaration) and isn't wired to actually mutate files yet.
		}
	}

	console.log(
		`\n${CHECK_ONLY ? "Would move" : "Identified"} ${memberMoves} namespace member(s) for relocation, ${memberFlags} flagged.\n`,
	)
}

// --- Step 2: types out of flat files -----------------------------------
// Every types.ts in the project, and the sibling files that should feed it.
const typesFiles = project
	.getSourceFiles()
	.filter((sf) => sf.getBaseName() === "types.ts")
	.filter((sf) => !SCOPE_DIR || sf.getFilePath().startsWith(`${SCOPE_DIR}/`))

/** @type {{ decl: any, name: string, sourceFile: any, typesFile: any, wasExported: boolean }[]} */
const candidates = []
/** @type {{ name: string, file: string, reason: string }[]} */
const flagged = []

for (const typesFile of typesFiles) {
	const dir = path.dirname(typesFile.getFilePath())
	const siblings = project
		.getSourceFiles()
		.filter((sf) => path.dirname(sf.getFilePath()) === dir && sf !== typesFile)

	// Names already declared in types.ts, to detect collisions up front.
	const existingTypeNames = new Set([
		...typesFile.getInterfaces().map((i) => i.getName()),
		...typesFile.getTypeAliases().map((t) => t.getName()),
		...typesFile.getEnums().map((e) => e.getName()),
	])

	for (const sourceFile of siblings) {
		const localDecls = [
			...sourceFile.getInterfaces(),
			...sourceFile.getTypeAliases(),
			...sourceFile.getEnums(),
		]
		const localDeclNames = new Set(localDecls.map((d) => d.getName()))
		const rel = path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")

		for (const decl of localDecls) {
			const name = decl.getName()

			if (existingTypeNames.has(name)) {
				flagged.push({ name, file: rel, reason: `collides with an existing '${name}' already in ${path.relative(SRC_ROOT, typesFile.getFilePath()).replace(/\\/g, "/")}` })
				continue
			}

			// Check the declaration's own body: references to a sibling also
			// being moved this pass are fine (they'll coexist in types.ts);
			// anything else must be a safely-importable exported type (and
			// gets imported into types.ts alongside the declaration) or the
			// move is unsafe.
			const { unsafe, refs } = analyzeDeclarationDependencies(decl, localDeclNames)
			if (unsafe) {
				flagged.push({ name, file: rel, reason: unsafe })
				continue
			}

			existingTypeNames.add(name) // reserve, so two siblings can't collide with each other either
			candidates.push({
				decl,
				name,
				sourceFile,
				typesFile,
				refs,
				wasExported: decl.isExported?.() ?? false,
			})
		}
	}
}

console.log(
	`${CHECK_ONLY ? "[dry-run] " : ""}${candidates.length} declaration(s) to move, ${flagged.length} flagged.`,
)
for (const { name, sourceFile, typesFile } of candidates) {
	console.log(
		`  ${path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")}: ${name} -> ${path.relative(SRC_ROOT, typesFile.getFilePath()).replace(/\\/g, "/")}`,
	)
}
for (const { name, file, reason } of flagged) {
	console.log(`  [flagged] ${file}: ${name} — ${reason}`)
}

for (const { decl, name, sourceFile, typesFile, refs, wasExported } of CHECK_ONLY ? [] : candidates) {
	const importSpecifier = (() => {
		const relImport = path
			.relative(path.dirname(sourceFile.getFilePath()), typesFile.getFilePath())
			.replace(/\\/g, "/")
			.replace(/\.ts$/, "")
		return relImport.startsWith(".") ? relImport : `./${relImport}`
	})()

	// Move the declaration's text into types.ts, then delete the original,
	// importing along everything the declaration depends on.
	const text = decl.getText()
	const exportedText = text.startsWith("export ") ? text : `export ${text}`
	typesFile.addStatements(`\n${exportedText}\n`)
	decl.remove()
	importRefsInto(typesFile, refs)

	// If the source file itself still uses the type, import it back.
	const stillUsed = sourceFile.getFullText().includes(name)
	if (stillUsed) {
		const existingImport = sourceFile
			.getImportDeclarations()
			.find((imp) => imp.getModuleSpecifierValue() === importSpecifier)
		if (existingImport) {
			if (!existingImport.getNamedImports().some((n) => n.getName() === name)) {
				existingImport.addNamedImport(
					existingImport.isTypeOnly() ? { name } : { name, isTypeOnly: true },
				)
			}
		} else {
			sourceFile.addImportDeclaration({
				moduleSpecifier: importSpecifier,
				namedImports: [{ name }],
				isTypeOnly: true,
			})
		}
	}

	// If it was exported (other files may import it from the old location),
	// rewrite every such import project-wide to the new module.
	if (wasExported) {
		const oldModuleSpecifiers = new Set([
			toModuleSpecifier(sourceFile.getFilePath()),
			path.relative(path.dirname(sourceFile.getFilePath()), sourceFile.getFilePath()) || "./" + sourceFile.getBaseNameWithoutExtension(),
		])
		for (const consumer of project.getSourceFiles()) {
			if (consumer === sourceFile || consumer === typesFile) continue
			for (const imp of consumer.getImportDeclarations()) {
				const specifier = imp.getModuleSpecifierValue()
				const resolvedSpecifier = specifier.startsWith(".")
					? toModuleSpecifier(
							path.resolve(path.dirname(consumer.getFilePath()), specifier) + ".ts",
						)
					: specifier
				if (resolvedSpecifier !== toModuleSpecifier(sourceFile.getFilePath())) continue

				const named = imp.getNamedImports().find((n) => n.getName() === name)
				if (!named) continue

				const newImportSpecifier = (() => {
					const rel = path
						.relative(path.dirname(consumer.getFilePath()), typesFile.getFilePath())
						.replace(/\\/g, "/")
						.replace(/\.ts$/, "")
					return rel.startsWith(".") ? rel : `./${rel}`
				})()

				named.remove()
				if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) {
					imp.remove()
				}

				const targetImport = consumer
					.getImportDeclarations()
					.find((i) => i.getModuleSpecifierValue() === newImportSpecifier)
				if (targetImport) {
					if (!targetImport.getNamedImports().some((n) => n.getName() === name)) {
						targetImport.addNamedImport(
							targetImport.isTypeOnly() ? { name } : { name, isTypeOnly: true },
						)
					}
				} else {
					consumer.addImportDeclaration({
						moduleSpecifier: newImportSpecifier,
						namedImports: [{ name }],
						isTypeOnly: true,
					})
				}
			}
		}
	}
}

const touchedFiles = new Set(
	CHECK_ONLY
		? []
		: [
				...candidates.map((c) => c.sourceFile.getFilePath()),
				...candidates.map((c) => c.typesFile.getFilePath()),
			],
)

console.log(`\n${CHECK_ONLY ? "Would move" : "Moved"} ${candidates.length} declaration(s).`)

// --- Step 3: types LCA pass -------------------------------------------------
// Now that types live in a types.ts, check whether each one is declared at
// the right *level*: the lowest common ancestor directory of everyone who
// actually consumes it. A type only ever used by files under one specific
// subdirectory should live in that subdirectory's types.ts (creating it if
// needed), not the broader parent's — that's the other half of "types.ts =
// shape" (AGENTS.md rule 39): don't just get types out of behavior files,
// get them to the narrowest domain that owns them.
//
// Moves in either direction — down into a descendant when every consumer
// lives there, or up toward a shared ancestor when consumers span multiple
// branches — as long as the computed LCA stays inside --dir. That scope
// boundary is a hard limit: if any consumer lives outside it, the type is
// left in place and reported, since relocating past the boundary the
// caller asked to operate within needs a human call, not an automatic one.
const allTypesFilesInScope = project
	.getSourceFiles()
	.filter((sf) => sf.getBaseName() === "types.ts")
	.filter((sf) => !SCOPE_DIR || sf.getFilePath().startsWith(`${SCOPE_DIR}/`))

let narrowed = 0
for (const typesFile of allTypesFilesInScope) {
	const typesDir = dirOf(typesFile)
	// Re-fetch each time since earlier narrowing in this same loop can
	// change what's currently declared here.
	for (const decl of [
		...typesFile.getInterfaces(),
		...typesFile.getTypeAliases(),
		...typesFile.getEnums(),
	]) {
		if (!decl.isExported()) continue
		const name = decl.getName()
		const nameNode = decl.getNameNode()

		const refs = nameNode
			.findReferencesAsNodes()
			.filter((r) => r !== nameNode)
			.filter((r) => {
				const p = r.getParent()
				return !Node.isImportSpecifier(p) && !Node.isExportSpecifier(p)
			})
		if (refs.length === 0) continue // unused — not this pass's job to prune

		const consumerDirs = new Set(refs.map((r) => dirOf(r.getSourceFile())))
		const lcaDir = commonAncestorDir(consumerDirs)

		if (lcaDir === typesDir) continue // already at the right level

		const withinScope = !SCOPE_DIR || lcaDir === SCOPE_DIR || lcaDir.startsWith(`${SCOPE_DIR}/`)
		if (!withinScope) {
			console.log(
				`[kept] ${name}: a consumer sits outside ${path.relative(SRC_ROOT, SCOPE_DIR).replace(/\\/g, "/")} (out of --dir scope — needs a human call)`,
			)
			continue
		}

		const targetTypesPath = `${lcaDir}/types.ts`
		const targetTypesFile =
			project.getSourceFile(targetTypesPath) ??
			project.createSourceFile(targetTypesPath, "", { overwrite: false })
		if (targetTypesFile === typesFile) continue

		if (
			targetTypesFile
				.getInterfaces()
				.concat(targetTypesFile.getTypeAliases())
				.concat(targetTypesFile.getEnums())
				.some((d) => d.getName() === name)
		) {
			console.log(`[kept] ${name}: collides with an existing '${name}' in ${path.relative(SRC_ROOT, targetTypesPath).replace(/\\/g, "/")}`)
			continue
		}

		const { unsafe: depUnsafe, refs: depRefs } = analyzeDeclarationDependencies(decl)
		if (depUnsafe) {
			console.log(`[kept] ${name}: ${depUnsafe} — needs a human call`)
			continue
		}

		console.log(
			`${CHECK_ONLY ? "[dry-run narrow] " : "[narrow] "}${name}: ${path.relative(SRC_ROOT, typesFile.getFilePath()).replace(/\\/g, "/")} -> ${path.relative(SRC_ROOT, targetTypesPath).replace(/\\/g, "/")}`,
		)
		narrowed++
		if (CHECK_ONLY) continue
		touchedFiles.add(typesFile.getFilePath())
		touchedFiles.add(targetTypesFile.getFilePath())

		const text = decl.getText()
		const exportedText = text.startsWith("export ") ? text : `export ${text}`
		targetTypesFile.addStatements(`\n${exportedText}\n`)
		decl.remove()
		importRefsInto(targetTypesFile, depRefs)

		// If the file the type moved FROM still references it elsewhere in
		// its own remaining content (common when moving up: a sibling type
		// left behind still uses it), import it back.
		if (new RegExp(`\\b${name}\\b`).test(typesFile.getFullText())) {
			const backImportSpecifier = (() => {
				const rel = path
					.relative(typesDir, targetTypesPath)
					.replace(/\\/g, "/")
					.replace(/\.ts$/, "")
				return rel.startsWith(".") ? rel : `./${rel}`
			})()
			const existingBackImport = typesFile
				.getImportDeclarations()
				.find((imp) => imp.getModuleSpecifierValue() === backImportSpecifier)
			if (existingBackImport) {
				if (!existingBackImport.getNamedImports().some((n) => n.getName() === name)) {
					existingBackImport.addNamedImport(
						existingBackImport.isTypeOnly() ? { name } : { name, isTypeOnly: true },
					)
				}
			} else {
				typesFile.addImportDeclaration({
					moduleSpecifier: backImportSpecifier,
					namedImports: [{ name }],
					isTypeOnly: true,
				})
			}
		}

		// Rewrite every consumer's import to the new module.
		for (const r of refs) {
			const consumer = r.getSourceFile()
			touchedFiles.add(consumer.getFilePath())
			for (const imp of consumer.getImportDeclarations()) {
				const named = imp.getNamedImports().find((n) => n.getName() === name)
				if (!named) continue
				if (imp.getModuleSpecifierSourceFile() !== typesFile) continue

				const newImportSpecifier = (() => {
					const rel = path
						.relative(path.dirname(consumer.getFilePath()), targetTypesPath)
						.replace(/\\/g, "/")
						.replace(/\.ts$/, "")
					return rel.startsWith(".") ? rel : `./${rel}`
				})()

				named.remove()
				if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) {
					imp.remove()
				}

				const targetImport = consumer
					.getImportDeclarations()
					.find((i) => i.getModuleSpecifierValue() === newImportSpecifier)
				if (targetImport) {
					if (!targetImport.getNamedImports().some((n) => n.getName() === name)) {
						targetImport.addNamedImport(
							targetImport.isTypeOnly() ? { name } : { name, isTypeOnly: true },
						)
					}
				} else {
					consumer.addImportDeclaration({
						moduleSpecifier: newImportSpecifier,
						namedImports: [{ name }],
						isTypeOnly: true,
					})
				}
			}
		}
	}
}

console.log(`${CHECK_ONLY ? "Would narrow" : "Narrowed"} ${narrowed} declaration(s) to a more specific types.ts.`)

// --- Step 4: remove pass-through barrels -----------------------------------
// Finds index.ts files that are pure pass-through barrels — every top-level
// statement is `export {...} from "./x"` / `export type {...} from "./x"`,
// nothing declared locally — per AGENTS.md rule 36: "The barrel is the
// entry point, not a pass-through... A file that's only `export { X } from
// './a'` lines is the smell." Rewrites every consumer's import to point
// directly at the concrete source module, then deletes the barrel.
const indexFilesInScope = project
	.getSourceFiles()
	.filter((sf) => sf.getBaseName() === "index.ts")
	.filter((sf) => !SCOPE_DIR || sf.getFilePath().startsWith(`${SCOPE_DIR}/`))

const barrels = []
for (const sf of indexFilesInScope) {
	const statements = sf.getStatements()
	if (statements.length === 0) continue
	const exportDecls = sf.getExportDeclarations()
	const isPureBarrel =
		statements.length === exportDecls.length &&
		exportDecls.every((d) => d.getModuleSpecifierValue() !== undefined) &&
		exportDecls.every((d) => !d.isNamespaceExport()) // `export * from` needs a human call — unknown name set, riskier rewrite
	if (isPureBarrel) barrels.push(sf)
}

console.log(
	`\n${CHECK_ONLY ? "[dry-run] " : ""}${barrels.length} pass-through barrel(s) found${barrels.length > 0 ? ":" : "."}`,
)
for (const b of barrels) console.log(`  ${path.relative(SRC_ROOT, b.getFilePath()).replace(/\\/g, "/")}`)

let totalConsumerEdits = 0
let totalConsumerFiles = 0

for (const barrel of barrels) {
	const nameToSource = new Map()
	for (const exp of barrel.getExportDeclarations()) {
		const exportedSourceFile = exp.getModuleSpecifierSourceFile()
		if (!exportedSourceFile) continue
		for (const named of exp.getNamedExports()) {
			nameToSource.set(named.getAliasNode()?.getText() ?? named.getName(), exportedSourceFile)
		}
	}

	const affectedConsumers = new Set()
	let editsForThisBarrel = 0

	for (const consumer of project.getSourceFiles()) {
		if (consumer === barrel) continue
		for (const imp of [...consumer.getImportDeclarations()]) {
			const specifier = imp.getModuleSpecifierValue()
			if (imp.getModuleSpecifierSourceFile() !== barrel) continue

			for (const named of imp.getNamedImports()) {
				const importedName = named.getName()
				const targetSourceFile = nameToSource.get(importedName)
				if (!targetSourceFile) {
					console.log(
						`  [flagged] ${path.relative(SRC_ROOT, consumer.getFilePath()).replace(/\\/g, "/")}: imports '${importedName}' from the barrel, but no matching re-export was found — leaving untouched`,
					)
					continue
				}

				affectedConsumers.add(consumer)
				editsForThisBarrel++
				if (CHECK_ONLY) continue

				touchedFiles.add(consumer.getFilePath())
				const newSpecifier = specifier.startsWith(".")
					? relativeSpecifier(consumer.getFilePath(), targetSourceFile.getFilePath())
					: toModuleSpecifier(targetSourceFile.getFilePath())

				named.remove()
				if (
					imp.getNamedImports().length === 0 &&
					!imp.getDefaultImport() &&
					!imp.getNamespaceImport()
				) {
					imp.remove()
				}

				const targetImport = consumer
					.getImportDeclarations()
					.find((i) => i.getModuleSpecifierValue() === newSpecifier)
				if (targetImport) {
					if (!targetImport.getNamedImports().some((n) => n.getName() === importedName)) {
						targetImport.addNamedImport(
							imp.isTypeOnly() && !targetImport.isTypeOnly()
								? { name: importedName, isTypeOnly: true }
								: { name: importedName },
						)
					}
				} else {
					consumer.addImportDeclaration({
						moduleSpecifier: newSpecifier,
						namedImports: [{ name: importedName }],
						isTypeOnly: imp.isTypeOnly(),
					})
				}
			}
		}
	}

	console.log(
		`  ${path.relative(SRC_ROOT, barrel.getFilePath()).replace(/\\/g, "/")}: ${editsForThisBarrel} import(s) across ${affectedConsumers.size} consumer file(s)`,
	)
	totalConsumerEdits += editsForThisBarrel
	totalConsumerFiles += affectedConsumers.size

	if (!CHECK_ONLY) {
		touchedFiles.add(barrel.getFilePath())
		barrel.delete()
	}
}

console.log(
	`${CHECK_ONLY ? "Would rewrite" : "Rewrote"} ${totalConsumerEdits} import(s) across ${totalConsumerFiles} consumer file(s), ${CHECK_ONLY ? "would remove" : "removed"} ${barrels.length} barrel(s).`,
)

if (!CHECK_ONLY) await project.save()

if (touchedFiles.size > 0) {
	const { execFileSync } = await import("node:child_process")
	execFileSync("npx", ["biome", "format", "--write", ...touchedFiles], {
		stdio: "inherit",
		shell: true,
	})
}

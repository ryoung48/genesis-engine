// Multi-step pass at getting files, namespace members, types, and barrels
// to the right place, per AGENTS.md rules 36/39.
//
// Step 0: removes pure pass-through barrel index.ts files (every statement
// is `export {...} from "./x"`, nothing declared locally) and rewrites
// every consumer's import to the concrete source module directly. Runs
// first so later steps reason about real module structure, not an
// indirection layer that's about to disappear anyway.
//
// Step 1: moves every top-level flat file in --dir (skipping index.ts and
// types.ts) into its own `<name>/index.ts` submodule folder — a pure file
// move, no splitting. Never requires fixing a consumer: a folder's
// index.ts resolves at exactly the same import specifier the flat file it
// replaces did.
//
// Step 2: wraps a submodule's bare-exported values into
// `export const NAME = { a, b, fn1 }` when the file has no namespace object
// at all (AGENTS.md rule 32). Rewrites every consumer accordingly. Classes
// are the one exception and stay bare-exported; any capitalized name being
// folded in gets camelCased.
//
// Step 3 (namespace-member LCA, narrowing only): for each exported
// UPPERCASE namespace object, relocates a member function down into the
// lowest common ancestor directory of everyone who actually calls
// `NAMESPACE.member(...)` — only when that LCA is a descendant of the
// member's current directory. Never broader/up to a shared ancestor, never
// sideways to an unrelated branch — moving anywhere but down isn't this
// pass's job. Never fabricates a new submodule: the target directory must
// already have an index.ts, or one is created alongside it. Never crosses
// outside --dir either — a consumer outside scope is a hard boundary; the
// member is left in place and reported.
//
// Step 4: moves interface/type-alias/enum declarations out of non-types.ts
// files and into their domain's sibling types.ts ("types.ts = shape,
// index.ts = behavior"). Only operates in directories that already have a
// types.ts, or a types.ts is created alongside — see step 4's own comment.
// Skips (flags, doesn't move) a declaration when:
//   - its name already exists in the target types.ts (collision)
//   - two different sibling files both declare the same name (ambiguous)
//   - its body references something that isn't safely importable and
//     isn't co-moving in the same batch — a third-party type, a
//     non-exported type, or a `typeof someRuntimeValue` query — same
//     failure mode as fix-max-params.mjs's original bug, just for
//     whole-declaration moves instead of reconstructed param types
//   - it's a class (classes aren't "shape"; AGENTS.md avoids them anyway)
//
// Step 5 (types LCA pass): once types live in a types.ts, relocates each
// one to the lowest common ancestor directory of everyone who actually
// consumes it — but only ever narrower, down into a submodule's own
// types.ts. Never broader/up to a shared parent, even when that's where
// the LCA actually lands — moving up isn't this pass's job. Also stays
// within --dir: a consumer outside --dir is a hard boundary, and the type
// is left in place and reported, not moved. Same dependency-safety check
// as Step 4 applies to every narrowing move.
//
// Step 6 (max-params auto-fix): folded in from the standalone
// fix-max-params.mjs. Bundles a function's params into a single object
// param, per AGENTS.md's "functions take at most one parameter" rule —
// hardcoded max of 1 everywhere, no directory-specific exception. Flags
// rather than touches: default-valued/rest/generic params, overloads,
// class/object methods, a function referenced as a value anywhere (not
// just called directly), a param type that isn't safely relocatable into
// types.ts, or a generated `${Name}Params` interface name that would
// collide with another function's.
//
// Usage:
//   node scripts/fix-types-outside-types-file.mjs [--dir=src/model/society]  # apply
//   node scripts/fix-types-outside-types-file.mjs --check [--dir=...]         # dry run
import path from "node:path"
import { existsSync } from "node:fs"
import { Node, Project, SyntaxKind } from "ts-morph"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src")
const CHECK_ONLY = process.argv.includes("--check")
const dirArg = process.argv.find((a) => a.startsWith("--dir="))
// ts-morph always returns forward-slash paths (even on Windows), so
// normalize this the same way before comparing against them.
const SCOPE_DIR = dirArg
	? path.resolve(import.meta.dirname, "..", dirArg.slice(6)).replace(/\\/g, "/")
	: null
const stepArg = process.argv.find((a) => a.startsWith("--step="))
// Which single step to run, or null to run the whole pipeline (0-6).
const ONLY_STEP = stepArg ? Number(stepArg.slice(7)) : null
function runsStep(n) {
	return ONLY_STEP === null || ONLY_STEP === n
}

function loadProject() {
	const p = new Project({
		tsConfigFilePath: path.resolve(import.meta.dirname, "..", "tsconfig.app.json"),
	})
	p.addSourceFilesAtPaths(path.join(SRC_ROOT, "**/*.{ts,tsx}"))
	return p
}
let project = loadProject()

function toModuleSpecifier(file) {
	const rel = path
		.relative(SRC_ROOT, file)
		.replace(/\\/g, "/")
		.replace(/\.tsx?$/, "")
		.replace(/\/index$/, "") // a folder's own barrel resolves the same without it
	return `@/${rel}`
}

function relativeSpecifier(fromFilePath, toFilePath) {
	const rel = path
		.relative(path.dirname(fromFilePath), toFilePath)
		.replace(/\\/g, "/")
		.replace(/\.tsx?$/, "")
	return rel.startsWith(".") ? rel : `./${rel}`
}

// Test files (`*.test.ts`, `*.smoke.test.ts`, ...) aren't domain modules —
// flattening one into its own submodule, wrapping its exports into a
// namespace, extracting its types, or bundling its params is never correct,
// regardless of --dir scope.
function isTestFile(filePath) {
	return /\.test\.tsx?$/.test(filePath)
}

function inScope(filePath) {
	if (isTestFile(filePath)) return false
	return !SCOPE_DIR || filePath === SCOPE_DIR || filePath.startsWith(`${SCOPE_DIR}/`)
}

// Every file this run actually writes to — formatted with Biome at the end.
const touchedFiles = new Set()
// Accumulates touchedFiles across every mid-pipeline flush (see `flush`),
// since Biome formatting only actually runs once, at the very end.
const allTouchedFilesEver = new Set()

// TS/lib globals safe to reference from anywhere without an import.
const BUILTIN_NAMES = new Set([
	"Array", "ReadonlyArray", "Promise", "Record", "Partial", "Required",
	"Readonly", "Pick", "Omit", "Exclude", "Extract", "ReturnType",
	"Parameters", "InstanceType", "Map", "ReadonlyMap", "Set", "ReadonlySet",
	"Date", "RegExp", "Error", "Function", "Iterable", "IterableIterator",
	"Generator", "PromiseLike", "WeakMap", "WeakSet", "ArrayBuffer", "ArrayBufferLike", "ArrayLike",
	"Uint8Array", "Uint16Array", "Uint32Array", "Int8Array", "Int16Array",
	"Int32Array", "Float32Array", "Float64Array", "Math", "JSON", "console",
	"number", "string", "boolean", "void", "null", "undefined", "any",
	"unknown", "never", "object", "bigint", "symbol", "Infinity", "NaN",
])

// True if `decl` is itself a function, or a variable declaration whose
// initializer is one (`const fn = () => {...}` / `function fn() {...}`).
function declIsFunctionValued(decl) {
	if (Node.isFunctionDeclaration(decl)) return true
	if (Node.isVariableDeclaration(decl)) {
		const init = decl.getInitializer()
		return Node.isArrowFunction(init) || Node.isFunctionExpression(init)
	}
	return false
}

function isFunctionValued(prop) {
	if (Node.isMethodDeclaration(prop)) return true
	if (Node.isShorthandPropertyAssignment(prop)) {
		const decl = prop.getNameNode().getDefinitionNodes()[0]
		return declIsFunctionValued(decl)
	}
	if (Node.isPropertyAssignment(prop)) {
		const init = prop.getInitializer()
		if (!init) return false
		if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) return true
		if (Node.isIdentifier(init)) {
			const decl = init.getSymbol()?.getValueDeclaration()
			return declIsFunctionValued(decl)
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
	const valueRefs = []
	const seen = new Set()
	// getDescendantsOfKind only returns descendants, not the node itself —
	// fine for a whole interface/type-alias/enum (never itself a
	// TypeReference), but Step 6 also calls this on a bare param type node,
	// which can BE a TypeReference directly (`cluster: Cluster`) with no
	// TypeReference descendants of its own to find.
	const typeReferences =
		decl.getKind?.() === SyntaxKind.TypeReference
			? [decl, ...decl.getDescendantsOfKind(SyntaxKind.TypeReference)]
			: decl.getDescendantsOfKind(SyntaxKind.TypeReference)
	for (const ref of typeReferences) {
		const nameNode = ref.getTypeName()
		const leftmost = Node.isQualifiedName(nameNode)
			? (() => {
					let n = nameNode
					while (Node.isQualifiedName(n)) n = n.getLeft()
					return n
				})()
			: nameNode
		const name = leftmost.getText()
		// `decl` is usually an interface/type-alias/enum (has .getName()), but
		// Step 6 also calls this on a bare parameter type node, which doesn't
		// — self-reference only applies to the named-declaration case.
		if (typeof decl.getName === "function" && name === decl.getName()) continue
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

	// A computed property key like `[PhonemeCatalog.MIDDLE_CONSONANT]: string`
	// isn't a TypeReference — it's a runtime value expression (an enum
	// member access) used in key position. Its own name (`PhonemeCatalog`)
	// still has to be imported into wherever this declaration lands, as a
	// real (non-type-only) import.
	const seenValues = new Set()
	for (const key of decl.getDescendantsOfKind(SyntaxKind.ComputedPropertyName)) {
		const expr = key.getExpression()
		const leftmost = Node.isPropertyAccessExpression(expr)
			? (() => {
					let n = expr
					while (Node.isPropertyAccessExpression(n)) n = n.getExpression()
					return n
				})()
			: expr
		if (!Node.isIdentifier(leftmost)) continue
		const name = leftmost.getText()
		if (BUILTIN_NAMES.has(name) || siblingNamesBeingMoved.has(name) || seenValues.has(name)) continue

		let symbol = leftmost.getSymbol()
		if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol()
		const d = symbol?.getDeclarations()?.[0]
		if (!d) continue

		const declSourceFile = d.getSourceFile()
		if (declSourceFile.getFilePath().includes("node_modules")) {
			return { unsafe: `references a third-party symbol '${name}'`, refs: [] }
		}
		const isExported = typeof d.isExported === "function" ? d.isExported() : false
		if (!isExported) {
			return {
				unsafe: `references a non-exported symbol '${name}' (declared in ${path.relative(SRC_ROOT, declSourceFile.getFilePath()).replace(/\\/g, "/")})`,
				refs: [],
			}
		}
		seenValues.add(name)
		valueRefs.push({ name, declFile: declSourceFile })
	}

	return { unsafe: null, refs, valueRefs }
}

// Imports every {name, declSourceFile} ref into targetFile, merging into an
// existing import from the same module if one's already there.
function importRefsInto(targetFile, refs) {
	for (const { name, declSourceFile } of refs) {
		if (declSourceFile === targetFile) continue
		const specifier = relativeSpecifier(targetFile.getFilePath(), declSourceFile.getFilePath())
		// Match by resolved file, not specifier text — an existing import
		// of the same file might use a `@/` alias while this computes a
		// relative path; string-comparing specifiers would miss that and
		// add a second, colliding import declaration for the same file.
		const existing = targetFile
			.getImportDeclarations()
			.find((imp) => imp.getModuleSpecifierSourceFile() === declSourceFile)
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

// Same as importRefsInto, but for value refs ({name, declFile} — the shape
// analyzeFunctionBody returns) rather than types: never type-only.
function importValueRefsInto(targetFile, refs) {
	for (const { name, declFile } of refs) {
		if (declFile === targetFile) continue
		const specifier = relativeSpecifier(targetFile.getFilePath(), declFile.getFilePath())
		// Match by resolved file, not specifier text — see importRefsInto.
		const existing = targetFile
			.getImportDeclarations()
			.find((imp) => imp.getModuleSpecifierSourceFile() === declFile && !imp.isTypeOnly())
		if (existing) {
			if (!existing.getNamedImports().some((n) => n.getName() === name)) {
				existing.addNamedImport({ name })
			}
		} else {
			targetFile.addImportDeclaration({
				moduleSpecifier: specifier,
				namedImports: [{ name }],
			})
		}
	}
}

// Same job as calling importValueRefsInto once per targetFile in a loop,
// but resolves every entry's existing-import status first (across every
// targetFile), then applies every mutation last. Calling importValueRefsInto
// per targetFile in a loop — resolve, mutate, resolve, mutate, ... across
// dozens of consumer files — forces a full-program rebuild on nearly every
// call, the same interleaving problem as everywhere else in this file.
// `entries`: [{ targetFile, name, declFile, isTypeOnly? }]. `isTypeOnly`
// (default false) matches importRefsInto (any existing declaration,
// type-only or not, can host it) vs importValueRefsInto (only a
// non-type-only declaration can).
function applyImportsBatched(entries) {
	const resolved = entries
		.filter(({ targetFile, declFile }) => declFile !== targetFile)
		.map((e) => ({
			...e,
			existing: e.targetFile
				.getImportDeclarations()
				.find((imp) => imp.getModuleSpecifierSourceFile() === e.declFile && (e.isTypeOnly || !imp.isTypeOnly())),
		}))

	// Two entries for the same (targetFile, declFile) pair with no existing
	// import yet must share the ONE newly-created declaration, not each
	// create their own — this tracks what's been created so far in the
	// mutate pass below (the resolve pass above ran before any of them
	// existed, so it can't have found any of these).
	const created = new Map() // targetFile -> Map<declFile, importDecl>
	for (const { targetFile, name, declFile, existing, isTypeOnly } of resolved) {
		let target = existing ?? created.get(targetFile)?.get(declFile)
		if (target) {
			if (!target.getNamedImports().some((n) => n.getName() === name)) {
				target.addNamedImport(isTypeOnly && !target.isTypeOnly() ? { name, isTypeOnly: true } : { name })
			}
		} else {
			const specifier = relativeSpecifier(targetFile.getFilePath(), declFile.getFilePath())
			const newDecl = targetFile.addImportDeclaration({
				moduleSpecifier: specifier,
				namedImports: [{ name }],
				isTypeOnly: !!isTypeOnly,
			})
			if (!created.has(targetFile)) created.set(targetFile, new Map())
			created.get(targetFile).set(declFile, newDecl)
		}
	}
}

// --- Step 0: remove pass-through barrels -----------------------------------
if (runsStep(0)) {
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
		`${CHECK_ONLY ? "[dry-run] " : ""}${barrels.length} pass-through barrel(s) found${barrels.length > 0 ? ":" : "."}`,
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

		// Two passes, not one interleaved loop: `getModuleSpecifierSourceFile()`
		// needs an up-to-date `ts.Program` to resolve against, and every
		// mutation below (`named.remove()`, `addNamedImport()`, ...)
		// invalidates it. This resolve runs once per import declaration
		// project-wide (thousands of calls) — interleaving it with mutations
		// forced a full-program rebuild on nearly every one. Resolving every
		// barrel-importing declaration first, across the whole project, then
		// applying every mutation last with no further resolution in
		// between, needs at most a couple of rebuilds total instead of one
		// per import.
		const toRewrite = []
		for (const consumer of project.getSourceFiles()) {
			if (consumer === barrel) continue
			for (const imp of consumer.getImportDeclarations()) {
				if (imp.getModuleSpecifierSourceFile() !== barrel) continue
				toRewrite.push({ consumer, imp, specifier: imp.getModuleSpecifierValue(), impWasTypeOnly: imp.isTypeOnly() })
			}
		}

		for (const { consumer, imp, specifier, impWasTypeOnly } of toRewrite) {
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
				// imp itself may get deleted by the check below (once its
				// named imports are all gone) — impWasTypeOnly was cached
				// before any of this ran, since calling imp.isTypeOnly()
				// after imp.remove() throws (node already forgotten).
				if (
					imp.getNamedImports().length === 0 &&
					!imp.getDefaultImport() &&
					!imp.getNamespaceImport()
				) {
					imp.remove()
				}

				// A whole `import type {...}` declaration can't host a value
				// import no matter what per-specifier modifier we add — merging
				// a value into one would silently make it type-only. A
				// value-level declaration, on the other hand, can host either
				// (per-specifier `type` modifier), so only reject the merge
				// when we need a value and the target is a type-only declaration.
				const targetImport = consumer
					.getImportDeclarations()
					.find(
						(i) =>
							i.getModuleSpecifierValue() === newSpecifier &&
							(impWasTypeOnly || !i.isTypeOnly()),
					)
				if (targetImport) {
					if (!targetImport.getNamedImports().some((n) => n.getName() === importedName)) {
						targetImport.addNamedImport(
							impWasTypeOnly && !targetImport.isTypeOnly()
								? { name: importedName, isTypeOnly: true }
								: { name: importedName },
						)
					}
				} else {
					consumer.addImportDeclaration({
						moduleSpecifier: newSpecifier,
						namedImports: [{ name: importedName }],
						isTypeOnly: impWasTypeOnly,
					})
				}
			}
		}

		console.log(
			`  ${path.relative(SRC_ROOT, barrel.getFilePath()).replace(/\\/g, "/")}: ${editsForThisBarrel} import(s) across ${affectedConsumers.size} consumer file(s)`,
		)
		totalConsumerEdits += editsForThisBarrel
		totalConsumerFiles += affectedConsumers.size

		if (!CHECK_ONLY) barrel.delete() // deleted, not "touched" — don't try to format a gone file
	}

	console.log(
		`${CHECK_ONLY ? "Would rewrite" : "Rewrote"} ${totalConsumerEdits} import(s) across ${totalConsumerFiles} consumer file(s), ${CHECK_ONLY ? "would remove" : "removed"} ${barrels.length} barrel(s).\n`,
	)

	// A single `export {...} from "./x"` statement mixed into an otherwise
	// real file is the same "pass-through, not an entry point" problem as a
	// whole barrel — just one statement instead of a whole file. Left in
	// place, it's fragile in a different way than a whole barrel: nothing
	// in this pipeline treats a re-export's module specifier as sensitive
	// to a later move (Step 1 flattening the file one directory deeper,
	// Step 4/5 relocating the thing it points at) the way an import
	// specifier is, so it silently goes stale. Removing it now and
	// redirecting every consumer straight to the real source — before
	// anything else gets a chance to move — sidesteps that class of bug
	// entirely instead of chasing it through every later step.
	const strayReExports = []
	for (const sf of project.getSourceFiles()) {
		if (!inScope(sf.getFilePath())) continue
		if (barrels.includes(sf)) continue // already handled above
		for (const exp of sf.getExportDeclarations()) {
			if (exp.getModuleSpecifierValue() === undefined) continue
			if (exp.isNamespaceExport()) continue // `export * from` — needs a human call
			strayReExports.push({ sourceFile: sf, exportDecl: exp })
		}
	}

	console.log(
		`${CHECK_ONLY ? "[dry-run] " : ""}${strayReExports.length} stray re-export statement(s) found${strayReExports.length > 0 ? ":" : "."}`,
	)
	for (const { sourceFile, exportDecl } of strayReExports) {
		console.log(`  ${path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")}: ${exportDecl.getText()}`)
	}

	let strayEdits = 0
	let strayConsumerFiles = new Set()
	for (const { sourceFile, exportDecl } of strayReExports) {
		const nameToSource = new Map()
		const targetSourceFile = exportDecl.getModuleSpecifierSourceFile()
		if (!targetSourceFile) continue
		for (const named of exportDecl.getNamedExports()) {
			nameToSource.set(named.getAliasNode()?.getText() ?? named.getName(), targetSourceFile)
		}

		const toRewrite = []
		for (const consumer of project.getSourceFiles()) {
			if (consumer === sourceFile) continue
			for (const imp of consumer.getImportDeclarations()) {
				if (imp.getModuleSpecifierSourceFile() !== sourceFile) continue
				toRewrite.push({ consumer, imp, specifier: imp.getModuleSpecifierValue(), impWasTypeOnly: imp.isTypeOnly() })
			}
		}

		if (CHECK_ONLY) {
			strayEdits += toRewrite.reduce(
				(n, { imp }) => n + imp.getNamedImports().filter((named) => nameToSource.has(named.getName())).length,
				0,
			)
			continue
		}

		for (const { consumer, imp, specifier, impWasTypeOnly } of toRewrite) {
			for (const named of imp.getNamedImports()) {
				const importedName = named.getName()
				const namedTargetFile = nameToSource.get(importedName)
				if (!namedTargetFile) continue // not one of this re-export's names

				strayConsumerFiles.add(consumer)
				strayEdits++
				touchedFiles.add(consumer.getFilePath())
				const newSpecifier = specifier.startsWith(".")
					? relativeSpecifier(consumer.getFilePath(), namedTargetFile.getFilePath())
					: toModuleSpecifier(namedTargetFile.getFilePath())

				named.remove()
				if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) {
					imp.remove()
				}

				const targetImport = consumer
					.getImportDeclarations()
					.find((i) => i.getModuleSpecifierValue() === newSpecifier && (impWasTypeOnly || !i.isTypeOnly()))
				if (targetImport) {
					if (!targetImport.getNamedImports().some((n) => n.getName() === importedName)) {
						targetImport.addNamedImport(
							impWasTypeOnly && !targetImport.isTypeOnly()
								? { name: importedName, isTypeOnly: true }
								: { name: importedName },
						)
					}
				} else {
					consumer.addImportDeclaration({
						moduleSpecifier: newSpecifier,
						namedImports: [{ name: importedName }],
						isTypeOnly: impWasTypeOnly,
					})
				}
			}
		}

		touchedFiles.add(sourceFile.getFilePath())
		exportDecl.remove()
	}

	console.log(
		`${CHECK_ONLY ? "Would rewrite" : "Rewrote"} ${strayEdits} import(s) across ${CHECK_ONLY ? "some" : strayConsumerFiles.size} consumer file(s), ${CHECK_ONLY ? "would remove" : "removed"} ${strayReExports.length} stray re-export(s).\n`,
	)
}

// Running the whole pipeline in one process: Step 0 deletes whole files
// (barrels), and later steps in this same process need a real disk
// round-trip before they can see that correctly — see `flush`'s own
// comment, defined further below, for why.
if (ONLY_STEP === null) await flush(true)

// --- Step 1: flatten loose files into submodules ----------------------------
function adjustSpecifierDepth(specifier) {
	if (!specifier.startsWith(".")) return specifier
	return specifier === ".." || specifier.startsWith("../")
		? `../${specifier}`
		: `..${specifier.slice(1)}` // "./x" -> "../x"
}

if (runsStep(1)) {
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

		// Check for the actual index file, not just directory existence —
		// an empty leftover directory (e.g. from a prior run that got
		// reverted without `git clean`, or one Step 4/5 created for a new
		// types.ts) would otherwise look like "already a submodule" and
		// silently block flattening forever, even though there's nothing
		// there.
		if (existsSync(newIndexPath)) continue // already a submodule — nothing to flatten

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

	for (const p of movedIndexPaths) touchedFiles.add(p)

	console.log(
		`${CHECK_ONLY ? "Would flatten" : "Flattened"} ${CHECK_ONLY ? flatCandidates.filter((sf) => !existsSync(`${path.dirname(sf.getFilePath())}/${sf.getBaseNameWithoutExtension()}/index${sf.getExtension()}`)).length : movedIndexPaths.length} file(s) into submodules.\n`,
	)
}

// Step 1 also deletes whole files (the old flat file, once its content has
// moved into the new submodule's index.ts) — same reload requirement as
// after Step 0.
if (ONLY_STEP === null) await flush(true)

// --- Step 2: wrap bare exports into namespace objects -----------------------
// AGENTS.md rule 32: "One UPPERCASE namespace object per domain ... not free
// functions." A submodule's index.ts (Step 1's output, or any pre-existing
// one) with bare exports and no namespace object at all gets wrapped into
// `export const NAME = { a, b, fn1 }`, its members made private, and every
// consumer rewritten from `import { fn1 } from "..."` + `fn1(...)` to
// `import { NAME } from "..."` + `NAME.fn1(...)`. Classes are the one
// exception and stay bare-exported.
// Namespace members read as camelCase methods (`NAMESPACE.doThing()`), not
// SCREAMING_SNAKE_CASE or PascalCase — folding a capitalized export in
// renames it to match, project-wide (every reference, not just the
// declaration).
function toCamelCase(name) {
	if (!/[A-Z]/.test(name)) return name
	if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
		// SCREAMING_SNAKE_CASE (or a single ALL-CAPS word like `SCRIPT`).
		return name.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
	}
	// PascalCase.
	return name.charAt(0).toLowerCase() + name.slice(1)
}

function findNamespaceObjectInFile(sf, expectedName) {
	for (const stmt of sf.getVariableStatements()) {
		if (!stmt.hasExportKeyword()) continue
		for (const decl of stmt.getDeclarations()) {
			const name = decl.getName()
			if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue
			const init = decl.getInitializer()
			if (!init || !Node.isObjectLiteralExpression(init)) continue
			const properties = init.getProperties()
			if (properties.length === 0) continue
			// A real namespace either (a) is literally named after this
			// file's directory — the AGENTS.md rule 32 convention — or (b)
			// already skews toward functions, the same signal Step 1/3
			// use. Name alone isn't enough on its own: this codebase has
			// domains where the namespace name doesn't match its (often
			// pluralized) folder, e.g. `LANGUAGE` living in `languages/`,
			// `CLUSTER` in `clusters/` — those only pass via the ratio
			// check. Ratio alone isn't enough either: a namespace that's
			// gone fully data-only after Step 2 (e.g. `ERAS`, all data, 0
			// functions) needs the name match so a rerun still recognizes
			// it, rather than mistaking a random data lookup table
			// (`GOVERNMENT_TYPE_LABELS`) sitting in the same file for it.
			const functionCount = properties.filter((p) => isFunctionValued(p)).length
			const isNamespace = name === expectedName || functionCount / properties.length > 0.5
			if (isNamespace) return { name, objectLiteral: init }
		}
	}
	return null
}

if (runsStep(2)) {
	const candidates = []
	for (const sf of project.getSourceFiles()) {
		if (!inScope(sf.getFilePath())) continue
		if (sf.getBaseName() !== "index.ts" && sf.getBaseName() !== "index.tsx") continue

		const expectedNamespaceName = path
			.basename(dirOf(sf))
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "_")
		const existingNamespace = findNamespaceObjectInFile(sf, expectedNamespaceName)
		const existingMemberNames = existingNamespace
			? new Set(
					existingNamespace.objectLiteral
						.getProperties()
						.map((p) => (Node.isShorthandPropertyAssignment(p) ? p.getName() : null))
						.filter(Boolean),
				)
			: new Set()

		/** @type {{ name: string, declNode: any, unexport: () => void }[]} */
		const bareFns = []

		for (const stmt of sf.getVariableStatements()) {
			if (!stmt.hasExportKeyword()) continue
			for (const decl of stmt.getDeclarations()) {
				const name = decl.getName()
				const init = decl.getInitializer()
				if (existingMemberNames.has(name)) continue
				if (existingNamespace && name === existingNamespace.name) continue // the namespace itself
				if (init && Node.isClassExpression(init)) continue // classes are the one exception
				// A vestigial empty placeholder sitting under the name this
				// namespace would take (e.g. `export const NAMES = {}`) is
				// debris to be cleared out below, not a candidate to fold
				// in — folding it in here would rename/mutate the exact
				// node the cleanup pass is about to remove out from under it.
				if (
					!existingNamespace &&
					name === expectedNamespaceName &&
					init &&
					Node.isObjectLiteralExpression(init) &&
					init.getProperties().length === 0
				)
					continue
				// setIsExported() lives on the statement, not the
				// declaration — only safe to toggle when this is the
				// statement's sole declarator (the common
				// `export const x = ...` shape everywhere in this
				// codebase); a multi-declarator statement would wrongly
				// un-export its siblings too.
				if (stmt.getDeclarations().length !== 1) continue
				bareFns.push({ name, declNode: decl, unexport: () => stmt.setIsExported(false) })
			}
		}
		for (const fn of sf.getFunctions()) {
			if (fn.hasExportKeyword() && fn.getName() && !existingMemberNames.has(fn.getName()))
				bareFns.push({ name: fn.getName(), declNode: fn, unexport: () => fn.setIsExported(false) })
		}
		// Third shape: a standalone `export { name }` (no module specifier)
		// re-exporting an already-declared local value that was never
		// inline-exported itself. Classes are still the one exception.
		for (const exportDecl of sf.getExportDeclarations()) {
			if (exportDecl.getModuleSpecifierValue() !== undefined) continue // a re-export from elsewhere, not this
			for (const spec of exportDecl.getNamedExports()) {
				const specName = spec.getAliasNode()?.getText() ?? spec.getName()
				if (existingMemberNames.has(specName)) continue
				const decl = spec.getLocalTargetDeclarations()[0]
				if (!decl || !(Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl))) continue
				bareFns.push({
					name: specName,
					declNode: decl,
					unexport: () => {
						spec.remove()
						if (
							exportDecl.getNamedExports().length === 0 &&
							!exportDecl.isNamespaceExport() &&
							!exportDecl.wasForgotten()
						)
							exportDecl.remove()
					},
				})
			}
		}

		if (bareFns.length === 0) continue
		candidates.push({ sf, bareFns, existingNamespace })
	}

	// Two passes across the WHOLE candidate batch, not just within one
	// file: `findReferencesAsNodes()` needs an up-to-date `ts.Program` to
	// resolve against, while every mutation below (vestigial cleanup,
	// unexport, consumer rewrites) is a text edit that invalidates it.
	// Resolving every candidate file's every bareFn first — while nothing
	// has been mutated yet — then applying every mutation last with no
	// further resolution needed in between, needs roughly one rebuild
	// total instead of one per bareFn or even one per file (measured: ~35s
	// -> ~40s -> a few seconds for society/'s ~130 bare exports across the
	// successive versions of this fix).
	//
	// This also skips ts-morph's built-in `.rename()` — it does its own
	// separate whole-project reference search internally, which would
	// just duplicate the findReferencesAsNodes() call below. Renaming by
	// hand (text-replacing the declaration and every same-file reference)
	// is safe here because cross-file references are already handled by
	// manual text replacement further down (not by rename's aliasing
	// smarts), and a same-file import/export specifier referencing this
	// function either doesn't exist (the two inline-export shapes) or
	// gets removed outright by `unexport()` regardless of what name it
	// currently has (the standalone `export { name }` shape) — so there's
	// never a same-file specifier that actually needs its name preserved.
	const toApply = []
	let wrapped = 0
	for (const { sf, bareFns, existingNamespace } of candidates) {
		const rel = path.relative(SRC_ROOT, sf.getFilePath()).replace(/\\/g, "/")
		const namespaceName =
			existingNamespace?.name ??
			path
				.basename(dirOf(sf))
				.toUpperCase()
				.replace(/[^A-Z0-9]/g, "_")

		let vestigialStatement = null
		if (!existingNamespace) {
			// The intended namespace name might already be taken by
			// something else in this file (e.g. an empty/vestigial
			// `export const NAMES = {}` placeholder) — don't silently emit
			// a second, colliding declaration of the same name.
			for (const s of sf.getVariableStatements()) {
				for (const d of s.getDeclarations()) {
					if (d.getName() !== namespaceName) continue
					const init = d.getInitializer()
					// An empty object literal under the exact name this
					// namespace would take is unambiguous placeholder debris
					// (nothing can be reading its — nonexistent — members) —
					// safe to clear out and reuse the name for real, rather
					// than flagging a human for something this mechanical.
					if (init && Node.isObjectLiteralExpression(init) && init.getProperties().length === 0) {
						vestigialStatement = s
					}
				}
			}
			const nameCollision =
				!vestigialStatement &&
				(sf.getVariableStatements().some((s) => s.getDeclarations().some((d) => d.getName() === namespaceName)) ||
					sf.getFunctions().some((f) => f.getName() === namespaceName) ||
					sf.getClasses().some((c) => c.getName() === namespaceName))
			if (nameCollision) {
				console.log(`[kept] ${rel}: '${namespaceName}' already exists in this file — needs a human call`)
				continue
			}
		}

		console.log(
			`${CHECK_ONLY ? "[dry-run] " : ""}[wrap] ${rel}: ${existingNamespace ? "merge into" : "export const"} ${namespaceName}${existingNamespace ? "" : " ="} { ${bareFns.map((f) => toCamelCase(f.name)).join(", ")} }`,
		)
		if (vestigialStatement) {
			console.log(`${CHECK_ONLY ? "[dry-run] " : ""}[cleanup] ${rel}: removing vestigial empty '${namespaceName} = {}' placeholder`)
		}
		wrapped++
		if (CHECK_ONLY) continue

		const resolved = bareFns.map((bareFn) => {
			const nameNode = bareFn.declNode.getNameNode()
			const allRefs = nameNode.findReferencesAsNodes().filter((r) => r !== nameNode)
			const sameFileRefs = allRefs.filter(
				(r) => r.getSourceFile() === sf && !Node.isImportSpecifier(r.getParent()) && !Node.isExportSpecifier(r.getParent()),
			)
			const refs = allRefs.filter((r) => r.getSourceFile() !== sf)
			return { bareFn, sameFileRefs, refs }
		})

		toApply.push({ sf, bareFns, existingNamespace, namespaceName, vestigialStatement, resolved })
	}

	// Import additions are deferred to one batched pass after every other
	// mutation (below), for the same reason as everything else here:
	// `importValueRefsInto` resolves an existing import via
	// `getModuleSpecifierSourceFile()` — doing that inline, once per
	// consumer, interleaved with all the surrounding text mutations,
	// re-triggers the same repeated-rebuild cost this whole restructuring
	// is avoiding.
	const deferredImports = []
	for (const { sf, bareFns, existingNamespace, namespaceName, vestigialStatement, resolved } of toApply) {
		touchedFiles.add(sf.getFilePath())
		if (vestigialStatement) vestigialStatement.remove()

		for (const { bareFn, sameFileRefs, refs } of resolved) {
			const { name: originalName, declNode, unexport } = bareFn
			const camelName = toCamelCase(originalName)
			if (camelName !== originalName) {
				declNode.getNameNode().replaceWithText(camelName)
				for (const r of sameFileRefs) r.replaceWithText(camelName)
			}
			// Update bareFn.name in place: the shorthand-property insertion
			// after this whole loop reads from this same array.
			bareFn.name = camelName
			const name = camelName

			unexport()

			// Group by consumer file so each only gets one NAMESPACE import
			// added, no matter how many of this file's functions it uses.
			const byConsumer = new Map()
			for (const ref of refs) {
				const consumer = ref.getSourceFile()
				if (!byConsumer.has(consumer)) byConsumer.set(consumer, [])
				byConsumer.get(consumer).push(ref)
			}

			for (const [consumer, consumerRefs] of byConsumer) {
				touchedFiles.add(consumer.getFilePath())
				// Only import/export specifier removals happened (no actual
				// value usage rewritten) means this consumer doesn't need
				// the namespace import at all — e.g. a barrel file whose
				// only "reference" was re-exporting the bare name onward.
				let needsImport = false
				for (const ref of consumerRefs) {
					const parent = ref.getParent()
					if (Node.isImportSpecifier(parent)) {
						const importDecl = parent.getImportDeclaration()
						parent.remove()
						if (
							importDecl.getNamedImports().length === 0 &&
							!importDecl.getDefaultImport() &&
							!importDecl.getNamespaceImport()
						) {
							importDecl.remove()
						}
					} else if (Node.isExportSpecifier(parent)) {
						// A re-export (`export { fn } from "./x"`) can't
						// spell a property access either. Drop it — direct
						// consumers get repointed straight at the real
						// source below, same as Step 0 already does for
						// pass-through barrels; nothing needs this hop.
						const exportDecl = parent.getExportDeclaration()
						parent.remove()
						if (exportDecl.getNamedExports().length === 0 && !exportDecl.isNamespaceExport()) {
							exportDecl.remove()
						}
					} else if (Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === ref) {
						// `{ SOL_SEED }` is both the key and the value at
						// once — replacing just the identifier text would
						// leave `{ SOL_SYSTEM.solSeed }`, which isn't valid
						// shorthand syntax. Expand it to a real key: value
						// pair instead, keeping the original bare name as
						// the key so whoever consumes *this* object's
						// property (e.g. `SYSTEM.SOL_SEED`) is unaffected.
						parent.replaceWithText(`${ref.getText()}: ${namespaceName}.${name}`)
						needsImport = true
					} else {
						ref.replaceWithText(`${namespaceName}.${name}`)
						needsImport = true
					}
				}
				if (!needsImport) continue
				const alreadyImported = consumer
					.getImportDeclarations()
					.some((imp) => imp.getNamedImports().some((n) => n.getName() === namespaceName))
				if (!alreadyImported) {
					deferredImports.push({ consumer, name: namespaceName, declFile: sf })
				}
			}
		}

		if (existingNamespace) {
			for (const { name } of bareFns) {
				existingNamespace.objectLiteral.addShorthandPropertyAssignment({ name })
			}
		} else {
			const namespaceBody = bareFns.map((f) => `\t${f.name},`).join("\n")
			sf.addStatements(`\nexport const ${namespaceName} = {\n${namespaceBody}\n}\n`)
		}
	}

	applyImportsBatched(deferredImports.map(({ consumer, name, declFile }) => ({ targetFile: consumer, name, declFile })))

	console.log(`\n${CHECK_ONLY ? "Would wrap" : "Wrapped"} ${wrapped} file(s) into a namespace object.\n`)
}

// --- Step 3: namespace-member LCA (narrowing only) --------------------------
// For each exported UPPERCASE namespace object, relocates a member function
// down into the lowest common ancestor directory of everyone who actually
// calls `NAMESPACE.member(...)` — but only when that LCA is a descendant of
// the member's current directory. Never broader/up to a shared ancestor,
// and never sideways to an unrelated branch — moving up or sideways isn't
// this pass's job. Never fabricates a new submodule: the target directory
// must already have an index.ts, or one is created alongside it (mirrors
// Step 4/5's own missing-file handling). Never crosses outside --dir
// either — a consumer outside scope is a hard boundary; the member is left
// in place and reported.
if (runsStep(3)) {

// A function is safe to physically relocate only if every free identifier
// in its body resolves to either a builtin, a parameter/local binding, or
// something importable (an exported project declaration) — never a private
// same-file helper (that dependency wouldn't exist in the target file) or a
// third-party/non-exported symbol.
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
		if (declFile === ownFile) continue // same-file binding — checked separately below
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
			const declName =
				Node.isFunctionDeclaration(decl) ||
				Node.isVariableDeclaration(decl) ||
				Node.isInterfaceDeclaration(decl) ||
				Node.isTypeAliasDeclaration(decl) ||
				Node.isEnumDeclaration(decl)
					? decl.getName?.()
					: null
			if (declName && declName !== fnNode.getName?.()) {
				return { unsafe: `depends on a private same-file helper '${declName}'`, refs: [] }
			}
		}
	}

	return { unsafe: null, refs: externalRefs }
}

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
			if (init.getProperties().length > 0) namespaces.push({ sourceFile, namespaceName: name, objectLiteral: init })
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

		// Narrowing only — the LCA can legitimately land above or beside
		// currentDir when consumers span multiple/unrelated branches, but
		// moving up or sideways isn't this pass's job.
		if (!lcaDir.startsWith(`${currentDir}/`)) continue

		if (!inScope(lcaDir)) {
			console.log(`[kept] ${namespaceName}.${memberName}: LCA is outside scope — needs a human call`)
			memberFlags++
			continue
		}

		// Resolve the underlying function — either a plain function
		// declaration, or a `const name = (...) => {...}` /
		// `function(...) {...}` expression. `analysisNode` is what gets
		// scanned for external references (needs .getParameters());
		// `moveNode` is the whole unit that gets relocated as text (for
		// a const-arrow this is the full variable statement, so the
		// `const name =` binding travels with it, not just the body).
		let analysisNode = null
		let moveNode = null
		const resolveFromDecl = (d) => {
			if (Node.isFunctionDeclaration(d)) return { analysisNode: d, moveNode: d }
			if (Node.isVariableDeclaration(d)) {
				const init = d.getInitializer()
				if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
					const stmt = d.getVariableStatement()
					if (stmt && stmt.getDeclarations().length === 1) return { analysisNode: init, moveNode: stmt }
				}
			}
			return null
		}
		if (Node.isShorthandPropertyAssignment(prop)) {
			const resolved = resolveFromDecl(nameNode.getDefinitionNodes()[0])
			if (resolved) ({ analysisNode, moveNode } = resolved)
		} else if (Node.isPropertyAssignment(prop)) {
			const init = prop.getInitializer()
			if (Node.isIdentifier(init)) {
				const resolved = resolveFromDecl(init.getSymbol()?.getValueDeclaration())
				if (resolved) ({ analysisNode, moveNode } = resolved)
			} else if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
				analysisNode = init
				moveNode = init
			}
		}
		if (!analysisNode || !moveNode) {
			console.log(`[kept] ${namespaceName}.${memberName}: not a plain named function declaration — needs a human call`)
			memberFlags++
			continue
		}

		const { unsafe, refs: fnRefs } = analyzeFunctionBody(analysisNode, sourceFile)
		if (unsafe) {
			console.log(`[kept] ${namespaceName}.${memberName}: ${unsafe} — needs a human call`)
			memberFlags++
			continue
		}

		const targetIndexPath = `${lcaDir}/index.ts`
		let targetFile = project.getSourceFile(targetIndexPath)
		const targetFileIsNew = !targetFile
		if (!targetFile && !CHECK_ONLY) {
			targetFile = project.createSourceFile(targetIndexPath, "", { overwrite: true })
		}

		// Find (or identify the need for) a target namespace object in
		// the descendant's existing index.ts. A brand-new file (dry-run,
		// not yet created) trivially has none.
		let targetNamespace = null
		for (const stmt of targetFile ? targetFile.getVariableStatements() : []) {
			if (!stmt.hasExportKeyword()) continue
			for (const d of stmt.getDeclarations()) {
				if (!/^[A-Z][A-Z0-9_]*$/.test(d.getName())) continue
				const init = d.getInitializer()
				if (init && Node.isObjectLiteralExpression(init)) {
					targetNamespace = { name: d.getName(), objectLiteral: init, statement: stmt }
					break
				}
			}
			if (targetNamespace) break
		}

		// A member with this exact name might already exist on the
		// target namespace (e.g. two unrelated `spawn` helpers) —
		// merging would silently collide, either duplicating the
		// property or (for a same-named shorthand) making the target
		// call itself recursively instead of the moved function.
		if (
			targetNamespace &&
			targetNamespace.objectLiteral.getProperties().some((p) => {
				if (Node.isShorthandPropertyAssignment(p)) return p.getName() === memberName
				if (Node.isPropertyAssignment(p) && Node.isIdentifier(p.getNameNode()))
					return p.getNameNode().getText() === memberName
				return false
			})
		) {
			console.log(`[kept] ${namespaceName}.${memberName}: ${targetNamespace.name} already has a member named '${memberName}' — needs a human call`)
			memberFlags++
			continue
		}

		const newNamespaceName =
			targetNamespace?.name ??
			path
				.basename(lcaDir)
				.toUpperCase()
				.replace(/[^A-Z0-9]/g, "_")

		console.log(
			`${CHECK_ONLY ? "[dry-run member-move] " : "[member-move] "}${namespaceName}.${memberName} (${path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")}) -> ${newNamespaceName}.${memberName} (${path.relative(SRC_ROOT, targetIndexPath).replace(/\\/g, "/")}${targetFileIsNew ? ", new file" : ""}) — ${refs.length} call site(s) across ${consumerDirs.size} directorie(s)`,
		)
		memberMoves++
		if (CHECK_ONLY) continue

		touchedFiles.add(sourceFile.getFilePath())
		touchedFiles.add(targetFile.getFilePath())

		// Rewrite every call site from OLD.member(...) to NEW.member(...)
		// first, while `refs` are still live nodes. Some refs can live in
		// targetFile itself (the LCA may be a file that already calls
		// this member) — the structural edits below (adding the moved
		// function, merging into the namespace) rewrite targetFile's text
		// and forget any node references still held into it, so this
		// must run before those edits, not after.
		for (const ref of refs) {
			const propAccess = ref.getParent()
			if (!Node.isPropertyAccessExpression(propAccess)) continue
			const consumer = ref.getSourceFile()
			touchedFiles.add(consumer.getFilePath())
			propAccess.getExpression().replaceWithText(newNamespaceName)

			if (consumer === targetFile) continue // same file as the namespace itself — no import needed
			const alreadyImported = consumer
				.getImportDeclarations()
				.some((imp) => imp.getNamedImports().some((n) => n.getName() === newNamespaceName))
			if (!alreadyImported) {
				importValueRefsInto(consumer, [{ name: newNamespaceName, declFile: targetFile }])
			}
		}

		// Move the function body over and import whatever it depends on.
		// When merging into an existing namespace, the moved statement
		// must land BEFORE that namespace's declaration, not after —
		// `const` bindings aren't hoisted like function declarations, so
		// a shorthand reference in the object literal above would hit
		// the temporal dead zone otherwise.
		//
		// `moveNode` is only a standalone removable statement when it
		// came from a separate top-level declaration (a `const x = ...`
		// or `function x() {}` the property merely referenced). When the
		// arrow/function is written inline as the property's own value,
		// there's no separate declaration to remove — `prop` (removed
		// below) already owns it — so it needs a synthesized
		// `const name = ...` wrapper instead of a bare, unremovable
		// expression.
		const isInlineValue = moveNode === analysisNode
		const fnText = isInlineValue
			? `const ${memberName} = ${moveNode.getText()}`
			: moveNode.getText()
		if (targetNamespace) {
			targetFile.insertStatements(targetNamespace.statement.getChildIndex(), `\n${fnText}\n`)
		} else {
			targetFile.addStatements(`\n${fnText}\n`)
		}
		importValueRefsInto(targetFile, fnRefs)
		if (!isInlineValue) moveNode.remove()

		// Drop the member from its old namespace, add it to the new one
		// (creating the namespace object if this descendant didn't have one).
		prop.remove()
		if (targetNamespace) {
			targetNamespace.objectLiteral.addShorthandPropertyAssignment({ name: memberName })
		} else {
			targetFile.addStatements(`\nexport const ${newNamespaceName} = {\n\t${memberName},\n}\n`)
		}

		// If the old file still calls the function directly (bare name,
		// not through the namespace object — e.g. another private
		// helper there uses it), it must now go through the namespace
		// too, since the moved member is only ever exported through it.
		const bareUsesInSource = sourceFile
			.getDescendantsOfKind(SyntaxKind.Identifier)
			.filter((id) => {
				if (id.getText() !== memberName) return false
				const p = id.getParent()
				if (Node.isPropertyAccessExpression(p) && p.getNameNode() === id) return false
				if (
					(Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) &&
					p.getNameNode() === id
				)
					return false
				return true
			})
		if (bareUsesInSource.length > 0) {
			for (const id of bareUsesInSource) id.replaceWithText(`${newNamespaceName}.${memberName}`)
			if (sourceFile !== targetFile) {
				importValueRefsInto(sourceFile, [{ name: newNamespaceName, declFile: targetFile }])
			}
		}
	}
}

console.log(
	`\n${CHECK_ONLY ? "Would move" : "Moved"} ${memberMoves} namespace member(s) for relocation, ${memberFlags} flagged.\n`,
)
}

// --- Step 4: types out of flat files -----------------------------------
if (runsStep(4)) {
// Every directory in scope that either already has a types.ts, or has a
// non-types.ts file declaring an interface/type-alias/enum that could move
// into one. The latter get a types.ts created for them (deferred until the
// apply phase — dry-run never touches the project) rather than being
// silently skipped just because the file doesn't exist yet.
const existingTypesFiles = project
	.getSourceFiles()
	.filter((sf) => sf.getBaseName() === "types.ts")
	.filter((sf) => !SCOPE_DIR || sf.getFilePath().startsWith(`${SCOPE_DIR}/`))
const dirsWithTypesFile = new Map(existingTypesFiles.map((sf) => [path.dirname(sf.getFilePath()), sf]))

const dirsNeedingTypesFile = new Set()
for (const sf of project.getSourceFiles()) {
	if (sf.getBaseName() === "types.ts") continue
	if (!inScope(sf.getFilePath())) continue
	const dir = path.dirname(sf.getFilePath())
	if (dirsWithTypesFile.has(dir)) continue
	const hasTypeDecl = sf.getInterfaces().length > 0 || sf.getTypeAliases().length > 0 || sf.getEnums().length > 0
	if (hasTypeDecl) dirsNeedingTypesFile.add(dir)
}

const typesDirs = new Set([...dirsWithTypesFile.keys(), ...dirsNeedingTypesFile])

/** @type {{ decl: any, name: string, sourceFile: any, typesFile: any, typesDir: string, isNewTypesFile: boolean, wasExported: boolean }[]} */
const candidates = []
/** @type {{ name: string, file: string, reason: string }[]} */
const flagged = []

for (const dir of typesDirs) {
	const typesFile = dirsWithTypesFile.get(dir) ?? null
	const isNewTypesFile = !typesFile
	const siblings = project
		.getSourceFiles()
		.filter((sf) => path.dirname(sf.getFilePath()) === dir && sf !== typesFile && sf.getBaseName() !== "types.ts")

	// Names already declared in types.ts, to detect collisions up front. A
	// not-yet-created types.ts trivially has none.
	const existingTypeNames = new Set(
		typesFile
			? [
					...typesFile.getInterfaces().map((i) => i.getName()),
					...typesFile.getTypeAliases().map((t) => t.getName()),
					...typesFile.getEnums().map((e) => e.getName()),
				]
			: [],
	)

	// Phase 1: every decl across every sibling that could move into this
	// types.ts, before any safety filtering. "Co-moving" (below) is judged
	// against this whole-batch set, not just same-source-file siblings —
	// two types from *different* sibling files, both landing in the same
	// types.ts this run, don't need an import for each other either.
	const batch = []
	for (const sourceFile of siblings) {
		const rel = path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")
		for (const decl of [
			...sourceFile.getInterfaces(),
			...sourceFile.getTypeAliases(),
			...sourceFile.getEnums(),
		]) {
			batch.push({ decl, name: decl.getName(), sourceFile, rel })
		}
	}
	// Phase 2: analyze each against the whole batch, then cascade-reject —
	// if X turns out unsafe/colliding, anything that assumed X was
	// co-moving (and so needed no import for it) must be re-checked, since
	// X won't actually be there. Repeat to a fixpoint.
	const rejected = new Map() // name -> reason
	const nameCounts = new Map()
	for (const { name } of batch) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
	for (const { name, rel } of batch) {
		if (nameCounts.get(name) > 1) {
			rejected.set(name, `two different sibling files both declare '${name}' — ambiguous target`)
		} else if (existingTypeNames.has(name)) {
			rejected.set(name, `collides with an existing '${name}' already in ${path.relative(SRC_ROOT, typesFile.getFilePath()).replace(/\\/g, "/")}`)
		}
	}

	const analyzed = new Map() // name -> { unsafe, refs }
	let changed = true
	while (changed) {
		changed = false
		const stillMoving = new Set(batch.filter((b) => !rejected.has(b.name)).map((b) => b.name))
		for (const { decl, name } of batch) {
			if (rejected.has(name)) continue
			const { unsafe, refs, valueRefs } = analyzeDeclarationDependencies(decl, stillMoving)
			analyzed.set(name, { unsafe, refs, valueRefs })
			if (unsafe) {
				rejected.set(name, unsafe)
				changed = true
			}
		}
	}

	for (const { decl, name, sourceFile, rel } of batch) {
		if (rejected.has(name)) {
			flagged.push({ name, file: rel, reason: rejected.get(name) })
			continue
		}
		existingTypeNames.add(name)
		candidates.push({
			decl,
			name,
			sourceFile,
			typesFile,
			typesDir: dir,
			isNewTypesFile,
			refs: analyzed.get(name).refs,
			valueRefs: analyzed.get(name).valueRefs,
			wasExported: decl.isExported?.() ?? false,
		})
	}
}

console.log(
	`${CHECK_ONLY ? "[dry-run] " : ""}${candidates.length} declaration(s) to move, ${flagged.length} flagged.`,
)
for (const { name, sourceFile, typesFile, typesDir, isNewTypesFile } of candidates) {
	const targetPath = typesFile ? typesFile.getFilePath() : `${typesDir}/types.ts`
	console.log(
		`  ${path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")}: ${name} -> ${path.relative(SRC_ROOT, targetPath).replace(/\\/g, "/")}${isNewTypesFile ? " (new file)" : ""}`,
	)
}
for (const { name, file, reason } of flagged) {
	console.log(`  [flagged] ${file}: ${name} — ${reason}`)
}

// Applied in two passes rather than one: multiple candidates from the same
// batch can reference each other (e.g. `LanguageNameContext` uses
// `LanguageNameDynasty`, and both are moving out this run). Checking
// "is this name still used in the source file" per-candidate, interleaved
// with removal, would see the not-yet-removed referencing declaration and
// wrongly conclude the moved type is still needed there. Removing every
// candidate's declaration first, then checking "still used" against the
// fully-cleaned file text, avoids that false positive.
const applied = []
for (let { decl, name, sourceFile, typesFile, typesDir, refs, valueRefs, wasExported } of CHECK_ONLY ? [] : candidates) {
	// Create the types.ts now if this candidate is the first to need it —
	// deferred until here (never during dry-run) so a dry-run never touches
	// the project just to describe what it would do.
	if (!typesFile) typesFile = project.getSourceFile(`${typesDir}/types.ts`) ?? project.createSourceFile(`${typesDir}/types.ts`, "", { overwrite: true })

	const importSpecifier = (() => {
		const relImport = path
			.relative(path.dirname(sourceFile.getFilePath()), typesFile.getFilePath())
			.replace(/\\/g, "/")
			.replace(/\.ts$/, "")
		return relImport.startsWith(".") ? relImport : `./${relImport}`
	})()

	touchedFiles.add(sourceFile.getFilePath())
	touchedFiles.add(typesFile.getFilePath())

	// Move the declaration's text into types.ts, then delete the original,
	// importing along everything the declaration depends on.
	const text = decl.getText()
	const exportedText = text.startsWith("export ") ? text : `export ${text}`
	typesFile.addStatements(`\n${exportedText}\n`)
	decl.remove()
	importRefsInto(typesFile, refs)
	importValueRefsInto(typesFile, valueRefs)

	applied.push({ name, sourceFile, typesFile, importSpecifier, wasExported })
}

for (const { name, sourceFile, typesFile, importSpecifier, wasExported } of applied) {
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
				touchedFiles.add(consumer.getFilePath())
			}
		}
	}
}

// A moved declaration can strand an otherwise-unrelated import that
// existed in the source file only to serve it (e.g. `HeritageScript` used
// `GlyphSet` as a member type; once `HeritageScript` moves out, the
// `import type { GlyphSet }` that was already sitting in the file has
// nothing left to serve). Sweep every touched source file's now-final text
// for named imports with zero remaining references and drop them.
for (const sourceFile of new Set(applied.map((a) => a.sourceFile))) {
	for (const imp of [...sourceFile.getImportDeclarations()]) {
		for (const named of [...imp.getNamedImports()]) {
			const importedName = named.getName()
			const stillReferenced = sourceFile
				.getDescendantsOfKind(SyntaxKind.Identifier)
				.some((id) => id.getText() === importedName && id !== named.getNameNode() && id.getParent() !== named)
			if (!stillReferenced) named.remove()
		}
		if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport() && !imp.wasForgotten()) {
			imp.remove()
		}
	}
}

console.log(`\n${CHECK_ONLY ? "Would move" : "Moved"} ${candidates.length} declaration(s).`)
}

// --- Step 5: types LCA pass -------------------------------------------------
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
if (runsStep(5)) {
const allTypesFilesInScope = project
	.getSourceFiles()
	.filter((sf) => sf.getBaseName() === "types.ts")
	.filter((sf) => !SCOPE_DIR || sf.getFilePath().startsWith(`${SCOPE_DIR}/`))

// Three passes across the WHOLE batch (every declaration in every types.ts
// in scope), not one loop interleaving resolve and mutate per declaration:
// resolve everything first (refs, LCA, dependency safety — nothing here
// mutates), batch-detect collisions against pre-batch state (mirrors Step
// 4's own nameCounts/rejection approach, needed because two declarations
// narrowing to the same target+name can't both land there), then mutate
// everything last. Interleaving resolve calls (`findReferencesAsNodes`,
// `analyzeDeclarationDependencies`, `getModuleSpecifierSourceFile`) with
// mutations per declaration forced a full-program rebuild on nearly every
// one — the same problem, and the same fix, as everywhere else in this
// file.
const candidates = []
for (const typesFile of allTypesFilesInScope) {
	const typesDir = dirOf(typesFile)
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

		// Narrowing only — the LCA can legitimately land above typesDir
		// (a shared ancestor) when consumers span multiple branches, but
		// moving up to a broader types.ts isn't this pass's job.
		if (!lcaDir.startsWith(`${typesDir}/`)) continue

		const withinScope = !SCOPE_DIR || lcaDir === SCOPE_DIR || lcaDir.startsWith(`${SCOPE_DIR}/`)
		if (!withinScope) {
			console.log(
				`[kept] ${name}: a consumer sits outside ${path.relative(SRC_ROOT, SCOPE_DIR).replace(/\\/g, "/")} (out of --dir scope — needs a human call)`,
			)
			continue
		}

		const targetTypesPath = `${lcaDir}/types.ts`
		// Existing target only — never create yet (a not-yet-existing
		// target is never a pre-batch collision, and creation itself is
		// deferred to the mutate phase so multiple candidates sharing a
		// brand-new target can share the one file).
		const existingTargetTypesFile = project.getSourceFile(targetTypesPath)
		if (existingTargetTypesFile === typesFile) continue

		if (
			existingTargetTypesFile &&
			existingTargetTypesFile
				.getInterfaces()
				.concat(existingTargetTypesFile.getTypeAliases())
				.concat(existingTargetTypesFile.getEnums())
				.some((d) => d.getName() === name)
		) {
			console.log(`[kept] ${name}: collides with an existing '${name}' in ${path.relative(SRC_ROOT, targetTypesPath).replace(/\\/g, "/")}`)
			continue
		}

		const { unsafe: depUnsafe, refs: depRefs, valueRefs: depValueRefs } = analyzeDeclarationDependencies(decl)
		if (depUnsafe) {
			console.log(`[kept] ${name}: ${depUnsafe} — needs a human call`)
			continue
		}

		candidates.push({ typesFile, typesDir, decl, name, refs, targetTypesPath, depRefs, depValueRefs })
	}
}

// Two different declarations (from two different source types.ts) both
// narrowing to the same target path under the same name can't both land
// there — same ambiguous-collision shape Step 4 already guards against.
const byTarget = new Map() // `${targetTypesPath}::${name}` -> candidates[]
for (const c of candidates) {
	const key = `${c.targetTypesPath}::${c.name}`
	if (!byTarget.has(key)) byTarget.set(key, [])
	byTarget.get(key).push(c)
}
const accepted = []
for (const [, group] of byTarget) {
	if (group.length > 1) {
		for (const c of group) {
			console.log(`[kept] ${c.name}: two different declarations both narrow to the same '${path.relative(SRC_ROOT, c.targetTypesPath).replace(/\\/g, "/")}' — ambiguous target`)
		}
		continue
	}
	accepted.push(group[0])
}

let narrowed = 0
const targetFilesCreated = new Map() // targetTypesPath -> SourceFile
const backImportCandidates = [] // { typesFile, typesDir, name, targetTypesPath }
const allConsumerImportsToRewrite = [] // { consumer, imp, name, targetTypesPath }
for (const { typesFile, typesDir, decl, name, refs, targetTypesPath, depRefs, depValueRefs } of accepted) {
	console.log(
		`${CHECK_ONLY ? "[dry-run narrow] " : "[narrow] "}${name}: ${path.relative(SRC_ROOT, typesFile.getFilePath()).replace(/\\/g, "/")} -> ${path.relative(SRC_ROOT, targetTypesPath).replace(/\\/g, "/")}`,
	)
	narrowed++
	if (CHECK_ONLY) continue

	const targetTypesFile =
		project.getSourceFile(targetTypesPath) ??
		targetFilesCreated.get(targetTypesPath) ??
		(() => {
			const f = project.createSourceFile(targetTypesPath, "", { overwrite: false })
			targetFilesCreated.set(targetTypesPath, f)
			return f
		})()

	touchedFiles.add(typesFile.getFilePath())
	touchedFiles.add(targetTypesFile.getFilePath())

	const text = decl.getText()
	const exportedText = text.startsWith("export ") ? text : `export ${text}`
	targetTypesFile.addStatements(`\n${exportedText}\n`)
	decl.remove()
	importRefsInto(targetTypesFile, depRefs)
	importValueRefsInto(targetTypesFile, depValueRefs)

	backImportCandidates.push({ typesFile, typesDir, name, targetTypesPath })

	// A consumer with several refs to this declaration in the same file
	// hits the same import declaration once per ref — dedupe by `imp`
	// identity, or a later mutate pass would try to remove a named import
	// an earlier one already removed.
	const seenImps = new Set()
	for (const r of refs) {
		const consumer = r.getSourceFile()
		for (const imp of consumer.getImportDeclarations()) {
			if (seenImps.has(imp)) continue
			const named = imp.getNamedImports().find((n) => n.getName() === name)
			if (!named) continue
			if (imp.getModuleSpecifierSourceFile() !== typesFile) continue
			seenImps.add(imp)
			allConsumerImportsToRewrite.push({ consumer, imp, name, targetTypesPath })
		}
	}
}

// If the file a type moved FROM still references it elsewhere in its own
// remaining content (common when moving up: a sibling type left behind
// still uses it), import it back. Checked only after every removal from
// every typesFile in this batch is done, so "remaining content" reflects
// the batch's final state, not a mid-batch snapshot.
applyImportsBatched(
	backImportCandidates
		.filter(({ typesFile, name }) => new RegExp(`\\b${name}\\b`).test(typesFile.getFullText()))
		.map(({ typesFile, name, targetTypesPath }) => ({
			targetFile: typesFile,
			name,
			declFile: project.getSourceFile(targetTypesPath) ?? targetFilesCreated.get(targetTypesPath),
			isTypeOnly: true,
		})),
)

// Rewrite every consumer's import to the new module — batched across the
// WHOLE step, not just within one declaration.
for (const { consumer, imp, name } of allConsumerImportsToRewrite) {
	touchedFiles.add(consumer.getFilePath())
	const named = imp.getNamedImports().find((n) => n.getName() === name)
	named.remove()
	if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport()) {
		imp.remove()
	}
}
applyImportsBatched(
	allConsumerImportsToRewrite.map(({ consumer, name, targetTypesPath }) => ({
		targetFile: consumer,
		name,
		declFile: project.getSourceFile(targetTypesPath) ?? targetFilesCreated.get(targetTypesPath),
		isTypeOnly: true,
	})),
)

// A narrowed-away declaration can strand an import in its old types.ts that
// existed only to serve it (same failure mode as Step 4's equivalent sweep).
if (!CHECK_ONLY) {
	for (const typesFile of allTypesFilesInScope) {
		for (const imp of [...typesFile.getImportDeclarations()]) {
			for (const named of [...imp.getNamedImports()]) {
				const importedName = named.getName()
				const stillReferenced = typesFile
					.getDescendantsOfKind(SyntaxKind.Identifier)
					.some((id) => id.getText() === importedName && id.getParent() !== named)
				if (!stillReferenced) named.remove()
			}
			if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport() && !imp.wasForgotten()) {
				imp.remove()
			}
		}
	}
}

console.log(`${CHECK_ONLY ? "Would narrow" : "Narrowed"} ${narrowed} declaration(s) to a more specific types.ts.`)
}

// --- Step 6: max-params auto-fix --------------------------------------------
// Bundles a function's params into a single object param, per AGENTS.md's
// "functions take at most one parameter" rule — hardcoded max of 1
// everywhere, but only for the safe subset. Skips (flags, doesn't touch):
//   - a default-valued param, a rest param, generic type params
//   - an overload signature or multiple declarations for the name
//   - a class/object method (interface risk)
//   - the function referenced as a value anywhere, not just called directly
//     (rewriting its signature would silently break every such caller)
//   - a param type that isn't safely relocatable into types.ts (third-party,
//     non-exported local, or a `typeof someValue` query) — same safety
//     check as Steps 4/5, reused via analyzeDeclarationDependencies
//   - two same-named functions in different files that would generate a
//     colliding `${Name}Params` interface in the same types.ts
if (runsStep(6)) {
// AGENTS.md's "functions take at most one parameter" rule, applied
// everywhere — no directory-specific exception.
function effectiveMax() {
	return 1
}
function pascalCase(name) {
	return name.charAt(0).toUpperCase() + name.slice(1)
}

// A function's own `{ fnName }` shorthand inside its namespace object
// literal (Step 2's output — this is the overwhelming majority of
// functions post Steps 0-2) isn't itself an unsafe "referenced as a
// value": it's not stored, passed around, or exported bare — it's exactly
// what every consumer already goes through (`NAMESPACE.fnName(...)`).
// What matters is whether *those* call sites are all direct calls too.
//
// Returns every `NAMESPACE.fnName(...)` call site project-wide (so the
// apply phase can rewrite them from positional args to an object literal,
// same as any other call site) if every usage is a direct call — or null
// if anything holds onto `NAMESPACE.fnName` as a bare value, since
// rewriting the signature would silently break that caller.
function namespaceMemberCallSites(shorthandRef) {
	const shorthand = shorthandRef.getParent()
	if (!Node.isShorthandPropertyAssignment(shorthand)) return null
	const objLiteral = shorthand.getParent()
	if (!Node.isObjectLiteralExpression(objLiteral)) return null
	const varDecl = objLiteral.getParent()
	if (!Node.isVariableDeclaration(varDecl)) return null
	const namespaceNameNode = varDecl.getNameNode()
	if (!namespaceNameNode || !Node.isIdentifier(namespaceNameNode)) return null
	const memberName = shorthand.getName()

	const callSites = []
	const namespaceRefs = namespaceNameNode.findReferencesAsNodes().filter((r) => r !== namespaceNameNode)
	for (const nsRef of namespaceRefs) {
		const propAccess = nsRef.getParent()
		if (!Node.isPropertyAccessExpression(propAccess)) continue // not a `.member` access — irrelevant
		if (propAccess.getNameNode().getText() !== memberName) continue // a different member — irrelevant
		const call = propAccess.getParent()
		if (!(Node.isCallExpression(call) && call.getExpression() === propAccess)) {
			return null // NAMESPACE.member held as a value somewhere — unsafe
		}
		callSites.push(call)
	}
	return callSites
}

/** @type {{ name: string, file: string, reason: string }[]} */
const flagged = []
const paramsCandidates = []

for (const sourceFile of project.getSourceFiles()) {
	if (!inScope(sourceFile.getFilePath())) continue
	const filePath = sourceFile.getFilePath()
	const max = effectiveMax()

	const fns = [
		...sourceFile.getFunctions(),
		...sourceFile.getVariableDeclarations().filter((d) => {
			const init = d.getInitializer()
			return init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
		}),
	]

	for (const fnDecl of fns) {
		const isVarDecl = Node.isVariableDeclaration(fnDecl)
		const fn = isVarDecl ? fnDecl.getInitializer() : fnDecl
		const name = fnDecl.getName()
		if (!name) continue

		const params = fn.getParameters()
		if (params.length <= max) continue

		const rel = path.relative(SRC_ROOT, filePath).replace(/\\/g, "/")

		if (!fn.getBody()) {
			flagged.push({ name, file: rel, reason: "overload signature (no body)" })
			continue
		}
		if (Node.isFunctionDeclaration(fnDecl)) {
			const sameName = sourceFile.getFunctions().filter((f) => f.getName() === name)
			if (sameName.length > 1) {
				flagged.push({ name, file: rel, reason: "multiple declarations (overloads)" })
				continue
			}
		}
		if (fn.getTypeParameters().length > 0) {
			flagged.push({ name, file: rel, reason: "generic type parameters" })
			continue
		}
		if (params.some((p) => p.isRestParameter())) {
			flagged.push({ name, file: rel, reason: "has a rest parameter" })
			continue
		}
		if (params.some((p) => !Node.isIdentifier(p.getNameNode()))) {
			// e.g. `function f([r, g, b]: Triple, sat: number)` — the param's
			// own name is a destructuring pattern, not a plain identifier.
			// `p.getName()` returns its raw text ("[r, g, b]"), which can't
			// be used as an object-shorthand property name — generating
			// `{ [r, g, b], sat }` would be invalid syntax.
			flagged.push({ name, file: rel, reason: "a parameter is itself a destructuring pattern, not a plain identifier" })
			continue
		}
		if (Node.isMethodDeclaration(fnDecl) || Node.isMethodDeclaration(fn)) {
			flagged.push({ name, file: rel, reason: "class/object method (interface risk)" })
			continue
		}

		const nameNode = fnDecl.getNameNode()
		if (!nameNode) {
			flagged.push({ name, file: rel, reason: "anonymous / unresolvable declaration" })
			continue
		}

		const refs = nameNode
			.findReferencesAsNodes()
			.filter((r) => r !== nameNode)
			.filter((r) => {
				const parent = r.getParent()
				return !Node.isImportSpecifier(parent) && !Node.isExportSpecifier(parent)
			})
		// Every bare-name reference must resolve to a set of call sites to
		// rewrite: either it's a direct call itself, or (the common
		// post-Steps-0-2 case) it's the function's own namespace shorthand,
		// which stands in for every `NAMESPACE.fnName(...)` call site
		// project-wide. Any other shape — passed as a value, stored,
		// exported bare — disqualifies the whole function.
		let callSites = []
		let unsafeRef = null
		for (const r of refs) {
			const parent = r.getParent()
			if (Node.isCallExpression(parent) && parent.getExpression() === r) {
				callSites.push(parent)
				continue
			}
			if (Node.isShorthandPropertyAssignment(parent)) {
				const nsCallSites = namespaceMemberCallSites(r)
				if (nsCallSites) {
					callSites.push(...nsCallSites)
					continue
				}
			}
			unsafeRef = r
			break
		}
		if (unsafeRef) {
			flagged.push({
				name,
				file: rel,
				reason: `referenced as a value, not just called directly (see ${path.relative(SRC_ROOT, unsafeRef.getSourceFile().getFilePath()).replace(/\\/g, "/")}:${unsafeRef.getStartLineNumber()})`,
			})
			continue
		}

		const typesFilePath = `${dirOf(sourceFile)}/types.ts`
		const typesFileIsNew = !project.getSourceFile(typesFilePath)

		// Don't relocate a param's type into types.ts unless it's guaranteed
		// to still resolve there — same safety check Steps 4/5 use, reused
		// here on each param's bare type node instead of a whole declaration.
		const analyses = params.map((p) => {
			const t = p.getTypeNode()
			if (!t) return { unsafe: "no explicit type annotation (would need to infer one)", refs: [], valueRefs: [] }
			return analyzeDeclarationDependencies(t)
		})
		const typeIssue = analyses.map((a) => a.unsafe).find(Boolean)
		if (typeIssue) {
			flagged.push({ name, file: rel, reason: typeIssue })
			continue
		}
		const externalTypeRefs = analyses.flatMap((a) => a.refs)
		const externalValueRefs = analyses.flatMap((a) => a.valueRefs ?? [])

		paramsCandidates.push({ fn, fnDecl, nameNode, name, file: rel, sourceFile, typesFilePath, typesFileIsNew, externalTypeRefs, externalValueRefs, callSites })
	}
}

// Two functions in different files sharing a name would generate the same
// `${Name}Params` interface in the same types.ts — TypeScript silently
// *merges* same-named interface declarations instead of erroring, which
// corrupted several functions' signatures the first time this ran unchecked.
const byTargetAndName = new Map()
for (const c of paramsCandidates) {
	const typeName = `${pascalCase(c.name)}Params`
	const key = `${c.typesFilePath}::${typeName}`
	if (!byTargetAndName.has(key)) byTargetAndName.set(key, [])
	byTargetAndName.get(key).push(c)
}
const collidingKeys = new Set([...byTargetAndName.entries()].filter(([, list]) => list.length > 1).map(([key]) => key))
const safeParamsCandidates = []
for (const c of paramsCandidates) {
	const typeName = `${pascalCase(c.name)}Params`
	const key = `${c.typesFilePath}::${typeName}`
	if (collidingKeys.has(key)) {
		flagged.push({
			name: c.name,
			file: c.file,
			reason: `generated interface name '${typeName}' collides with another function of the same name targeting the same types.ts`,
		})
	} else {
		safeParamsCandidates.push(c)
	}
}

let paramsFixed = 0
for (const { fn, nameNode, name, file, sourceFile, typesFilePath, typesFileIsNew, externalTypeRefs, externalValueRefs, callSites } of safeParamsCandidates) {
	const params = fn.getParameters()
	const typeName = `${pascalCase(name)}Params`

	console.log(
		`${CHECK_ONLY ? "[dry-run] " : ""}${file}: ${name}(${params.map((p) => p.getName()).join(", ")}) -> ${name}({ ${params.map((p) => p.getName()).join(", ")} }: ${typeName})` +
			(typesFileIsNew ? ` (creates ${path.relative(SRC_ROOT, typesFilePath).replace(/\\/g, "/")})` : ""),
	)
	paramsFixed++
	if (CHECK_ONLY) continue

	const typesSourceFile = project.getSourceFile(typesFilePath) ?? project.createSourceFile(typesFilePath, "", { overwrite: true })
	touchedFiles.add(sourceFile.getFilePath())
	touchedFiles.add(typesSourceFile.getFilePath())

	importRefsInto(typesSourceFile, externalTypeRefs)
	importValueRefsInto(typesSourceFile, externalValueRefs)

	typesSourceFile.addInterface({
		name: typeName,
		isExported: true,
		properties: params.map((p) => ({
			name: p.getName(),
			type: p.getTypeNode()?.getText() ?? p.getType().getText(p),
			hasQuestionToken: p.hasQuestionToken() || p.hasInitializer(),
		})),
	})

	const importSpecifier = relativeSpecifier(sourceFile.getFilePath(), typesSourceFile.getFilePath())
	const existingImport = sourceFile.getImportDeclarations().find((imp) => imp.getModuleSpecifierValue() === importSpecifier)
	if (existingImport) {
		if (!existingImport.getNamedImports().some((n) => n.getName() === typeName)) {
			existingImport.addNamedImport(
				existingImport.isTypeOnly() ? { name: typeName } : { name: typeName, isTypeOnly: true },
			)
		}
	} else {
		sourceFile.addImportDeclaration({
			moduleSpecifier: importSpecifier,
			namedImports: [{ name: typeName }],
			isTypeOnly: true,
		})
	}

	// Rewrite call sites (positional args -> single object literal),
	// evaluated in the original left-to-right order so side effects stay
	// equivalent. `callSites` already holds the actual CallExpression nodes
	// — either direct calls to the bare name, or (the namespace-member
	// case) every `NAMESPACE.fnName(...)` call site found project-wide.
	for (const call of callSites) {
		// A call site captured during the resolve phase can be inside
		// ANOTHER function's call site being rewritten first in this same
		// mutate phase (e.g. `dot(cross(a, b), c)` — rewriting dot's call
		// replaces its whole text, including the nested cross(...) call,
		// forgetting that node). Skipping avoids the crash, but the nested
		// call is left calling the new destructured signature with old
		// positional args — genuinely broken, not self-healing — so this
		// has to be surfaced, not silently dropped.
		if (call.wasForgotten()) {
			console.log(`  [WARNING] a call site for ${name} was left unrewritten (nested inside another rewritten call) — now calling ${name}({ ${typeName} }) with old positional args; fix by hand`)
			continue
		}
		const args = call.getArguments()
		const objLiteral = params
			.map((p, i) => {
				const arg = args[i]
				if (!arg) return null
				const argText = arg.getText()
				return argText === p.getName() ? p.getName() : `${p.getName()}: ${argText}`
			})
			.filter(Boolean)
			.join(", ")
		touchedFiles.add(call.getSourceFile().getFilePath())
		call.replaceWithText(`${call.getExpression().getText()}({ ${objLiteral} })`)
	}

	// Rewrite the function's own parameter list to a single destructured
	// object param.
	const destructureName = `{ ${params.map((p) => (p.hasInitializer() ? `${p.getName()} = ${p.getInitializer().getText()}` : p.getName())).join(", ")} }`
	fn.getParameters().forEach((p) => p.remove())
	fn.insertParameter(0, { name: destructureName, type: typeName })
}

// A param's type moving into the new ${Name}Params interface can strand
// the source file's own import of it — same failure mode as Steps 4/5's
// equivalent sweep (e.g. a type imported only to annotate that one now-
// relocated param).
if (!CHECK_ONLY) {
	for (const sourceFile of new Set(safeParamsCandidates.map((c) => c.sourceFile))) {
		for (const imp of [...sourceFile.getImportDeclarations()]) {
			for (const named of [...imp.getNamedImports()]) {
				const importedName = named.getName()
				const stillReferenced = sourceFile
					.getDescendantsOfKind(SyntaxKind.Identifier)
					.some((id) => id.getText() === importedName && id.getParent() !== named)
				if (!stillReferenced) named.remove()
			}
			if (imp.getNamedImports().length === 0 && !imp.getDefaultImport() && !imp.getNamespaceImport() && !imp.wasForgotten()) {
				imp.remove()
			}
		}
	}
}

console.log(`\n${CHECK_ONLY ? "Would fix" : "Fixed"} ${paramsFixed} function(s). ${flagged.length} flagged for manual review:`)
for (const { name, file, reason } of flagged) {
	console.log(`  ${file}: ${name} — ${reason}`)
}
}

// --- Cleanup: relative imports -> @/ alias in every touched file, then
// save + format + (when running the full pipeline) reload from disk -------
// Every step above can introduce or deepen a relative import ("./x",
// "../../x") — Step 0/1 in particular, since flattening moves a file one
// directory deeper. Path aliases don't have that fragility, and this repo's
// own lint config (biome.json's noRestrictedImports) already requires them.
// Runs on whatever's been touched so far, not the whole scope, so a single
// `--step=N` invocation stays a targeted, reviewable diff.
//
// `reload`: Step 0 (barrel removal) and Step 1 (flatten) are the only steps
// that delete whole source files. Deleting a file only updates ts-morph's
// in-memory project state, not the underlying TypeScript language service's
// cache — later steps in the *same* process can still see a just-deleted
// file's old content alongside its replacement (this actually happened:
// running the full pipeline in one process without this reload produced
// duplicate/incorrect output for several files). A real disk round-trip
// (save, then load a fresh Project from what's actually on disk) is the
// only way to force that cache to resync. Steps 2/4/5/6 never delete a
// whole file, so no reload is needed between them — running the full
// pipeline still gets 3 real project loads (after Step 0, after Step 1, at
// the end) instead of 6, without reintroducing the staleness bug.
async function flush(reload) {
	if (!CHECK_ONLY) {
		// Two passes, not interleaved: `getModuleSpecifierSourceFile()` needs
		// an up-to-date `ts.Program` to resolve against, and
		// `setModuleSpecifier()` is a text edit that invalidates it — doing a
		// resolve, a text edit, another resolve, another text edit, ...
		// across ~100+ imports forces a full-program rebuild on nearly every
		// iteration (measured: 48s for ~140 imports). Resolving everything
		// first while the Program is still valid, then applying every text
		// edit with no further resolution in between, needs at most a
		// couple of rebuilds total instead of one per import.
		const toRewrite = []
		for (const filePath of touchedFiles) {
			const sourceFile = project.getSourceFile(filePath)
			if (!sourceFile) continue
			for (const imp of sourceFile.getImportDeclarations()) {
				const specifier = imp.getModuleSpecifierValue()
				if (!specifier.startsWith(".")) continue
				const resolved = imp.getModuleSpecifierSourceFile()
				if (!resolved) continue // unresolvable (e.g. a non-.ts asset import) — leave as-is
				toRewrite.push({ imp, newSpecifier: toModuleSpecifier(resolved.getFilePath()) })
			}
		}
		for (const { imp, newSpecifier } of toRewrite) imp.setModuleSpecifier(newSpecifier)
		if (toRewrite.length > 0) console.log(`Converted ${toRewrite.length} relative import(s) to @/ aliases.`)
	}

	if (!CHECK_ONLY) await project.save()

	// Biome formatting doesn't need to happen before a mid-pipeline reload
	// — it's a style pass, not something later steps depend on, and
	// spawning it 3x (once per flush) instead of once at the very end was
	// pure wasted subprocess overhead. Every touched file across every
	// phase gets formatted together in the one final (non-reload) flush.
	for (const f of touchedFiles) allTouchedFilesEver.add(f)
	if (!reload) {
		// A file touched by an earlier phase (e.g. Step 1's flatten) can be
		// deleted by a later one before this final format runs — Biome
		// errors on a path that no longer exists, so only pass what's
		// actually still there.
		const stillExisting = [...allTouchedFilesEver].filter((f) => existsSync(f))
		if (stillExisting.length > 0) {
			const { execFileSync } = await import("node:child_process")
			// Windows caps a single command line at ~8191 chars — a large
			// run (a whole domain, not just one submodule) can easily blow
			// past that with full absolute paths. Chunk into batches small
			// enough to always stay under it regardless of path length.
			const CHUNK_SIZE = 50
			for (let i = 0; i < stillExisting.length; i += CHUNK_SIZE) {
				const chunk = stillExisting.slice(i, i + CHUNK_SIZE)
				execFileSync("npx", ["biome", "format", "--write", ...chunk], {
					stdio: "inherit",
					shell: true,
				})
			}
		}
	}

	touchedFiles.clear()
	if (reload) project = loadProject()
}

await flush(false)

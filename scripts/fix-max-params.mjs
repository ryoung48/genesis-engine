// Conservative auto-fixer for lint/nursery/useMaxParams (Biome has no fix
// for this rule). Bundles a function's params into a single object param —
// per AGENTS.md's "functions take at most one parameter" rule — but ONLY
// for the safe subset. Everything else is left untouched and reported so a
// human can look at it:
//
//   - any parameter has a default value (the new type's field would need
//     an "optional because ..." comment per AGENTS.md — that's a judgment
//     call, not something to fabricate)
//   - a rest parameter (`...args`)
//   - generic type parameters (interacts awkwardly with a destructured
//     object type; skipped for safety)
//   - an overload signature, or more than one declaration for the name
//   - a class method (risk of breaking an `implements`/override contract)
//   - the function is referenced anywhere *without* being called directly
//     (passed as a value: `array.map(fn)`, stored, exported as a callback,
//     `.bind`/`.call`/`.apply`) — rewriting its signature would silently
//     break every such caller, since they'd still invoke it positionally
//   - no sibling `types.ts` exists next to the function's file to hold the
//     new params interface (AGENTS.md requires the type live in the
//     domain's types.ts, not inline)
//   - any parameter's type references a third-party type, a non-exported
//     local type, or a `typeof someRuntimeValue` query — moving the type's
//     *text* into types.ts doesn't bring its imports along, so it silently
//     fails to resolve there. (This is not hypothetical: it broke ~20
//     renderer/ files the first time this script ran without the check.)
//
// Usage:
//   node scripts/fix-max-params.mjs          # apply fixes to the safe subset
//   node scripts/fix-max-params.mjs --check   # dry run, report only
import { existsSync } from "node:fs"
import path from "node:path"
import { Node, Project, SyntaxKind } from "ts-morph"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src")
const CHECK_ONLY = process.argv.includes("--check")

// Mirrors biome.json's useMaxParams overrides.
const STRICT_MAX1_DIRS = [
	"celestial",
	"climate",
	"economy",
	"earth",
].map((d) => path.join(SRC_ROOT, "model", d))
const DEFAULT_MAX = 4

function effectiveMax(filePath) {
	return STRICT_MAX1_DIRS.some((dir) => filePath.startsWith(dir + path.sep))
		? 1
		: DEFAULT_MAX
}

function pascalCase(name) {
	return name.charAt(0).toUpperCase() + name.slice(1)
}

// TS/lib globals safe to reference from anywhere without an import.
const BUILTIN_TYPE_NAMES = new Set([
	"Array", "ReadonlyArray", "Promise", "Record", "Partial", "Required",
	"Readonly", "Pick", "Omit", "Exclude", "Extract", "ReturnType",
	"Parameters", "InstanceType", "Map", "ReadonlyMap", "Set", "ReadonlySet",
	"Date", "RegExp", "Error", "Function", "Iterable", "IterableIterator",
	"Generator", "PromiseLike", "WeakMap", "WeakSet", "ArrayBuffer", "ArrayBufferLike",
	"Uint8Array", "Uint16Array", "Uint32Array", "Int8Array", "Int16Array",
	"Int32Array", "Float32Array", "Float64Array",
	"number", "string", "boolean", "void", "null", "undefined", "any",
	"unknown", "never", "object", "bigint", "symbol",
])

// Returns a reason string if `typeNode` isn't safe to relocate verbatim into
// another file's types.ts (a third-party type, a non-exported local type, or
// a `typeof someRuntimeValue` query) — null if it's safe.
// Checks whether `typeNode` is safe to relocate verbatim into another
// file's types.ts, and — when it is — returns every external named type it
// references so the caller can import each of them into that file too.
// Copying just the type *text* without also importing what it depends on is
// exactly what broke ~20 renderer/ files the first time this ran; this
// function is both the safety check and (via `refs`) the fix for it.
function analyzeTypeNode(typeNode) {
	if (!typeNode)
		return { unsafe: "no explicit type annotation (would need to infer one)", refs: [] }

	for (const tq of typeNode.getDescendantsOfKind(SyntaxKind.TypeQuery)) {
		return { unsafe: `depends on a runtime value via \`typeof ${tq.getExprName().getText()}\``, refs: [] }
	}

	const typeRefs = typeNode.getKind() === SyntaxKind.TypeReference
		? [typeNode, ...typeNode.getDescendantsOfKind(SyntaxKind.TypeReference)]
		: typeNode.getDescendantsOfKind(SyntaxKind.TypeReference)

	const refs = []
	for (const ref of typeRefs) {
		const nameNode = ref.getTypeName()
		// For a qualified name like `THREE.Line`, only the leftmost namespace
		// identifier (`THREE`) is what needs to resolve/import.
		const leftmost = Node.isQualifiedName(nameNode)
			? (() => {
					let n = nameNode
					while (Node.isQualifiedName(n)) n = n.getLeft()
					return n
				})()
			: nameNode
		const name = leftmost.getText()
		if (BUILTIN_TYPE_NAMES.has(name)) continue

		// If `name` is itself an import binding (e.g. `import { type Foo } from
		// "./bar"`), getSymbol() resolves to that local import specifier, not
		// Foo's real declaration — follow the alias to find where it's
		// actually declared and exported from.
		let symbol = leftmost.getSymbol()
		if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol()
		const decl = symbol?.getDeclarations()?.[0]
		if (!decl) return { unsafe: `references an unresolvable type '${name}'`, refs: [] }

		const declSourceFile = decl.getSourceFile()
		const declFile = declSourceFile.getFilePath()
		if (declFile.includes("node_modules")) {
			return { unsafe: `references a third-party type '${name}'`, refs: [] }
		}
		const isExported =
			typeof decl.isExported === "function" ? decl.isExported() : false
		if (!isExported) {
			return {
				unsafe: `references a non-exported local type '${name}' (declared in ${path.relative(SRC_ROOT, declFile).replace(/\\/g, "/")})`,
				refs: [],
			}
		}
		refs.push({ name, declSourceFile })
	}
	return { unsafe: null, refs }
}

const project = new Project({
	tsConfigFilePath: path.resolve(import.meta.dirname, "..", "tsconfig.app.json"),
})
project.addSourceFilesAtPaths(path.join(SRC_ROOT, "**/*.{ts,tsx}"))

/** @type {{ node: any, name: string, file: string, reason: string }[]} */
const flagged = []
/** @type {{ node: any, name: string, file: string }[]} */
const candidates = []

for (const sourceFile of project.getSourceFiles()) {
	const filePath = sourceFile.getFilePath()
	const max = effectiveMax(filePath)

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
		const name = isVarDecl ? fnDecl.getName() : fnDecl.getName()
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
		if (params.some((p) => p.hasInitializer())) {
			flagged.push({
				name,
				file: rel,
				reason: "has a default value — new field would need a documented reason to be optional",
			})
			continue
		}
		if (Node.isMethodDeclaration(fnDecl) || Node.isMethodDeclaration(fn)) {
			flagged.push({ name, file: rel, reason: "class/object method (interface risk)" })
			continue
		}

		const nameNode = isVarDecl ? fnDecl.getNameNode() : fnDecl.getNameNode()
		if (!nameNode) {
			flagged.push({ name, file: rel, reason: "anonymous / unresolvable declaration" })
			continue
		}

		const refs = nameNode
			.findReferencesAsNodes()
			.filter((r) => r !== nameNode)
			// Import/export specifiers are just the binding, not a usage site
			// — skip them and judge only the identifier's actual use.
			.filter((r) => {
				const parent = r.getParent()
				return !Node.isImportSpecifier(parent) && !Node.isExportSpecifier(parent)
			})
		const nonCallRef = refs.find((r) => {
			const parent = r.getParent()
			return !(Node.isCallExpression(parent) && parent.getExpression() === r)
		})
		if (nonCallRef) {
			flagged.push({
				name,
				file: rel,
				reason: `referenced as a value, not just called directly (see ${path.relative(SRC_ROOT, nonCallRef.getSourceFile().getFilePath()).replace(/\\/g, "/")}:${nonCallRef.getStartLineNumber()})`,
			})
			continue
		}

		const typesFile = path.join(path.dirname(filePath), "types.ts")
		const typesFileIsNew = !existsSync(typesFile)

		// Don't relocate a param's type into types.ts unless it's guaranteed
		// to still resolve there — third-party types, non-exported local
		// types, and `typeof someValue` queries all break silently otherwise.
		// externalTypeRefs collects every external type each safe param
		// references, so the fix step can import them into types.ts too
		// (not just the new Params interface itself).
		const analyses = params.map((p) => analyzeTypeNode(p.getTypeNode()))
		const typeIssue = analyses.map((a) => a.unsafe).find(Boolean)
		if (typeIssue) {
			flagged.push({ name, file: rel, reason: typeIssue })
			continue
		}
		const externalTypeRefs = analyses.flatMap((a) => a.refs)

		candidates.push({ fnDecl, fn, nameNode, name, file: rel, filePath, typesFile, typesFileIsNew, externalTypeRefs, refs })
	}
}

// Two functions in different files sharing a name (e.g. `appendProjectedSegment`
// defined separately in three overlay files) generate the same
// `${Name}Params` interface in the same types.ts. TypeScript doesn't error on
// the duplicate — it silently *merges* the two declarations' fields, which
// corrupted several functions' signatures the first time this ran unchecked.
// Detect and flag any collision instead of risking that again.
const byTargetAndName = new Map()
for (const c of candidates) {
	const typeName = `${pascalCase(c.name)}Params`
	const key = `${c.typesFile}::${typeName}`
	if (!byTargetAndName.has(key)) byTargetAndName.set(key, [])
	byTargetAndName.get(key).push(c)
}
const collidingKeys = new Set(
	[...byTargetAndName.entries()].filter(([, list]) => list.length > 1).map(([key]) => key),
)
const safeCandidates = []
for (const c of candidates) {
	const typeName = `${pascalCase(c.name)}Params`
	const key = `${c.typesFile}::${typeName}`
	if (collidingKeys.has(key)) {
		flagged.push({
			name: c.name,
			file: c.file,
			reason: `generated interface name '${typeName}' collides with another function of the same name targeting the same types.ts`,
		})
	} else {
		safeCandidates.push(c)
	}
}

let fixed = 0

for (const { fn, nameNode, name, file, filePath, typesFile, typesFileIsNew, externalTypeRefs, refs } of safeCandidates) {
	const params = fn.getParameters()
	const typeName = `${pascalCase(name)}Params`

	console.log(
		`${CHECK_ONLY ? "[dry-run] " : ""}${file}: ${name}(${params.map((p) => p.getName()).join(", ")}) -> ${name}({ ${params.map((p) => p.getName()).join(", ")} }: ${typeName})` +
			(typesFileIsNew ? ` (creates ${path.relative(SRC_ROOT, typesFile).replace(/\\/g, "/")})` : ""),
	)
	fixed++
	if (CHECK_ONLY) continue

	const typesSourceFile =
		project.getSourceFile(typesFile) ??
		project.createSourceFile(typesFile, "", { overwrite: false })

	// Import every external type the new interface's fields depend on —
	// skip ones already declared in types.ts itself.
	for (const { name: refName, declSourceFile } of externalTypeRefs) {
		if (declSourceFile === typesSourceFile) continue
		const refImportSpecifier = (() => {
			const rel = path
				.relative(path.dirname(typesFile), declSourceFile.getFilePath())
				.replace(/\\/g, "/")
				.replace(/\.tsx?$/, "")
			return rel.startsWith(".") ? rel : `./${rel}`
		})()
		const existingRefImport = typesSourceFile
			.getImportDeclarations()
			.find((imp) => imp.getModuleSpecifierValue() === refImportSpecifier)
		if (existingRefImport) {
			if (!existingRefImport.getNamedImports().some((n) => n.getName() === refName)) {
				existingRefImport.addNamedImport(
					existingRefImport.isTypeOnly() ? { name: refName } : { name: refName, isTypeOnly: true },
				)
			}
		} else {
			typesSourceFile.addImportDeclaration({
				moduleSpecifier: refImportSpecifier,
				namedImports: [{ name: refName }],
				isTypeOnly: true,
			})
		}
	}

	typesSourceFile.addInterface({
		name: typeName,
		isExported: true,
		properties: params.map((p) => ({
			name: p.getName(),
			type: p.getTypeNode()?.getText() ?? p.getType().getText(p),
			hasQuestionToken: p.hasQuestionToken(),
		})),
	})

	const relImport = path
		.relative(path.dirname(filePath), typesFile)
		.replace(/\\/g, "/")
		.replace(/\.ts$/, "")
	const importSpecifier = relImport.startsWith(".") ? relImport : `./${relImport}`
	const sourceFile = fn.getSourceFile()
	const existingImport = sourceFile
		.getImportDeclarations()
		.find((imp) => imp.getModuleSpecifierValue() === importSpecifier)
	if (existingImport) {
		if (!existingImport.getNamedImports().some((n) => n.getName() === typeName)) {
			// A named import can't be individually marked `type` when the
			// declaration itself is already `import type { ... }` — only add
			// the per-specifier `type` modifier on a value-import declaration.
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
	// equivalent.
	for (const ref of refs) {
		const call = ref.getParent()
		if (!Node.isCallExpression(call)) continue
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
		call.replaceWithText(`${ref.getText()}({ ${objLiteral} })`)
	}

	// Rewrite the function's own parameter list to a single destructured
	// object param.
	const destructureName = `{ ${params.map((p) => p.getName()).join(", ")} }`
	fn.getParameters().forEach((p) => p.remove())
	fn.insertParameter(0, { name: destructureName, type: typeName })
}

if (!CHECK_ONLY) {
	await project.save()
	// ts-morph's printer doesn't know this repo's Biome style (no semicolons,
	// tabs, etc.) — let Biome itself clean up the files it touched.
	const touchedFiles = [
		...new Set(safeCandidates.map(({ filePath }) => filePath)),
		...new Set(safeCandidates.map(({ typesFile }) => typesFile)),
	]
	if (touchedFiles.length > 0) {
		const { execFileSync } = await import("node:child_process")
		execFileSync("npx", ["biome", "format", "--write", ...touchedFiles], {
			stdio: "inherit",
			shell: true,
		})
	}
}

console.log(
	`\n${CHECK_ONLY ? "Would fix" : "Fixed"} ${fixed} function(s). ${flagged.length} flagged for manual review:`,
)
for (const { name, file, reason } of flagged) {
	console.log(`  ${file}: ${name} — ${reason}`)
}

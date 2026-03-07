import React, { useCallback, useMemo, useState } from "react"
import { LANGUAGE } from "@/model/actors/language/languages"
import { PhonemeCatalog } from "@/model/actors/language/languages/types"


function toPercentages(dist: { v: string; w: number }[]): Array<{ v: string; pct: number }> {
	const total = dist.reduce((s, x) => s + x.w, 0)
	return dist
		.map(({ v, w }) => ({ v, pct: total > 0 ? Math.round((w / total) * 100) : 0 }))
		.sort((a, b) => b.pct - a.pct)
}

const WordSection: React.FC<{ title: string; words: string[]; cols?: number }> = ({
	title,
	words,
	cols = 2,
}) => (
	<div>
		<div className="font-mono text-[9px] uppercase tracking-widest text-slate-400 mb-1.5">
			{title}
		</div>
		<div
			className="grid gap-x-3 gap-y-0.5"
			style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
		>
			{words.map((w, i) => (
				<span key={i} className="font-mono text-[12px] text-slate-800 truncate">
					{w}
				</span>
			))}
		</div>
	</div>
)

const PhonemeSection: React.FC<{
	title: string
	entries: { v: string; pct: number }[]
	cap?: number
}> = ({ title, entries, cap = 8 }) => {
	const shown = entries.slice(0, cap)
	const maxPct = Math.max(...shown.map((e) => e.pct), 1)
	return (
		<div>
			<div className="font-mono text-[9px] uppercase tracking-widest text-slate-400 mb-1.5">
				{title}
			</div>
			<div className="space-y-1">
				{shown.map(({ v, pct }) => (
					<div key={v} className="flex items-center gap-2">
						<span className="font-mono text-[11px] text-slate-600 w-6 text-right leading-none">
							{v}
						</span>
						<div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
							<div
								className="h-full bg-slate-500 rounded-full"
								style={{ width: `${(pct / maxPct) * 100}%` }}
							/>
						</div>
						<span className="font-mono text-[9px] text-slate-400 w-7 text-right">
							{pct}%
						</span>
					</div>
				))}
			</div>
		</div>
	)
}

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<span className="font-mono text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
		{children}
	</span>
)

// ─── Main component ───────────────────────────────────────────────────────────

interface LanguageLabProps {
	/** If provided, shows a back button that calls this */
	onBack?: () => void
	/** Starting seed value */
	initialSeed?: string
}

export const LanguageLab: React.FC<LanguageLabProps> = ({
	onBack,
	initialSeed = "nexus",
}) => {
	const [seed, setSeed] = useState(initialSeed)
	const [draft, setDraft] = useState(initialSeed)
	const [lang, setLang] = useState(() => LANGUAGE.spawn(initialSeed))
	const [sampleVersion, setSampleVersion] = useState(0)
	const [rightTab, setRightTab] = useState<"consonants" | "vowels">("consonants")

	const data = useMemo(() => {
		const gen = (key: string, n: number) =>
			Array.from({ length: n }, () =>
				LANGUAGE.word.simple({ lang, key, repeat: sampleVersion > 0 }).word,
			)

		return {
			settlements: gen("settlement", 8),
			regions: gen("region", 6),
			cultures: gen("culture", 4),
			maleNames: gen("male", 8),
			femaleNames: gen("female", 8),
			vStart: toPercentages(lang.phonemes[PhonemeCatalog.START_VOWEL]),
			vFront: toPercentages(lang.phonemes[PhonemeCatalog.FRONT_VOWEL]),
			vMiddle: toPercentages(lang.phonemes[PhonemeCatalog.MIDDLE_VOWEL]),
			vBack: toPercentages(lang.phonemes[PhonemeCatalog.BACK_VOWEL]),
			vEnd: toPercentages(lang.phonemes[PhonemeCatalog.END_VOWEL]),
			cStart: toPercentages(lang.phonemes[PhonemeCatalog.START_CONSONANT]),
			cMid: toPercentages(lang.phonemes[PhonemeCatalog.MIDDLE_CONSONANT]),
			cEnd: toPercentages(lang.phonemes[PhonemeCatalog.END_CONSONANT]),
		}
	}, [lang, sampleVersion])

	const commit = useCallback(() => {
		setSeed(draft)
		setLang(LANGUAGE.spawn(draft))
		setSampleVersion(0)
	}, [draft])
	const randomize = useCallback(() => {
		const s = crypto.randomUUID().slice(0, 8)
		setDraft(s)
		setSeed(s)
		setLang(LANGUAGE.spawn(s))
		setSampleVersion(0)
	}, [])
	const resampleWords = useCallback(() => setSampleVersion((v) => v + 1), [])

	const classification = useMemo(() => LANGUAGE.classify(lang), [lang])

	const endingLabel =
		lang.ending === PhonemeCatalog.MIDDLE_VOWEL ? "vowel endings" : "consonant endings"
	const stopLabel =
		lang.stop === "'"
			? `apostrophe · ${Math.round(lang.stopChance * 100)}%`
			: lang.stop === "-"
				? "hyphen-joined"
				: null

	return (
		<div
			className={`w-full h-full flex flex-col bg-white overflow-hidden ${
				onBack ? "animate-[cm-fade-in_400ms_ease-out]" : ""
			}`}
		>
			{/* Header */}
			<div className="flex-none flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-slate-50/40">
				{onBack && (
					<button
						onClick={onBack}
						className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-700"
						title="Back to Genesis"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M19 12H5M12 5l-7 7 7 7" />
						</svg>
					</button>
				)}

				<span className="font-mono text-[10px] text-slate-400">
					Procedural Phonology Engine
				</span>

				{/* Seed control */}
				<div className="ml-auto flex items-center gap-2">
					<span className="font-mono text-[9px] text-slate-400 uppercase tracking-wider">
						Seed
					</span>
					<div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1 focus-within:ring-1 focus-within:ring-slate-400 transition-all">
						<input
							type="text"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && commit()}
							className="font-mono text-[11px] text-slate-800 w-24 bg-transparent border-none outline-none focus:ring-0"
							placeholder="seed…"
						/>
						<button
							onClick={commit}
							className="font-mono text-[9px] text-slate-400 hover:text-slate-700 uppercase tracking-wider transition-colors"
						>
							Apply
						</button>
					</div>
					<button
						onClick={randomize}
						className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
						title="Random seed"
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>
				</div>
			</div>

			{/* Two-column content */}
			<div className="flex-1 min-h-0 flex overflow-hidden">
				{/* Left: Word samples */}
				<div className="w-1/2 flex-none flex flex-col gap-5 px-6 py-5 overflow-y-auto border-r border-slate-100">
					<WordSection title="Settlements" words={data.settlements} />
					<WordSection title="Regions" words={data.regions} />
					<WordSection title="Culture names" words={data.cultures} cols={2} />

					<div className="grid grid-cols-2 gap-4">
						<WordSection title="Names ♂" words={data.maleNames} cols={1} />
						<WordSection title="Names ♀" words={data.femaleNames} cols={1} />
					</div>

					<button
						onClick={resampleWords}
						className="mt-2 self-start font-mono text-[10px] uppercase tracking-widest px-2.5 py-1.5 rounded border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
						title="Resample words without changing language seed"
					>
						Regenerate samples
					</button>
				</div>

				{/* Right: Phonology */}
				<div className="flex-1 flex flex-col min-h-0 px-6 py-5">
					<div className="flex-none flex items-center gap-1 mb-4">
						{(["consonants", "vowels"] as const).map((tab) => (
							<button
								key={tab}
								onClick={() => setRightTab(tab)}
								className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded transition-colors ${
									rightTab === tab
										? "bg-slate-200 text-slate-700"
										: "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
								}`}
							>
								{tab}
							</button>
						))}
						<div className="ml-auto flex flex-wrap items-center gap-1">
							<Chip>{lang.phonemeClass}</Chip>
							<Chip>{endingLabel}</Chip>
							{classification.extType && <Chip>{classification.extType}</Chip>}
							{classification.orthoStyle && <Chip>{classification.orthoStyle}</Chip>}
							{classification.hasGemination && <Chip>gemination</Chip>}
							{stopLabel && <Chip>{stopLabel}</Chip>}
							{lang.surnames.patronymic && <Chip>patronymic</Chip>}
						</div>
					</div>

					<div className="flex-1 min-h-0 overflow-y-auto">
						{rightTab === "vowels" && (
							<div className="space-y-5">
								<PhonemeSection title="Vowels · Start" entries={data.vStart} cap={10} />
								<PhonemeSection title="Vowels · Front" entries={data.vFront} cap={10} />
								<PhonemeSection title="Vowels · Middle" entries={data.vMiddle} cap={10} />
								<PhonemeSection title="Vowels · Back" entries={data.vBack} cap={10} />
								<PhonemeSection title="Vowels · End" entries={data.vEnd} cap={10} />
							</div>
						)}

						{rightTab === "consonants" && (
							<div className="space-y-5">
								<PhonemeSection title="Consonants · Initial" entries={data.cStart} cap={10} />
								<PhonemeSection title="Consonants · Medial" entries={data.cMid} cap={10} />
								<PhonemeSection title="Consonants · Final" entries={data.cEnd} cap={10} />
							</div>
						)}
					</div>
				</div>
			</div>

			{onBack && (
				<div className="flex-none px-6 py-2 border-t border-slate-100 bg-slate-50/40">
					<span className="font-mono text-[9px] text-slate-300 uppercase tracking-widest">
						Change seed to regenerate · All words are phonologically consistent per language
						rules
					</span>
				</div>
			)}
		</div>
	)
}

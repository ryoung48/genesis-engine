import React, { useCallback, useMemo, useState } from "react"
import { LANGUAGE } from "@/model/actors/language2"
import { CultureConfig } from "@/model/actors/language2/types"

const NAMES_PER_PROFILE = 16

// ─── Profile card ─────────────────────────────────────────────────────────────

interface ProfileCardProps {
	config: CultureConfig
	names: string[]
	selected: boolean
	onClick: () => void
}

const PROFILE_ACCENTS: Record<string, string> = {
	Talhari: "#6ee7b7",   // emerald
	Durgrath: "#fca5a5",  // red
	"Bassāni": "#93c5fd", // blue
	Tsekhari: "#c4b5fd",  // violet
}

const ProfileCard: React.FC<ProfileCardProps> = ({
	config,
	names,
	selected,
	onClick,
}) => {
	const accent = PROFILE_ACCENTS[config.name] ?? "#e2e8f0"

	return (
		<div
			onClick={onClick}
			className={`flex-1 flex flex-col cursor-pointer transition-all border-t-2 ${
				selected
					? "bg-white shadow-sm"
					: "bg-slate-50/60 hover:bg-slate-50"
			}`}
			style={{ borderTopColor: accent }}
		>
			{/* Profile header */}
			<div className="px-5 pt-5 pb-3 border-b border-slate-100">
				<div className="flex items-center gap-2 mb-1">
					<div
						className="w-2 h-2 rounded-full flex-none"
						style={{ backgroundColor: accent }}
					/>
					<span className="font-mono text-[11px] font-bold uppercase tracking-widest text-slate-700">
						{config.name}
					</span>
				</div>
				<p className="text-[10px] text-slate-400 leading-snug">
					{config.description}
				</p>
			</div>

			{/* Traits */}
			<div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap gap-1">
				{[
					config.stressRule.replace(/_/g, " "),
					`${config.syllableCount.min}–${config.syllableCount.max} syl`,
					config.sspMode + " SSP",
					config.geminationEnabled ? "gemination" : null,
					config.glottalMode !== "none" ? "glottal" : null,
				]
					.filter(Boolean)
					.map((trait) => (
						<span
							key={trait}
							className="font-mono text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded"
						>
							{trait}
						</span>
					))}
			</div>

			{/* Generated names */}
			<div className="flex-1 px-5 py-3 overflow-hidden">
				<div className="grid grid-cols-2 gap-x-2 gap-y-1">
					{names.map((name, i) => (
						<span
							key={i}
							className="font-mono text-sm text-slate-800 truncate"
						>
							{name}
						</span>
					))}
				</div>
			</div>

			{/* Phoneme sample */}
			<div className="px-5 py-2.5 border-t border-slate-100">
				<div className="flex items-baseline gap-1 flex-wrap">
					<span className="font-mono text-[9px] text-slate-400 uppercase tracking-wider mr-0.5">
						V
					</span>
					{config.vowels.slice(0, 8).map((v) => (
						<span key={v.ipa} className="font-mono text-[10px] text-slate-500">
							{v.ipa}
						</span>
					))}
					<span className="mx-1 text-slate-200">|</span>
					<span className="font-mono text-[9px] text-slate-400 uppercase tracking-wider mr-0.5">
						C
					</span>
					{config.consonants.slice(0, 10).map((c) => (
						<span key={c.ipa} className="font-mono text-[10px] text-slate-500">
							{c.ipa}
						</span>
					))}
				</div>
			</div>
		</div>
	)
}

// ─── Detail pane (selected profile) ──────────────────────────────────────────

interface DetailPaneProps {
	config: CultureConfig
	names: string[]
}

const DetailPane: React.FC<DetailPaneProps> = ({ config, names }) => {
	const accent = PROFILE_ACCENTS[config.name] ?? "#e2e8f0"
	return (
		<div className="border-t border-slate-100 bg-white px-8 py-5">
			<div className="flex items-center gap-3 mb-3">
				<div
					className="w-2.5 h-2.5 rounded-full"
					style={{ backgroundColor: accent }}
				/>
				<span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
					{config.name} — full name list
				</span>
			</div>
			<div className="grid grid-cols-8 gap-x-3 gap-y-1">
				{names.map((name, i) => (
					<span key={i} className="font-mono text-sm text-slate-800 truncate">
						{name}
					</span>
				))}
			</div>
		</div>
	)
}

// ─── NameLab root ─────────────────────────────────────────────────────────────

interface NameLabProps {
	onBack: () => void
}

export const NameLab: React.FC<NameLabProps> = ({ onBack }) => {
	const [seed, setSeed] = useState("nexus")
	const [draftSeed, setDraftSeed] = useState("nexus")
	const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

	const namesByProfile = useMemo<string[][]>(() => {
		return LANGUAGE.profiles.map((profile) =>
			LANGUAGE.batch(profile, NAMES_PER_PROFILE * 2, seed),
		)
	}, [seed])

	const commit = useCallback(() => setSeed(draftSeed), [draftSeed])

	const randomise = useCallback(() => {
		const s = crypto.randomUUID().slice(0, 8)
		setDraftSeed(s)
		setSeed(s)
	}, [])

	const selectedProfile =
		selectedIdx !== null ? LANGUAGE.profiles[selectedIdx] : null
	const selectedNames =
		selectedIdx !== null ? namesByProfile[selectedIdx] : null

	return (
		<div className="w-full h-full flex flex-col bg-white animate-[cm-fade-in_400ms_ease-out]">
			{/* Header */}
			<div className="flex-none flex items-center gap-4 px-8 py-4 border-b border-slate-100 bg-slate-50/60">
				<button
					onClick={onBack}
					className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-700"
					title="Back to Genesis"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M19 12H5M12 5l-7 7 7 7" />
					</svg>
				</button>

				<div>
					<span className="font-mono text-[11px] font-bold uppercase tracking-widest text-slate-700">
						Name Lab
					</span>
					<span className="ml-3 font-mono text-[10px] text-slate-400">
						Procedural phonology engine — {LANGUAGE.profiles.length} culture
						profiles
					</span>
				</div>

				<div className="ml-auto flex items-center gap-2">
					<span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
						Seed
					</span>
					<div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1 focus-within:ring-1 focus-within:ring-slate-400 transition-all">
						<input
							type="text"
							value={draftSeed}
							onChange={(e) => setDraftSeed(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && commit()}
							className="font-mono text-[11px] text-slate-800 w-28 bg-transparent border-none outline-none focus:ring-0"
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
						onClick={randomise}
						className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
						title="Random seed"
					>
						<svg
							width="13"
							height="13"
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

			{/* Profile columns */}
			<div className="flex-1 min-h-0 flex overflow-hidden">
				{LANGUAGE.profiles.map((profile, i) => (
					<ProfileCard
						key={profile.name}
						config={profile}
						names={namesByProfile[i].slice(0, NAMES_PER_PROFILE)}
						selected={selectedIdx === i}
						onClick={() =>
							setSelectedIdx((prev) => (prev === i ? null : i))
						}
					/>
				))}
			</div>

			{/* Expanded detail row */}
			{selectedProfile && selectedNames && (
				<div className="flex-none">
					<DetailPane
						config={selectedProfile}
						names={selectedNames}
					/>
				</div>
			)}

			{/* Footer hint */}
			<div className="flex-none px-8 py-2 border-t border-slate-100 bg-slate-50/40">
				<span className="font-mono text-[9px] text-slate-300 uppercase tracking-widest">
					Click a column to expand · Change seed to regenerate · All names are
					phonologically validated per culture rules
				</span>
			</div>
		</div>
	)
}

import React from "react"
import { TRADITIONS } from "@/model/actors/culture/traditions"
import { TEXT } from "@/model/utilities/text"

interface HeritageTabProps {
    selectedHeritage: number
    onCultureSelect: (cultureIdx: number) => void
}

export const HeritageTab: React.FC<HeritageTabProps> = ({
    selectedHeritage,
    onCultureSelect,
}) => {
    const heritage = window.world.heritages?.[selectedHeritage]
    if (!heritage) {
        return (
            <div className="text-[10px] text-gray-400 text-center py-6">
                Heritage not found
            </div>
        )
    }

    const cultureIdxs = Array.from(heritage.cultures)
    const cultures = cultureIdxs.map((idx) => window.world.cultures[idx]).filter(Boolean)

    // Count total provinces across all cultures in this heritage
    const totalProvinces = cultures.reduce(
        (sum, c) => sum + c.provinces.size,
        0,
    )

    return (
        <div className="h-full overflow-y-auto">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
                <div
                    className="w-3 h-3 border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: heritage.color }}
                />
                <div className="text-sm font-bold text-gray-900">
                    {heritage.name || `Heritage ${heritage.idx}`}
                </div>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 px-1">
                <div className="flex gap-1.5 items-baseline">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Cultures
                    </div>
                    <div className="text-sm font-bold text-gray-900 leading-none">
                        {cultures.length}
                    </div>
                </div>
                <div className="flex gap-1.5 items-baseline">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Provinces
                    </div>
                    <div className="text-sm font-bold text-gray-900 leading-none">
                        {totalProvinces}
                    </div>
                </div>
                <div className="flex gap-1.5 items-baseline">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Neighbors
                    </div>
                    <div className="text-sm font-bold text-gray-900 leading-none">
                        {heritage.neighbors.size}
                    </div>
                </div>
            </div>

            {/* Cultures list */}
            <div className="px-1">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Cultures
                </div>
                <div className="space-y-1">
                    {cultures
                        .sort((a, b) => b.provinces.size - a.provinces.size)
                        .map((culture) => (
                            <button
                                key={culture.idx}
                                onClick={() => onCultureSelect(culture.idx)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-left bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-colors group"
                            >
                                <div
                                    className="w-2.5 h-2.5 flex-shrink-0 border border-black/10"
                                    style={{ backgroundColor: culture.color }}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-bold text-gray-800 truncate">
                                        {culture.name || `Culture ${culture.idx}`}
                                    </div>
                                    <div className="text-[9px] text-gray-400 font-mono flex items-center gap-1 flex-wrap">
                                        <span>{TEXT.titleCase(culture.ethos)} · {culture.provinces.size} provinces</span>
                                        {culture.traditions.map((key) => {
                                            const name = TRADITIONS.find((t) => t.key === key)?.name ?? key
                                            return (
                                                <span key={key} className="text-[8px] text-gray-500 bg-gray-100 border border-gray-200 px-1 py-px">
                                                    {name}
                                                </span>
                                            )
                                        })}
                                    </div>
                                </div>
                                <span className="text-[9px] text-gray-300 group-hover:text-gray-500 transition-colors">
                                    ›
                                </span>
                            </button>
                        ))}
                </div>
            </div>
        </div>
    )
}

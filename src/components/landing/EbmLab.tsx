import { useEffect, useState, useMemo } from "react"
import { EnergyBalanceModel, EBM } from "@/model/cells/ebm"
import SeasonalTempByLat from "@/components/world/charts/SimulationTab/SeasonalTempByLat"
import * as d3 from "d3"

const EbmLab = ({ onClose }: { onClose: () => void }) => {
    const [obliquity, setObliquity] = useState(23.5)
    const [eccentricity, setEccentricity] = useState(0.017)
    const [landFraction, setLandFraction] = useState(0.3)
    const [modelInstance, setModelInstance] = useState<EnergyBalanceModel | null>(null)

    // Debounce or effect to run model
    useEffect(() => {
        // Create a config object
        const config = {
            orbital: {
                OBLIQUITY: obliquity,
                ECCENTRICITY: eccentricity,
                PERIHELION: 102 // keep default or expose?
            },
            landFraction: new Array(36).fill(landFraction)
        }

        const model = new EnergyBalanceModel(config)
        model.runModel(30, 0.5) // Run for 30 years
        setModelInstance(model)

    }, [obliquity, eccentricity, landFraction])

    const { heat, lats, sampledDays, dayLabels } = useMemo(() => {
        if (!modelInstance) return { heat: [], lats: [], sampledDays: [], dayLabels: [] }

        const heat = modelInstance.temperature
        const lats = modelInstance.lats_deg
        const time = EBM.constants.time

        const sampledDays = []
        const dayLabels = []
        for (let i = 0; i < time.DAYS_PER_YEAR; i += 10) {
            sampledDays.push(i)
            dayLabels.push(`${i}`)
        }

        return { heat, lats, sampledDays, dayLabels }
    }, [modelInstance])



    const colorFn = useMemo(() => {
        return d3.scaleSequential(d3.interpolateSpectral).domain([35, -10])
        // Custom domain for broader visual range? Or use standard EBM color?
        // ebm color uses standard logic. Let's pass undefined to use default, or use a custom one.
        // returning undefined to use component default for now, or we can customize.
        return undefined
    }, [])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm animate-[cm-fade-in_300ms_ease-out]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-[cm-slide-up_400ms_ease-out]">

                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Climate Lab</h2>
                        <p className="text-slate-500 text-sm font-mono mt-1">REAL-TIME EBM SIMULATION</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500 hover:text-slate-900"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="flex-1 flex min-h-0">

                    {/* Sidebar Controls */}
                    <div className="w-80 bg-slate-50 border-r border-slate-100 p-8 flex flex-col gap-8 overflow-y-auto">

                        {/* Obliquity Control */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-baseline">
                                <label className="text-sm font-bold text-slate-700">Axial Tilt</label>
                                <span className="font-mono text-xs text-slate-500">{obliquity.toFixed(1)}°</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="90"
                                step="0.5"
                                value={obliquity}
                                onChange={(e) => setObliquity(parseFloat(e.target.value))}
                                className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Obliquity determines the severity of seasons. <br />
                                Earth: 23.5°
                            </p>
                        </div>

                        {/* Eccentricity Control */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-baseline">
                                <label className="text-sm font-bold text-slate-700">Eccentricity</label>
                                <span className="font-mono text-xs text-slate-500">{eccentricity.toFixed(3)}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="0.2"
                                step="0.001"
                                value={eccentricity}
                                onChange={(e) => setEccentricity(parseFloat(e.target.value))}
                                className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Orbital shape deviation from a circle. <br />
                                Earth: ~0.017
                            </p>
                        </div>

                        {/* Land Fraction Control */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-baseline">
                                <label className="text-sm font-bold text-slate-700">Land Fraction</label>
                                <span className="font-mono text-xs text-slate-500">{(landFraction * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={landFraction}
                                onChange={(e) => setLandFraction(parseFloat(e.target.value))}
                                className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Global ratio of land to ocean surface area.
                            </p>
                        </div>

                    </div>

                    {/* Main Visualization Area */}
                    <div className="flex-1 p-8 overflow-hidden flex flex-col">
                        <div className="flex-1 relative min-h-0 bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                            {heat.length > 0 && (
                                <SeasonalTempByLat
                                    heat={heat}
                                    latRange={lats}
                                    sampledDays={sampledDays}
                                    dayLabels={dayLabels}
                                    colorFn={colorFn}
                                />
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}

export default EbmLab

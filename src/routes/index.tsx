import { useState } from "react";
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute('/')({
    component: HomeComponent,
})

function HomeComponent() {
    const items = useQuery(api.queries.getItems) || [];
    const allChampions = useQuery(api.queries.listChampions) || [];
    const traits = useQuery(api.queries.getTraits) || [];

    const [isWorldRunes, setIsWorldRunes] = useState(false);
    const [selectedEmblemKeys, setSelectedEmblemKeys] = useState<string[]>([]);
    const [selectedChampIds, setSelectedChampIds] = useState<string[]>([]);
    const [blockedChampIds, setBlockedChampIds] = useState<string[]>([]);
    const [teamSize, setTeamSize] = useState(9);
    const [optMode, setOptMode] = useState<"wide" | "deep">("wide");
    const [selectionFilter, setSelectionFilter] = useState<number | null>(null);
    const [blockFilter, setBlockFilter] = useState<number | null>(null);

    const suggest = useAction(api.optimizer.suggestTeams);
    const suggestWorld = useAction(api.optimizer.suggestWorldRunes);

    const [results, setResults] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);

    // Derived: filter emblems based on mode
    const emblems = items.filter(i => {
        if (!i.name?.toLowerCase().includes("emblem")) return false;
        if (!isWorldRunes) return true;
        
        // World Runes mode: only show region emblems
        const traitName = i.name.replace(" Emblem", "");
        const trait = traits.find(t => t.name === traitName);
        return trait?.isRegion;
    });

    const addEmblem = (key: string) => {
        if (isWorldRunes && selectedEmblemKeys.length >= 2) return;
        setSelectedEmblemKeys(prev => [...prev, key]);
    };

    const removeEmblem = (key: string) => {
        setSelectedEmblemKeys(prev => {
            const index = prev.lastIndexOf(key);
            if (index === -1) return prev;
            const next = [...prev];
            next.splice(index, 1);
            return next;
        });
    };

    const getEmblemCount = (key: string) => {
        return selectedEmblemKeys.filter(k => k === key).length;
    };

    const toggleChamp = (id: string) => {
        setSelectedChampIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
        // Automatically unblock if forced
        setBlockedChampIds(prev => prev.filter(i => i !== id));
    };

    const toggleBlockChamp = (id: string) => {
        setBlockedChampIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
        // Automatically unforce if blocked
        setSelectedChampIds(prev => prev.filter(i => i !== id));
    };

    const handleOptimize = async () => {
        setLoading(true);
        setResults(null);
        try {
            if (isWorldRunes) {
                const res = await suggestWorld({
                    emblemIds: selectedEmblemKeys,
                    mustHaveChampIds: selectedChampIds,
                    blockedChampIds: blockedChampIds
                });
                setResults(res);
            } else {
                const res = await suggest({
                    emblemIds: selectedEmblemKeys,
                    teamSize,
                    mode: optMode,
                    mustHaveChampIds: selectedChampIds,
                    blockedChampIds: blockedChampIds
                });
                setResults(res);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getImageUrl = (path?: string) => {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        // Community Dragon path resolution
        const cleanPath = path.toLowerCase().replace("/lol-game-data/assets/", "");
        return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`;
    };

    const filteredSelectionChamps = selectionFilter
        ? allChampions.filter(c => c.cost === selectionFilter)
        : allChampions;

    const filteredBlockChamps = blockFilter
        ? allChampions.filter(c => c.cost === blockFilter)
        : allChampions;

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-gray-100 font-sans p-4 md:p-8">
            <header className="max-w-6xl mx-auto mb-12 text-center">
                <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-yellow-400 via-amber-500 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
                    TFT SET 16 OPTIMIZER
                </h1>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                    Select your emblems and discover the most powerful board combinations.
                </p>
            </header>

            <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Selection Column */}
                <div className="lg:col-span-1 space-y-8 h-screen overflow-scroll sticky top-0">
                    <div className="bg-[#16161f] p-6 rounded-2xl border border-white/5 shadow-2xl space-y-8">
                        <section>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <span className="w-2 h-6 bg-amber-500 rounded-full"></span>
                                    Select Emblems
                                </h2>
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={() => {
                                            const newMode = !isWorldRunes;
                                            setIsWorldRunes(newMode);
                                            setSelectedEmblemKeys([]); // Reset emblems when switching mode
                                        }}
                                        className={`text-[10px] px-2 py-1 rounded border transition-all ${isWorldRunes ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800 border-white/10 text-gray-400'}`}
                                    >
                                        WORLD RUNES
                                    </button>
                                    {selectedEmblemKeys.length > 0 && (
                                        <button
                                            onClick={() => setSelectedEmblemKeys([])}
                                            className="text-xs text-gray-500 hover:text-amber-500 underline uppercase tracking-widest"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                            {isWorldRunes && (
                                <p className="text-[10px] text-purple-400 mb-2 font-bold uppercase tracking-tight">
                                    Choose max 2 region emblems (target 4+ regions)
                                </p>
                            )}
                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                {emblems.map(emblem => {
                                    const count = getEmblemCount(emblem.key!);
                                    return (
                                        <div key={emblem.key} className="relative group">
                                            <button
                                                onClick={() => addEmblem(emblem.key!)}
                                                className={`w-full p-1 rounded-lg transition-all transform active:scale-95 ${count > 0 ? 'ring-2 ring-amber-500 bg-amber-500/20' : 'bg-gray-800/50 hover:bg-gray-700'
                                                    }`}
                                                title={emblem.name}
                                            >
                                                <img
                                                    src={getImageUrl(emblem.iconPath)}
                                                    alt={emblem.name}
                                                    className="w-full aspect-square rounded shadow-lg"
                                                />
                                            </button>

                                            {count > 0 && (
                                                <>
                                                    <div className="absolute -top-2 -right-2 bg-amber-500 text-black rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-black text-[12px] shadow-lg border-2 border-[#16161f] pointer-events-none">
                                                        {count}
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeEmblem(emblem.key!);
                                                        }}
                                                        className="absolute -bottom-1 -left-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs shadow-lg hover:bg-red-600 transition-colors border-2 border-[#16161f]"
                                                    >
                                                        -
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {!isWorldRunes && (
                            <>
                                <section>
                                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                                        Search Strategy
                                    </h2>
                                    <div className="grid grid-cols-2 gap-2 bg-gray-800/50 p-1 rounded-xl">
                                        <button
                                            onClick={() => setOptMode("wide")}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all ${optMode === "wide" ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            Wide
                                        </button>
                                        <button
                                            onClick={() => setOptMode("deep")}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all ${optMode === "deep" ? 'bg-amber-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            Deep
                                        </button>
                                    </div>
                                </section>

                                <section>
                                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <span className="w-2 h-6 bg-amber-500 rounded-full"></span>
                                        Team Size
                                    </h2>
                                    <div className="flex gap-2">
                                        {[7, 8, 9, 10].map(size => (
                                            <button
                                                key={size}
                                                onClick={() => setTeamSize(size)}
                                                className={`flex-1 py-3 rounded-xl font-bold transition-all ${teamSize === size
                                                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                    }`}
                                            >
                                                Lv.{size}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            </>
                        )}

                        <button
                            onClick={handleOptimize}
                            disabled={loading}
                            className={`w-full py-4 bg-gradient-to-br font-black text-xl rounded-2xl shadow-xl transition-all disabled:opacity-50 active:scale-95 ${isWorldRunes ? 'from-purple-400 to-purple-600 text-white shadow-purple-500/20 hover:from-purple-300 hover:to-purple-500' : 'from-amber-400 to-amber-600 text-black shadow-amber-500/20 hover:from-amber-300 hover:to-amber-500'}`}
                        >
                            {loading ? "SEARCHING..." : isWorldRunes ? "ACTIVATE RUNES" : "GENERATE TEAMS"}
                        </button>
                    </div>

                    {/* Champion Selection */}
                    <div className="bg-[#16161f] p-6 rounded-2xl border border-white/5 shadow-2xl space-y-6">
                        <section>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <span className="w-2 h-6 bg-purple-500 rounded-full"></span>
                                    Champion Select
                                </h2>
                                {selectedChampIds.length > 0 && (
                                    <button
                                        onClick={() => setSelectedChampIds([])}
                                        className="text-xs text-gray-500 hover:text-purple-500 underline uppercase tracking-widest"
                                    >
                                        Clear ({selectedChampIds.length})
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mb-4 px-1 leading-relaxed">
                                Forced include: {selectedChampIds.length} / {teamSize}. These units will be prioritized in the search.
                            </p>

                            <div className="flex flex-wrap gap-1 mb-4">
                                <button
                                    onClick={() => setSelectionFilter(null)}
                                    className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${selectionFilter === null ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-500 hover:text-gray-300'}`}
                                >
                                    ALL
                                </button>
                                {[1, 2, 3, 4, 5].map(cost => (
                                    <button
                                        key={cost}
                                        onClick={() => setSelectionFilter(cost)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${selectionFilter === cost ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-500 hover:text-gray-300'}`}
                                    >
                                        ${cost}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                {filteredSelectionChamps.map(champ => {
                                    const isSelected = selectedChampIds.includes(champ._id);
                                    const isBlocked = blockedChampIds.includes(champ._id);

                                    return (
                                        <button
                                            key={champ.key}
                                            onClick={() => toggleChamp(champ._id)}
                                            className={`relative p-0.5 rounded-lg transition-all group ${isSelected ? 'ring-2 ring-purple-500 bg-purple-500/10 shadow-lg' : isBlocked ? 'opacity-20 grayscale cursor-not-allowed' : 'opacity-60 hover:opacity-100'}`}
                                            title={champ.name}
                                        >
                                            <img
                                                src={getImageUrl(champ.iconPath)}
                                                alt={champ.name}
                                                className="w-full aspect-square rounded object-cover"
                                            />
                                            {isSelected && (
                                                <div className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-lg border-2 border-[#16161f]">
                                                    <span className="text-[8px]">★</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        <div className="h-[1px] bg-white/5 w-full"></div>

                        <section>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <span className="w-2 h-6 bg-red-500 rounded-full"></span>
                                    Champion Block
                                </h2>
                                {blockedChampIds.length > 0 && (
                                    <button
                                        onClick={() => setBlockedChampIds([])}
                                        className="text-xs text-gray-500 hover:text-red-500 underline uppercase tracking-widest"
                                    >
                                        Clear ({blockedChampIds.length})
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mb-4 px-1 leading-relaxed">
                                Blacklisted: {blockedChampIds.length}. These units will NEVER appear in the suggested teams.
                            </p>

                            <div className="flex flex-wrap gap-1 mb-4">
                                <button
                                    onClick={() => setBlockFilter(null)}
                                    className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${blockFilter === null ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-500 hover:text-gray-300'}`}
                                >
                                    ALL
                                </button>
                                {[1, 2, 3, 4, 5].map(cost => (
                                    <button
                                        key={cost}
                                        onClick={() => setBlockFilter(cost)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${blockFilter === cost ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-gray-500 hover:text-gray-300'}`}
                                    >
                                        ${cost}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                {filteredBlockChamps.map(champ => {
                                    const isBlocked = blockedChampIds.includes(champ._id);
                                    const isSelected = selectedChampIds.includes(champ._id);

                                    return (
                                        <button
                                            key={champ.key}
                                            onClick={() => toggleBlockChamp(champ._id)}
                                            className={`relative p-0.5 rounded-lg transition-all group ${isBlocked ? 'ring-2 ring-red-500 bg-red-500/20 grayscale-0' : isSelected ? 'opacity-20 grayscale cursor-not-allowed' : 'opacity-60 grayscale hover:grayscale-0 hover:opacity-100'}`}
                                            title={champ.name}
                                        >
                                            <img
                                                src={getImageUrl(champ.iconPath)}
                                                alt={champ.name}
                                                className="w-full aspect-square rounded object-cover"
                                            />
                                            {isBlocked && (
                                                <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-lg border-2 border-[#16161f]">
                                                    <span className="text-[10px] font-bold">✕</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Results Column */}
                <div className="lg:col-span-2 space-y-6">
                    {!results && !loading && (
                        <div className="flex flex-col items-center justify-center h-[500px] text-gray-500 bg-[#16161f]/50 border-2 border-dashed border-white/5 rounded-3xl">
                            <div className="text-6xl mb-4">🔮</div>
                            <p className="text-xl font-medium">Select items and click Generate</p>
                        </div>
                    )}

                    {loading && (
                        <div className="space-y-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-48 bg-gray-800/30 animate-pulse rounded-3xl border border-white/5"></div>
                            ))}
                        </div>
                    )}

                    {results && results.map((team, idx) => (
                        <div
                            key={idx}
                            className="bg-[#16161f] rounded-3xl border border-white/5 overflow-hidden shadow-2xl hover:border-amber-500/30 transition-all group"
                        >
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3">
                                        <span className="text-gray-500 font-mono text-sm uppercase tracking-widest">Board #{idx + 1}</span>
                                        <span className="h-4 w-[1px] bg-white/10"></span>
                                        <span className="text-amber-400 font-bold tracking-tight">POWER: {Math.round(team.score)}</span>
                                    </div>
                                    <div className="flex -space-x-2">
                                        {team.activeTraits.slice(0, 10).map((t: any) => (
                                            <div key={t.key} className="w-8 h-8 rounded-full bg-gray-900 border border-white/10 flex items-center justify-center overflow-hidden" title={`${t.name} (${t.count})`}>
                                                <img src={getImageUrl(t.iconPath)} className="w-5 h-5 object-contain" />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 gap-3">
                                    {team.champions.map((champ: any) => (
                                        <div key={champ.key} className="flex flex-col items-center gap-2">
                                            <div className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 ${champ.cost === 5 ? 'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]' :
                                                champ.cost === 4 ? 'border-purple-500' :
                                                    champ.cost === 3 ? 'border-blue-500' :
                                                        champ.cost === 2 ? 'border-green-500' : 'border-gray-500'
                                                }`}>
                                                <img
                                                    src={getImageUrl(champ.iconPath)}
                                                    alt={champ.name}
                                                    className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all"
                                                />
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-[8px] sm:text-[10px] text-center font-bold py-0.5 uppercase truncate px-1">
                                                    {champ.name}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 flex flex-wrap gap-2">
                                    {team.activeTraits.map((t: any) => {
                                        const isMax = t.tier === t.totalTiers;
                                        const isUnique = t.unique;
                                        const isRegion = t.isRegion;

                                        return (
                                            <div
                                                key={t.key}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isRegion ? 'bg-blue-600/20 border-blue-500 text-blue-400' :
                                                    (isMax || isUnique) ? 'bg-amber-500 border-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.2)]' :
                                                        t.tier >= 2 ? 'bg-gray-800 border-amber-500/50 text-amber-400' : 'bg-gray-800 border-white/5 text-gray-400'
                                                    }`}
                                            >
                                                <div className="relative">
                                                    <img src={getImageUrl(t.iconPath)} className={`w-4 h-4 object-contain ${(isMax || isUnique) ? 'brightness-0' : 'brightness-110'}`} />
                                                </div>
                                                <div className="flex flex-col leading-none">
                                                    <div className="flex items-center gap-1">
                                                        <span>{t.name}</span>
                                                        {isRegion && <span className="text-[8px] bg-blue-500 text-white px-1 rounded">REGION</span>}
                                                    </div>
                                                    {!isUnique && (
                                                        <div className="flex gap-0.5 mt-0.5">
                                                            {t.allMilestones.map((m: number, mi: number) => (
                                                                <div
                                                                    key={mi}
                                                                    className={`w-1 h-1 rounded-full ${t.count >= m ? ((isMax || isUnique) ? 'bg-black' : 'bg-amber-400') : 'bg-white/10'}`}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`ml-1 text-[10px] ${(isMax || isUnique) ? 'opacity-70' : 'text-gray-500'}`}>
                                                    {t.count}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}


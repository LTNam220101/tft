import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { MatchParticipant, PlayerAnalysisResult } from "../../convex/riot";
import { getImageUrl, getSummonerIconUrl } from "~/utils";

export const Route = createFileRoute("/player/$name/$tag")({
    validateSearch: (search: Record<string, unknown>) => ({
        platform: (search.platform as string | undefined) ?? "vn2",
    }),
    component: PlayerComponent,
});

const TIER_COLORS: Record<string, string> = {
    IRON: "text-slate-400", BRONZE: "text-amber-700", SILVER: "text-slate-300",
    GOLD: "text-yellow-400", PLATINUM: "text-cyan-400", EMERALD: "text-emerald-400",
    DIAMOND: "text-blue-400", MASTER: "text-purple-400", GRANDMASTER: "text-red-400",
    CHALLENGER: "text-yellow-300",
};

const TIER_EMBLEM: Record<string, string> = {
    IRON: "⚙", BRONZE: "🥉", SILVER: "🥈", GOLD: "🥇",
    PLATINUM: "💠", EMERALD: "💚", DIAMOND: "💎",
    MASTER: "🔮", GRANDMASTER: "🔴", CHALLENGER: "⭐",
};

function placementBadgeClass(p: number): string {
    if (p === 1) return "bg-yellow-400 text-black font-bold";
    if (p === 2) return "bg-slate-300 text-black font-bold";
    if (p === 3) return "bg-amber-600 text-white font-bold";
    if (p <= 4) return "bg-green-700 text-white font-semibold";
    return "bg-slate-700 text-slate-400";
}

function placementBarClass(place: number): string {
    if (place === 1) return "bg-yellow-400";
    if (place === 2) return "bg-slate-300";
    if (place === 3) return "bg-amber-600";
    if (place <= 4) return "bg-green-600";
    return "bg-slate-600";
}

function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }
function fmt(n: number, decimals = 2): string { return n.toFixed(decimals); }

function formatRound(round: number): string {
    if (round <= 3) return `1-${round}`;
    const r = round - 3;
    const stage = Math.floor((r - 1) / 7) + 2;
    const stageRound = ((r - 1) % 7) + 1;
    return `${stage}-${stageRound}`;
}

function formatMatchDate(ms: number): string {
    const h = Math.floor((Date.now() - ms) / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? "yesterday" : `${d}d ago`;
}

function costBorderClass(cost: number): string {
    if (cost >= 5) return "border-yellow-400";
    if (cost === 4) return "border-purple-400";
    if (cost === 3) return "border-blue-400";
    if (cost === 2) return "border-green-500";
    return "border-gray-600";
}

function traitStyleBg(style: number): string {
    if (style >= 4) return "bg-linear-to-br from-pink-400 to-cyan-300";
    if (style === 3) return "bg-yellow-500";
    if (style === 2) return "bg-slate-400";
    return "bg-amber-800";
}

type TabKey = "matches" | "stats" | "units" | "traits";

function UnitIcon({ unit, xs }: {
    unit: { id: string; tier: number; cost: number; iconPath?: string; name?: string };
    xs?: boolean;
}) {
    const dim = xs ? "w-7 h-7" : "w-8 h-8";
    return (
        <div className="relative shrink-0">
            <img
                src={getImageUrl(unit.iconPath)}
                alt={unit.name ?? unit.id}
                className={`${dim} rounded border-2 ${costBorderClass(unit.cost)} object-cover bg-white/5`}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            {unit.tier >= 2 && (
                <span className="absolute -top-1 left-0 right-0 text-center text-[8px] text-yellow-300 leading-none pointer-events-none">
                    {"★".repeat(unit.tier)}
                </span>
            )}
        </div>
    );
}

function TraitIcon({ trait, xs }: {
    trait: { iconPath?: string; displayName: string; style: number };
    xs?: boolean;
}) {
    const dim = xs ? "w-5 h-5" : "w-6 h-6";
    const imgDim = xs ? "w-3 h-3" : "w-3.5 h-3.5";
    return (
        <div className={`${dim} rounded flex items-center justify-center shrink-0 ${traitStyleBg(trait.style)}`} title={trait.displayName}>
            {trait.iconPath && (
                <img
                    src={getImageUrl(trait.iconPath)}
                    alt={trait.displayName}
                    className={`${imgDim} object-contain`}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
            )}
        </div>
    );
}

function ParticipantRow({ pt, isMe }: { pt: MatchParticipant; isMe: boolean }) {
    const activeTraits = [...pt.traits]
        .filter(t => t.style >= 1)
        .sort((a, b) => b.style - a.style || b.numUnits - a.numUnits)
    const sortedUnits = [...pt.units].sort((a, b) => b.tier - a.tier || b.cost - a.cost);

    return (
        <div className={`flex items-center gap-2 px-3 py-2 text-xs border-l-2 ${isMe ? "bg-amber-500/10 border-amber-400" : "border-transparent"}`}>
            <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 ${placementBadgeClass(pt.placement)}`}>
                {pt.placement}
            </span>
            <span className="text-gray-500 w-12 shrink-0 font-mono tabular-nums">Lv{pt.level}</span>
            <span className="text-gray-500 w-12 shrink-0 font-mono tabular-nums">{formatRound(pt.lastRound)}</span>
            <span className="text-gray-600 w-24 shrink-0 font-mono tabular-nums">{pt.goldLeft}g · {pt.damageDealt}dmg</span>
            <div className="flex gap-0.5 w-28 shrink-0 flex-wrap">
                {activeTraits.map((trait, i) => (
                    <TraitIcon key={i} trait={trait} xs />
                ))}
            </div>
            <div className="flex gap-0.5 flex-wrap flex-1">
                {sortedUnits.map((unit, i) => (
                    <UnitIcon key={i} unit={unit} xs />
                ))}
            </div>
        </div>
    );
}

function PlayerComponent() {
    const { name, tag } = Route.useParams();
    const { platform } = Route.useSearch();

    const analyze = useAction(api.riot.getPlayerAnalysis);
    const [data, setData] = useState<PlayerAnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [count, setCount] = useState<5 | 10 | 20 | 50>(5);
    const [tab, setTab] = useState<TabKey>("matches");
    const [expandedMatch, setExpandedMatch] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setData(null);
        setError(null);
        setExpandedMatch(null);

        analyze({ gameName: decodeURIComponent(name), tagLine: decodeURIComponent(tag), platform, count })
            .then(result => { if (!cancelled) setData(result); })
            .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "An error occurred"); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [name, tag, platform, count, analyze]);

    const tierColor = data?.rankedTFT ? (TIER_COLORS[data.rankedTFT.tier] ?? "text-gray-300") : "text-gray-500";
    const maxPlacementCount = data ? Math.max(...data.placementDist.map(d => d.count), 1) : 1;
    const topCarry = data?.topUnits[0];

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-gray-100 font-sans">
            <div className="max-w-6xl mx-auto px-4 py-6">

                {loading && (
                    <div className="flex gap-5 animate-pulse">
                        <div className="w-65 shrink-0 space-y-3">
                            <div className="h-48 rounded-xl bg-white/5" />
                            <div className="h-36 rounded-xl bg-white/5" />
                        </div>
                        <div className="flex-1 space-y-3">
                            <div className="h-12 rounded-xl bg-white/5" />
                            <div className="h-96 rounded-xl bg-white/5" />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-5 py-4 text-red-300">
                        <span className="font-semibold">Error: </span>{error}
                    </div>
                )}

                {data && (
                    <div className="flex flex-col md:flex-row gap-5 items-start">

                        {/* ── LEFT PANEL ── */}
                        <div className="w-full md:w-65 shrink-0 space-y-3">

                            {/* Avatar + rank */}
                            <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden">
                                <div className="relative">
                                    <img
                                        src={getSummonerIconUrl(data.summoner.profileIconId)}
                                        alt="Summoner icon"
                                        className="w-full aspect-square object-cover"
                                    />
                                    {data.rankedTFT && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
                                            <span className={`text-xl font-black capitalize ${tierColor}`}>
                                                {TIER_EMBLEM[data.rankedTFT.tier] ?? ""} {data.rankedTFT.tier.charAt(0) + data.rankedTFT.tier.slice(1).toLowerCase()} {data.rankedTFT.rank}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="px-4 pb-4 pt-3">
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <span className="text-lg font-black text-white">{data.account.gameName}</span>
                                        <span className="text-gray-500 text-xs">#{data.account.tagLine}</span>
                                    </div>
                                    <div className="text-[11px] text-gray-600 uppercase mt-0.5">{platform} · Lv.{data.summoner.summonerLevel}</div>
                                    {data.rankedTFT ? (
                                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                                            <span className="text-amber-400 font-bold">{data.rankedTFT.leaguePoints} LP</span>
                                            <span className="text-gray-500 text-xs">{data.rankedTFT.wins}W / {data.rankedTFT.losses}L</span>
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-gray-500 text-sm">Unranked</div>
                                    )}
                                </div>
                            </div>

                            {/* Overview stats */}
                            <div className="rounded-xl border border-white/5 bg-[#12121a] px-4 py-4">
                                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Last {data.stats.games} Games</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    {[
                                        ["Avg Place", fmt(data.stats.avgPlacement)],
                                        ["Top 4%", pct(data.stats.top4Rate)],
                                        ["Top 4", data.stats.top4Count],
                                        ["Win%", pct(data.stats.winRate)],
                                        ["Wins", data.stats.winCount],
                                        ["Games", data.stats.games],
                                    ].map(([label, value]) => (
                                        <div key={String(label)}>
                                            <div className="text-[10px] text-gray-600 uppercase">{label}</div>
                                            <div className="text-sm font-bold text-white mt-0.5">{value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top carry */}
                            {topCarry && (
                                <div className="rounded-xl border border-white/5 bg-[#12121a] px-4 py-4">
                                    <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Top Carry</div>
                                    <div className="flex items-center gap-3">
                                        <div className="relative shrink-0">
                                            <img
                                                src={getImageUrl(topCarry.iconPath)}
                                                alt={topCarry.name ?? topCarry.id}
                                                className="w-14 h-14 rounded-lg border-2 border-white/10 object-cover bg-white/5"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                            />
                                            <span className="absolute -bottom-1 -right-1 bg-[#0a0a0f] border border-amber-400/60 text-amber-300 text-[9px] font-bold px-1 rounded">
                                                {"★".repeat(topCarry.maxTier)}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-white">{topCarry.name ?? topCarry.id.replace(/^tft\d+_/i, "")}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">{topCarry.count}× in {count} games</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── RIGHT PANEL ── */}
                        <div className="flex-1 min-w-0 space-y-3">

                            {/* Count selector */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="text-sm text-gray-400">
                                    Recent <span className="text-white font-bold">{data.recentPlacements.length}</span> ranked games
                                </div>
                                <div className="flex gap-1">
                                    {([10, 20, 50] as Array<10 | 20 | 50>).map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setCount(n)}
                                            className={`px-3 py-1 rounded text-xs font-semibold transition-all ${count === n ? "bg-amber-500 text-black" : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="rounded-xl border border-white/5 bg-[#12121a] overflow-hidden">
                                <div className="flex border-b border-white/5">
                                    {(["matches", "stats", "units", "traits"] as Array<TabKey>).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setTab(t)}
                                            className={`px-5 py-3 text-xs font-semibold uppercase tracking-widest transition-all ${tab === t ? "text-amber-400 border-b-2 border-amber-400 -mb-px bg-amber-500/5" : "text-gray-500 hover:text-gray-300"}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                <div className="p-4">

                                    {/* MATCHES TAB */}
                                    {tab === "matches" && (
                                        <div className="space-y-1">
                                            {data.matches.map((match, idx) => {
                                                const isExpanded = expandedMatch === idx;
                                                const p = match.player;
                                                const activeTraits = [...p.traits]
                                                    .filter(t => t.style >= 1)
                                                    .sort((a, b) => b.style - a.style || b.numUnits - a.numUnits)
                                                const sortedUnits = [...p.units].sort((a, b) => b.tier - a.tier || b.cost - a.cost);

                                                return (
                                                    <div key={idx}>
                                                        {/* Match row */}
                                                        <div
                                                            onClick={() => setExpandedMatch(isExpanded ? null : idx)}
                                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isExpanded ? "bg-white/8" : "hover:bg-white/5"}`}
                                                        >
                                                            {/* Placement */}
                                                            <span className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold shrink-0 ${placementBadgeClass(p.placement)}`}>
                                                                {p.placement}
                                                            </span>

                                                            {/* Stats */}
                                                            <div className="w-28 shrink-0 text-xs font-mono tabular-nums">
                                                                <div className="text-gray-400">{p.goldLeft}g · {p.damageDealt}dmg</div>
                                                                <div className="text-gray-600">{formatRound(p.lastRound)} · {formatMatchDate(match.gameDateTime)}</div>
                                                            </div>

                                                            {/* Active traits */}
                                                            <div className="flex gap-1 shrink-0">
                                                                {activeTraits.map((trait, i) => (
                                                                    <TraitIcon key={i} trait={trait} />
                                                                ))}
                                                            </div>

                                                            {/* Units */}
                                                            <div className="flex gap-1 flex-wrap flex-1 justify-end">
                                                                {sortedUnits.map((unit, i) => (
                                                                    <UnitIcon key={i} unit={unit} />
                                                                ))}
                                                            </div>

                                                            {/* Expand arrow */}
                                                            <span className={`text-gray-600 text-xs shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                                                        </div>

                                                        {/* Expanded: all 8 participants */}
                                                        {isExpanded && (
                                                            <div className="mx-2 mb-2 rounded-lg border border-white/5 bg-[#0d0d15] overflow-hidden divide-y divide-white/5">
                                                                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-gray-700 uppercase tracking-widest font-semibold">
                                                                    <span className="w-6 shrink-0">#</span>
                                                                    <span className="w-12 shrink-0">Level</span>
                                                                    <span className="w-12 shrink-0">Round</span>
                                                                    <span className="w-24 shrink-0">Gold · Dmg</span>
                                                                    <span className="w-28 shrink-0">Traits</span>
                                                                    <span>Units</span>
                                                                </div>
                                                                {match.participants.map((pt, i) => (
                                                                    <ParticipantRow key={i} pt={pt} isMe={pt.puuid === data.account.puuid} />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* STATS TAB */}
                                    {tab === "stats" && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Performance</div>
                                                <table className="w-full text-sm">
                                                    <tbody className="divide-y divide-white/5">
                                                        {[
                                                            ["Avg Placement", fmt(data.stats.avgPlacement)],
                                                            ["Top 4%", pct(data.stats.top4Rate)],
                                                            ["Win%", pct(data.stats.winRate)],
                                                            ["Avg Level", fmt(data.stats.avgLevel, 1)],
                                                            ["Avg Damage", Math.round(data.stats.avgDamage)],
                                                            ["Avg Round Elim", fmt(data.stats.avgLastRound, 1)],
                                                            ["Avg Star Level", fmt(data.stats.avgStarLevel, 2)],
                                                            ["Avg Team Cost", fmt(data.stats.avgTeamCost, 1)],
                                                        ].map(([label, value]) => (
                                                            <tr key={String(label)}>
                                                                <td className="py-2 text-gray-400">{label}</td>
                                                                <td className="py-2 text-right font-semibold text-white">{value}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Placement Distribution</div>
                                                <div className="space-y-2">
                                                    {data.placementDist.map(({ place, count: c }) => (
                                                        <div key={place} className="flex items-center gap-3 text-sm">
                                                            <span className="w-4 text-center text-gray-400 font-mono text-xs shrink-0">{place}</span>
                                                            <div className="flex-1 bg-white/5 rounded-full h-3 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${placementBarClass(place)}`}
                                                                    style={{ width: `${(c / maxPlacementCount) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="w-5 text-right text-gray-500 font-mono text-xs shrink-0">{c}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* UNITS TAB */}
                                    {tab === "units" && (
                                        <div>
                                            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-4">Most Played Units</div>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-3">
                                                {data.topUnits.map(unit => (
                                                    <div key={unit.id} className="flex flex-col items-center gap-1.5">
                                                        <div className="relative">
                                                            <img
                                                                src={getImageUrl(unit.iconPath)}
                                                                alt={unit.name ?? unit.id}
                                                                className="w-14 h-14 rounded-lg border border-white/10 object-cover bg-white/5"
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                            />
                                                            <span className="absolute -bottom-1 -right-1 bg-[#0a0a0f] border border-amber-400/60 text-amber-300 text-[9px] font-bold px-1 rounded">
                                                                {"★".repeat(unit.maxTier)}
                                                            </span>
                                                        </div>
                                                        <span className="text-[11px] text-gray-300 text-center leading-tight truncate w-full">
                                                            {unit.name ?? unit.id.replace(/^tft\d+_/i, "")}
                                                        </span>
                                                        <span className="text-[10px] text-gray-600 font-mono">{unit.count}×</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* TRAITS TAB */}
                                    {tab === "traits" && (
                                        <div>
                                            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-4">Most Played Traits</div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                                {data.topTraits.map((trait, i) => (
                                                    <div key={i} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2.5">
                                                        {trait.iconPath && (
                                                            <img
                                                                src={getImageUrl(trait.iconPath)}
                                                                alt={trait.displayName}
                                                                className="w-6 h-6 object-contain shrink-0"
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                            />
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm text-gray-200 truncate">{trait.displayName}</div>
                                                            <div className="text-xs text-gray-600 font-mono">{trait.count}×</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

import { useState, useMemo, useRef, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ACTIVE_SET_KEY } from "../../convex/gameConfig";
import { getImageUrl } from "~/utils";
import { buildTraitTooltipRows } from "../traitTooltip";
import { BuilderBoard3D } from "~/arena/BuilderBoard3D";
import { encodeComp } from "~/rollGame/compParam";
import { AugmentsModal } from "../AugmentsModal";

const TITLE = "TFT Team Builder — T-Flex-T"
const DESCRIPTION = "Build and simulate TFT team compositions on a hex board — place champions, equip items, and track active trait synergies in real time."

export const Route = createFileRoute("/builder")({
    head: () => ({
        meta: [
            { title: TITLE },
            { name: "description", content: DESCRIPTION },
            { property: "og:title", content: TITLE },
            { property: "og:description", content: DESCRIPTION },
            { property: "og:url", content: "https://tflext.gnoulman.com/builder" },
        ],
        links: [
            { rel: "canonical", href: "https://tflext.gnoulman.com/builder" },
        ],
    }),
    component: BuilderComponent,
});

const COST_BORDERS: Record<number, string> = {
    1: "#6b7280",
    2: "#22c55e",
    3: "#3b82f6",
    4: "#a855f7",
    5: "#f59e0b",
};
const costBorder = (cost?: number) => COST_BORDERS[cost ?? 1] ?? "#6b7280";

// ── Unified drag payload ──────────────────────────────────────────────────────
type DragPayload =
    | { kind: "champion"; champKey: string; fromHexIdx: number | null }
    | { kind: "item"; itemKey: string; fromChampKey: string | null };

// ── Trait computation ─────────────────────────────────────────────────────────
type ActiveTrait = {
    key: string; name: string; iconPath?: string;
    count: number; tier: number; totalTiers: number;
    allMilestones: number[]; unique: boolean; isRegion: boolean;
    description?: string; innateConstants?: Record<string, number>; effects?: any[];
};

function getEmblemTraitKey(item: any, traitByName: Map<string, string>): string | null {
    if (!item?.isEmblem || !item.name) return null;
    return traitByName.get(item.name.replace(" Emblem", "")) ?? null;
}

function champHasTraitNatively(champKey: string, traitKey: string, champByKey: Map<string, any>): boolean {
    return (champByKey.get(champKey)?.traits ?? []).some((t: any) => t.id === traitKey);
}

function computeTraits(
    slots: (string | null)[],
    champByKey: Map<string, any>,
    traitByKey: Map<string, any>,
    champItems: Record<string, string[]>,
    itemsByKey: Map<string, any>,
    traitByName: Map<string, string>,
): ActiveTrait[] {
    const counts: Record<string, number> = {};
    for (const key of slots) {
        if (!key) continue;
        const champ = champByKey.get(key);
        for (const t of champ?.traits ?? []) {
            const isElderRiftbeast =
                (key === 'DA_18_ElderDragon' || champ?.name?.toLowerCase().includes('elder dragon')) &&
                (t.id === 'DA_Riftbeast18' || t.name?.toLowerCase().includes('riftbeast'));
            const amount = isElderRiftbeast ? 2 : (t.amount ?? 1);
            counts[t.id] = (counts[t.id] || 0) + amount;
        }
        for (const itemKey of champItems[key] ?? []) {
            const traitKey = getEmblemTraitKey(itemsByKey.get(itemKey), traitByName);
            if (traitKey) counts[traitKey] = (counts[traitKey] || 0) + 1;
        }
    }
    const result: ActiveTrait[] = [];
    for (const [id, count] of Object.entries(counts)) {
        const td = traitByKey.get(id);
        if (!td?.effects) continue;
        const active = td.effects.filter((e: any) => count >= e.min_units);
        result.push({
            key: id, name: td.name ?? id, iconPath: td.iconPath, count,
            tier: active.length, totalTiers: td.effects.length,
            allMilestones: td.effects.map((e: any) => e.min_units as number),
            unique: !!td.unique, isRegion: !!td.isRegion,
            description: td.description, innateConstants: td.innateConstants,
            effects: td.effects,
        });
    }
    return result.sort((a, b) => b.tier - a.tier || b.count - a.count);
}

// ── TraitRow ──────────────────────────────────────────────────────────────────
function TraitRow({ t, isFiltered, onHoverStart, onHoverEnd, onClick }: {
    t: ActiveTrait;
    isFiltered: boolean;
    onHoverStart: (t: ActiveTrait, anchorRect: DOMRect) => void;
    onHoverEnd: () => void;
    onClick: (t: ActiveTrait) => void;
}) {
    const isMax = t.tier === t.totalTiers;
    const isActive = t.tier > 0;
    const cls = isMax || t.unique
        ? "bg-amber-500/15 border-amber-500/60 text-amber-300"
        : isActive ? "bg-white/5 border-white/10 text-gray-200"
        : "bg-transparent border-transparent text-gray-500";
    return (
        <div
            className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-xs cursor-pointer transition-all ${cls} ${isFiltered ? "ring-2 ring-amber-300" : ""}`}
            onMouseEnter={e => onHoverStart(t, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHoverEnd}
            onClick={() => onClick(t)}
        >
            <img
                src={getImageUrl(t.iconPath)} alt={t.name}
                className={`w-4 h-4 object-contain shrink-0 ${isMax || t.unique ? "" : isActive ? "brightness-110" : "grayscale brightness-50"}`}
            />
            <span className="flex-1 font-semibold truncate">{t.name}</span>
            <div className="flex items-center gap-1 shrink-0">
                <span className="font-mono text-[10px]">{t.count}</span>
                {!t.unique && (
                    <div className="flex gap-0.5">
                        {t.allMilestones.map((m, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${t.count >= m ? (isMax ? "bg-amber-400" : "bg-blue-400") : "bg-white/15"}`} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── TraitTooltipPortal ──────────────────────────────────────────────────────────
/** Renders in `document.body` with fixed coords — always on top of surrounding stacking contexts. */
function TraitTooltipPortal({ t, anchorRect }: { t: ActiveTrait; anchorRect: DOMRect }) {
    const rows = buildTraitTooltipRows(t.description, t.effects, t.count, t.innateConstants);

    const style: CSSProperties = {
        position: "fixed",
        left: anchorRect.right + 8,
        top: anchorRect.top,
        zIndex: 2147483647,
    };

    const panel = (
        <div
            className="pointer-events-none w-[min(22rem,calc(100vw-2rem))] max-h-[min(50vh,22rem)] overflow-y-auto overscroll-contain rounded-xl border border-amber-500/30 bg-[#07070c]/98 p-3 text-left text-[11px] leading-snug text-gray-200 shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
            role="tooltip"
            style={style}
        >
            <div className="mb-2 border-b border-white/10 pb-2 font-bold text-amber-300">
                {t.name}{" "}
                <span className="font-mono text-[10px] font-normal text-gray-500">({t.count})</span>
            </div>
            {rows.length === 0 ? (
                <p className="text-gray-500">No trait description available (re-seed or run optimizer after DB update).</p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((r, i) => (
                        <li
                            key={i}
                            className={
                                r.active
                                    ? "text-gray-50 font-medium [text-shadow:0_0_14px_rgba(251,191,36,0.2)]"
                                    : "text-gray-500 text-[10px] leading-relaxed"
                            }
                            dangerouslySetInnerHTML={{ __html: r.html }}
                        />
                    ))}
                </ul>
            )}
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(panel, document.body);
}

// ── ItemTooltipPortal ──────────────────────────────────────────────────────────
function ItemTooltipPortal({
    item,
    anchorRect,
    allItems,
}: {
    item: any;
    anchorRect: DOMRect;
    allItems: any[];
}) {
    const fxSummary = formatItemEffects(item.effects);
    const comps = useMemo(() => {
        if (!item.composition || item.composition.length < 2) return null;
        const itemMap = new Map<string, any>();
        for (const it of allItems) {
            if (it.key) itemMap.set(it.key, it);
            if (it.nameId) itemMap.set(it.nameId, it);
        }
        return [
            itemMap.get(item.composition[0]) || null,
            itemMap.get(item.composition[1]) || null,
        ];
    }, [item.composition, allItems]);

    const style: CSSProperties = {
        position: "fixed",
        left: Math.max(12, Math.min(anchorRect.left - 100, window.innerWidth - 320)),
        bottom: window.innerHeight - anchorRect.top + 8,
        zIndex: 2147483647,
    };

    const typeBadge = item.isComponent
        ? { label: "Component", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
        : item.itemType === "radiant"
        ? { label: "Radiant", cls: "bg-amber-400/20 text-amber-300 border-amber-400/40" }
        : item.itemType === "artifact"
        ? { label: "Artifact", cls: "bg-orange-500/20 text-orange-300 border-orange-500/40" }
        : item.itemType === "emblem"
        ? { label: "Emblem", cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" }
        : { label: "Completed", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };

    const panel = (
        <div
            className="pointer-events-none w-72 rounded-xl border border-white/15 bg-[#07070c]/98 p-3 text-left text-xs leading-snug text-gray-200 shadow-2xl ring-1 ring-white/10 backdrop-blur-md space-y-2 animate-fadeIn"
            role="tooltip"
            style={style}
        >
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <img src={getImageUrl(item.iconPath)} alt={item.name} className="w-8 h-8 rounded-lg object-cover border border-white/15" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-gray-100 truncate">{item.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${typeBadge.cls}`}>
                            {typeBadge.label}
                        </span>
                    </div>
                    {fxSummary && <p className="text-[10px] text-amber-400/90 font-mono mt-0.5">{fxSummary}</p>}
                </div>
            </div>

            {item.desc && (
                <p className="text-[10px] text-gray-300 leading-relaxed whitespace-pre-line">
                    {item.desc}
                </p>
            )}

            {comps && comps[0] && comps[1] && (
                <div className="pt-1 border-t border-white/10">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 font-semibold">Recipe / Cách ghép:</p>
                    <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                            <img src={getImageUrl(comps[0].iconPath)} alt={comps[0].name} className="w-5 h-5 rounded object-cover shrink-0" />
                            <span className="text-[10px] text-gray-300 truncate">{comps[0].name}</span>
                        </div>
                        <span className="text-gray-500 text-xs font-bold">+</span>
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                            <img src={getImageUrl(comps[1].iconPath)} alt={comps[1].name} className="w-5 h-5 rounded object-cover shrink-0" />
                            <span className="text-[10px] text-gray-300 truncate">{comps[1].name}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(panel, document.body);
}

// ── ChampCard (bottom units picker) ──────────────────────────────────────────
function ChampCard({
    champ, isOnBoard, isSelected,
    onClick, onDragStart,
}: {
    champ: any; isOnBoard: boolean; isSelected: boolean;
    onClick: () => void;
    onDragStart: (e: React.DragEvent) => void;
}) {
    return (
        <div
            className="relative flex flex-col items-center gap-0.5 cursor-pointer select-none group"
            onClick={onClick}
            draggable
            onDragStart={onDragStart}
            title={`${champ.name} ($${champ.cost})`}
        >
            <div
                className={`relative w-12 h-12 rounded-lg overflow-hidden transition-all ${isSelected ? "scale-110" : "hover:scale-105"}`}
                style={{
                    border: `2px solid ${isSelected ? "#f59e0b" : costBorder(champ.cost)}`,
                    boxShadow: isSelected ? "0 0 10px rgba(251,191,36,0.4)" : undefined,
                    opacity: isOnBoard ? 0.5 : 0.8,
                }}
            >
                <img src={getImageUrl(champ.iconPath)} alt={champ.name} className="w-full h-full object-cover object-top" />
                {isOnBoard && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-white text-xs font-black drop-shadow">✓</span>
                    </div>
                )}
                {(champ.key === 'DA_18_ElderDragon' || champ.name?.toLowerCase().includes('elder dragon')) && (
                    <div
                        className="absolute top-0 right-0 px-1 rounded-bl text-[7px] font-bold bg-amber-950/90 text-amber-300 border-l border-b border-amber-500/40"
                        title="Takes 2 slots on board"
                    >
                        2👥
                    </div>
                )}
            </div>
            <span className="text-[8px] text-gray-500 group-hover:text-gray-300 transition-colors w-12 text-center truncate">{champ.name}</span>
        </div>
    );
}

function formatItemEffects(effects?: Record<string, number>): string {
    if (!effects) return "";
    const parts: string[] = [];
    if (effects.Health) parts.push(`+${effects.Health} HP`);
    if (effects.AD) parts.push(`+${Math.round(effects.AD * 100)}% AD`);
    if (effects.AP) parts.push(`+${effects.AP} AP`);
    if (effects.Armor) parts.push(`+${effects.Armor} Armor`);
    if (effects.MagicResist) parts.push(`+${effects.MagicResist} MR`);
    const as = effects.AS ?? effects.AttackSpeed;
    if (as) parts.push(`+${as > 1 ? Math.round(as) : Math.round(as * 100)}% AS`);
    const crit = effects.CritChance;
    if (crit) parts.push(`+${crit > 1 ? Math.round(crit) : Math.round(crit * 100)}% Crit`);
    if (effects.Mana) parts.push(`+${effects.Mana} Mana`);
    return parts.join(", ");
}

// ── ItemCard (bottom items picker) ────────────────────────────────────────────
function ItemCard({
    item,
    onDragStart,
    onHoverStart,
    onHoverEnd,
}: {
    item: any;
    onDragStart: (e: React.DragEvent) => void;
    onHoverStart?: (item: any, rect: DOMRect) => void;
    onHoverEnd?: () => void;
}) {
    return (
        <div
            className="relative cursor-grab active:cursor-grabbing group"
            draggable
            onDragStart={onDragStart}
            onMouseEnter={e => onHoverStart?.(item, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHoverEnd}
        >
            <img
                src={getImageUrl(item.iconPath)} alt={item.name}
                className="w-10 h-10 rounded-lg object-cover border border-white/10 group-hover:border-amber-400/50 transition-all group-hover:scale-105"
            />
            {item.isEmblem && (
                <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-amber-400 rounded-bl-sm" />
            )}
            {item.isComponent && (
                <div className="absolute top-0 left-0 w-2.5 h-2.5 bg-blue-400 rounded-br-sm" />
            )}
        </div>
    );
}

// ── Stat calculation ──────────────────────────────────────────────────────────
type ComputedStats = {
    hp: number; ad: number; ap: number; armor: number; mr: number;
    as: number; mana: number; initialMana: number; range: number; crit: number;
};

const HP_MULT: Record<1 | 2 | 3, number> = { 1: 1.0, 2: 1.8, 3: 3.24 };
const AD_MULT: Record<1 | 2 | 3, number> = { 1: 1.0, 2: 1.5, 3: 2.25 };

function calcStats(
    champ: any,
    star: 1 | 2 | 3,
    equippedItemKeys: string[],
    itemsByKey: Map<string, any>,
): ComputedStats | null {
    const base = champ?.stats;
    if (!base) return null;

    const scaledHp = base.hpPerStar?.[star - 1] ?? ((base.hp ?? 0) * HP_MULT[star]);
    const scaledAd = base.damagePerStar?.[star - 1] ?? ((base.damage ?? 0) * AD_MULT[star]);

    let adPct = 0;    // fractional — 0.10 = +10% of scaled base AD
    let hpFlat = 0;
    let armorFlat = 0;
    let mrFlat = 0;
    let asPct = 0;
    let critFlat = 0;
    let apFlat = 0;

    for (const ik of equippedItemKeys) {
        const fx = itemsByKey.get(ik)?.effects;
        if (!fx) continue;
        if (fx.AD != null) adPct += fx.AD;
        if (fx.Health != null) hpFlat += fx.Health;
        if (fx.Armor != null) armorFlat += fx.Armor;
        if (fx.MagicResist != null) mrFlat += fx.MagicResist;
        if (fx.AP != null) apFlat += fx.AP;

        const asVal = fx.AS ?? fx.AttackSpeed;
        if (asVal != null) {
            asPct += asVal > 1 ? asVal / 100 : asVal;
        }

        const critVal = fx.CritChance;
        if (critVal != null) {
            critFlat += critVal > 1 ? critVal / 100 : critVal;
        }
    }

    return {
        hp: Math.round(scaledHp + hpFlat),
        ad: Math.round(scaledAd * (1 + adPct)),
        ap: 100 + apFlat,
        armor: (base.armor ?? 0) + armorFlat,
        mr: (base.magicResist ?? 0) + mrFlat,
        as: parseFloat(((base.attackSpeed ?? 0) * (1 + asPct)).toFixed(3)),
        mana: base.mana ?? 0,
        initialMana: base.initialMana ?? 0,
        range: base.range ?? 0,
        crit: Math.min(1.0, (base.critChance ?? 0.25) + critFlat),
    };
}

// ── StatPanel ─────────────────────────────────────────────────────────────────
function StatPanel({
    champ, star, equippedItemKeys, itemsByKey, isOnBoard,
    onStarChange, onRemoveFromBoard, onEquipItem,
}: {
    champ: any;
    star: 1 | 2 | 3;
    equippedItemKeys: string[];
    itemsByKey: Map<string, any>;
    isOnBoard: boolean;
    onStarChange: (s: 1 | 2 | 3) => void;
    onRemoveFromBoard: () => void;
    onEquipItem?: (itemKey: string) => void;
}) {
    const stats = calcStats(champ, star, equippedItemKeys, itemsByKey);
    const border = costBorder(champ.cost);

    const getBisItems = useAction(api.typesafeItems.recommendItemsForChampion);
    const [bisData, setBisData] = useState<any | null>(null);
    const [bisLoading, setBisLoading] = useState(false);

    useEffect(() => {
        if (!champ?.key) return;
        let isMounted = true;
        setBisLoading(true);
        getBisItems({ champKey: champ.key })
            .then(res => {
                if (isMounted) setBisData(res);
            })
            .catch(err => {
                console.error("BiS recommendation failed:", err);
            })
            .finally(() => {
                if (isMounted) setBisLoading(false);
            });
        return () => {
            isMounted = false;
        };
    }, [champ?.key]);

    return (
        <div className="w-56 shrink-0 sticky top-4">
            <div className="bg-[#16161f] rounded-2xl border border-white/5 p-3 space-y-3">
                {/* Header */}
                <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0" style={{ border: `2px solid ${border}` }}>
                        <img src={getImageUrl(champ.iconPath)} alt={champ.name} className="w-full h-full object-cover object-top" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-100 truncate">{champ.name}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] text-gray-400 font-mono">${champ.cost}</span>
                            {bisData?.roleNameVi ? (
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 truncate">
                                    <span>{bisData.roleIcon}</span>
                                    <span>{bisData.roleNameVi}</span>
                                </span>
                            ) : champ.role ? (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-gray-400 capitalize">
                                    {champ.role}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Star selector */}
                <div className="flex gap-1">
                    {([1, 2, 3] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => onStarChange(s)}
                            className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                                star === s
                                    ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                                    : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
                            }`}
                        >
                            {"★".repeat(s)}
                        </button>
                    ))}
                </div>

                {/* Star scaling progression for HP & AD */}
                {champ.stats?.hpPerStar && champ.stats?.damagePerStar && (
                    <div className="bg-black/40 rounded-xl p-2 border border-white/5 space-y-1">
                        <div className="flex justify-between items-center text-[9.5px]">
                            <span className="text-gray-400 font-medium">HP (1★/2★/3★):</span>
                            <div className="flex gap-1 font-mono text-[10px]">
                                {champ.stats.hpPerStar.slice(0, 3).map((val: number, idx: number) => (
                                    <span key={idx} className={star === idx + 1 ? "font-bold text-red-400 bg-red-500/20 px-1 rounded" : "text-gray-500"}>
                                        {val}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-[9.5px]">
                            <span className="text-gray-400 font-medium">AD (1★/2★/3★):</span>
                            <div className="flex gap-1 font-mono text-[10px]">
                                {champ.stats.damagePerStar.slice(0, 3).map((val: number, idx: number) => (
                                    <span key={idx} className={star === idx + 1 ? "font-bold text-orange-400 bg-orange-500/20 px-1 rounded" : "text-gray-500"}>
                                        {val}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats */}
                {!stats ? (
                    <p className="text-[10px] text-gray-600 italic text-center py-2">
                        Stats unavailable — re-run seed
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {([
                            { label: "HP",    value: stats.hp,                          color: "text-red-400" },
                            { label: "AD",    value: stats.ad,                          color: "text-orange-400" },
                            { label: "AP",    value: stats.ap,                          color: "text-purple-300" },
                            { label: "Armor", value: stats.armor,                       color: "text-blue-400" },
                            { label: "MR",    value: stats.mr,                          color: "text-purple-400" },
                            { label: "AS",    value: stats.as,                          color: "text-yellow-400" },
                            { label: "Mana",  value: `${stats.initialMana}/${stats.mana}`, color: "text-cyan-400" },
                            { label: "Range", value: stats.range,                       color: "text-gray-300" },
                            { label: "Crit",  value: `${Math.round(stats.crit * 100)}%`, color: "text-pink-400" },
                        ] as const).map(({ label, value, color }) => (
                            <div key={label} className="flex justify-between items-center">
                                <span className="text-[10px] text-gray-500">{label}</span>
                                <span className={`text-[11px] font-mono font-bold ${color}`}>{value}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Items equipped */}
                {equippedItemKeys.length > 0 && stats && (
                    <div className="pt-1 border-t border-white/5">
                        <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5">Items</p>
                        <div className="flex gap-1.5">
                            {equippedItemKeys.map((ik) => {
                                const it = itemsByKey.get(ik);
                                return it ? (
                                    <img key={ik} src={getImageUrl(it.iconPath)} alt={it.name} title={it.name}
                                        className="w-7 h-7 rounded object-cover border border-white/15" />
                                ) : null;
                            })}
                        </div>
                    </div>
                )}

                {/* Champion Ability / Skill */}
                {(champ.ability || bisData?.abilityAnalysis) && (
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-cyan-300 flex items-center gap-1">
                                <span>⚡ Ability</span>
                            </span>
                            {stats && stats.mana > 0 ? (
                                <span className="text-[8.5px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-1 py-0.2 rounded">
                                    💧 {stats.initialMana}/{stats.mana}
                                </span>
                            ) : (
                                <span className="text-[8.5px] text-gray-500 bg-white/5 px-1 py-0.2 rounded font-mono">
                                    Passive
                                </span>
                            )}
                        </div>

                        <div className="bg-black/30 rounded-lg p-2 border border-white/5 space-y-1">
                            <p className="text-[11px] font-bold text-gray-200">
                                {champ.ability?.name || bisData?.abilityAnalysis?.name || "Ability"}
                            </p>
                            
                            {/* Scaling stats tags */}
                            {bisData?.abilityAnalysis?.scalingTags && bisData.abilityAnalysis.scalingTags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                    {bisData.abilityAnalysis.scalingTags.map((tag: string) => (
                                        <span key={tag} className="text-[7.5px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Clean description */}
                            <p className="text-[9.5px] text-gray-300 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-line bg-black/20 p-2 rounded border border-white/5">
                                {champ.ability?.formattedDesc || bisData?.abilityAnalysis?.cleanDescription || champ.ability?.desc || "No detailed description available."}
                            </p>
                        </div>
                    </div>
                )}

                {/* AI BiS Item Recommendations */}
                <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                            <span>✨ Recommended Items (BiS)</span>
                            {bisData?.source === 'jev' && (
                                <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 py-0.2 rounded font-mono">Jev</span>
                            )}
                        </span>
                        {bisLoading && <span className="text-[9px] text-gray-500 animate-pulse">Calculating...</span>}
                    </div>
                    {bisData?.recommendedItems && bisData.recommendedItems.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[9px] text-gray-400 leading-tight italic">
                                {bisData.roleDescription || bisData.recommendedItems[0]?.reason}
                            </p>
                            <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                                {bisData.recommendedItems.map((item: any) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => onEquipItem?.(item.key)}
                                        title={`${item.tier || 'BiS'}: ${item.name} (${item.score}★) — Click to equip`}
                                        className="group relative p-1 rounded bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-400/80 transition flex flex-col items-center cursor-pointer"
                                    >
                                        <img src={getImageUrl(item.iconPath)} alt={item.name} className="w-7 h-7 rounded object-cover" />
                                        <span className="text-[8px] text-amber-400 font-mono mt-0.5 font-bold">{item.score}★</span>
                                        <span className="text-[7px] text-gray-400 font-mono tracking-tighter uppercase">{item.tier || 'BiS'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Remove button */}
                {isOnBoard && (
                    <button
                        onClick={onRemoveFromBoard}
                        className="w-full py-1 rounded-lg text-[10px] text-red-500 border border-red-500/20 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                        Remove from board
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function BuilderComponent() {
    const allChampions = useQuery(api.queries.listChampions, { setKey: ACTIVE_SET_KEY }) ?? [];
    const allTraits    = useQuery(api.queries.getTraits,     { setKey: ACTIVE_SET_KEY }) ?? [];
    const allItems     = useQuery(api.queries.getItems,      { setKey: ACTIVE_SET_KEY }) ?? [];
    const suggest      = useAction(api.optimizer.suggestTeams);
    const critiqueComp = useAction(api.typesafeCritique.critiqueTeamComposition);

    const [teamCritique, setTeamCritique] = useState<any | null>(null);
    const [critiqueLoading, setCritiqueLoading] = useState(false);

    const champByKey = useMemo(() => new Map(allChampions.map(c => [c.key!, c])), [allChampions]);
    const traitByKey = useMemo(() => new Map(allTraits.map(t => [t.key!, t])), [allTraits]);
    const traitByName = useMemo(() => new Map(allTraits.map(t => [t.name!, t.key!])), [allTraits]);
    const itemsByKey = useMemo(() => new Map(allItems.map(i => [i.key!, i])), [allItems]);

    // ── Board ────────────────────────────────────────────────────────────────
    const [slots, setSlots] = useState<(string | null)[]>(Array(28).fill(null));
    const [champItems, setChampItems] = useState<Record<string, string[]>>({});
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [champStars, setChampStars] = useState<Record<string, 1 | 2 | 3>>({});
    const [traitTooltip, setTraitTooltip] = useState<{ t: ActiveTrait; anchorRect: DOMRect } | null>(null);
    const [itemTooltip, setItemTooltip] = useState<{ item: any; anchorRect: DOMRect } | null>(null);
    const [showAugmentsModal, setShowAugmentsModal] = useState(false);

    const handleEquipItem = (itemKey: string) => {
        if (!selectedKey) return;
        setChampItems(prev => {
            const current = prev[selectedKey] ?? [];
            if (current.length < 3 && !current.includes(itemKey)) {
                return { ...prev, [selectedKey]: [...current, itemKey] };
            }
            return prev;
        });
    };

    const handleEvaluateComp = async () => {
        if (slots.filter(Boolean).length === 0) return;
        setCritiqueLoading(true);
        try {
            const res = await critiqueComp({ slots, champItems });
            setTeamCritique(res);
        } catch (e) {
            console.error("Critique failed:", e);
        } finally {
            setCritiqueLoading(false);
        }
    };

    useEffect(() => {
        if (!traitTooltip && !itemTooltip) return;
        const clear = () => {
            setTraitTooltip(null);
            setItemTooltip(null);
        };
        window.addEventListener("scroll", clear, true);
        window.addEventListener("resize", clear);
        return () => {
            window.removeEventListener("scroll", clear, true);
            window.removeEventListener("resize", clear);
        };
    }, [traitTooltip, itemTooltip]);

    // ── Units picker ─────────────────────────────────────────────────────────
    const [champSearch, setChampSearch]     = useState("");
    const [costFilter, setCostFilter]       = useState<number | null>(null);
    const [traitFilter, setTraitFilter]     = useState<string | null>(null);
    const [traitDropdownOpen, setTraitDropdownOpen] = useState(false);

    // ── Items picker ─────────────────────────────────────────────────────────
    const [itemSearch, setItemSearch]           = useState("");
    const [itemTypeFilter, setItemTypeFilter]   = useState<"all" | "component" | "normal" | "emblem" | "radiant" | "artifact">("all");

    // ── Upgrade ──────────────────────────────────────────────────────────────
    const [targetLevel, setTargetLevel]     = useState(9);
    const [upgradeResults, setUpgradeResults] = useState<any[] | null>(null);
    const [upgradeBusy, setUpgradeBusy]     = useState(false);
    const [showUpgrade, setShowUpgrade]     = useState(false);

    // ── DnD ──────────────────────────────────────────────────────────────────
    const dragRef = useRef<DragPayload | null>(null);
    const [dragOverHex, setDragOverHex]     = useState<number | null>(null);
    const [dragKind, setDragKind]           = useState<"champion" | "item" | null>(null);

    // ── Derived ──────────────────────────────────────────────────────────────
    const boardCount = useMemo(() => {
        return slots.reduce((acc, key) => {
            if (!key) return acc;
            const champ = champByKey.get(key);
            const isElder = key === 'DA_18_ElderDragon' || champ?.name?.toLowerCase().includes('elder dragon');
            return acc + (isElder ? 2 : 1);
        }, 0);
    }, [slots, champByKey]);
    const boardChampKeys = useMemo(() => new Set(slots.filter(Boolean) as string[]), [slots]);
    // Stars set here become the roll targets; unset ones default to 2★.
    const rollComp = encodeComp([...boardChampKeys].map((key) => ({ key, star: champStars[key] ?? 2 })));

    const selectedChamp = selectedKey ? champByKey.get(selectedKey) ?? null : null;
    const selectedStar  = (selectedKey ? champStars[selectedKey] : null) ?? 1 as 1 | 2 | 3;
    const selectedItems = selectedKey ? (champItems[selectedKey] ?? []) : [];

    const activeTraits = useMemo(
        () => computeTraits(slots, champByKey, traitByKey, champItems, itemsByKey, traitByName),
        [slots, champByKey, traitByKey, champItems, itemsByKey, traitByName],
    );

    const sortedTraits = useMemo(
        () => [...allTraits].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
        [allTraits],
    );
    const selectedTrait = traitFilter ? traitByKey.get(traitFilter) : null;

    const pickerChamps = useMemo(() => {
        let list = allChampions;
        if (costFilter !== null) list = list.filter(c => c.cost === costFilter);
        if (traitFilter !== null) list = list.filter(c => c.traits?.some((t: any) => t.id === traitFilter));
        if (champSearch.trim()) {
            const q = champSearch.toLowerCase();
            list = list.filter(c => c.name?.toLowerCase().includes(q));
        }
        return list;
    }, [allChampions, costFilter, traitFilter, champSearch]);

    const pickerItems = useMemo(() => {
        let list = allItems;
        if (itemTypeFilter !== "all") {
            list = list.filter(i => {
                if (itemTypeFilter === "component") return i.isComponent || i.itemType === "component";
                if (itemTypeFilter === "emblem") return i.isEmblem || i.itemType === "emblem";
                if (itemTypeFilter === "radiant") return i.itemType === "radiant" || i.name?.toLowerCase().includes("radiant");
                if (itemTypeFilter === "artifact") return i.itemType === "artifact" || i.nameId?.toLowerCase().includes("artifact");
                if (itemTypeFilter === "normal") return !i.isComponent && !i.isEmblem && i.itemType !== "radiant" && i.itemType !== "artifact" && !i.name?.toLowerCase().includes("radiant") && !i.nameId?.toLowerCase().includes("artifact");
                return true;
            });
        }
        if (itemSearch.trim()) {
            const q = itemSearch.toLowerCase();
            list = list.filter(i => i.name?.toLowerCase().includes(q));
        }
        return list;
    }, [allItems, itemTypeFilter, itemSearch]);

    // ── Board interactions ────────────────────────────────────────────────────
    function setChampStar(key: string, star: 1 | 2 | 3) {
        setChampStars(prev => ({ ...prev, [key]: star }));
    }

    function removeSelectedFromBoard() {
        if (!selectedKey) return;
        const key = selectedKey;
        setSlots(prev => prev.map(k => (k === key ? null : k)));
        setChampItems(prev => { const n = { ...prev }; delete n[key]; return n; });
        setSelectedKey(null);
    }

    function handleHexClick(idx: number) {
        const occupant = slots[idx];
        if (occupant) {
            if (selectedKey && selectedKey !== occupant) {
                // Swap selected champion into this hex
                const next = [...slots];
                const oldIdx = next.indexOf(selectedKey);
                if (oldIdx !== -1) next[oldIdx] = occupant;
                next[idx] = selectedKey;
                setSlots(next);
                setSelectedKey(null);
            } else if (selectedKey === occupant) {
                // Deselect
                setSelectedKey(null);
            } else {
                // First click → select for inspection / stat panel
                setSelectedKey(occupant);
            }
        } else if (selectedKey) {
            // Place selected champion into empty hex
            const next = [...slots];
            const oldIdx = next.indexOf(selectedKey);
            if (oldIdx !== -1) next[oldIdx] = null;
            next[idx] = selectedKey;
            setSlots(next);
            setSelectedKey(null);
        }
    }

    function handlePickerChampClick(key: string) {
        if (boardChampKeys.has(key)) {
            // Remove from board
            setSlots(prev => prev.map(k => (k === key ? null : k)));
            setChampItems(prev => { const n = { ...prev }; delete n[key]; return n; });
            if (selectedKey === key) setSelectedKey(null);
        } else if (selectedKey === key) {
            setSelectedKey(null);
        } else {
            // Select for placement OR place in first empty slot
            const firstEmpty = slots.indexOf(null);
            if (firstEmpty !== -1) {
                const next = [...slots];
                next[firstEmpty] = key;
                setSlots(next);
            } else {
                setSelectedKey(key);
            }
        }
    }

    function removeItemFromChamp(champKey: string, slotIdx: number) {
        setChampItems(prev => {
            const n = { ...prev };
            const arr = [...(n[champKey] ?? [])];
            arr.splice(slotIdx, 1);
            n[champKey] = arr;
            return n;
        });
    }

    // ── DnD handlers ─────────────────────────────────────────────────────────
    function startDrag(e: React.DragEvent, payload: DragPayload) {
        e.dataTransfer.effectAllowed = "move";
        dragRef.current = payload;
        setDragKind(payload.kind);
    }

    function endDrag() {
        dragRef.current = null;
        setDragKind(null);
        setDragOverHex(null);
    }

    function handleHexDragOver(e: React.DragEvent, idx: number) {
        const p = dragRef.current;
        if (!p) return;
        const destKey = slots[idx];
        let accepts = p.kind === "champion";
        if (p.kind === "item" && destKey) {
            // Emblems are refused by champions that already have the trait.
            const item = itemsByKey.get(p.itemKey);
            const traitKey = item?.isEmblem ? getEmblemTraitKey(item, traitByName) : null;
            accepts = !(traitKey && champHasTraitNatively(destKey, traitKey, champByKey));
        }
        if (accepts) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverHex(idx);
        } else {
            // Empty hex for an item, or an emblem the champion already has: no-drop cursor, no highlight.
            setDragOverHex(null);
        }
    }

    /** Move a champion between hexes (swapping with any occupant) or place it from the picker. */
    function placeChampion(champKey: string, fromHexIdx: number | null, idx: number) {
        setSlots(prev => {
            const next = [...prev];
            if (fromHexIdx !== null) {
                next[fromHexIdx] = next[idx] ?? null;
                next[idx] = champKey;
            } else {
                const existingIdx = next.indexOf(champKey);
                if (existingIdx !== -1) next[existingIdx] = null;
                next[idx] = champKey;
            }
            return next;
        });
    }

    function handleHexDrop(e: React.DragEvent, idx: number) {
        e.preventDefault();
        const p = dragRef.current;
        if (!p) return;

        if (p.kind === "champion") {
            placeChampion(p.champKey, p.fromHexIdx, idx);
        } else if (p.kind === "item") {
            const { itemKey, fromChampKey } = p;
            const destChampKey = slots[idx];
            if (!destChampKey) { endDrag(); return; }

            // Block emblem if champion already has that trait natively
            const item = itemsByKey.get(itemKey);
            if (item?.isEmblem) {
                const traitKey = getEmblemTraitKey(item, traitByName);
                if (traitKey && champHasTraitNatively(destChampKey, traitKey, champByKey)) {
                    endDrag(); return;
                }
            }

            setChampItems(prev => {
                const n = { ...prev };
                if (fromChampKey && fromChampKey !== destChampKey) {
                    n[fromChampKey] = (n[fromChampKey] ?? []).filter(k => k !== itemKey);
                }
                const current = n[destChampKey] ?? [];
                if (current.length < 3 && !current.includes(itemKey)) {
                    n[destChampKey] = [...current, itemKey];
                }
                return n;
            });
        }
        endDrag();
    }

    // ── Upgrade suggestion ────────────────────────────────────────────────────
    async function handleSuggestUpgrade() {
        const ids = slots
            .filter(Boolean)
            .map(k => champByKey.get(k!)?._id as string | undefined)
            .filter((id): id is string => id !== undefined);
        if (ids.length === 0) return;

        setUpgradeBusy(true);
        setShowUpgrade(true);
        setUpgradeResults(null);
        try {
            const res = await suggest({ emblemIds: [], teamSize: targetLevel, mode: "wide", mustHaveChampIds: ids, blockedChampIds: [] });
            setUpgradeResults(res?.slice(0, 3) ?? []);
        } catch (e) { console.error(e); setUpgradeResults([]); }
        finally { setUpgradeBusy(false); }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#0a0a0f] text-gray-100" onDragEnd={endDrag}>
            <div className="max-w-[1440px] mx-auto p-4 space-y-4">

                {/* Breadcrumb & Actions */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                        <Link to="/" className="text-gray-500 hover:text-amber-400 transition-colors">Optimizer</Link>
                        <span className="text-gray-700">/</span>
                        <span className="text-gray-300 font-semibold">Team Builder (Set 18)</span>
                    </div>

                    <button
                        onClick={() => setShowAugmentsModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-fuchsia-500/20 hover:from-amber-500/30 hover:to-fuchsia-500/30 text-amber-300 rounded-xl border border-amber-500/30 transition shadow-sm hover:shadow cursor-pointer text-xs font-semibold"
                    >
                        <span>✨ Set 18 Augments (Lõi)</span>
                    </button>
                </div>

                {/* ── TOP ROW: Traits + Board ─────────────────────────────── */}
                <div className="flex gap-4 items-start">

                    {/* Traits & AI Critique panel */}
                    <div className="w-48 shrink-0 sticky top-4 space-y-3">
                        <div className="bg-[#16161f] rounded-2xl border border-white/5 p-3">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Traits</h2>
                            {activeTraits.length === 0
                                ? <p className="text-xs text-gray-700 italic text-center py-4">Place champions</p>
                                : <div className="space-y-1">{activeTraits.map(t => (
                                    <TraitRow
                                        key={t.key} t={t}
                                        isFiltered={traitFilter === t.key}
                                        onClick={t => setTraitFilter(p => p === t.key ? null : t.key)}
                                        onHoverStart={(t, anchorRect) => setTraitTooltip({ t, anchorRect })}
                                        onHoverEnd={() => setTraitTooltip(null)}
                                    />
                                ))}</div>
                            }
                        </div>

                        {/* AI Team Critique Card */}
                        <div className="bg-[#16161f] rounded-2xl border border-amber-500/25 p-3 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                                    <span>✨ AI Evaluation</span>
                                    {teamCritique?.source === 'jev' && (
                                        <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 rounded font-mono">Jev</span>
                                    )}
                                </span>
                                <button
                                    onClick={handleEvaluateComp}
                                    disabled={slots.filter(Boolean).length === 0 || critiqueLoading}
                                    className="text-[10px] px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/30 transition disabled:opacity-40 cursor-pointer font-semibold"
                                >
                                    {critiqueLoading ? "Calculating..." : "Analyze"}
                                </button>
                            </div>

                            {teamCritique ? (
                                <div className="space-y-2 text-xs">
                                    <div className="space-y-1 bg-black/30 p-2 rounded-lg border border-white/5">
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400">🛡️ Frontline:</span>
                                            <span className="text-amber-400 font-mono tracking-widest">
                                                {"★".repeat(teamCritique.frontlineRating)}{"☆".repeat(3 - teamCritique.frontlineRating)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400">⚔️ Damage:</span>
                                            <span className="text-amber-400 font-mono tracking-widest">
                                                {"★".repeat(teamCritique.damageRating)}{"☆".repeat(3 - teamCritique.damageRating)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex gap-1 flex-wrap">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${teamCritique.hasArmorShred || teamCritique.hasMagicShred ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                                            {teamCritique.hasArmorShred || teamCritique.hasMagicShred ? "✓ Armor/MR Shred" : "✗ Missing Shred"}
                                        </span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${teamCritique.hasAntiHeal ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                                            {teamCritique.hasAntiHeal ? "✓ Anti-Heal" : "✗ Missing Wound"}
                                        </span>
                                    </div>

                                    <div className="p-2 rounded bg-black/40 border border-white/5 text-[10px] text-gray-300 leading-snug">
                                        {teamCritique.advice}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[10px] text-gray-500 italic">
                                    {slots.filter(Boolean).length > 0 ? "Click 'Analyze' for AI team evaluation." : "Place champions on the board to analyze."}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Board — shrinks slightly when stat panel is open */}
                    <div className="min-w-0 space-y-3" style={{ flex: selectedChamp ? "1 1 0" : "1 1 auto" }}>
                        <div className="bg-[#16161f] rounded-2xl border border-white/5 p-4">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                                    Board <span className="text-amber-400 font-mono">{boardCount}</span>
                                    <span className="text-gray-600"> / 10</span>
                                </span>
                                <div className="flex items-center gap-3">
                                    <Link
                                        to="/roll"
                                        search={{ comp: rollComp }}
                                        disabled={boardChampKeys.size === 0}
                                        className={`text-xs font-bold transition-colors ${boardChampKeys.size === 0 ? "pointer-events-none text-gray-700" : "text-amber-400 hover:text-amber-300"}`}
                                    >
                                        Roll this comp →
                                    </Link>
                                    <button
                                        onClick={() => { setSlots(Array(28).fill(null)); setSelectedKey(null); setChampItems({}); setChampStars({}); }}
                                        className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <BuilderBoard3D
                                slots={slots}
                                champByKey={champByKey}
                                champStars={champStars}
                                champItems={champItems}
                                itemsByKey={itemsByKey}
                                selectedKey={selectedKey}
                                dropHint={dragOverHex !== null && dragKind ? { idx: dragOverHex, kind: dragKind } : null}
                                onHexClick={handleHexClick}
                                onBackgroundClick={() => setSelectedKey(null)}
                                onMove={(fromIdx, toIdx) => {
                                    const key = slots[fromIdx];
                                    if (key) placeChampion(key, fromIdx, toIdx);
                                }}
                                onHexDragOver={handleHexDragOver}
                                onHexDrop={handleHexDrop}
                                onDragLeaveBoard={() => setDragOverHex(null)}
                                onItemRemove={removeItemFromChamp}
                                onItemDragStart={(e, itemKey, fromChampKey) => startDrag(e, { kind: "item", itemKey, fromChampKey })}
                            />

                            {/* Cost legend */}
                            <div className="flex gap-3 mt-2 px-1">
                                {[1, 2, 3, 4, 5].map(c => (
                                    <div key={c} className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full" style={{ background: costBorder(c) }} />
                                        <span className="text-[9px] text-gray-600">${c}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Level-up controls */}
                            <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-3 flex-wrap">
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Suggest Lv.</span>
                                <div className="flex gap-1">
                                    {[7, 8, 9, 10].map(lv => (
                                        <button key={lv} onClick={() => setTargetLevel(lv)}
                                            className={`w-8 h-7 rounded-lg text-xs font-bold transition-all ${targetLevel === lv ? "bg-amber-500 text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                                            {lv}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={handleSuggestUpgrade}
                                    disabled={boardCount === 0 || upgradeBusy}
                                    className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black text-xs font-black rounded-xl hover:from-amber-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                                >
                                    {upgradeBusy ? "Searching…" : `Suggest Lv.${targetLevel} →`}
                                </button>
                            </div>
                        </div>

                        {/* Upgrade results */}
                        {showUpgrade && (
                            <div className="bg-[#16161f] rounded-2xl border border-amber-500/20 p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest">Lv.{targetLevel} Suggestions</h3>
                                    <button onClick={() => setShowUpgrade(false)} className="text-gray-600 hover:text-gray-300 text-xs">✕ Close</button>
                                </div>
                                {upgradeBusy && (
                                    <div className="grid grid-cols-3 gap-3">
                                        {[1,2,3].map(i => <div key={i} className="h-28 bg-white/5 animate-pulse rounded-xl" />)}
                                    </div>
                                )}
                                {upgradeResults?.length === 0 && !upgradeBusy && (
                                    <p className="text-gray-500 text-sm text-center py-4">No suggestions. Add more champions or try a different level.</p>
                                )}
                                {upgradeResults && upgradeResults.length > 0 && (
                                    <div className="grid grid-cols-3 gap-3">
                                        {upgradeResults.map((team: any, ti: number) => {
                                            const added = team.champions.filter((c: any) => !boardChampKeys.has(c.key));
                                            const kept  = team.champions.filter((c: any) => boardChampKeys.has(c.key));
                                            return (
                                                <div key={ti} className="bg-white/3 rounded-xl p-3 border border-white/5 space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] text-gray-500 uppercase">Option {ti + 1}</span>
                                                        <span className="text-[10px] text-amber-400 font-bold">PWR {Math.round(team.score)}</span>
                                                    </div>
                                                    {added.length > 0 && (
                                                        <div>
                                                            <p className="text-[9px] text-amber-400 font-bold uppercase mb-1">Add</p>
                                                            <div className="flex gap-2 flex-wrap">
                                                                {added.map((c: any) => (
                                                                    <div key={c.key} className="relative">
                                                                        <img src={getImageUrl(c.iconPath)} alt={c.name} title={c.name} style={{ width: 44, height: 44, borderRadius: 8, border: `2px solid ${costBorder(c.cost)}`, objectFit: "cover", boxShadow: "0 0 12px rgba(251,191,36,0.3)" }} />
                                                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[9px] font-black text-black">+</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {kept.length > 0 && (
                                                        <div className="flex gap-1 flex-wrap">
                                                            {kept.map((c: any) => (
                                                                <img key={c.key} src={getImageUrl(c.iconPath)} alt={c.name} title={c.name} style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${costBorder(c.cost)}`, objectFit: "cover", opacity: 0.45 }} />
                                                            ))}
                                                        </div>
                                                    )}
                                                    {team.activeTraits && (
                                                        <div className="flex gap-1 flex-wrap pt-1 border-t border-white/5">
                                                            {(team.activeTraits as any[]).slice(0, 5).map((t: any) => (
                                                                <span key={t.key} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${t.tier === t.totalTiers || t.unique ? "bg-amber-500/20 text-amber-300" : t.tier >= 1 ? "bg-white/5 text-gray-400" : "text-gray-600"}`}>
                                                                    <img src={getImageUrl(t.iconPath)} className="w-3 h-3" alt="" />
                                                                    {t.name} {t.count}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stat panel */}
                    {selectedChamp && (
                        <StatPanel
                            champ={selectedChamp}
                            star={selectedStar}
                            equippedItemKeys={selectedItems}
                            itemsByKey={itemsByKey}
                            isOnBoard={boardChampKeys.has(selectedKey!)}
                            onStarChange={s => setChampStar(selectedKey!, s)}
                            onRemoveFromBoard={removeSelectedFromBoard}
                            onEquipItem={handleEquipItem}
                        />
                    )}
                </div>

                {/* ── BOTTOM ROW: Units + Items ───────────────────────────── */}
                <div className="flex gap-0 bg-[#16161f] rounded-2xl border border-white/5 overflow-hidden">

                    {/* ── Units ── */}
                    <div className="flex-[55] min-w-0 p-4 border-r border-white/5">
                        <div className="flex items-center gap-3 mb-3">
                            <h2 className="text-sm font-bold text-gray-200">Units</h2>
                            <span className="text-xs text-gray-500">Click or drag to place</span>
                            <div className="ml-auto flex gap-1">
                                <input
                                    type="text" placeholder="Search…" value={champSearch}
                                    onChange={e => setChampSearch(e.target.value)}
                                    className="w-28 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/30"
                                />
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setTraitDropdownOpen(o => !o)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${traitFilter ? "bg-white/15 border-white/30 text-white" : "border-white/5 text-gray-500 hover:text-gray-300"}`}
                                    >
                                        {selectedTrait?.iconPath && (
                                            <img src={getImageUrl(selectedTrait.iconPath)} alt="" className="w-3 h-3 object-contain" />
                                        )}
                                        <span>{selectedTrait?.name ?? "All traits"}</span>
                                    </button>
                                    {traitDropdownOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setTraitDropdownOpen(false)} />
                                            <div className="absolute right-0 top-full mt-1 z-20 w-40 max-h-60 overflow-y-auto custom-scrollbar bg-[#1c1c26] border border-white/10 rounded-lg shadow-xl py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { setTraitFilter(null); setTraitDropdownOpen(false); }}
                                                    className={`w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] font-semibold ${traitFilter === null ? "text-white bg-white/10" : "text-gray-400 hover:bg-white/5"}`}
                                                >
                                                    All traits
                                                </button>
                                                {sortedTraits.map(t => (
                                                    <button
                                                        key={t.key}
                                                        type="button"
                                                        onClick={() => { setTraitFilter(t.key!); setTraitDropdownOpen(false); }}
                                                        className={`w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] font-semibold ${traitFilter === t.key ? "text-white bg-white/10" : "text-gray-400 hover:bg-white/5"}`}
                                                    >
                                                        {t.iconPath && <img src={getImageUrl(t.iconPath)} alt="" className="w-4 h-4 object-contain shrink-0" />}
                                                        <span className="truncate">{t.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button onClick={() => setCostFilter(null)} className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${costFilter === null ? "bg-white/15 border-white/30 text-white" : "border-white/5 text-gray-500 hover:text-gray-300"}`}>ALL</button>
                                {[1,2,3,4,5].map(c => (
                                    <button key={c} onClick={() => setCostFilter(p => p === c ? null : c)}
                                        className="px-2 py-1 rounded-lg text-[10px] font-bold border transition-all text-gray-400"
                                        style={{ borderColor: costBorder(c), background: costFilter === c ? `${costBorder(c)}33` : undefined, color: costFilter === c ? "#fff" : undefined }}>
                                        ${c}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar" style={{ maxHeight: 260 }}>
                            {pickerChamps.map(champ => (
                                <ChampCard
                                    key={champ.key}
                                    champ={champ}
                                    isOnBoard={boardChampKeys.has(champ.key!)}
                                    isSelected={selectedKey === champ.key}
                                    onClick={() => handlePickerChampClick(champ.key!)}
                                    onDragStart={e => startDrag(e, { kind: "champion", champKey: champ.key!, fromHexIdx: null })}
                                />
                            ))}
                        </div>
                    </div>

                    {/* ── Items ── */}
                    <div className="flex-[45] min-w-0 p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <h2 className="text-sm font-bold text-gray-200">Items</h2>
                            <span className="text-xs text-gray-500">Drag onto a unit</span>
                            <div className="ml-auto flex items-center gap-1">
                                <input
                                    type="text" placeholder="Search…" value={itemSearch}
                                    onChange={e => setItemSearch(e.target.value)}
                                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/30"
                                />
                            </div>
                        </div>
                        {/* Type filter tabs */}
                        <div className="flex gap-1 mb-3 overflow-x-auto pb-0.5 custom-scrollbar">
                            {[
                                { key: "all", label: "All" },
                                { key: "component", label: "Components" },
                                { key: "normal", label: "Completed" },
                                { key: "emblem", label: "Emblems" },
                                { key: "radiant", label: "Radiant" },
                                { key: "artifact", label: "Artifacts" },
                            ].map(t => (
                                <button key={t.key} onClick={() => setItemTypeFilter(t.key as any)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold capitalize border shrink-0 transition-all ${itemTypeFilter === t.key ? "bg-white/15 border-white/30 text-white" : "border-white/5 text-gray-500 hover:text-gray-300"}`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        {allItems.length === 0 ? (
                            <p className="text-xs text-gray-600 italic py-4">No items in DB — re-run seed to load all items.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar" style={{ maxHeight: 220 }}>
                                {pickerItems.map(item => (
                                    <ItemCard
                                        key={item.key}
                                        item={item}
                                        onDragStart={e => startDrag(e, { kind: "item", itemKey: item.key!, fromChampKey: null })}
                                        onHoverStart={(it, rect) => setItemTooltip({ item: it, anchorRect: rect })}
                                        onHoverEnd={() => setItemTooltip(null)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
            {traitTooltip && (
                <TraitTooltipPortal
                    key={`tt-${traitTooltip.t.key}`}
                    t={traitTooltip.t}
                    anchorRect={traitTooltip.anchorRect}
                />
            )}
            {itemTooltip && (
                <ItemTooltipPortal
                    key={`it-${itemTooltip.item.key}`}
                    item={itemTooltip.item}
                    anchorRect={itemTooltip.anchorRect}
                    allItems={allItems}
                />
            )}
            <AugmentsModal
                isOpen={showAugmentsModal}
                onClose={() => setShowAugmentsModal(false)}
            />
        </div>
    );
}

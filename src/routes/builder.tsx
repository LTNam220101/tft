import { useState, useMemo, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ACTIVE_SET_KEY } from "../../convex/gameConfig";
import { getImageUrl } from "~/utils";

export const Route = createFileRoute("/builder")({
    component: BuilderComponent,
});

// ── Hex geometry (pointy-top) ────────────────────────────────────────────────
const HEX_W = 72;
const HEX_H = 82;
const HEX_GAP = 4;
const HEX_ROW_OFFSET = Math.round((HEX_W + HEX_GAP) / 2);
const HEX_ROW_OVERLAP = Math.round(HEX_H * 0.25);
const HEX_CLIP = "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)";

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

function computeTraits(
    slots: (string | null)[],
    champByKey: Map<string, any>,
    traitByKey: Map<string, any>,
): ActiveTrait[] {
    const counts: Record<string, number> = {};
    for (const key of slots) {
        if (!key) continue;
        for (const t of champByKey.get(key)?.traits ?? []) {
            counts[t.id] = (counts[t.id] || 0) + 1;
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
function TraitRow({ t }: { t: ActiveTrait }) {
    const isMax = t.tier === t.totalTiers;
    const isActive = t.tier > 0;
    const cls = isMax || t.unique
        ? "bg-amber-500/15 border-amber-500/60 text-amber-300"
        : isActive ? "bg-white/5 border-white/10 text-gray-200"
        : "bg-transparent border-transparent text-gray-500";
    return (
        <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-xs ${cls}`}>
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

// ── HexSlot ───────────────────────────────────────────────────────────────────
// Items are displayed inside the rectangular zone of the hex (no clipping issues).
// Items positioned at bottom:26px, name at bottom:44px — both in the y<75% zone.
function HexSlot({
    champKey, champByKey, equippedItemKeys, itemsByKey,
    isSelected, dropHint,
    onClick, onItemRemove, onItemIconDragStart,
    onChampDragStart,
    onDragOver, onDragLeave, onDrop,
}: {
    champKey: string | null;
    champByKey: Map<string, any>;
    equippedItemKeys: string[];
    itemsByKey: Map<string, any>;
    isSelected: boolean;
    dropHint: "champion" | "item" | null; // type of drag currently hovering
    onClick: () => void;
    onItemRemove: (slotIdx: number) => void;
    onItemIconDragStart: (e: React.DragEvent, itemKey: string, fromChampKey: string) => void;
    onChampDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
}) {
    const champ = champKey ? champByKey.get(champKey) : null;

    const outerBg = dropHint === "champion"
        ? champ ? "#d97706" : "#3b82f6"
        : dropHint === "item"
            ? "#22c55e"
            : champ ? costBorder(champ.cost) : "rgba(255,255,255,0.08)";

    return (
        <div
            style={{ width: HEX_W, height: HEX_H, position: "relative", cursor: "pointer", flexShrink: 0 }}
            draggable={!!champ}
            onClick={onClick}
            onDragStart={onChampDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Border (clipped) */}
            <div style={{ position: "absolute", inset: 0, clipPath: HEX_CLIP, background: outerBg, transition: "background 0.1s" }} />
            {/* Fill (clipped) */}
            <div style={{ position: "absolute", inset: 2, clipPath: HEX_CLIP, overflow: "hidden", background: "#0c0c14" }}>
                {champ && (
                    <img
                        src={getImageUrl(champ.iconPath)} alt={champ.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
                    />
                )}
            </div>
            {/* Selected tint */}
            {isSelected && champ && (
                <div style={{ position: "absolute", inset: 2, clipPath: HEX_CLIP, background: "rgba(251,191,36,0.25)", pointerEvents: "none" }} />
            )}
            {/* Champion name — at ~y=55% (in rectangular zone, always full width) */}
            {champ && (
                <div style={{
                    position: "absolute", bottom: 42, left: 0, right: 0,
                    textAlign: "center", fontSize: 8, fontWeight: 700,
                    color: "#fff", textShadow: "0 0 5px #000, 0 1px 3px #000",
                    pointerEvents: "none", padding: "0 4px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {champ.name}
                </div>
            )}
            {/* Equipped items — at ~y=72% (rectangular zone, before bottom triangle) */}
            {champ && equippedItemKeys.length > 0 && (
                <div style={{
                    position: "absolute", bottom: 26, left: 0, right: 0,
                    display: "flex", justifyContent: "center", gap: 2,
                }}>
                    {equippedItemKeys.slice(0, 3).map((ik, i) => {
                        const it = itemsByKey.get(ik);
                        return it ? (
                            <img
                                key={i}
                                src={getImageUrl(it.iconPath)}
                                alt={it.name}
                                draggable
                                title={`${it.name} — click to remove`}
                                onDragStart={e => {
                                    e.stopPropagation();
                                    onItemIconDragStart(e, ik, champKey!);
                                }}
                                onClick={e => { e.stopPropagation(); onItemRemove(i); }}
                                style={{
                                    width: 14, height: 14, borderRadius: 2, cursor: "pointer",
                                    border: "1px solid rgba(255,255,255,0.45)",
                                    boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
                                    objectFit: "cover",
                                }}
                            />
                        ) : null;
                    })}
                </div>
            )}
        </div>
    );
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
            </div>
            <span className="text-[8px] text-gray-500 group-hover:text-gray-300 transition-colors w-12 text-center truncate">{champ.name}</span>
        </div>
    );
}

// ── ItemCard (bottom items picker) ────────────────────────────────────────────
function ItemCard({ item, onDragStart }: { item: any; onDragStart: (e: React.DragEvent) => void }) {
    return (
        <div
            className="relative cursor-grab active:cursor-grabbing group"
            draggable
            onDragStart={onDragStart}
            title={item.name}
        >
            <img
                src={getImageUrl(item.iconPath)} alt={item.name}
                className="w-10 h-10 rounded-lg object-cover border border-white/10 group-hover:border-white/35 transition-all group-hover:scale-105"
            />
            {item.isEmblem && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-amber-400 rounded-bl-sm" />
            )}
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function BuilderComponent() {
    const allChampions = useQuery(api.queries.listChampions, { setKey: ACTIVE_SET_KEY }) ?? [];
    const allTraits    = useQuery(api.queries.getTraits,     { setKey: ACTIVE_SET_KEY }) ?? [];
    const allItems     = useQuery(api.queries.getItems,      { setKey: ACTIVE_SET_KEY }) ?? [];
    const suggest      = useAction(api.optimizer.suggestTeams);

    const champByKey = useMemo(() => new Map(allChampions.map(c => [c.key!, c])), [allChampions]);
    const traitByKey = useMemo(() => new Map(allTraits.map(t => [t.key!, t])), [allTraits]);
    const itemsByKey = useMemo(() => new Map(allItems.map(i => [i.key!, i])), [allItems]);

    // ── Board ────────────────────────────────────────────────────────────────
    const [slots, setSlots] = useState<(string | null)[]>(Array(28).fill(null));
    const [champItems, setChampItems] = useState<Record<string, string[]>>({});
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    // ── Units picker ─────────────────────────────────────────────────────────
    const [champSearch, setChampSearch]     = useState("");
    const [costFilter, setCostFilter]       = useState<number | null>(null);

    // ── Items picker ─────────────────────────────────────────────────────────
    const [itemSearch, setItemSearch]           = useState("");
    const [itemTypeFilter, setItemTypeFilter]   = useState<"all" | "normal" | "emblem" | "radiant" | "artifact">("all");

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
    const boardCount    = useMemo(() => slots.filter(Boolean).length, [slots]);
    const boardChampKeys = useMemo(() => new Set(slots.filter(Boolean) as string[]), [slots]);

    const activeTraits = useMemo(
        () => computeTraits(slots, champByKey, traitByKey),
        [slots, champByKey, traitByKey],
    );

    const pickerChamps = useMemo(() => {
        let list = allChampions;
        if (costFilter !== null) list = list.filter(c => c.cost === costFilter);
        if (champSearch.trim()) {
            const q = champSearch.toLowerCase();
            list = list.filter(c => c.name?.toLowerCase().includes(q));
        }
        return list;
    }, [allChampions, costFilter, champSearch]);

    const pickerItems = useMemo(() => {
        let list = allItems;
        if (itemTypeFilter === "emblem")   list = list.filter(i => i.isEmblem);
        else if (itemTypeFilter === "radiant")  list = list.filter(i => i.name?.toLowerCase().includes("radiant"));
        else if (itemTypeFilter === "artifact") list = list.filter(i => i.nameId?.toLowerCase().includes("artifact"));
        else if (itemTypeFilter === "normal")   list = list.filter(i => !i.isEmblem && !i.name?.toLowerCase().includes("radiant") && !i.nameId?.toLowerCase().includes("artifact"));
        if (itemSearch.trim()) {
            const q = itemSearch.toLowerCase();
            list = list.filter(i => i.name?.toLowerCase().includes(q));
        }
        return list;
    }, [allItems, itemTypeFilter, itemSearch]);

    // ── Board interactions ────────────────────────────────────────────────────
    function handleHexClick(idx: number) {
        const occupant = slots[idx];
        if (occupant) {
            if (selectedKey && selectedKey !== occupant) {
                // Move selected champion here (swap)
                const next = [...slots];
                const oldIdx = next.indexOf(selectedKey);
                if (oldIdx !== -1) next[oldIdx] = occupant;
                next[idx] = selectedKey;
                setSlots(next);
                setSelectedKey(null);
            } else if (selectedKey === occupant) {
                setSelectedKey(null);
            } else {
                // Remove champion
                const next = [...slots];
                next[idx] = null;
                setSlots(next);
                setChampItems(prev => { const n = { ...prev }; delete n[occupant]; return n; });
            }
        } else if (selectedKey) {
            // Place selected champion
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
        // Allow champion drop always; item drop only on occupied hex
        if (p.kind === "champion" || (p.kind === "item" && slots[idx] !== null)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverHex(idx);
        }
    }

    function handleHexDragLeave(e: React.DragEvent) {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
            setDragOverHex(null);
        }
    }

    function handleHexDrop(e: React.DragEvent, idx: number) {
        e.preventDefault();
        const p = dragRef.current;
        if (!p) return;

        if (p.kind === "champion") {
            const { champKey, fromHexIdx } = p;
            setSlots(prev => {
                const next = [...prev];
                if (fromHexIdx !== null) {
                    // Move: swap if destination occupied
                    next[fromHexIdx] = next[idx] ?? null;
                    next[idx] = champKey;
                } else {
                    // Place from picker
                    const existingIdx = next.indexOf(champKey);
                    if (existingIdx !== -1) next[existingIdx] = null;
                    next[idx] = champKey;
                }
                return next;
            });
        } else if (p.kind === "item") {
            const { itemKey, fromChampKey } = p;
            const destChampKey = slots[idx];
            if (!destChampKey) { endDrag(); return; }

            setChampItems(prev => {
                const n = { ...prev };
                // Remove from source if moving between champions
                if (fromChampKey && fromChampKey !== destChampKey) {
                    n[fromChampKey] = (n[fromChampKey] ?? []).filter(k => k !== itemKey);
                }
                // Add to destination (first free slot, no duplicates from same src)
                const current = n[destChampKey] ?? [];
                if (current.length < 3 && !current.includes(itemKey)) {
                    n[destChampKey] = [...current, itemKey];
                } else if (current.length < 3) {
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

                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm">
                    <Link to="/" className="text-gray-500 hover:text-amber-400 transition-colors">Optimizer</Link>
                    <span className="text-gray-700">/</span>
                    <span className="text-gray-300 font-semibold">Team Builder</span>
                </div>

                {/* ── TOP ROW: Traits + Board ─────────────────────────────── */}
                <div className="flex gap-4 items-start">

                    {/* Traits panel */}
                    <div className="w-44 shrink-0 sticky top-4">
                        <div className="bg-[#16161f] rounded-2xl border border-white/5 p-3">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Traits</h2>
                            {activeTraits.length === 0
                                ? <p className="text-xs text-gray-700 italic text-center py-4">Place champions</p>
                                : <div className="space-y-1">{activeTraits.map(t => <TraitRow key={t.key} t={t} />)}</div>
                            }
                        </div>
                    </div>

                    {/* Board */}
                    <div className="flex-1 min-w-0 space-y-3">
                        <div className="bg-[#16161f] rounded-2xl border border-white/5 p-4">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                                    Board <span className="text-amber-400 font-mono">{boardCount}</span>
                                    <span className="text-gray-600"> / 10</span>
                                </span>
                                <button
                                    onClick={() => { setSlots(Array(28).fill(null)); setSelectedKey(null); setChampItems({}); }}
                                    className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                                >
                                    Clear
                                </button>
                            </div>

                            {/* Hex grid — row 0 (back row) drawn first, but visually "highest" z-index */}
                            <div className="overflow-x-auto pb-1">
                                <div style={{ display: "inline-block", padding: 4 }}>
                                    {[0, 1, 2, 3].map(row => (
                                        <div
                                            key={row}
                                            style={{
                                                display: "flex",
                                                gap: HEX_GAP,
                                                marginTop: row > 0 ? -HEX_ROW_OVERLAP : 0,
                                                marginLeft: row % 2 === 1 ? HEX_ROW_OFFSET : 0,
                                                position: "relative",
                                                // Earlier rows on top so items at bottom of hex appear above next row
                                                zIndex: 4 - row,
                                            }}
                                        >
                                            {[0, 1, 2, 3, 4, 5, 6].map(col => {
                                                const idx = row * 7 + col;
                                                const champKey = slots[idx];
                                                const isOver = dragOverHex === idx;
                                                const hint: "champion" | "item" | null =
                                                    isOver && dragKind ? dragKind : null;
                                                return (
                                                    <HexSlot
                                                        key={idx}
                                                        champKey={champKey}
                                                        champByKey={champByKey}
                                                        equippedItemKeys={champKey ? (champItems[champKey] ?? []) : []}
                                                        itemsByKey={itemsByKey}
                                                        isSelected={champKey !== null && champKey === selectedKey}
                                                        dropHint={hint}
                                                        onClick={() => handleHexClick(idx)}
                                                        onItemRemove={(slotIdx) => champKey && removeItemFromChamp(champKey, slotIdx)}
                                                        onItemIconDragStart={(e, itemKey, fromChampKey) =>
                                                            startDrag(e, { kind: "item", itemKey, fromChampKey })
                                                        }
                                                        onChampDragStart={(e) => champKey &&
                                                            startDrag(e, { kind: "champion", champKey, fromHexIdx: idx })
                                                        }
                                                        onDragOver={(e) => handleHexDragOver(e, idx)}
                                                        onDragLeave={handleHexDragLeave}
                                                        onDrop={(e) => handleHexDrop(e, idx)}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>

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
                        <div className="flex gap-1 mb-3">
                            {(["all", "normal", "emblem", "radiant", "artifact"] as const).map(t => (
                                <button key={t} onClick={() => setItemTypeFilter(t)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize border transition-all ${itemTypeFilter === t ? "bg-white/15 border-white/30 text-white" : "border-white/5 text-gray-500 hover:text-gray-300"}`}>
                                    {t}
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
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

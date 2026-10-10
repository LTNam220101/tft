import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ACTIVE_SET_KEY } from "../../convex/gameConfig";
import type { BuyPlan, ChampDef, CompTarget, Cost, GameConfig, GameEvent, GameState, Slot, Star } from "~/rollGame/engine";
import type { ArenaScene, PickResult } from "~/arena/scene";
import { getImageUrl } from "~/utils";
import {
    BUY_XP_COST,
    MAX_LEVEL,
    MIN_LEVEL,
    POOL_SIZE,
    REROLL_COST,
    SHOP_ODDS,
    XP_TO_NEXT,
    bestStar,
    buy,
    buyPlan,
    buyXp,
    copiesOf,
    createGame,
    moveUnit,
    ownedCopies,
    pendingTargets,
    reroll,
    sell,
    sellValue,
} from "~/rollGame/engine";
import { decodeComp } from "~/rollGame/compParam";
import { COST_COLOR, STAR_COLOR } from "~/arena/theme";

const TITLE = "TFT Comp Roll Simulator — T-Flex-T";
const DESCRIPTION =
    "Practice rolling a full TFT comp (2★ and 3★ targets) with real shop odds, champion pool sizes and XP costs, on a 3D board.";

export const Route = createFileRoute("/roll")({
    head: () => ({
        meta: [
            { title: TITLE },
            { name: "description", content: DESCRIPTION },
            { property: "og:title", content: TITLE },
            { property: "og:description", content: DESCRIPTION },
            { property: "og:url", content: "https://tflext.gnoulman.com/roll" },
        ],
        links: [{ rel: "canonical", href: "https://tflext.gnoulman.com/roll" }],
    }),
    /** `?comp=KEY.STAR,...` pre-fills the setup (the builder's "Roll this comp" button). */
    validateSearch: (search: Record<string, unknown>): { comp?: string } =>
        typeof search.comp === "string" ? { comp: search.comp } : {},
    component: RollComponent,
});

/** Level where each cost tier is usually rolled for. */
const REROLL_LEVEL: Record<Cost, number> = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 };

const LOL_GOLD = "#c8aa6e";

const DENIED_TEXT: Record<"gold" | "bench" | "board", string> = {
    gold: "Not enough gold",
    bench: "Your bench is full",
    board: "Board is full — level up to field more units",
};

function Coin({ size = 14 }: { size?: number }) {
    return (
        <span
            aria-hidden
            className="inline-block rounded-full shrink-0"
            style={{
                width: size,
                height: size,
                background: "radial-gradient(circle at 35% 30%, #fff3b0, #f5c542 45%, #a8741a 100%)",
                boxShadow: "inset 0 0 0 1px rgba(80,50,0,0.6)",
            }}
        />
    );
}

function Stars({ star, size = 12 }: { star: number; size?: number }) {
    return (
        <span className="inline-flex gap-px" style={{ color: STAR_COLOR[star], fontSize: size, lineHeight: 1 }}>
            {"★".repeat(star)}
        </span>
    );
}

// ── Setup modal ──────────────────────────────────────────────────────────────
const MAX_COMP = 10;

/**
 * Reroll comps sit at the reroll level of their 3★ units; otherwise the level that finds the priciest unit.
 * Gold covers buying every copy plus rolling (much more for 3★ targets).
 */
function suggestSettings(targets: ReadonlyArray<CompTarget>, champs: ReadonlyMap<string, ChampDef>) {
    const costs = targets.map((t) => champs.get(t.key)?.cost ?? 1);
    const threeStarCosts = costs.filter((_, i) => targets[i].star === 3);
    const levelCost = (Math.max(1, ...(threeStarCosts.length ? threeStarCosts : costs)) as Cost);
    const gold = targets.reduce((sum, t, i) => sum + costs[i] * (copiesOf(t.star) + (t.star === 3 ? 50 : 8)), 30);
    return { level: REROLL_LEVEL[levelCost], gold: Math.round(gold / 10) * 10 };
}

function SetupModal({
    champs,
    traitIcons,
    initial,
    initialTargets,
    onStart,
    onClose,
}: {
    champs: Array<ChampDef>;
    traitIcons: Map<string, string | undefined>;
    initial: GameConfig | null;
    /** Comp passed from the builder (`?comp=`); used when there is no previous config. */
    initialTargets: Array<CompTarget>;
    onStart: (config: GameConfig) => void;
    onClose: (() => void) | null;
}) {
    const champByKey = useMemo(() => new Map(champs.map((c) => [c.key, c])), [champs]);
    const [targets, setTargets] = useState<Array<CompTarget>>(
        () => initial?.targets ?? initialTargets.filter((t) => champByKey.has(t.key)).slice(0, MAX_COMP),
    );
    const suggested = suggestSettings(targets, champByKey);
    // Level/gold follow the comp until the user edits them.
    const [level, setLevel] = useState<number | null>(initial?.level ?? null);
    const [gold, setGold] = useState<number | null>(initial?.gold ?? null);
    const [contested, setContested] = useState(initial?.contested ?? 0);
    const [lobbyTaken, setLobbyTaken] = useState(initial?.lobbyTaken ?? 0.2);
    const [search, setSearch] = useState("");
    const [costFilter, setCostFilter] = useState<Cost | null>(null);
    const levelValue = level ?? suggested.level;
    const goldValue = gold ?? suggested.gold;

    const inComp = new Set(targets.map((t) => t.key));
    const toggle = (c: ChampDef) =>
        setTargets((prev) =>
            prev.some((t) => t.key === c.key)
                ? prev.filter((t) => t.key !== c.key)
                : prev.length < MAX_COMP
                    ? [...prev, { key: c.key, star: c.cost <= 2 ? 3 : 2 }]
                    : prev,
        );
    const setStar = (key: string, star: Star) => setTargets((prev) => prev.map((t) => (t.key === key ? { ...t, star } : t)));

    // Unique traits across the comp, like the builder's trait panel (counts only).
    const traitCounts = new Map<string, { name: string; count: number }>();
    for (const t of targets) {
        for (const tr of champByKey.get(t.key)?.traits ?? []) {
            const cur = traitCounts.get(tr.id);
            traitCounts.set(tr.id, { name: tr.name, count: (cur?.count ?? 0) + 1 });
        }
    }
    const traits = [...traitCounts].sort((a, b) => b[1].count - a[1].count);

    const impossible = targets.filter((t) => {
        const champ = champByKey.get(t.key);
        return !champ || copiesOf(t.star) > POOL_SIZE[champ.cost] - contested;
    });
    const copiesNeeded = targets.reduce((sum, t) => sum + copiesOf(t.star), 0);
    const shown = champs.filter(
        (c) => (costFilter === null || c.cost === costFilter) && c.name.toLowerCase().includes(search.trim().toLowerCase()),
    );

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
            <div
                className="w-full max-w-5xl max-h-full overflow-y-auto custom-scrollbar rounded-lg border bg-gradient-to-b from-[#0f1a2b] to-[#0a1220] p-5 shadow-2xl"
                style={{ borderColor: `${LOL_GOLD}80` }}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-black tracking-wide" style={{ color: LOL_GOLD }}>
                            ROLL YOUR COMP
                        </h1>
                        <p className="text-xs text-gray-400 mt-1">
                            Pick up to {MAX_COMP} champions and the star level each must reach. Set 18 shop odds &amp; pool
                            sizes, 2g reroll, 4g for 4 XP. You win when every unit of the comp is done.
                        </p>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none px-2">
                            ✕
                        </button>
                    )}
                </div>

                {/* Comp */}
                <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-bold uppercase tracking-widest text-gray-400">
                            Comp <span style={{ color: LOL_GOLD }}>{targets.length}</span>/{MAX_COMP}
                        </span>
                        <span className="text-gray-500">{copiesNeeded} copies to collect</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {targets.map((t) => {
                            const champ = champByKey.get(t.key);
                            if (!champ) return null;
                            const bad = impossible.includes(t);
                            return (
                                <div
                                    key={t.key}
                                    className="relative flex w-[84px] flex-col items-center gap-1 rounded-md border bg-[#0b1220] p-1.5"
                                    style={{ borderColor: bad ? "#f87171" : `${COST_COLOR[champ.cost]}80` }}
                                    title={bad ? "Not enough copies left in the pool" : champ.name}
                                >
                                    <button
                                        onClick={() => toggle(champ)}
                                        className="absolute right-0.5 top-0.5 z-10 rounded bg-black/70 px-1 text-[10px] text-gray-300 hover:text-red-300"
                                        title="Remove"
                                    >
                                        ✕
                                    </button>
                                    <img
                                        src={getImageUrl(champ.iconPath)}
                                        alt={champ.name}
                                        className="h-12 w-12 rounded object-cover"
                                        style={{ border: `2px solid ${COST_COLOR[champ.cost]}` }}
                                    />
                                    <span className="w-full truncate text-center text-[10px] font-semibold text-gray-200">{champ.name}</span>
                                    <div className="flex gap-0.5">
                                        {([1, 2, 3] as const).map((s) => (
                                            <button
                                                key={s}
                                                onClick={() => setStar(t.key, s)}
                                                className="rounded px-1 text-[10px] leading-4"
                                                style={{
                                                    color: t.star === s ? "#1a1206" : STAR_COLOR[s],
                                                    background: t.star === s ? STAR_COLOR[s] : "rgba(255,255,255,0.06)",
                                                }}
                                                title={`Target ${s}★`}
                                            >
                                                {"★".repeat(s)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        {targets.length === 0 && (
                            <div className="flex h-[92px] flex-1 items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-gray-500">
                                Click champions below to add them to the comp
                            </div>
                        )}
                    </div>
                    {traits.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {traits.map(([id, t]) => (
                                <span key={id} className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300">
                                    {traitIcons.get(id) && <img src={getImageUrl(traitIcons.get(id))} alt="" className="h-3 w-3 brightness-200" />}
                                    {t.name} <b className="text-white">{t.count}</b>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Units picker (builder style) */}
                <div className="mt-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Units</span>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search…"
                            className="w-32 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
                        />
                        {([null, 1, 2, 3, 4, 5] as const).map((c) => (
                            <button
                                key={c ?? "all"}
                                onClick={() => setCostFilter(c)}
                                className="rounded border px-2 py-0.5 text-[11px] font-bold"
                                style={{
                                    borderColor: c ? `${COST_COLOR[c]}80` : "rgba(255,255,255,0.15)",
                                    color: c ? COST_COLOR[c] : "#d1d5db",
                                    background: costFilter === c ? "rgba(255,255,255,0.12)" : "transparent",
                                }}
                            >
                                {c ? `$${c}` : "All"}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {shown.map((c) => {
                            const active = inComp.has(c.key);
                            return (
                                <button
                                    key={c.key}
                                    onClick={() => toggle(c)}
                                    title={`${c.name} ($${c.cost})`}
                                    className={`flex w-12 flex-col items-center gap-0.5 transition-opacity ${active ? "" : "opacity-70 hover:opacity-100"}`}
                                >
                                    <span
                                        className="relative block h-11 w-11 overflow-hidden rounded"
                                        style={{
                                            border: `2px solid ${active ? LOL_GOLD : COST_COLOR[c.cost]}`,
                                            boxShadow: active ? `0 0 10px ${LOL_GOLD}` : undefined,
                                        }}
                                    >
                                        <img src={getImageUrl(c.iconPath)} alt={c.name} className="h-full w-full object-cover" />
                                        {active && (
                                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-black text-white">✓</span>
                                        )}
                                    </span>
                                    <span className="w-12 truncate text-center text-[9px] text-gray-400">{c.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Settings */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block text-xs text-gray-400">
                        Level: <b className="text-white">{levelValue}</b>
                        {level === null && <span className="text-gray-500"> (suggested)</span>}
                        <input
                            type="range"
                            min={MIN_LEVEL}
                            max={MAX_LEVEL}
                            value={levelValue}
                            onChange={(e) => setLevel(Number(e.target.value))}
                            className="w-full accent-amber-400"
                        />
                    </label>
                    <label className="block text-xs text-gray-400">
                        Starting gold{gold === null && <span className="text-gray-500"> (suggested)</span>}
                        <input
                            type="number"
                            min={0}
                            max={9999}
                            value={goldValue}
                            onChange={(e) => setGold(Math.max(0, Math.min(9999, Number(e.target.value) || 0)))}
                            className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-500/60"
                        />
                    </label>
                    <label className="block text-xs text-gray-400">
                        Copies of each comp unit held by opponents: <b className="text-white">{contested}</b>
                        <input
                            type="range"
                            min={0}
                            max={9}
                            value={contested}
                            onChange={(e) => setContested(Number(e.target.value))}
                            className="w-full accent-amber-400"
                        />
                    </label>
                    <label className="block text-xs text-gray-400">
                        Other champions taken by the lobby: <b className="text-white">{Math.round(lobbyTaken * 100)}%</b>
                        <input
                            type="range"
                            min={0}
                            max={60}
                            step={5}
                            value={Math.round(lobbyTaken * 100)}
                            onChange={(e) => setLobbyTaken(Number(e.target.value) / 100)}
                            className="w-full accent-amber-400"
                        />
                    </label>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded border border-white/10 bg-black/30 p-2 text-xs">
                    <span className="text-gray-400">Shop odds at level {levelValue}:</span>
                    {SHOP_ODDS[levelValue].map((p, i) => (
                        <span key={i} style={{ color: COST_COLOR[i + 1] }}>
                            ● {p}%
                        </span>
                    ))}
                    {impossible.length > 0 && (
                        <span className="text-red-400">
                            Not enough copies left for: {impossible.map((t) => champByKey.get(t.key)?.name).join(", ")}
                        </span>
                    )}
                </div>

                <button
                    disabled={targets.length === 0 || impossible.length > 0}
                    onClick={() => onStart({ targets, level: levelValue, gold: goldValue, contested, lobbyTaken })}
                    className="mt-5 w-full rounded py-2.5 font-black tracking-widest text-[#1a1206] disabled:opacity-40"
                    style={{ background: `linear-gradient(180deg, #f0d48a, ${LOL_GOLD} 60%, #8a6d3b)` }}
                >
                    START ROLLING
                </button>
            </div>
        </div>
    );
}

// ── Shop card ────────────────────────────────────────────────────────────────
function ShopCard({
    champ,
    traitIcons,
    owned,
    plan,
    linked,
    isTarget,
    affordable,
    onBuy,
    onHoverChange,
}: {
    champ: ChampDef | null;
    traitIcons: Map<string, string | undefined>;
    owned: boolean;
    plan: BuyPlan;
    /** Another hovered card would buy this copy together with itself. */
    linked: boolean;
    isTarget: boolean;
    affordable: boolean;
    onBuy: () => void;
    onHoverChange: (hovered: boolean) => void;
}) {
    if (!champ) {
        return <div className="h-full rounded-sm border border-white/5 bg-[#0a0f18]/80" />;
    }
    const color = COST_COLOR[champ.cost];
    const count = plan.indices.length;
    return (
        <button
            onClick={onBuy}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
            className={`roll-card group relative h-full overflow-hidden rounded-sm text-left transition-transform hover:-translate-y-0.5 active:translate-y-0 ${linked ? "-translate-y-0.5" : ""} ${owned ? "roll-card-owned" : ""} ${isTarget ? "roll-card-target" : ""}`}
            style={{
                border: `2px solid ${linked ? LOL_GOLD : color}`,
                boxShadow: linked ? `0 0 14px ${LOL_GOLD}` : undefined,
                opacity: affordable ? 1 : 0.55,
            }}
        >
            <img
                src={getImageUrl(champ.iconPath)}
                alt={champ.name}
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover object-[50%_25%] transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/25 to-transparent" />
            <div className="absolute left-1.5 top-1.5 hidden space-y-0.5 sm:block">
                {champ.traits.map((t) => (
                    <div key={t.id} className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-gray-100 drop-shadow">
                        {traitIcons.get(t.id) && (
                            <img src={getImageUrl(traitIcons.get(t.id))} alt="" className="h-3.5 w-3.5 brightness-200" />
                        )}
                        <span className="truncate max-w-[90px]">{t.name}</span>
                    </div>
                ))}
            </div>
            {plan.combines && (
                <div
                    className="absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-black text-[#1a1206] shadow"
                    style={{ background: `linear-gradient(180deg,#fff1b8,${LOL_GOLD})` }}
                    title={
                        count > 1
                            ? `Buys ${count} copies (${count * champ.cost} gold) to upgrade your unit`
                            : "Buying this upgrades your unit"
                    }
                >
                    ▲★{count > 1 ? ` ×${count}` : ""}
                </div>
            )}
            <div
                className="absolute inset-x-0 bottom-0 flex h-6 items-center justify-between px-2"
                style={{ background: `linear-gradient(90deg, ${color}e6, #0b0f17f2 75%)` }}
            >
                <span className="truncate text-xs sm:text-sm font-bold text-white drop-shadow">{champ.name}</span>
                <span className="flex items-center gap-1 text-xs sm:text-sm font-bold text-white">
                    <Coin size={12} />
                    {champ.cost}
                </span>
            </div>
        </button>
    );
}

function HudButton({
    label,
    hotkey,
    cost,
    disabled,
    onClick,
    icon,
}: {
    label: string;
    hotkey: string;
    cost: number;
    disabled: boolean;
    onClick: () => void;
    icon: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="relative flex h-10 flex-1 items-center gap-2 rounded-sm border px-2 text-left transition-colors enabled:hover:brightness-125 disabled:opacity-50 sm:h-auto"
            style={{
                borderColor: `${LOL_GOLD}90`,
                background: "linear-gradient(180deg, #17364a 0%, #0c1d2b 100%)",
            }}
        >
            <span className="text-lg leading-none text-sky-200">{icon}</span>
            <span className="flex flex-col leading-tight">
                <span className="text-[11px] sm:text-xs font-bold text-white">{label}</span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
                    <Coin size={11} />
                    {cost}
                </span>
            </span>
            <span className="absolute right-1 top-0.5 text-[9px] font-bold text-gray-400">{hotkey}</span>
        </button>
    );
}

// ── Main ─────────────────────────────────────────────────────────────────────
function RollComponent() {
    const champions = useQuery(api.queries.listChampions, { setKey: ACTIVE_SET_KEY });
    const traits = useQuery(api.queries.getTraits, { setKey: ACTIVE_SET_KEY });
    const { comp } = Route.useSearch();
    const compFromUrl = useMemo(() => decodeComp(comp), [comp]);

    const champDefs = useMemo<Array<ChampDef>>(
        () =>
            (champions ?? [])
                .filter((c) => c.key && c.name && c.cost && c.cost >= 1 && c.cost <= 5 && c.isLocked !== true)
                .map((c) => ({
                    key: c.key!,
                    name: c.name!,
                    cost: c.cost as Cost,
                    iconPath: c.iconPath,
                    traits: (c.traits ?? []).map((t) => ({ id: t.id, name: t.name })),
                })),
        [champions],
    );
    const traitIcons = useMemo(() => new Map((traits ?? []).map((t) => [t.key ?? "", t.iconPath])), [traits]);
    const [draggingId, setDraggingId] = useState<number | null>(null);
    const [overSell, setOverSell] = useState(false);
    const [hoveredShop, setHoveredShop] = useState<number | null>(null);

    const [config, setConfig] = useState<GameConfig | null>(null);
    const [game, setGame] = useState<GameState | null>(null);
    const [setupOpen, setSetupOpen] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
    const [showWin, setShowWin] = useState(false);
    const [sceneError, setSceneError] = useState<string | null>(null);
    const [sceneReady, setSceneReady] = useState(false);

    const mountRef = useRef<HTMLDivElement>(null);
    const shopRef = useRef<HTMLDivElement>(null);
    const sellZoneRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<ArenaScene | null>(null);
    const lastEventSeq = useRef(-1);
    const feedbackSeq = useRef(-1);
    const winTimer = useRef<number | undefined>(undefined);
    const pickRef = useRef<(hit: PickResult) => void>(() => {});
    const dropRef = useRef<(unitId: number, slot: Slot | null, x: number, y: number) => void>(() => {});

    const isOverSellZone = (x: number, y: number) => {
        const r = sellZoneRef.current?.getBoundingClientRect();
        return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const startGame = useCallback(
        (cfg: GameConfig) => {
            setConfig(cfg);
            setGame(createGame(champDefs, cfg, Math.random));
            lastEventSeq.current = -1;
            feedbackSeq.current = -1;
            clearTimeout(winTimer.current);
            setSelectedId(null);
            setShowWin(false);
            setSetupOpen(false);
        },
        [champDefs],
    );

    // ── three.js lifecycle (client only, lazy chunk) ─────────────────────────
    useEffect(() => {
        let disposed = false;
        let instance: ArenaScene | null = null;
        void import("~/arena/scene").then(({ ArenaScene: SceneClass }) => {
            if (disposed || !mountRef.current) return;
            try {
                instance = new SceneClass(mountRef.current, {
                    onPick: (hit) => pickRef.current(hit),
                    onHover: setHoveredId,
                    onDragStart: (unitId) => {
                        setDraggingId(unitId);
                        setSelectedId(null);
                    },
                    onDragMove: (x, y) => setOverSell(isOverSellZone(x, y)),
                    onDrop: (unitId, slot, x, y) => dropRef.current(unitId, slot, x, y),
                });
                sceneRef.current = instance;
                setSceneReady(true);
            } catch (e) {
                setSceneError(e instanceof Error ? e.message : "WebGL is not available");
            }
        });
        return () => {
            disposed = true;
            instance?.dispose();
            sceneRef.current = null;
        };
    }, []);

    useEffect(() => {
        const scene = sceneRef.current;
        const shop = shopRef.current;
        if (!scene || !shop) return;
        const observer = new ResizeObserver(() => scene.setBottomInset(shop.offsetHeight));
        observer.observe(shop);
        return () => observer.disconnect();
    }, [sceneReady]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        const fresh = game && game.eventSeq !== lastEventSeq.current;
        lastEventSeq.current = game?.eventSeq ?? -1;
        scene.sync(
            (game?.units ?? []).map((u) => ({
                id: u.id,
                star: u.star,
                slot: u.slot,
                cost: game?.champs.get(u.champKey)?.cost ?? 1,
                iconUrl: getImageUrl(game?.champs.get(u.champKey)?.iconPath),
                // Built by scripts/tft-models/build_models.py; a missing file falls back to the portrait token.
                modelUrl: `/models/${ACTIVE_SET_KEY}/${u.champKey}.glb`,
            })),
            fresh ? game.events : [],
        );
    }, [sceneReady, game]);

    useEffect(() => {
        sceneRef.current?.setSelected(selectedId);
    }, [selectedId, sceneReady]);

    // ── Event feedback ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!game || game.eventSeq === feedbackSeq.current) return;
        feedbackSeq.current = game.eventSeq;
        const denied = game.events.find((e): e is Extract<GameEvent, { type: "denied" }> => e.type === "denied");
        if (denied) setToast({ text: DENIED_TEXT[denied.reason], key: game.eventSeq });
        // Let the 3D celebration play before the result panel covers it.
        if (game.events.some((e) => e.type === "win")) winTimer.current = window.setTimeout(() => setShowWin(true), 2200);
    }, [game]);

    useEffect(() => () => clearTimeout(winTimer.current), []);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 1400);
        return () => clearTimeout(timer);
    }, [toast]);

    // ── Actions ──────────────────────────────────────────────────────────────
    const doReroll = () => setGame((g) => (g ? reroll(g, Math.random) : g));
    const doBuyXp = () => setGame((g) => (g ? buyXp(g) : g));
    const doBuy = (i: number) => setGame((g) => (g ? buy(g, i) : g));
    const doSell = (unitId: number) => {
        setGame((g) => (g ? sell(g, unitId) : g));
        setSelectedId((id) => (id === unitId ? null : id));
    };

    pickRef.current = (hit) => {
        if (!game || setupOpen) return;
        if (hit?.kind === "unit") {
            setSelectedId((id) => (id === hit.unitId ? null : hit.unitId));
            return;
        }
        if (hit?.kind === "slot" && selectedId !== null) {
            setGame((g) => (g ? moveUnit(g, selectedId, hit.slot) : g));
        }
        setSelectedId(null);
    };

    // In-game: drop a unit onto the shop to sell it, onto a hex/bench slot to move (or swap) it.
    dropRef.current = (unitId, slot, x, y) => {
        setDraggingId(null);
        setOverSell(false);
        if (!game) return;
        if (isOverSellZone(x, y)) doSell(unitId);
        else if (slot) setGame((g) => (g ? moveUnit(g, unitId, slot) : g));
    };

    const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
    keyRef.current = (e) => {
        if (!game || setupOpen || showWin) return;
        if (e.target instanceof HTMLInputElement) return;
        const key = e.key.toLowerCase();
        if (key === "d") doReroll();
        else if (key === "f") doBuyXp();
        else if (key === "e") {
            const id = hoveredId ?? selectedId;
            if (id !== null) doSell(id);
        } else if (key === "escape") setSelectedId(null);
    };
    useEffect(() => {
        const handler = (e: KeyboardEvent) => keyRef.current(e);
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // ── Derived HUD data ─────────────────────────────────────────────────────
    const compRows = game
        ? game.config.targets.flatMap((t) => {
            const champ = game.champs.get(t.key);
            return champ
                ? [{ target: t, champ, copies: ownedCopies(game, t.key), best: bestStar(game.units, t.key), inPool: game.pool[t.key] }]
                : [];
        })
        : [];
    const doneCount = compRows.filter((r) => r.best >= r.target.star).length;
    const pendingKeys = new Set(game ? pendingTargets(game).map((t) => t.key) : []);
    // A dragged unit takes over the shop as a sell zone, same as a selected one.
    const sellUnit = game?.units.find((u) => u.id === (draggingId ?? selectedId)) ?? null;
    const sellChamp = sellUnit ? game?.champs.get(sellUnit.champKey) : undefined;
    const hoveredPlan = game && hoveredShop !== null ? buyPlan(game, hoveredShop).indices : [];
    const boardCount = game?.units.filter((u) => u.slot.area === "board").length ?? 0;
    const benchCount = game?.units.filter((u) => u.slot.area === "bench").length ?? 0;
    const outOfGold =
        game && !game.won && game.gold < REROLL_COST &&
        !game.shop.some((k) => !!k && pendingKeys.has(k) && (game.champs.get(k)?.cost ?? 99) <= game.gold);

    const loading = champions === undefined;

    return (
        <div className="relative h-[calc(100dvh-57px)] min-h-[560px] overflow-hidden bg-[#0b1626] select-none">
            <style>{`
                @keyframes roll-shimmer { 0% { background-position: -150% 0 } 100% { background-position: 250% 0 } }
                .roll-card-owned::after { content: ""; position: absolute; inset: 0; pointer-events: none;
                    background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 45%, transparent 60%);
                    background-size: 200% 100%; animation: roll-shimmer 1.6s linear infinite; }
                @keyframes roll-target { 0%,100% { box-shadow: 0 0 0 0 rgba(255,213,74,0.0), inset 0 0 12px rgba(255,213,74,0.35) }
                    50% { box-shadow: 0 0 18px 2px rgba(255,213,74,0.75), inset 0 0 18px rgba(255,213,74,0.55) } }
                .roll-card-target { animation: roll-target 1.2s ease-in-out infinite; }
                @keyframes roll-toast { 0% { opacity: 0; transform: translate(-50%, 8px) } 15%,80% { opacity: 1; transform: translate(-50%, 0) } 100% { opacity: 0 } }
            `}</style>

            <div ref={mountRef} className="absolute inset-0" />

            {sceneError && (
                <div className="absolute inset-x-0 top-1/3 text-center text-sm text-red-300">
                    3D view unavailable: {sceneError}
                </div>
            )}

            {/* Comp tracker */}
            {game && (
                <div
                    className="absolute left-2 top-2 z-10 w-52 rounded-md border bg-[#0a1220]/85 p-2 backdrop-blur sm:left-3 sm:top-3 sm:w-64 sm:p-3"
                    style={{ borderColor: `${LOL_GOLD}55` }}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-widest text-gray-500">Comp</span>
                        <span className="text-xs font-bold" style={{ color: LOL_GOLD }}>
                            {doneCount}/{compRows.length} done
                        </span>
                    </div>
                    <div className="custom-scrollbar mt-1.5 max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
                        {compRows.map(({ target: t, champ, copies, best, inPool }) => {
                            const need = copiesOf(t.star);
                            const done = best >= t.star;
                            return (
                                <div key={t.key} className="flex items-center gap-2">
                                    <img
                                        src={getImageUrl(champ.iconPath)}
                                        alt={champ.name}
                                        className="h-7 w-7 shrink-0 rounded"
                                        style={{ border: `2px solid ${done ? STAR_COLOR[3] : COST_COLOR[champ.cost]}` }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1 text-[11px]">
                                            <span className="truncate font-semibold text-gray-100">{champ.name}</span>
                                            <Stars star={t.star} size={10} />
                                        </div>
                                        <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-white/10">
                                            <div
                                                className="h-full"
                                                style={{
                                                    width: `${Math.min(1, copies / need) * 100}%`,
                                                    background: done ? STAR_COLOR[3] : COST_COLOR[champ.cost],
                                                }}
                                            />
                                        </div>
                                        <div className="text-[9px] text-gray-500">
                                            {Math.min(copies, need)}/{need} copies · {inPool} in pool
                                        </div>
                                    </div>
                                    <span className={`w-3 text-xs ${done ? "text-emerald-400" : "text-transparent"}`}>✓</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-2 hidden grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] sm:grid">
                        <span className="text-gray-500">Rolls</span>
                        <span className="text-right text-white">{game.stats.rolls}</span>
                        <span className="text-gray-500">Gold spent</span>
                        <span className="text-right text-white">{game.stats.goldSpent}</span>
                        <span className="text-gray-500">Seen in shop</span>
                        <span className="text-right text-white">{game.stats.targetSeen}</span>
                        <span className="text-gray-500">Contested</span>
                        <span className="text-right text-white">{game.config.contested}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button
                            onClick={() => config && startGame(config)}
                            className="flex-1 rounded border border-white/10 bg-white/5 py-1 text-xs font-semibold text-gray-200 hover:bg-white/10"
                        >
                            Restart
                        </button>
                        <button
                            onClick={() => setSetupOpen(true)}
                            className="flex-1 rounded border py-1 text-xs font-semibold hover:brightness-125"
                            style={{ borderColor: `${LOL_GOLD}70`, color: LOL_GOLD }}
                        >
                            Setup
                        </button>
                    </div>
                </div>
            )}

            {/* Hotkeys hint + camera reset */}
            {game && (
                <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
                    <div className="hidden rounded-md border border-white/10 bg-[#0a1220]/75 px-3 py-2 text-[11px] text-gray-400 md:block">
                        <div><b className="text-gray-200">D</b> reroll · <b className="text-gray-200">F</b> buy XP · <b className="text-gray-200">E</b> sell hovered</div>
                        <div>Drag units to move them · drop on the shop to sell</div>
                        <div>Drag empty space to rotate · scroll to zoom</div>
                    </div>
                    <button
                        onClick={() => sceneRef.current?.resetCamera()}
                        className="rounded-md border border-white/10 bg-[#0a1220]/75 px-2.5 py-1 text-[11px] font-semibold text-gray-300 hover:text-white"
                    >
                        ⟲ Reset view
                    </button>
                </div>
            )}

            {toast && (
                <div
                    key={toast.key}
                    className="absolute left-1/2 top-1/3 z-20 rounded border border-red-400/40 bg-black/80 px-4 py-2 text-sm font-semibold text-red-200"
                    style={{ animation: "roll-toast 1.4s ease forwards" }}
                >
                    {toast.text}
                </div>
            )}

            {outOfGold && (
                <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded border border-amber-500/40 bg-black/80 px-4 py-2 text-sm text-amber-200">
                    Out of gold — sell units or{" "}
                    <button className="underline" onClick={() => config && startGame(config)}>
                        try again
                    </button>
                </div>
            )}

            {/* Shop HUD */}
            <div ref={shopRef} className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-2 pb-2">
                {game && (
                    <div className="relative w-full max-w-[1100px]">
                        {/* Gold */}
                        <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-t-md border border-b-0 bg-[#08111c]/95 px-4 py-1"
                            style={{ borderColor: `${LOL_GOLD}80` }}
                        >
                            <Coin size={18} />
                            <span className="text-lg font-black text-amber-200 tabular-nums">{game.gold}</span>
                        </div>

                        <div
                            ref={sellZoneRef}
                            className="rounded-md border bg-gradient-to-b from-[#0e1c2c]/95 to-[#070d16]/95 p-1.5 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]"
                            style={{ borderColor: `${LOL_GOLD}90` }}
                        >
                            {/* Level / odds strip */}
                            <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="font-black text-white">Lv. {game.level}</span>
                                    {game.level < MAX_LEVEL ? (
                                        <span className="flex items-center gap-1 text-gray-400">
                                            <span className="relative h-1.5 w-20 overflow-hidden rounded bg-white/10">
                                                <span
                                                    className="absolute inset-y-0 left-0 bg-sky-400"
                                                    style={{ width: `${(game.xp / XP_TO_NEXT[game.level]) * 100}%` }}
                                                />
                                            </span>
                                            {game.xp}/{XP_TO_NEXT[game.level]}
                                        </span>
                                    ) : (
                                        <span className="text-gray-500">Max</span>
                                    )}
                                </div>
                                <div className="flex gap-2.5 font-semibold">
                                    {SHOP_ODDS[game.level].map((p, i) => (
                                        <span key={i} className="flex items-center gap-1" style={{ color: COST_COLOR[i + 1] }}>
                                            <span className="h-2 w-2 rounded-full" style={{ background: COST_COLOR[i + 1] }} />
                                            {p}%
                                        </span>
                                    ))}
                                </div>
                                <span className="text-gray-500">
                                    Board {boardCount}/{game.level} · Bench {benchCount}/9
                                </span>
                                <button
                                    onClick={() => setGame((g) => (g ? { ...g, locked: !g.locked } : g))}
                                    className={`ml-auto rounded border px-2 py-0.5 text-[11px] font-bold ${game.locked ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-white/10 text-gray-400 hover:text-white"}`}
                                    title="Lock shop"
                                >
                                    {game.locked ? "🔒 Locked" : "🔓 Lock"}
                                </button>
                            </div>

                            <div className="flex flex-col gap-1.5 sm:h-[128px] sm:flex-row">
                                <div className="flex shrink-0 flex-row gap-1.5 sm:w-[136px] sm:flex-col">
                                    <HudButton
                                        label="Buy XP"
                                        hotkey="F"
                                        cost={BUY_XP_COST}
                                        icon="⬆"
                                        disabled={game.level >= MAX_LEVEL || game.gold < BUY_XP_COST}
                                        onClick={doBuyXp}
                                    />
                                    <HudButton
                                        label="Refresh"
                                        hotkey="D"
                                        cost={REROLL_COST}
                                        icon="⟳"
                                        disabled={game.gold < REROLL_COST}
                                        onClick={doReroll}
                                    />
                                </div>

                                <div className="relative grid h-[96px] flex-none grid-cols-5 gap-1 sm:h-auto sm:flex-1 sm:gap-1.5">
                                    {game.shop.map((key, i) => {
                                        const champ = key ? game.champs.get(key) ?? null : null;
                                        return (
                                            <ShopCard
                                                key={`${game.stats.rolls}-${i}`}
                                                champ={champ}
                                                traitIcons={traitIcons}
                                                owned={!!key && game.units.some((u) => u.champKey === key)}
                                                plan={buyPlan(game, i)}
                                                linked={hoveredShop !== i && hoveredPlan.includes(i)}
                                                isTarget={!!key && pendingKeys.has(key)}
                                                affordable={!!champ && champ.cost <= game.gold}
                                                onBuy={() => doBuy(i)}
                                                onHoverChange={(h) => setHoveredShop((cur) => (h ? i : cur === i ? null : cur))}
                                            />
                                        );
                                    })}

                                    {sellUnit && sellChamp && (
                                        <button
                                            onClick={() => doSell(sellUnit.id)}
                                            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-sm border-2 text-white transition-colors hover:bg-[#2a1212]/95 ${overSell ? "border-solid bg-[#3a1616]/95" : "border-dashed bg-[#1b0d0d]/95"}`}
                                            style={{ borderColor: overSell ? LOL_GOLD : `${LOL_GOLD}aa` }}
                                        >
                                            <span className="text-sm text-gray-300">
                                                Sell {sellChamp.name} <Stars star={sellUnit.star} size={13} />
                                            </span>
                                            <span className="flex items-center gap-2 text-2xl font-black text-amber-200">
                                                +<Coin size={20} />
                                                {sellValue(sellChamp.cost, sellUnit.star)}
                                            </span>
                                            <span className="text-[11px] text-gray-500">
                                                returns {copiesOf(sellUnit.star)} cop{sellUnit.star === 1 ? "y" : "ies"} to the pool · E
                                            </span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {loading && (
                <div className="absolute inset-0 z-30 flex items-center justify-center text-sm text-gray-400">
                    Loading champions…
                </div>
            )}

            {!loading && setupOpen && champDefs.length > 0 && (
                <SetupModal
                    champs={champDefs}
                    traitIcons={traitIcons}
                    initial={config}
                    initialTargets={compFromUrl}
                    onStart={startGame}
                    onClose={game ? () => setSetupOpen(false) : null}
                />
            )}

            {showWin && game && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                    <div
                        className="w-[380px] rounded-lg border bg-gradient-to-b from-[#1e1a0e] to-[#0a0f18] p-6 text-center shadow-[0_0_60px_rgba(255,200,60,0.35)]"
                        style={{ borderColor: LOL_GOLD }}
                    >
                        <div className="text-2xl font-black tracking-wide text-amber-200">COMP COMPLETE</div>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {compRows.map(({ target: t, champ }) => (
                                <div key={t.key} className="flex w-14 flex-col items-center gap-0.5">
                                    <img
                                        src={getImageUrl(champ.iconPath)}
                                        alt={champ.name}
                                        className="h-12 w-12 rounded-full"
                                        style={{ border: `3px solid ${STAR_COLOR[t.star]}`, boxShadow: "0 0 14px rgba(255,213,74,0.45)" }}
                                    />
                                    <Stars star={t.star} size={10} />
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
                            <span className="text-left text-gray-400">Gold spent</span>
                            <span className="text-right font-bold text-white">{game.stats.goldSpent}</span>
                            <span className="text-left text-gray-400">Rolls</span>
                            <span className="text-right font-bold text-white">{game.stats.rolls}</span>
                            <span className="text-left text-gray-400">Seen in shop</span>
                            <span className="text-right font-bold text-white">{game.stats.targetSeen}</span>
                            <span className="text-left text-gray-400">XP bought</span>
                            <span className="text-right font-bold text-white">{game.stats.xpBought}</span>
                        </div>
                        <div className="mt-5 flex gap-2">
                            <button
                                onClick={() => config && startGame(config)}
                                className="flex-1 rounded py-2 text-sm font-black text-[#1a1206]"
                                style={{ background: `linear-gradient(180deg, #f0d48a, ${LOL_GOLD})` }}
                            >
                                Play again
                            </button>
                            <button
                                onClick={() => {
                                    setShowWin(false);
                                    setSetupOpen(true);
                                }}
                                className="flex-1 rounded border border-white/15 py-2 text-sm font-semibold text-gray-200 hover:bg-white/5"
                            >
                                New comp
                            </button>
                        </div>
                        <button onClick={() => setShowWin(false)} className="mt-2 text-xs text-gray-500 hover:text-gray-300">
                            Keep playing
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

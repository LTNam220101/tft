import { useEffect, useMemo, useRef, useState } from "react";
import { ACTIVE_SET_KEY } from "../../convex/gameConfig";
import type { ArenaScene, SceneUnit, UnitAnchor } from "./scene";
import type { GameEvent, Star } from "~/rollGame/engine";
import { getImageUrl } from "~/utils";

/** Tile tint while something is dragged over a hex. */
const DROP_COLORS = { empty: "#3b82f6", swap: "#d97706", item: "#22c55e" } as const;

export type BoardDropHint = { idx: number; kind: "champion" | "item" } | null;

/**
 * The team builder's 4×7 hex board rendered with the three.js arena: animated champion models, star size,
 * item icons as an HTML overlay. Picker cards and item icons keep using HTML drag-and-drop onto the canvas;
 * champions already on the board are dragged inside the 3D scene.
 */
export function BuilderBoard3D({
    slots, champByKey, champStars, champItems, itemsByKey, selectedKey, dropHint,
    onHexClick, onBackgroundClick, onMove, onHexDragOver, onHexDrop, onDragLeaveBoard, onItemRemove, onItemDragStart,
}: {
    slots: Array<string | null>;
    champByKey: Map<string, any>;
    champStars: Record<string, Star>;
    champItems: Record<string, Array<string>>;
    itemsByKey: Map<string, any>;
    selectedKey: string | null;
    dropHint: BoardDropHint;
    onHexClick: (idx: number) => void;
    onBackgroundClick: () => void;
    onMove: (fromIdx: number, toIdx: number) => void;
    onHexDragOver: (e: React.DragEvent, idx: number) => void;
    onHexDrop: (e: React.DragEvent, idx: number) => void;
    onDragLeaveBoard: () => void;
    onItemRemove: (champKey: string, itemIdx: number) => void;
    onItemDragStart: (e: React.DragEvent, itemKey: string, champKey: string) => void;
}) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<ArenaScene | null>(null);
    const [sceneReady, setSceneReady] = useState(false);
    const [sceneError, setSceneError] = useState<string | null>(null);
    const [anchors, setAnchors] = useState<Array<UnitAnchor>>([]);

    // Scene units are keyed by a stable number per champion.
    const idByKey = useMemo(() => new Map([...champByKey.keys()].map((k, i) => [k, i + 1])), [champByKey]);
    const keyById = useMemo(() => new Map([...idByKey].map(([k, id]) => [id, k])), [idByKey]);

    // Scene callbacks are bound once; route them through a ref to the latest props.
    const handlers = useRef({ onHexClick, onBackgroundClick, onMove, slots, keyById });
    handlers.current = { onHexClick, onBackgroundClick, onMove, slots, keyById };

    useEffect(() => {
        let disposed = false;
        let instance: ArenaScene | null = null;
        void import("./scene").then(({ ArenaScene: SceneClass }) => {
            if (disposed || !mountRef.current) return;
            try {
                const slotOf = (unitId: number) => {
                    const key = handlers.current.keyById.get(unitId);
                    return key ? handlers.current.slots.indexOf(key) : -1;
                };
                instance = new SceneClass(mountRef.current, {
                    onPick: (hit) => {
                        if (hit?.kind === "unit") {
                            const idx = slotOf(hit.unitId);
                            if (idx >= 0) handlers.current.onHexClick(idx);
                        } else if (hit?.kind === "slot") {
                            handlers.current.onHexClick(hit.slot.index);
                        } else {
                            handlers.current.onBackgroundClick();
                        }
                    },
                    onDrop: (unitId, slot) => {
                        const from = slotOf(unitId);
                        if (slot && from >= 0 && slot.index !== from) handlers.current.onMove(from, slot.index);
                    },
                    onViewChange: () => setAnchors(instance?.unitAnchors() ?? []),
                }, "board");
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

    // Newly placed champions drop in; moves and star changes just update.
    const placedIds = useRef(new Set<number>());
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        const units: Array<SceneUnit> = [];
        slots.forEach((key, idx) => {
            const champ = key ? champByKey.get(key) : undefined;
            const id = key ? idByKey.get(key) : undefined;
            if (!key || !champ || id === undefined) return;
            units.push({
                id,
                star: champStars[key] ?? 1,
                cost: champ.cost ?? 1,
                iconUrl: getImageUrl(champ.iconPath),
                modelUrl: `/models/${ACTIVE_SET_KEY}/${key}.glb`,
                slot: { area: "board", index: idx },
            });
        });
        const events: Array<GameEvent> = units
            .filter((u) => !placedIds.current.has(u.id))
            .map((u) => ({ type: "spawn", unitId: u.id }));
        placedIds.current = new Set(units.map((u) => u.id));
        scene.sync(units, events);
    }, [sceneReady, slots, champStars, champByKey, idByKey]);

    useEffect(() => {
        sceneRef.current?.setSelected(selectedKey ? idByKey.get(selectedKey) ?? null : null);
    }, [sceneReady, selectedKey, idByKey]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        if (!dropHint) {
            scene.setDropHighlight(null, null);
            return;
        }
        const color = dropHint.kind === "item" ? DROP_COLORS.item : slots[dropHint.idx] ? DROP_COLORS.swap : DROP_COLORS.empty;
        scene.setDropHighlight({ area: "board", index: dropHint.idx }, color);
    }, [sceneReady, dropHint, slots]);

    const hexAt = (e: React.DragEvent) => sceneRef.current?.slotAtClient(e.clientX, e.clientY)?.index ?? null;

    return (
        <div
            className="relative h-[380px] w-full overflow-hidden rounded-xl bg-[#0b1626] sm:h-[460px]"
            onDragOver={(e) => {
                const idx = hexAt(e);
                if (idx === null) onDragLeaveBoard();
                else onHexDragOver(e, idx);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDragLeaveBoard();
            }}
            onDrop={(e) => {
                const idx = hexAt(e);
                if (idx === null) onDragLeaveBoard();
                else onHexDrop(e, idx);
            }}
        >
            <div ref={mountRef} className="absolute inset-0" />
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2 text-[10px] text-gray-400">
                <span className="hidden rounded bg-black/40 px-2 py-1 sm:inline">Drag to rotate · scroll to zoom</span>
                <button
                    onClick={() => sceneRef.current?.resetCamera()}
                    className="rounded border border-white/10 bg-black/50 px-2 py-1 font-semibold text-gray-300 hover:text-white"
                >
                    ⟲ Reset view
                </button>
            </div>
            {sceneError && (
                <div className="absolute inset-x-0 top-1/3 text-center text-sm text-red-300">3D board unavailable: {sceneError}</div>
            )}

            {/* Name + items above each unit, positioned from the scene's projection */}
            <div className="pointer-events-none absolute inset-0">
                {anchors.map((a) => {
                    const key = keyById.get(a.id);
                    const champ = key ? champByKey.get(key) : undefined;
                    if (!key || !champ || a.hidden) return null;
                    const items = champItems[key] ?? [];
                    return (
                        <div
                            key={a.id}
                            className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5"
                            style={{ left: a.x, top: a.y }}
                        >
                            {items.length > 0 && (
                                <div className="pointer-events-auto flex gap-0.5">
                                    {items.slice(0, 3).map((ik, i) => {
                                        const it = itemsByKey.get(ik);
                                        return it ? (
                                            <img
                                                key={ik}
                                                src={getImageUrl(it.iconPath)}
                                                alt={it.name}
                                                title={`${it.name} — click to remove, drag to move`}
                                                draggable
                                                onDragStart={(e) => onItemDragStart(e, ik, key)}
                                                onClick={() => onItemRemove(key, i)}
                                                className="h-5 w-5 cursor-pointer rounded-sm border border-white/50 object-cover shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
                                            />
                                        ) : null;
                                    })}
                                </div>
                            )}
                            <span className="whitespace-nowrap text-[10px] font-bold text-white [text-shadow:0_0_4px_#000,0_1px_2px_#000]">
                                {champ.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

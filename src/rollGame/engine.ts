// Pure TFT shop / bench simulation for the 3-star roll mini-game.
// Numbers follow Set 18 live data (LoL Wiki, patch 18.3): shop odds per level,
// copies per champion by cost, XP curve, 2g reroll, 4g for 4 XP.

export type Cost = 1 | 2 | 3 | 4 | 5;
export type Star = 1 | 2 | 3;

export const MIN_LEVEL = 2;
export const MAX_LEVEL = 10;
export const SHOP_SIZE = 5;
export const BENCH_SIZE = 9;
export const BOARD_ROWS = 4;
export const BOARD_COLS = 7;
export const REROLL_COST = 2;
export const BUY_XP_COST = 4;
export const BUY_XP_AMOUNT = 4;

/** Chance (%) per shop slot of each cost, index 0 = 1-cost. */
export const SHOP_ODDS: Record<number, readonly [number, number, number, number, number]> = {
    1: [100, 0, 0, 0, 0],
    2: [100, 0, 0, 0, 0],
    3: [75, 25, 0, 0, 0],
    4: [55, 30, 15, 0, 0],
    5: [45, 33, 20, 2, 0],
    6: [30, 40, 25, 5, 0],
    7: [19, 30, 40, 10, 1],
    8: [15, 20, 32, 30, 3],
    9: [10, 17, 25, 33, 15],
    10: [5, 10, 20, 40, 25],
};

/** Copies of each individual champion in the shared pool. */
export const POOL_SIZE: Record<Cost, number> = { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9 };

/** XP needed to go from level N to N+1. */
export const XP_TO_NEXT: Record<number, number> = {
    1: 2, 2: 2, 3: 6, 4: 10, 5: 20, 6: 36, 7: 56, 8: 68, 9: 68,
};

export type ChampDef = {
    key: string;
    name: string;
    cost: Cost;
    iconPath?: string;
    traits: Array<{ id: string; name: string }>;
};

export type Slot = { area: "bench" | "board"; index: number };

export type Unit = { id: number; champKey: string; star: Star; slot: Slot };

export type GameEvent =
    | { type: "spawn"; unitId: number }
    | { type: "combine"; keeperId: number; consumedIds: Array<number>; star: Star }
    | { type: "sell"; unitId: number; gold: number }
    | { type: "reroll" }
    | { type: "levelUp"; level: number }
    | { type: "targetDone"; unitId: number }
    | { type: "win"; unitId: number }
    | { type: "denied"; reason: "gold" | "bench" | "board" };

/** One champion of the comp to build and the star level it must reach. */
export type CompTarget = { key: string; star: Star };

export type GameConfig = {
    /** The team comp to complete; the game is won when every target reaches its star level. */
    targets: Array<CompTarget>;
    level: number;
    gold: number;
    /** Copies of each target champion already held by opponents. */
    contested: number;
    /** Fraction (0..1) of every other champion's copies held by the rest of the lobby. */
    lobbyTaken: number;
};

/** `targetSeen`: shop slots that showed any comp target. */
export type GameStats = { rolls: number; goldSpent: number; targetSeen: number; xpBought: number };

export type GameState = {
    champs: ReadonlyMap<string, ChampDef>;
    byCost: Readonly<Record<Cost, ReadonlyArray<string>>>;
    config: GameConfig;
    pool: Record<string, number>;
    shop: Array<string | null>;
    locked: boolean;
    level: number;
    xp: number;
    gold: number;
    units: Array<Unit>;
    nextUnitId: number;
    stats: GameStats;
    won: boolean;
    /** Events produced by the latest action; `eventSeq` increments whenever they change. */
    events: Array<GameEvent>;
    eventSeq: number;
};

export type Rng = () => number;

const COSTS: ReadonlyArray<Cost> = [1, 2, 3, 4, 5];

export const copiesOf = (star: Star) => (star === 1 ? 1 : star === 2 ? 3 : 9);

export function sellValue(cost: number, star: Star): number {
    if (star === 1) return cost;
    // 2★/3★ units above 1-cost sell for one gold less than their copies' value.
    return cost * copiesOf(star) - (cost > 1 ? 1 : 0);
}

export function ownedCopies(state: GameState, champKey: string): number {
    return state.units.reduce((sum, u) => (u.champKey === champKey ? sum + copiesOf(u.star) : sum), 0);
}

/** Highest star owned for a champion, 0 when not owned. */
export function bestStar(units: ReadonlyArray<Unit>, champKey: string): number {
    return units.reduce((best, u) => (u.champKey === champKey ? Math.max(best, u.star) : best), 0);
}

/** Comp targets that still need copies (shop cards highlight these). */
export function pendingTargets(state: GameState): Array<CompTarget> {
    return state.config.targets.filter((t) => bestStar(state.units, t.key) < t.star);
}

export type BuyPlan = {
    /** Shop slots bought by one click; the clicked slot comes first. */
    indices: Array<number>;
    /** The purchase completes at least one star-up. */
    combines: boolean;
};

/**
 * Normally a click buys only the clicked copy. On a full bench (in-game rule) the click also buys the other
 * shop copies that, with the owned 1★ copies, complete a 2★ — if the player can afford all of them.
 */
export function buyPlan(state: GameState, shopIndex: number): BuyPlan {
    const champKey = state.shop[shopIndex];
    const champ = champKey ? state.champs.get(champKey) : undefined;
    if (!champKey || !champ) return { indices: [], combines: false };
    const ownedOneStar = state.units.filter((u) => u.champKey === champKey && u.star === 1).length;
    if (ownedOneStar === 2) return { indices: [shopIndex], combines: true };
    const other = state.shop.findIndex((k, i) => k === champKey && i !== shopIndex);
    // With 1 owned copy, two copies from the shop complete the 2★; with none, a full bench has no room.
    const benchFull = freeBenchIndex(state.units) < 0;
    if (benchFull && ownedOneStar === 1 && other >= 0 && state.gold >= 2 * champ.cost) {
        return { indices: [shopIndex, other], combines: true };
    }
    return { indices: [shopIndex], combines: false };
}

function withEvents(state: GameState, events: Array<GameEvent>): GameState {
    return { ...state, events, eventSeq: state.eventSeq + 1 };
}

function pickWeighted<T>(entries: ReadonlyArray<readonly [T, number]>, total: number, rng: Rng): T {
    let roll = rng() * total;
    for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
}

/**
 * Fill a fresh shop. Unbought units in the old shop go back to the pool first;
 * each drawn unit is removed from the pool while it sits in the shop.
 * Per slot: pick a cost tier by level odds, then a champion of that tier weighted by remaining copies.
 * Tiers with no available copies are skipped (their odds are redistributed).
 */
function rollShop(state: GameState, rng: Rng): Pick<GameState, "pool" | "shop" | "stats"> {
    const pool = { ...state.pool };
    for (const key of state.shop) if (key) pool[key] += 1;

    // In-game, a champion you already own at 3★ stops appearing in your shop.
    const maxed = new Set(state.units.filter((u) => u.star === 3).map((u) => u.champKey));
    const odds = SHOP_ODDS[state.level];
    const shop: Array<string | null> = [];
    let targetSeen = state.stats.targetSeen;
    const targetKeys = new Set(state.config.targets.map((t) => t.key));

    for (let s = 0; s < SHOP_SIZE; s++) {
        const tiers = COSTS.map((cost) => {
            const champs = state.byCost[cost]
                .filter((k) => !maxed.has(k) && pool[k] > 0)
                .map((k) => [k, pool[k]] as const);
            const copies = champs.reduce((sum, [, n]) => sum + n, 0);
            return { cost, champs, copies, weight: copies > 0 ? odds[cost - 1] : 0 };
        });
        const totalWeight = tiers.reduce((sum, t) => sum + t.weight, 0);
        if (totalWeight === 0) {
            shop.push(null);
            continue;
        }
        const tier = pickWeighted(tiers.map((t) => [t, t.weight] as const), totalWeight, rng);
        const key = pickWeighted(tier.champs, tier.copies, rng);
        pool[key] -= 1;
        shop.push(key);
        if (targetKeys.has(key)) targetSeen += 1;
    }
    return { pool, shop, stats: { ...state.stats, targetSeen } };
}

export function createGame(champList: ReadonlyArray<ChampDef>, config: GameConfig, rng: Rng): GameState {
    const champs = new Map(champList.map((c) => [c.key, c]));
    const byCost = { 1: [], 2: [], 3: [], 4: [], 5: [] } as Record<Cost, Array<string>>;
    const pool: Record<string, number> = {};
    const targetKeys = new Set(config.targets.map((t) => t.key));
    for (const c of champList) {
        byCost[c.cost].push(c.key);
        const size = POOL_SIZE[c.cost];
        pool[c.key] = targetKeys.has(c.key)
            ? Math.max(0, size - config.contested)
            : size - Math.round(size * config.lobbyTaken);
    }
    const base: GameState = {
        champs,
        byCost,
        config,
        pool,
        shop: [],
        locked: false,
        level: Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, config.level)),
        xp: 0,
        gold: config.gold,
        units: [],
        nextUnitId: 1,
        stats: { rolls: 0, goldSpent: 0, targetSeen: 0, xpBought: 0 },
        won: false,
        events: [],
        eventSeq: 0,
    };
    return { ...base, ...rollShop(base, rng) };
}

export function reroll(state: GameState, rng: Rng): GameState {
    if (state.gold < REROLL_COST) return withEvents(state, [{ type: "denied", reason: "gold" }]);
    const rolled = rollShop(state, rng);
    return withEvents(
        {
            ...state,
            ...rolled,
            gold: state.gold - REROLL_COST,
            stats: { ...rolled.stats, rolls: rolled.stats.rolls + 1, goldSpent: rolled.stats.goldSpent + REROLL_COST },
        },
        [{ type: "reroll" }],
    );
}

export function buyXp(state: GameState): GameState {
    if (state.level >= MAX_LEVEL) return state;
    if (state.gold < BUY_XP_COST) return withEvents(state, [{ type: "denied", reason: "gold" }]);
    let level = state.level;
    let xp = state.xp + BUY_XP_AMOUNT;
    const events: Array<GameEvent> = [];
    while (level < MAX_LEVEL && xp >= XP_TO_NEXT[level]) {
        xp -= XP_TO_NEXT[level];
        level += 1;
        events.push({ type: "levelUp", level });
    }
    if (level >= MAX_LEVEL) xp = 0;
    return withEvents(
        {
            ...state,
            level,
            xp,
            gold: state.gold - BUY_XP_COST,
            stats: {
                ...state.stats,
                goldSpent: state.stats.goldSpent + BUY_XP_COST,
                xpBought: state.stats.xpBought + BUY_XP_AMOUNT,
            },
        },
        events,
    );
}

function freeBenchIndex(units: Array<Unit>): number {
    const used = new Set(units.filter((u) => u.slot.area === "bench").map((u) => u.slot.index));
    for (let i = 0; i < BENCH_SIZE; i++) if (!used.has(i)) return i;
    return -1;
}

/** Board units keep priority (in-game the upgrade stays on the board), then leftmost bench slot. */
function keeperOrder(a: Unit, b: Unit): number {
    const rank = (u: Unit) => (u.slot.index < 0 ? 1e6 : (u.slot.area === "board" ? 0 : 1000) + u.slot.index);
    return rank(a) - rank(b);
}

function resolveCombines(units: Array<Unit>, champKey: string, events: Array<GameEvent>): Array<Unit> {
    let result = units;
    for (const star of [1, 2] as const) {
        const copies = result.filter((u) => u.champKey === champKey && u.star === star).sort(keeperOrder);
        if (copies.length < 3) continue;
        const [keeper, ...rest] = copies.slice(0, 3);
        const consumed = new Set(rest.map((u) => u.id));
        const upgraded: Star = star === 1 ? 2 : 3;
        result = result
            .filter((u) => !consumed.has(u.id))
            .map((u) => (u.id === keeper.id ? { ...u, star: upgraded } : u));
        events.push({ type: "combine", keeperId: keeper.id, consumedIds: [...consumed], star: upgraded });
    }
    return result;
}

export function buy(state: GameState, shopIndex: number): GameState {
    const champKey = state.shop[shopIndex];
    const champ = champKey ? state.champs.get(champKey) : undefined;
    if (!champKey || !champ) return state;
    if (state.gold < champ.cost) return withEvents(state, [{ type: "denied", reason: "gold" }]);

    const plan = buyPlan(state, shopIndex);
    const totalCost = champ.cost * plan.indices.length;
    const benchIndex = freeBenchIndex(state.units);
    // Copies that merge into an owned unit need no bench slot, so a full bench still accepts them.
    const needsSlot = !plan.combines;
    if (needsSlot && benchIndex < 0) return withEvents(state, [{ type: "denied", reason: "bench" }]);

    const bought: Array<Unit> = plan.indices.map((_, n) => ({
        id: state.nextUnitId + n,
        champKey,
        star: 1,
        slot: { area: "bench", index: n === 0 && needsSlot ? benchIndex : -1 },
    }));
    const events: Array<GameEvent> = needsSlot ? [{ type: "spawn", unitId: bought[0].id }] : [];
    const units = resolveCombines([...state.units, ...bought], champKey, events);

    // A target completes once some unit of it reaches the wanted star; the comp is won when all are done.
    for (const t of state.config.targets) {
        if (t.key !== champKey || bestStar(state.units, t.key) >= t.star || bestStar(units, t.key) < t.star) continue;
        const unit = units.find((u) => u.champKey === t.key && u.star >= t.star);
        if (unit) events.push({ type: "targetDone", unitId: unit.id });
    }
    const won = !state.won && state.config.targets.every((t) => bestStar(units, t.key) >= t.star);
    if (won) {
        const last = units.find((u) => u.champKey === champKey);
        if (last) events.push({ type: "win", unitId: last.id });
    }

    const shop = [...state.shop];
    for (const i of plan.indices) shop[i] = null;
    return withEvents(
        {
            ...state,
            shop,
            units,
            gold: state.gold - totalCost,
            nextUnitId: state.nextUnitId + bought.length,
            won: state.won || won,
            stats: { ...state.stats, goldSpent: state.stats.goldSpent + totalCost },
        },
        events,
    );
}

export function sell(state: GameState, unitId: number): GameState {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) return state;
    const champ = state.champs.get(unit.champKey);
    if (!champ) return state;
    const gold = sellValue(champ.cost, unit.star);
    return withEvents(
        {
            ...state,
            units: state.units.filter((u) => u.id !== unitId),
            pool: { ...state.pool, [unit.champKey]: state.pool[unit.champKey] + copiesOf(unit.star) },
            gold: state.gold + gold,
        },
        [{ type: "sell", unitId, gold }],
    );
}

/** Move a unit to a slot, swapping with any occupant. Board size is capped by level. */
export function moveUnit(state: GameState, unitId: number, slot: Slot): GameState {
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) return state;
    const occupant = state.units.find((u) => u.slot.area === slot.area && u.slot.index === slot.index);
    if (occupant?.id === unit.id) return state;

    // Board size equals player level.
    const boardCount = state.units.filter((u) => u.slot.area === "board").length;
    if (slot.area === "board" && unit.slot.area === "bench" && !occupant && boardCount >= state.level) {
        return withEvents(state, [{ type: "denied", reason: "board" }]);
    }
    const units = state.units.map((u) => {
        if (u.id === unit.id) return { ...u, slot };
        if (occupant && u.id === occupant.id) return { ...u, slot: unit.slot };
        return u;
    });
    return { ...state, units };
}

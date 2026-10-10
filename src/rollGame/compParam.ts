import type { CompTarget, Star } from "./engine";

/**
 * `/roll?comp=` format shared by the builder's "Roll this comp" link: `KEY.STAR,KEY.STAR`
 * (champion keys never contain dots or commas).
 */
export function encodeComp(targets: ReadonlyArray<CompTarget>): string {
    return targets.map((t) => `${t.key}.${t.star}`).join(",");
}

/** Unknown keys are dropped by the caller (it knows the champion list); stars are clamped to 1..3. */
export function decodeComp(raw: string | undefined): Array<CompTarget> {
    if (!raw) return [];
    const seen = new Set<string>();
    const targets: Array<CompTarget> = [];
    for (const part of raw.split(",")) {
        const [key, star] = part.split(".");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        targets.push({ key, star: Math.min(3, Math.max(1, Number(star) || 1)) as Star });
    }
    return targets;
}

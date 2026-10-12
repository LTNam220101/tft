import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { ACTIVE_SET_KEY } from "./gameConfig";
import { getChampionRole } from "./optimizerRoles";

export const getChampions = internalQuery({
    args: { setKey: v.string() },
    handler: async (ctx, { setKey }) => {
        return await ctx.db
            .query("champions")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", setKey))
            .collect();
    },
});

export const getTraits = query({
    args: { setKey: v.optional(v.string()) },
    handler: async (ctx, { setKey }) => {
        const key = setKey ?? ACTIVE_SET_KEY;
        return await ctx.db
            .query("traits")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", key))
            .collect();
    },
});

export const getTraitsInternal = internalQuery({
    args: { setKey: v.string() },
    handler: async (ctx, { setKey }) => {
        return await ctx.db
            .query("traits")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", setKey))
            .collect();
    },
});

export const getItems = query({
    args: { setKey: v.optional(v.string()) },
    handler: async (ctx, { setKey }) => {
        const key = setKey ?? ACTIVE_SET_KEY;
        return await ctx.db
            .query("items")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", key))
            .collect();
    },
});

export const getItemsInternal = internalQuery({
    args: { setKey: v.string() },
    handler: async (ctx, { setKey }) => {
        return await ctx.db
            .query("items")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", setKey))
            .collect();
    },
});

export const listChampions = query({
    args: { setKey: v.optional(v.string()) },
    handler: async (ctx, { setKey }) => {
        const key = setKey ?? ACTIVE_SET_KEY;
        const champions = await ctx.db
            .query("champions")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", key))
            .collect();
        return champions
            .map((c) => ({
                ...c,
                role: getChampionRole(c),
            }))
            .sort((a, b) => {
                if ((a.cost ?? 0) !== (b.cost ?? 0)) {
                    return (a.cost ?? 0) - (b.cost ?? 0);
                }
                return (a.name ?? "").localeCompare(b.name ?? "");
            });
    },
});

export const getAugments = query({
    args: {
        setKey: v.optional(v.string()),
        tier: v.optional(v.number()),
    },
    handler: async (ctx, { setKey, tier }) => {
        const key = setKey ?? ACTIVE_SET_KEY;
        let queryBuilder;
        if (tier !== undefined) {
            queryBuilder = ctx.db
                .query("augments")
                .withIndex("by_setKey_and_tier", (q) => q.eq("setKey", key).eq("tier", tier));
        } else {
            queryBuilder = ctx.db
                .query("augments")
                .withIndex("by_setKey_and_key", (q) => q.eq("setKey", key));
        }
        const list = await queryBuilder.collect();
        return list.sort((a, b) => {
            if ((a.tier ?? 2) !== (b.tier ?? 2)) {
                return (a.tier ?? 2) - (b.tier ?? 2);
            }
            return (a.name ?? "").localeCompare(b.name ?? "");
        });
    },
});

export const getComponents = query({
    args: { setKey: v.optional(v.string()) },
    handler: async (ctx, { setKey }) => {
        const key = setKey ?? ACTIVE_SET_KEY;
        const items = await ctx.db
            .query("items")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", key))
            .collect();
        return items.filter((i) => i.isComponent);
    },
});

export const getItemRecipes = query({
    args: { setKey: v.optional(v.string()) },
    handler: async (ctx, { setKey }) => {
        const key = setKey ?? ACTIVE_SET_KEY;
        const items = await ctx.db
            .query("items")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", key))
            .collect();
        const itemMap = new Map(items.map((i) => [i.nameId ?? i.key ?? "", i]));
        return items
            .filter((i) => i.composition && i.composition.length === 2)
            .map((item) => {
                const comp1 = item.composition ? itemMap.get(item.composition[0]) : undefined;
                const comp2 = item.composition ? itemMap.get(item.composition[1]) : undefined;
                return {
                    ...item,
                    components: [comp1, comp2],
                };
            });
    },
});


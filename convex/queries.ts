import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { ACTIVE_SET_KEY } from "./gameConfig";

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
        return champions.sort((a, b) => {
            if ((a.cost ?? 0) !== (b.cost ?? 0)) {
                return (a.cost ?? 0) - (b.cost ?? 0);
            }
            return (a.name ?? "").localeCompare(b.name ?? "");
        });
    },
});

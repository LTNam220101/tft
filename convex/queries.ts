import { query, internalQuery } from "./_generated/server";

export const getChampions = internalQuery({
    handler: async (ctx) => {
        return await ctx.db.query("champions").collect();
    },
});

export const getTraits = internalQuery({
    handler: async (ctx) => {
        return await ctx.db.query("traits").collect();
    },
});

export const getItems = query({
    handler: async (ctx) => {
        return await ctx.db.query("items").collect();
    },
});

export const getItemsInternal = internalQuery({
    handler: async (ctx) => {
        return await ctx.db.query("items").collect();
    },
});
export const listChampions = query({
    handler: async (ctx) => {
        return await ctx.db.query("champions").collect();
    },
});

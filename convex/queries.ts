import { query, internalQuery } from "./_generated/server";

export const getChampions = internalQuery({
    handler: async (ctx) => {
        return await ctx.db.query("champions").collect();
    },
});

export const getTraits = query({
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
        const champions = await ctx.db.query("champions").collect();
        return champions.sort((a, b) => {
            if ((a.cost ?? 0) !== (b.cost ?? 0)) {
                return (a.cost ?? 0) - (b.cost ?? 0);
            }
            return (a.name ?? "").localeCompare(b.name ?? "");
        });
    },
});

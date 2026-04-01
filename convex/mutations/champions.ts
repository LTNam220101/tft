import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ACTIVE_SET_KEY } from "../gameConfig";

export const toggleLock = mutation({
    args: {
        id: v.id("champions"),
        isLocked: v.boolean(),
    },
    handler: async (ctx, { id, isLocked }) => {
        await ctx.db.patch(id, { isLocked });
    },
});

export const bulkLockByName = mutation({
    args: {
        names: v.array(v.string()),
        setKey: v.optional(v.string()),
    },
    handler: async (ctx, { names, setKey }) => {
        const key = setKey ?? ACTIVE_SET_KEY;
        const all = await ctx.db
            .query("champions")
            .withIndex("by_setKey_and_key", (q) => q.eq("setKey", key))
            .collect();
        for (const champ of all) {
            // Check for exact name or trimmed name (to handle "Thresh ")
            if (names.some(n => n.trim().toLowerCase() === champ.name?.trim().toLowerCase())) {
                await ctx.db.patch(champ._id, { isLocked: true });
            }
        }
    },
});

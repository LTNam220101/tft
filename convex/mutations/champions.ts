import { v } from "convex/values";
import { mutation } from "../_generated/server";

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
    },
    handler: async (ctx, { names }) => {
        const all = await ctx.db.query("champions").collect();
        for (const champ of all) {
            // Check for exact name or trimmed name (to handle "Thresh ")
            if (names.some(n => n.trim().toLowerCase() === champ.name?.trim().toLowerCase())) {
                await ctx.db.patch(champ._id, { isLocked: true });
            }
        }
    },
});

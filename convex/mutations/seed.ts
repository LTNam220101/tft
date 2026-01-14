import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { champion, item, trait } from '../schema'

export const insertAll = mutation({
  args: {
    champions: v.array((champion)),
    traits: v.array(trait),
    items: v.array(item),
  },
  handler: async ({ db }, { champions, traits, items }) => {
    for (const c of champions) await db.insert('champions', c)
    for (const t of traits) await db.insert('traits', t)
    for (const i of items) await db.insert('items', i)
  },
})

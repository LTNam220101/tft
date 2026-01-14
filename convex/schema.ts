import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const champion = v.object({
  key: v.optional(v.string()), // TFT16_Ahri
  name: v.optional(v.string()),
  tier: v.optional(v.number()),
  cost: v.optional(v.number()),
  icon: v.optional(v.string()),
})
export const trait = v.object({
  key: v.optional(v.string()), // TFT16_Invoker
  name: v.optional(v.string()),
  icon: v.optional(v.string()),
})
export const item = v.object({
  key: v.optional(v.string()), // TFT16_EmblemItems_Invoker
  name: v.optional(v.string()),
  icon: v.optional(v.string()),
})

export default defineSchema({
  champions: defineTable(champion).index('by_key', ['key']),
  
  traits: defineTable(trait).index('by_key', ['key']),
  
  items: defineTable(item).index('by_key', ['key']),
})

export type Champion = Infer<typeof champion>
export type Trait = Infer<typeof trait>
export type Item = Infer<typeof item>

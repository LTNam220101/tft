import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

// Champion schema based on tftchampions-teamplanner.json
export const champion = v.object({
  /** TFTSet16 / TFTSet17 — same tables hold multiple sets */
  setKey: v.optional(v.string()),
  key: v.optional(v.string()), // tft16_ahri
  name: v.optional(v.string()),
  cost: v.optional(v.number()),
  traits: v.optional(v.array(v.object({
    name: v.string(),
    id: v.string(),
    amount: v.number(),
  }))), // trait ids from game data, e.g. TFTSet17_* / TFT17_*
  iconPath: v.optional(v.string()),
  path: v.optional(v.string()), // e.g. Characters/TFT17_Ahri
  isLocked: v.optional(v.boolean()),
})

// Trait schema based on tfttraits.json
export const trait = v.object({
  setKey: v.optional(v.string()),
  key: v.optional(v.string()), // e.g. TFTSet17_Arcana
  name: v.optional(v.string()),
  iconPath: v.optional(v.string()),
  description: v.optional(v.string()),
  effects: v.optional(v.array(v.any())),
  unique: v.optional(v.boolean()),
  isRegion: v.optional(v.boolean()),
})

// Item schema based on tftitems.json
export const item = v.object({
  setKey: v.optional(v.string()),
  key: v.optional(v.string()), // e.g. TFT17_Item_Emblem
  name: v.optional(v.string()),
  nameId: v.optional(v.string()),
  iconPath: v.optional(v.string()),
})

export default defineSchema({
  champions: defineTable(champion).index('by_setKey_and_key', ['setKey', 'key']),
  traits: defineTable(trait).index('by_setKey_and_key', ['setKey', 'key']),
  items: defineTable(item).index('by_setKey_and_key', ['setKey', 'key']),
})

export type Champion = Infer<typeof champion>
export type Trait = Infer<typeof trait>
export type Item = Infer<typeof item>

import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

// Champion schema based on tftchampions-teamplanner.json
export const champion = v.object({
  key: v.optional(v.string()), // tft16_ahri
  name: v.optional(v.string()),
  cost: v.optional(v.number()),
  traits: v.optional(v.array(v.object({
    name: v.string(),
    id: v.string(),
    amount: v.number(),
  }))), // ["TFTSet16_Arcana", "TFTSet16_Scholar"]
  iconPath: v.optional(v.string()),
  path: v.optional(v.string()), // Characters/TFT16_Ahri
  isLocked: v.optional(v.boolean()),
})

// Trait effect schema
const traitEffect = v.object({
  min_units: v.optional(v.number()),
  max_units: v.optional(v.number()),
  style_idx: v.optional(v.number()),
  style_name: v.optional(v.string()),
})

// Trait schema based on tfttraits.json
export const trait = v.object({
  key: v.optional(v.string()), // TFTSet16_Arcana
  name: v.optional(v.string()),
  iconPath: v.optional(v.string()),
  description: v.optional(v.string()),
  effects: v.optional(v.array(v.any())),
  unique: v.optional(v.boolean()),
  isRegion: v.optional(v.boolean()),
})

// Item schema based on tftitems.json
export const item = v.object({
  key: v.optional(v.string()), // TFT16_Item_Sword
  name: v.optional(v.string()),
  nameId: v.optional(v.string()),
  iconPath: v.optional(v.string()),
})

export default defineSchema({
  champions: defineTable(champion).index('by_key', ['key']),
  traits: defineTable(trait).index('by_key', ['key']),
  items: defineTable(item).index('by_key', ['key']),
})

export type Champion = Infer<typeof champion>
export type Trait = Infer<typeof trait>
export type Item = Infer<typeof item>

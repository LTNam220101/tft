import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

// Champion schema based on tftchampions-teamplanner.json
export const champion = v.object({
  /** TFTSet16 / TFTSet17 / TFTSet18 — same tables hold multiple sets */
  setKey: v.optional(v.string()),
  key: v.optional(v.string()), // tft16_ahri / DA_18_Ahri
  name: v.optional(v.string()),
  cost: v.optional(v.number()),
  traits: v.optional(v.array(v.object({
    name: v.string(),
    id: v.string(),
    amount: v.number(),
  }))), // trait ids from game data, e.g. TFTSet17_* / TFT18_* / DA_*
  iconPath: v.optional(v.string()),
  path: v.optional(v.string()), // e.g. Characters/DA_18_Ahri
  isLocked: v.optional(v.boolean()),
  detailedRole: v.optional(v.string()),
  /** Base stats at 1-star, plus computed multi-star scalings */
  stats: v.optional(v.object({
    hp: v.optional(v.number()),
    damage: v.optional(v.number()),
    armor: v.optional(v.number()),
    magicResist: v.optional(v.number()),
    attackSpeed: v.optional(v.number()),
    mana: v.optional(v.number()),
    initialMana: v.optional(v.number()),
    range: v.optional(v.number()),
    critChance: v.optional(v.number()),
    critMultiplier: v.optional(v.number()),
    /** HP values for [1★, 2★, 3★, 4★] (scales 1.8x per star) */
    hpPerStar: v.optional(v.array(v.number())),
    /** Attack Damage values for [1★, 2★, 3★, 4★] (scales 1.5x per star) */
    damagePerStar: v.optional(v.array(v.number())),
  })),
  /** Champion ability / skill info, sourced from cdragon/tft/en_us.json */
  ability: v.optional(v.object({
    name: v.optional(v.string()),
    desc: v.optional(v.string()),
    formattedDesc: v.optional(v.string()),
    icon: v.optional(v.string()),
    variables: v.optional(v.array(v.object({
      name: v.string(),
      value: v.array(v.number()),
    }))),
  })),
})

// Trait schema based on tfttraits.json
export const trait = v.object({
  setKey: v.optional(v.string()),
  key: v.optional(v.string()), // e.g. TFTSet17_Arcana / DA_18_Elderwood
  name: v.optional(v.string()),
  iconPath: v.optional(v.string()),
  description: v.optional(v.string()),
  /** Innate-only; per-row tooltip merges with `effects[].constants` in the client */
  innateConstants: v.optional(v.record(v.string(), v.number())),
  effects: v.optional(v.array(v.any())),
  unique: v.optional(v.boolean()),
  isRegion: v.optional(v.boolean()),
})

// Item schema based on tftitems.json and cdragon/tft/en_us.json
export const item = v.object({
  setKey: v.optional(v.string()),
  key: v.optional(v.string()), // e.g. DA_Bloodthirster / TFT_Item_BFSword
  name: v.optional(v.string()),
  nameId: v.optional(v.string()),
  iconPath: v.optional(v.string()),
  desc: v.optional(v.string()),
  isEmblem: v.optional(v.boolean()),
  isComponent: v.optional(v.boolean()),
  itemType: v.optional(v.string()), // 'normal' | 'component' | 'emblem' | 'radiant' | 'artifact' | 'support' | 'consumable'
  /** Component item nameIds/keys required to craft this item, e.g. ["DA_Component_BFSword", "DA_Component_NegatronCloak"] */
  composition: v.optional(v.array(v.string())),
  /** Stat bonuses from cdragon/tft/en_us.json — AD is fractional (0.1 = +10% base AD), HP/Armor/etc are flat */
  effects: v.optional(v.record(v.string(), v.number())),
})

// Augment schema based on cdragon/tft/en_us.json
export const augment = v.object({
  setKey: v.optional(v.string()),
  key: v.optional(v.string()), // e.g. DA_18_BigGrabBag
  name: v.optional(v.string()),
  desc: v.optional(v.string()),
  iconPath: v.optional(v.string()),
  tier: v.optional(v.number()), // 1: Silver, 2: Gold, 3: Prismatic
  associatedTraits: v.optional(v.array(v.string())),
  effects: v.optional(v.record(v.string(), v.number())),
})

export default defineSchema({
  champions: defineTable(champion).index('by_setKey_and_key', ['setKey', 'key']),
  traits: defineTable(trait).index('by_setKey_and_key', ['setKey', 'key']),
  items: defineTable(item).index('by_setKey_and_key', ['setKey', 'key']),
  augments: defineTable(augment)
    .index('by_setKey_and_key', ['setKey', 'key'])
    .index('by_setKey_and_tier', ['setKey', 'tier']),
})

export type Champion = Infer<typeof champion>
export type Trait = Infer<typeof trait>
export type Item = Infer<typeof item>
export type Augment = Infer<typeof augment>

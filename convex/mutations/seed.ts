import { v } from 'convex/values'
import { action, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'
import { champion, item, trait } from '../schema'

const BASE = 'https://raw.communitydragon.org/16.1/plugins/rcp-be-lol-game-data/global/default/v1'

interface RawChampion {
  character_id: string
  display_name: string
  tier: number
  traits: Array<{ id: string; name: string; amount: number; }>
  squareIconPath: string
  path: string
}

interface RawTrait {
  trait_id: string
  display_name: string
  set: string
  icon_path: string
  tooltip_text?: string
  conditional_trait_sets?: Array<{
    min_units?: number
    max_units?: number
    style_idx?: number
    style_name?: string
  }>
}

interface RawItem {
  guid: string
  name: string
  nameId: string
  squareIconPath: string
}

// Action that fetches data from Community Dragon API and seeds the database
export const seedFromApi = action({
  args: {},
  handler: async (ctx) => {
    const [championsJson, traitsJson, itemsJson] = await Promise.all([
      fetch(`${BASE}/tftchampions-teamplanner.json`).then((r) => r.json()),
      fetch(`${BASE}/tfttraits.json`).then((r) => r.json()),
      fetch(`${BASE}/tftitems.json`).then((r) => r.json()),
    ])

    // Filter champions where path starts with "Characters/TFT16_"
    const champions = (championsJson?.TFTSet16 as RawChampion[])
      .filter((c) => c.path?.startsWith('Characters/TFT16_'))
      .map((c) => ({
        key: c.character_id,
        name: c.display_name,
        cost: c.tier,
        traits: c.traits || [],
        iconPath: c.squareIconPath,
        path: c.path,
      }))

    // Filter traits where set is "TFTSet16"
    const traits = (traitsJson as RawTrait[])
      .filter((t) => (t.set === 'TFTSet16' && !t.trait_id.startsWith('TFT16_Teamup_')))
      .map((t) => ({
        key: t.trait_id,
        name: t.display_name,
        iconPath: t.icon_path,
        unique: false,
        isRegion: [
          'Demacia',
          'Ionia',
          'Noxus',
          'Piltover',
          'Shurima',
          'Targon',
          'Void',
          'Zaun',
          'Freljord',
          'Ixtal',
          'Shadow Isles',
        ].includes(t.display_name),
        description: t.tooltip_text,
        effects: t?.conditional_trait_sets?.map((e) => ({
          min_units: e.min_units,
          max_units: e.max_units,
          style_idx: e.style_idx,
          style_name: e.style_name,
        })),
      }))

    // Filter items where nameId starts with "TFT16_"
    const items = (itemsJson as RawItem[])
      .filter((i) => (i.nameId?.startsWith('TFT16_') && i.name.includes('Emblem')))
      .map((i) => ({
        key: i.guid,
        name: i.name,
        nameId: i.nameId,
        iconPath: i.squareIconPath,
      }))

    // Insert data using internal mutation
    await ctx.runMutation(internal.mutations.seed.insertAll, {
      champions,
      traits,
      items,
    })

    return { champions: champions.length, traits: traits.length, items: items.length }
  },
})

// Internal mutation to insert all data
export const insertAll = internalMutation({
  args: {
    champions: v.array(champion),
    traits: v.array(trait),
    items: v.array(item),
  },
  handler: async ({ db }, { champions, traits, items }) => {
    for (const c of champions) await db.insert('champions', c)
    for (const t of traits) await db.insert('traits', t)
    for (const i of items) await db.insert('items', i)
  },
})

export const markTraitsAsRegion = internalMutation({
  args: {
    keys: v.array(v.string()),
    isRegion: v.boolean(),
  },
  handler: async ({ db }, { keys, isRegion }) => {
    for (const key of keys) {
      const trait = await db
        .query('traits')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique()
      if (trait) {
        await db.patch(trait._id, { isRegion })
      }
    }
  },
})
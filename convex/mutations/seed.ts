import { v } from 'convex/values'
import { action, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'
import { champion, item, trait } from '../schema'

/**
 * Community Dragon patch folder (e.g. 17.1). Change when the client ships Set 17 data.
 * @see https://raw.communitydragon.org/
 */
const CDRAGON_PATCH = 'pbe'

const BASE = `${CDRAGON_PATCH}/plugins/rcp-be-lol-game-data/global/en_au/v1`

/** Key in tftchampions-teamplanner.json (e.g. TFTSet17). */
const SET_CHAMPIONS_KEY = 'TFTSet17' as const

/** Champion path prefix in team planner JSON (e.g. Characters/TFT17_Ahri). */
const CHAMPION_PATH_PREFIX = 'Characters/TFT17_'

/** tfttraits.json `set` field for the active set. */
const SET_TRAITS_FILTER = 'TFTSet17'

/** Exclude team-up / revival traits if present. */
const TEAMUP_TRAIT_ID_PREFIX = 'TFT17_Teamup_'

/** tftitems nameId prefix for set-scoped items. */
const ITEM_NAMEID_PREFIX = 'TFT17_'

/**
 * Trait display names that count as "regions" for World Runes mode (`isRegion`) and UI.
 * Set 17: fill from `tfttraits.json` for your patch, or use `markTraitsAsRegion` after seed.
 */
const REGION_TRAIT_DISPLAY_NAMES: string[] = []

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

    const championSetRaw = (championsJson as Record<string, RawChampion[] | undefined>)?.[
      SET_CHAMPIONS_KEY
    ]
    if (!championSetRaw?.length) {
      throw new Error(
        `No champions for ${SET_CHAMPIONS_KEY} at ${BASE}/tftchampions-teamplanner.json — adjust CDRAGON_PATCH or wait for Set 17 data.`,
      )
    }

    const champions = championSetRaw
      .filter((c) => c.path?.startsWith(CHAMPION_PATH_PREFIX))
      .map((c) => ({
        key: c.character_id,
        name: c.display_name,
        cost: c.tier,
        traits: c.traits || [],
        iconPath: c.squareIconPath,
        path: c.path,
      }))

    if (champions.length === 0) {
      throw new Error(
        `No champions left after ${CHAMPION_PATH_PREFIX} filter — check CHAMPION_PATH_PREFIX matches client data.`,
      )
    }

    const traits = (traitsJson as RawTrait[])
      .filter(
        (t) => t.set === SET_TRAITS_FILTER && !t.trait_id.startsWith(TEAMUP_TRAIT_ID_PREFIX),
      )
      .map((t) => ({
        key: t.trait_id,
        name: t.display_name,
        iconPath: t.icon_path,
        unique: false,
        isRegion: REGION_TRAIT_DISPLAY_NAMES.includes(t.display_name),
        description: t.tooltip_text,
        effects: t?.conditional_trait_sets?.map((e) => ({
          min_units: e.min_units,
          max_units: e.max_units,
          style_idx: e.style_idx,
          style_name: e.style_name,
        })),
      }))

    const items = (itemsJson as RawItem[])
      .filter(
        (i) => i.nameId?.startsWith(ITEM_NAMEID_PREFIX) && i.name.includes('Emblem'),
      )
      .map((i) => ({
        key: i.guid,
        name: i.name,
        nameId: i.nameId,
        iconPath: i.squareIconPath,
      }))

    await ctx.runMutation(internal.mutations.seed.insertAll, {
      champions,
      traits,
      items,
      setKey: SET_TRAITS_FILTER,
    })

    return { champions: champions.length, traits: traits.length, items: items.length }
  },
})

/** Inserts one set’s snapshot; does not remove other sets (same tables, different `setKey`). */
export const insertAll = internalMutation({
  args: {
    champions: v.array(champion),
    traits: v.array(trait),
    items: v.array(item),
    setKey: v.string(),
  },
  handler: async ({ db }, { champions, traits, items, setKey }) => {
    for (const c of champions) await db.insert('champions', { ...c, setKey })
    for (const t of traits) await db.insert('traits', { ...t, setKey })
    for (const i of items) await db.insert('items', { ...i, setKey })
  },
})

/**
 * One-time after adding `setKey` + indexes: tag existing rows as a given set (e.g. all current data → TFTSet16).
 * Run before relying on `by_setKey_and_key` queries.
 */
export const backfillLegacySetKeys = internalMutation({
  args: { setKey: v.string() },
  handler: async ({ db }, { setKey }) => {
    for (const table of ['champions', 'traits', 'items'] as const) {
      const docs = await db.query(table).collect()
      for (const doc of docs) {
        if (doc.setKey === undefined) {
          await db.patch(doc._id, { setKey })
        }
      }
    }
  },
})

export const markTraitsAsRegion = internalMutation({
  args: {
    setKey: v.string(),
    keys: v.array(v.string()),
    isRegion: v.boolean(),
  },
  handler: async ({ db }, { setKey, keys, isRegion }) => {
    for (const key of keys) {
      const trait = await db
        .query('traits')
        .withIndex('by_setKey_and_key', (q) => q.eq('setKey', setKey).eq('key', key))
        .unique()
      if (trait) {
        await db.patch(trait._id, { isRegion })
      }
    }
  },
})
import { v } from 'convex/values'
import { action, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'
import { champion, item, trait } from '../schema'
import { determineChampionRole } from '../optimizerRoles'

/**
 * Community Dragon patch folder (e.g. 17.1). Change when the client ships Set 17 data.
 * @see https://raw.communitydragon.org/
 */
const CDRAGON_PATCH = 'pbe'

const BASE = `https://raw.communitydragon.org/${CDRAGON_PATCH}/plugins/rcp-be-lol-game-data/global/default/v1`
const CDRAGON_TFT = `https://raw.communitydragon.org/${CDRAGON_PATCH}/cdragon/tft/en_us.json`

/** Key in tftchampions-teamplanner.json (e.g. TFTSet17). */
const SET_CHAMPIONS_KEY = 'TFTSet18' as const

/** Champion path prefixes in team planner JSON (e.g. Characters/DA_ or Characters/TFT18_). */
const CHAMPION_PATH_PREFIXES = ['Characters/DA_', 'Characters/TFT18_'] as const

/** tfttraits.json `set` field for the active set. */
const SET_TRAITS_FILTER = 'TFTSet18'

/** Exclude team-up / revival traits if present. */
const TEAMUP_TRAIT_ID_PREFIX = 'TFT18_Teamup_'

/** tftitems nameId prefix for set-scoped items. */
const ITEM_NAMEID_PREFIX = 'DA_18_'

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
  innate_trait_sets?: Array<{
    constants?: Array<{ name: string; value: number }>
  }>
  conditional_trait_sets?: Array<{
    constants?: Array<{ name: string; value: number }>
    min_units?: number
    max_units?: number
    style_idx?: number
    style_name?: string
  }>
}

/** Remove null/undefined entries from a flat number record (for item effects). */
function filterNullRecord(obj: Record<string, number | null | undefined> | undefined): Record<string, number> | undefined {
  if (!obj) return undefined
  const result: Record<string, number> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) result[k] = v
  }
  return Object.keys(result).length ? result : undefined
}

/** Remove null values from a typed object so v.optional validators don't reject them. */
function stripNulls<T extends object>(obj: T | undefined): { [K in keyof T]?: Exclude<T[K], null> } | undefined {
  if (!obj) return undefined
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null)
  ) as { [K in keyof T]?: Exclude<T[K], null> }
}

/** Innate-only (used as base for merge). */
function flattenInnateConstants(t: RawTrait): Record<string, number> {
  const map: Record<string, number> = {}
  for (const set of t.innate_trait_sets ?? []) {
    for (const c of set.constants ?? []) {
      if (c?.name != null && typeof c.value === 'number') {
        map[c.name] = c.value
      }
    }
  }
  return map
}

interface RawItem {
  guid: string
  name: string
  nameId: string
  squareIconPath: string
}

interface CdragonChampion {
  apiName: string
  characterName?: string
  name?: string
  role?: string | null
  ability?: {
    desc?: string
    name?: string
    variables?: Array<{ name: string; value: number[] }>
  }
  stats?: {
    hp?: number
    damage?: number
    armor?: number
    magicResist?: number
    attackSpeed?: number
    mana?: number
    initialMana?: number
    range?: number
    critChance?: number
    critMultiplier?: number
  }
}

interface CdragonItem {
  apiName: string
  effects?: Record<string, number>
}


type UpsertStats = {
  championsInserted: number
  championsUpdated: number
  traitsInserted: number
  traitsUpdated: number
  itemsInserted: number
  itemsUpdated: number
}

// Action that fetches data from Community Dragon API and seeds the database
export const seedFromApi = action({
  args: {},
  handler: async (ctx): Promise<{
    champions: number
    traits: number
    items: number
  } & UpsertStats> => {
    const [championsJson, traitsJson, itemsJson, cdragonJson] = await Promise.all([
      fetch(`${BASE}/tftchampions-teamplanner.json`).then((r) => r.json()),
      fetch(`${BASE}/tfttraits.json`).then((r) => r.json()),
      fetch(`${BASE}/tftitems.json`).then((r) => r.json()),
      fetch(CDRAGON_TFT).then((r) => r.json()),
    ])

    // Build lookup maps from cdragon data
    const cdragon = cdragonJson as {
      sets?: Record<string, { champions?: CdragonChampion[] }>
      setData?: Array<{ mutator?: string; number?: number; champions?: CdragonChampion[] }>
      items?: CdragonItem[]
    }
    const set18Champions: CdragonChampion[] =
      cdragon.sets?.['18']?.champions ??
      cdragon.setData?.find((s) => s.mutator === 'TFTSet18' || s.number === 18)?.champions ??
      []
    const cdragonChampMap = new Map<string, CdragonChampion>()
    for (const c of set18Champions) {
      if (c.apiName) cdragonChampMap.set(c.apiName, c)
      if (c.characterName) cdragonChampMap.set(c.characterName, c)
    }
    const itemEffectsMap = new Map<string, Record<string, number>>(
      (cdragon.items ?? [])
        .filter((i) => i.effects != null)
        .map((i) => [i.apiName, i.effects!]),
    )

    const championSetRaw = (championsJson as Record<string, RawChampion[] | undefined>)?.[
      SET_CHAMPIONS_KEY
    ]
    if (!championSetRaw?.length) {
      throw new Error(
        `No champions for ${SET_CHAMPIONS_KEY} at ${BASE}/tftchampions-teamplanner.json — adjust CDRAGON_PATCH or wait for Set 18 data.`,
      )
    }

    const champions = championSetRaw
      .filter((c) => CHAMPION_PATH_PREFIXES.some((p) => c.path?.startsWith(p)))
      .map((c) => {
        const cd = cdragonChampMap.get(c.character_id)
        const traits = (c.traits || []).map((t) => t.name)
        const range = cd?.stats?.range ?? 1
        const desc = cd?.ability?.desc ?? ''
        const role = determineChampionRole(c.display_name, cd?.role, desc, range, traits)

        return {
          key: c.character_id,
          name: c.display_name,
          cost: c.tier,
          role,
          rawRole: cd?.role ?? undefined,
          traits: c.traits || [],
          iconPath: c.squareIconPath,
          path: c.path,
          stats: stripNulls(cd?.stats),
        }
      })

    if (champions.length === 0) {
      throw new Error(
        `No champions left after prefix filter — check CHAMPION_PATH_PREFIXES matches client data.`,
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
        innateConstants: flattenInnateConstants(t),
        effects: t?.conditional_trait_sets?.map((e) => ({
          min_units: e.min_units,
          max_units: e.max_units,
          style_idx: e.style_idx,
          style_name: e.style_name,
          constants: e?.constants,
        })),
      }))

    const items = (itemsJson as RawItem[])
      .filter(
        (i) =>
          i.nameId?.startsWith(ITEM_NAMEID_PREFIX) &&
          !i.name.includes('Recipe') &&
          !i.nameId.includes('_Placeholder'),
      )
      .map((i) => ({
        key: i.guid,
        name: i.name,
        nameId: i.nameId,
        iconPath: i.squareIconPath,
        isEmblem: i.name.includes('Emblem'),
        effects: filterNullRecord(itemEffectsMap.get(i.nameId)),
      }))

    const stats: UpsertStats = await ctx.runMutation(
      internal.mutations.seed.insertAll,
      {
        champions,
        traits,
        items,
        setKey: SET_TRAITS_FILTER,
      },
    )

    return {
      champions: champions.length,
      traits: traits.length,
      items: items.length,
      ...stats,
    }
  },
})

/** Upserts one set’s snapshot by `(setKey, key)` — insert if missing, else replace. Other sets untouched. */
export const insertAll = internalMutation({
  args: {
    champions: v.array(champion),
    traits: v.array(trait),
    items: v.array(item),
    setKey: v.string(),
  },
  returns: v.object({
    championsInserted: v.number(),
    championsUpdated: v.number(),
    traitsInserted: v.number(),
    traitsUpdated: v.number(),
    itemsInserted: v.number(),
    itemsUpdated: v.number(),
  }),
  handler: async ({ db }, { champions, traits, items, setKey }) => {
    let championsInserted = 0
    let championsUpdated = 0
    let traitsInserted = 0
    let traitsUpdated = 0
    let itemsInserted = 0
    let itemsUpdated = 0

    for (const c of champions) {
      if (!c.key) continue
      const payload = { ...c, setKey }
      const existing = await db
        .query('champions')
        .withIndex('by_setKey_and_key', (q) => q.eq('setKey', setKey).eq('key', c.key))
        .unique()
      if (existing) {
        await db.replace(existing._id, payload)
        championsUpdated++
      } else {
        await db.insert('champions', payload)
        championsInserted++
      }
    }

    for (const t of traits) {
      if (!t.key) continue
      const payload = { ...t, setKey }
      const existing = await db
        .query('traits')
        .withIndex('by_setKey_and_key', (q) => q.eq('setKey', setKey).eq('key', t.key))
        .unique()
      if (existing) {
        await db.replace(existing._id, payload)
        traitsUpdated++
      } else {
        await db.insert('traits', payload)
        traitsInserted++
      }
    }

    for (const i of items) {
      if (!i.key) continue
      const payload = { ...i, setKey }
      const existing = await db
        .query('items')
        .withIndex('by_setKey_and_key', (q) => q.eq('setKey', setKey).eq('key', i.key))
        .unique()
      if (existing) {
        await db.replace(existing._id, payload)
        itemsUpdated++
      } else {
        await db.insert('items', payload)
        itemsInserted++
      }
    }

    return {
      championsInserted,
      championsUpdated,
      traitsInserted,
      traitsUpdated,
      itemsInserted,
      itemsUpdated,
    }
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
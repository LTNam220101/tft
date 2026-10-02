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

/** tftitems nameId prefixes for set-scoped items. */
const ITEM_NAMEID_PREFIXES = ['DA_', 'TFT18_'] as const

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

/** Sanitize champion ability data from CommunityDragon */
function cleanAbility(ability?: {
  name?: string
  desc?: string
  icon?: string
  variables?: Array<{ name?: string; value?: number[] }>
}) {
  if (!ability) return undefined
  const cleaned: {
    name?: string
    desc?: string
    icon?: string
    variables?: Array<{ name: string; value: number[] }>
  } = {}
  if (ability.name) cleaned.name = ability.name
  if (ability.desc) cleaned.desc = ability.desc
  if (ability.icon) cleaned.icon = ability.icon
  if (Array.isArray(ability.variables) && ability.variables.length > 0) {
    const vars = ability.variables
      .filter((v) => v && v.name && Array.isArray(v.value))
      .map((v) => ({
        name: v.name!,
        value: v.value!.filter((n) => typeof n === 'number'),
      }))
    if (vars.length > 0) cleaned.variables = vars
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
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
  name?: string
  effects?: Record<string, number>
  tags?: string[]
  isAugment?: boolean
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
    const norm = (s?: string) => (s || '').toLowerCase().replace(/['’\s_-]/g, '')
    const effectMapByApiName = new Map<string, Record<string, number>>()
    const effectMapByName = new Map<string, Record<string, number>>()

    for (const i of cdragon.items ?? []) {
      if (!i.effects || Object.keys(i.effects).length === 0) continue
      if (i.isAugment) continue

      if (i.apiName) {
        effectMapByApiName.set(i.apiName, i.effects)
      }

      const n = norm(i.name)
      if (!n) continue

      const isPriority =
        i.apiName.startsWith('TFT_Item_') ||
        i.apiName.startsWith('TFT5_Item_') ||
        i.apiName.includes('Ornn') ||
        i.apiName.includes('Artifact')

      if (!effectMapByName.has(n) || isPriority) {
        effectMapByName.set(n, i.effects)
      }
    }

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
        const ability = cleanAbility(cd?.ability)

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
          ability,
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

    const cdItemMap = new Map((cdragon.items ?? []).map((i) => [i.apiName, i]))
    const seenItemKeys = new Set<string>()
    const items: Array<{
      key: string
      name: string
      nameId: string
      iconPath: string
      itemType: 'normal' | 'emblem' | 'radiant' | 'artifact'
      isEmblem: boolean
      effects?: Record<string, number>
    }> = []

    for (const raw of itemsJson as RawItem[]) {
      if (!raw.nameId || !raw.name) continue
      if (!ITEM_NAMEID_PREFIXES.some((p) => raw.nameId.startsWith(p))) continue

      const name = raw.name
      const nameId = raw.nameId
      const icon = raw.squareIconPath || ''

      // Skip non-equipable game items: recipes, placeholders, consumables, potions, boosters, wands/zaps, augments, components
      if (name.includes('Recipe') || nameId.includes('Recipe') || nameId.includes('_Placeholder')) continue
      if (nameId.includes('Consumable') || nameId.includes('Booster') || nameId.includes('Potion')) continue
      if (nameId.includes('Upgrade') || nameId.includes('Prismatic') || icon.includes('/ZAPS/Wands/')) continue
      if (icon.includes('/Augments/') || nameId.includes('Augment') || nameId.includes('TraitAugment')) continue
      if (nameId.includes('Component')) continue
      if (nameId.includes('Radiantize') || nameId.includes('Artifactinate') || nameId.includes('Chest')) continue

      const cd = cdItemMap.get(nameId)
      const tags = cd?.tags ?? []
      if (tags.includes('Consumable') || tags.includes('component')) continue

      let itemType: 'normal' | 'emblem' | 'radiant' | 'artifact' | null = null
      let isEmblem = false

      if (name.includes('Emblem') || nameId.includes('Emblem') || tags.includes('{ebcd1bac}')) {
        itemType = 'emblem'
        isEmblem = true
      } else if (name.toLowerCase().includes('radiant') || nameId.toLowerCase().includes('radiant') || tags.includes('{6ef5c598}')) {
        itemType = 'radiant'
      } else if (nameId.toLowerCase().includes('artifact') || tags.includes('{44ace175}')) {
        itemType = 'artifact'
      } else if (tags.includes('{7ea41d13}') || name.includes('Tactician')) {
        itemType = 'normal'
      }

      if (!itemType) continue

      const key = raw.guid || nameId
      if (seenItemKeys.has(key)) continue
      seenItemKeys.add(key)

      // Resolve item effects:
      // Direct on DA_ item first
      let rawEffects = (cd?.effects && Object.keys(cd?.effects).length > 0) ? cd.effects : undefined

      // Fallback: look up canonical item stats by normalized name (for non-emblems to avoid obsolete set trait stats)
      if (!rawEffects && !isEmblem) {
        rawEffects = effectMapByName.get(norm(name))
      }

      // Fallback: look up by artifact/radiant apiName conversions
      if (!rawEffects && !isEmblem) {
        if (nameId.startsWith('DA_Artifact_')) {
          const suffix = nameId.replace('DA_Artifact_', '')
          rawEffects =
            effectMapByApiName.get(`TFT_Item_Artifact_${suffix}`) ||
            effectMapByApiName.get(`TFT4_Item_Ornn${suffix}`) ||
            effectMapByApiName.get(`TFT9_Item_Ornn${suffix}`)
        } else if (nameId.startsWith('DA_') && nameId.endsWith('Radiant')) {
          const baseName = nameId.replace('DA_', '').replace('Radiant', '')
          rawEffects = effectMapByApiName.get(`TFT5_Item_${baseName}Radiant`)
        }
      }

      items.push({
        key,
        name,
        nameId,
        iconPath: icon,
        itemType,
        isEmblem,
        effects: filterNullRecord(rawEffects),
      })
    }

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

    const validItemKeys = new Set<string>()
    for (const i of items) {
      if (!i.key) continue
      validItemKeys.add(i.key)
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

    const existingItems = await db
      .query('items')
      .withIndex('by_setKey_and_key', (q) => q.eq('setKey', setKey))
      .collect()
    for (const ex of existingItems) {
      if (ex.key && !validItemKeys.has(ex.key)) {
        await db.delete(ex._id)
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
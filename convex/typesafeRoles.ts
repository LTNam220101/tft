import { v } from 'convex/values'
import { action, internalMutation, mutation } from './_generated/server'
import { internal } from './_generated/api'
import { ACTIVE_SET_KEY } from './gameConfig'
import {
  type ChampionRole,
  type DetailedChampionRole,
  type AbilityScalingInfo,
  type ChampionTraitProfile,
  profileChampionKit,
} from './optimizerRoles'

export interface ChampionTraitInfo {
  name: string
  id?: string
  description?: string
}

export interface ChampionRoleClassification {
  role: ChampionRole
  detailedRole: DetailedChampionRole
  roleNameVi: string
  roleIcon: string
  primaryDamage: 'physical' | 'magic' | 'hybrid' | 'true'
  isFrontline: boolean
  autoAttackScore: number
  spellCasterScore: number
  summary: string
  confidence: number
  source: 'profile'
  abilityAnalysis?: AbilityScalingInfo
}

/**
 * Classifies a champion's tactical role using deterministic kit profiling,
 * evaluating ability descriptions, stat scalings (AD, AP, Health, Armor),
 * traits and trait descriptions, and attack patterns.
 */
export async function classifyChampionRole(champ: {
  name: string
  range?: number
  desc?: string
  traitNames?: string[]
  traits?: ChampionTraitInfo[]
  rawRole?: string | null
  stats?: any
  ability?: {
    name?: string
    desc?: string
    icon?: string
    variables?: Array<{ name: string; value: number[] }>
  }
}): Promise<ChampionRoleClassification> {
  const rawTraits: ChampionTraitInfo[] =
    champ.traits || (champ.traitNames || []).map((name) => ({ name }))
  const resolvedTraitProfiles: ChampionTraitProfile[] = rawTraits.map((t) => ({
    name: t.name,
    id: t.id,
    description: t.description,
  }))

  const profileHint = profileChampionKit({
    ...champ,
    traits: resolvedTraitProfiles,
  })

  return {
    role: profileHint.broadRole,
    detailedRole: profileHint.detailedRole,
    roleNameVi: profileHint.nameVi,
    roleIcon: profileHint.icon,
    primaryDamage: profileHint.damageType,
    isFrontline: profileHint.isFrontline,
    autoAttackScore: profileHint.autoAttackScore,
    spellCasterScore: profileHint.spellCasterScore,
    summary: profileHint.summary,
    confidence: 1.0,
    source: 'profile',
    abilityAnalysis: profileHint.abilityAnalysis,
  }
}

/**
 * Public action to evaluate a champion role using kit profiling.
 */
export const classifyChampion = action({
  args: {
    champKey: v.string(),
  },
  handler: async (ctx, { champKey }) => {
    const champions: any[] = await ctx.runQuery(
      internal.queries.getChampions,
      {
        setKey: ACTIVE_SET_KEY,
      },
    )
    const traits: any[] = await ctx.runQuery(
      internal.queries.getTraitsInternal,
      {
        setKey: ACTIVE_SET_KEY,
      },
    )

    const traitMap = new Map<string, any>()
    for (const tr of traits) {
      if (tr.key) traitMap.set(tr.key.toLowerCase(), tr)
      if (tr.name) traitMap.set(tr.name.toLowerCase(), tr)
    }

    const champ = champions.find(
      (c) => (c.key ?? '').toLowerCase() === champKey.toLowerCase(),
    )
    if (!champ) {
      throw new Error(`Champion not found: ${champKey}`)
    }

    const enrichedTraits = (champ.traits || []).map((t: any) => {
      const found =
        traitMap.get((t.id || '').toLowerCase()) ||
        traitMap.get((t.name || '').toLowerCase())
      return {
        name: t.name,
        id: t.id,
        description: found?.description,
      }
    })

    return await classifyChampionRole({
      name: champ.name,
      range: champ.stats?.range,
      desc: champ.ability?.desc,
      ability: champ.ability,
      traits: enrichedTraits,
      stats: champ.stats,
    })
  },
})

export const updateRole = internalMutation({
  args: {
    id: v.id('champions'),
    detailedRole: v.string(),
  },
  handler: async ({ db }, { id, detailedRole }) => {
    const doc = await db.get(id)
    if (doc) {
      const { role: _r, rawRole: _rr, ...rest } = doc as any
      await db.replace(id, {
        ...rest,
        detailedRole,
      })
    }
  },
})

/**
 * Batch classifies all champions in active set and updates detailedRole in the database.
 */
export const batchClassifyAllRoles = action({
  args: {},
  handler: async (ctx) => {
    const champions: any[] = await ctx.runQuery(
      internal.queries.getChampions,
      {
        setKey: ACTIVE_SET_KEY,
      },
    )
    const traits: any[] = await ctx.runQuery(
      internal.queries.getTraitsInternal,
      {
        setKey: ACTIVE_SET_KEY,
      },
    )

    const traitMap = new Map<string, any>()
    for (const tr of traits) {
      if (tr.key) traitMap.set(tr.key.toLowerCase(), tr)
      if (tr.name) traitMap.set(tr.name.toLowerCase(), tr)
    }

    let updatedCount = 0
    for (const champ of champions) {
      const enrichedTraits = (champ.traits || []).map((t: any) => {
        const found =
          traitMap.get((t.id || '').toLowerCase()) ||
          traitMap.get((t.name || '').toLowerCase())
        return {
          name: t.name,
          id: t.id,
          description: found?.description,
        }
      })

      const res = await classifyChampionRole({
        name: champ.name,
        range: champ.stats?.range,
        desc: champ.ability?.desc,
        ability: champ.ability,
        traits: enrichedTraits,
        stats: champ.stats,
      })

      if (champ.detailedRole !== res.detailedRole || 'role' in champ || 'rawRole' in champ) {
        await ctx.runMutation(internal.typesafeRoles.updateRole, {
          id: champ._id,
          detailedRole: res.detailedRole,
        })
        updatedCount++
      }
    }

    return {
      total: champions.length,
      updatedCount,
    }
  },
})

/**
 * Mutation to consolidate role columns in DB:
 * Keeps detailedRole (populating via profiler if missing), and removes role & rawRole.
 */
export const consolidateRoleColumns = mutation({
  args: {
    setKey: v.optional(v.string()),
  },
  handler: async ({ db }, { setKey }) => {
    const key = setKey ?? ACTIVE_SET_KEY
    const champions = await db
      .query('champions')
      .withIndex('by_setKey_and_key', (q) => q.eq('setKey', key))
      .collect()

    let updated = 0
    for (const champ of champions) {
      const { role: _r, rawRole: _rr, ...cleanDoc } = champ as any
      const detailedRole =
        cleanDoc.detailedRole || profileChampionKit(champ).detailedRole

      await db.replace(champ._id, {
        ...cleanDoc,
        detailedRole,
      })
      updated++
    }

    return {
      total: champions.length,
      updated,
    }
  },
})

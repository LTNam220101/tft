import { v } from 'convex/values'
import { action, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { ACTIVE_SET_KEY } from './gameConfig'
import { callJevSystemOne, type ChoiceAnswer, type NoulAnswer } from './typesafe'
import {
  type ChampionRole,
  type DetailedChampionRole,
  type AbilityScalingInfo,
  type ChampionTraitProfile,
  cleanAbilityDescription,
  DETAILED_ROLES_METADATA,
  profileChampionKit,
} from './optimizerRoles'

export interface ChampionTraitInfo {
  name: string
  id?: string
  description?: string
}

export interface JevRoleClassification {
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
  source: 'jev' | 'heuristic'
  abilityAnalysis?: AbilityScalingInfo
}

/**
 * Classifies a champion's tactical role using TypeSafe AI Jev (System One),
 * deeply evaluating the champion's ability description, stat scalings (AD, AP, Health, Armor),
 * traits and trait descriptions (e.g. attack speed, mana generation, damage reduction),
 * and attack patterns (Auto-Attack Carries vs Spell Caster Carries).
 * Falls back to deterministic mathematical profiling if Jev is unavailable.
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
}): Promise<JevRoleClassification> {
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
  const abilityAnalysis = profileHint.abilityAnalysis

  const state = {
    champion: {
      name: champ.name,
      attackRange: champ.range ?? 1,
      stats: champ.stats,
      ability: champ.ability ? {
        name: champ.ability.name,
        description: abilityAnalysis?.cleanDescription || champ.ability.desc,
        scalingStats: abilityAnalysis?.scalingTags ?? [],
        primaryScaling: abilityAnalysis?.primaryScalingStat ?? 'Utility',
        hasShieldOrHeal: abilityAnalysis?.hasShieldOrHeal ?? false,
        hasCrowdControl: abilityAnalysis?.hasCrowdControl ?? false,
        hasShredOrBurn: (abilityAnalysis?.hasBurnOrWound || abilityAnalysis?.hasShredOrSunder) ?? false,
      } : champ.desc ? {
        description: abilityAnalysis?.cleanDescription || champ.desc,
        scalingStats: abilityAnalysis?.scalingTags ?? [],
      } : undefined,
      traits: resolvedTraitProfiles.map((t) => ({
        name: t.name,
        description: t.description ? cleanAbilityDescription(t.description) : undefined,
      })),
      riotRawRole: champ.rawRole ?? undefined,
      autoAttackScore: profileHint.autoAttackScore,
      spellCasterScore: profileHint.spellCasterScore,
      heuristicHint: profileHint.detailedRole,
    },
  }

  const questions = {
    detailedRole: {
      type: 'choice' as const,
      instructions:
        'What is this TFT champion\'s exact combat role and damage delivery pattern, considering their stats, traits (including trait descriptions), and ability scalings?',
      criteria: {
        ad_auto_carry:
          'Ranged physical carry whose DPS primarily comes from basic attacks, attack speed scaling, on-hit effects, or crit (e.g. Jinx, Ashe, Tristana).',
        ad_caster_carry:
          'Ranged physical carry whose damage comes mainly from casting high-impact physical spells; ability scales with AD/Crit and relies on mana/Shojin (e.g. Jhin, Ezreal).',
        ap_burst_caster:
          'Ranged magic carry that deals massive burst spell damage upon casting, scaling heavily with AP (e.g. Ahri, Lux, Syndra, Teemo).',
        ap_sustained_carry:
          'Ranged magic carry that deals continuous damage through high attack speed, on-hit magic attacks, or rapid casting (e.g. Azir, Kayle, TF).',
        ad_bruiser:
          'Melee physical fighter with high durability, omnivamp, and sustained frontline brawling (e.g. Sett, Vi, Warwick).',
        ap_bruiser:
          'Melee magic fighter with shields, survivability, and sustained AP brawling (e.g. Diana, Mordekaiser).',
        main_tank:
          'Primary frontline damage sponge focused on pure defensive stats (HP, Armor, MR, Shields) to survive as long as possible; ability scales with Health/Armor/MR.',
        off_tank:
          'Secondary frontline tank that applies disruption, aura items, anti-heal burn, or armor/MR shred.',
        ad_assassin:
          'Melee physical assassin who dives the backline for rapid single-target burst elimination.',
        ap_assassin:
          'Melee magic assassin who dives the backline for rapid magic burst elimination.',
        hybrid_carry:
          'Carries whose abilities or traits scale equally well with both physical AD and magical AP.',
        utility_support:
          'Support champion whose ability provides healing, shields, buffs, or team crowd control rather than personal carry damage.',
      },
    },
    isFrontline: {
      type: 'noul' as const,
      instructions:
        'Should this champion normally be positioned in the frontline (first 2 rows) on the TFT board?',
      criteria: {
        true: 'Yes, unit has short range (<=2 hexes) or high tankiness/defensive stats/shields.',
        false: 'No, unit is backline ranged carry or fragile caster.',
      },
    },
  }

  const jevResponse = await callJevSystemOne(state, questions)

  if (jevResponse && jevResponse.answers.detailedRole) {
    const roleAns = jevResponse.answers.detailedRole as ChoiceAnswer
    const frontlineAns = jevResponse.answers.isFrontline as NoulAnswer

    const detailedRole =
      (roleAns.choice as DetailedChampionRole) in DETAILED_ROLES_METADATA
        ? (roleAns.choice as DetailedChampionRole)
        : profileHint.detailedRole

    const meta = DETAILED_ROLES_METADATA[detailedRole]
    const isFrontline =
      frontlineAns?.probability !== undefined
        ? frontlineAns.probability >= 0.5
        : profileHint.isFrontline

    return {
      role: meta.broadRole,
      detailedRole,
      roleNameVi: meta.nameVi,
      roleIcon: meta.icon,
      primaryDamage: meta.damageType,
      isFrontline,
      autoAttackScore: profileHint.autoAttackScore,
      spellCasterScore: profileHint.spellCasterScore,
      summary: meta.description,
      confidence: roleAns.confidence ?? 0.9,
      source: 'jev',
      abilityAnalysis,
    }
  }

  // Graceful fallback to deterministic mathematical profiler
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
    confidence: 0.85,
    source: 'heuristic',
    abilityAnalysis,
  }
}

/**
 * Public action to evaluate a champion role using Jev or mathematical profiling.
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
      rawRole: champ.rawRole,
      stats: champ.stats,
    })
  },
})

export const updateRole = internalMutation({
  args: {
    id: v.id('champions'),
    role: v.union(
      v.literal('tank'),
      v.literal('bruiser'),
      v.literal('carry'),
      v.literal('support'),
    ),
    detailedRole: v.optional(v.string()),
  },
  handler: async ({ db }, { id, role, detailedRole }) => {
    await db.patch(id, { role, detailedRole })
  },
})

/**
 * Batch classifies all champions in active set and updates roles in the database.
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
        rawRole: champ.rawRole,
        stats: champ.stats,
      })

      if (champ.role !== res.role || champ.detailedRole !== res.detailedRole) {
        await ctx.runMutation(internal.typesafeRoles.updateRole, {
          id: champ._id,
          role: res.role,
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

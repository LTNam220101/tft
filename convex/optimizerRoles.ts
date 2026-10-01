export type ChampionRole = 'tank' | 'bruiser' | 'carry' | 'support'

export type CompositionBalanceStatus =
  | 'balanced'
  | 'low_frontline'
  | 'critically_low_frontline'
  | 'low_damage'
  | 'too_many_carries'

export interface CompositionBalance {
  scoreDelta: number
  tankCount: number
  bruiserCount: number
  frontlineCount: number
  frontlineScore: number
  carryCount: number
  supportCount: number
  status: CompositionBalanceStatus
}

const DEFENSIVE_KEYWORDS: ReadonlyArray<string> = [
  'brawler',
  'defender',
  'vanguard',
  'juggernaut',
  'monolith',
  'old growth',
  'emerald',
  'bastion',
  'warden',
  'sentinel',
  'colossus',
  'heavy',
  'knight',
  'bodyguard',
  'aegis',
  'cavalier',
  'bruiser',
]

const CARRY_KEYWORDS: ReadonlyArray<string> = [
  'hunter',
  'rapidfire',
  'executioner',
  'spellweaver',
  'slayer',
  'ravager',
  'apex predator',
  'bounty seeker',
  'avatar',
  'sniper',
  'mage',
  'arcanist',
  'sorcerer',
  'duelist',
  'blaster',
  'gunslinger',
  'assassin',
  'recon',
  'quickdraw',
  'deadeye',
  'vanquisher',
]

/** Specific role overrides for champions across sets */
const CHAMPION_ROLE_OVERRIDES: Record<string, ChampionRole> = {
  // Set 18 specific adjustments
  TFT18_Diana: 'bruiser', // Lunar / Ravager / Vanguard (Durable diver)
  TFT18_Fiddlesticks: 'tank', // Flora Fatalis / Defender / Spellweaver (Frontline CC / AoE)
  TFT18_Sentinel: 'tank', // Riftbeast / Vanguard / Invoker (Primary Vanguard)
  TFT18_Sett: 'tank', // Blossom / Brawler (High-cost frontline tank)
  TFT18_Vi: 'bruiser', // Primal / Juggernaut
  TFT18_Warwick: 'bruiser', // Blackthorn / Ravager
  TFT18_Murkwolf: 'bruiser', // Riftbeast / Ravager
  TFT18_Brambleback: 'bruiser', // Riftbeast / Ravager
  TFT18_Gromp: 'tank', // Riftbeast / Adaptor (Frontline tank)
  TFT18_RekSai: 'bruiser', // Blackthorn / Brawler
  TFT18_Zyra: 'support', // Thornmaiden / Summoner
  TFT18_Ivern: 'support', // Greenfather
  TFT18_Pebbles: 'support', // Riftbeast / Invoker
  TFT18_Teemo: 'carry', // Sprykin / Invoker (Damage caster)
  TFT18_Soraka: 'carry', // Flora Fatalis / Executioner
  TFT18_Morgana: 'carry', // Coven / Invoker
}

const SUPPORT_CHAMPION_NAMES = ['soraka', 'ivern']

/** Returns true if champion is Elder Dragon (takes 2 team slots). */
export function isElderDragon(champion: any): boolean {
  if (!champion) return false
  const key = champion.key as string | undefined
  const name = champion.name as string | undefined
  return (
    key === 'DA_18_ElderDragon' ||
    key === 'TFT18_ElderDragon' ||
    (typeof name === 'string' && name.toLowerCase().includes('elder dragon'))
  )
}

/** Returns true if trait is Riftbeast (Rồng Tự Nhiên / Quái Vật Hư Không). */
export function isRiftbeastTrait(trait: any): boolean {
  if (!trait) return false
  const id = ((trait.id || trait.key || '') as string).toLowerCase()
  const name = ((trait.name || '') as string).toLowerCase()
  return (
    id === 'da_riftbeast18' ||
    id.includes('riftbeast') ||
    name.includes('riftbeast')
  )
}

/** Slot cost of a champion on the board (Elder Dragon = 2 slots, other champions = 1 slot). */
export function getChampionSlotCost(champion: any): number {
  return isElderDragon(champion) ? 2 : 1
}

/** Total slots consumed by a team roster. */
export function getTeamTotalSlots(team: Array<any>): number {
  return team.reduce((sum, c) => sum + getChampionSlotCost(c), 0)
}

/** Calculates trait count contributed by a champion (+2 for Elder Dragon to Riftbeast, or trait.amount / 1). */
export function getChampionTraitAmount(champion: any, trait: any): number {
  if (isElderDragon(champion) && isRiftbeastTrait(trait)) {
    return 2
  }
  return trait?.amount ?? 1
}

/**
 * Automatically calculates a champion role at seed/crawl time using:
 * 1. Riot's explicit role if populated (APTank, ADFighter, ADCarry, etc.)
 * 2. Ability description scaling tags (%i:scaleHealth%, %i:scaleArmor%, %i:scaleMR%, %i:scaleAD%, %i:scaleAP%)
 * 3. Attack range and defensive trait archetypes
 */
export function determineChampionRole(
  name: string,
  rawRole: string | null | undefined,
  desc: string | undefined,
  range: number | undefined,
  traitNames: string[],
): ChampionRole {
  const lowerName = name.toLowerCase()
  if (SUPPORT_CHAMPION_NAMES.some((sn) => lowerName.includes(sn))) {
    return 'support'
  }

  // 1. If Riot explicitly defined a role, map it directly
  if (rawRole) {
    if (rawRole.endsWith('Tank')) return 'tank'
    if (rawRole.endsWith('Fighter')) return 'bruiser'
    if (
      rawRole.endsWith('Carry') ||
      rawRole.endsWith('Caster') ||
      rawRole.endsWith('Reaper')
    ) {
      return 'carry'
    }
    if (rawRole.endsWith('Specialist') || rawRole.endsWith('Support')) {
      return 'support'
    }
  }

  // 2. Dynamic scale inspection from Riot ability.desc
  const d = (desc || '').toLowerCase()
  const hasDefScale =
    d.includes('%i:scalehealth%') ||
    d.includes('%i:scalearmor%') ||
    d.includes('%i:scalemr%')
  const hasADScale = d.includes('%i:scalead%') || d.includes('%i:scaleas%')
  const effectiveRange = range ?? 1
  const lowerTraits = traitNames.map((t) => t.toLowerCase())
  const hasDefTrait = lowerTraits.some((t) =>
    DEFENSIVE_KEYWORDS.some((kw) => t.includes(kw)),
  )

  // Rule 1: Defensive scale + melee/short-range
  if (hasDefScale && effectiveRange <= 2) {
    if (hasADScale && !hasDefTrait) return 'bruiser'
    return 'tank'
  }

  // Rule 2: Melee/short-range units
  if (effectiveRange <= 2) {
    if (hasDefTrait) return 'tank'
    return 'bruiser'
  }

  // Rule 3: Ranged units default to carry
  return 'carry'
}

/** Determines a champion's tactical role based on DB-persisted role, overrides, traits, and stats. */
export function getChampionRole(champion: any): ChampionRole {
  if (!champion) return 'carry'

  // Fast-path: use DB-persisted role if present
  if (
    champion.role === 'tank' ||
    champion.role === 'bruiser' ||
    champion.role === 'carry' ||
    champion.role === 'support'
  ) {
    return champion.role
  }

  const championKey = champion.key as string | undefined
  if (championKey && Object.prototype.hasOwnProperty.call(CHAMPION_ROLE_OVERRIDES, championKey)) {
    return CHAMPION_ROLE_OVERRIDES[championKey]
  }

  const traits = (champion.traits ?? []) as Array<{
    name?: string
    id?: string
  }>
  const traitNames = traits.map((t) => (t.name ?? '').toLowerCase())

  const hasDefensive = traitNames.some((name) =>
    DEFENSIVE_KEYWORDS.some((kw) => name.includes(kw)),
  )
  const hasCarry = traitNames.some((name) =>
    CARRY_KEYWORDS.some((kw) => name.includes(kw)),
  )

  if (hasDefensive && !hasCarry) return 'tank'
  if (hasDefensive && hasCarry) return 'bruiser'
  if (hasCarry) return 'carry'

  // Stat-based heuristic if available
  const attackRange = champion.stats?.range
  if (typeof attackRange === 'number') {
    if (attackRange <= 1) return 'bruiser'
    if (attackRange >= 3) return 'carry'
  }

  return 'carry'
}

/** Returns true if the role qualifies as a frontline unit (tank or bruiser). */
export function isFrontlineRole(role: ChampionRole): boolean {
  return role === 'tank' || role === 'bruiser'
}

/** Counts active defensive trait thresholds (e.g. Vanguard, Brawler, Juggernaut). */
export function countActiveDefensiveTraits(
  rawTraitCounts: Record<string, number>,
  traitMap: Map<string, any>,
): number {
  let count = 0
  for (const [traitId, traitCount] of Object.entries(rawTraitCounts)) {
    const traitDef = traitMap.get(traitId)
    if (!traitDef || !traitDef.effects) continue
    const activeMilestones = traitDef.effects.filter(
      (eff: any) => traitCount >= eff.min_units,
    )
    if (activeMilestones.length > 0) {
      const traitName = (traitDef.name ?? '').toLowerCase()
      if (DEFENSIVE_KEYWORDS.some((kw) => traitName.includes(kw))) {
        count++
      }
    }
  }
  return count
}

/** Evaluates board composition balance (frontline vs carry ratio, tank item holders, defensive synergies). */
export function evaluateTeamCompositionBalance(
  team: Array<any>,
  currentSize: number,
  targetTeamSize: number,
  activeDefensiveTraitsCount: number,
): CompositionBalance {
  let tankCount = 0
  let bruiserCount = 0
  let carryCount = 0
  let supportCount = 0
  let highCostTankCount = 0
  let highCostCarryCount = 0

  for (const c of team) {
    const role = getChampionRole(c)
    const cost = (c.cost ?? 1) as number
    const slots = getChampionSlotCost(c)

    if (role === 'tank') {
      tankCount += slots
      if (cost >= 4) highCostTankCount += slots
    } else if (role === 'bruiser') {
      bruiserCount += slots
      if (cost >= 4) highCostTankCount += slots
    } else if (role === 'carry') {
      carryCount += slots
      if (cost >= 4) highCostCarryCount += slots
    } else {
      supportCount += slots
    }
  }

  const frontlineScore = tankCount * 1.0 + bruiserCount * 0.8
  let scoreDelta = 0

  if (currentSize >= 5) {
    const minFrontline = targetTeamSize >= 8 ? 2.8 : 2.2
    const idealFrontlineMin = targetTeamSize >= 8 ? 3.0 : 2.5
    const idealFrontlineMax = targetTeamSize >= 8 ? 5.2 : 4.5

    if (currentSize === targetTeamSize) {
      // 1. Frontline balance evaluation
      if (frontlineScore < 1.0) {
        scoreDelta -= 150 // Critical flaw: virtually zero frontline
      } else if (frontlineScore < 2.0) {
        scoreDelta -= 85 // Severe flaw: 1 tank and 7 backline units
      } else if (frontlineScore < minFrontline) {
        scoreDelta -= 35 // Deficient frontline for an 8+ unit board
      } else if (
        frontlineScore >= idealFrontlineMin &&
        frontlineScore <= idealFrontlineMax
      ) {
        scoreDelta += 30 // Balanced, sturdy frontline
      } else if (frontlineScore > idealFrontlineMax) {
        scoreDelta -= 35 // Over-stacked on tanks, lacks damage
      }

      // 2. Active defensive trait synergy
      if (activeDefensiveTraitsCount >= 1) {
        scoreDelta += 15 * Math.min(activeDefensiveTraitsCount, 2)
      } else {
        scoreDelta -= 25 // Zero defensive trait synergy
      }

      // 3. Carry count evaluation
      if (carryCount === 0) {
        scoreDelta -= 90 // No damage dealers
      } else if (carryCount >= targetTeamSize - 1) {
        scoreDelta -= 70 // 7 carries: glass cannon that shatters instantly
      } else if (carryCount >= targetTeamSize - 2) {
        scoreDelta -= 35 // 6 carries: too squishy
      } else if (carryCount >= 2 && carryCount <= 4) {
        scoreDelta += 20 // Ideal carry core
      }

      // 4. Item holder quality (presence of 4-cost or 5-cost anchors)
      if (highCostTankCount > 0) scoreDelta += 10
      if (highCostCarryCount > 0) scoreDelta += 10
    } else {
      // Intermediate beam step guidance: prevent beam from filling with 100% squishy carries early
      const frontlineRatio = frontlineScore / currentSize
      if (frontlineRatio < 0.18) {
        scoreDelta -= 35
      } else if (frontlineRatio >= 0.35 && frontlineRatio <= 0.6) {
        scoreDelta += 12
      }
    }
  }

  let status: CompositionBalanceStatus = 'balanced'
  if (frontlineScore < 2.0) {
    status = 'critically_low_frontline'
  } else if (
    frontlineScore < (targetTeamSize >= 8 ? 2.8 : 2.2)
  ) {
    status = 'low_frontline'
  } else if (carryCount === 0) {
    status = 'low_damage'
  } else if (carryCount >= targetTeamSize - 1) {
    status = 'too_many_carries'
  }

  return {
    scoreDelta,
    tankCount,
    bruiserCount,
    frontlineCount: tankCount + bruiserCount,
    frontlineScore,
    carryCount,
    supportCount,
    status,
  }
}

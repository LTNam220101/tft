/**
 * TFT Champion Stats & Scaling Utilities
 *
 * Formulas:
 * - HP scales by 1.8x per star level:
 *   1★ = base HP
 *   2★ = round(base HP * 1.8)
 *   3★ = round(base HP * 3.24)
 *   4★ = round(base HP * 5.832)
 *
 * - Attack Damage (AD) scales by 1.5x per star level:
 *   1★ = base AD
 *   2★ = round(base AD * 1.5)
 *   3★ = round(base AD * 2.25)
 *   4★ = round(base AD * 3.375)
 *
 * - Armor, Magic Resist, Attack Speed, Range, Mana remain constant across star levels.
 */

export interface ChampionStats {
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
  hpPerStar?: number[]
  damagePerStar?: number[]
}

/**
 * Computes HP and AD arrays for [1★, 2★, 3★, 4★]
 */
export function computeStarScalings(stats?: ChampionStats): {
  hpPerStar?: number[]
  damagePerStar?: number[]
} {
  if (!stats) return {}

  const result: { hpPerStar?: number[]; damagePerStar?: number[] } = {}

  if (typeof stats.hp === 'number' && stats.hp > 0) {
    const hp1 = Math.round(stats.hp)
    const hp2 = Math.round(stats.hp * 1.8)
    const hp3 = Math.round(stats.hp * 3.24)
    const hp4 = Math.round(stats.hp * 5.832)
    result.hpPerStar = [hp1, hp2, hp3, hp4]
  }

  if (typeof stats.damage === 'number' && stats.damage > 0) {
    const ad1 = Math.round(stats.damage)
    const ad2 = Math.round(stats.damage * 1.5)
    const ad3 = Math.round(stats.damage * 2.25)
    const ad4 = Math.round(stats.damage * 3.375)
    result.damagePerStar = [ad1, ad2, ad3, ad4]
  }

  return result
}

/**
 * Returns the effective stats of a champion at a specific star level (1, 2, 3, 4)
 */
export function getStatsAtStar(stats: ChampionStats | undefined, starLevel: 1 | 2 | 3 | 4) {
  if (!stats) return null

  const starIdx = Math.max(0, Math.min(3, starLevel - 1))

  const hp = stats.hpPerStar?.[starIdx] ??
    (stats.hp ? Math.round(stats.hp * Math.pow(1.8, starIdx)) : 0)

  const damage = stats.damagePerStar?.[starIdx] ??
    (stats.damage ? Math.round(stats.damage * Math.pow(1.5, starIdx)) : 0)

  return {
    hp,
    damage,
    armor: stats.armor ?? 0,
    magicResist: stats.magicResist ?? 0,
    attackSpeed: stats.attackSpeed ?? 0,
    mana: stats.mana ?? 0,
    initialMana: stats.initialMana ?? 0,
    range: stats.range ?? 0,
    critChance: stats.critChance ?? 0.25,
    critMultiplier: stats.critMultiplier ?? 1.4,
  }
}

/**
 * Formats champion ability descriptions:
 * - Substitutes @Variable@ with star-scaling values (e.g. 200 / 350 / 600)
 * - Replaces %i:scale* with readable tokens (AP, AD, HP, etc.)
 * - Strips XML/HTML tags and cleans line endings
 */
export function formatAbilityDescription(
  desc?: string,
  variables?: Array<{ name: string; value: number[] }>
): string {
  if (!desc) return ''
  let s = desc

  const varMap = new Map<string, number[]>()
  if (Array.isArray(variables)) {
    for (const v of variables) {
      if (v?.name && Array.isArray(v.value)) {
        varMap.set(v.name.toLowerCase(), v.value)
      }
    }
  }

  // Replace @VarName@ or @VarName*100@%
  s = s.replace(/@([a-zA-Z0-9_]+)(?:\*([0-9.]+))?@/g, (match, varName, mult) => {
    const valArr = varMap.get(varName.toLowerCase())
    if (valArr && valArr.length > 1) {
      const multiplier = mult ? parseFloat(mult) : 1
      const stars = [1, 2, 3].map((starIdx) => {
        const val = starIdx < valArr.length ? valArr[starIdx] : valArr[valArr.length - 1]
        return Math.round(val * multiplier * 10) / 10
      })
      if (stars[0] === stars[1] && stars[1] === stars[2]) {
        return String(stars[0])
      }
      return stars.join(' / ')
    }
    return match
  })

  // Replace scaling icons
  s = s
    .replace(/%i:scaleAP%/g, 'AP')
    .replace(/%i:scaleAD%/g, 'AD')
    .replace(/%i:scaleHealth%/g, 'HP')
    .replace(/%i:scaleArmor%/g, 'Armor')
    .replace(/%i:scaleMR%/g, 'Magic Resist')
    .replace(/%i:scaleAS%/g, 'Attack Speed')
    .replace(/%i:scaleCrit%/g, 'Crit Chance')
    .replace(/%i:scaleCritMult%/g, 'Crit Damage')
    .replace(/%i:scaleMana%/g, 'Mana')
    .replace(/%i:scaleDR%/g, 'Damage Reduction')
    .replace(/%i:scaleDA%/g, 'Damage Amp')

  // Convert layout tags to linebreaks
  s = s.replace(/<\/?(?:row|expandRow)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  // Strip all other HTML/XML tags
  s = s.replace(/<[^>]+>/g, '')

  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Cleans item and augment descriptions, replacing effect tokens with values.
 */
export function formatItemDescription(
  desc?: string,
  effects: Record<string, number> = {}
): string {
  if (!desc) return ''
  let s = desc

  // Substitute tokens with math e.g. @Var*100@ or @Var@
  s = s.replace(/@([a-zA-Z0-9_]+)(?:\*([0-9.]+))?@/g, (match, varName, multiplier) => {
    let val = effects[varName]
    if (val === undefined) {
      const lower = varName.toLowerCase()
      for (const [k, v] of Object.entries(effects)) {
        if (k.toLowerCase() === lower) {
          val = v
          break
        }
      }
    }
    if (val !== undefined && typeof val === 'number') {
      if (multiplier) {
        val = Math.round(val * parseFloat(multiplier) * 10) / 10
      } else {
        val = Math.round(val * 100) / 100
      }
      return String(val)
    }
    return match
  })

  // Replace scaling icons
  s = s
    .replace(/%i:scaleAP%/g, 'AP')
    .replace(/%i:scaleAD%/g, 'AD')
    .replace(/%i:scaleHealth%/g, 'HP')
    .replace(/%i:scaleArmor%/g, 'Armor')
    .replace(/%i:scaleMR%/g, 'Magic Resist')
    .replace(/%i:scaleAS%/g, 'Attack Speed')
    .replace(/%i:scaleCrit%/g, 'Crit Chance')
    .replace(/%i:scaleCritMult%/g, 'Crit Damage')
    .replace(/%i:scaleMana%/g, 'Mana')
    .replace(/%i:scaleDR%/g, 'Damage Reduction')
    .replace(/%i:scaleDA%/g, 'Damage Amp')

  s = s.replace(/<\/?(?:row|expandRow)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')

  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

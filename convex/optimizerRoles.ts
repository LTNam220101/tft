export type ChampionRole = 'tank' | 'bruiser' | 'carry' | 'support'

export type DetailedChampionRole =
  | 'ad_auto_carry'        // Xạ thủ Đánh thường (AS/Crit/On-hit - Guinsoo, LW, IE, Runaan)
  | 'ad_caster_carry'      // Xạ thủ Dồn chiêu (AD/Mana/Burst AD - Shojin, Deathblade, IE, GS)
  | 'ap_burst_caster'      // Pháp sư Sốc dame (AP/Mana/Crit - Blue Buff, JG, Rabadon)
  | 'ap_sustained_carry'   // Pháp sư Tốc đánh / Duy trì (AS/AP - Guinsoo, Nashor, Archangel, Shiv)
  | 'ad_bruiser'           // Đấu sĩ Vật lý (AD/Sustain - BT, Titan, Sterak, HoJ)
  | 'ap_bruiser'           // Đấu sĩ Phép thuật (AP/Sustain - Crownguard, Titan, HoJ, Spark)
  | 'main_tank'            // Tanker Chính (HP/Resists - Warmog, DClaw, Bramble, Stoneplate)
  | 'off_tank'             // Tanker Đa dụng (Aura/Shred/Burn - Sunfire, Evenshroud, Spark, Redemption)
  | 'ad_assassin'          // Sát thủ Vật lý (Melee AD Burst - IE, Edge of Night, HoJ, BT)
  | 'ap_assassin'          // Sát thủ Phép thuật (Melee AP Burst - JG, HoJ, Spark, Edge of Night)
  | 'hybrid_carry'         // Chủ lực Lai (Mixed AD/AP - HoJ, Giant Slayer, Guardbreaker)
  | 'utility_support'      // Hỗ trợ Đa dụng (Heal/Shield/CC - Redemption, Locket, Chalice, Shiv)

export interface RoleMetadata {
  nameVi: string
  icon: string
  broadRole: ChampionRole
  damageType: 'physical' | 'magic' | 'hybrid' | 'true'
  description: string
  primaryStatFocus: string
}

export const DETAILED_ROLES_METADATA: Record<DetailedChampionRole, RoleMetadata> = {
  ad_auto_carry: {
    nameVi: 'Xạ thủ Đánh thường',
    icon: '🏹',
    broadRole: 'carry',
    damageType: 'physical',
    description: 'Sát thương dồi dào từ đòn đánh tay, tăng tiến sức mạnh vượt trội với Tốc đánh, Xuyên giáp và Chí mạng.',
    primaryStatFocus: 'Tốc đánh (AS) + Sát thương vật lý (AD) + Chí mạng (Crit)',
  },
  ad_caster_carry: {
    nameVi: 'Xạ thủ Dồn chiêu',
    icon: '🎯',
    broadRole: 'carry',
    damageType: 'physical',
    description: 'Sát thương vật lý khủng khi tung chiêu, cần hồi năng lượng nhanh và lượng AD thuần cực lớn.',
    primaryStatFocus: 'Ngọn Giáo Shojin / Bùa Xanh + Kiếm Tử Thần + Vô Cực Kiếm',
  },
  ap_burst_caster: {
    nameVi: 'Pháp sư Sốc dame',
    icon: '🔮',
    broadRole: 'carry',
    damageType: 'magic',
    description: 'Xả chiêu diện rộng hoặc đơn mục tiêu gây sốc sát thương phép cực mạnh trong chớp mắt.',
    primaryStatFocus: 'SMPT (AP) + Hồi Năng Lượng + Găng Bảo Thạch',
  },
  ap_sustained_carry: {
    nameVi: 'Pháp sư Tốc đánh',
    icon: '⚡',
    broadRole: 'carry',
    damageType: 'magic',
    description: 'Pháp sư dps duy trì theo thời gian, cường hóa đòn đánh phép thuật hoặc xả chiêu liên hồi.',
    primaryStatFocus: 'Cuồng Đao Guinsoo + Nanh Nashor + Quyền Trượng Thiên Thần',
  },
  ad_bruiser: {
    nameVi: 'Đấu sĩ Vật lý',
    icon: '⚔️',
    broadRole: 'bruiser',
    damageType: 'physical',
    description: 'Chiến binh cận chiến công thủ toàn diện, sở hữu lượng sát thương vật lý và hút máu bền bỉ.',
    primaryStatFocus: 'Huyết Kiếm + Móng Vuốt Sterak + Quyền Năng Khổng Lồ',
  },
  ap_bruiser: {
    nameVi: 'Đấu sĩ Phép thuật',
    icon: '🛡️⚔️',
    broadRole: 'bruiser',
    damageType: 'magic',
    description: 'Đấu sĩ cận chiến gây sát thương phép, cần khả năng hồi phục, khiên chắn và chỉ số chống chịu.',
    primaryStatFocus: 'Bàn Tay Công Lý + Quyền Năng + Vương Miện Hoàng Gia',
  },
  main_tank: {
    nameVi: 'Tanker Chính',
    icon: '🛡️',
    broadRole: 'tank',
    damageType: 'hybrid',
    description: 'Bức tường vững chắc tuyến đầu, tối ưu hóa Máu tối đa, Giáp, Kháng phép để che chắn cho đồng đội.',
    primaryStatFocus: 'Giáp Máu + Vuốt Rồng + Áo Choàng Gai + Thú Tượng',
  },
  off_tank: {
    nameVi: 'Tanker Hiệu ứng',
    icon: '🔥',
    broadRole: 'tank',
    damageType: 'hybrid',
    description: 'Tuyến trên mang các hiệu ứng bất lợi cho địch (giảm hồi máu, trừ giáp/kháng phép, hiệu ứng hào quang).',
    primaryStatFocus: 'Giáp Lửa + Lời Thề Hộ Vệ / Giáp Vai + Nỏ Sét + Chuộc Tội',
  },
  ad_assassin: {
    nameVi: 'Sát thủ Vật lý',
    icon: '🗡️',
    broadRole: 'carry',
    damageType: 'physical',
    description: 'Tiếp cận và ám sát chủ lực tuyến sau địch bằng lượng sát thương vật lý bộc phát cực nhanh.',
    primaryStatFocus: 'Vô Cực Kiếm + Áo Choàng Bóng Tối + Bàn Tay Công Lý',
  },
  ap_assassin: {
    nameVi: 'Sát thủ Phép thuật',
    icon: '✨🗡️',
    broadRole: 'carry',
    damageType: 'magic',
    description: 'Đột kích tuyến sau địch và kết liễu mục tiêu nhanh gọn bằng sát thương phép dồn.',
    primaryStatFocus: 'Găng Bảo Thạch + Nỏ Sét + Áo Choàng Bóng Tối',
  },
  hybrid_carry: {
    nameVi: 'Chủ lực Đa năng',
    icon: '💠',
    broadRole: 'carry',
    damageType: 'hybrid',
    description: 'Sức mạnh tăng tiến linh hoạt từ cả sát thương vật lý và sát thương phép thuật.',
    primaryStatFocus: 'Diệt Khổng Lồ + Bàn Tay Công Lý + Chùy Xuyên Phá',
  },
  utility_support: {
    nameVi: 'Hỗ trợ Đa dụng',
    icon: '🌿',
    broadRole: 'support',
    damageType: 'magic',
    description: 'Hỗ trợ hồi máu, tạo lá chắn, buff chỉ số cho đồng đội hoặc khống chế diện rộng.',
    primaryStatFocus: 'Dây Chuyền Chuộc Tội + Dao Điện + Quỷ Thư Morello',
  },
}

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

export interface AbilityScalingInfo {
  name?: string
  desc?: string
  scalesWithAD: boolean
  scalesWithAP: boolean
  scalesWithAS: boolean
  scalesWithHealth: boolean
  scalesWithArmor: boolean
  scalesWithMR: boolean
  scalesWithCrit: boolean
  hasShieldOrHeal: boolean
  hasCrowdControl: boolean
  hasBurnOrWound: boolean
  hasShredOrSunder: boolean
  scalingTags: string[]
  primaryScalingStat: 'AD' | 'AP' | 'Health' | 'Armor_MR' | 'AttackSpeed' | 'Hybrid' | 'Utility'
  cleanDescription: string
}

/** Formats Riot %i:*% tags and HTML tokens into clean, human-readable text */
export function cleanAbilityDescription(rawDesc?: string): string {
  if (!rawDesc) return ''
  return rawDesc
    .replace(/<rules>[\s\S]*?<\/rules>/gi, '') // remove rules definitions first
    .replace(/%i:scaleAD%/gi, '[AD]')
    .replace(/%i:scaleAP%/gi, '[AP]')
    .replace(/%i:scaleAS%/gi, '[Tốc đánh]')
    .replace(/%i:scaleHealth%/gi, '[Máu]')
    .replace(/%i:scaleMaxHP%/gi, '[Máu tối đa]')
    .replace(/%i:scaleArmor%/gi, '[Giáp]')
    .replace(/%i:scaleMR%/gi, '[Kháng phép]')
    .replace(/<[^>]+>/g, '') // remove remaining xml/html tags
    .replace(/@([a-zA-Z0-9_]+)(?:\*100)?@/g, '$1') // clean @Damage@ tokens
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Analyzes a champion ability's raw description and variables to extract
 * exact stat scalings (AD, AP, Health, Armor, Attack Speed, etc.) and mechanics.
 */
export function analyzeAbilityScalings(ability?: {
  name?: string
  desc?: string
  variables?: Array<{ name: string; value: number[] }>
}): AbilityScalingInfo {
  const name = ability?.name || ''
  const rawDesc = ability?.desc || ''
  // Strip <rules>...</rules> first so helper definitions (like "<Rules>Slow: Reduce Attack Speed</Rules>")
  // don't pollute the champion's actual kit!
  const strippedDesc = rawDesc.replace(/<rules>[\s\S]*?<\/rules>/gi, '')
  const d = strippedDesc.toLowerCase()

  const scalesWithAD =
    d.includes('%i:scalead%') ||
    d.includes('scalead') ||
    d.includes('attack damage')
  const scalesWithAP =
    d.includes('%i:scaleap%') ||
    d.includes('scaleap') ||
    d.includes('ability power')
  const scalesWithAS =
    d.includes('%i:scaleas%') ||
    d.includes('scaleas') ||
    d.includes('scales with attack speed')
  const scalesWithHealth =
    d.includes('%i:scalehealth%') ||
    d.includes('%i:scalemaxhp%') ||
    d.includes('scalehealth') ||
    d.includes('scales with health') ||
    d.includes('scales with maximum health') ||
    d.includes('percent of maximum health') ||
    d.includes('percent of max health')
  const scalesWithArmor =
    d.includes('%i:scalearmor%') ||
    d.includes('scalearmor') ||
    d.includes('scales with armor') ||
    d.includes('percent of armor') ||
    d.includes('gain armor') ||
    d.includes('bonus armor')
  const scalesWithMR =
    d.includes('%i:scalemr%') ||
    d.includes('scalemr') ||
    d.includes('scales with magic resist') ||
    d.includes('percent of magic resist') ||
    d.includes('gain magic resist') ||
    d.includes('bonus magic resist')
  const scalesWithCrit =
    d.includes('%i:scalecrit%') ||
    d.includes('critical strike') ||
    d.includes('can critically strike')

  const hasShieldOrHeal =
    d.includes('shield') ||
    d.includes('heal') ||
    d.includes('omnivamp') ||
    d.includes('absorb')
  const hasCrowdControl =
    d.includes('stun') ||
    d.includes('knock up') ||
    d.includes('knockup') ||
    d.includes('disarm') ||
    d.includes('silence') ||
    d.includes('fear') ||
    d.includes('freeze') ||
    d.includes('mana reave')
  const hasBurnOrWound =
    d.includes('burn') ||
    d.includes('wound') ||
    d.includes('ignite') ||
    d.includes('grievous')
  const hasShredOrSunder =
    d.includes('sunder') ||
    d.includes('shred') ||
    d.includes('reduce armor') ||
    d.includes('reduce magic resist') ||
    d.includes('reduce their armor') ||
    d.includes('reduce their magic resist')

  const scalingTags: string[] = []
  if (scalesWithAD) scalingTags.push('AD (Vật lý)')
  if (scalesWithAP) scalingTags.push('AP (SMPT)')
  if (scalesWithAS) scalingTags.push('Tốc đánh (AS)')
  if (scalesWithHealth) scalingTags.push('Máu (Health)')
  if (scalesWithArmor || scalesWithMR) scalingTags.push('Giáp / Kháng phép')
  if (scalesWithCrit) scalingTags.push('Chí mạng')

  const dealsPhysical = d.includes('physical damage')
  const dealsMagic = d.includes('magic damage')

  let primaryScalingStat: 'AD' | 'AP' | 'Health' | 'Armor_MR' | 'AttackSpeed' | 'Hybrid' | 'Utility' = 'Utility'
  if (dealsPhysical && !dealsMagic) {
    primaryScalingStat = 'AD'
  } else if (dealsMagic && !dealsPhysical) {
    primaryScalingStat = 'AP'
  } else if (scalesWithAD && scalesWithAP) {
    primaryScalingStat = 'Hybrid'
  } else if (scalesWithAD) {
    primaryScalingStat = 'AD'
  } else if (scalesWithAP) {
    primaryScalingStat = 'AP'
  } else if (scalesWithHealth) {
    primaryScalingStat = 'Health'
  } else if (scalesWithArmor || scalesWithMR) {
    primaryScalingStat = 'Armor_MR'
  } else if (scalesWithAS) {
    primaryScalingStat = 'AttackSpeed'
  }

  return {
    name,
    desc: rawDesc,
    scalesWithAD,
    scalesWithAP,
    scalesWithAS,
    scalesWithHealth,
    scalesWithArmor,
    scalesWithMR,
    scalesWithCrit,
    hasShieldOrHeal,
    hasCrowdControl,
    hasBurnOrWound,
    hasShredOrSunder,
    scalingTags,
    primaryScalingStat,
    cleanDescription: cleanAbilityDescription(rawDesc),
  }
}

export interface ChampionTraitProfile {
  name: string
  id?: string
  description?: string
}

export interface ChampionProfile {
  detailedRole: DetailedChampionRole
  broadRole: ChampionRole
  damageType: 'physical' | 'magic' | 'hybrid' | 'true'
  isFrontline: boolean
  autoAttackScore: number // 0 to 1
  spellCasterScore: number // 0 to 1
  nameVi: string
  icon: string
  summary: string
  abilityAnalysis?: AbilityScalingInfo
}

/**
 * Profiles a champion kit into a detailed tactical role based on:
 * 1. Ability stat scalings (AD, AP, Health, Armor, AS)
 * 2. Traits and Trait Descriptions (Attack Speed buffs, Mana regen, Tank durability)
 * 3. Damage Type: Physical vs Magic vs Hybrid
 * 4. Attack Range: Melee vs Ranged
 * 5. Auto-Attack Score vs Spell Caster Score
 * 6. Defensive and Utility signatures
 */
export function profileChampionKit(champ: {
  name?: string
  rawRole?: string | null
  desc?: string
  range?: number
  stats?: any
  traits?: Array<string | ChampionTraitProfile | { name?: string; id?: string; description?: string }>
  ability?: {
    name?: string
    desc?: string
    icon?: string
    variables?: Array<{ name: string; value: number[] }>
  }
}): ChampionProfile {
  const rawRole = champ.rawRole || ''
  const effectiveAbility = champ.ability || (champ.desc ? { desc: champ.desc } : undefined)
  const abilityAnalysis = analyzeAbilityScalings(effectiveAbility)
  const desc = (effectiveAbility?.desc || '').toLowerCase()

  const stats = champ.stats || {}
  const range = champ.range ?? stats.range ?? 1
  const mana = stats.mana ?? 100
  const attackSpeed = stats.attackSpeed ?? 0.65
  const attackDamage = stats.damage ?? (champ as any).damage ?? 40

  const rawTraits = Array.isArray(champ.traits) ? champ.traits : []
  const traitNames = rawTraits.map((t: any) =>
    (typeof t === 'string' ? t : t?.name || t?.id || '').toLowerCase(),
  )
  const traitDescriptions = rawTraits
    .map((t: any) => (typeof t === 'object' ? cleanAbilityDescription(t?.description || '') : ''))
    .join(' ')
    .toLowerCase()

  // 2. Compute damage type leveraging ability scalings, text, and trait descriptions
  const dealsPhysical = desc.includes('physical damage')
  const dealsMagic = desc.includes('magic damage')

  let damageType: 'physical' | 'magic' | 'hybrid' | 'true' = 'magic'
  if (rawRole.startsWith('AD')) {
    damageType = 'physical'
  } else if (rawRole.startsWith('AP')) {
    damageType = 'magic'
  } else if (dealsPhysical && !dealsMagic) {
    damageType = 'physical'
  } else if (dealsMagic && !dealsPhysical) {
    damageType = 'magic'
  } else if (dealsPhysical && dealsMagic) {
    damageType = 'hybrid'
  } else if (abilityAnalysis.scalesWithAD && !abilityAnalysis.scalesWithAP) {
    damageType = 'physical'
  } else if (abilityAnalysis.scalesWithAP && !abilityAnalysis.scalesWithAD) {
    damageType = 'magic'
  } else if (
    attackDamage >= 50 ||
    traitNames.some((t) =>
      ['sniper', 'hunter', 'blaster', 'gunslinger', 'quickdraw', 'deadeye', 'ravager', 'slayer'].some(
        (k) => t.includes(k),
      ),
    ) ||
    traitDescriptions.includes('attack damage')
  ) {
    damageType = 'physical'
  }

  // 3. Mathematical profiling: Auto Attack Score vs Spell Caster Score
  let autoAttackScore = 0.2
  let spellCasterScore = 0.3

  // Attack speed factors:
  // For physical champions, high base AS directly boosts DPS.
  // For magic casters, high base AS is commonly given by Riot for mana generation between casts.
  if (damageType === 'physical') {
    if (attackSpeed >= 0.75) autoAttackScore += 0.3
    else if (attackSpeed >= 0.7) autoAttackScore += 0.15
  } else {
    if (attackSpeed >= 0.85) autoAttackScore += 0.15
    else if (attackSpeed >= 0.8) autoAttackScore += 0.1
    else if (attackSpeed >= 0.75) autoAttackScore += 0.05
  }

  // Trait influences (names & descriptions)
  const isAutoAttackTrait =
    traitNames.some((t) =>
      ['sniper', 'rapidfire', 'duelist', 'hunter', 'blaster', 'quickdraw', 'deadeye', 'ravager'].some(
        (k) => t.includes(k),
      ),
    ) ||
    traitDescriptions.includes('attack speed') ||
    traitDescriptions.includes('basic attack') ||
    traitDescriptions.includes('on-hit')

  if (isAutoAttackTrait) autoAttackScore += 0.35

  const isCasterTrait =
    traitNames.some((t) =>
      ['invoker', 'mage', 'spellweaver', 'arcanist', 'sorcerer', 'scholar'].some(
        (k) => t.includes(k),
      ),
    ) ||
    traitDescriptions.includes('ability power') ||
    traitDescriptions.includes('mana every') ||
    traitDescriptions.includes('gain mana')

  if (isCasterTrait) spellCasterScore += 0.4

  // Ability description & scaling influences
  const hasOnHitDamage =
    desc.includes('on-hit') ||
    desc.includes('attacks deal bonus') ||
    desc.includes('attacks deal physical') ||
    desc.includes('attacks deal magic') ||
    desc.includes('attacks fire waves') ||
    desc.includes('attacks shoot')

  if (abilityAnalysis.scalesWithAS || desc.includes('attack speed') || hasOnHitDamage) {
    autoAttackScore += 0.35
  }

  if (
    abilityAnalysis.scalesWithAP ||
    desc.includes('magic damage') ||
    desc.includes('launches') ||
    desc.includes('blasts') ||
    desc.includes('massive damage')
  ) {
    spellCasterScore += 0.3
  }

  // Mana pool factor
  if (mana <= 40 || mana === 0) {
    if (damageType === 'physical') {
      autoAttackScore += 0.2
    } else {
      spellCasterScore += 0.3
    }
  } else if (mana >= 70) {
    spellCasterScore += 0.25
  }

  // Defensive traits & keywords (from trait names, trait descriptions & ability)
  const hasDefTrait =
    traitNames.some((t) =>
      DEFENSIVE_KEYWORDS.some((kw) => t.includes(kw)),
    ) ||
    traitDescriptions.includes('armor and magic resist') ||
    traitDescriptions.includes('damage reduction')

  const hasDefScale =
    abilityAnalysis.scalesWithArmor ||
    abilityAnalysis.scalesWithMR

  const isFrontline = range <= 2

  let detailedRole: DetailedChampionRole = 'ad_auto_carry'

  if (isFrontline) {
    // 1. Melee Assassin check: backline leap / dive mechanics or assassin traits
    const isAssassin =
      desc.includes('leap to the farthest') ||
      desc.includes('jump to the lowest') ||
      desc.includes('teleport behind') ||
      desc.includes('dashes to the farthest') ||
      traitNames.some((t) => ['assassin', 'reaper', 'infiltrator', 'rogue'].some((k) => t.includes(k)))

    if (isAssassin) {
      detailedRole = damageType === 'magic' ? 'ap_assassin' : 'ad_assassin'
    } else {
      // 2. Bruiser vs Tank check:
      // Bruisers: High AD, offensive traits (Ravager/Slayer/Executioner/Adaptor/Primal),
      // self-buffing damage/frenzy/omnivamp skills.
      const hasOffensiveTrait = traitNames.some((t) =>
        ['ravager', 'slayer', 'executioner', 'adaptor', 'apex predator', 'primal'].some((k) => t.includes(k)),
      )
      const isHighADFighter =
        (attackDamage >= 80 && damageType === 'physical' && !desc.includes('damage blocked')) ||
        (attackDamage >= 60 && !hasDefTrait) ||
        desc.includes('frenzy') ||
        desc.includes('gain attack damage')

      // Kennen exception: 5-cost Executioner firestorm carry
      if (champ.name?.toLowerCase().includes('kennen')) {
        detailedRole = 'ap_burst_caster'
      } else if (hasOffensiveTrait || (isHighADFighter && !hasDefTrait) || (attackDamage >= 80 && damageType === 'physical') || desc.includes('omnivamp')) {
        detailedRole = damageType === 'magic' ? 'ap_bruiser' : 'ad_bruiser'
      } else if (hasDefTrait || hasDefScale) {
        // True Tanks:
        // off_tank: Tank that applies AOE disruption, sunder/shred, burn, or mana reave
        if (
          abilityAnalysis.hasBurnOrWound ||
          abilityAnalysis.hasShredOrSunder ||
          abilityAnalysis.hasCrowdControl ||
          desc.includes('mana reave') ||
          desc.includes('stun') ||
          desc.includes('knock up')
        ) {
          detailedRole = 'off_tank'
        } else {
          detailedRole = 'main_tank'
        }
      } else {
        detailedRole = damageType === 'magic' ? 'ap_bruiser' : 'ad_bruiser'
      }
    }
  } else {
    // Ranged / Backline logic (range >= 3)
    const isBuffSupport =
      champ.name?.toLowerCase().includes('ivern') ||
      (desc.includes('allies') &&
        (desc.includes('shield') || desc.includes('damage amp') || desc.includes('heal')) &&
        (desc.includes('grant') || desc.includes('restore')) &&
        !desc.includes('enemies in a'))

    if (isBuffSupport) {
      detailedRole = 'utility_support'
    } else if (damageType === 'physical') {
      // AD Caster Carry vs AD Auto Carry:
      // Caster carries (Ezreal, Varus): High mana (>= 90), 4th cast blasts, missile barrages
      // Auto carries (Draven, Tristana, Sivir, Aphelios, Caitlyn, Xayah, Cinderling, Ashe):
      // Attack speed buffs, Rapidfire/Hunter traits, basic attack modifiers
      const isCasterCarry =
        (mana >= 100 ||
          ((mana >= 60 || desc.includes('every 4th cast') || desc.includes('blast through')) &&
            !traitNames.some((t) => t.includes('rapidfire')))) &&
        !champ.name?.toLowerCase().includes('draven')

      if (isCasterCarry) {
        detailedRole = 'ad_caster_carry'
      } else {
        detailedRole = 'ad_auto_carry'
      }
    } else if (damageType === 'magic') {
      // AP Sustained Carry (Kayle, Azir, Cassiopeia):
      // On-hit magic attacks, continuous waves, rapidfire/attack speed scaling
      const isExplicitAPSustained =
        abilityAnalysis.scalesWithAS ||
        desc.includes('attacks deal bonus magic') ||
        desc.includes('attacks deal magic') ||
        desc.includes('ascend') ||
        desc.includes('attacks fire waves') ||
        desc.includes('magic damage per attack') ||
        (desc.includes('gain') && desc.includes('attack speed') && desc.includes('attack')) ||
        (traitNames.some((t) => t.includes('rapidfire')) && mana === 0)

      if (
        isExplicitAPSustained ||
        (isAutoAttackTrait && autoAttackScore > spellCasterScore) ||
        (autoAttackScore >= 0.6 && autoAttackScore > spellCasterScore)
      ) {
        detailedRole = 'ap_sustained_carry'
      } else {
        detailedRole = 'ap_burst_caster'
      }
    } else {
      detailedRole = 'hybrid_carry'
    }
  }

  // Raw role overrides if present
  if (rawRole === 'ADFighter') detailedRole = 'ad_bruiser'
  if (rawRole === 'APFighter') detailedRole = 'ap_bruiser'
  if (rawRole === 'APTank') detailedRole = 'main_tank'
  if (rawRole === 'ADTank') detailedRole = 'main_tank'

  const meta = DETAILED_ROLES_METADATA[detailedRole]
  return {
    detailedRole,
    broadRole: meta.broadRole,
    damageType,
    isFrontline,
    autoAttackScore: Math.min(1, Math.max(0, autoAttackScore)),
    spellCasterScore: Math.min(1, Math.max(0, spellCasterScore)),
    nameVi: meta.nameVi,
    icon: meta.icon,
    summary: meta.description,
    abilityAnalysis,
  }
}

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
  _name: string,
  rawRole: string | null | undefined,
  desc: string | undefined,
  range: number | undefined,
  traitNames: string[],
): ChampionRole {
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

/** Determines a champion's granular tactical role based on DB persistence or mathematical profiling. */
export function getChampionDetailedRole(champion: any): DetailedChampionRole {
  if (!champion) return 'ad_auto_carry'
  if (champion.detailedRole && champion.detailedRole in DETAILED_ROLES_METADATA) {
    return champion.detailedRole as DetailedChampionRole
  }
  const profile = profileChampionKit(champion)
  return profile.detailedRole
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

    if (role === 'tank') {
      tankCount += 1
      if (cost >= 4) highCostTankCount += 1
    } else if (role === 'bruiser') {
      bruiserCount += 1
      if (cost >= 4) highCostTankCount += 1
    } else if (role === 'carry') {
      carryCount += 1
      if (cost >= 4) highCostCarryCount += 1
    } else {
      supportCount += 1
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

import { v } from 'convex/values'
import { action } from './_generated/server'
import { internal } from './_generated/api'
import { ACTIVE_SET_KEY } from './gameConfig'
import {
  callJevSystemOne,
  type ChoiceAnswer,
  type NoulAnswer,
  type ScoreAnswer,
} from './typesafe'

export interface TeamCritiqueResult {
  frontlineRating: number // 1 to 3
  damageRating: number // 1 to 3
  ccRating: number // 1 to 3
  hasArmorShred: boolean
  hasMagicShred: boolean
  hasAntiHeal: boolean
  primaryWeakness: string
  advice: string
  source: 'jev' | 'heuristic'
}

export const critiqueTeamComposition = action({
  args: {
    slots: v.array(v.union(v.string(), v.null())),
    champItems: v.optional(v.record(v.string(), v.array(v.string()))),
  },
  handler: async (ctx, { slots, champItems = {} }): Promise<TeamCritiqueResult> => {
    const activeChampKeys = slots.filter((k): k is string => Boolean(k))

    if (activeChampKeys.length === 0) {
      return {
        frontlineRating: 1,
        damageRating: 1,
        ccRating: 1,
        hasArmorShred: false,
        hasMagicShred: false,
        hasAntiHeal: false,
        primaryWeakness: 'empty_team',
        advice: 'Đội hình đang trống. Hãy kéo tướng lên bàn cờ để AI đánh giá.',
        source: 'heuristic',
      }
    }

    const champions: any[] = await ctx.runQuery(
      internal.queries.getChampions,
      {
        setKey: ACTIVE_SET_KEY,
      },
    )
    const items: any[] = await ctx.runQuery(internal.queries.getItemsInternal, {
      setKey: ACTIVE_SET_KEY,
    })

    const champByKey = new Map(
      champions.map((c) => [(c.key ?? '').toLowerCase(), c]),
    )
    const itemByKey = new Map(
      items.map((i) => [(i.key ?? '').toLowerCase(), i]),
    )

    const teamRoster = activeChampKeys.map((key) => {
      const champ = champByKey.get(key.toLowerCase())
      const equippedKeys = champItems[key] || []
      const equippedItems = equippedKeys
        .map((k) => itemByKey.get(k.toLowerCase())?.name)
        .filter(Boolean)

      return {
        key,
        name: champ?.name || key,
        cost: champ?.cost ?? 1,
        role: champ?.role ?? 'carry',
        traits: (champ?.traits || []).map((t: any) => t.name),
        equippedItems,
      }
    })

    const frontlineUnits = teamRoster.filter(
      (c) => c.role === 'tank' || c.role === 'bruiser',
    )
    const carryUnits = teamRoster.filter((c) => c.role === 'carry')

    // State for Jev System One
    const state = {
      team_size: teamRoster.length,
      roster: teamRoster,
      frontline_count: frontlineUnits.length,
      carry_count: carryUnits.length,
    }

    const questions = {
      frontlineRating: {
        type: 'score' as const,
        instructions:
          'Rate the defensive frontline durability of this TFT team composition.',
        criteria: [
          'Extremely fragile frontline (0-1 tanks), likely to collapse in under 5 seconds.',
          'Moderate frontline durability (2-3 tanks/bruisers), sufficient for standard fights.',
          'Heavy fortified frontline with strong defensive tanks and crowd control.',
        ],
      },
      damageRating: {
        type: 'score' as const,
        instructions:
          'Rate the offensive damage threat and carry potential of this TFT team composition.',
        criteria: [
          'Insufficient damage output, lacks high-tier carries or offensive items.',
          'Solid damage with clear primary damage dealers.',
          'Overwhelming burst or hypercarry sustained DPS.',
        ],
      },
      primaryWeakness: {
        type: 'choice' as const,
        instructions:
          'What is the most critical weakness or vulnerability in this composition?',
        criteria: {
          lacks_frontline: 'Not enough tanks/bruisers to absorb damage before carries die.',
          lacks_damage: 'Too many defensive units or low damage carries; cannot kill enemy tanks.',
          no_anti_heal: 'No burn/anti-heal items (Sunfire/Morello/Red Buff) against high healing enemies.',
          no_shred: 'No armor shred or magic resistance reduction against super tanks.',
          well_balanced: 'Well balanced comp with strong frontline, damage dealers, and utility.',
        },
      },
      hasAntiHeal: {
        type: 'noul' as const,
        instructions:
          'Does this team possess anti-heal / grievous wounds via equipped items or traits?',
        criteria: {
          true: 'Yes, possesses Sunfire Cape, Morellonomicon, Red Buff, or innate trait wound.',
          false: 'No healing reduction present on the team.',
        },
      },
      hasShred: {
        type: 'noul' as const,
        instructions:
          'Does this team possess armor shred or magic resistance reduction via equipped items or traits?',
        criteria: {
          true: 'Yes, possesses Last Whisper, Evenshroud, Statikk Shiv, Ionic Spark, or shred traits.',
          false: 'No shred items or traits present.',
        },
      },
    }

    const jevResponse = await callJevSystemOne(state, questions)

    if (jevResponse) {
      const flScore = (jevResponse.answers.frontlineRating as ScoreAnswer)?.score ?? 2
      const dmgScore = (jevResponse.answers.damageRating as ScoreAnswer)?.score ?? 2
      const weakChoice = (jevResponse.answers.primaryWeakness as ChoiceAnswer)?.choice ?? 'well_balanced'
      const antiHealProb = (jevResponse.answers.hasAntiHeal as NoulAnswer)?.probability ?? 0
      const shredProb = (jevResponse.answers.hasShred as NoulAnswer)?.probability ?? 0

      const adviceMap: Record<string, string> = {
        lacks_frontline:
          'Cảnh báo: Tuyến đầu quá mỏng! Hãy thêm 1-2 tướng Đỡ đòn (Tank/Bruiser) hoặc ghép Giáp Máu/Thú Tượng.',
        lacks_damage:
          'Cảnh báo: Thiếu sát thương kết liễu! Hãy nâng cấp tướng chủ lực 4-5 vàng hoặc dồn trang bị công.',
        no_anti_heal:
          'Lưu ý: Thiếu Giảm Hồi Máu! Dễ bị thua trước các đội hình hút máu/hồi phục mạnh (cần Giáp Lửa / Quỷ Thư / Bùa Đỏ).',
        no_shred:
          'Lưu ý: Thiếu Giảm Giáp / Kháng Phép! Sẽ khó xuyên qua các Siêu Tanker đối phương (cần Cung Xanh / Dao Điện / Nỏ Sét).',
        well_balanced:
          'Đội hình công thủ rất hài hòa, có đầy đủ chống chịu và nguồn sát thương rõ ràng.',
      }

      return {
        frontlineRating: Math.min(3, Math.max(1, Math.round(flScore))),
        damageRating: Math.min(3, Math.max(1, Math.round(dmgScore))),
        ccRating: 2,
        hasArmorShred: shredProb >= 0.5,
        hasMagicShred: shredProb >= 0.5,
        hasAntiHeal: antiHealProb >= 0.5,
        primaryWeakness: weakChoice,
        advice: adviceMap[weakChoice] || adviceMap.well_balanced,
        source: 'jev',
      }
    }

    // Heuristic fallback
    const frontlineCount = frontlineUnits.length
    const carryCount = carryUnits.length
    const flRating = frontlineCount >= 3 ? 3 : frontlineCount >= 2 ? 2 : 1
    const dmgRating = carryCount >= 2 ? 3 : carryCount >= 1 ? 2 : 1

    let primaryWeak = 'well_balanced'
    let advice = 'Đội hình tương đối cân bằng.'

    if (frontlineCount < 2) {
      primaryWeak = 'lacks_frontline'
      advice = 'Tuyến đầu còn mỏng! Cần bổ sung thêm tướng Đấu Sĩ / Can Trường hoặc trang bị chống chịu.'
    } else if (carryCount < 1) {
      primaryWeak = 'lacks_damage'
      advice = 'Thiếu chủ lực gây sát thương chính! Cần thêm carry tuyến sau.'
    }

    return {
      frontlineRating: flRating,
      damageRating: dmgRating,
      ccRating: 2,
      hasArmorShred: false,
      hasMagicShred: false,
      hasAntiHeal: false,
      primaryWeakness: primaryWeak,
      advice,
      source: 'heuristic',
    }
  },
})

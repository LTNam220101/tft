import { v } from 'convex/values'
import { action } from './_generated/server'
import { internal } from './_generated/api'
import { ACTIVE_SET_KEY } from './gameConfig'
import {
  type DetailedChampionRole,
} from './optimizerRoles'
import { classifyChampionRole } from './typesafeRoles'

export interface RecommendedItem {
  key: string
  name: string
  iconPath?: string
  reason: string
  score: number
  tier: 'BiS 1' | 'BiS 2' | 'BiS 3' | 'BiS 4'
}

export interface ChampionItemRecommendationResult {
  champKey: string
  champName: string
  detailedRole: DetailedChampionRole
  broadRole: string
  roleNameVi: string
  roleIcon: string
  roleDescription: string
  damageType: string
  recommendedItems: RecommendedItem[]
  source: 'jev' | 'heuristic'
  abilityAnalysis?: {
    name?: string
    desc?: string
    cleanDescription: string
    scalingTags: string[]
    primaryScalingStat: string
    hasShieldOrHeal: boolean
    hasCrowdControl: boolean
  }
}

/**
 * High-Elo BiS item matrix explicitly mapped to each of the 12 detailed tactical roles.
 * Accurately separates Auto Attack carries (Guinsoo/LW) from Spell Caster carries (Shojin/Deathblade).
 */
const DETAILED_ROLE_ITEM_MATRIX: Record<
  DetailedChampionRole,
  { itemNames: string[]; tacticalReason: string }
> = {
  ad_auto_carry: {
    itemNames: [
      "Guinsoo's Rageblade",
      "Last Whisper",
      "Infinity Edge",
      "Giant Slayer",
      "Runaan's Hurricane",
      "Red Buff",
    ],
    tacticalReason:
      "Tối đa hóa tốc độ đánh và sát thương đòn đánh tay — Bắt buộc cần Cuồng Đao tăng tiến tốc đánh, Cung Xanh trừ giáp và Vô Cực Kiếm.",
  },
  ad_caster_carry: {
    itemNames: [
      "Spear of Shojin",
      "Infinity Edge",
      "Deathblade",
      "Giant Slayer",
      "Edge of Night",
      "Last Whisper",
    ],
    tacticalReason:
      "Tối đa hóa sát thương dồn từ kỹ năng vật lý — Cần Shojin hồi mana nhanh để xả chiêu, Kiếm Tử Thần và Vô Cực Kiếm để tối đa hóa AD.",
  },
  ap_burst_caster: {
    itemNames: [
      "Blue Buff",
      "Spear of Shojin",
      "Jeweled Gauntlet",
      "Rabadon's Deathcap",
      "Giant Slayer",
      "Guardbreaker",
    ],
    tacticalReason:
      "Pháp sư sốc sát thương bộc phát — Bùa Xanh/Shojin giúp tung chiêu sớm, Găng Bảo Thạch nổ chí mạng phép và Mũ Phù Thủy.",
  },
  ap_sustained_carry: {
    itemNames: [
      "Guinsoo's Rageblade",
      "Nashor's Tooth",
      "Archangel's Staff",
      "Statikk Shiv",
      "Jeweled Gauntlet",
    ],
    tacticalReason:
      "Pháp sư tốc đánh & dps duy trì — Cuồng Đao và Nanh Nashor kích tốc đánh liên hồi, Quyền Trượng tăng tiến SMPT theo thời gian.",
  },
  ad_bruiser: {
    itemNames: [
      "Bloodthirster",
      "Sterak's Gage",
      "Titan's Resolve",
      "Hand of Justice",
      "Edge of Night",
    ],
    tacticalReason:
      "Đấu sĩ vật lý công thủ toàn diện — Huyết Kiếm tạo lá chắn và hút máu ảo, Móng Vuốt Sterak chống sốc dame, Quyền Năng Khổng Lồ.",
  },
  ap_bruiser: {
    itemNames: [
      "Hand of Justice",
      "Titan's Resolve",
      "Crownguard",
      "Ionic Spark",
      "Bloodthirster",
      "Riftmaker",
    ],
    tacticalReason:
      "Đấu sĩ phép thuật cận chiến — Bàn Tay Công Lý hồi phục, Vương Miện Hoàng Gia tạo khiên, Quyền Năng và Nỏ Sét trừ kháng phép.",
  },
  main_tank: {
    itemNames: [
      "Warmog's Armor",
      "Dragon's Claw",
      "Bramble Vest",
      "Gargoyle Stoneplate",
      "Steadfast Heart",
    ],
    tacticalReason:
      "Siêu tanker hấp thụ sát thương — Giáp Máu Warmog, Vuốt Rồng và Áo Choàng Gai tối đa hóa độ trâu bò trước cả sát thương vật lý và phép.",
  },
  off_tank: {
    itemNames: [
      "Sunfire Cape",
      "Evenshroud",
      "Ionic Spark",
      "Redemption",
      "Protector's Vow",
    ],
    tacticalReason:
      "Tanker hiệu ứng hỗ trợ — Giáp Lửa đốt máu và vết thương sâu, Giáp Vai/Nỏ Sét trừ giáp/kháng phép diện rộng cho chủ lực tuyến sau.",
  },
  ad_assassin: {
    itemNames: [
      "Infinity Edge",
      "Edge of Night",
      "Hand of Justice",
      "Bloodthirster",
      "Last Whisper",
    ],
    tacticalReason:
      "Sát thủ vật lý bắt lẻ — Vô Cực Kiếm dồn sát thương bộc phát kết liễu, Áo Choàng Bóng Tối tàng hình né bị dồn hiệu ứng.",
  },
  ap_assassin: {
    itemNames: [
      "Jeweled Gauntlet",
      "Hand of Justice",
      "Ionic Spark",
      "Edge of Night",
      "Crownguard",
    ],
    tacticalReason:
      "Sát thủ phép thuật bắt lẻ — Găng Bảo Thạch nổ chí mạng phép, Nỏ Sét trừ kháng phép kẻ địch xung quanh và Áo Choàng Bóng Tối.",
  },
  hybrid_carry: {
    itemNames: [
      "Giant Slayer",
      "Hand of Justice",
      "Guardbreaker",
      "Guinsoo's Rageblade",
      "Infinity Edge",
    ],
    tacticalReason:
      "Chủ lực lai đa năng — Diệt Khổng Lồ, Bàn Tay Công Lý và Chùy Xuyên Phá phát huy tối đa cả hai nguồn sát thương AD và AP.",
  },
  utility_support: {
    itemNames: [
      "Redemption",
      "Statikk Shiv",
      "Morellonomicon",
      "Locket of the Iron Solari",
      "Chalice of Power",
    ],
    tacticalReason:
      "Hỗ trợ đa dụng cho đội — Chuộc Tội hồi máu diện rộng, Dao Điện giảm kháng phép diện rộng và Quỷ Thư áp hiệu ứng bỏng máu.",
  },
}

export const recommendItemsForChampion = action({
  args: {
    champKey: v.string(),
  },
  handler: async (ctx, { champKey }): Promise<ChampionItemRecommendationResult> => {
    const champions: any[] = await ctx.runQuery(
      internal.queries.getChampions,
      {
        setKey: ACTIVE_SET_KEY,
      },
    )
    const items: any[] = await ctx.runQuery(internal.queries.getItemsInternal, {
      setKey: ACTIVE_SET_KEY,
    })
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

    const classification = await classifyChampionRole({
      name: champ.name,
      range: champ.stats?.range,
      desc: champ.ability?.desc,
      ability: champ.ability,
      traits: enrichedTraits,
      rawRole: champ.rawRole,
      stats: champ.stats,
    })

    const roleConfig =
      DETAILED_ROLE_ITEM_MATRIX[classification.detailedRole] ||
      DETAILED_ROLE_ITEM_MATRIX.ad_auto_carry

    const matchedItems: RecommendedItem[] = []
    const tiers: Array<'BiS 1' | 'BiS 2' | 'BiS 3' | 'BiS 4'> = [
      'BiS 1',
      'BiS 2',
      'BiS 3',
      'BiS 4',
    ]

    for (const name of roleConfig.itemNames) {
      const foundItem = items.find((i: any) =>
        (i.name || '').toLowerCase().includes(name.toLowerCase()),
      )
      if (foundItem) {
        // Avoid duplicate items
        if (!matchedItems.some((m) => m.key === foundItem.key)) {
          const tier = tiers[matchedItems.length] || 'BiS 4'
          matchedItems.push({
            key: foundItem.key,
            name: foundItem.name,
            iconPath: foundItem.iconPath,
            reason: roleConfig.tacticalReason,
            score: Number((5.0 - matchedItems.length * 0.2).toFixed(1)),
            tier,
          })
        }
      }
      if (matchedItems.length >= 4) break
    }

    return {
      champKey,
      champName: champ.name || champKey,
      detailedRole: classification.detailedRole,
      broadRole: classification.role,
      roleNameVi: classification.roleNameVi,
      roleIcon: classification.roleIcon,
      roleDescription: classification.summary,
      damageType: classification.primaryDamage,
      recommendedItems: matchedItems,
      source: classification.source,
      abilityAnalysis: classification.abilityAnalysis ? {
        name: classification.abilityAnalysis.name,
        desc: classification.abilityAnalysis.desc,
        cleanDescription: classification.abilityAnalysis.cleanDescription,
        scalingTags: classification.abilityAnalysis.scalingTags,
        primaryScalingStat: classification.abilityAnalysis.primaryScalingStat,
        hasShieldOrHeal: classification.abilityAnalysis.hasShieldOrHeal,
        hasCrowdControl: classification.abilityAnalysis.hasCrowdControl,
      } : undefined,
    }
  },
})

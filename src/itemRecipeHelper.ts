import type { Item } from '../convex/schema'

/**
 * Standard Component IDs / keys
 */
export const COMPONENT_KEYS = [
  'DA_Component_BFSword',
  'DA_Component_RecurveBow',
  'DA_Component_NeedlesslyLargeRod',
  'DA_Component_TearOfTheGoddess',
  'DA_Component_ChainVest',
  'DA_Component_NegatronCloak',
  'DA_Component_GiantsBelt',
  'DA_Component_SparringGloves',
  'DA_Component_Spatula',
  'DA_Component_FryingPan',
  'TFT_Item_BFSword',
  'TFT_Item_RecurveBow',
  'TFT_Item_NeedlesslyLargeRod',
  'TFT_Item_TearOfTheGoddess',
  'TFT_Item_ChainVest',
  'TFT_Item_NegatronCloak',
  'TFT_Item_GiantsBelt',
  'TFT_Item_SparringGloves',
  'TFT_Item_Spatula',
  'TFT_Item_FryingPan',
]

/**
 * Maps effect keys from CDragon into friendly display labels
 */
export const STAT_LABELS: Record<string, { label: string; isPercent?: boolean; prefix?: string }> = {
  AD: { label: 'Attack Damage', isPercent: true, prefix: '+' },
  AP: { label: 'Ability Power', prefix: '+' },
  Armor: { label: 'Armor', prefix: '+' },
  MagicResist: { label: 'Magic Resist', prefix: '+' },
  Health: { label: 'Health', prefix: '+' },
  AS: { label: 'Attack Speed', isPercent: true, prefix: '+' },
  CritChance: { label: 'Critical Strike Chance', isPercent: true, prefix: '+' },
  Mana: { label: 'Starting Mana', prefix: '+' },
  ManaRegen: { label: 'Mana Regen / 3s', prefix: '+' },
  Omnivamp: { label: 'Omnivamp', isPercent: true, prefix: '+' },
  DamageAmp: { label: 'Damage Amp', isPercent: true, prefix: '+' },
}

/**
 * Formats an effects record into readable strings
 */
export function formatStatList(effects?: Record<string, number>): string[] {
  if (!effects) return []
  const list: string[] = []

  for (const [key, val] of Object.entries(effects)) {
    if (typeof val !== 'number' || val === 0) continue
    const config = STAT_LABELS[key]
    if (config) {
      const formattedVal = config.isPercent
        ? `${Math.round(val > 1 ? val : val * 100)}%`
        : `${Math.round(val)}`
      list.push(`${config.prefix || ''}${formattedVal} ${config.label}`)
    } else if (!key.startsWith('{')) {
      // Named stat without config
      const formattedVal = Math.abs(val) < 1 && val !== 0 ? `${Math.round(val * 100)}%` : `${val}`
      list.push(`+${formattedVal} ${key}`)
    }
  }

  return list
}

/**
 * Looks up the two components for a craftable item
 */
export function getItemComponents(
  item: Item,
  allItems: Item[]
): [Item | null, Item | null] | null {
  if (!item.composition || item.composition.length < 2) return null

  const itemMap = new Map<string, Item>()
  for (const it of allItems) {
    if (it.key) itemMap.set(it.key, it)
    if (it.nameId) itemMap.set(it.nameId, it)
  }

  const comp1 = itemMap.get(item.composition[0]) ?? null
  const comp2 = itemMap.get(item.composition[1]) ?? null

  return [comp1, comp2]
}

/**
 * Finds all craftable items that use a specific component
 */
export function getCraftableWithComponent(
  componentKeyOrNameId: string,
  allItems: Item[]
): Item[] {
  return allItems.filter((it) => {
    if (!it.composition || it.composition.length < 2) return false
    return it.composition.includes(componentKeyOrNameId)
  })
}

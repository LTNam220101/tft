/**
 * Set 17 Miss Fortune: in-game she picks 1 of 3 optional traits (not on her static trait list).
 * Beam search keeps 3 branches; scoring and UI add +1 to the chosen trait id.
 */

export const TFT17_MISS_FORTUNE_KEY = 'TFT17_MissFortune'

export const TFT17_MF_OPTIONAL_TRAITS = [
  'TFT17_ManaTrait',
  'TFT17_ASTrait',
  'TFT17_APTrait',
] as const

/** Match DB key (exact or common Riot-style suffix). */
export function isMissFortuneChampion(c: { key?: string }): boolean {
  const k = c.key ?? ''
  return k === TFT17_MISS_FORTUNE_KEY || /MissFortune/i.test(k)
}

export function teamHasMissFortune(team: any[]): boolean {
  return team.some(isMissFortuneChampion)
}

/** +1 to chosen optional trait when MF is on the team (scoring / tooltip counts). */
export function applyMissFortuneOptionalTraitToCounts(
  rawTraitCounts: Record<string, number>,
  team: any[],
  mfOptionalTrait: string | null,
): Record<string, number> {
  if (!mfOptionalTrait || !teamHasMissFortune(team)) return rawTraitCounts
  return {
    ...rawTraitCounts,
    [mfOptionalTrait]: (rawTraitCounts[mfOptionalTrait] || 0) + 1,
  }
}

/**
 * MF’s third trait isn’t in `nativeCounts` from champion JSON — merge virtual +1 so
 * `hasSharedTrait` / `isTeamComplete` see the same edges the player does in-game.
 */
export function nativeCountsWithMissFortuneVirtual(
  nativeCounts: Record<string, number>,
  team: any[],
  mfBranch: string | null,
): Record<string, number> {
  if (!mfBranch || !teamHasMissFortune(team)) return nativeCounts
  return {
    ...nativeCounts,
    [mfBranch]: (nativeCounts[mfBranch] || 0) + 1,
  }
}

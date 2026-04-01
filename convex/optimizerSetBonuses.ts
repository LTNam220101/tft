/**
 * Per-set extras on top of generic trait scoring in `calculateTeamScoreFromCounts`.
 * Add a branch in `setSpecificTeamScoreDelta` when a new TFT set needs custom rules.
 */

export function setSpecificTeamScoreDelta(
    setKey: string,
    rawTraitCounts: Record<string, number>,
    traitMap: Map<string, any>,
    team: any[],
): number {
    switch (setKey) {
        case "TFTSet16":
            return tftSet16TeamScoreDelta(rawTraitCounts, traitMap, team);
        default:
            return 0;
    }
}

/** Set 16: Ryze / regions, Tibber–Annie, Yone–Yasuo */
function tftSet16TeamScoreDelta(
    rawTraitCounts: Record<string, number>,
    traitMap: Map<string, any>,
    team: any[],
): number {
    let delta = 0;
    const teamKeys = new Set(team.map((c) => c.key));

    if (teamKeys.has("TFT16_Ryze")) {
        let regionCount = 0;
        for (const [traitId, count] of Object.entries(rawTraitCounts)) {
            const traitDef = traitMap.get(traitId);
            if (traitDef?.isRegion) {
                const active = traitDef.effects?.some((eff: any) => count >= eff.min_units);
                if (active) {
                    regionCount++;
                }
            }
        }
        delta += regionCount < 4 ? -100 * (4 - regionCount) : 100 * regionCount;
    }

    if (teamKeys.has("TFT16_Tibber") && !teamKeys.has("TFT16_Annie")) delta -= 100;
    else if (teamKeys.has("TFT16_Tibber") && teamKeys.has("TFT16_Annie")) delta += 50;

    if (teamKeys.has("TFT16_Yone") && !teamKeys.has("TFT16_Yasuo")) delta -= 100;
    else if (teamKeys.has("TFT16_Yone") && teamKeys.has("TFT16_Yasuo")) delta += 100;

    return delta;
}

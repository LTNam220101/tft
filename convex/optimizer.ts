import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";

export const suggestTeams = action({
    args: {
        emblemIds: v.array(v.string()), // IDs or Keys of emblems
        teamSize: v.number(),
        mode: v.optional(v.union(v.literal("wide"), v.literal("deep"))),
        mustHaveChampIds: v.optional(v.array(v.string())), // IDs of champions to force include
        blockedChampIds: v.optional(v.array(v.string())), // IDs of champions to exclude
    },
    handler: async (ctx, { emblemIds, teamSize, mode = "deep", mustHaveChampIds = [], blockedChampIds = [] }) => {
        const allChampions: any[] = await ctx.runQuery(internal.queries.getChampions);
        const traits: any[] = await ctx.runQuery(api.queries.getTraits);
        const items: any[] = await ctx.runQuery(internal.queries.getItemsInternal);

        const traitMap = new Map(traits.map(t => [t.key || t._id, t]));

        // Filter out locked champions (where isLocked is true) AND blocked champions
        const champions = allChampions.filter((c: any) => c.isLocked !== true && !blockedChampIds.includes(c._id));

        // Find the mandatory champions
        const lockedInChamps = allChampions.filter((c: any) => mustHaveChampIds.includes(c._id));

        // Map each emblem ID to its corresponding trait key
        const emblemTraitKeys = emblemIds.map(id => {
            const item = items.find((i: any) => i.key === id);
            if (!item) return null;
            const traitName = item.name?.replace(" Emblem", "");
            const foundTrait = traits.find(t => t.name === traitName);
            return foundTrait?.key;
        }).filter(Boolean) as string[];

        const emblemCounts: Record<string, number> = {};
        for (const tk of emblemTraitKeys) {
            emblemCounts[tk] = (emblemCounts[tk] || 0) + 1;
        }

        // Initialize Beam Search
        let beam: any[] = [{
            champions: lockedInChamps,
            usedKeys: new Set(lockedInChamps.map((c: any) => c.key!)),
            nativeCounts: getNativeCounts(lockedInChamps),
            score: 0,
            key: lockedInChamps.map((c: any) => c.key!).sort().join(",")
        }];
        beam[0].score = calculateTeamScoreFromCounts(beam[0].nativeCounts, lockedInChamps.length, emblemCounts, traitMap, mode, beam[0].champions);

        const beamWidth = 30;

        for (let step = lockedInChamps.length; step < teamSize; step++) {
            const nextCandidates: any[] = [];
            const seenKeys = new Set<string>();

            for (const state of beam) {
                for (const candidate of champions) {
                    if (state.usedKeys.has(candidate.key!)) continue;

                    const newNativeCounts = { ...state.nativeCounts };
                    if (candidate.traits) {
                        for (const t of candidate.traits) {
                            newNativeCounts[t.id] = (newNativeCounts[t.id] || 0) + 1;
                        }
                    }

                    const newTeam = [...state.champions, candidate];
                    const newTeamKeys = [...Array.from(state.usedKeys), candidate.key!].sort();
                    const teamKey = newTeamKeys.join(",");

                    if (seenKeys.has(teamKey)) continue;
                    seenKeys.add(teamKey);

                    const score = calculateTeamScoreFromCounts(newNativeCounts, newTeam.length, emblemCounts, traitMap, mode, newTeam);

                    nextCandidates.push({
                        champions: newTeam,
                        score: score,
                        usedKeys: new Set(newTeamKeys),
                        nativeCounts: newNativeCounts,
                        key: teamKey
                    });
                }
            }

            // Prune beam
            beam = nextCandidates
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return a.key.localeCompare(b.key);
                })
                .slice(0, beamWidth);
        }

        return beam.map((state: any) => ({
            champions: state.champions,
            score: state.score,
            activeTraits: getActiveTraitsFromCounts(state.nativeCounts, state.champions.length, emblemCounts, traitMap),
        }));
    },
});

export const suggestWorldRunes = action({
    args: {
        emblemIds: v.array(v.string()), // IDs of region emblems
        mustHaveChampIds: v.optional(v.array(v.string())),
        blockedChampIds: v.optional(v.array(v.string())),
    },
    handler: async (ctx, { emblemIds, mustHaveChampIds = [], blockedChampIds = [] }) => {
        const allChampions: any[] = await ctx.runQuery(internal.queries.getChampions);
        const traits: any[] = await ctx.runQuery(api.queries.getTraits);
        const items: any[] = await ctx.runQuery(internal.queries.getItemsInternal);

        const traitMap = new Map(traits.map(t => [t.key || t._id, t]));
        const champions = allChampions.filter((c: any) => c.isLocked !== true && !blockedChampIds.includes(c._id));
        const lockedInChamps = allChampions.filter((c: any) => mustHaveChampIds.includes(c._id));

        const emblemTraitKeys = emblemIds.map(id => {
            const item = items.find((i: any) => i.key === id);
            if (!item) return null;
            const traitName = item.name?.replace(" Emblem", "");
            const foundTrait = traits.find(t => t.name === traitName);
            return foundTrait?.key;
        }).filter(Boolean) as string[];

        const emblemCounts: Record<string, number> = {};
        for (const tk of emblemTraitKeys) {
            emblemCounts[tk] = (emblemCounts[tk] || 0) + 1;
        }

        // Iterate through team sizes
        for (let size = 1; size <= 6; size++) {
            if (size < lockedInChamps.length) continue;

            let beam: any[] = [{
                champions: lockedInChamps,
                usedKeys: new Set(lockedInChamps.map((c: any) => c.key!)),
                nativeCounts: getNativeCounts(lockedInChamps),
                score: 0,
                key: lockedInChamps.map((c: any) => c.key!).sort().join(",")
            }];
            beam[0].score = calculateRegionScoreFromCounts(beam[0].nativeCounts, lockedInChamps.length, emblemCounts, traitMap, beam[0].champions);

            const beamWidth = 40;

            for (let step = lockedInChamps.length; step < size; step++) {
                const nextCandidates: any[] = [];
                const seenKeys = new Set<string>();

                for (const state of beam) {
                    for (const candidate of champions) {
                        if (state.usedKeys.has(candidate.key!)) continue;

                        const newNativeCounts = { ...state.nativeCounts };
                        if (candidate.traits) {
                            for (const t of candidate.traits) {
                                newNativeCounts[t.id] = (newNativeCounts[t.id] || 0) + 1;
                            }
                        }

                        const newTeam = [...state.champions, candidate];
                        const newTeamKeys = [...Array.from(state.usedKeys), candidate.key!].sort();
                        const teamKey = newTeamKeys.join(",");

                        if (seenKeys.has(teamKey)) continue;
                        seenKeys.add(teamKey);

                        const score = calculateRegionScoreFromCounts(newNativeCounts, newTeam.length, emblemCounts, traitMap, newTeam);

                        nextCandidates.push({
                            champions: newTeam,
                            score: score,
                            usedKeys: new Set(newTeamKeys),
                            nativeCounts: newNativeCounts,
                            key: teamKey
                        });
                    }
                }

                beam = nextCandidates
                    .sort((a, b) => {
                        if (b.score !== a.score) return b.score - a.score;
                        return a.key.localeCompare(b.key);
                    })
                    .slice(0, beamWidth);
            }

            const validResults = beam.filter((state: any) => countActiveRegionsFromCounts(state.nativeCounts, state.champions.length, emblemCounts, traitMap) >= 4);

            if (validResults.length > 0) {
                return validResults
                    .map((state: any) => {
                        const totalCost = state.champions.reduce((sum: number, c: any) => sum + (c.cost || 0), 0);
                        const regionCount = countActiveRegionsFromCounts(state.nativeCounts, state.champions.length, emblemCounts, traitMap);
                        return {
                            champions: state.champions,
                            score: regionCount * 1000 - totalCost,
                            activeTraits: getActiveTraitsFromCounts(state.nativeCounts, state.champions.length, emblemCounts, traitMap),
                            teamSize: size,
                            totalCost
                        };
                    })
                    .sort((a: any, b: any) => b.score - a.score)
                    .slice(0, 10);
            }
        }

        return [];
    },
});

function getNativeCounts(team: any[]) {
    const nativeCounts: Record<string, number> = {};
    for (const c of team) {
        if (c.traits) {
            for (const t of c.traits) {
                nativeCounts[t.id] = (nativeCounts[t.id] || 0) + 1;
            }
        }
    }
    return nativeCounts;
}

function calculateTeamScoreFromCounts(
    nativeCounts: Record<string, number>,
    teamSize: number,
    emblemCounts: Record<string, number>,
    traitMap: Map<string, any>,
    mode: "wide" | "deep",
    team: any[]
) {
    let totalScore = 0;
    const rawTraitCounts: Record<string, number> = { ...nativeCounts };

    // Add emblems
    for (const [traitId, count] of Object.entries(emblemCounts)) {
        const native = nativeCounts[traitId] || 0;
        const availableHolders = teamSize - native;
        rawTraitCounts[traitId] = native + Math.min(count, availableHolders);
    }

    for (const [traitId, count] of Object.entries(rawTraitCounts)) {
        const traitDef = traitMap.get(traitId);
        if (!traitDef || !traitDef.effects) continue;

        const activeEffects = traitDef.effects.filter((eff: any) => count >= eff.min_units);

        if (activeEffects.length > 0) {
            if (mode === "wide") {
                if (traitDef.unique) totalScore += 30;
                totalScore += 150 + activeEffects.length * 30;
            } else {
                if (traitDef.unique) totalScore += 30;

                const currentMinUnits = activeEffects[activeEffects.length - 1].min_units;
                const prevMinUnits = activeEffects.length > 1 ? activeEffects[activeEffects.length - 2].min_units : 0;
                const gap = currentMinUnits - prevMinUnits;

                if (emblemCounts[traitId]) {
                    // Balanced: Use linear currentMinUnits to avoid over-prioritizing large milestones like A6
                    totalScore += currentMinUnits * 30 * gap;
                    totalScore += count * 5 * gap;
                } else {
                    totalScore += currentMinUnits * 30;
                    totalScore += count * 5;
                }
            }
        } else if (emblemCounts[traitId]) {
            totalScore -= 500;
        }
    }

    // Synergy Rules (Synergy rules are usually small, so we keep them simple)
    const teamKeys = new Set(team.map(c => c.key));
    if (teamKeys.has("TFT16_Ryze")) {
        let regionCount = 0;
        for (const [traitId, count] of Object.entries(rawTraitCounts)) {
            const traitDef = traitMap.get(traitId);
            if (traitDef?.isRegion) {
                const active = traitDef.effects?.some((eff: any) => count >= eff.min_units);
                if (active) {
                    regionCount++;
                    totalScore += 100;
                }
            }
        }
        totalScore += (regionCount < 4) ? -3000 : 500;
    }

    if (teamKeys.has("TFT16_Tibber") && !teamKeys.has("TFT16_Annie")) totalScore -= 2000;
    else if (teamKeys.has("TFT16_Tibber") && teamKeys.has("TFT16_Annie")) totalScore += 300;

    if (teamKeys.has("TFT16_Yone") && !teamKeys.has("TFT16_Yasuo")) totalScore -= 300;
    else if (teamKeys.has("TFT16_Yone") && teamKeys.has("TFT16_Yasuo")) totalScore += 300;

    // Cost Penalty
    for (const c of team) {
        totalScore -= (c.cost || 0) * (c.cost || 0) * 2;
    }

    return totalScore;
}

function calculateRegionScoreFromCounts(
    nativeCounts: Record<string, number>,
    teamSize: number,
    emblemCounts: Record<string, number>,
    traitMap: Map<string, any>,
    team: any[]
) {
    let score = 0;
    const rawTraitCounts: Record<string, number> = { ...nativeCounts };

    for (const [traitId, count] of Object.entries(emblemCounts)) {
        const native = nativeCounts[traitId] || 0;
        const availableHolders = teamSize - native;
        rawTraitCounts[traitId] = native + Math.min(count, availableHolders);
    }

    for (const [traitId, count] of Object.entries(rawTraitCounts)) {
        const traitDef = traitMap.get(traitId);
        if (traitDef?.isRegion) {
            const active = traitDef.effects?.some((eff: any) => count >= eff.min_units);
            if (active) score += 100;
            else score += count * 5;
        }
    }

    // Cost Penalty
    for (const c of team) {
        score -= ((c.cost) * (c.cost) || 0);
    }

    return score;
}

function countActiveRegionsFromCounts(
    nativeCounts: Record<string, number>,
    teamSize: number,
    emblemCounts: Record<string, number>,
    traitMap: Map<string, any>
) {
    let regionCount = 0;
    const rawTraitCounts: Record<string, number> = { ...nativeCounts };

    for (const [traitId, count] of Object.entries(emblemCounts)) {
        const native = nativeCounts[traitId] || 0;
        const availableHolders = teamSize - native;
        rawTraitCounts[traitId] = native + Math.min(count, availableHolders);
    }

    for (const [traitId, count] of Object.entries(rawTraitCounts)) {
        const traitDef = traitMap.get(traitId);
        if (traitDef?.isRegion) {
            const active = traitDef.effects?.some((eff: any) => count >= eff.min_units);
            if (active) regionCount++;
        }
    }
    return regionCount;
}

function getActiveTraitsFromCounts(
    nativeCounts: Record<string, number>,
    teamSize: number,
    emblemCounts: Record<string, number>,
    traitMap: Map<string, any>
) {
    const rawTraitCounts: Record<string, number> = { ...nativeCounts };

    for (const [traitId, count] of Object.entries(emblemCounts)) {
        const native = nativeCounts[traitId] || 0;
        const availableHolders = teamSize - native;
        rawTraitCounts[traitId] = native + Math.min(count, availableHolders);
    }

    const active = [];
    for (const [traitId, count] of Object.entries(rawTraitCounts)) {
        const traitDef = traitMap.get(traitId);
        if (!traitDef || !traitDef.effects) continue;

        const activeMilestones = traitDef.effects.filter((eff: any) => count >= eff.min_units);

        if (activeMilestones.length > 0 || traitDef.unique) {
            const currentMilestone = activeMilestones.length > 0
                ? activeMilestones[activeMilestones.length - 1].min_units
                : 0;

            active.push({
                key: traitId,
                name: traitDef.name,
                count,
                unique: !!traitDef.unique,
                isRegion: !!traitDef.isRegion,
                iconPath: traitDef.iconPath,
                tier: activeMilestones.length,
                totalTiers: traitDef.effects.length,
                currentMilestone,
                allMilestones: traitDef.effects.map((e: any) => e.min_units),
            });
        }
    }
    return active.sort((a, b) => b.tier - a.tier || b.count - a.count);
}


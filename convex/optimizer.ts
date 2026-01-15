import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const suggestTeams = action({
    args: {
        emblemIds: v.array(v.string()), // IDs or Keys of emblems
        teamSize: v.number(),
        mode: v.optional(v.union(v.literal("wide"), v.literal("deep"))),
        mustHaveChampIds: v.optional(v.array(v.string())), // IDs of champions to force include
    },
    handler: async (ctx, { emblemIds, teamSize, mode = "deep", mustHaveChampIds = [] }) => {
        const allChampions = await ctx.runQuery(internal.queries.getChampions);
        const traits = await ctx.runQuery(internal.queries.getTraits);
        const items = await ctx.runQuery(internal.queries.getItemsInternal);

        // Filter out locked champions (where isLocked is true)
        const champions = allChampions.filter(c => c.isLocked !== true);

        // Find the mandatory champions
        const lockedInChamps = allChampions.filter(c => mustHaveChampIds.includes(c._id));

        // Map each emblem ID to its corresponding trait key, preserving duplicates
        const emblemTraitKeys = emblemIds.map(id => {
            const item = items.find((i: any) => i.key === id);
            if (!item) return null;
            const traitName = item.name?.replace(" Emblem", "");
            const foundTrait = traits.find(t => t.name === traitName);
            return foundTrait?.key;
        }).filter(Boolean) as string[];


        // Stochastic Greedy Search with Multiple Restarts:
        // This approximates backtracking by exploring many random high-probability paths.
        const teams: any[] = [];

        for (let i = 0; i < 100; i++) { // Increased to 100 restarts for better depth
            const currentTeam: any[] = [...lockedInChamps];
            const usedChamps = new Set<string>(lockedInChamps.map(c => c.key!));

            // Seed bonus: Add a random champion that helps activate an emblem trait
            if (currentTeam.length < teamSize && emblemTraitKeys.length > 0) {
                const targetTrait = emblemTraitKeys[Math.floor(Math.random() * emblemTraitKeys.length)];
                const helpers = champions.filter(c =>
                    !usedChamps.has(c.key!) && c.traits?.some(ct => ct.id === targetTrait)
                );
                if (helpers.length > 0) {
                    const seed = helpers[Math.floor(Math.random() * helpers.length)];
                    currentTeam.push(seed);
                    usedChamps.add(seed.key!);
                }
            }

            // If we have room after locked-in and seed champs, start adding more
            while (currentTeam.length < teamSize) {
                let bestChamp = null;
                let bestScore = -1000000;

                // Candidate pool: mix of random and synergy-based
                const candidates = champions
                    .filter(c => !usedChamps.has(c.key!))
                    .sort(() => 0.5 - Math.random())
                    .slice(0, 25); // Increased search breadth

                for (const candidate of candidates) {
                    const score = calculateTeamScore([...currentTeam, candidate], emblemTraitKeys, traits, mode);
                    // Add a small random factor to encourage exploration (simulating backtracking branches)
                    const stochasticScore = score * (0.9 + Math.random() * 0.2);
                    if (stochasticScore > bestScore) {
                        bestScore = stochasticScore;
                        bestChamp = candidate;
                    }
                }

                if (bestChamp) {
                    currentTeam.push(bestChamp);
                    usedChamps.add(bestChamp.key!);
                } else {
                    break;
                }
            }

            const teamScore = calculateTeamScore(currentTeam, emblemTraitKeys, traits, mode);
            const activeTraits = getActiveTraits(currentTeam, emblemTraitKeys, traits);

            teams.push({
                champions: currentTeam,
                score: teamScore,
                activeTraits,
            });
        }

        // Sort by actual score and take top 10 unique compositions
        return teams
            .sort((a, b) => b.score - a.score)
            .filter((team, index, self) =>
                index === self.findIndex((t) => (
                    t.champions.map((c: any) => c.key).sort().join(",") ===
                    team.champions.map((c: any) => c.key).sort().join(",")
                ))
                && team.score >= 0
            )
            .slice(0, 30);
    },
})

function calculateTeamScore(team: any[], emblemTraitKeys: string[], allTraits: any[], mode: "wide" | "deep" = "wide") {
    const rawTraitCounts: Record<string, number> = {};
    const nativeCounts: Record<string, number> = {};

    // 1. Count native traits from champions
    team.forEach(c => {
        c.traits?.forEach((t: any) => {
            nativeCounts[t.id] = (nativeCounts[t.id] || 0) + 1;
            rawTraitCounts[t.id] = (rawTraitCounts[t.id] || 0) + 1;
        });
    });

    // 2. Add emblems, but only if there's someone to hold them!
    // Rule: A champion cannot hold an emblem for a trait they already have.
    const emblemCounts: Record<string, number> = {};
    emblemTraitKeys.forEach(tk => {
        emblemCounts[tk] = (emblemCounts[tk] || 0) + 1;
    });

    for (const [traitId, count] of Object.entries(emblemCounts)) {
        const native = nativeCounts[traitId] || 0;
        const availableHolders = team.length - native;
        // Total count = native + min(emblems, available holders)
        rawTraitCounts[traitId] = native + Math.min(count, availableHolders);
    }

    let totalScore = 0;

    // 3. Calculate milestone points (excluding Unique traits)
    // AND Check for emblem activation (User requested all emblems must be activated)
    const uniqueEmblemTraitIds = new Set(emblemTraitKeys);

    for (const [traitId, count] of Object.entries(rawTraitCounts)) {
        const traitDef = allTraits.find(t => t.key === traitId);
        if (!traitDef || !traitDef.effects) continue;

        const activeEffects = traitDef.effects.filter((eff: any) => count >= eff.min_units);

        if (activeEffects.length > 0) {
            if (mode === "wide") {
                if (traitDef.unique) {
                    totalScore += 30;
                }
                totalScore += 150;
                totalScore += activeEffects.length * 30;
            } else {
                if (traitDef.unique) {
                    totalScore += 30;
                }
                totalScore += Math.pow(activeEffects.length, 2) * 50;
                totalScore += count * 5;
            }
        } else if (uniqueEmblemTraitIds.has(traitId)) {
            // "Kích hoạt" requirement: Penalty if an emblem trait is not active
            totalScore -= 500;
        }
    }

    // 4. Ryze-Region Synergy Rule
    // If Ryze (TFT16_Ryze) is in team, MUST have at least 4 region traits active
    const hasRyze = team.some(c => c.key === "TFT16_Ryze");
    if (hasRyze) {
        let regionCount = 0;
        for (const [traitId, count] of Object.entries(rawTraitCounts)) {
            const traitDef = allTraits.find(t => t.key === traitId);
            if (traitDef?.isRegion) {
                const activeEffects = traitDef.effects?.filter((eff: any) => count >= eff.min_units) || [];
                if (activeEffects.length > 0) {
                    regionCount++;
                    // Bonus for each region trait when Ryze is present to encourage the synergy
                    totalScore += 100;
                }
            }
        }

        if (regionCount < 4) {
            // Severe penalty if Ryze is present but doesn't have 4 regions
            totalScore -= 3000;
        } else {
            // Milestone bonus for hitting the required 4 regions
            totalScore += 500;
        }
    }

    // 5. Add bonus for champion costs
    team.forEach(c => {
        totalScore += (c.cost || 0) * 2;
    });

    return totalScore;
}

function getActiveTraits(team: any[], emblemTraitKeys: string[], allTraits: any[]) {
    const rawTraitCounts: Record<string, number> = {};
    const nativeCounts: Record<string, number> = {};

    team.forEach(c => {
        c.traits?.forEach((t: any) => {
            nativeCounts[t.id] = (nativeCounts[t.id] || 0) + 1;
            rawTraitCounts[t.id] = (rawTraitCounts[t.id] || 0) + 1;
        });
    });

    const emblemCounts: Record<string, number> = {};
    emblemTraitKeys.forEach(tk => {
        emblemCounts[tk] = (emblemCounts[tk] || 0) + 1;
    });

    for (const [traitId, count] of Object.entries(emblemCounts)) {
        const native = nativeCounts[traitId] || 0;
        const availableHolders = team.length - native;
        rawTraitCounts[traitId] = native + Math.min(count, availableHolders);
    }

    const active = [];
    for (const [traitId, count] of Object.entries(rawTraitCounts)) {
        const traitDef = allTraits.find(t => t.key === traitId);
        if (!traitDef || !traitDef.effects) continue;

        const activeMilestones = traitDef.effects.filter((eff: any) => count >= eff.min_units);

        if (activeMilestones.length > 0 || traitDef.unique) {
            // Milestone tracking
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


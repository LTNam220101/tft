import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { ACTIVE_SET_KEY } from "./gameConfig";

// ACCOUNT-V1 only supports "americas" | "asia" | "europe" (no "sea")
const PLATFORM_TO_ACCOUNT_REGIONAL: Record<string, string> = {
    vn2: "asia", sg2: "asia", ph2: "asia", tw2: "asia", th2: "asia", oc1: "asia",
    kr: "asia", jp1: "asia",
    na1: "americas", br1: "americas", la1: "americas", la2: "americas",
    euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
};

// TFT-MATCH-V1 requires "sea" routing for SEA platforms
const PLATFORM_TO_MATCH_REGIONAL: Record<string, string> = {
    vn2: "sea", sg2: "sea", ph2: "sea", tw2: "sea", th2: "sea", oc1: "sea",
    kr: "asia", jp1: "asia",
    na1: "americas", br1: "americas", la1: "americas", la2: "americas",
    euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
};

type RiotAccount = { puuid: string; gameName: string; tagLine: string };
type RiotSummoner = { profileIconId: number; summonerLevel: number };
type RiotLeagueEntry = {
    queueType: string;
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
};
type RiotMatchUnit = { character_id: string; tier: number; items: Array<number> };
type RiotMatchTrait = { name: string; num_units: number; style: number };
type RiotMatchParticipant = {
    puuid: string;
    placement: number;
    level: number;
    last_round: number;
    total_damage_to_players: number;
    gold_left: number;
    units: Array<RiotMatchUnit>;
    traits: Array<RiotMatchTrait>;
};
type RiotMatch = {
    info: {
        game_datetime: number;
        participants: Array<RiotMatchParticipant>;
    };
};

export interface MatchUnit {
    id: string;
    tier: number;
    cost: number;
    iconPath?: string;
    name?: string;
}

export interface MatchTrait {
    name: string;
    displayName: string;
    style: number;
    numUnits: number;
    iconPath?: string;
}

export interface MatchParticipant {
    puuid: string;
    placement: number;
    level: number;
    goldLeft: number;
    damageDealt: number;
    lastRound: number;
    units: Array<MatchUnit>;
    traits: Array<MatchTrait>;
}

export interface MatchEntry {
    gameDateTime: number;
    player: MatchParticipant;
    participants: Array<MatchParticipant>;
}

export interface PlayerAnalysisResult {
    account: { puuid: string; gameName: string; tagLine: string };
    summoner: { profileIconId: number; summonerLevel: number };
    rankedTFT: {
        tier: string;
        rank: string;
        leaguePoints: number;
        wins: number;
        losses: number;
    } | null;
    recentPlacements: Array<number>;
    stats: {
        games: number;
        avgPlacement: number;
        top4Count: number;
        top4Rate: number;
        winCount: number;
        winRate: number;
        avgLevel: number;
        avgDamage: number;
        avgLastRound: number;
        avgStarLevel: number;
        avgTeamCost: number;
    };
    topUnits: Array<{ id: string; count: number; maxTier: number; iconPath?: string; name?: string }>;
    topTraits: Array<{ count: number; iconPath?: string; displayName?: string }>;
    placementDist: Array<{ place: number; count: number }>;
    matches: Array<MatchEntry>;
}

export const getPlayerAnalysis = action({
    args: {
        gameName: v.string(),
        tagLine: v.string(),
        platform: v.optional(v.string()),
        count: v.optional(v.number()),
    },
    handler: async (ctx, { gameName, tagLine, platform = "vn2", count = 20 }): Promise<PlayerAnalysisResult> => {
        const apiKey = process.env.RIOT_API_KEY;
        if (!apiKey) throw new Error("RIOT_API_KEY not configured");

        const accountRegional = PLATFORM_TO_ACCOUNT_REGIONAL[platform] ?? "asia";
        const matchRegional = PLATFORM_TO_MATCH_REGIONAL[platform] ?? "sea";

        async function riotFetch<T>(url: string): Promise<T> {
            const res = await fetch(url, { headers: { "X-Riot-Token": apiKey! } });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                if (res.status === 404) throw new Error("Player not found");
                if (res.status === 403) throw new Error("Invalid or expired API key");
                if (res.status === 429) throw new Error("Rate limit exceeded. Try again in a moment.");
                throw new Error(`Riot API error ${res.status}: ${body}`);
            }
            return res.json() as Promise<T>;
        }

        const account = await riotFetch<RiotAccount>(
            `https://${accountRegional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
        );

        const [summoner, leagues] = await Promise.all([
            riotFetch<RiotSummoner>(`https://${platform}.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/${account.puuid}`),
            riotFetch<Array<RiotLeagueEntry>>(`https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${account.puuid}`),
        ]);

        const matchIds = await riotFetch<Array<string>>(
            `https://${matchRegional}.api.riotgames.com/tft/match/v1/matches/by-puuid/${account.puuid}/ids?count=${count}&type=ranked`
        );

        const matches = await Promise.all(
            matchIds.map(id =>
                riotFetch<RiotMatch>(`https://${matchRegional}.api.riotgames.com/tft/match/v1/matches/${id}`)
            )
        );

        type ParticipantWithDate = RiotMatchParticipant & { game_datetime: number };
        const playerData: Array<ParticipantWithDate> = matches
            .map(match => {
                const participant = match.info.participants.find(pt => pt.puuid === account.puuid);
                return participant ? { ...participant, game_datetime: match.info.game_datetime } : null;
            })
            .filter((p): p is ParticipantWithDate => p !== null);

        const [champions, traits] = await Promise.all([
            ctx.runQuery(internal.queries.getChampions, { setKey: ACTIVE_SET_KEY }),
            ctx.runQuery(api.queries.getTraits, { setKey: ACTIVE_SET_KEY }),
        ]);

        // Lowercase all keys so Riot API names (e.g. "TFT17_Ahri") match DB keys (e.g. "tft17_ahri")
        const champByKey = new Map(champions.map(c => [(c.key ?? "").toLowerCase(), c]));
        // Map by DB trait key (e.g. "tftset17_arcana") which matches Riot API trait names exactly
        const traitByKey = new Map(traits.map(t => [(t.key ?? "").toLowerCase(), t]));

        const enrichUnit = (unit: RiotMatchUnit): MatchUnit => {
            const champ = champByKey.get(unit.character_id.toLowerCase());
            return { id: unit.character_id, tier: unit.tier, cost: champ?.cost ?? 1, iconPath: champ?.iconPath, name: champ?.name };
        };

        const enrichTrait = (trait: RiotMatchTrait): MatchTrait => {
            const dbTrait = traitByKey.get(trait.name.toLowerCase());
            return { name: trait.name, displayName: dbTrait?.name ?? trait.name, style: trait.style, numUnits: trait.num_units, iconPath: dbTrait?.iconPath };
        };

        const toParticipant = (pt: RiotMatchParticipant): MatchParticipant => ({
            puuid: pt.puuid, placement: pt.placement, level: pt.level,
            goldLeft: pt.gold_left, damageDealt: pt.total_damage_to_players, lastRound: pt.last_round,
            units: pt.units.map(enrichUnit), traits: pt.traits.map(enrichTrait),
        });

        const matchesData: Array<MatchEntry> = matches
            .map(match => {
                const participant = match.info.participants.find(pt => pt.puuid === account.puuid);
                if (!participant) return null;
                return {
                    gameDateTime: match.info.game_datetime,
                    player: toParticipant(participant),
                    participants: [...match.info.participants].sort((a, b) => a.placement - b.placement).map(toParticipant),
                };
            })
            .filter((m): m is MatchEntry => m !== null);

        // Most played units (top 14)
        const unitMap = new Map<string, { count: number; maxTier: number; iconPath?: string; name?: string }>();
        for (const p of playerData) {
            for (const unit of p.units) {
                const key = unit.character_id.toLowerCase();
                const champ = champByKey.get(key);
                if (!unitMap.has(key)) {
                    unitMap.set(key, { count: 0, maxTier: 0, iconPath: champ?.iconPath, name: champ?.name });
                }
                const entry = unitMap.get(key)!;
                entry.count++;
                entry.maxTier = Math.max(entry.maxTier, unit.tier);
            }
        }
        const topUnits = [...unitMap.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 14)
            .map(([id, data]) => ({ id, ...data }));

        // Most played active traits (top 14)
        const traitMap = new Map<string, { count: number; iconPath?: string; displayName?: string }>();
        for (const p of playerData) {
            for (const trait of p.traits) {
                if (trait.style < 1) continue;
                const dbTrait = traitByKey.get(trait.name.toLowerCase());
                if (!traitMap.has(trait.name)) {
                    traitMap.set(trait.name, {
                        count: 0,
                        iconPath: dbTrait?.iconPath,
                        displayName: dbTrait?.name ?? trait.name,
                    });
                }
                traitMap.get(trait.name)!.count++;
            }
        }
        const topTraits = [...traitMap.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 14);

        const total = playerData.length;
        const placements = playerData.map(p => p.placement);

        let starSum = 0, starCount = 0, teamCostSum = 0;
        for (const p of playerData) {
            for (const u of p.units) {
                starSum += u.tier;
                starCount++;
                teamCostSum += champByKey.get(u.character_id.toLowerCase())?.cost ?? 3;
            }
        }

        const ranked = leagues.find(l => l.queueType === "RANKED_TFT");

        return {
            account: { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine },
            summoner: { profileIconId: summoner.profileIconId, summonerLevel: summoner.summonerLevel },
            rankedTFT: ranked
                ? { tier: ranked.tier, rank: ranked.rank, leaguePoints: ranked.leaguePoints, wins: ranked.wins, losses: ranked.losses }
                : null,
            recentPlacements: placements,
            stats: {
                games: total,
                avgPlacement: total > 0 ? placements.reduce((a, b) => a + b, 0) / total : 0,
                top4Count: placements.filter(p => p <= 4).length,
                top4Rate: total > 0 ? placements.filter(p => p <= 4).length / total : 0,
                winCount: placements.filter(p => p === 1).length,
                winRate: total > 0 ? placements.filter(p => p === 1).length / total : 0,
                avgLevel: total > 0 ? playerData.reduce((a, b) => a + b.level, 0) / total : 0,
                avgDamage: total > 0 ? playerData.reduce((a, b) => a + b.total_damage_to_players, 0) / total : 0,
                avgLastRound: total > 0 ? playerData.reduce((a, b) => a + b.last_round, 0) / total : 0,
                avgStarLevel: starCount > 0 ? starSum / starCount : 0,
                avgTeamCost: total > 0 ? teamCostSum / total : 0,
            },
            topUnits,
            topTraits,
            matches: matchesData,
            placementDist: Array.from({ length: 8 }, (_, i) => ({
                place: i + 1,
                count: placements.filter(p => p === i + 1).length,
            })),
        };
    },
});

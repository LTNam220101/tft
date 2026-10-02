import { v } from 'convex/values'
import { action } from './_generated/server'
import { api, internal } from './_generated/api'
import { ACTIVE_SET_KEY } from './gameConfig'
import { callJevSystemOne, type ChoiceAnswer } from './typesafe'

export interface ParsedOptimizerIntent {
  mustHaveChampIds: string[]
  blockedChampIds: string[]
  emblemIds: string[]
  teamSize: number
  mode: 'wide' | 'deep'
  summary: string
  confidence: number
}

export const parseOptimizerPrompt = action({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, { prompt }): Promise<ParsedOptimizerIntent> => {
    const allChampions: any[] = await ctx.runQuery(
      internal.queries.getChampions,
      {
        setKey: ACTIVE_SET_KEY,
      },
    )
    const traits: any[] = await ctx.runQuery(api.queries.getTraits, {
      setKey: ACTIVE_SET_KEY,
    })
    const items: any[] = await ctx.runQuery(internal.queries.getItemsInternal, {
      setKey: ACTIVE_SET_KEY,
    })

    const emblems = items.filter((i: any) => i.isEmblem)
    const normalizedPrompt = prompt.toLowerCase()

    // 1. Candidate matching: Identify mentioned champions and traits in user prompt
    const candidateChamps = allChampions.filter((c: any) => {
      const name = (c.name || '').toLowerCase()
      return normalizedPrompt.includes(name)
    })

    const candidateEmblems = emblems.filter((e: any) => {
      const eName = (e.name || '').toLowerCase().replace(' emblem', '')
      const eTrait = traits.find((t: any) => t.name?.toLowerCase() === eName)
      return (
        normalizedPrompt.includes(eName) ||
        (eTrait && normalizedPrompt.includes(eTrait.name.toLowerCase()))
      )
    })

    // Extract team size numbers from prompt if present (e.g. "level 8", "cấp 9", "8", "size 9")
    let extractedTeamSize: number = 9
    const levelMatch = normalizedPrompt.match(/(?:level|cấp|lv|size)\s*(\d+)/i)
    if (levelMatch) {
      const parsed = parseInt(levelMatch[1], 10)
      if (parsed >= 6 && parsed <= 11) {
        extractedTeamSize = parsed
      }
    } else {
      const singleNumMatch = normalizedPrompt.match(/\b([6-9]|10)\b/)
      if (singleNumMatch) {
        extractedTeamSize = parseInt(singleNumMatch[1], 10)
      }
    }

    // 2. Query TypeSafe AI Jev for intent resolution
    const state = {
      user_prompt: prompt,
      matched_candidate_champions: candidateChamps.map((c: any) => c.name),
      matched_candidate_emblems: candidateEmblems.map((e: any) => e.name),
      detected_team_size: extractedTeamSize,
    }

    const questions = {
      mode: {
        type: 'choice' as const,
        instructions:
          'What optimization strategy does the user want for the TFT team?',
        criteria: {
          deep: 'Focus on vertical synergies, hitting max-tier traits (e.g. 6/8 trait milestones), or playing around a primary carry.',
          wide: 'Focus on horizontal breadth, activating many smaller synergies (e.g. 4+ region traits, flex comps).',
        },
      },
    }

    const jevResponse = await callJevSystemOne(state, questions)
    let selectedMode: 'wide' | 'deep' = 'deep'
    let confidence = 0.85

    if (jevResponse && jevResponse.answers.mode) {
      const ans = jevResponse.answers.mode as ChoiceAnswer
      if (ans.choice === 'wide' || ans.choice === 'deep') {
        selectedMode = ans.choice
        confidence = ans.confidence ?? 0.85
      }
    } else {
      // Heuristic fallback for mode
      if (
        normalizedPrompt.includes('wide') ||
        normalizedPrompt.includes('ngang') ||
        normalizedPrompt.includes('nhiều hệ') ||
        normalizedPrompt.includes('flex')
      ) {
        selectedMode = 'wide'
      }
    }

    const mustHaveChampIds = candidateChamps.map((c: any) => c._id)
    const emblemIds = candidateEmblems.map((e: any) => e.key)

    // Build human-friendly summary
    const summaryParts: string[] = []
    if (candidateChamps.length > 0) {
      summaryParts.push(`Tướng: ${candidateChamps.map((c: any) => c.name).join(', ')}`)
    }
    if (candidateEmblems.length > 0) {
      summaryParts.push(`Ấn: ${candidateEmblems.map((e: any) => e.name).join(', ')}`)
    }
    summaryParts.push(`Cấp: ${extractedTeamSize}`)
    summaryParts.push(`Chiến thuật: ${selectedMode === 'deep' ? 'Sâu (Vertical)' : 'Rộng (Wide flex)'}`)

    return {
      mustHaveChampIds,
      blockedChampIds: [],
      emblemIds,
      teamSize: extractedTeamSize,
      mode: selectedMode,
      summary: summaryParts.join(' | '),
      confidence,
    }
  },
})

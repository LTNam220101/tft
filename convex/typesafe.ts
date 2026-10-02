/**
 * TypeSafe AI (Jev System One) Client for Convex backend.
 *
 * Implements the System One primitives (Choice, Score, Noul) over the HTTP API:
 * POST https://api.typesafe.ai/v1/systemone
 *
 * Docs: https://docs.typesafe.ai/
 */

export interface NoulQuestion {
  type: 'noul'
  instructions: string | Record<string, any>
  criteria?: {
    true?: string
    false?: string
  }
}

export interface ChoiceQuestion {
  type: 'choice'
  instructions: string | Record<string, any>
  criteria: Record<string, string | null | Record<string, any>>
}

export interface ScoreQuestion {
  type: 'score'
  instructions: string | Record<string, any>
  criteria: string[]
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion

export interface NoulAnswer {
  type: 'noul'
  probability: number
}

export interface ChoiceAnswer {
  type: 'choice'
  choice: string
  probabilities: Record<string, number>
  confidence: number
}

export interface ScoreAnswer {
  type: 'score'
  score: number
  probabilities: number[]
  confidence: number
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer

export interface SystemOneResponse {
  model: string
  answers: Record<string, Answer>
}

const TYPESAFE_API_URL = 'https://api.typesafe.ai/v1/systemone'

/**
 * Sends a System One evaluation request to Jev.
 * If TYPESAFE_API_KEY is not configured or request fails, returns null.
 */
export async function callJevSystemOne(
  state: any,
  questions: Record<string, Question>,
  timeoutMs = 8000,
): Promise<SystemOneResponse | null> {
  const apiKey = process.env.TYPESAFE_API_KEY

  if (!apiKey) {
    // API key not set in environment
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(TYPESAFE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn(`[TypeSafe AI] HTTP ${res.status}: ${errText}`)
      return null
    }

    const data = (await res.json()) as SystemOneResponse
    return data
  } catch (err: any) {
    console.warn('[TypeSafe AI] Request failed:', err?.message || err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

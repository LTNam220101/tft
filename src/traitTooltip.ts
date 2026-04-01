/**
 * Riot tfttraits `tooltip_text` + conditional_trait_sets: decode escapes; text **before/after** `<row>`
 * blocks is kept as its own segment; each `<row>` maps to a milestone. Merge innate + reached milestones
 * for out-of-row segments; per-row uses innate + that milestone’s constants. Returns safe HTML per segment.
 */

export type TraitTooltipRow = { html: string; active: boolean }

export type TraitEffectLite = {
  min_units?: number
  max_units?: number
  /** Per-milestone constants from `conditional_trait_sets`; overlay on innate for this row’s tooltip */
  constants?: Array<{ name: string; value: number }>
}

/**
 * Decode JSON-style escapes in raw tooltip (`\u2019`, `\n`, `\"`, …) when the string
 * is still stored as an escaped payload. Plain UTF-8 text passes through (try/catch fallback).
 */
function decodeTooltipDescription(raw: string): string {
  try {
    const escaped = raw
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace('&nbsp;', ' ')
    return JSON.parse(`"${escaped}"`) as string
  } catch {
    return raw
  }
}

/** Inside one `<row>…</row>`: `<br>` → newline, strip other tags. */
function cleanRowInner(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .trim()
}

/** No `<row>` blocks: strip tags and normalize breaks. */
function cleanInnerMarkup(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/<row>|<\/row>/gi, '\n')
    .trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Safe for `dangerouslySetInnerHTML`: escaped text, newlines → `<br />`. */
function plainToTooltipHtml(plain: string): string {
  return escapeHtml(plain).replace(/\n/g, '<br />')
}

/** Replace @MinUnits@ with this row’s milestone (min_units). */
function applyMinUnitsPlaceholder(
  text: string,
  effect: TraitEffectLite | undefined,
): string {
  if (!effect || effect.min_units === undefined) {
    return text.replace(/@MinUnits@/g, '?')
  }
  return text.replace(/@MinUnits@/g, String(effect.min_units))
}

/**
 * %i:scaleArmor% → Armor, %i:scaleAD% → AD; adjacent AD+AP → "AD/AP".
 */
function replaceScaleIconPlaceholders(text: string): string {
  let t = text
  t = t.replace(/%i:scaleAD%%i:scaleAP%/g, 'AD/AP')
  t = t.replace(/%i:scale([A-Za-z][A-Za-z0-9_]*)%/g, (_m, name: string) => name)
  return t
}

/**
 * Fallback when innate constants are missing or unknown tokens remain.
 */
function softenPlaceholders(text: string): string {
  return replaceScaleIconPlaceholders(text)
}

function formatConstValue(v: number): string {
  if (v > 0 && v < 1) {
    return `${Math.round(v * 100)}%`
  }
  if (Number.isInteger(v)) {
    return String(v)
  }
  return String(v)
}

/**
 * Substitute Riot tooltip tokens using `innate_trait_sets` constants (e.g. ADAP, ExecuteHPPercent).
 * Patterns: @Name*num@% , @Name@% , @Name*num@ , @Name@
 */
/** Innate + this milestone’s constants; effect wins on key clash. */
export function mergeInnateAndEffectConstantsForRow(
  innate: Record<string, number> | undefined,
  effectConstants: Array<{ name: string; value: number }> | undefined,
): Record<string, number> | undefined {
  const out: Record<string, number> = { ...(innate ?? {}) }
  for (const c of effectConstants ?? []) {
    if (c?.name != null && typeof c.value === 'number') {
      out[c.name] = c.value
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Innate + `constants` from every milestone with `min_units <= currentCount` (sorted order). */
function mergeConstantsForReachedMilestones(
  innateConstants: Record<string, number> | undefined,
  sorted: TraitEffectLite[],
  currentCount: number,
): Record<string, number> | undefined {
  let merged: Record<string, number> | undefined = innateConstants
  for (const e of sorted) {
    if (e.min_units !== undefined && currentCount >= e.min_units) {
      merged = mergeInnateAndEffectConstantsForRow(merged, e.constants)
    }
  }
  return merged
}

/** Intro / outro outside `<row>…</row>` (same substitution as no-`&lt;row&gt;` fallback). */
function blockOutsideRowsToHtml(
  rawSegment: string,
  merged: Record<string, number> | undefined,
  minUnitsEffect: TraitEffectLite | undefined,
): string {
  let text = cleanInnerMarkup(rawSegment)
  if (!text.trim()) return ''
  text = applyMinUnitsPlaceholder(text, minUnitsEffect)
  return plainToTooltipHtml(substituteInnateConstants(text, merged))
}

function substituteInnateConstants(
  text: string,
  constants: Record<string, number> | undefined,
): string {
  if (!constants || Object.keys(constants).length === 0) {
    return softenPlaceholders(text)
  }

  let t = replaceScaleIconPlaceholders(text)

  t = t.replace('&nbsp;', ' ')

  // @ExecuteHPPercent*100@% → value * 100 + "%"
  t = t.replace(
    /@([A-Za-z][A-Za-z0-9_]*)\*([0-9.]+)%@/g,
    (_match, name: string, multStr: string) => {
      const v = constants[name]
      if (v === undefined) return '…'
      const n = v * parseFloat(multStr)
      const shown =
        Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-6
          ? String(Math.round(n))
          : n.toFixed(1).replace(/\.0$/, '')
      return `${shown}%`
    },
  )

  // @ADAP@% → value (percent-style display via formatConstValue)
  t = t.replace(/@([A-Za-z][A-Za-z0-9_]*)@%/g, (_match, name: string) => {
    const v = constants[name]
    if (v === undefined) return '…'
    return formatConstValue(v)
  })

  // @Name*number@ (no trailing %)
  t = t.replace(
    /@([A-Za-z][A-Za-z0-9_]*)\*([0-9.]+)@/g,
    (_match, name: string, multStr: string) => {
      const v = constants[name]
      if (v === undefined) return '…'
      const n = v * parseFloat(multStr)
      return Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-6
        ? String(Math.round(n))
        : n.toFixed(2).replace(/\.?0+$/, '')
    },
  )

  // Remaining @Name@ (single token)
  t = t.replace(/@([A-Za-z][A-Za-z0-9_]*)@/g, (_match, name: string) => {
    const v = constants[name]
    if (v === undefined) return '…'
    return formatConstValue(v)
  })

  return softenPlaceholders(t)
}

/**
 * One `<row>` per milestone (same order as `effects` sorted by `min_units`).
 * Returns safe HTML per row (`<br />` for line breaks inside a row).
 */
export function buildTraitTooltipRows(
  description: string | undefined,
  effects: TraitEffectLite[] | undefined,
  currentCount: number,
  innateConstants?: Record<string, number>,
): TraitTooltipRow[] {
  if (!description?.trim()) return []

  const decoded = decodeTooltipDescription(description)
  if (!decoded.trim()) return []

  const sorted = [...(effects ?? [])].sort(
    (a, b) => (a.min_units ?? 0) - (b.min_units ?? 0),
  )

  const rowRegex = /<row>([\s\S]*?)<\/row>/gi
  const matches = [...decoded.matchAll(rowRegex)]
  const rowInnerToHtml = (rawInner: string, effect: TraitEffectLite | undefined): string => {
    let text = cleanRowInner(rawInner)
    text = applyMinUnitsPlaceholder(text, effect)
    const merged = mergeInnateAndEffectConstantsForRow(
      innateConstants,
      effect?.constants,
    )
    text = substituteInnateConstants(text, merged)
    return plainToTooltipHtml(text)
  }

  const mergedReached = mergeConstantsForReachedMilestones(
    innateConstants,
    sorted,
    currentCount,
  )
  const reached = [...sorted].reverse().find(
    (e) => e.min_units !== undefined && currentCount >= e.min_units,
  )
  const minUnitsForPlain = reached ?? sorted[0]

  if (matches.length === 0) {
    const html = blockOutsideRowsToHtml(
      decoded,
      mergedReached,
      minUnitsForPlain,
    )
    if (!html) return []
    return [{ html, active: currentCount > 0 }]
  }

  const rows: TraitTooltipRow[] = []
  let lastIndex = 0
  let rowIdx = 0

  for (const m of matches) {
    const idx = (m as RegExpExecArray).index ?? 0
    if (idx > lastIndex) {
      const segment = decoded.slice(lastIndex, idx)
      const html = blockOutsideRowsToHtml(
        segment,
        mergedReached,
        minUnitsForPlain,
      )
      if (html) {
        rows.push({ html, active: true })
      }
    }

    const raw = m[1]
    const effect = sorted[rowIdx]
    const min = effect?.min_units
    const active =
      sorted.length === 0
        ? currentCount > 0
        : min !== undefined && currentCount >= min
    rows.push({ html: rowInnerToHtml(raw, effect), active })
    rowIdx++
    lastIndex = idx + (m[0]?.length ?? 0)
  }

  if (lastIndex < decoded.length) {
    const segment = decoded.slice(lastIndex)
    const html = blockOutsideRowsToHtml(
      segment,
      mergedReached,
      minUnitsForPlain,
    )
    if (html) {
      rows.push({ html, active: true })
    }
  }

  return rows
}

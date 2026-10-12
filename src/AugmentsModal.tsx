import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { ACTIVE_SET_KEY } from '../convex/gameConfig'
import { getImageUrl } from '~/utils'

interface AugmentsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AugmentsModal({ isOpen, onClose }: AugmentsModalProps) {
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const allAugments = useQuery(api.queries.getAugments, { setKey: ACTIVE_SET_KEY }) ?? []

  const filteredAugments = useMemo(() => {
    let list = allAugments
    if (selectedTier !== null) {
      list = list.filter((a) => a.tier === selectedTier)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          (a.name && a.name.toLowerCase().includes(q)) ||
          (a.desc && a.desc.toLowerCase().includes(q))
      )
    }
    return list
  }, [allAugments, selectedTier, search])

  const countTier1 = useMemo(() => allAugments.filter((a) => a.tier === 1).length, [allAugments])
  const countTier2 = useMemo(() => allAugments.filter((a) => a.tier === 2).length, [allAugments])
  const countTier3 = useMemo(() => allAugments.filter((a) => a.tier === 3).length, [allAugments])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-5xl h-[85vh] bg-[#12121a] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#161622]">
          <div className="flex items-center gap-3">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <span>Set 18 Augments</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                  {allAugments.length} Total
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Lõi Công Nghệ: Silver (Tier 1), Gold (Tier 2), Prismatic (Tier 3)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-white/5 bg-[#14141e]">
          {/* Tier buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setSelectedTier(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                selectedTier === null
                  ? 'bg-white/20 border-white/40 text-white shadow-sm'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              All ({allAugments.length})
            </button>
            <button
              onClick={() => setSelectedTier(1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                selectedTier === 1
                  ? 'bg-slate-500/30 border-slate-400 text-slate-200'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              <span>Silver ({countTier1})</span>
            </button>
            <button
              onClick={() => setSelectedTier(2)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                selectedTier === 2
                  ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Gold ({countTier2})</span>
            </button>
            <button
              onClick={() => setSelectedTier(3)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                selectedTier === 3
                  ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
              <span>Prismatic ({countTier3})</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search augments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-400/60 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1.5 text-xs text-gray-400 hover:text-gray-200"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {filteredAugments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <span className="text-3xl mb-2 opacity-40">🔍</span>
              <p className="text-sm text-gray-400">No augments found</p>
              <p className="text-xs text-gray-600 mt-1">Try another search keyword or tier</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredAugments.map((aug) => {
                const tier = aug.tier ?? 2
                const tierStyles =
                  tier === 1
                    ? {
                        border: 'border-slate-500/30 hover:border-slate-400',
                        badge: 'bg-slate-800 text-slate-300 border-slate-600',
                        iconBorder: 'border-slate-400',
                        tierText: 'Silver',
                      }
                    : tier === 3
                    ? {
                        border: 'border-fuchsia-500/30 hover:border-fuchsia-400',
                        badge: 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-800',
                        iconBorder: 'border-fuchsia-400',
                        tierText: 'Prismatic',
                      }
                    : {
                        border: 'border-amber-500/30 hover:border-amber-400',
                        badge: 'bg-amber-950/80 text-amber-300 border-amber-800',
                        iconBorder: 'border-amber-400',
                        tierText: 'Gold',
                      }

                return (
                  <div
                    key={aug._id}
                    className={`bg-[#171724] rounded-xl p-3 border transition-all flex gap-3 hover:bg-[#1a1a2b] ${tierStyles.border}`}
                  >
                    {/* Icon */}
                    <div className="shrink-0">
                      <div
                        className={`w-12 h-12 rounded-lg overflow-hidden border bg-black/40 ${tierStyles.iconBorder}`}
                      >
                        <img
                          src={getImageUrl(aug.iconPath)}
                          alt={aug.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-gray-100 truncate">{aug.name}</h4>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded border font-mono shrink-0 uppercase tracking-tight ${tierStyles.badge}`}
                        >
                          {tierStyles.tierText}
                        </span>
                      </div>

                      <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-4 hover:line-clamp-none transition-all">
                        {aug.desc || 'No description available.'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

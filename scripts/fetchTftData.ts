const VERSION = '16.1.1'
const BASE = `https://ddragon.leagueoflegends.com/cdn/${VERSION}/data/en_US`

async function fetchJson(url: string) {
  const res = await fetch(url)
  return res.json()
}

export async function getFilteredData() {
  const [championsJson, traitsJson, itemsJson] = await Promise.all([
    fetchJson(`${BASE}/tft-champion.json`),
    fetchJson(`${BASE}/tft-trait.json`),
    fetchJson(`${BASE}/tft-item.json`),
  ])

  const champions = Object.entries(championsJson.data)
    .filter(([key]) => key.includes('TFT16_'))
    .map(([key, c]: any) => ({
      key,
      name: c.name,
      tier: c.tier,
      cost: c.cost,
      icon: c.image?.full,
    }))

  const traits = Object.entries(traitsJson.data)
    .filter(([key]) => key.startsWith('TFT16_') && !key.startsWith('TFT16_Teamup_'))
    .map(([key, t]: any) => ({
      key,
      name: t.name,
      icon: t.image?.full,
    }))

  const items = Object.entries(itemsJson.data)
    .filter(([key]) => key.startsWith('TFT16_EmblemItems'))
    .map(([key, i]: any) => ({
      key,
      name: i.name,
      icon: i.image?.full,
    }))

  return { champions, traits, items }
}

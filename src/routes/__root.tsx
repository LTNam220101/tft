import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'
import appCss from '~/styles/app.css?url'
import { SpeedInsights } from '@vercel/speed-insights/react';

// const PLATFORMS = [
//   { value: "vn2", label: "VN" },
//   { value: "na1", label: "NA" },
//   { value: "euw1", label: "EUW" },
//   { value: "kr", label: "KR" },
//   { value: "sg2", label: "SG" },
//   { value: "jp1", label: "JP" },
//   { value: "br1", label: "BR" },
//   { value: "eun1", label: "EUNE" },
// ] as const;

const SITE_URL = 'https://tflext.gnoulman.com'
const SITE_NAME = 'T-Flex-T'
const DEFAULT_DESCRIPTION = 'TFT team composition optimizer and builder for TFT Set 17 — find the best trait synergies, build your own comp, and analyze your match history.'
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: SITE_NAME,
      },
      {
        name: 'description',
        content: DEFAULT_DESCRIPTION,
      },
      {
        name: 'robots',
        content: 'index, follow',
      },
      {
        name: 'theme-color',
        content: '#07070c',
      },
      // Open Graph
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: SITE_NAME },
      { property: 'og:description', content: DEFAULT_DESCRIPTION },
      { property: 'og:image', content: DEFAULT_OG_IMAGE },
      { property: 'og:url', content: SITE_URL },
      // Twitter
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: SITE_NAME },
      { name: 'twitter:description', content: DEFAULT_DESCRIPTION },
      { name: 'twitter:image', content: DEFAULT_OG_IMAGE },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'canonical', href: SITE_URL },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: SITE_URL,
          description: DEFAULT_DESCRIPTION,
        }),
      },
    ],
  }),
  notFoundComponent: () => <div>Route not found</div>,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function NavHeader() {
  // const [searchInput, setSearchInput] = React.useState("");
  // const [platform, setPlatform] = React.useState("vn2");

  // const handleSearch = (e: React.FormEvent) => {
  //   e.preventDefault();
  //   const hashIdx = searchInput.indexOf("#");
  //   if (hashIdx < 1) return;
  //   const name = searchInput.slice(0, hashIdx).trim();
  //   const tag = searchInput.slice(hashIdx + 1).trim();
  //   if (!name || !tag) return;
  //   window.location.href = `/player/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?platform=${encodeURIComponent(platform)}`;
  // };

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#07070c]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link to="/" className="text-xl font-black tracking-tight text-amber-400 shrink-0">
          T-Flex-T
        </Link>
        <nav className="flex items-center gap-1 ml-4">
          <Link
            to="/"
            className="px-3 py-1 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all [&.active]:text-amber-400 [&.active]:bg-amber-500/10"
          >
            Optimizer
          </Link>
          <Link
            to="/builder"
            className="px-3 py-1 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all [&.active]:text-amber-400 [&.active]:bg-amber-500/10"
          >
            Builder
          </Link>
        </nav>
        {/* <form onSubmit={handleSearch} className="ml-auto flex items-center gap-2">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="GnoulMan#VN1"
            className="w-44 rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
          />
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            className="rounded border border-white/10 bg-[#07070c] px-2 py-1.5 text-sm text-gray-300 focus:outline-none"
          >
            {PLATFORMS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-amber-400"
          >
            Search
          </button>
        </form> */}
      </div>
    </header>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <NavHeader />
        {children}
        <Scripts />
      </body>
      <SpeedInsights />
    </html>
  )
}

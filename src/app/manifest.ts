import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zion',
    short_name: 'Zion',
    description: 'Gestion du foyer en famille',
    start_url: '/accueil',
    display: 'standalone',
    background_color: '#0d0d14',
    theme_color: '#ef4444',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}

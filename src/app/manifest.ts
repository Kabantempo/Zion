import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zion — App de Coloc',
    short_name: 'Zion',
    description: 'Gérez votre colocation : tâches, tickets, calendrier, scores et succès.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f0f13',
    theme_color: '#6366f1',
    categories: ['productivity', 'lifestyle'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}

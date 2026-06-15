import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Waheed Restaurant OS',
    short_name: 'Waheed',
    description: 'نظام إدارة مطعم Waheed',
    start_url: '/kanban',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#f59e0b',
    orientation: 'landscape',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}

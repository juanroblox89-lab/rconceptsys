import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RConcept Systems',
    short_name: 'RConcept',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#eceef3',
    theme_color: '#eceef3',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}

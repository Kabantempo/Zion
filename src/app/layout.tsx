import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zion',
  description: 'Gérez votre colocation',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Zion',
  },
}

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}

function ServiceWorkerRegistration() {
  return (
    <Script
      id="sw-register"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(function(){});`,
      }}
    />
  )
}

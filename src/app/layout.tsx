import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

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
  themeColor: '#ef4444',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.svg" />
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
        __html: `
if('serviceWorker'in navigator){
  navigator.serviceWorker.register('/sw.js').then(function(reg){
    reg.update();
  }).catch(function(){});
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    window.location.reload();
  });
}`,
      }}
    />
  )
}

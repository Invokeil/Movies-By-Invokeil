import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  metadataBase: new URL("https://movies.invokeil.cfd"),
  title: {
    default: "Movies by InvokeIL — Discover Movies, TV Series & Anime",
    template: "%s | Movies by InvokeIL",
  },
  description:
    "Browse movies, TV series and anime by genre, cast, release year and rating — with story info, runtimes, cast lists and legal streaming availability on every title page.",
  applicationName: "Movies by InvokeIL",
  authors: [{ name: "InvokeIL" }],
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Movies by InvokeIL — Discover Movies, TV Series & Anime",
    description:
      "Browse movies, TV series and anime by genre, cast, release year and rating — with story info, runtimes and cast lists on every title page.",
    url: "/",
    siteName: "Movies by InvokeIL",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "Movies by InvokeIL — Discover Movies, TV Series & Anime",
    description:
      "Browse movies, TV series and anime by genre, cast, release year and rating.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0b10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Runs before first paint: restores the persisted theme from IndexedDB's
   localStorage mirror (or falls back to system preference), so there is
   never a flash of the wrong theme. IndexedDB isn't sync-readable, so the
   theme is ALSO mirrored into localStorage by the settings loader.      */
const THEME_BOOT = `
(function(){
  try {
    var t = null;
    try { t = localStorage.getItem('il:theme'); } catch (e) {}
    var dark = true;
    try { dark = !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) {}
    if (!t) t = dark ? 'obsidian' : 'arctic-dawn';
    document.documentElement.setAttribute('data-theme', t);
    var light = t === 'arctic-dawn' || t === 'nordic-frost';
    document.documentElement.classList.toggle('dark', !light);
  } catch (e) {}
})();
`;

/* Asset self-heal — kills the classic "refresh breaks the site" failure.
   During a Cloudflare version roll a hashed /_next/ asset can briefly 404
   and (in rare browser-cache cases) stay poisoned. This script:
     1. catches resource errors for /_next/ CSS/JS and reloads once,
     2. after load, verifies the app CSS actually applied (the --rose
        design token only exists in the app stylesheet); if missing →
        one reload.
   A 20 s localStorage guard makes the reload strictly one-shot, so a
   genuinely broken deploy can never loop.                             */
const ASSET_HEAL = `
(function(){
  var KEY='il:asset-heal';
  function healed(){ try{var t=+localStorage.getItem(KEY)||0; if(Date.now()-t<20000) return true; localStorage.setItem(KEY,String(Date.now()));}catch(e){return true;} return false; }
  function heal(){ if(!healed()) location.reload(); }
  window.addEventListener('error',function(e){
    var el=e.target; if(!el||!el.tagName) return;
    var u=(el.src||el.href||'');
    if(u.indexOf('/_next/')!==-1) heal();
  },true);
  window.addEventListener('load',function(){
    setTimeout(function(){
      try{
        var v=getComputedStyle(document.documentElement).getPropertyValue('--rose');
        if(!v||!v.trim()) heal();
      }catch(e){}
    },1500);
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* no-flash theme bootstrap (inline, blocking, <1 KB) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {/* asset self-heal (inline, non-blocking behavior, <1 KB) */}
        <script dangerouslySetInnerHTML={{ __html: ASSET_HEAL }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Display font — gracefully falls back to the system stack if unreachable */}
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "rgba(24,24,32,0.92)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#f4f2f6",
              fontWeight: 600,
            },
          }}
        />
      </body>
    </html>
  );
}

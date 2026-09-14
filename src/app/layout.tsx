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
  themeColor: "#F4ACB7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.7)",
              color: "#44353B",
              fontWeight: 600,
            },
          }}
        />
      </body>
    </html>
  );
}

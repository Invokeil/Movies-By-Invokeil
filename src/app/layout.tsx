import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Movies by invokeil — Discover. Watch. Repeat.",
  description:
    "No-login, privacy-first, local-first movie discovery + streaming interface. Liquid Glass UI, local taste profile, AI-augmented recommendations.",
  keywords: ["movies", "streaming", "TMDB", "glassmorphism", "InvokeIL", "local-first"],
  authors: [{ name: "InvokeIL" }],
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Movies by invokeil",
    description: "Privacy-first movie discovery with a Liquid Glass interface.",
    type: "website",
  },
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

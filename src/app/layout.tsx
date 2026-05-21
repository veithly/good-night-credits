import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Good Night Credits — Sleep better. Earn more AI credits.",
  description:
    "AI Credits Wallet that rewards sleep, movement, rest, and a healthy AI usage rhythm. Stake unused credits, schedule agents while you sleep, wake up richer.",
  applicationName: "Good Night Credits",
  openGraph: {
    title: "Good Night Credits",
    description: "Sleep better. Earn more AI credits.",
    type: "website",
  },
  twitter: {
    title: "Good Night Credits",
    card: "summary_large_image",
    description: "Sleep better. Earn more AI credits.",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

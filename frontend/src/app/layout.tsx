import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PageShell } from "@/components/layout";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Shtab Travel",
  description: "Your travel planning headquarters",
};

/**
 * Viewport configuration.
 *
 * `viewportFit: "cover"` tells the browser the site handles safe-area insets
 * itself (we do, via the CSS variables + `pt-safe-t` / `pb-safe-b` utilities
 * added to `globals.css` and `tailwind.config.ts`). Without it, notched
 * iPhones letterbox the page with white bars on the sides in landscape.
 *
 * `maximumScale: 5` lets accessibility users zoom in. We deliberately do NOT
 * set `userScalable: false` — that's an a11y regression and doesn't solve
 * any real problem on modern devices.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}

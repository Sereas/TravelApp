import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TravelApp",
  description: "Trip planning and in-trip assistance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

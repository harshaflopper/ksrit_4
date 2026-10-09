import type { Metadata, Viewport } from "next";
import { TopBar } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "AnnaSetu",
  description: "Near-expiry packaged food from shops near you, at a price that drops every day.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e6b4e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Hind:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-dvh">
        <TopBar />
        {children}
      </body>
    </html>
  );
}

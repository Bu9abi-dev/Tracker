import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { CurrencyProvider } from "@/components/currency";
import { CURRENCY_COOKIE, THEME_COOKIE, parseCurrency, parseTheme } from "@/lib/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Portfolio", template: "%s · Portfolio" },
  description: "Private investment portfolio dashboard",
  applicationName: "Portfolio",
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: { capable: true, title: "Portfolio", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const currency = parseCurrency(jar.get(CURRENCY_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <body className="min-h-dvh antialiased">
        <CurrencyProvider initial={currency}>{children}</CurrencyProvider>
      </body>
    </html>
  );
}

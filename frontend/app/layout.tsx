import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Two deliberately-chosen Arabic families (not the ubiquitous Cairo/Tajawal
// defaults): a geometric Kufi for headings/display, a highly-legible sans
// for body/UI. See ARCHITECTURE.md #6.
const kufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["500", "700"],
  variable: "--font-kufi",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "منصة التعلم الذكية",
  description: "منصة تعليمية متعددة المستأجرين للمدرسين والمراكز التعليمية والمدارس",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${kufi.variable} ${plexArabic.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

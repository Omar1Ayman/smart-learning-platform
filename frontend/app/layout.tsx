import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "منصة التعلم الذكية",
  description: "منصة تعليمية متعددة المستأجرين للمدرسين والمراكز التعليمية والمدارس",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Runs synchronously in <head> before paint. Reads localStorage's `theme`
 * and applies `.dark` class + `data-theme` attribute to <html>.
 *
 * suppressHydrationWarning on <html> tells React to ignore attribute
 * mismatches on this element (the theme script intentionally adds
 * `data-theme` before hydration).
 */
const THEME_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('theme');
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = stored === 'dark' ? 'dark'
      : stored === 'light' ? 'light'
      : (sys ? 'dark' : 'light');
    if (resolved === 'dark') document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', resolved);
  } catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          {children}
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
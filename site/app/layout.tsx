import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans, Syne } from "next/font/google";
import "./globals.css";
import "./site.css";
import { SiteThemeProvider } from "../components/site/site-theme";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-site-display",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-site-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-site-mono",
  display: "swap",
});

const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var s=localStorage.getItem("rustra-color-scheme");if(s==="dark"){d.classList.add("dark");}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "rustra",
  description:
    "한 Rust 코어 → Node, Bun, Tauri, React Native — 타입 안전 클라이언트와 Frame 바이너리 와이어",
  metadataBase: new URL("https://rustra.ll3.kr"),
  openGraph: {
    title: "rustra",
    description:
      "한 Rust 코어 → Node, Bun, Tauri, React Native — 타입 안전 클라이언트와 Frame 바이너리 와이어",
    url: "https://rustra.ll3.kr",
    siteName: "rustra",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "rustra",
    description:
      "한 Rust 코어 → Node, Bun, Tauri, React Native",
  },
  icons: {
    icon: [{ url: "/brand/mark-r.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${syne.variable} ${publicSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="site-body antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <SiteThemeProvider>{children}</SiteThemeProvider>
      </body>
    </html>
  );
}

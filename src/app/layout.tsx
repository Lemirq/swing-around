import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Link Up at the Party",
  description: "Create a simple shareable party link.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${fraunces.variable}`}>
      <body>
        <div className="site-shell">
          <header className="floating-nav" aria-label="Primary navigation">
            <Link href="/" className="brand-lockup" aria-label="Link Up home">
              <span className="brand-mark">🍍</span>
              <span>Link Up at the Party</span>
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

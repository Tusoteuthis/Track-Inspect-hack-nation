import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppNav } from "@/components/shell/AppNav";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "NSPCT",
  description: "NSPCT: Neural Smart Perception for Critical Tasks. Capture and teach railway sensor-trace expertise.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <DataSourceProvider>
          <div className="app-shell">
            <a href="#main" className="skip-link">
              Skip to main content
            </a>
            <AppNav />
            <main id="main" tabIndex={-1} className="app-main">
              {children}
            </main>
          </div>
        </DataSourceProvider>
      </body>
    </html>
  );
}

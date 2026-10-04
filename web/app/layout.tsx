import type { Metadata } from "next";
import { AppNav } from "@/components/shell/AppNav";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Track Inspect",
  description: "Voice agent for capturing and teaching railway sensor-trace expertise",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
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

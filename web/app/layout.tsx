import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Track Inspect",
  description: "Voice agent for capturing and teaching railway sensor-trace expertise",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cubino",
  description: "Gather in the pride — modern community chat",
  manifest: "/manifest.json",
  themeColor: "#5865f2",
  appleWebApp: { capable: true, title: "Cubino" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

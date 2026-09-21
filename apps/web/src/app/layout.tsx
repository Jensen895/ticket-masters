import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ticket-masters — Every ticket. One search.",
  description: "Compare live ticket prices from trusted marketplaces.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ticket-masters — Compare event prices",
  description: "Compare public ticket prices from six marketplaces on one Ticketmaster venue map.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

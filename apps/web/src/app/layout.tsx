import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ticket-masters — Your event board",
  description: "Find Ticketmaster events and keep their dates, venues, and seat maps in one place.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

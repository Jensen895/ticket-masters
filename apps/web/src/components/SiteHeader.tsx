import { Search } from "lucide-react";
import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`siteHeader ${compact ? "siteHeaderCompact" : ""}`}>
      <div className="headerInner">
        <Logo />
        <nav className="mainNav" aria-label="Primary navigation">
          <Link href="/#my-events">My events</Link>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
        <Link className="headerSearchAction" href="/"><Search size={17} /> Search Ticketmaster</Link>
      </div>
    </header>
  );
}

import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="pageShell footerTop simplifiedFooter">
        <div><Logo inverse /><p>Your Ticketmaster events, organized in one place.</p></div>
        <div><strong>Explore</strong><a href="#my-events">My events</a><a href="#how-it-works">How it works</a></div>
        <div><strong>Data</strong><a href="https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/" target="_blank" rel="noreferrer">Ticketmaster Discovery API</a></div>
      </div>
      <div className="pageShell footerBottom"><span>© 2026 ticket-masters</span><span>Event data provided by Ticketmaster.</span></div>
    </footer>
  );
}

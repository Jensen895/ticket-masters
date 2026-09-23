import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="pageShell footerTop simplifiedFooter">
        <div><Logo inverse /><p>Public ticket prices, compared on one venue map.</p></div>
        <div><strong>Explore</strong><a href="#my-events">My events</a><a href="#how-it-works">How it works</a></div>
        <div><strong>Sources</strong><p>Six public marketplace sites</p></div>
      </div>
      <div className="pageShell footerBottom"><span>© 2026 ticket-masters</span><span>Read-only private-use crawler.</span></div>
    </footer>
  );
}

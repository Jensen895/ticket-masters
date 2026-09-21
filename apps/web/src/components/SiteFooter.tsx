import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="pageShell footerTop">
        <div><Logo inverse /><p>Every ticket. One search.</p></div>
        <div><strong>Explore</strong><a href="#concerts">Concerts</a><a href="#sports">Sports</a><a href="#arts">Arts &amp; Theater</a></div>
        <div><strong>ticket-masters</strong><a href="#about">About us</a><a href="#how">How it works</a><a href="#help">Help center</a></div>
        <div><strong>Legal</strong><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="#accessibility">Accessibility</a></div>
      </div>
      <div className="pageShell footerBottom"><span>© 2026 ticket-masters</span><span>Built for fans, not fees.</span></div>
    </footer>
  );
}

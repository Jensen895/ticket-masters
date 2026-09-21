"use client";

import { ChevronDown, Heart, MapPin, Menu, Search } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const [locationOpen, setLocationOpen] = useState(false);

  return (
    <header className={`siteHeader ${compact ? "siteHeaderCompact" : ""}`}>
      <div className="headerInner">
        <Logo />
        {compact && (
          <label className="headerSearch">
            <Search size={18} aria-hidden="true" />
            <input aria-label="Search events" placeholder="Search artist, team or venue" />
          </label>
        )}
        <nav className="mainNav" aria-label="Primary navigation">
          <a href="#concerts">Concerts</a>
          <a href="#sports">Sports</a>
          <a href="#arts">Arts &amp; Theater</a>
          <a href="#family">Family</a>
        </nav>
        <div className="headerActions">
          <div className="locationControl">
            <button
              className="locationButton"
              type="button"
              aria-expanded={locationOpen}
              onClick={() => setLocationOpen((open) => !open)}
            >
              <MapPin size={17} />
              <span>Los Angeles</span>
              <ChevronDown size={15} />
            </button>
            {locationOpen && (
              <div className="locationPopover">
                <strong>Choose your area</strong>
                <button type="button">Use my current location</button>
                <label>
                  <span>City or ZIP code</span>
                  <input autoFocus placeholder="e.g. 90012" />
                </label>
              </div>
            )}
          </div>
          <button className="iconButton desktopAction" type="button" aria-label="Saved events"><Heart size={19} /></button>
          <button className="iconButton mobileMenu" type="button" aria-label="Open menu"><Menu size={22} /></button>
        </div>
      </div>
    </header>
  );
}

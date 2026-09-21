import Link from "next/link";
import { SearchX } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="notFound">
      <Logo />
      <SearchX size={42} />
      <h1>We couldn’t find that event.</h1>
      <p>It may have ended, moved, or disappeared from the lineup.</p>
      <Link href="/">Browse events</Link>
    </main>
  );
}

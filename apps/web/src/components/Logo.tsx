import Link from "next/link";

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className={`logo ${inverse ? "logoInverse" : ""}`} href="/" aria-label="ticket-masters home">
      <span className="logoMark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>ticket-masters</span>
    </Link>
  );
}

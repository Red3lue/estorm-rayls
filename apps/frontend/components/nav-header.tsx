"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Vault" },
  { href: "/decisions", label: "AI Decisions" },
  { href: "/investor", label: "Investor" },
  { href: "/governance", label: "Governance" },
  { href: "/issuance", label: "Issuance" },
  { href: "/marketplace", label: "Marketplace" },
] as const;

export function NavHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <Image
              src="/bifrost-logo.svg"
              alt=""
              width={32}
              height={32}
              aria-hidden="true"
            />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Bifrost Protocol
              </h1>
              <p className="text-xs text-muted">
                The bridge between private vaults and public markets
              </p>
            </div>
          </div>
          <nav aria-label="Main navigation">
            <ul className="flex gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-accent/10 text-accent"
                          : "text-muted hover:text-foreground hover:bg-surface-raised"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS = [
  {
    label: "Vault Manager",
    items: [
      { href: "/", label: "Vault Overview" },
      { href: "/decisions", label: "AI Decision Log" },
      { href: "/governance", label: "Governance" },
      { href: "/issuance", label: "Issuance" },
    ],
  },
  {
    label: "Investor",
    items: [
      { href: "/investor", label: "Investor Portal" },
      { href: "/marketplace", label: "Marketplace" },
    ],
  },
] as const;

const MANAGER_PATHS = new Set(["/", "/decisions", "/governance", "/issuance"]);

export function NavHeader() {
  const pathname = usePathname();

  function activeGroupLabel(): string | null {
    for (const group of NAV_GROUPS) {
      if (group.items.some((item) => item.href === pathname)) {
        return group.label;
      }
    }
    return null;
  }

  const currentGroup = activeGroupLabel();

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
              {NAV_GROUPS.map((group) => (
                <li key={group.label} className="relative">
                  <NavDropdown
                    group={group}
                    pathname={pathname}
                    isActiveGroup={currentGroup === group.label}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}

function NavDropdown({
  group,
  pathname,
  isActiveGroup,
}: {
  group: (typeof NAV_GROUPS)[number];
  pathname: string;
  isActiveGroup: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          isActiveGroup
            ? "bg-accent/10 text-accent"
            : "text-muted hover:text-foreground hover:bg-surface-raised"
        }`}
      >
        {group.label}
        <span className="ml-1.5 text-[10px]" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute left-0 top-full mt-1 z-50 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href} role="none">
                <Link
                  href={item.href}
                  role="menuitem"
                  className={`block px-4 py-2 text-sm transition-colors ${
                    active
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-foreground hover:bg-surface-raised"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOARD_ROLES } from "@/lib/board/roles";

// Persistent top strip: every board role, one click from anywhere in the
// portal to that role's status. Mirrors the mockup's role switcher.
function shortLabel(title: string): string {
  return title.replace(/ Co-Chairs$/, "").replace(/ Chair$/, "");
}

export function RoleBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const roles = BOARD_ROLES.filter((r) => isAdmin || !r.adminOnly);

  return (
    <div className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-2 overflow-x-auto">
        <Link
          href="/board"
          className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide mr-1 transition-colors ${
            pathname === "/board" ? "text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Board roles
        </Link>
        <span className="text-gray-700 shrink-0">·</span>
        {roles.map((r) => {
          const active = pathname === `/board/${r.key}`;
          return (
            <Link
              key={r.key}
              href={`/board/${r.key}`}
              className={`shrink-0 text-xs px-2.5 py-1 rounded-md transition-colors ${
                active
                  ? "bg-white text-gray-900 font-medium"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {shortLabel(r.title)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

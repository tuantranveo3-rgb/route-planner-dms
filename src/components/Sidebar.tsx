"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, CalendarDays, Database, FileBarChart, Map, MapPinned, Settings, Upload, Users, Workflow } from "lucide-react";
import { demoAccounts, loadCurrentAccount, saveCurrentAccount, type AppRole } from "@/lib/auth";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/outlets", label: "Điểm bán", icon: Database },
  { href: "/clusters", label: "Cụm tuyến", icon: MapPinned },
  { href: "/territories", label: "Phân vùng sale", icon: Users },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/route-map", label: "Bản đồ tuyến", icon: Map },
  { href: "/reports", label: "Báo cáo", icon: FileBarChart },
  { href: "/import-export", label: "Import/Export", icon: Upload },
  { href: "/settings", label: "Cài đặt", icon: Settings },
  { href: "/guide", label: "Hướng dẫn", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<AppRole>("boss");

  useEffect(() => {
    setRole(loadCurrentAccount().id);
  }, []);

  const account = demoAccounts.find((item) => item.id === role) ?? demoAccounts[0];

  return (
    <aside className="border-line bg-white p-4 shadow-soft lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-r">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-white">
          <Workflow size={20} />
        </div>
        <div>
          <div className="text-lg font-bold">Route Planner DMS</div>
          <div className="text-sm text-muted">Tuyến GT/MT theo cụm nhỏ</div>
        </div>
      </div>
      <nav className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                active ? "bg-ink text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-5 rounded-lg border border-line bg-slate-50 p-3">
        <label className="mb-1 block text-xs font-bold uppercase text-muted">Account demo</label>
        <select
          className="h-9 w-full rounded-md border border-line bg-white px-2 text-sm"
          value={role}
          onChange={(event) => {
            const next = event.target.value as AppRole;
            setRole(next);
            saveCurrentAccount(next);
            window.dispatchEvent(new Event("route-planner-account-change"));
          }}
        >
          {demoAccounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <div className="mt-2 text-xs leading-5 text-muted">
          <span className="font-bold text-ink">{account.roleLabel}</span>: {account.description}
        </div>
      </div>
    </aside>
  );
}

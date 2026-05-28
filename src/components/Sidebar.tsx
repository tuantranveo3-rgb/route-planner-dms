"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, CalendarDays, Database, FileBarChart, Map, MapPinned, Settings, Upload, Users, Workflow } from "lucide-react";

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
    </aside>
  );
}

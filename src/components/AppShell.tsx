"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { loadSessionUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    const user = loadSessionUser();
    if (!user && !isLoginPage) {
      router.replace("/login");
      return;
    }
    if (user && isLoginPage) {
      router.replace("/dashboard");
      return;
    }
    setChecked(true);
  }, [isLoginPage, router]);

  if (!checked && !isLoginPage) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Đang kiểm tra đăng nhập...</div>;
  }

  if (isLoginPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
    </div>
  );
}

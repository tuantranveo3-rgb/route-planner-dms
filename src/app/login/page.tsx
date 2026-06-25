"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Workflow } from "lucide-react";
import { login } from "@/lib/auth";

const demoAccounts = [
  { username: "sep", password: "123456", label: "Sếp - toàn quyền" },
  { username: "sua", password: "123456", label: "Người sửa - vận hành" },
  { username: "xem", password: "123456", label: "Người xem - chỉ xem" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("sep");
  const [password, setPassword] = useState("123456");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const result = await login(username, password);
    setLoading(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    window.dispatchEvent(new Event("route-planner-account-change"));
    router.replace("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-xl border border-line bg-white shadow-soft lg:grid-cols-[1fr_1.1fr]">
        <div className="bg-ink p-8 text-white">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
              <Workflow size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold">Route Planner DMS</div>
              <div className="text-sm text-slate-300">Tuyến GT/MT theo cụm nhỏ</div>
            </div>
          </div>
          <h1 className="text-3xl font-bold">Đăng nhập để demo phân quyền</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
            Bản MVP dùng tài khoản lưu trên trình duyệt để phân quyền Sếp, Người sửa và Người xem. Khi lên vận hành thật nên chuyển sang đăng nhập server/database.
          </p>
          <div className="mt-8 grid gap-3 text-sm">
            {demoAccounts.map((account) => (
              <button
                key={account.username}
                className="rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
                onClick={() => {
                  setUsername(account.username);
                  setPassword(account.password);
                  setMessage("");
                }}
              >
                <div className="font-bold">{account.label}</div>
                <div className="text-slate-300">
                  {account.username} / {account.password}
                </div>
              </button>
            ))}
          </div>
        </div>
        <form className="p-8" onSubmit={submit}>
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-ink">
            <Lock size={22} />
          </div>
          <h2 className="text-2xl font-bold text-ink">Đăng nhập</h2>
          <p className="mt-2 text-sm text-muted">Nhập tài khoản đã tạo trong trang User & quyền.</p>

          <label className="mt-6 block text-sm font-bold text-ink">Tài khoản</label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-line px-3 text-sm"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />

          <label className="mt-4 block text-sm font-bold text-ink">Mật khẩu</label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-line px-3 text-sm"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          {message ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{message}</div> : null}

          <button className="mt-6 h-11 w-full rounded-md bg-ink px-4 text-sm font-bold text-white disabled:opacity-60" type="submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Vào app"}
          </button>
        </form>
      </div>
    </div>
  );
}

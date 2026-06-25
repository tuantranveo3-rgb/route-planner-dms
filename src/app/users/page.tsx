"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  canManageUsers,
  createUserAsync,
  deleteUserAsync,
  loadCurrentAccount,
  loadUsers,
  loadUsersAsync,
  resetUsers,
  roleDescriptions,
  roleLabels,
  saveCurrentAccount,
  saveUsers,
  updateUserAsync,
  type AppRole,
  type AppUser,
} from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { loadOutlets } from "@/lib/outlet-storage";
import { seedOutlets } from "@/lib/seed-data";

function makeUserId(name: string) {
  return `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user"}-${Date.now()}`;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("123456");
  const [role, setRole] = useState<AppRole>("viewer");
  const [salePhuTrach, setSalePhuTrach] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsersAsync()
      .then(setUsers)
      .catch((error) => setMessage(error.message));
    setCurrentUser(loadCurrentAccount());
  }, []);

  const saleOptions = useMemo(() => Array.from(new Set(loadOutlets().concat(seedOutlets).map((outlet) => outlet.salePhuTrach))).filter(Boolean).sort(), []);
  const canManage = canManageUsers(currentUser?.role ?? "viewer");

  function persist(next: AppUser[], nextMessage: string) {
    setUsers(next);
    saveUsers(next);
    setMessage(nextMessage);
    window.dispatchEvent(new Event("route-planner-users-change"));
  }

  async function addUser() {
    if (!canManage) return;
    const cleanName = name.trim();
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    if (!cleanName) {
      setMessage("Vui lòng nhập tên user.");
      return;
    }
    if (!cleanUsername || !cleanPassword) {
      setMessage("Vui lòng nhập tài khoản và mật khẩu.");
      return;
    }
    if (users.some((user) => user.username.trim().toLowerCase() === cleanUsername.toLowerCase())) {
      setMessage("Tài khoản đã tồn tại, vui lòng chọn tên khác.");
      return;
    }
    const user: AppUser = {
      id: makeUserId(cleanName),
      username: cleanUsername,
      password: cleanPassword,
      name: cleanName,
      role,
      salePhuTrach: salePhuTrach || undefined,
      active: true,
      description: description.trim() || roleDescriptions[role],
    };
    setLoading(true);
    try {
      const created = await createUserAsync(user);
      persist([...users, created], `Đã tạo user ${cleanName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được user.");
    } finally {
      setLoading(false);
    }
    setName("");
    setUsername("");
    setPassword("123456");
    setSalePhuTrach("");
    setDescription("");
    setRole("viewer");
  }

  async function updateUser(id: string, patch: Partial<AppUser>) {
    if (!canManage) return;
    if (typeof patch.name === "string" && !patch.name.trim()) {
      setMessage("Tên user không được để trống.");
      return;
    }
    if (typeof patch.username === "string") {
      const nextUsername = patch.username.trim().toLowerCase();
      if (!nextUsername) {
        setMessage("Tài khoản không được để trống.");
        return;
      }
      if (users.some((user) => user.id !== id && user.username.trim().toLowerCase() === nextUsername)) {
        setMessage("Tài khoản đã tồn tại.");
        return;
      }
    }
    if (typeof patch.password === "string" && !patch.password.trim()) {
      setMessage("Mật khẩu không được để trống.");
      return;
    }
    const localPatch = { ...patch, description: patch.role && !patch.description ? roleDescriptions[patch.role] : patch.description };
    const next = users.map((user) => (user.id === id ? { ...user, ...patch, description: localPatch.description ?? user.description } : user));
    setUsers(next);
    try {
      await updateUserAsync(id, localPatch);
      setMessage("Đã cập nhật user.");
      window.dispatchEvent(new Event("route-planner-users-change"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không cập nhật được user.");
      loadUsersAsync().then(setUsers).catch(() => setUsers(users));
      return;
    }
    if (currentUser?.id === id) {
      const updated = next.find((user) => user.id === id) ?? null;
      setCurrentUser(updated);
      window.dispatchEvent(new Event("route-planner-account-change"));
    }
  }

  async function deleteUser(id: string) {
    if (!canManage) return;
    if (users.length <= 1) {
      setMessage("Phải giữ lại ít nhất 1 user.");
      return;
    }
    try {
      await deleteUserAsync(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xóa được user.");
      return;
    }
    const next = isSupabaseConfigured ? users.map((user) => (user.id === id ? { ...user, active: false } : user)) : users.filter((user) => user.id !== id);
    persist(next, isSupabaseConfigured ? "Đã khóa user." : "Đã xóa user.");
    if (currentUser?.id === id) {
      saveCurrentAccount(next[0].id);
      setCurrentUser(next[0]);
      window.dispatchEvent(new Event("route-planner-account-change"));
    }
  }

  function resetDefaultUsers() {
    if (!canManage) return;
    if (isSupabaseConfigured) {
      setMessage("Đang dùng Supabase nên không reset user mẫu trên trình duyệt. Hãy chỉnh trực tiếp user trong bảng.");
      return;
    }
    resetUsers();
    const next = loadUsers();
    saveCurrentAccount(next[0].id);
    setUsers(next);
    setCurrentUser(loadCurrentAccount());
    setMessage("Đã khôi phục 3 user mẫu.");
    window.dispatchEvent(new Event("route-planner-users-change"));
    window.dispatchEvent(new Event("route-planner-account-change"));
  }

  return (
    <div>
      <PageHeader
        title="User & phân quyền"
        description="Quản lý tài khoản đăng nhập demo cho MVP. Dữ liệu lưu trên trình duyệt; chưa phải đăng nhập server. Role quyết định quyền sửa/import/cấu hình."
      />

      {!canManage ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          User hiện tại chỉ được xem. Chỉ role Sếp mới được tạo/sửa/xóa user.
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-4 shadow-soft lg:grid-cols-2 xl:grid-cols-[1.1fr_.9fr_.9fr_.8fr_.9fr_1.2fr_auto]">
        <input className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!canManage} placeholder="Tên user" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!canManage} placeholder="Tài khoản đăng nhập" value={username} onChange={(event) => setUsername(event.target.value)} />
        <input className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!canManage} placeholder="Mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} />
        <select className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!canManage} value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
          {(Object.keys(roleLabels) as AppRole[]).map((item) => (
            <option key={item} value={item}>
              {roleLabels[item]}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!canManage} value={salePhuTrach} onChange={(event) => setSalePhuTrach(event.target.value)}>
          <option value="">Không gán sale</option>
          {saleOptions.map((sale) => (
            <option key={sale} value={sale}>
              {sale}
            </option>
          ))}
        </select>
        <input className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!canManage} placeholder="Ghi chú quyền" value={description} onChange={(event) => setDescription(event.target.value)} />
        <button className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-white disabled:opacity-50" disabled={!canManage || loading} onClick={addUser}>
          {loading ? "Đang tạo..." : "Thêm user"}
        </button>
      </div>

      {message ? <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">{message}</div> : null}

      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Tài khoản</th>
              <th className="px-4 py-3">Mật khẩu</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Sale gán</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ghi chú</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <input
                    className="h-9 w-40 rounded-md border border-line px-2 font-bold text-ink disabled:border-transparent disabled:bg-transparent"
                    disabled={!canManage}
                    value={user.name}
                    onChange={(event) => updateUser(user.id, { name: event.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="h-9 w-36 rounded-md border border-line px-2 disabled:bg-slate-50"
                    disabled={!canManage}
                    value={user.username}
                    onChange={(event) => updateUser(user.id, { username: event.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="h-9 w-32 rounded-md border border-line px-2 disabled:bg-slate-50"
                    disabled={!canManage}
                    value={user.password ?? ""}
                    onChange={(event) => updateUser(user.id, { password: event.target.value })}
                  />
                </td>
                <td className="px-4 py-3">
                  <select className="h-9 rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!canManage} value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value as AppRole })}>
                    {(Object.keys(roleLabels) as AppRole[]).map((item) => (
                      <option key={item} value={item}>
                        {roleLabels[item]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select className="h-9 rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!canManage} value={user.salePhuTrach ?? ""} onChange={(event) => updateUser(user.id, { salePhuTrach: event.target.value || undefined })}>
                    <option value="">Không gán</option>
                    {saleOptions.map((sale) => (
                      <option key={sale} value={sale}>
                        {sale}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button className={`rounded-full px-3 py-1 text-xs font-bold ${user.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"}`} disabled={!canManage} onClick={() => updateUser(user.id, { active: !user.active })}>
                    {user.active ? "Đang dùng" : "Đã khóa"}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted">{user.description}</td>
                <td className="px-4 py-3">
                  <button className="rounded-md border border-red-200 px-3 py-1 text-xs font-bold text-red-700 disabled:opacity-50" disabled={!canManage || users.length <= 1} onClick={() => deleteUser(user.id)}>
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink disabled:opacity-50" disabled={!canManage} onClick={resetDefaultUsers}>
          Khôi phục user mẫu
        </button>
        <div className="rounded-md bg-slate-100 px-4 py-2 text-sm text-muted">
          User hiện tại: <span className="font-bold text-ink">{currentUser?.name}</span> · {currentUser ? roleLabels[currentUser.role] : ""}
        </div>
      </div>
    </div>
  );
}

import { isSupabaseConfigured, supabase, usernameToEmail } from "@/lib/supabase";

export type AppRole = "boss" | "editor" | "viewer";

export type AppUser = {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: AppRole;
  salePhuTrach?: string;
  active: boolean;
  description: string;
};

export const USERS_STORAGE_KEY = "route-planner-dms-users-v1";
export const ACCOUNT_STORAGE_KEY = "route-planner-dms-current-user-v1";
export const SESSION_STORAGE_KEY = "route-planner-dms-session-user-v1";
export const PROFILE_STORAGE_KEY = "route-planner-dms-supabase-profile-v1";

export const roleLabels: Record<AppRole, string> = {
  boss: "Sếp",
  editor: "Người sửa",
  viewer: "Người xem",
};

export const roleDescriptions: Record<AppRole, string> = {
  boss: "Toàn quyền: xem báo cáo, import/export, chỉnh cấu hình, cụm, phân vùng và user.",
  editor: "Được sửa vận hành: import, cập nhật thực hiện, chỉnh tuyến/cụm/phân vùng.",
  viewer: "Chỉ xem dashboard, planner, bản đồ và báo cáo; không được chỉnh dữ liệu.",
};

export const seedUsers: AppUser[] = [
  {
    id: "boss-admin",
    username: "sep",
    password: "123456",
    name: "Sếp",
    role: "boss",
    active: true,
    description: roleDescriptions.boss,
  },
  {
    id: "ops-editor",
    username: "sua",
    password: "123456",
    name: "Người sửa",
    role: "editor",
    active: true,
    description: roleDescriptions.editor,
  },
  {
    id: "viewer-demo",
    username: "xem",
    password: "123456",
    name: "Người xem",
    role: "viewer",
    active: true,
    description: roleDescriptions.viewer,
  },
];

function normalizeUsers(users: AppUser[]) {
  const activeUsers = users.length ? users : seedUsers;
  return activeUsers.map((user) => ({
    ...user,
    username: user.username || user.id,
    password: user.password || "123456",
    active: user.active ?? true,
    description: user.description || roleDescriptions[user.role],
  }));
}

export function loadUsers(): AppUser[] {
  if (typeof window === "undefined") return seedUsers;
  const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
  if (!raw) return seedUsers;
  try {
    return normalizeUsers(JSON.parse(raw) as AppUser[]);
  } catch {
    return seedUsers;
  }
}

export function saveUsers(users: AppUser[]) {
  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(normalizeUsers(users)));
}

export function resetUsers() {
  window.localStorage.removeItem(USERS_STORAGE_KEY);
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, seedUsers[0].id);
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getAccount(userId?: string | null) {
  const users = loadUsers();
  return users.find((user) => user.id === userId && user.active) ?? users.find((user) => user.active) ?? seedUsers[0];
}

export function loadCurrentAccount(): AppUser {
  if (typeof window === "undefined") return seedUsers[0];
  const profileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (profileRaw) {
    try {
      return normalizeUsers([JSON.parse(profileRaw) as AppUser])[0];
    } catch {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }
  return getAccount(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? window.localStorage.getItem(ACCOUNT_STORAGE_KEY));
}

export function saveCurrentAccount(userId: string) {
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, userId);
  window.localStorage.setItem(SESSION_STORAGE_KEY, userId);
}

export function loadSessionUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  const profileRaw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (profileRaw) {
    try {
      return normalizeUsers([JSON.parse(profileRaw) as AppUser])[0];
    } catch {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }
  const sessionUserId = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionUserId) return null;
  const user = loadUsers().find((item) => item.id === sessionUserId && item.active);
  return user ?? null;
}

export async function getSupabaseProfile(): Promise<AppUser | null> {
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (!authUser) return null;

  const { data, error } = await supabase.from("user_profiles").select("*").eq("id", authUser.id).maybeSingle();
  if (error || !data || data.active === false) return null;

  const profile: AppUser = {
    id: data.id,
    username: data.username || authUser.email || data.id,
    name: data.name || data.username || authUser.email || "User",
    role: data.role || "viewer",
    salePhuTrach: data.sale_phu_trach || undefined,
    active: data.active ?? true,
    description: data.description || roleDescriptions[data.role as AppRole] || roleDescriptions.viewer,
  };
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, profile.id);
  return profile;
}

export async function loadSessionUserAsync(): Promise<AppUser | null> {
  if (!isSupabaseConfigured || !supabase) return loadSessionUser();
  const profile = await getSupabaseProfile();
  if (profile) return profile;
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  return null;
}

export async function login(username: string, password: string): Promise<{ ok: true; user: AppUser } | { ok: false; message: string }> {
  if (isSupabaseConfigured && supabase) {
    const email = usernameToEmail(username);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { ok: false, message: `Supabase báo: ${error.message}. App đang thử đăng nhập email ${email}.` };
    const profile = await getSupabaseProfile();
    if (!profile) {
      await supabase.auth.signOut();
      return { ok: false, message: "Tài khoản chưa có hồ sơ quyền trong bảng user_profiles." };
    }
    return { ok: true, user: profile };
  }

  const normalizedUsername = username.trim().toLowerCase();
  const user = loadUsers().find((item) => item.active && item.username.trim().toLowerCase() === normalizedUsername);
  if (!user || user.password !== password) {
    return { ok: false, message: "Sai tài khoản hoặc mật khẩu." };
  }
  saveCurrentAccount(user.id);
  return { ok: true, user };
}

export async function logout() {
  if (supabase) await supabase.auth.signOut();
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function canEdit(role: AppRole) {
  return role === "boss" || role === "editor";
}

export function canManageUsers(role: AppRole) {
  return role === "boss";
}

async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function requestUsersApi(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Không gọi được Supabase API.");
  return data;
}

export async function loadUsersAsync(): Promise<AppUser[]> {
  if (!isSupabaseConfigured || !supabase) return loadUsers();
  const data = await requestUsersApi("/api/users");
  return normalizeUsers(data.users as AppUser[]);
}

export async function createUserAsync(user: AppUser): Promise<AppUser> {
  if (!isSupabaseConfigured || !supabase) {
    const next = [...loadUsers(), user];
    saveUsers(next);
    return user;
  }
  const data = await requestUsersApi("/api/users", { method: "POST", body: JSON.stringify(user) });
  return normalizeUsers([data.user as AppUser])[0];
}

export async function updateUserAsync(id: string, patch: Partial<AppUser>): Promise<AppUser> {
  if (!isSupabaseConfigured || !supabase) {
    const next = loadUsers().map((user) => (user.id === id ? { ...user, ...patch } : user));
    saveUsers(next);
    return getAccount(id);
  }
  const data = await requestUsersApi("/api/users", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
  return normalizeUsers([data.user as AppUser])[0];
}

export async function deleteUserAsync(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    saveUsers(loadUsers().filter((user) => user.id !== id));
    return;
  }
  await requestUsersApi(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

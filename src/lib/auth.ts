export type AppRole = "boss" | "editor" | "viewer";

export type AppUser = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: AppRole;
  salePhuTrach?: string;
  active: boolean;
  description: string;
};

export const USERS_STORAGE_KEY = "route-planner-dms-users-v1";
export const ACCOUNT_STORAGE_KEY = "route-planner-dms-current-user-v1";
export const SESSION_STORAGE_KEY = "route-planner-dms-session-user-v1";

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
  return getAccount(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? window.localStorage.getItem(ACCOUNT_STORAGE_KEY));
}

export function saveCurrentAccount(userId: string) {
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, userId);
  window.localStorage.setItem(SESSION_STORAGE_KEY, userId);
}

export function loadSessionUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  const sessionUserId = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionUserId) return null;
  const user = loadUsers().find((item) => item.id === sessionUserId && item.active);
  return user ?? null;
}

export function login(username: string, password: string): { ok: true; user: AppUser } | { ok: false; message: string } {
  const normalizedUsername = username.trim().toLowerCase();
  const user = loadUsers().find((item) => item.active && item.username.trim().toLowerCase() === normalizedUsername);
  if (!user || user.password !== password) {
    return { ok: false, message: "Sai tài khoản hoặc mật khẩu." };
  }
  saveCurrentAccount(user.id);
  return { ok: true, user };
}

export function logout() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function canEdit(role: AppRole) {
  return role === "boss" || role === "editor";
}

export function canManageUsers(role: AppRole) {
  return role === "boss";
}

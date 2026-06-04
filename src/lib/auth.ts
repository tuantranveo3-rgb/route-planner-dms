export type AppRole = "boss" | "editor" | "viewer";

export type DemoAccount = {
  id: AppRole;
  name: string;
  roleLabel: string;
  description: string;
};

export const ACCOUNT_STORAGE_KEY = "route-planner-dms-current-account-v1";

export const demoAccounts: DemoAccount[] = [
  {
    id: "boss",
    name: "Sếp",
    roleLabel: "Toàn quyền",
    description: "Xem mọi báo cáo, chỉnh cấu hình, import/export và phân quyền demo.",
  },
  {
    id: "editor",
    name: "Người sửa",
    roleLabel: "Được sửa",
    description: "Được import, chỉnh tuyến, cập nhật thực hiện và chỉnh cụm.",
  },
  {
    id: "viewer",
    name: "Người xem",
    roleLabel: "Chỉ xem",
    description: "Chỉ xem Dashboard, Planner, Bản đồ và Báo cáo; không chỉnh dữ liệu.",
  },
];

export function getAccount(role?: string | null) {
  return demoAccounts.find((account) => account.id === role) ?? demoAccounts[0];
}

export function loadCurrentAccount(): DemoAccount {
  if (typeof window === "undefined") return demoAccounts[0];
  return getAccount(window.localStorage.getItem(ACCOUNT_STORAGE_KEY));
}

export function saveCurrentAccount(role: AppRole) {
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, role);
}

export function canEdit(role: AppRole) {
  return role === "boss" || role === "editor";
}

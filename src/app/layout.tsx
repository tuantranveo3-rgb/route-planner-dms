import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Route Planner DMS",
  description: "MVP tối ưu tuyến bán hàng GT/MT theo cụm nhỏ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <div className="min-h-screen lg:flex">
          <Sidebar />
          <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

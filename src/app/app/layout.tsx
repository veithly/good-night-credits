import { ReactNode } from "react";
import { SideNav, TopNav } from "@/components/Nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="mx-auto flex w-full max-w-[1400px]">
        <SideNav />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-6 md:px-8 md:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}

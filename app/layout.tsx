import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { RoleBar } from "./_components/RoleBar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Trifecta Portal",
  description: "Member engagement and retention insights for EO chapters.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The role switcher only renders for authenticated users, so the sign-in
  // page stays clean. adminOnly roles are gated to Admin / Exec Director.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: role } = await supabase.rpc("current_user_role");
    isAdmin = role === "Admin" || role === "ExecutiveDirector";
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {user && <RoleBar isAdmin={isAdmin} />}
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Property Copilot — Operations, in focus",
  description: "A calm workspace for property managers and their next best action.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

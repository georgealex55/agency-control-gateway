import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./portal.css";
import "./social.css";
import "./reach-ui-23.css";
import ReachGlobalToolbar from "./reach-global-toolbar";
export const metadata: Metadata = {
  title: "REACH 2.3 | Owner Command Center",
  description: "Owner-first business workspace with protected account connections and verified integration readiness."
};
export default function RootLayout({children}: Readonly<{children:ReactNode}>) {
  return <html lang="en"><body><ReachGlobalToolbar/>{children}</body></html>;
}

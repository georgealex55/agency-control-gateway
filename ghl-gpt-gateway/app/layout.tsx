import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./portal.css";
import "./social.css";
export const metadata: Metadata = {
  title: "Agency Control | Unified Workspace",
  description: "Agency administration, GHL discovery, and modular client services."
};
export default function RootLayout({children}: Readonly<{children:ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}

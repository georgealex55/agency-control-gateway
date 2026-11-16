import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./portal.css";
import "./social.css";
import "./reach-ui-23.css";
export const metadata: Metadata = {
  title: "REACH 2.3 | Owner Command Center",
  description: "Owner-first staging workspace for REACH business operations and integrations."
};
export default function RootLayout({children}: Readonly<{children:ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FLOURISH",
  description: "Your real life is the game. FLOURISH is the progression system.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

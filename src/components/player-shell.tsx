import Link from "next/link";
import { SignOut } from "./auth-controls";
export function PlayerShell({ children }: { children: React.ReactNode }) {
  return <main className="page-shell"><nav className="page-nav" aria-label="Player navigation"><Link href="/home">FLOURISH</Link><Link href="/settings">Settings</Link><SignOut /></nav><section className="panel">{children}</section></main>;
}

import Link from "next/link";
import type { ReactNode } from "react";
import { SignOut } from "./auth-controls";
export function AdminShell({ children }: { children: ReactNode }) { return <div className="admin-frame"><header className="admin-header"><nav className="admin-nav" aria-label="Administrator"><Link className="brand" href="/admin"><span className="brand-mark">F</span> FLOURISH <span className="admin-label">Admin</span></Link><div className="nav-links"><Link href="/admin">Quest library</Link><Link href="/home">Player view</Link><SignOut /></div></nav></header><main className="admin-shell">{children}</main></div>; }

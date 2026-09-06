import Link from "next/link";
export default function NotAuthorized() {
  return <main className="page-shell narrow"><section className="panel"><h1>Not authorized</h1><p>This page requires administrator access.</p><Link href="/home">Return to FLOURISH</Link></section></main>;
}

import { AdminLibrary } from "@/components/admin-library";
import { AdminShell } from "@/components/admin-shell";
import { getDb } from "@/lib/db";
import { adminReferenceData } from "@/modules/admin/service";
import { pageUser } from "@/modules/auth/session";
export const dynamic="force-dynamic";
export default async function Admin(){await pageUser("admin");const refs=await adminReferenceData(getDb());return <AdminShell><AdminLibrary skills={refs.skills.map(({code,name})=>({code,name}))} families={refs.families.map(({id,name})=>({id,name}))}/></AdminShell>}

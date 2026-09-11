import {ownerResult} from "@/lib/owner-api";
import {replaceGrants} from "@/lib/owner-manage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function PUT(request:Request,context:{params:Promise<{id:string}>}){return ownerResult(async()=>replaceGrants(request,(await context.params).id));}

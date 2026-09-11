import {inviteOwner} from "@/lib/owner-api";
import {ownerResult} from "@/lib/owner-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return ownerResult(async()=>inviteOwner(request,(await context.params).id));}

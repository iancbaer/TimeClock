import {ownerResult} from "@/lib/owner-api";
import {patchContact} from "@/lib/owner-manage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return ownerResult(async()=>patchContact(request,(await context.params).id));}

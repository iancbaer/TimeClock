import {listOwnerStatements} from "@/lib/owner-statements";
import {ownerResult} from "@/lib/owner-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return ownerResult(()=>listOwnerStatements(request));}

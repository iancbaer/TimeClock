import {listManagedStatements} from "@/lib/owner-manage";
import {ownerResult} from "@/lib/owner-api";
import {uploadStatement} from "@/lib/owner-manage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return ownerResult(()=>listManagedStatements(request));}
export async function POST(request:Request){return ownerResult(()=>uploadStatement(request));}

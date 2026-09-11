import {manageContacts} from "@/lib/owner-manage";
import {ownerResult} from "@/lib/owner-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){return ownerResult(()=>manageContacts(request));}
export async function POST(request:Request){return ownerResult(()=>manageContacts(request));}

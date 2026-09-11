import {downloadOwnerStatement} from '@/lib/owner-statements';
import {ownerResult} from '@/lib/owner-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){return ownerResult(async()=>downloadOwnerStatement((await context.params).id));}

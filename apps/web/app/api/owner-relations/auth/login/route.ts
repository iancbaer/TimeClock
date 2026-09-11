import {ownerAuthAction,ownerResult} from '@/lib/owner-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return ownerResult(()=>ownerAuthAction(request,'login'));}

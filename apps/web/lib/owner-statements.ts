import {prisma} from './db';
import {requireAdmin} from './auth';
import {requireOwner} from './owner-auth';
import {HttpError} from './http';
export function ownerPage(request:Request) {
 const url=new URL(request.url); const offset=Number(url.searchParams.get('offset')??0);const limit=Number(url.searchParams.get('limit')??100);
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'Invalid pagination.');
 return {offset,limit};
}
export async function listOwnerStatements(request:Request) {
 const owner=await requireOwner(); const {offset,limit}=ownerPage(request);
 const rows=await prisma.ownerStatement.findMany({where:{scope:{grants:{some:{contactId:owner.id}}}},include:{scope:{select:{id:true,name:true,kind:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:offset,take:limit+1});
 return {statements:rows.slice(0,limit),owner:{name:owner.name},pagination:{offset,limit,hasMore:rows.length>limit}};
}
export async function downloadOwnerStatement(id:string) {
 let global=false;
 try {await requireAdmin({allowedRoles:[]});global=true;}catch(error){if(!(error && typeof error==='object' && 'status' in error && (error.status===401||error.status===403)))throw error;}
 const owner=global?null:await requireOwner();
 const row=await prisma.ownerStatement.findFirst({where:{id,...(owner?{scope:{grants:{some:{contactId:owner.id}}}}:{})},include:{document:true}});
 if(!row?.document)throw new HttpError(404,'Statement not found.');
 return new Response(new Uint8Array(row.document.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox"}});
}

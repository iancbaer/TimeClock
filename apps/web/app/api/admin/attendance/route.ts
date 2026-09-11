import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {errorResponse} from '@/lib/http';
import {recordAttendance,voidAttendance} from '@/lib/scheduling';
export async function POST(request:Request) {
  try {
    const admin=await requireAdmin();
    const body=await request.json();
    return NextResponse.json({record:await (body.action==='VOID'?voidAttendance(admin.id,body):recordAttendance(admin.id,body))});
  } catch(error) {return errorResponse(error);}
}

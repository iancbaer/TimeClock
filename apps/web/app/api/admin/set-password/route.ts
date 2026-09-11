import { NextResponse } from 'next/server';
import { z } from 'zod';
import { completeAccountLink, takeEmailLimit } from '@/lib/account-links';
import { clearAdminSession } from '@/lib/auth';
import { errorResponse, HttpError } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!await takeEmailLimit('consume-ip',ip,15,15*60000)) throw new HttpError(429,'Please wait before trying another link.');
    const data = z.object({token:z.string().length(43),password:z.string().min(12).max(200)}).parse(await request.json());
    await completeAccountLink(data.token,data.password);
    await clearAdminSession();
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}

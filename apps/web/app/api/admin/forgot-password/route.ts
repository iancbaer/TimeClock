import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { emailConfiguration } from '@/lib/account-email';
import { issueAccountLink, takeEmailLimit } from '@/lib/account-links';
import { errorResponse, HttpError } from '@/lib/http';

export async function POST(request: Request) {
  try {
    emailConfiguration();
    const {email} = z.object({email:z.email().max(254).transform(v=>v.trim().toLowerCase())}).parse(await request.json());
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!await takeEmailLimit('reset-ip',ip,10,15*60000)) throw new HttpError(429,'Please wait before requesting another link.');
    // Same response and foreground work for registered and unregistered addresses.
    after(async () => {
      try {
        if (!await takeEmailLimit('reset-email',email,3,60*60000)) return;
        const admin = await prisma.adminUser.findUnique({where:{email}});
        if (admin?.active) await issueAccountLink(admin.id,email,false);
      } catch { console.error('ACCOUNT_RESET_EMAIL_FAILED'); }
    });
    return NextResponse.json({message:'If this email belongs to an active account, a password-reset link will arrive shortly.'},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return errorResponse(error); }
}

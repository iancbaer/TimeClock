import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { emailConfiguration } from '@/lib/account-email';
import { issueAccountLink, takeEmailLimit } from '@/lib/account-links';
import { errorResponse, HttpError } from '@/lib/http';

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    emailConfiguration();
    const input = z.object({name:z.string().trim().min(2).max(120),email:z.email().max(254).transform(v=>v.trim().toLowerCase())}).parse(await request.json());
    if (!await takeEmailLimit('invite-actor',actor.id,15,60*60000) || !await takeEmailLimit('invite-email',input.email,3,60*60000)) throw new HttpError(429,'Please wait before sending another invitation.');
    const passwordHash = await hash(randomBytes(32).toString('base64url'),12);
    const user = await prisma.adminUser.upsert({where:{email:input.email},update:{},create:{...input,role:'ADMIN',passwordHash,mustChangePassword:true}});
    if (!user.active || !user.mustChangePassword) throw new HttpError(409,'This account already exists. Active users can use Forgot password.');
    await issueAccountLink(user.id,user.email,true,actor.id);
    return NextResponse.json({message:'Invitation sent. The recipient has 48 hours to choose a password.'},{status:201});
  } catch(error) {return errorResponse(error);}
}

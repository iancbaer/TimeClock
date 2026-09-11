const ORIGIN = 'https://timeclock.whichmore.com';
const PUBLIC = 'https://sdsoperations.com';
async function accountEmail(request, env) {
  if (request.method !== 'POST') return new Response('Not found', {status:404});
  if (!env.TIMECLOCK_EMAIL_RELAY_KEY || !env.EMAIL) return new Response('Email unavailable', {status:503});
  const provided = request.headers.get('authorization') || '';
  const expected = `Bearer ${env.TIMECLOCK_EMAIL_RELAY_KEY}`;
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a,b] = await Promise.all([digest(provided),digest(expected)]);
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  if (difference) return new Response('Forbidden',{status:403});
  try {
    const body = await request.text();
    if (body.length > 2048) return new Response('Too large',{status:413});
    const {email,token,invitation,id,application = 'timeclock'} = JSON.parse(body);
    if (!['timeclock', 'owner-relations'].includes(application)) return new Response('Invalid application',{status:400});
    if (typeof email !== 'string' || email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
        typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || typeof invitation !== 'boolean' ||
        typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return new Response('Invalid request',{status:400});
    const owner = application === 'owner-relations';
    const link = `${PUBLIC}/${owner ? 'owner-relations' : 'admin'}/set-password#token=${token}`;
    const subject = owner
      ? (invitation ? 'Your invitation to SDS Owner Relations' : 'Reset your SDS Owner Relations password')
      : (invitation ? 'Your invitation to SDS Operations TimeClock' : 'Reset your SDS Operations password');
    const text = owner
      ? (invitation
        ? `You have been invited to SDS Owner Relations, your private financial statement portal.\n\nChoose your password:\n${link}\n\nSign-in email: ${email}\nThis invitation expires in 48 hours and can be used once. You can view only the entities and properties shared with you. This account does not provide TimeClock access.\n\nIf you did not expect this invitation, contact Ian Baer.`
        : `A password reset was requested for your SDS Owner Relations account.\n\nChoose a new password:\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email; your password has not changed.`)
      : invitation
      ? `You have been invited to administer SDS Operations TimeClock.\n\nChoose your password:\n${link}\n\nSign-in email: ${email}\nThis invitation expires in 48 hours and can be used once. Your account provides full TimeClock administration, including scheduling and employee records.\n\nIf you did not expect this invitation, contact Ian Baer.`
      : `A password reset was requested for your SDS Operations TimeClock account.\n\nChoose a new password:\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email; your password has not changed.`;
    const result = await env.EMAIL.send({from:{email:'accounts@sdsoperations.com',name:'SDS Operations'},to:email,replyTo:'ian@sdsrealty.com',subject,text:`${text}\n\nSDS Operations\n${PUBLIC}`});
    return Response.json({accepted:true,messageId:result.messageId},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'EMAIL_PROVIDER_ERROR';
    console.error('ACCOUNT_EMAIL_PROVIDER_FAILURE', code);
    return new Response(code,{status:502});
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:') return Response.redirect(PUBLIC + url.pathname + url.search, 308);
    if (url.pathname === '/_account-email') return accountEmail(request, env);
    if (url.pathname === '/') return Response.redirect(PUBLIC + '/admin/login', 302);
    const ownerPath = ['/owner-relations', '/api/owner-relations'].some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix + '/'));
    const allowed = ownerPath || url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/_next/') || ['/favicon.ico', '/api/health'].includes(url.pathname);
    if (!allowed) return new Response('Not found', {status:404});
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if ((origin && origin !== PUBLIC) || request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', {status:403});
    }
    const target = new URL(url.pathname + url.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-timeclock-device-key', env.TIMECLOCK_ORIGIN_KEY);
    headers.delete('forwarded');
    headers.delete('x-real-ip');
    headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') || 'unknown');
    headers.set('x-forwarded-host', 'sdsoperations.com');
    headers.set('x-forwarded-proto', 'https');
    const upstream = await fetch(new Request(target, {method:request.method, headers, body:['GET','HEAD'].includes(request.method)?undefined:request.body, redirect:'manual'}), {cf:{cacheTtl:0,cacheEverything:false}});
    const response = new Response(upstream.body, upstream);
    const location = response.headers.get('location');
    if (location && new URL(location, ORIGIN).origin === ORIGIN) {
      const redirect = new URL(location, ORIGIN);
      response.headers.set('location', PUBLIC + redirect.pathname + redirect.search + redirect.hash);
    }
    response.headers.set('Cache-Control','no-store');
    response.headers.set('Strict-Transport-Security','max-age=31536000');
    response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('X-Frame-Options','DENY');
    response.headers.set('Referrer-Policy','same-origin');
    return response;
  }
};

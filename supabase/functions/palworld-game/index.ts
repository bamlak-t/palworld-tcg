/**
 * palworld-game: online play for the Palworld TCG web app.
 *
 * POST JSON { op: 'create' | 'join' | 'view' | 'action' | 'leave', ... } (see @pal/server).
 * Players are identified by the seat token they got when joining; there are no accounts.
 * After any change it broadcasts { version } on Realtime channel "palworld:<code>", and
 * clients then fetch their own redacted view, so a forged broadcast can't show anyone a
 * fake game state.
 *
 * Build and deploy with: npm run deploy:function
 */
import postgres from 'postgres';
import { handle, type Request } from '@pal/server';
import { pgStore } from './pg-store.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });
const store = pgStore(sql);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function broadcast(code: string, version: number) {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `palworld:${code}`, event: 'version', payload: { version } }] }),
    });
  } catch (e) {
    // Clients also poll, so a missed ping only delays an update.
    console.error('broadcast failed', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body: Request;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400, headers: CORS });
  }

  try {
    const res = await handle(body, { store, broadcast, random: Math.random });
    return Response.json(res.body, { status: res.status, headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Something went wrong.' }, { status: 500, headers: CORS });
  }
});

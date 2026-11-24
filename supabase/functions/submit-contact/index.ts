// Supabase Edge Function: Validated Contact Submission + Optional Email Notification
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();

    if (!name || !email.includes('@') || !subject || message.length < 10) {
      return new Response(JSON.stringify({ error: 'Please complete all required fields.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await supabase.from('contacts').insert({
      name,
      email,
      phone,
      subject,
      message,
      status: 'new',
      email_sent: false,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        emailSent: false,
        message: 'Inquiry saved in database. Configure RESEND_API_KEY or SMTP in production to dispatch email notifications to maheepmedia@gmail.com.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

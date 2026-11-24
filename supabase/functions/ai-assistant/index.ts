// Supabase Edge Function: Provider-Independent AI News Assistant
// Uses server-side environment variables only (AI_API_KEY / GEMINI_API_KEY)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('AI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server AI API key is not configured.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, title, content, language } = await req.json();
    const systemPrompt =
      'You are an editorial assistant for Maheep News Portal (India). Never invent quotes, statistics, or sources. Preserve factual accuracy strictly.';

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: `Task: ${action}\nLanguage: ${language || 'en'}\nTitle: ${title}\nBody: ${content}` }],
          },
        ],
      }),
    });

    const data = await upstream.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

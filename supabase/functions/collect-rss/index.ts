// Supabase Edge Function: Automated RSS & Atom Collection Engine
// Deploy with: supabase functions deploy collect-rss
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) + '-' + Date.now().toString(36);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settingsRows } = await supabase.from('site_settings').select('setting_key, setting_value');
    const settings = Object.fromEntries((settingsRows || []).map((r) => [r.setting_key, r.setting_value]));
    const mode = settings.publishing_mode || 'manual_approval';
    const targetStatus = mode === 'manual_approval' ? 'pending' : 'published';

    const { data: sources } = await supabase.from('rss_sources').select('*').eq('enabled', true);
    const parser = new XMLParser({ ignoreAttributes: false });
    const results = [];

    for (const source of sources || []) {
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      let errorMsg = '';

      try {
        const res = await fetch(source.feed_url, {
          headers: { 'User-Agent': 'MaheepNewsPortalBot/1.0' },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const parsed = parser.parse(xml);
        const rawItems = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        const items = Array.isArray(rawItems) ? rawItems : [rawItems];

        for (const item of items.slice(0, 15)) {
          const title = String(item.title?.['#text'] || item.title || '').trim();
          const link = String(item.link?.['@_href'] || item.link || '').trim();
          if (!title || !link) {
            failed++;
            continue;
          }

          const { data: existing } = await supabase
            .from('articles')
            .select('id')
            .eq('source_url', link)
            .maybeSingle();

          if (existing) {
            skipped++;
            continue;
          }

          const rawSummary = String(item.description || item.summary?.['#text'] || item.summary || title)
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 320);

          const { error } = await supabase.from('articles').insert({
            title,
            slug: slugify(title),
            summary: rawSummary || title,
            content: `${rawSummary}\n\nRead the full report at the original publisher.`,
            source_name: source.name,
            source_url: link,
            author: source.name,
            language: source.language,
            category_id: source.category_id,
            status: targetStatus,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          });

          if (error) failed++;
          else imported++;
        }

        await supabase
          .from('rss_sources')
          .update({ last_fetched_at: new Date().toISOString(), last_error: '' })
          .eq('id', source.id);
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : 'Fetch error';
        failed++;
        await supabase
          .from('rss_sources')
          .update({ last_fetched_at: new Date().toISOString(), last_error: errorMsg })
          .eq('id', source.id);
      }

      await supabase.from('rss_import_logs').insert({
        source_id: source.id,
        status: errorMsg ? 'failed' : 'success',
        imported,
        skipped,
        failed,
        message: errorMsg || `Imported ${imported}, skipped ${skipped}`,
      });

      results.push({ source: source.name, imported, skipped, failed, error: errorMsg });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

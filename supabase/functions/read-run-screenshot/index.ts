import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Reads a screenshot of an Apple Exercice run summary and returns the numbers as JSON.
// Requires the secret ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PROMPT = `Cette image est une capture d'écran du résumé d'une séance de course (app Exercice / Fitness d'Apple, en français ou en anglais).
Extrais les valeurs visibles et réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"done_at":"AAAA-MM-JJTHH:MM" ou null,"distance_km":nombre ou null,"duration_s":nombre de secondes ou null,"avg_hr":nombre ou null,"calories":nombre ou null,"avg_pace":"m:ss" par km ou null}
Règles : la virgule décimale est française (5,02 => 5.02). Si une valeur n'est pas visible, mets null, n'invente rien. Les miles sont convertis en km.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "missing_key" }, 501);
  let body: { image?: string; media_type?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  if (!body.image) return json({ error: "no_image" }, 400);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 400,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: body.media_type || "image/jpeg", data: body.image } },
        { type: "text", text: PROMPT },
      ] }],
    }),
  });
  if (!r.ok) return json({ error: "upstream", status: r.status, detail: (await r.text()).slice(0, 300) }, 502);
  const out = await r.json();
  const text = (out.content || []).map((c: { text?: string }) => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return json({ error: "unreadable" }, 422);
  try { return json({ result: JSON.parse(m[0]) }); } catch { return json({ error: "unreadable" }, 422); }
});

// Vercel serverless function: sends a push notification to your partner.
// Needs two secret environment variables set in Vercel (never commit them):
//   SUPABASE_SERVICE_ROLE_KEY  (Supabase → Project Settings → API Keys → service_role / secret)
//   VAPID_PRIVATE_KEY          (from the setup file Claude gave you)
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, VAPID_PUBLIC_KEY } from "../src/config.js";

const MESSAGES = {
  checkin: (n, x) => ({ title: `${n} showed up 💪`, body: x.activity ? `${x.activity}. Go see the pic.` : "Go see the pic." }),
  promise: (n) => ({ title: `${n} sent a pinky promise 🤙`, body: "They say they worked out. Does it count?" }),
  nudge: (n) => ({ title: `${n} is side-eyeing you 👀`, body: "Go move a little?" }),
  comment: (n, x) => ({ title: `${n} commented`, body: (x.text || "").slice(0, 120) }),
  like: (n) => ({ title: `${n} liked your check-in 🤎`, body: "" }),
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!SUPABASE_SERVICE_ROLE_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "Notifications aren't set up yet (missing Vercel environment variables)." });
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Not signed in" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Not signed in" });
  const me = userData.user.id;

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const make = MESSAGES[body.type];
  if (!make) return res.status(400).json({ error: "Unknown notification type" });

  const { data: myProfile } = await admin.from("profiles").select("name, couple_id").eq("id", me).single();
  if (!myProfile?.couple_id) return res.status(200).json({ sent: 0 });

  const { data: partners } = await admin.from("profiles").select("id").eq("couple_id", myProfile.couple_id).neq("id", me);
  const ids = (partners || []).map((p) => p.id);
  if (!ids.length) return res.status(200).json({ sent: 0 });

  const { data: subs } = await admin.from("push_subscriptions").select("id, subscription").in("user_id", ids);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const msg = make(myProfile.name || "Your buddy", body);
  const payload = JSON.stringify({ ...msg, tag: body.type, url: "/" });
  let sent = 0;
  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, payload);
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
  return res.status(200).json({ sent });
}

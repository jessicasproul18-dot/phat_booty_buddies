import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, configured, notify, enablePush, pushIsOn, isInstalled } from "./supabase.js";
import { DAY_LETTERS, dayKey, fromKey, monday, addDays, fmtMD, ago, daysDone, streak, compressPhoto } from "./dates.js";

const ACTIVITIES = ["Gym", "Run", "Walk", "Yoga", "Pilates", "Class", "Bike", "At home", "Other"];

/* ───────────────────────── small pieces ───────────────────────── */
function useToast() {
  const [msg, setMsg] = useState("");
  const t = useRef();
  const show = useCallback((m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(""), 2400); }, []);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [show, node];
}

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-h"><h2>{title}</h2><button className="close" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

function Stepper({ value, onChange, min, max, label }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output>{value}</output>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

function Logo() {
  return <h1 className="logo">Phat Booty <span>Buddies</span></h1>;
}

/* ───────────────────────── screens ───────────────────────── */
function NotConfigured() {
  return (
    <div className="wrap center">
      <Logo />
      <div className="notice">Almost there. Paste your Supabase Project URL and anon key into <b>src/config.js</b>.</div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = mode === "signup"
      ? await supabase.auth.signUp({ email, password: pw, options: { data: { name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (res.error) setErr(res.error.message);
    else if (mode === "signup" && !res.data.session) setErr("Check your email to confirm, then sign in. (Or turn off “Confirm email” in Supabase.)");
  }

  return (
    <div className="wrap center">
      <Logo />
      <p className="tagline">Show up together. Snap a pic, keep your streak, and whoever slacks buys dinner.</p>
      <form className="card form" onSubmit={submit}>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>New here</button>
          <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
        </div>
        {mode === "signup" && (
          <div className="field"><label htmlFor="name">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={24} autoComplete="given-name" /></div>
        )}
        <div className="field"><label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
        <div className="field"><label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>
        {err && <p className="err">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}</button>
      </form>
    </div>
  );
}

function PairScreen({ onPaired }) {
  const [code, setCode] = useState("");
  const [mine, setMine] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("create_couple");
    setBusy(false);
    if (error) setErr(error.message); else { setMine(data); onPaired(); }
  }
  async function join(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("join_couple", { join_code: code });
    setBusy(false);
    if (error) setErr(error.message); else onPaired();
  }

  return (
    <div className="wrap center">
      <Logo />
      <div className="card form">
        <h3>Pair up with your buddy</h3>
        <p className="muted">One of you starts a pair and shares the code. The other joins with it.</p>
        <button className="primary" onClick={start} disabled={busy}>Start a pair</button>
        {mine && <p className="code">{mine}</p>}
      </div>
      <form className="card form" onSubmit={join}>
        <div className="field"><label htmlFor="code">Got a code?</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="A1B2C3"
            maxLength={6} autoCapitalize="characters" required /></div>
        <button className="secondary" disabled={busy}>Join pair</button>
      </form>
      {err && <p className="err">{err}</p>}
      <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}

/* ───────────────────────── main app ───────────────────────── */
export default function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMe = useCallback(async () => {
    if (!session) { setMe(null); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    setMe(data || { id: session.user.id, couple_id: null });
  }, [session]);
  useEffect(() => { loadMe(); }, [loadMe]);

  if (!configured) return <NotConfigured />;
  if (session === undefined || (session && !me)) return <div className="wrap center"><Logo /><p className="muted">Loading…</p></div>;
  if (!session) return <AuthScreen />;
  if (!me.couple_id) return <PairScreen onPaired={loadMe} />;
  return <Home uid={session.user.id} coupleId={me.couple_id} />;
}

function Home({ uid, coupleId }) {
  const [toast, toastNode] = useToast();
  const [couple, setCouple] = useState(null);
  const [people, setPeople] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [nudge, setNudge] = useState(null);
  const [photos, setPhotos] = useState({});
  const [sheet, setSheet] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const since = dayKey(addDays(monday(new Date()), -7 * 26));
    const [c, p, ch, l, cm, n] = await Promise.all([
      supabase.from("couples").select("*").eq("id", coupleId).single(),
      supabase.from("profiles").select("*").eq("couple_id", coupleId),
      supabase.from("checkins").select("*").eq("couple_id", coupleId).gte("day", since).order("created_at", { ascending: false }).limit(500),
      supabase.from("likes").select("*").eq("couple_id", coupleId),
      supabase.from("comments").select("*").eq("couple_id", coupleId).order("created_at"),
      supabase.from("nudges").select("*").eq("to_user", uid).eq("seen", false).order("created_at", { ascending: false }).limit(1),
    ]);
    if (c.data) setCouple(c.data);
    if (p.data) setPeople(p.data);
    if (ch.data) setCheckins(ch.data);
    if (l.data) setLikes(l.data);
    if (cm.data) setComments(cm.data);
    setNudge(n.data?.[0] || null);
    setLoaded(true);
  }, [coupleId, uid]);

  useEffect(() => {
    load();
    let t;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 250); };
    const ch = supabase.channel(`pair-${coupleId}`);
    for (const table of ["checkins", "likes", "comments", "nudges"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `couple_id=eq.${coupleId}` }, debounced);
    }
    ch.on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `couple_id=eq.${coupleId}` }, debounced);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "couples", filter: `id=eq.${coupleId}` }, debounced);
    ch.subscribe();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(t); supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
  }, [load, coupleId]);

  // Signed URLs for photos we haven't loaded yet
  useEffect(() => {
    const need = checkins.filter((c) => c.photo_path && !photos[c.photo_path]).map((c) => c.photo_path);
    if (!need.length) return;
    supabase.storage.from("photos").createSignedUrls(need, 60 * 60 * 24).then(({ data }) => {
      if (!data) return;
      setPhotos((prev) => {
        const next = { ...prev };
        data.forEach((d) => { if (d.signedUrl) next[d.path] = d.signedUrl; });
        return next;
      });
    });
  }, [checkins, photos]);

  const ordered = useMemo(() => {
    const list = [...people].sort((a, b) => (a.id === uid ? -1 : b.id === uid ? 1 : 0));
    return list;
  }, [people, uid]);
  const meP = ordered.find((p) => p.id === uid);
  const partner = ordered.find((p) => p.id !== uid);
  const nameOf = (id) => people.find((p) => p.id === id)?.name || (id === uid ? "You" : "Your buddy");

  const ws = monday(new Date());
  const today = dayKey(new Date());

  async function sendNudge() {
    const { error } = await supabase.from("nudges").insert({ couple_id: coupleId, from_user: uid, to_user: partner.id });
    if (error) return toast("Couldn't send the nudge.");
    notify("nudge");
    toast("Nudge sent.");
  }
  async function dismissNudge() {
    setNudge(null);
    await supabase.from("nudges").update({ seen: true }).eq("to_user", uid).eq("seen", false);
  }

  return (
    <>
      <div className="wrap">
        <header className="top">
          <div className="brand"><Logo /><div className="eyebrow">{fmtMD(ws)} – {fmtMD(addDays(ws, 6))}</div></div>
          <button className="icon-btn" aria-label="Goals and settings" onClick={() => setSheet("settings")}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
          </button>
        </header>

        <InstallHint />

        {loaded && !partner && (
          <div className="notice"><b>Waiting for your buddy.</b> Share your pair code: <span className="code-inline">{couple?.code}</span></div>
        )}
        {nudge && (
          <div className="nudge"><p>{nameOf(nudge.from_user)} is giving you the side-eye. Go move a little?</p>
            <button onClick={dismissNudge}>On it</button></div>
        )}

        <div className="duo">
          {[meP, partner].map((p, i) => p
            ? <PersonCard key={p.id} p={p} me={p.id === uid} checkins={checkins} ws={ws} today={today} onNudge={sendNudge} />
            : <div key={i} className="person"><div className="who"><span className="nm muted">Buddy</span></div><div className="score muted">–</div><p className="muted small">Not paired yet.</p></div>)}
        </div>

        {meP && partner && couple && <Together checkins={checkins} a={meP} b={partner} couple={couple} />}

        <section className="block">
          <div className="block-h"><h2>Check-ins</h2></div>
          {loaded && !checkins.length && (
            <div className="empty"><h3>No sweat yet</h3>Tap <b>I showed up</b> after a workout. Add a photo or just a note, and your buddy sees it here.</div>
          )}
          {checkins.slice(0, 60).map((c) => (
            <Post key={c.id} c={c} uid={uid} coupleId={coupleId} nameOf={nameOf} photo={c.photo_path && photos[c.photo_path]}
              likes={likes.filter((l) => l.checkin_id === c.id)} comments={comments.filter((x) => x.checkin_id === c.id)} toast={toast} />
          ))}
        </section>

        {meP && partner && <History checkins={checkins} people={[meP, partner]} />}
      </div>

      <div className="dock">
        <button className="cta" onClick={() => setSheet("checkin")}>
          <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          I showed up
        </button>
      </div>

      {sheet === "checkin" && <CheckinSheet uid={uid} coupleId={coupleId} onClose={() => setSheet(null)} toast={toast} onDone={load} />}
      {sheet === "settings" && meP && couple && <SettingsSheet me={meP} couple={couple} onClose={() => setSheet(null)} toast={toast} onDone={load} />}
      {toastNode}
    </>
  );
}

function InstallHint() {
  const [hidden, setHidden] = useState(() => { try { return isInstalled() || localStorage.getItem("pbb-install-hint") === "x"; } catch { return isInstalled(); } });
  if (hidden) return null;
  return (
    <div className="notice">
      <b>Make it an app:</b> in Safari tap Share, then <b>Add to Home Screen</b>. Open it from there to get notifications.
      <button className="link" onClick={() => { setHidden(true); try { localStorage.setItem("pbb-install-hint", "x"); } catch {} }}>Got it</button>
    </div>
  );
}

function PersonCard({ p, me, checkins, ws, today, onNudge }) {
  const done = daysDone(checkins, p.id, ws);
  const left = p.goal - done.size;
  const daysLeftInWeek = 6 - ((new Date().getDay() + 6) % 7);
  let chip = left <= 0 ? "Goal hit" : `${left} to go`;
  if (left > daysLeftInWeek + 1) chip = `Owes: ${p.wager || "a treat"}`;
  const [sent, setSent] = useState(false);
  return (
    <div className={`person${me ? " me" : ""}`}>
      <div className="who"><span className="nm">{me ? `${p.name || "You"} (you)` : p.name || "Your buddy"}</span></div>
      <div className="score">{done.size}<small>/ {p.goal}</small></div>
      <div className="dots" aria-label={`${done.size} of ${p.goal} days this week`}>
        {DAY_LETTERS.map((l, i) => {
          const k = dayKey(addDays(ws, i));
          return <div key={i} className={`dot${done.has(k) ? " on" : ""}${k === today ? " today" : ""}`}><i /><span>{l}</span></div>;
        })}
      </div>
      <span className={`chip${left <= 0 ? " hit" : ""}`}>{chip}</span>
      {!me && <button className="poke" disabled={sent} onClick={() => { setSent(true); onNudge(); }}>{sent ? "Nudged" : "Nudge"}</button>}
    </div>
  );
}

function Together({ checkins, a, b, couple }) {
  const n = streak(checkins, a, b);
  const target = couple.reward_weeks || 4;
  return (
    <div className="together">
      <div className="big">{n}</div>
      <div className="grow">
        <p className="bold">{n === 1 ? "week in a row you both hit your goal" : "weeks in a row you both hit your goals"}</p>
        {couple.reward ? (
          <>
            <p className="muted small">{n >= target ? `You earned it: ${couple.reward}` : `${target - n} more to earn: ${couple.reward}`}</p>
            <div className="bar"><i style={{ width: `${Math.min(100, (n / target) * 100)}%` }} /></div>
          </>
        ) : <p className="muted small">Set a shared reward in settings.</p>}
      </div>
    </div>
  );
}

function Post({ c, uid, coupleId, nameOf, photo, likes, comments, toast }) {
  const [text, setText] = useState("");
  const mine = likes.some((l) => l.user_id === uid);
  const isOwn = c.user_id === uid;
  const when = c.day === dayKey(c.created_at) ? ago(c.created_at)
    : `for ${fromKey(c.day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;

  async function toggleLike() {
    const r = mine
      ? await supabase.from("likes").delete().eq("checkin_id", c.id).eq("user_id", uid)
      : await supabase.from("likes").insert({ checkin_id: c.id, user_id: uid, couple_id: coupleId });
    if (r.error) toast("Couldn't save that like.");
    else if (!mine && !isOwn) notify("like");
  }
  async function review(status) {
    const { error } = await supabase.from("checkins").update({ status, reviewed_by: uid }).eq("id", c.id);
    if (error) toast("Couldn't save. Try again."); else toast(status === "ok" ? "Counted it." : "Didn't count it.");
  }
  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const { error } = await supabase.from("comments").insert({ checkin_id: c.id, couple_id: coupleId, user_id: uid, body });
    if (error) return toast("Couldn't post that comment.");
    setText("");
    notify("comment", { text: body });
  }
  async function remove() {
    const { error } = await supabase.from("checkins").delete().eq("id", c.id);
    if (error) return toast("Couldn't delete it.");
    if (c.photo_path) await supabase.storage.from("photos").remove([c.photo_path]);
    toast("Deleted.");
  }

  return (
    <article className={`post${c.status === "declined" ? " declined" : ""}`}>
      {c.photo_path
        ? (photo ? <img className="ph" src={photo} alt={`${nameOf(c.user_id)}'s workout`} /> : <div className="ph-empty">Loading photo…</div>)
        : <div className="nophoto"><span className="tag">{c.activity}</span><span className="muted small">no photo</span></div>}
      <div className="body">
        <div className="meta">
          <b>{nameOf(c.user_id)}</b>
          {c.photo_path && <span className="act">{c.activity}</span>}
          <span>{when}</span>
          {isOwn && <DeleteButton onConfirm={remove} />}
        </div>
        {c.note && <p className="note">{c.note}</p>}
        {c.status === "pending" && (
          <div className="promise">
            {isOwn ? <span>Pinky promise sent. Waiting for your buddy to say it counts.</span> : (
              <>
                <span><b>{nameOf(c.user_id)}</b> pinky promises they worked out. Does it count?</span>
                <div className="row"><button className="btn-cocoa" onClick={() => review("ok")}>It counts</button>
                  <button className="btn-ghost" onClick={() => review("declined")}>Nope</button></div>
              </>
            )}
          </div>
        )}
        {c.status === "declined" && <p className="hint">Pinky promise didn't count.</p>}
        <div className="row">
          <button className={`like${mine ? " on" : ""}`} aria-pressed={mine} aria-label={mine ? "Unlike" : "Like"} onClick={toggleLike}>
            <svg viewBox="0 0 24 24" strokeWidth="2"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
            {likes.length || ""}
          </button>
        </div>
        {comments.length > 0 && (
          <div className="comments">{comments.map((x) => <p key={x.id}><b>{nameOf(x.user_id)}</b>{x.body}</p>)}</div>
        )}
        <form className="cform" onSubmit={send}>
          <input id={`c-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something sweet…" maxLength={280} aria-label="Comment" />
          <button type="submit">Send</button>
        </form>
      </div>
    </article>
  );
}

function DeleteButton({ onConfirm }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="link small push" onClick={() => setAsk(true)}>Delete</button>;
  return (
    <span className="push row">
      <button className="link small danger" onClick={onConfirm}>Delete for good</button>
      <button className="link small" onClick={() => setAsk(false)}>Keep</button>
    </span>
  );
}

function History({ checkins, people }) {
  const ws = monday(new Date());
  if (!checkins.length) return null;
  const first = monday(fromKey(checkins.reduce((m, c) => (c.day < m ? c.day : m), "9999-12-31")));
  const rows = [];
  for (let w = addDays(ws, -7), i = 0; w >= first && i < 8; w = addDays(w, -7), i++) rows.push(w);
  if (!rows.length) return null;
  return (
    <section className="block">
      <div className="block-h"><h2>Past weeks</h2><span className="eyebrow">Mon–Sun</span></div>
      <div className="weeks">
        {rows.map((w) => (
          <div className="wk" key={dayKey(w)}>
            <span className="d">{fmtMD(w)}</span>
            <ul>{people.map((p) => {
              const n = daysDone(checkins, p.id, w).size;
              return <li key={p.id}><b>{p.name || "Buddy"}</b> {n}/{p.goal} {n >= p.goal ? <span className="ok">safe</span> : <span className="owe">owes {p.wager || "a treat"}</span>}</li>;
            })}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function CheckinSheet({ uid, coupleId, onClose, toast, onDone }) {
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState("");
  const [act, setAct] = useState("Gym");
  const [note, setNote] = useState("");
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr("");
    try { const b = await compressPhoto(f); setBlob(b); setPreview(URL.createObjectURL(b)); }
    catch (x) { setErr(x.message); }
  }

  async function post() {
    setBusy(true); setErr("");
    try {
      let photo_path = null;
      if (blob) {
        photo_path = `${coupleId}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from("photos").upload(photo_path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
      }
      const status = offset ? "pending" : "ok";
      const { error } = await supabase.from("checkins").insert({
        couple_id: coupleId, user_id: uid, day: dayKey(addDays(new Date(), -offset)),
        activity: act, note: note.trim().slice(0, 300), photo_path, status,
      });
      if (error) throw error;
      notify(offset ? "promise" : "checkin", { activity: act });
      toast(offset ? "Pinky promise sent." : "Logged. Nice work.");
      onDone(); onClose();
    } catch {
      setErr("Couldn't save. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="I showed up" onClose={onClose}>
      <div className="picker">
        {preview ? <img src={preview} alt="Your photo" /> : (
          <div className="pick-txt"><b>Add a photo</b><span className="small">Front or back camera, or one from your library. Optional.</span></div>
        )}
        <input id="photo" type="file" accept="image/*" aria-label="Choose a photo" onChange={pick} />
      </div>
      <div className="field"><span className="lbl">What did you do?</span>
        <div className="chips">{ACTIVITIES.map((a) => <button key={a} type="button" aria-pressed={a === act} onClick={() => setAct(a)}>{a}</button>)}</div>
      </div>
      <div className="field"><label htmlFor="note">Note</label>
        <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Leg day survived. Barely." /></div>
      <div className="field"><span className="lbl">When</span>
        <div className="chips">{["Today", "Yesterday", "2 days ago", "3 days ago"].map((l, i) =>
          <button key={l} type="button" aria-pressed={i === offset} onClick={() => setOffset(i)}>{l}</button>)}</div>
        {offset > 0 && <p className="hint">Forgot to log it? This goes to your buddy as a pinky promise, and it counts once they say so.</p>}
      </div>
      {err && <p className="err">{err}</p>}
      <button className="primary" onClick={post} disabled={busy}>{busy ? "Posting…" : "Post it"}</button>
    </Sheet>
  );
}

function SettingsSheet({ me, couple, onClose, toast, onDone }) {
  const [name, setName] = useState(me.name || "");
  const [goal, setGoal] = useState(me.goal || 4);
  const [wager, setWager] = useState(me.wager || "");
  const [reward, setReward] = useState(couple.reward || "");
  const [weeks, setWeeks] = useState(couple.reward_weeks || 4);
  const [push, setPush] = useState(null);
  const [pushMsg, setPushMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { pushIsOn().then(setPush); }, []);

  async function save() {
    setBusy(true); setErr("");
    const a = await supabase.from("profiles").update({ name: name.trim(), goal, wager: wager.trim() }).eq("id", me.id);
    const b = await supabase.from("couples").update({ reward: reward.trim(), reward_weeks: weeks }).eq("id", couple.id);
    setBusy(false);
    if (a.error || b.error) return setErr("Couldn't save. Try again.");
    toast("Saved."); onDone(); onClose();
  }
  async function turnOnPush() {
    setPushMsg("");
    try {
      const r = await enablePush(me.id);
      if (r === "ok") { setPush(true); toast("Notifications on."); } else setPushMsg(r);
    } catch { setPushMsg("Couldn't turn on notifications. Try again."); }
  }

  return (
    <Sheet title="Goals & settings" onClose={onClose}>
      <div className="field"><label htmlFor="sname">Your name</label>
        <input id="sname" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} /></div>
      <div className="field"><span className="lbl">Workout days per week</span><Stepper value={goal} onChange={setGoal} min={1} max={7} label="days" /></div>
      <div className="field"><label htmlFor="wager">If I miss my goal, I owe…</label>
        <input id="wager" value={wager} onChange={(e) => setWager(e.target.value)} maxLength={60} placeholder="Buy dinner, do the dishes…" /></div>
      <div className="field"><label htmlFor="reward">Our shared reward</label>
        <input id="reward" value={reward} onChange={(e) => setReward(e.target.value)} maxLength={60} placeholder="Sushi night, a spa day…" />
        <p className="hint">You both earn it after hitting your goals this many weeks in a row:</p>
        <Stepper value={weeks} onChange={setWeeks} min={1} max={52} label="weeks" /></div>
      {err && <p className="err">{err}</p>}
      <button className="primary" onClick={save} disabled={busy}>Save</button>

      <div className="divider" />
      <div className="field"><span className="lbl">Notifications</span>
        {push ? <p className="hint">On for this phone. You'll hear about check-ins, nudges, comments and pinky promises.</p>
          : <button className="secondary" onClick={turnOnPush}>Turn on notifications</button>}
        {pushMsg && <p className="err">{pushMsg}</p>}
      </div>
      <div className="field"><span className="lbl">Pair code</span><p className="code-inline">{couple.code}</p></div>
      <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </Sheet>
  );
}

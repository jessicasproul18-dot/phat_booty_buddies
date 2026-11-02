export const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export function dayKey(d) {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fromKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function monday(d) {
  d = new Date(d);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function addDays(d, n) {
  d = new Date(d);
  d.setDate(d.getDate() + n);
  return d;
}
export const fmtMD = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
export function ago(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/** Distinct days this person counted in the week starting `ws`. */
export function daysDone(checkins, userId, ws) {
  const start = dayKey(ws), end = dayKey(addDays(ws, 6));
  const set = new Set();
  for (const c of checkins) {
    if (c.user_id === userId && c.status === "ok" && c.day >= start && c.day <= end) set.add(c.day);
  }
  return set;
}

export function weekHit(checkins, p, ws) {
  return daysDone(checkins, p.id, ws).size >= p.goal;
}

/** Weeks in a row where both of you hit your goals (this week counts once it's hit). */
export function streak(checkins, a, b) {
  const ws = monday(new Date());
  let n = weekHit(checkins, a, ws) && weekHit(checkins, b, ws) ? 1 : 0;
  let w = addDays(ws, -7);
  for (let i = 0; i < 104; i++) {
    if (weekHit(checkins, a, w) && weekHit(checkins, b, w)) { n++; w = addDays(w, -7); } else break;
  }
  return n;
}

/** Shrink a photo to a JPEG Blob under ~400 KB. */
export function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let max = 1400, q = 0.82;
      const draw = () => new Promise((r) => {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * sc);
        cv.height = Math.round(img.height * sc);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(r, "image/jpeg", q);
      });
      (async () => {
        let blob = await draw();
        while (blob && blob.size > 400_000 && max > 500) { max -= 200; q = Math.max(0.6, q - 0.05); blob = await draw(); }
        URL.revokeObjectURL(url);
        blob ? resolve(blob) : reject(new Error("Couldn't read that photo."));
      })();
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a photo we can read.")); };
    img.src = url;
  });
}

import { useState, useRef, useEffect, useCallback } from "react";

/*
 * 🥟 CHOWPAL — Public Deploy Version
 * 
 * All AI calls go to /api/gemini (Vercel serverless)
 * No API key on the frontend. Users just open and use.
 * Rate limited: 30 requests/hour per IP
 */

const BRAND = { primary: "#FF5E3A", light: "#FF8F6B", grad: "linear-gradient(135deg,#FF5E3A,#FF8F6B)", glow: "rgba(255,94,58,0.25)" };

// ── Geo + Ride ──
function haversine(a, b) {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function estimateRide(d) {
  const spd = d < 5 ? 18 : d < 15 ? 25 : 35, t = Math.max(5, Math.round((d / spd) * 60));
  const f = Math.round(14 + Math.max(0, d - 3) * 2.5 + t * 0.5);
  return { timeMin: t, fareLow: Math.max(14, Math.round(f * 0.85)), fareHigh: Math.round(f * 1.2), distKm: Math.round(d * 10) / 10 };
}
function makeDidiLinks(from, to, name) {
  const p = { slat: from.lat, slng: from.lng, dlat: to.lat, dlng: to.lng, dname: name };
  return {
    web: `https://common.diditaxi.com.cn/general/webEntry?${new URLSearchParams(p)}`,
    app: `didipay://diditaxi.com.cn/general/webEntry?${new URLSearchParams(p)}`,
    gaode: `https://uri.amap.com/navigation?to=${to.lng},${to.lat},${encodeURIComponent(name)}&mode=car&callnative=1`,
    baidu: `https://api.map.baidu.com/direction?destination=latlng:${to.lat},${to.lng}|name:${encodeURIComponent(name)}&mode=driving&coord_type=wgs84&output=html`,
  };
}

const FALLBACK = [
  { name: "The Bund 外滩", lat: 31.24, lng: 121.49 }, { name: "Jing'an 静安寺", lat: 31.2234, lng: 121.446 },
  { name: "People's Sq 人民广场", lat: 31.2303, lng: 121.4737 }, { name: "Lujiazui 陆家嘴", lat: 31.2363, lng: 121.5054 },
  { name: "Xintiandi 新天地", lat: 31.2194, lng: 121.474 }, { name: "Hongqiao 虹桥", lat: 31.1944, lng: 121.336 },
];
const DI = { "素": "🥬", "汤": "🍲", "面": "🍜", "饭": "🍚", "菇": "🍄", "甜": "🍮", "饺": "🥟", "鹅": "🦢", "蟹": "🦀", "鱼": "🐟", "虾": "🦐", "豆": "🫘", "鸡": "🐔", "牛": "🐄" };
function dIcon(n) { for (const [k, v] of Object.entries(DI)) if (n?.includes(k)) return v; return "🍽️"; }

const card = { background: "rgba(255,255,255,0.035)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.05)", marginBottom: 12 };
const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

// ── GPS ──
function useGPS() {
  const [loc, setLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const retry = useCallback(() => {
    if (!navigator.geolocation) { setError("GPS not supported"); setLoading(false); return; }
    setLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      p => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }); setLoading(false); },
      e => { setError(e.code === 1 ? "Please allow location" : "Location unavailable"); setLoading(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);
  useEffect(() => { retry(); }, [retry]);
  return { loc, loading, error, retry };
}

// ── API calls (go to /api/gemini, key is server-side) ──
async function apiCall(body) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

// ── Upload Step ──
function UploadStep({ onSubmit, processing, progress }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("photo");
  const [name, setName] = useState(""); const [city, setCity] = useState("");
  const handleFile = f => { if (!f?.type.startsWith("image/")) return; const r = new FileReader(); r.onload = e => setPreview(e.target.result); r.readAsDataURL(f); };

  return (<div style={{ animation: "fadeUp 0.4s" }}>
    {mode === "photo" ? (<>
      {!preview ? (
        <div onClick={() => fileRef.current?.click()} style={{ borderRadius: 20, border: "2px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", padding: "50px 20px", textAlign: "center", cursor: "pointer" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Upload Screenshot</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>大众点评 · 美团 · 小红书<br />Tap to select or take photo</div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={e => handleFile(e.target.files[0])} style={{ display: "none" }} />
        </div>
      ) : (
        <div style={{ animation: "fadeUp 0.3s" }}>
          <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
            <img src={preview} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }} />
            {!processing && <button onClick={() => setPreview(null)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 14, cursor: "pointer" }}>×</button>}
          </div>
          <button onClick={() => onSubmit({ type: "image", data: preview })} disabled={processing}
            style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: processing ? "rgba(255,255,255,0.08)" : BRAND.grad, color: "#fff", fontSize: 16, fontWeight: 800, cursor: processing ? "wait" : "pointer", fontFamily: "inherit", boxShadow: processing ? "none" : `0 6px 24px ${BRAND.glow}` }}>
            {processing ? <span className="pulse-text">🔍 {progress}</span> : "🥟 Find Best Dishes + Ride"}
          </button>
        </div>
      )}
      <button onClick={() => setMode("manual")} style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✏️ Type restaurant name instead</button>
    </>) : (
      <div style={{ ...card, animation: "fadeUp 0.3s" }}>
        <input placeholder="Restaurant name 餐厅名称 *" value={name} onChange={e => setName(e.target.value)} style={{ ...inp, marginBottom: 10 }} />
        <input placeholder="City 城市 (default: 上海)" value={city} onChange={e => setCity(e.target.value)} style={{ ...inp, marginBottom: 16 }} />
        <button onClick={() => name && onSubmit({ type: "manual", name, city: city || "上海" })} disabled={!name || processing}
          style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: name ? BRAND.grad : "rgba(255,255,255,0.06)", color: name ? "#fff" : "rgba(255,255,255,0.2)", fontSize: 14, fontWeight: 700, cursor: name ? "pointer" : "default", fontFamily: "inherit" }}>
          {processing ? "🔍 Searching..." : "Search 🔍"}
        </button>
        <button onClick={() => setMode("photo")} style={{ width: "100%", marginTop: 8, padding: 10, border: "none", background: "transparent", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
      </div>
    )}
  </div>);
}

// ── Processing ──
function ProcessingStep({ steps }) {
  return (<div style={{ animation: "fadeUp 0.3s", padding: "10px 0" }}>
    <div style={{ textAlign: "center", marginBottom: 24 }}><div style={{ fontSize: 48, marginBottom: 12 }} className="pulse-text">🥟</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Finding the best dishes...</div></div>
    {steps.map((s, i) => {
      const done = s.status === "done", act = s.status === "active";
      return (<div key={i} style={{ ...card, display: "flex", alignItems: "center", gap: 12, marginBottom: 8, border: act ? "1px solid rgba(255,94,58,0.2)" : "1px solid rgba(255,255,255,0.05)", opacity: s.status === "pending" ? 0.4 : 1 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: done ? "rgba(74,222,128,0.1)" : act ? "rgba(255,94,58,0.1)" : "rgba(255,255,255,0.04)" }}>{done ? "✅" : act ? <span className="pulse-text">{s.icon}</span> : s.icon}</div>
        <div><div style={{ fontSize: 13, fontWeight: 600, color: done ? "#4ADE80" : act ? BRAND.primary : "rgba(255,255,255,0.4)" }}>{s.label}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{s.detail}</div></div>
      </div>);
    })}
  </div>);
}

// ── Result ──
function ResultStep({ data, pickup, gps, onPickup, onRetryGPS, onReset }) {
  const { restaurant: r = {}, recommended_dishes: dishes = [], xiaohongshu_highlights: xhs = [] } = data;
  const [tab, setTab] = useState("dishes"); const [exp, setExp] = useState(null); const [copied, setCopied] = useState(null);
  const dest = { lat: r.lat || 31.22, lng: r.lng || 121.47 };
  const dist = pickup ? haversine(pickup, dest) : null;
  const ride = dist !== null ? estimateRide(dist) : null;
  const links = pickup ? makeDidiLinks(pickup, dest, r.name) : null;
  const top5 = dishes.slice(0, 5);
  const openDidi = () => { if (!links) return; if (/iPhone|iPad|Android/i.test(navigator.userAgent)) { const t = setTimeout(() => { window.location.href = links.web; }, 1500); window.location.href = links.app; window.addEventListener("blur", () => clearTimeout(t), { once: true }); } else window.open(links.web, "_blank"); };
  const shareEN = `🥟 ${r.name}\n📍 ${r.address || ""}\n⭐ ${r.rating_dianping || "?"} · ¥${r.avg_price || "?"}/person\n\n🔥 Must-order:\n${top5.map((d, i) => `${i + 1}. ${d.name} (${d.name_en}) ¥${d.price || "?"}`).join("\n")}\n\n— via Chowpal 🥟`;
  const shareCN = `🥟 ${r.name}\n⭐ ${r.rating_dianping || "?"} · 人均¥${r.avg_price || "?"}\n🔥 必点：${top5.map(d => d.name).join("、")}\n— Chowpal 🥟`;
  const copy = (t, id) => { navigator.clipboard?.writeText(t); setCopied(id); setTimeout(() => setCopied(null), 2500); };
  const tabs = [{ id: "dishes", icon: "🍽️", l: "Dishes" }, { id: "ride", icon: "🚗", l: "Ride" }, { id: "share", icon: "💬", l: "Share" }];

  return (<div style={{ animation: "fadeUp 0.4s" }}>
    <div style={{ ...card, textAlign: "center", background: "rgba(255,94,58,0.04)", border: "1px solid rgba(255,94,58,0.1)" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{r.name}</div>
      {r.address && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>📍 {r.address}</div>}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
        {r.rating_dianping && <span style={{ fontSize: 11, background: "rgba(250,204,21,0.1)", color: "#FACC15", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>★ {r.rating_dianping}</span>}
        {r.avg_price && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", padding: "2px 8px", borderRadius: 6 }}>¥{r.avg_price}/人</span>}
        {r.tags?.slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", padding: "2px 8px", borderRadius: 10 }}>{t}</span>)}
      </div>
      {r.highlights?.[0] && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginTop: 8 }}>{r.highlights[0]}</div>}
    </div>
    <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.025)", borderRadius: 14, padding: 2, marginBottom: 14, border: "1px solid rgba(255,255,255,0.03)" }}>
      {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "8px 0", borderRadius: 12, border: "none", background: tab === t.id ? "rgba(255,94,58,0.12)" : "transparent", color: tab === t.id ? BRAND.primary : "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}>{t.icon} {t.l}</button>)}
    </div>
    {tab === "dishes" && (<div>{dishes.map((d, i) => (<div key={i} style={{ ...card, marginBottom: 8, cursor: "pointer" }} onClick={() => setExp(exp === i ? null : i)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><div style={{ fontSize: 26, flexShrink: 0 }}>{dIcon(d.name)}</div><div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{d.name}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{d.name_en}</div></div>{d.price && <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.primary, flexShrink: 0, marginLeft: 8 }}>¥{d.price}</div>}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
          {d.rating && <span style={{ fontSize: 9, background: "rgba(250,204,21,0.1)", color: "#FACC15", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>★ {d.rating}</span>}
          {d.recommend_count && <span style={{ fontSize: 9, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", padding: "1px 6px", borderRadius: 4 }}>👍 {d.recommend_count}</span>}
          {d.tags?.map(t => <span key={t} style={{ fontSize: 9, background: t === "must-try" ? "rgba(255,94,58,0.08)" : "rgba(255,255,255,0.03)", color: t === "must-try" ? BRAND.primary : "rgba(255,255,255,0.3)", padding: "1px 6px", borderRadius: 4 }}>{t}</span>)}
          {d.is_vegetarian && <span style={{ fontSize: 9, background: "rgba(74,222,128,0.08)", color: "#4ADE80", padding: "1px 6px", borderRadius: 4 }}>🌱</span>}
        </div></div></div>
      {exp === i && d.reason && <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>💡 {d.reason}</div>}
    </div>))}
    {xhs?.length > 0 && xhs.map((h, i) => <div key={i} style={{ ...card, marginBottom: 6, display: "flex", gap: 10 }}><div style={{ fontSize: 16 }}>{h.sentiment === "positive" ? "😍" : "🤔"}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, flex: 1 }}>{h.summary}</div></div>)}</div>)}
    {tab === "ride" && (<div>
      <div style={{ ...card, border: pickup ? "1px solid rgba(74,222,128,0.15)" : "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 12, height: 12, borderRadius: "50%", background: pickup ? "#4ADE80" : gps.loading ? "#FACC15" : "#EF4444", flexShrink: 0 }} /><div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>Your Location</div>
          {gps.loading ? <div className="pulse-text" style={{ fontSize: 13, color: "#FACC15" }}>📡 Getting GPS...</div> : pickup ? <><div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{pickup.name}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}</div></> : <div style={{ fontSize: 13, color: "#EF4444" }}>{gps.error}</div>}
        </div>{pickup && <div style={{ fontSize: 9, color: "#4ADE80", background: "rgba(74,222,128,0.1)", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>{pickup.isGps ? "📡 LIVE" : "📍 SET"}</div>}</div>
        {!gps.loading && !pickup?.isGps && <button onClick={onRetryGPS} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>📡 Retry GPS</button>}
      </div>
      {!gps.loading && !pickup && (<div style={{ ...card }}><div style={{ fontSize: 11, color: BRAND.primary, fontWeight: 600, marginBottom: 10 }}>📍 Select area:</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{FALLBACK.map(l => <button key={l.name} onClick={() => onPickup(l)} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>{l.name}</button>)}</div></div>)}
      {ride && (<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>{[{ l: "Distance", v: `${ride.distKm}`, u: "km" }, { l: "Time", v: `~${ride.timeMin}`, u: "min" }, { l: "Fare", v: `¥${ride.fareLow}-${ride.fareHigh}` }].map(s => (<div key={s.l} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 4px", textAlign: "center" }}><div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginBottom: 3 }}>{s.l}</div><div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{s.v}{s.u && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginLeft: 2 }}>{s.u}</span>}</div></div>))}</div>)}
      <button onClick={openDidi} disabled={!pickup} style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: pickup ? BRAND.grad : "rgba(255,255,255,0.06)", color: pickup ? "#fff" : "rgba(255,255,255,0.2)", fontSize: 16, fontWeight: 800, cursor: pickup ? "pointer" : "default", fontFamily: "inherit", boxShadow: pickup ? `0 6px 24px ${BRAND.glow}` : "none", marginBottom: 8 }}>{pickup ? "🚗 Call Didi · 一键叫车" : "⬆ Set location first"}</button>
      {pickup && links && (<div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <a href={links.gaode} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 11, textDecoration: "none", textAlign: "center", fontFamily: "inherit" }}>🗺️ Gaode</a>
        <a href={links.baidu} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 11, textDecoration: "none", textAlign: "center", fontFamily: "inherit" }}>🗺️ Baidu</a>
        <button onClick={() => copy(links.web, "lk")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: copied === "lk" ? "#4ADE80" : "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{copied === "lk" ? "✓" : "🔗"} Link</button>
      </div>)}
      <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginBottom: 4 }}>💳 Payment</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Didi accepts <span style={{ color: "#fff", fontWeight: 600 }}>Visa / MC / JCB</span>. Profile → Wallet → International Card.</div></div>
      <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginBottom: 4 }}>🚕 Taxi driver</div><div style={{ fontSize: 20, fontWeight: 800, color: BRAND.primary, textAlign: "center" }}>请去 {r.address || r.name}</div></div>
    </div>)}
    {tab === "share" && (<div>
      <div style={{ ...card }}><div style={{ fontSize: 12, fontWeight: 600, color: BRAND.primary, marginBottom: 10 }}>🇬🇧 English</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, whiteSpace: "pre-line", padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 10 }}>{shareEN}</div><button onClick={() => copy(shareEN, "en")} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: copied === "en" ? "rgba(74,222,128,0.1)" : BRAND.grad, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{copied === "en" ? "✅ Copied!" : "📋 Copy"}</button></div>
      <div style={{ ...card }}><div style={{ fontSize: 12, fontWeight: 600, color: BRAND.primary, marginBottom: 10 }}>🇨🇳 中文</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, whiteSpace: "pre-line", padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 10 }}>{shareCN}</div><button onClick={() => copy(shareCN, "cn")} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: copied === "cn" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{copied === "cn" ? "✅ Copied!" : "📋 复制"}</button></div>
      <div style={{ ...card }}><div style={{ fontSize: 12, fontWeight: 600, color: BRAND.primary, marginBottom: 10 }}>🙋 Waiter card</div><div style={{ background: "#fff", borderRadius: 12, padding: 16, color: "#000" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#e03e00", textAlign: "center", marginBottom: 10 }}>推荐菜 Recommended</div>{top5.map((d, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < top5.length - 1 ? "1px solid #eee" : "none", fontSize: 14 }}><span style={{ fontWeight: 600 }}>{d.name}</span><span style={{ color: "#666" }}>¥{d.price || "?"}</span></div>)}<div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: "#999" }}>Chowpal 🥟</div></div></div>
    </div>)}
    <button onClick={onReset} style={{ width: "100%", marginTop: 10, padding: 10, borderRadius: 12, border: "none", background: "transparent", color: "rgba(255,255,255,0.2)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>↻ Try another</button>
  </div>);
}

// ── Main App ──
export default function Chowpal() {
  const [step, setStep] = useState("upload");
  const [data, setData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState("");
  const [processSteps, setProcessSteps] = useState([]);
  const [pickup, setPickup] = useState(null);
  const gps = useGPS();

  useEffect(() => { if (gps.loc && !pickup?.isGps) setPickup({ name: "My Location 我的位置", lat: gps.loc.lat, lng: gps.loc.lng, accuracy: gps.loc.accuracy, isGps: true }); }, [gps.loc]);
  const updateStep = (i, st) => setProcessSteps(p => p.map((s, j) => j === i ? { ...s, status: st } : s));

  const handleSubmit = async (input) => {
    setProcessing(true); setError(null);
    try {
      let name, city;
      if (input.type === "image") {
        setProgress("Reading screenshot...");
        const base64 = input.data.split(",")[1];
        const mimeType = input.data.match(/^data:(image\/\w+);/)?.[1] || "image/jpeg";
        const ocr = await apiCall({ action: "ocr", image: base64, mimeType });
        if (ocr.error) { setProcessing(false); setError("Could not read restaurant name. Try typing it manually."); return; }
        name = ocr.name; city = ocr.city || "上海";
        setProgress(`Found: ${name}`);
      } else { name = input.name; city = input.city || "上海"; }

      setStep("processing");
      setProcessSteps([
        { icon: "📸", label: `Found: "${name}"`, detail: city, status: "done" },
        { icon: "🔍", label: "Searching 小红书 + 大众点评", detail: "Google Search grounding", status: "active" },
        { icon: "🧠", label: "Ranking dishes", detail: "Finding must-orders", status: "pending" },
        { icon: "📍", label: "Mapping location", detail: "Address → Didi ready", status: "pending" },
      ]);

      const result = await apiCall({ action: "recommend", restaurantName: name, city });
      updateStep(1, "done"); updateStep(2, "done"); updateStep(3, "done");
      if (result.error) { setError(result.error); setStep("upload"); setProcessing(false); return; }
      setData(result);
      await new Promise(r => setTimeout(r, 400));
      setStep("result");
    } catch (e) { console.error(e); setError(e.message || "Something went wrong."); setStep("upload"); }
    setProcessing(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08080C", color: "#fff", fontFamily: "'DM Sans','Noto Sans SC',sans-serif", maxWidth: 480, margin: "0 auto", padding: "0 18px 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .pulse-text{animation:pt 1.5s ease-in-out infinite}
        @keyframes pt{0%,100%{opacity:1}50%{opacity:.5}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        input::placeholder{color:rgba(255,255,255,.22)}
        ::-webkit-scrollbar{display:none}
      `}</style>
      <div style={{ paddingTop: 24, marginBottom: 6, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}><span style={{ fontSize: 26 }}>🥟</span><span style={{ fontSize: 22, fontWeight: 800, background: BRAND.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Chowpal</span></div>
        <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, margin: "0 0 4px", background: "linear-gradient(135deg,#fff,rgba(255,255,255,.6))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {step === "upload" ? "What shall we eat?" : step === "processing" ? "Finding the good stuff..." : data?.restaurant?.name || "Results"}
        </h1>
        {step === "upload" && <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 4 }}>Screenshot → Best dishes + Ride there</p>}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>{[0, 1, 2].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= (step === "upload" ? 0 : step === "processing" ? 1 : 2) ? BRAND.primary : "rgba(255,255,255,0.08)", transition: "all 0.4s" }} />)}</div>
      {error && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: 14, marginBottom: 14, color: "#EF4444", fontSize: 12, lineHeight: 1.5 }}>⚠️ {error}</div>}
      {step === "upload" && <UploadStep onSubmit={handleSubmit} processing={processing} progress={progress} />}
      {step === "processing" && <ProcessingStep steps={processSteps} />}
      {step === "result" && data && <ResultStep data={data} pickup={pickup} gps={gps} onPickup={l => setPickup({ ...l, isGps: false })} onRetryGPS={gps.retry} onReset={() => { setStep("upload"); setData(null); setError(null); }} />}
      <div style={{ textAlign: "center", marginTop: 30, fontSize: 10, color: "rgba(255,255,255,0.1)" }}>Chowpal 🥟 · Powered by Gemini</div>
    </div>
  );
}

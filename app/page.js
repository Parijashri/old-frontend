'use client';
import { useState, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────
//  PALETTE
// ─────────────────────────────────────────────────────────────────
const C = {
  ivory:"#FFF8F2", blush:"#F4D6D6", powder:"#DCE7F3",
  lavender:"#E6DDF2", sage:"#C9D8C5", gold:"#C6A85E",
  rose:"#D8A7A7", plum:"#7D5A7B", ink:"#4A3F3F", soft:"#6E6A6A",
};
const CARD_BG = [C.blush, C.powder, C.lavender, C.sage, "#F0E8D8", "#E8F0E8"];
const QUICK_ITEMS = ["maggi","onion","ribbon","pen","coffee","cardboard","fabric markers","rice","candle","scarf","beads","old photos","butter","scissors","stickers","jeans","flour","sugar"];
const FILTERS_DEF = [
  {id:"hostel",    label:"Hostel Mode 🛏️"},
  {id:"no-cooking",label:"No Cooking 🚫🔥"},
  {id:"budget",    label:"Budget Friendly 🪙"},
  {id:"gifting",   label:"For Someone 🎀"},
  {id:"self-care", label:"Just For Me 🌸"},
];
const CATEGORIES = ["All","Culinary Delights","Artistic Pursuits","Attire Affairs","Tokens of Affection","Curious Possessions"];

// ─────────────────────────────────────────────────────────────────
//  STORAGE HELPERS
// ─────────────────────────────────────────────────────────────────
const DB = {
  async getUser(email) {
    try { const r = await window.storage.get(`user:${email}`); return r ? JSON.parse(r.value) : null; } catch { return null; }
  },
  async saveUser(user) { await window.storage.set(`user:${user.email}`, JSON.stringify(user)); },
  async getCommunityIdeas() {
    try {
      const keys = await window.storage.list("idea:");
      const ideas = [];
      for (const k of (keys.keys||[])) {
        try { const r = await window.storage.get(k, true); if(r) ideas.push(JSON.parse(r.value)); } catch {}
      }
      return ideas;
    } catch { return []; }
  },
  async saveIdea(idea) { await window.storage.set(`idea:${idea.id}`, JSON.stringify(idea), true); },
  async likeIdea(ideaId, userId) {
    try {
      const r = await window.storage.get(`idea:${ideaId}`, true);
      if (!r) return null;
      const idea = JSON.parse(r.value);
      const likers = idea.likers || [];
      const already = likers.includes(userId);
      idea.likers = already ? likers.filter(x=>x!==userId) : [...likers, userId];
      idea.likes = idea.likers.length;
      await window.storage.set(`idea:${ideaId}`, JSON.stringify(idea), true);
      return { liked: !already, likes: idea.likes, likers: idea.likers };
    } catch { return null; }
  },
  async getSaved(userId) {
    try { const r = await window.storage.get(`saved:${userId}`); return r ? JSON.parse(r.value) : []; } catch { return []; }
  },
  async toggleSave(userId, idea) {
    const saved = await DB.getSaved(userId);
    const exists = saved.find(x => x.id === idea.id);
    const updated = exists ? saved.filter(x => x.id !== idea.id) : [...saved, idea];
    await window.storage.set(`saved:${userId}`, JSON.stringify(updated));
    return { saved: !exists, list: updated };
  },
  async addHistory(userId, items, count) {
    try {
      const r = await window.storage.get(`hist:${userId}`);
      const hist = r ? JSON.parse(r.value) : [];
      hist.unshift({ items, count, ts: Date.now() });
      await window.storage.set(`hist:${userId}`, JSON.stringify(hist.slice(0,20)));
    } catch {}
  },
  async getHistory(userId) {
    try { const r = await window.storage.get(`hist:${userId}`); return r ? JSON.parse(r.value) : []; } catch { return []; }
  },
  async getPending() {
    try {
      const keys = await window.storage.list("pending:");
      const ideas = [];
      for (const k of (keys.keys||[])) {
        try { const r = await window.storage.get(k); if(r) ideas.push(JSON.parse(r.value)); } catch {}
      }
      return ideas;
    } catch { return []; }
  },
  async submitForReview(idea) { await window.storage.set(`pending:${idea.id}`, JSON.stringify(idea)); },
  async approveIdea(idea) {
    try { await window.storage.delete(`pending:${idea.id}`); } catch {}
    idea.status = "approved";
    await DB.saveIdea(idea);
  },
  async rejectIdea(ideaId) { try { await window.storage.delete(`pending:${ideaId}`); } catch {} },
};

// ─────────────────────────────────────────────────────────────────
//  MATCHING LOGIC
// ─────────────────────────────────────────────────────────────────
function matchScore(userItems, idea) {
  const req = (idea.required_items || idea.uses_items || []).map(x=>x.toLowerCase().trim());
  const opt = (idea.optional_items || []).map(x=>x.toLowerCase().trim());
  if (!req.length) return 0;
  const ui = userItems.map(x=>x.toLowerCase().trim());
  const reqHit = req.filter(x=>ui.includes(x)).length;
  const optHit = opt.filter(x=>ui.includes(x)).length;
  const base = Math.round((reqHit/req.length)*100);
  const bonus = opt.length ? Math.round((optHit/opt.length)*15) : 0;
  return Math.min(base+bonus, 100);
}
function matchingCommunityIdeas(userItems, allIdeas) {
  return allIdeas
    .filter(i => i.status === "approved")
    .map(i => ({ ...i, score: matchScore(userItems, i) }))
    .filter(i => i.score >= 40)
    .sort((a,b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────
//  SHARED UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────
const btnStyle = {
  background:"linear-gradient(135deg,#F4D6D6,#E6DDF2)",
  border:"1.5px solid rgba(198,168,94,.4)", borderRadius:16,
  padding:"10px 22px", fontFamily:"'Cormorant Garamond',serif",
  fontSize:15, color:C.ink, cursor:"pointer", fontWeight:600,
  fontStyle:"italic", transition:"all .25s ease",
  boxShadow:"0 2px 12px rgba(125,90,123,.1)",
};
const inpStyle = {
  background:"rgba(255,248,242,.88)",
  border:"1.5px solid rgba(198,168,94,.3)", borderRadius:14,
  padding:"12px 16px", fontFamily:"'Poppins',sans-serif",
  fontSize:13.5, color:C.ink, outline:"none", width:"100%",
  boxSizing:"border-box",
};

const FloralBg = () => (
  <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
    {/* Base warm ivory gradient */}
    <div style={{position:"absolute",inset:0,background:"linear-gradient(160deg,#fdfaf6 0%,#f8f2eb 40%,#f5eef8 70%,#f0f4ee 100%)"}}/>
    {/* Soft radial glow top left */}
    <div style={{position:"absolute",top:"-10%",left:"-5%",width:"50vw",height:"50vw",borderRadius:"50%",background:"radial-gradient(circle,rgba(198,168,94,.07) 0%,transparent 70%)"}}/>
    {/* Soft radial glow bottom right */}
    <div style={{position:"absolute",bottom:"-10%",right:"-5%",width:"55vw",height:"55vw",borderRadius:"50%",background:"radial-gradient(circle,rgba(214,167,167,.08) 0%,transparent 70%)"}}/>
    {/* Subtle SVG pattern overlay */}
    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.03}}>
      <defs><pattern id="fp" width="120" height="120" patternUnits="userSpaceOnUse">
        <text x="10" y="30"  fontSize="18" fill={C.plum}>✿</text>
        <text x="65" y="70"  fontSize="11" fill={C.gold}>❀</text>
        <text x="90" y="20"  fontSize="13" fill={C.rose}>✦</text>
        <text x="25" y="100" fontSize="9"  fill={C.plum}>❋</text>
        <text x="75" y="105" fontSize="15" fill={C.gold}>✿</text>
        <text x="45" y="55"  fontSize="7"  fill={C.rose}>·</text>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#fp)"/>
    </svg>
  </div>
);

const Chip = ({label,onRemove,bg}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:5,background:bg||C.blush,color:C.ink,border:"1px solid rgba(198,168,94,.3)",borderRadius:20,padding:"4px 12px",fontSize:12.5,fontFamily:"'Poppins',sans-serif",fontWeight:500,animation:"chipIn .2s ease"}}>
    {label}
    {onRemove&&<span onClick={onRemove} style={{cursor:"pointer",color:C.plum,fontWeight:700,fontSize:15,lineHeight:1}}>×</span>}
  </span>
);

const Tag = ({label}) => (
  <span style={{background:"rgba(125,90,123,.1)",border:"1px solid rgba(125,90,123,.2)",borderRadius:10,padding:"2px 9px",fontSize:11,color:C.plum,fontFamily:"'Poppins',sans-serif"}}>{label}</span>
);

const SourceBadge = ({source,score}) => (
  <div style={{position:"absolute",top:12,right:12,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
    <span style={{background:source==="community"?"rgba(125,90,123,.15)":"rgba(198,168,94,.15)",border:`1px solid ${source==="community"?C.plum:C.gold}`,borderRadius:10,padding:"2px 8px",fontSize:10,color:source==="community"?C.plum:C.gold,fontFamily:"'Poppins',sans-serif",fontWeight:600}}>
      {source==="community"?"✦ Community":"✨ AI"}
    </span>
    {score>0&&<span style={{fontSize:10,color:C.gold,fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic"}}>{score}% match</span>}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  IDEA CARD  (outside App — stable reference)
// ─────────────────────────────────────────────────────────────────
const IdeaCard = ({idea,idx,user,onSave,savedIds,onLike,onShareToCommunity,showShare}) => {
  const [open,setOpen]   = useState(false);
  const [hover,setHover] = useState(false);
  const bg = CARD_BG[idx%CARD_BG.length];
  const isLiked = (idea.likers||[]).includes(user?.id);
  const isSaved = savedIds.includes(idea.id);
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={{background:bg,borderRadius:22,padding:"24px 22px",border:`1.5px solid rgba(198,168,94,${hover?.28:.14})`,boxShadow:hover?"0 14px 44px rgba(125,90,123,.18)":"0 4px 18px rgba(74,63,63,.08)",transform:hover?"translateY(-5px) rotate(.25deg)":"none",transition:"all .35s cubic-bezier(.34,1.56,.64,1)",animation:`cardIn .45s ease ${idx*.07}s both`,position:"relative",overflow:"hidden"}}>
      <SourceBadge source={idea.source||"ai"} score={idea.score||0}/>
      <div style={{display:"inline-block",background:"rgba(255,248,242,.82)",border:"1px solid rgba(198,168,94,.28)",borderRadius:12,padding:"3px 10px",fontSize:11,color:C.plum,fontFamily:"'Poppins',sans-serif",fontWeight:600,letterSpacing:".4px",marginBottom:10}}>
        {idea.emoji} {idea.category}
      </div>
      <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:18.5,color:C.ink,margin:"0 0 7px",lineHeight:1.3,fontStyle:"italic",paddingRight:80}}>{idea.title}</h3>
      <p style={{fontFamily:"'Poppins',sans-serif",fontSize:12.5,color:C.soft,margin:"0 0 12px",lineHeight:1.55}}>{idea.genz_desc}</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {[{i:"⏱",t:idea.time||idea.time_required},{i:"✨",t:idea.difficulty}].map((m,i)=>m.t&&(
          <span key={i} style={{background:"rgba(255,248,242,.65)",border:"1px solid rgba(198,168,94,.2)",borderRadius:10,padding:"3px 9px",fontSize:11.5,color:C.soft,fontFamily:"'Poppins',sans-serif"}}>{m.i} {m.t}</span>
        ))}
      </div>
      {(idea.uses_items||idea.required_items||[]).length>0&&(
        <div style={{marginBottom:12}}>
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10.5,color:C.gold,letterSpacing:1.5,marginBottom:5}}>USES FROM YOUR LIST</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {(idea.uses_items||idea.required_items).map((item,i)=>(
              <span key={i} style={{background:"rgba(255,255,255,.55)",border:"1px solid rgba(125,90,123,.2)",borderRadius:10,padding:"2px 9px",fontSize:11.5,color:C.ink,fontFamily:"'Poppins',sans-serif"}}>{item}</span>
            ))}
          </div>
        </div>
      )}
      {idea.source==="community"&&idea.submitted_by_name&&(
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11.5,color:C.soft,fontStyle:"italic",marginBottom:10}}>✿ Shared by {idea.submitted_by_name}</p>
      )}
      <div onClick={()=>setOpen(!open)} style={{background:"rgba(255,248,242,.75)",borderRadius:13,padding:"10px 14px",marginBottom:12,border:"1px solid rgba(198,168,94,.2)",cursor:"pointer"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.plum,fontWeight:600}}>{open?"▾ The steps, dearest…":"▸ Reveal the steps 💌"}</div>
        {open&&<ol style={{margin:"10px 0 0",paddingLeft:18}}>{(idea.steps||[]).map((s,i)=><li key={i} style={{fontFamily:"'Poppins',sans-serif",fontSize:12,color:C.soft,marginBottom:5,lineHeight:1.55}}>{s}</li>)}</ol>}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>user&&onSave(idea)} style={{background:isSaved?"linear-gradient(135deg,#F4D6D6,#E6DDF2)":"rgba(255,248,242,.7)",border:`1.5px solid ${isSaved?C.rose:"rgba(198,168,94,.3)"}`,borderRadius:14,padding:"6px 14px",fontSize:12,color:isSaved?C.plum:C.soft,fontFamily:"'Poppins',sans-serif",fontWeight:600,cursor:user?"pointer":"not-allowed",transition:"all .2s"}}>{isSaved?"💖 Saved":"🤍 Save"}</button>
        {idea.source==="community"&&(
          <button onClick={()=>user&&onLike(idea)} style={{background:"rgba(255,248,242,.7)",border:"1px solid rgba(198,168,94,.25)",borderRadius:14,padding:"6px 14px",fontSize:12,color:isLiked?C.plum:C.soft,fontFamily:"'Poppins',sans-serif",fontWeight:600,cursor:user?"pointer":"not-allowed",transition:"all .2s"}}>
            {isLiked?"❤️":"🤍"} {idea.likes||0}
          </button>
        )}
        {showShare&&user&&idea.source==="ai"&&(
          <button onClick={()=>onShareToCommunity(idea)} style={{background:"rgba(125,90,123,.1)",border:`1px solid ${C.plum}`,borderRadius:14,padding:"6px 14px",fontSize:12,color:C.plum,fontFamily:"'Poppins',sans-serif",fontWeight:600,cursor:"pointer"}}>✦ Share to community</button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  AUTH MODAL  (outside App)
// ─────────────────────────────────────────────────────────────────
const AuthModal = ({mode,onClose,onSwitch,onSuccess}) => {
  const [form,setForm] = useState({name:"",email:"",password:""});
  const [err,setErr]   = useState("");
  const [loading,setL] = useState(false);
  const handle = async () => {
    if(!form.email||!form.password){setErr("Please fill all fields 💌");return;}
    setL(true);setErr("");
    const existing = await DB.getUser(form.email);
    if(mode==="signup"){
      if(existing){setErr("Email already in registry 🌸");setL(false);return;}
      if(!form.name){setErr("Your name, please 💌");setL(false);return;}
      const user={id:`u_${Date.now()}`,name:form.name,email:form.email,password:form.password,role:"user",joined:Date.now()};
      await DB.saveUser(user);onSuccess(user);
    } else {
      if(!existing||existing.password!==form.password){setErr("Invalid credentials. Alas 🥀");setL(false);return;}
      onSuccess(existing);
    }
    setL(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(74,63,63,.45)",backdropFilter:"blur(6px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.ivory,borderRadius:24,padding:"38px 34px",width:"90%",maxWidth:400,border:"1.5px solid rgba(198,168,94,.3)",boxShadow:"0 20px 60px rgba(74,63,63,.2)"}}>
        <div style={{textAlign:"center",marginBottom:26}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:4,marginBottom:5}}>✦ OF LITTLE DELIGHTS ✦</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:C.ink,fontStyle:"italic"}}>{mode==="login"?"Welcome back, dearest":"Join the registry 💌"}</h2>
        </div>
        {mode==="signup"&&<input placeholder="Your name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={{...inpStyle,marginBottom:10}}/>}
        <input placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={{...inpStyle,marginBottom:10}} type="email"/>
        <input placeholder="Password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} style={{...inpStyle,marginBottom:12}} type="password"/>
        {err&&<p style={{color:"#a05",fontSize:12,fontFamily:"'Poppins',sans-serif",textAlign:"center",marginBottom:10}}>{err}</p>}
        <button onClick={handle} disabled={loading} style={{...btnStyle,width:"100%",padding:13,fontSize:14}}>
          {loading?"One moment…":mode==="login"?"Enter, Your Grace ✨":"Begin my story 🌸"}
        </button>
        <p onClick={onSwitch} style={{textAlign:"center",marginTop:14,fontFamily:"'Poppins',sans-serif",fontSize:12,color:C.soft,cursor:"pointer",textDecoration:"underline"}}>
          {mode==="login"?"No account yet? Sign up →":"Already registered? Sign in →"}
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  SHARE MODAL  (outside App)
// ─────────────────────────────────────────────────────────────────
const ShareModal = ({idea,onClose,onSubmit}) => {
  const [note,setNote] = useState("");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(74,63,63,.45)",backdropFilter:"blur(6px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.ivory,borderRadius:24,padding:"36px 32px",width:"90%",maxWidth:440,border:"1.5px solid rgba(198,168,94,.3)",boxShadow:"0 20px 60px rgba(74,63,63,.2)"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:4,marginBottom:5,textAlign:"center"}}>✦ SHARE WITH THE COMMUNITY ✦</div>
        <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.ink,fontStyle:"italic",textAlign:"center",marginBottom:6}}>{idea.title}</h3>
        <p style={{fontFamily:"'Poppins',sans-serif",fontSize:12,color:C.soft,textAlign:"center",marginBottom:18}}>This will be reviewed before going live. Add an optional note:</p>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. I made this for my bestie's birthday and she cried 🥹" style={{...inpStyle,minHeight:80,resize:"vertical",marginBottom:16}}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>onSubmit(idea,{note})} style={{...btnStyle,flex:1,padding:12,fontSize:14}}>Submit for Review 💌</button>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(198,168,94,.3)",borderRadius:14,padding:"12px 18px",fontFamily:"'Poppins',sans-serif",fontSize:13,color:C.soft,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────
//  SPARKLES  — triggers once when results appear
// ─────────────────────────────────────────────────────────────────
const Sparkles = ({trigger}) => {
  const [particles,setParticles] = useState([]);
  useEffect(()=>{
    if(!trigger)return;
    const pts = Array.from({length:10},(_,i)=>({
      id:i,
      x: 20 + Math.random()*60,
      y: 20 + Math.random()*60,
      size: 4 + Math.random()*5,
      delay: Math.random()*0.4,
      dur: 0.8 + Math.random()*0.6,
      char: ["✦","✧","·","❀","✿"][Math.floor(Math.random()*5)],
      color:["#C6A85E","#D8A7A7","#E6DDF2","#c6a85e88"][Math.floor(Math.random()*4)],
    }));
    setParticles(pts);
    const t = setTimeout(()=>setParticles([]),1800);
    return()=>clearTimeout(t);
  },[trigger]);
  if(!particles.length)return null;
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:200,overflow:"hidden"}}>
      {particles.map(p=>(
        <div key={p.id} style={{
          position:"absolute",
          left:`${p.x}%`,top:`${p.y}%`,
          fontSize:p.size,color:p.color,
          animation:`sparkleRise ${p.dur}s ease-out ${p.delay}s both`,
          fontFamily:"serif",lineHeight:1,
        }}>{p.char}</div>
      ))}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────
//  LOADER  (outside App)
// ─────────────────────────────────────────────────────────────────
const LOADER_LINES = ["Consulting the social registry of ideas… 🎻","The muses are deliberating… ✦","Penning your destiny with care… 💌","Cross-referencing your provisions… 🌸","Searching the community archives… ✦"];
const Loader = ({visible,items=[]}) => {
  const [l,setL]=useState(0);
  const [d,setD]=useState(".");
  useEffect(()=>{
    if(!visible)return;
    const t1=setInterval(()=>setL(x=>(x+1)%LOADER_LINES.length),1900);
    const t2=setInterval(()=>setD(x=>x.length>=3?".":x+"."),400);
    return()=>{clearInterval(t1);clearInterval(t2)};
  },[visible]);
  if(!visible)return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(255,248,242,.94)",backdropFilter:"blur(10px)",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18}}>
      <div style={{fontSize:40,animation:"sway 1.8s ease-in-out infinite"}}>🎻</div>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:21,color:C.ink,fontStyle:"italic",textAlign:"center",maxWidth:380,lineHeight:1.6}}>{LOADER_LINES[l]}{d}</p>
      {items.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",maxWidth:400}}>{items.map(i=><Chip key={i} label={i} bg={C.lavender}/>)}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  TOAST  (outside App)
// ─────────────────────────────────────────────────────────────────
const Toast = ({msg,visible}) => (
  <div style={{position:"fixed",bottom:28,left:"50%",transform:`translateX(-50%) translateY(${visible?0:40}px)`,opacity:visible?1:0,transition:"all .35s cubic-bezier(.34,1.56,.64,1)",background:C.ink,color:C.ivory,borderRadius:16,padding:"10px 22px",fontFamily:"'Poppins',sans-serif",fontSize:13,zIndex:1100,boxShadow:"0 6px 24px rgba(74,63,63,.25)",pointerEvents:"none",whiteSpace:"nowrap"}}>{msg}</div>
);

// ─────────────────────────────────────────────────────────────────
//  HOME PAGE  ← MOVED OUTSIDE App to fix the typing re-render bug
// ─────────────────────────────────────────────────────────────────
const HomePage = ({
  inputVal, onInputChange, onAddItem, onKeyDown,
  suggestions, items, filters, onRemoveItem,
  onAddQuick, onToggleFilter, onGenerate, onClear,
  inputRef,
}) => (
  <div style={{maxWidth:760,margin:"0 auto",padding:"54px 24px 80px",animation:"fadeUp .6s ease"}}>
    <div style={{textAlign:"center",marginBottom:46}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:5,marginBottom:14}}>✦ A MOST CURIOUS DISCOVERY ENGINE ✦</div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:38,color:C.ink,lineHeight:1.25,fontStyle:"italic",marginBottom:14,fontWeight:600}}>
        Dearest User,<br/>Reveal thy provisions…<br/><span style={{color:C.plum}}>and destiny shall respond 💌</span>
      </h1>
      <p style={{fontFamily:"'Poppins',sans-serif",fontSize:14,color:C.soft,lineHeight:1.7,maxWidth:480,margin:"0 auto"}}>
        Tell me what you have. Claude will conjure ideas from <em>exactly</em> what you own — plus surface real ideas shared by our community.
      </p>
    </div>

    <div style={{background:"rgba(255,255,255,.65)",backdropFilter:"blur(8px)",border:"1.5px solid rgba(198,168,94,.28)",borderRadius:24,padding:"28px",boxShadow:"0 8px 40px rgba(125,90,123,.1)"}}>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12.5,color:C.gold,letterSpacing:2,marginBottom:12}}>PRAY TELL, WHAT DO YOU POSSESS?</p>

      <div style={{display:"flex",gap:10,marginBottom:10}}>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e=>onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g., pen, old notebook, emotional instability…"
          style={{...inpStyle,flex:1,padding:"13px 16px"}}
        />
        <button onClick={onAddItem} style={btnStyle}>Add ✦</button>
      </div>

      {suggestions.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10,padding:"8px 10px",background:C.ivory,borderRadius:12,border:"1px solid rgba(198,168,94,.18)"}}>
          {suggestions.map(s=><span key={s} onClick={()=>onAddQuick(s)} style={{background:"rgba(212,167,167,.15)",border:"1px solid rgba(212,167,167,.3)",borderRadius:10,padding:"3px 11px",fontSize:12.5,cursor:"pointer",fontFamily:"'Poppins',sans-serif",color:C.ink}}>{s}</span>)}
        </div>
      )}

      <div style={{marginBottom:14}}>
        <p style={{fontFamily:"'Poppins',sans-serif",fontSize:10.5,color:C.soft,marginBottom:7,letterSpacing:.5}}>QUICK ADD →</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {QUICK_ITEMS.filter(q=>!items.includes(q)).slice(0,9).map(q=>(
            <span key={q} onClick={()=>onAddQuick(q)} style={{background:C.blush,borderRadius:12,padding:"4px 11px",fontSize:12,cursor:"pointer",fontFamily:"'Poppins',sans-serif",color:C.ink,border:"1px solid rgba(198,168,94,.2)"}}>{q}</span>
          ))}
        </div>
      </div>

      {items.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
          {items.map((it,i)=><Chip key={it} label={it} onRemove={()=>onRemoveItem(it)} bg={[C.blush,C.lavender,C.powder,C.sage][i%4]}/>)}
        </div>
      )}

      <div style={{marginBottom:18}}>
        <p style={{fontFamily:"'Poppins',sans-serif",fontSize:10.5,color:C.soft,marginBottom:7,letterSpacing:.5}}>FILTERS (OPTIONAL) →</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {FILTERS_DEF.map(f=>(
            <span key={f.id} onClick={()=>onToggleFilter(f.id)} style={{background:filters.includes(f.id)?"linear-gradient(135deg,#F4D6D6,#E6DDF2)":"rgba(255,248,242,.7)",border:`1.5px solid ${filters.includes(f.id)?C.rose:"rgba(198,168,94,.22)"}`,borderRadius:14,padding:"5px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Poppins',sans-serif",color:filters.includes(f.id)?C.plum:C.soft,fontWeight:filters.includes(f.id)?600:400,transition:"all .2s"}}>{f.label}</span>
          ))}
        </div>
      </div>

      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button onClick={onGenerate} disabled={!items.length} style={{...btnStyle,padding:"13px 30px",fontSize:15,opacity:items.length?1:.45,cursor:items.length?"pointer":"not-allowed"}}>
          Surprise Me, Your Grace ✨
        </button>
        {items.length>0&&<button onClick={onClear} style={{background:"transparent",border:"1px solid rgba(198,168,94,.3)",borderRadius:16,padding:"13px 18px",fontSize:13,fontFamily:"'Poppins',sans-serif",color:C.soft,cursor:"pointer"}}>Clear all</button>}
      </div>
    </div>

    <div style={{marginTop:48,textAlign:"center"}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:4,marginBottom:18}}>✦ HOW IT WORKS ✦</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
        {[
          {e:"📝",t:"Add your items",d:"Type anything you have — food, craft, clothes, random stuff"},
          {e:"🤖",t:"AI creates for you",d:"Claude generates ideas using only your exact items"},
          {e:"🌸",t:"Community matches",d:"Real ideas shared by others that fit your items too"},
          {e:"✦", t:"Save & share",d:"Like what Claude made? Share it to the community registry"},
        ].map((s,i)=>(
          <div key={i} style={{background:[C.blush,C.lavender,C.powder,C.sage][i],borderRadius:18,padding:"20px 14px",border:"1px solid rgba(198,168,94,.18)"}}>
            <div style={{fontSize:24,marginBottom:7}}>{s.e}</div>
            <h4 style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:C.ink,marginBottom:5,fontStyle:"italic"}}>{s.t}</h4>
            <p style={{fontFamily:"'Poppins',sans-serif",fontSize:11.5,color:C.soft}}>{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  RESULTS PAGE  (outside App)
// ─────────────────────────────────────────────────────────────────
const ResultsPage = ({aiIdeas,commIdeas,items,catFilter,setCatFilter,user,onSave,savedIds,onLike,onShareToCommunity,onGenerate,onBack}) => {
  const allResults = [
    ...aiIdeas,
    ...commIdeas.filter(c=>!aiIdeas.find(a=>a.title===c.title)),
  ].filter(i=>catFilter==="All"||i.category===catFilter);

  return (
    <div style={{maxWidth:1080,margin:"0 auto",padding:"36px 24px 80px",animation:"fadeUp .5s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:14,marginBottom:24}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:4,marginBottom:5}}>✦ YOUR RESULTS ✦</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.ink,fontStyle:"italic"}}>{aiIdeas.length} AI ideas + {commIdeas.length} community matches 💫</h2>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>{items.map((it,i)=><Chip key={it} label={it} bg={[C.blush,C.lavender,C.powder,C.sage][i%4]}/>)}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={onGenerate} style={{...btnStyle,fontSize:13,padding:"9px 16px"}}>🎲 New Ideas</button>
          <button onClick={onBack} style={{background:"transparent",border:"1px solid rgba(198,168,94,.3)",borderRadius:16,padding:"9px 14px",fontSize:13,fontFamily:"'Poppins',sans-serif",color:C.soft,cursor:"pointer"}}>← Back</button>
        </div>
      </div>

      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:20}}>
        {CATEGORIES.map(cat=>(
          <span key={cat} onClick={()=>setCatFilter(cat)} style={{background:catFilter===cat?"linear-gradient(135deg,#F4D6D6,#E6DDF2)":"rgba(255,255,255,.6)",border:`1.5px solid ${catFilter===cat?C.rose:"rgba(198,168,94,.22)"}`,borderRadius:14,padding:"5px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Poppins',sans-serif",color:catFilter===cat?C.plum:C.soft,fontWeight:catFilter===cat?600:400,transition:"all .2s"}}>{cat}</span>
        ))}
      </div>

      {aiIdeas.filter(i=>catFilter==="All"||i.category===catFilter).length>0&&(
        <div style={{marginBottom:28}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:C.gold,letterSpacing:3}}>✨ CONJURED FOR YOU BY AI</span>
            <div style={{flex:1,height:1,background:"rgba(198,168,94,.2)"}}/>
            <span style={{fontFamily:"'Poppins',sans-serif",fontSize:11,color:C.soft}}>from your exact items</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(282px,1fr))",gap:16}}>
            {aiIdeas.filter(i=>catFilter==="All"||i.category===catFilter).map((idea,i)=>(
              <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={onShareToCommunity} showShare={true}/>
            ))}
          </div>
        </div>
      )}

      {commIdeas.filter(i=>catFilter==="All"||i.category===catFilter).length>0&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:C.plum,letterSpacing:3}}>✦ FROM THE COMMUNITY REGISTRY</span>
            <div style={{flex:1,height:1,background:"rgba(125,90,123,.15)"}}/>
            <span style={{fontFamily:"'Poppins',sans-serif",fontSize:11,color:C.soft}}>match ≥ 40%</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(282px,1fr))",gap:16}}>
            {commIdeas.filter(i=>catFilter==="All"||i.category===catFilter).map((idea,i)=>(
              <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={onShareToCommunity} showShare={false}/>
            ))}
          </div>
        </div>
      )}

      {allResults.length===0&&(
        <div style={{textAlign:"center",padding:"50px 20px"}}>
          <div style={{fontSize:40,marginBottom:14}}>🥀</div>
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:C.soft,fontStyle:"italic"}}>Alas… nothing found for this category.</p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  COMMUNITY PAGE  (outside App)
// ─────────────────────────────────────────────────────────────────
const CommunityPage = ({allComm,user,onSave,savedIds,onLike,onGoHome}) => (
  <div style={{maxWidth:1080,margin:"0 auto",padding:"44px 24px 80px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:32}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:4,marginBottom:8}}>✦ THE COMMUNITY REGISTRY ✦</div>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:C.ink,fontStyle:"italic"}}>Ideas shared by the collective 🌸</h2>
      <p style={{fontFamily:"'Poppins',sans-serif",fontSize:13,color:C.soft,marginTop:6}}>Browse what others have created. Like your favourites. Get inspired.</p>
    </div>
    {allComm.length===0?(
      <div style={{textAlign:"center",padding:"50px 20px"}}>
        <div style={{fontSize:40,marginBottom:14}}>🌱</div>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,color:C.soft,fontStyle:"italic"}}>The registry is awaiting its first submissions.</p>
        <p style={{fontFamily:"'Poppins',sans-serif",fontSize:12.5,color:C.soft,marginTop:8}}>Search for ideas using your items, then share an AI idea to the community!</p>
      </div>
    ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(282px,1fr))",gap:16}}>
        {allComm.map((idea,i)=>(
          <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={()=>{}} showShare={false}/>
        ))}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  SAVED PAGE  (outside App)
// ─────────────────────────────────────────────────────────────────
const SavedPage = ({savedList,user,onSave,savedIds,onLike,onShareToCommunity,onGoHome}) => (
  <div style={{maxWidth:1060,margin:"0 auto",padding:"44px 24px 80px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:30}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:4,marginBottom:8}}>✦ YOUR COLLECTION ✦</div>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:27,color:C.ink,fontStyle:"italic"}}>
        {savedList.length>0?`${savedList.length} treasures saved 💖`:"Your collection awaits its first treasure 🤍"}
      </h2>
    </div>
    {savedList.length===0?(
      <div style={{textAlign:"center",padding:"50px 20px"}}>
        <div style={{fontSize:44,marginBottom:14}}>🥀</div>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:C.soft,fontStyle:"italic"}}>Nothing saved yet. Quite the tragedy.</p>
        <button onClick={onGoHome} style={{...btnStyle,marginTop:18,fontSize:14}}>Discover something lovely →</button>
      </div>
    ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(282px,1fr))",gap:16}}>
        {savedList.map((idea,i)=>(
          <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={onShareToCommunity} showShare={idea.source==="ai"}/>
        ))}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  PROFILE PAGE  (outside App)
// ─────────────────────────────────────────────────────────────────
const ProfilePage = ({user,savedList,histList,allComm,onLogin,onSignup,onLogout,onRerun}) => (
  <div style={{maxWidth:680,margin:"0 auto",padding:"44px 24px 80px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:28}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:4,marginBottom:8}}>✦ YOUR JOURNAL ✦</div>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:27,color:C.ink,fontStyle:"italic"}}>
        {user?`Welcome back, ${user.name.split(" ")[0]} 🌷`:"Your story starts here 💌"}
      </h2>
    </div>
    {!user?(
      <div style={{background:C.lavender,borderRadius:22,padding:"36px 28px",textAlign:"center",border:"1.5px solid rgba(198,168,94,.3)"}}>
        <div style={{fontSize:38,marginBottom:12}}>🔐</div>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,color:C.ink,fontStyle:"italic",marginBottom:20}}>Sign in to save ideas, track history, and share with the community.</p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onLogin} style={{...btnStyle,fontSize:14}}>Sign In ✨</button>
          <button onClick={onSignup} style={{...btnStyle,fontSize:14}}>Create Account 🌸</button>
        </div>
      </div>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:13}}>
        {[
          {l:"Ideas Saved",v:savedList.length,e:"💖"},
          {l:"Searches Made",v:histList.length,e:"🔍"},
          {l:"Community Contributions",v:allComm.filter(i=>i.submitted_by===user.id).length,e:"✦"},
        ].map((s,i)=>(
          <div key={i} style={{background:[C.blush,C.lavender,C.powder][i],borderRadius:18,padding:"18px 22px",border:"1px solid rgba(198,168,94,.2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.ink,fontStyle:"italic"}}>{s.e} {s.l}</span>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,color:C.plum,fontWeight:600}}>{s.v}</span>
          </div>
        ))}
        {histList.length>0&&(
          <div style={{background:"rgba(255,255,255,.55)",borderRadius:18,padding:"18px 22px",border:"1px solid rgba(198,168,94,.18)"}}>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:C.gold,letterSpacing:2,marginBottom:12}}>RECENT SEARCHES</p>
            {histList.slice(0,5).map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<4?"1px solid rgba(198,168,94,.12)":"none"}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{h.items.map(it=><Tag key={it} label={it}/>)}</div>
                <span style={{fontFamily:"'Poppins',sans-serif",fontSize:11,color:C.soft,whiteSpace:"nowrap",marginLeft:8}}>{h.count} ideas</span>
              </div>
            ))}
            <button onClick={onRerun} style={{...btnStyle,marginTop:12,fontSize:12.5,padding:"7px 16px"}}>Re-run last search ↩</button>
          </div>
        )}
        <button onClick={onLogout} style={{background:"transparent",border:"1px solid rgba(198,168,94,.3)",borderRadius:16,padding:"11px",fontFamily:"'Poppins',sans-serif",fontSize:13,color:C.soft,cursor:"pointer",textAlign:"center"}}>Bid farewell for now 👋</button>
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  ADMIN PAGE  (outside App)
// ─────────────────────────────────────────────────────────────────
const AdminPage = ({pending,onApprove,onReject}) => (
  <div style={{maxWidth:900,margin:"0 auto",padding:"44px 24px 80px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:28}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:4,marginBottom:8}}>✦ ADMIN PANEL ✦</div>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:27,color:C.ink,fontStyle:"italic"}}>The Review Chamber 🔍</h2>
      <p style={{fontFamily:"'Poppins',sans-serif",fontSize:13,color:C.soft,marginTop:5}}>{pending.length} idea{pending.length!==1?"s":""} awaiting approval</p>
    </div>
    {pending.length===0?(
      <div style={{textAlign:"center",padding:"40px",background:C.sage,borderRadius:20,border:"1px solid rgba(198,168,94,.2)"}}>
        <div style={{fontSize:36,marginBottom:12}}>✦</div>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,color:C.ink,fontStyle:"italic"}}>All submissions reviewed. The registry is in order.</p>
      </div>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {pending.map((idea,i)=>(
          <div key={idea.id} style={{background:CARD_BG[i%CARD_BG.length],borderRadius:20,padding:"22px",border:"1.5px solid rgba(198,168,94,.22)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:10}}>
              <div>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.ink,fontStyle:"italic",marginBottom:4}}>{idea.title}</h3>
                <p style={{fontFamily:"'Poppins',sans-serif",fontSize:12,color:C.soft}}>By {idea.submitted_by_name} · {idea.category}</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>onApprove(idea)} style={{...btnStyle,fontSize:13,padding:"8px 18px",background:"linear-gradient(135deg,#C9D8C5,#DCE7F3)"}}>✦ Approve</button>
                <button onClick={()=>onReject(idea.id)} style={{background:"rgba(160,80,80,.1)",border:"1px solid rgba(160,80,80,.3)",borderRadius:14,padding:"8px 16px",fontSize:13,color:"#a05",fontFamily:"'Poppins',sans-serif",cursor:"pointer"}}>🥀 Reject</button>
              </div>
            </div>
            <p style={{fontFamily:"'Poppins',sans-serif",fontSize:12.5,color:C.soft,marginBottom:8}}>{idea.genz_desc}</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:idea.note?8:0}}>
              {(idea.required_items||[]).map((it,j)=><Tag key={j} label={it}/>)}
            </div>
            {idea.note&&<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12.5,color:C.ink,fontStyle:"italic",marginTop:6}}>💌 "{idea.note}"</p>}
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  MAIN APP  — only state lives here now
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page,        setPage]        = useState("home");
  const [user,        setUser]        = useState(null);
  const [authModal,   setAuthModal]   = useState(null);
  const [inputVal,    setInputVal]    = useState("");
  const [items,       setItems]       = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [filters,     setFilters]     = useState([]);
  const [aiIdeas,     setAiIdeas]     = useState([]);
  const [commIdeas,   setCommIdeas]   = useState([]);
  const [allComm,     setAllComm]     = useState([]);
  const [savedList,   setSavedList]   = useState([]);
  const [histList,    setHistList]    = useState([]);
  const [pending,     setPending]     = useState([]);
  const [catFilter,   setCatFilter]   = useState("All");
  const [loading,     setLoading]     = useState(false);
  const [toast,       setToast]       = useState({msg:"",visible:false});
  const [shareModal,  setShareModal]  = useState(null);
  const [sparkTrigger,setSparkTrigger]= useState(0);
  const inputRef = useRef();

  useEffect(()=>{
    const stored = sessionStorage.getItem("old_user");
    if(stored){const u=JSON.parse(stored);setUser(u);loadUserData(u);}
    loadCommunityIdeas();
  },[]);

  const showToast = (msg) => {
    setToast({msg,visible:true});
    setTimeout(()=>setToast(t=>({...t,visible:false})),2200);
  };

  const loadUserData = async (u) => {
    const [saved,hist] = await Promise.all([DB.getSaved(u.id),DB.getHistory(u.id)]);
    setSavedList(saved);setHistList(hist);
    if(u.role==="admin"){const p=await DB.getPending();setPending(p);}
  };

  const loadCommunityIdeas = async () => {
    const ideas = await DB.getCommunityIdeas();
    setAllComm(ideas.filter(i=>i.status==="approved"));
  };

  const handleAuth = (u) => {
    setUser(u);sessionStorage.setItem("old_user",JSON.stringify(u));
    setAuthModal(null);loadUserData(u);
    showToast(`Welcome, ${u.name.split(" ")[0]} 🌸`);
  };

  const logout = () => {
    setUser(null);sessionStorage.removeItem("old_user");
    setSavedList([]);setHistList([]);setPending([]);
    setPage("home");showToast("Farewell, dearest 👋");
  };

  const handleInputChange = (v) => {
    setInputVal(v);
    if(v.length>1) setSuggestions(QUICK_ITEMS.filter(q=>q.toLowerCase().includes(v.toLowerCase())&&!items.includes(q)).slice(0,6));
    else setSuggestions([]);
  };
  const addItem = (item) => {
    const c=(item||inputVal).trim().toLowerCase();
    if(c&&!items.includes(c)) setItems(p=>[...p,c]);
    setInputVal("");setSuggestions([]);
  };
  const removeItem = (item) => setItems(p=>p.filter(x=>x!==item));
  const handleKeyDown = (e) => { if(e.key==="Enter"&&inputVal.trim()) addItem(inputVal); };
  const toggleFilter = (id) => setFilters(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  const generate = useCallback(async (currentItems=items) => {
    if(!currentItems.length) return;
    setLoading(true);setAiIdeas([]);setCommIdeas([]);

    const freshComm   = await DB.getCommunityIdeas();
    const freshApproved = freshComm.filter(i=>i.status==="approved");
    setAllComm(freshApproved);
    const matched = matchingCommunityIdeas(currentItems, freshApproved);
    setCommIdeas(matched);

    const filterInstructions = [
      filters.includes("hostel")      && "HOSTEL MODE: low effort, no oven, minimal equipment",
      filters.includes("no-cooking")  && "NO COOKING: zero heat required",
      filters.includes("budget")      && "BUDGET FRIENDLY: use only the items listed, no buying extras",
      filters.includes("gifting")     && "FOR SOMEONE ELSE: ideas should be gift-worthy",
      filters.includes("self-care")   && "SELF-CARE: ideas for personal enjoyment",
    ].filter(Boolean).join("\n");

    const prompt = `You are the creative soul of "Of Little Delights" — a Bridgerton-coded, Gen Z aesthetic idea app.

User has EXACTLY these items: ${currentItems.join(", ")}
${filterInstructions?`\nConstraints:\n${filterInstructions}`:""}

Generate exactly 5 creative ideas using ONLY subsets of these exact items. Do NOT require anything not in the list. Think recipes, DIY, outfits, gifts, self-care, repurposing — be non-obvious and creative.

Respond ONLY with valid JSON (no markdown fences, no extra text):
{"ideas":[{"title":"string","category":"Culinary Delights|Artistic Pursuits|Attire Affairs|Tokens of Affection|Curious Possessions","emoji":"single emoji","difficulty":"Effortless|A gentle endeavour|Suspiciously easy|Requires feelings|Meditative","time":"e.g. 15 mins","genz_desc":"1-2 sentences Gen Z + Bridgerton tone, witty and warm","uses_items":["only items from the user's exact list"],"optional_items":[],"steps":["step 1","step 2","step 3","step 4"]}]}`;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/generate`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data = await res.json();
      const text = data.content?.[0]?.text||"";
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      const ideas = (parsed.ideas||[]).map(i=>({...i,id:`ai_${Date.now()}_${Math.random().toString(36).slice(2)}`,source:"ai",score:100}));
      setAiIdeas(ideas);
      if(user){
        await DB.addHistory(user.id,currentItems,ideas.length+matched.length);
        const h=await DB.getHistory(user.id);setHistList(h);
      }
      setPage("results");
      setSparkTrigger(t=>t+1);
    } catch(e){
      console.error(e);
      showToast("Alas… something went awry 🥀 Try again.");
    }
    setLoading(false);
  },[items,filters,user]);

  const handleSave = async (idea) => {
    if(!user){setAuthModal("login");return;}
    const {saved,list} = await DB.toggleSave(user.id,idea);
    setSavedList(list);
    showToast(saved?"Saved to your collection 💖":"Removed from collection");
  };

  const handleLike = async (idea) => {
    if(!user){setAuthModal("login");return;}
    const result = await DB.likeIdea(idea.id,user.id);
    if(result){
      const updater = i=>i.id===idea.id?{...i,likes:result.likes,likers:result.likers}:i;
      setAllComm(p=>p.map(updater));
      setCommIdeas(p=>p.map(updater));
      showToast(result.liked?"Liked 💖":"Unliked");
    }
  };

  const handleShareToCommunity = (idea) => {
    if(!user){setAuthModal("login");return;}
    setShareModal(idea);
  };

  const submitToCommunity = async (idea,extra) => {
    const communityIdea = {...idea,id:`c_${Date.now()}_${Math.random().toString(36).slice(2)}`,source:"community",status:"pending",submitted_by:user.id,submitted_by_name:user.name,submitted_at:Date.now(),likes:0,likers:[],required_items:idea.uses_items||[],note:extra.note||""};
    await DB.submitForReview(communityIdea);
    setShareModal(null);
    showToast("Submitted for review 💌 Thank you, darling!");
  };

  const handleApprove = async (idea) => {
    await DB.approveIdea(idea);
    setPending(p=>p.filter(x=>x.id!==idea.id));
    setAllComm(p=>[...p,{...idea,status:"approved"}]);
    showToast("Idea approved ✦ Now live in the community!");
  };
  const handleReject = async (id) => {
    await DB.rejectIdea(id);
    setPending(p=>p.filter(x=>x.id!==id));
    showToast("Idea rejected 🥀");
  };

  const savedIds  = savedList.map(x=>x.id);
  const hasResults = aiIdeas.length>0||commIdeas.length>0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400;1,600&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=Poppins:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#FFF8F2;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
        @keyframes chipIn{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
        @keyframes sway{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(18px) rotate(-.4deg)}to{opacity:1;transform:none}}
        @keyframes sparkleRise{0%{opacity:0;transform:translateY(0) scale(.5)}30%
        {opacity:1;transform:translateY(-18px) scale(1.1)}100%
        {opacity:0;transform:translateY(-55px) scale(.7)}}input,textarea{transition:border-color .2s,box-shadow .2s;}
        input:focus,textarea:focus{border-color:#D8A7A7!important;box-shadow:0 0 0 3px rgba(216,167,167,.2)!important;outline:none;}
        button:not([disabled]):hover{transform:translateY(-2px)!important;box-shadow:0 6px 20px rgba(125,90,123,.2)!important;}
        @media(max-width:600px){h1{font-size:27px!important;}nav{padding:13px 16px!important;}}
      `}</style>

      <FloralBg/>
      <Loader visible={loading} items={items}/>
      <Toast msg={toast.msg} visible={toast.visible}/>

      {authModal&&(
        <AuthModal
          mode={authModal}
          onClose={()=>setAuthModal(null)}
          onSwitch={()=>setAuthModal(m=>m==="login"?"signup":"login")}
          onSuccess={handleAuth}
        />
      )}
      {shareModal&&(
        <ShareModal
          idea={shareModal}
          onClose={()=>setShareModal(null)}
          onSubmit={submitToCommunity}
        />
      )}

      <div style={{minHeight:"100vh",background:C.ivory,position:"relative",zIndex:1}}>
        {/* NAV */}
        <nav style={{position:"sticky",top:0,zIndex:100,background:"rgba(255,248,242,.9)",backdropFilter:"blur(14px)",borderBottom:"1px solid rgba(198,168,94,.2)"}}>
          <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"15px 28px",flexWrap:"wrap",gap:10}}>
            <div onClick={()=>setPage("home")} style={{cursor:"pointer"}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:4,marginBottom:1}}>✦ ✦ ✦</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,color:C.ink,fontWeight:600,fontStyle:"italic"}}>Of Little Delights</div>
            </div>
            <div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
              {[["Discover","home"],["Community","community"],["Saved","saved"],["My Journal","profile"],...(user?.role==="admin"?[["Admin 🔍","admin"]]:[])].map(([l,pg])=>(
                <span key={pg} onClick={()=>setPage(pg)} style={{fontFamily:"'Poppins',sans-serif",fontSize:13,fontWeight:500,cursor:"pointer",color:page===pg?C.plum:C.soft,borderBottom:page===pg?`1.5px solid ${C.plum}`:"none",paddingBottom:2,transition:"color .2s"}}>{l}</span>
              ))}
              {hasResults&&(
                <span onClick={()=>setPage("results")} style={{fontFamily:"'Poppins',sans-serif",fontSize:13,cursor:"pointer",color:page==="results"?C.plum:C.soft,borderBottom:page==="results"?`1.5px solid ${C.plum}`:"none",paddingBottom:2}}>Results</span>
              )}
              {user
                ?<span style={{fontFamily:"'Poppins',sans-serif",fontSize:12,color:C.soft}}>✿ {user.name.split(" ")[0]}</span>
                :<button onClick={()=>setAuthModal("login")} style={{...btnStyle,padding:"7px 18px",fontSize:13}}>Enter ✨</button>
              }
            </div>
          </div>
        </nav>

        {page==="home"&&(
          <HomePage
            inputVal={inputVal}
            onInputChange={handleInputChange}
            onAddItem={()=>addItem(inputVal)}
            onKeyDown={handleKeyDown}
            suggestions={suggestions}
            items={items}
            filters={filters}
            onRemoveItem={removeItem}
            onAddQuick={addItem}
            onToggleFilter={toggleFilter}
            onGenerate={()=>generate()}
            onClear={()=>setItems([])}
            inputRef={inputRef}
          />
        )}
        {page==="results"&&(
          <ResultsPage
            aiIdeas={aiIdeas}
            commIdeas={commIdeas}
            items={items}
            catFilter={catFilter}
            setCatFilter={setCatFilter}
            user={user}
            onSave={handleSave}
            savedIds={savedIds}
            onLike={handleLike}
            onShareToCommunity={handleShareToCommunity}
            onGenerate={()=>generate()}
            onBack={()=>setPage("home")}
          />
        )}
        {page==="community"&&(
          <CommunityPage
            allComm={allComm}
            user={user}
            onSave={handleSave}
            savedIds={savedIds}
            onLike={handleLike}
            onGoHome={()=>setPage("home")}
          />
        )}
        {page==="saved"&&(
          <SavedPage
            savedList={savedList}
            user={user}
            onSave={handleSave}
            savedIds={savedIds}
            onLike={handleLike}
            onShareToCommunity={handleShareToCommunity}
            onGoHome={()=>setPage("home")}
          />
        )}
        {page==="profile"&&(
          <ProfilePage
            user={user}
            savedList={savedList}
            histList={histList}
            allComm={allComm}
            onLogin={()=>setAuthModal("login")}
            onSignup={()=>setAuthModal("signup")}
            onLogout={logout}
            onRerun={()=>{if(histList[0]){setItems(histList[0].items);generate(histList[0].items);}}}
          />
        )}
        {page==="admin"&&user?.role==="admin"&&(
          <AdminPage
            pending={pending}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        <div style={{borderTop:"1px solid rgba(198,168,94,.18)",textAlign:"center",padding:"22px",fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.soft,fontStyle:"italic"}}>
          ✿ Of Little Delights · Where little things become rather lovely ✿
        </div>
      </div>
    </>
  );
}

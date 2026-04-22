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
//  LOCALSTORAGE HELPERS  (replaces window.storage — works in browsers)
// ─────────────────────────────────────────────────────────────────
const ls = {
  get: (key) => {
    if (typeof window === 'undefined') return null;
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  set: (key, value) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  del: (key) => {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(key); } catch {}
  },
  keys: (prefix) => {
    if (typeof window === 'undefined') return [];
    try {
      return Object.keys(localStorage).filter(k => k.startsWith(prefix));
    } catch { return []; }
  },
};

const DB = {
  getUser(email) {
    return ls.get(`user:${email}`);
  },
  saveUser(user) {
    ls.set(`user:${user.email}`, user);
  },
  getCommunityIdeas() {
    const keys = ls.keys("idea:");
    return keys.map(k => ls.get(k)).filter(Boolean);
  },
  saveIdea(idea) {
    ls.set(`idea:${idea.id}`, idea);
  },
  likeIdea(ideaId, userId) {
    const idea = ls.get(`idea:${ideaId}`);
    if (!idea) return null;
    const likers = idea.likers || [];
    const already = likers.includes(userId);
    idea.likers = already ? likers.filter(x => x !== userId) : [...likers, userId];
    idea.likes = idea.likers.length;
    ls.set(`idea:${ideaId}`, idea);
    return { liked: !already, likes: idea.likes, likers: idea.likers };
  },
  getSaved(userId) {
    return ls.get(`saved:${userId}`) || [];
  },
  toggleSave(userId, idea) {
    const saved = DB.getSaved(userId);
    const exists = saved.find(x => x.id === idea.id);
    const updated = exists ? saved.filter(x => x.id !== idea.id) : [...saved, idea];
    ls.set(`saved:${userId}`, updated);
    return { saved: !exists, list: updated };
  },
  addHistory(userId, items, count) {
    const hist = ls.get(`hist:${userId}`) || [];
    hist.unshift({ items, count, ts: Date.now() });
    ls.set(`hist:${userId}`, hist.slice(0, 20));
  },
  getHistory(userId) {
    return ls.get(`hist:${userId}`) || [];
  },
  getPending() {
    const keys = ls.keys("pending:");
    return keys.map(k => ls.get(k)).filter(Boolean);
  },
  submitForReview(idea) {
    ls.set(`pending:${idea.id}`, idea);
  },
  approveIdea(idea) {
    ls.del(`pending:${idea.id}`);
    const approved = { ...idea, status: "approved" };
    DB.saveIdea(approved);
    return approved;
  },
  rejectIdea(ideaId) {
    ls.del(`pending:${ideaId}`);
  },
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
  border:"1.5px solid rgba(198,168,94,.4)", borderRadius:4,
  padding:"11px 26px", fontFamily:"'Cormorant Garamond',serif",
  fontSize:15, color:C.ink, cursor:"pointer", fontWeight:600,
  fontStyle:"italic", transition:"all .3s ease",
  boxShadow:"0 2px 12px rgba(125,90,123,.1), inset 0 1px 0 rgba(255,255,255,.6)",
  letterSpacing:".3px",
};
const inpStyle = {
  background:"rgba(253,250,246,.92)",
  border:"1px solid rgba(198,168,94,.35)",
  borderBottom:"2px solid rgba(198,168,94,.5)",
  borderRadius:4,
  padding:"13px 16px", fontFamily:"'Cormorant Garamond',serif",
  fontSize:15, color:C.ink, outline:"none", width:"100%",
  boxSizing:"border-box", letterSpacing:".2px",
};

const FloralBg = () => (
  <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
    <div style={{position:"absolute",inset:0,background:"linear-gradient(160deg,#fdfaf6 0%,#f8f2eb 35%,#f5eef8 65%,#f0f4ee 100%)"}}/>
    <div style={{position:"absolute",top:"-15%",left:"-8%",width:"60vw",height:"60vw",borderRadius:"50%",background:"radial-gradient(circle,rgba(198,168,94,.06) 0%,transparent 65%)"}}/>
    <div style={{position:"absolute",bottom:"-15%",right:"-8%",width:"65vw",height:"65vw",borderRadius:"50%",background:"radial-gradient(circle,rgba(214,167,167,.07) 0%,transparent 65%)"}}/>
    <div style={{position:"absolute",top:"40%",right:"15%",width:"30vw",height:"30vw",borderRadius:"50%",background:"radial-gradient(circle,rgba(198,221,243,.06) 0%,transparent 70%)"}}/>
    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.025}}>
      <defs><pattern id="fp" width="140" height="140" patternUnits="userSpaceOnUse">
        <text x="10" y="30"  fontSize="18" fill={C.plum}>✿</text>
        <text x="70" y="75"  fontSize="11" fill={C.gold}>❀</text>
        <text x="100" y="22" fontSize="13" fill={C.rose}>✦</text>
        <text x="28" y="110" fontSize="9"  fill={C.plum}>❋</text>
        <text x="85" y="118" fontSize="15" fill={C.gold}>✿</text>
        <text x="50" y="58"  fontSize="7"  fill={C.rose}>·</text>
        <text x="118" y="90" fontSize="8"  fill={C.plum}>✧</text>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#fp)"/>
    </svg>
  </div>
);

const Sparkles = ({trigger}) => {
  const [particles,setParticles] = useState([]);
  useEffect(()=>{
    if(!trigger) return;
    const pts = Array.from({length:12},(_,i)=>({
      id:i,
      x: 10 + Math.random()*80,
      y: 10 + Math.random()*80,
      size: 5 + Math.random()*6,
      delay: Math.random()*0.5,
      dur: 1.0 + Math.random()*0.7,
      char: ["✦","✧","❀","✿","·","❋"][Math.floor(Math.random()*6)],
      color:["#C6A85E","#D8A7A7","#c6a85eaa","#7D5A7B55","#E6DDF2"][Math.floor(Math.random()*5)],
    }));
    setParticles(pts);
    const t = setTimeout(()=>setParticles([]),2200);
    return()=>clearTimeout(t);
  },[trigger]);
  if(!particles.length) return null;
  return(
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:200,overflow:"hidden"}}>
      {particles.map(p=>(
        <div key={p.id} style={{
          position:"absolute",
          left:`${p.x}%`, top:`${p.y}%`,
          fontSize:p.size, color:p.color,
          animation:`sparkleRise ${p.dur}s ease-out ${p.delay}s both`,
          fontFamily:"serif", lineHeight:1,
        }}>{p.char}</div>
      ))}
    </div>
  );
};

const Chip = ({label,onRemove,bg}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:5,background:bg||C.blush,color:C.ink,border:"1px solid rgba(198,168,94,.3)",borderRadius:20,padding:"4px 13px",fontSize:12.5,fontFamily:"'Cormorant Garamond',serif",fontWeight:500,animation:"chipIn .2s ease",letterSpacing:".2px"}}>
    {label}
    {onRemove&&<span onClick={onRemove} style={{cursor:"pointer",color:C.plum,fontWeight:700,fontSize:15,lineHeight:1}}>×</span>}
  </span>
);

const Tag = ({label}) => (
  <span style={{background:"rgba(125,90,123,.08)",border:"1px solid rgba(125,90,123,.18)",borderRadius:3,padding:"2px 9px",fontSize:11,color:C.plum,fontFamily:"'Cormorant Garamond',serif",letterSpacing:".3px"}}>{label}</span>
);

const SourceBadge = ({source,score}) => (
  <div style={{position:"absolute",top:14,right:14,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
    <span style={{background:source==="community"?"rgba(125,90,123,.12)":"rgba(198,168,94,.12)",border:`1px solid ${source==="community"?C.plum:C.gold}`,borderRadius:3,padding:"2px 9px",fontSize:10,color:source==="community"?C.plum:C.gold,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,letterSpacing:"1px"}}>
      {source==="community"?"✦ Community":"✨ AI"}
    </span>
    {score>0&&<span style={{fontSize:10,color:C.gold,fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic"}}>{score}% match</span>}
  </div>
);

const Divider = ({color=C.gold,label=""}) => (
  <div style={{display:"flex",alignItems:"center",gap:12,margin:"8px 0"}}>
    <div style={{flex:1,height:"1px",background:`linear-gradient(to right,transparent,${color}44,${color}88,${color}44,transparent)`}}/>
    {label&&<span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color,letterSpacing:3,whiteSpace:"nowrap"}}>{label}</span>}
    {label&&<div style={{flex:1,height:"1px",background:`linear-gradient(to left,transparent,${color}44,${color}88,${color}44,transparent)`}}/>}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  IDEA CARD
// ─────────────────────────────────────────────────────────────────
const IdeaCard = ({idea,idx,user,onSave,savedIds,onLike,onShareToCommunity,showShare}) => {
  const [open,setOpen]   = useState(false);
  const [hover,setHover] = useState(false);
  const bg = CARD_BG[idx%CARD_BG.length];
  const isLiked = (idea.likers||[]).includes(user?.id);
  const isSaved = savedIds.includes(idea.id);
  return (
    <div
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{
        background:bg, borderRadius:3, padding:"28px 24px 22px",
        border:`1px solid rgba(198,168,94,${hover?.5:.25})`,
        outline:`3px solid rgba(198,168,94,${hover?.12:.05})`,
        outlineOffset:"3px",
        boxShadow: hover
          ? "0 22px 55px rgba(125,90,123,.2), 0 4px 12px rgba(198,168,94,.15), inset 0 1px 0 rgba(255,255,255,.7)"
          : "0 6px 28px rgba(74,63,63,.09), 0 1px 4px rgba(198,168,94,.1), inset 0 1px 0 rgba(255,255,255,.5)",
        transform: hover ? "translateY(-7px) rotate(.2deg)" : "rotate(-.15deg)",
        transition:"all .4s cubic-bezier(.34,1.56,.64,1)",
        animation:`letterReveal .6s ease ${idx*.09}s both`,
        position:"relative", overflow:"hidden",
      }}
    >
      <div style={{position:"absolute",top:0,left:0,right:0,height:"3px",background:`linear-gradient(to right,transparent,rgba(198,168,94,.4),rgba(198,168,94,.7),rgba(198,168,94,.4),transparent)`}}/>
      <SourceBadge source={idea.source||"ai"} score={idea.score||0}/>
      <div style={{display:"inline-block",background:"rgba(255,248,242,.9)",border:"1px solid rgba(198,168,94,.3)",borderRadius:2,padding:"3px 11px",fontSize:10.5,color:C.plum,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,letterSpacing:"1px",marginBottom:12,textTransform:"uppercase"}}>
        {idea.emoji} {idea.category}
      </div>
      <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:C.ink,margin:"0 0 8px",lineHeight:1.3,fontStyle:"italic",paddingRight:85,letterSpacing:"-.2px"}}>{idea.title}</h3>
      <Divider/>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13.5,color:C.soft,margin:"10px 0 14px",lineHeight:1.7,fontStyle:"italic"}}>{idea.genz_desc}</p>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
        {[{i:"⏱",t:idea.time||idea.time_required},{i:"✦",t:idea.difficulty}].map((m,i)=>m.t&&(
          <span key={i} style={{background:"rgba(255,248,242,.75)",border:"1px solid rgba(198,168,94,.22)",borderRadius:2,padding:"3px 10px",fontSize:11,color:C.soft,fontFamily:"'Cormorant Garamond',serif",letterSpacing:".3px"}}>{m.i} {m.t}</span>
        ))}
      </div>
      {(idea.uses_items||idea.required_items||[]).length>0&&(
        <div style={{marginBottom:14}}>
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:9.5,color:C.gold,letterSpacing:2.5,marginBottom:7,textTransform:"uppercase"}}>Uses from your list</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {(idea.uses_items||idea.required_items).map((item,i)=>(
              <span key={i} style={{background:"rgba(255,255,255,.6)",border:"1px solid rgba(125,90,123,.18)",borderRadius:2,padding:"2px 9px",fontSize:11.5,color:C.ink,fontFamily:"'Cormorant Garamond',serif"}}>{item}</span>
            ))}
          </div>
        </div>
      )}
      {idea.source==="community"&&idea.submitted_by_name&&(
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11.5,color:C.soft,fontStyle:"italic",marginBottom:12}}>✿ Shared by {idea.submitted_by_name}</p>
      )}
      <div
        onClick={()=>setOpen(!open)}
        style={{background:"rgba(255,248,242,.8)",borderRadius:2,padding:"11px 15px",marginBottom:14,border:"1px solid rgba(198,168,94,.22)",borderLeft:`3px solid rgba(198,168,94,.5)`,cursor:"pointer",transition:"all .25s ease"}}
      >
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.plum,fontWeight:600,fontStyle:"italic",letterSpacing:".2px"}}>
          {open?"▾ The steps, dearest…":"▸ Reveal the steps 💌"}
        </div>
        {open&&(
          <ol style={{margin:"12px 0 0",paddingLeft:18}}>
            {(idea.steps||[]).map((s,i)=>(
              <li key={i} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.soft,marginBottom:7,lineHeight:1.65,fontStyle:"italic"}}>{s}</li>
            ))}
          </ol>
        )}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>user&&onSave(idea)} style={{background:isSaved?"linear-gradient(135deg,#F4D6D6,#E6DDF2)":"rgba(255,248,242,.8)",border:`1px solid ${isSaved?C.rose:"rgba(198,168,94,.3)"}`,borderRadius:3,padding:"6px 15px",fontSize:12,color:isSaved?C.plum:C.soft,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,cursor:user?"pointer":"not-allowed",transition:"all .2s",fontStyle:"italic"}}>
          {isSaved?"💖 Saved":"🤍 Save"}
        </button>
        {idea.source==="community"&&(
          <button onClick={()=>user&&onLike(idea)} style={{background:"rgba(255,248,242,.8)",border:"1px solid rgba(198,168,94,.25)",borderRadius:3,padding:"6px 15px",fontSize:12,color:isLiked?C.plum:C.soft,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,cursor:user?"pointer":"not-allowed",transition:"all .2s",fontStyle:"italic"}}>
            {isLiked?"❤️":"🤍"} {idea.likes||0}
          </button>
        )}
        {showShare&&user&&idea.source==="ai"&&(
          <button onClick={()=>onShareToCommunity(idea)} style={{background:"rgba(125,90,123,.08)",border:`1px solid ${C.plum}`,borderRadius:3,padding:"6px 15px",fontSize:12,color:C.plum,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,cursor:"pointer",fontStyle:"italic"}}>✦ Share</button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  AUTH MODAL
// ─────────────────────────────────────────────────────────────────
const AuthModal = ({mode,onClose,onSwitch,onSuccess}) => {
  const [form,setForm] = useState({name:"",email:"",password:""});
  const [err,setErr]   = useState("");
  const [loading,setL] = useState(false);
  const handle = () => {
    if(!form.email||!form.password){setErr("Please fill all fields 💌");return;}
    setL(true);setErr("");
    const existing = DB.getUser(form.email);
    if(mode==="signup"){
      if(existing){setErr("Email already in registry 🌸");setL(false);return;}
      if(!form.name){setErr("Your name, please 💌");setL(false);return;}
      const user={id:`u_${Date.now()}`,name:form.name,email:form.email,password:form.password,role:"user",joined:Date.now()};
      DB.saveUser(user);
      onSuccess(user);
    } else {
      if(!existing||existing.password!==form.password){setErr("Invalid credentials. Alas 🥀");setL(false);return;}
      onSuccess(existing);
    }
    setL(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(74,63,63,.5)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fdfaf6",borderRadius:4,padding:"44px 38px",width:"90%",maxWidth:400,border:"1px solid rgba(198,168,94,.35)",outline:"4px solid rgba(198,168,94,.08)",outlineOffset:4,boxShadow:"0 24px 70px rgba(74,63,63,.22), inset 0 1px 0 rgba(255,255,255,.8)",animation:"modalIn .4s cubic-bezier(.34,1.56,.64,1)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:9,color:C.gold,letterSpacing:5,marginBottom:10}}>✦ OF LITTLE DELIGHTS ✦</div>
          <Divider color={C.gold}/>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:25,color:C.ink,fontStyle:"italic",marginTop:14,letterSpacing:"-.3px"}}>{mode==="login"?"Welcome back, dearest":"Join the registry 💌"}</h2>
        </div>
        {mode==="signup"&&<input placeholder="Your name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={{...inpStyle,marginBottom:12}}/>}
        <input placeholder="Email address" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={{...inpStyle,marginBottom:12}} type="email"/>
        <input placeholder="Password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} style={{...inpStyle,marginBottom:14}} type="password"/>
        {err&&<p style={{color:"#a05",fontSize:12,fontFamily:"'Cormorant Garamond',serif",textAlign:"center",marginBottom:10,fontStyle:"italic"}}>{err}</p>}
        <button onClick={handle} disabled={loading} style={{...btnStyle,width:"100%",padding:14,fontSize:15}}>
          {loading?"One moment…":mode==="login"?"Enter, Your Grace ✨":"Begin my story 🌸"}
        </button>
        <p onClick={onSwitch} style={{textAlign:"center",marginTop:16,fontFamily:"'Cormorant Garamond',serif",fontSize:12.5,color:C.soft,cursor:"pointer",fontStyle:"italic"}}>
          {mode==="login"?"No account yet? Sign up →":"Already registered? Sign in →"}
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  SHARE MODAL
// ─────────────────────────────────────────────────────────────────
const ShareModal = ({idea,onClose,onSubmit}) => {
  const [note,setNote] = useState("");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(74,63,63,.5)",backdropFilter:"blur(8px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fdfaf6",borderRadius:4,padding:"40px 36px",width:"90%",maxWidth:440,border:"1px solid rgba(198,168,94,.35)",outline:"4px solid rgba(198,168,94,.08)",outlineOffset:4,boxShadow:"0 24px 70px rgba(74,63,63,.22)",animation:"modalIn .4s cubic-bezier(.34,1.56,.64,1)"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:9,color:C.gold,letterSpacing:5,marginBottom:10,textAlign:"center"}}>✦ SHARE WITH THE COMMUNITY ✦</div>
        <Divider color={C.gold}/>
        <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:21,color:C.ink,fontStyle:"italic",textAlign:"center",marginBottom:6,marginTop:14}}>{idea.title}</h3>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.soft,textAlign:"center",marginBottom:20,fontStyle:"italic"}}>This will be reviewed before going live. Add an optional note:</p>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. I made this for my bestie's birthday and she cried 🥹" style={{...inpStyle,minHeight:80,resize:"vertical",marginBottom:18,fontStyle:"italic"}}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>onSubmit(idea,{note})} style={{...btnStyle,flex:1,padding:13,fontSize:14}}>Submit for Review 💌</button>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(198,168,94,.3)",borderRadius:4,padding:"13px 20px",fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.soft,cursor:"pointer",fontStyle:"italic"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  LOADER
// ─────────────────────────────────────────────────────────────────
const LOADER_LINES = [
  "Consulting the social registry of ideas… 🎻",
  "The muses are deliberating… ✦",
  "Penning your destiny with care… 💌",
  "Cross-referencing your provisions… 🌸",
  "Searching the community archives… ✦",
];
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
    <div style={{position:"fixed",inset:0,background:"rgba(253,250,246,.96)",backdropFilter:"blur(14px)",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:22}}>
      <div style={{position:"absolute",inset:"10%",border:"1px solid rgba(198,168,94,.15)",borderRadius:4,pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:"10.5%",border:"1px solid rgba(198,168,94,.08)",borderRadius:4,pointerEvents:"none"}}/>
      <div style={{fontSize:44,animation:"sway 2s ease-in-out infinite"}}>🎻</div>
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:9,color:C.gold,letterSpacing:5,marginBottom:14}}>✦ PLEASE WAIT ✦</div>
        <p style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:C.ink,fontStyle:"italic",textAlign:"center",maxWidth:400,lineHeight:1.65}}>{LOADER_LINES[l]}{d}</p>
      </div>
      {items.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",maxWidth:420}}>
          {items.map(i=><Chip key={i} label={i} bg={C.lavender}/>)}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────────
const Toast = ({msg,visible}) => (
  <div style={{position:"fixed",bottom:30,left:"50%",transform:`translateX(-50%) translateY(${visible?0:44}px)`,opacity:visible?1:0,transition:"all .4s cubic-bezier(.34,1.56,.64,1)",background:"rgba(74,63,63,.95)",color:C.ivory,borderRadius:4,padding:"11px 24px",fontFamily:"'Cormorant Garamond',serif",fontSize:14,fontStyle:"italic",zIndex:1100,boxShadow:"0 8px 28px rgba(74,63,63,.3)",pointerEvents:"none",whiteSpace:"nowrap",border:"1px solid rgba(198,168,94,.3)"}}>{msg}</div>
);

// ─────────────────────────────────────────────────────────────────
//  HOME PAGE
// ─────────────────────────────────────────────────────────────────
const HomePage = ({inputVal,onInputChange,onAddItem,onKeyDown,suggestions,items,filters,onRemoveItem,onAddQuick,onToggleFilter,onGenerate,onClear,inputRef}) => (
  <div style={{maxWidth:780,margin:"0 auto",padding:"64px 24px 90px",animation:"fadeUp .7s ease"}}>
    <div style={{textAlign:"center",marginBottom:54}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:6,marginBottom:16}}>✦ A MOST CURIOUS DISCOVERY ENGINE ✦</div>
      <Divider color={C.gold}/>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:40,color:C.ink,lineHeight:1.22,fontStyle:"italic",margin:"24px 0 18px",fontWeight:600,letterSpacing:"-.5px"}}>
        Dearest User,<br/>Reveal thy provisions…<br/>
        <span style={{color:C.plum,fontSize:36}}>and destiny shall respond 💌</span>
      </h1>
      <Divider color={C.gold}/>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15.5,color:C.soft,lineHeight:1.75,maxWidth:500,margin:"20px auto 0",fontStyle:"italic"}}>
        Tell me what you have. The AI shall conjure ideas from <em>exactly</em> what you own — plus surface real ideas shared by our community.
      </p>
    </div>
    <div style={{background:"rgba(253,250,246,.85)",backdropFilter:"blur(12px)",border:"1px solid rgba(198,168,94,.3)",outline:"4px solid rgba(198,168,94,.06)",outlineOffset:4,borderRadius:4,padding:"34px 30px",boxShadow:"0 12px 50px rgba(125,90,123,.09), inset 0 1px 0 rgba(255,255,255,.8)"}}>
      <div style={{height:"2px",background:"linear-gradient(to right,transparent,rgba(198,168,94,.5),rgba(198,168,94,.8),rgba(198,168,94,.5),transparent)",marginBottom:24,borderRadius:1}}/>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:3,marginBottom:14,textTransform:"uppercase"}}>Pray tell, what do you possess?</p>
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        <input ref={inputRef} value={inputVal} onChange={e=>onInputChange(e.target.value)} onKeyDown={onKeyDown} placeholder="e.g., pen, old notebook, emotional instability…" style={{...inpStyle,flex:1,padding:"14px 18px",fontSize:14.5}}/>
        <button onClick={onAddItem} style={{...btnStyle,padding:"14px 24px"}}>Add ✦</button>
      </div>
      {suggestions.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12,padding:"10px 12px",background:"rgba(253,250,246,.9)",borderRadius:3,border:"1px solid rgba(198,168,94,.18)"}}>
          {suggestions.map(s=><span key={s} onClick={()=>onAddQuick(s)} style={{background:"rgba(212,167,167,.12)",border:"1px solid rgba(212,167,167,.28)",borderRadius:3,padding:"3px 12px",fontSize:13,cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",color:C.ink,fontStyle:"italic"}}>{s}</span>)}
        </div>
      )}
      <div style={{marginBottom:16}}>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.soft,marginBottom:8,letterSpacing:1.5,textTransform:"uppercase"}}>Quick add →</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {QUICK_ITEMS.filter(q=>!items.includes(q)).slice(0,9).map(q=>(
            <span key={q} onClick={()=>onAddQuick(q)} style={{background:"rgba(244,214,214,.5)",borderRadius:3,padding:"5px 12px",fontSize:12.5,cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",color:C.ink,border:"1px solid rgba(198,168,94,.18)",transition:"all .2s",fontStyle:"italic"}}>{q}</span>
          ))}
        </div>
      </div>
      {items.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18,padding:"12px",background:"rgba(255,255,255,.4)",borderRadius:3,border:"1px solid rgba(198,168,94,.14)"}}>
          {items.map((it,i)=><Chip key={it} label={it} onRemove={()=>onRemoveItem(it)} bg={[C.blush,C.lavender,C.powder,C.sage][i%4]}/>)}
        </div>
      )}
      <div style={{marginBottom:22}}>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.soft,marginBottom:8,letterSpacing:1.5,textTransform:"uppercase"}}>Filters (optional) →</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {FILTERS_DEF.map(f=>(
            <span key={f.id} onClick={()=>onToggleFilter(f.id)} style={{background:filters.includes(f.id)?"linear-gradient(135deg,#F4D6D6,#E6DDF2)":"rgba(253,250,246,.8)",border:`1px solid ${filters.includes(f.id)?C.rose:"rgba(198,168,94,.22)"}`,borderRadius:3,padding:"6px 15px",fontSize:12.5,cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",color:filters.includes(f.id)?C.plum:C.soft,fontWeight:filters.includes(f.id)?600:400,transition:"all .25s",fontStyle:"italic"}}>{f.label}</span>
          ))}
        </div>
      </div>
      <div style={{height:"1px",background:"linear-gradient(to right,transparent,rgba(198,168,94,.3),transparent)",marginBottom:22}}/>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={onGenerate} disabled={!items.length} style={{...btnStyle,padding:"14px 34px",fontSize:16,opacity:items.length?1:.4,cursor:items.length?"pointer":"not-allowed",letterSpacing:".4px"}}>
          Surprise Me, Your Grace ✨
        </button>
        {items.length>0&&<button onClick={onClear} style={{background:"transparent",border:"1px solid rgba(198,168,94,.28)",borderRadius:4,padding:"14px 20px",fontSize:13,fontFamily:"'Cormorant Garamond',serif",color:C.soft,cursor:"pointer",fontStyle:"italic"}}>Clear all</button>}
      </div>
    </div>
    <div style={{marginTop:60,textAlign:"center"}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:5,marginBottom:10}}>✦ HOW IT WORKS ✦</div>
      <Divider color={C.gold}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:14,marginTop:24}}>
        {[
          {e:"📝",t:"Add your items",d:"Type anything you have — food, craft, clothes, random stuff"},
          {e:"✨",t:"AI creates for you",d:"Conjures ideas using only your exact items"},
          {e:"🌸",t:"Community matches",d:"Real ideas shared by others that fit your items too"},
          {e:"✦",t:"Save & share",d:"Like what was conjured? Share it to the community registry"},
        ].map((s,i)=>(
          <div key={i} style={{background:[C.blush,C.lavender,C.powder,C.sage][i],borderRadius:3,padding:"24px 16px",border:"1px solid rgba(198,168,94,.18)",boxShadow:"0 3px 14px rgba(74,63,63,.06)"}}>
            <div style={{fontSize:26,marginBottom:10}}>{s.e}</div>
            <h4 style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:C.ink,marginBottom:6,fontStyle:"italic"}}>{s.t}</h4>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12.5,color:C.soft,lineHeight:1.6,fontStyle:"italic"}}>{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  RESULTS PAGE
// ─────────────────────────────────────────────────────────────────
const ResultsPage = ({aiIdeas,commIdeas,items,catFilter,setCatFilter,user,onSave,savedIds,onLike,onShareToCommunity,onGenerate,onBack}) => {
  const allResults = [
    ...aiIdeas,
    ...commIdeas.filter(c=>!aiIdeas.find(a=>a.title===c.title)),
  ].filter(i=>catFilter==="All"||i.category===catFilter);
  return (
    <div style={{maxWidth:1100,margin:"0 auto",padding:"44px 24px 90px",animation:"fadeUp .5s ease"}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:5,marginBottom:10}}>✦ YOUR RESULTS ✦</div>
        <Divider color={C.gold}/>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:C.ink,fontStyle:"italic",margin:"18px 0 10px",letterSpacing:"-.3px"}}>
          {aiIdeas.length} conjured ideas · {commIdeas.length} community matches 💫
        </h2>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginTop:10}}>
          {items.map((it,i)=><Chip key={it} label={it} bg={[C.blush,C.lavender,C.powder,C.sage][i%4]}/>)}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:18,flexWrap:"wrap"}}>
          <button onClick={onGenerate} style={{...btnStyle,fontSize:13,padding:"9px 20px"}}>🎲 New Ideas</button>
          <button onClick={onBack} style={{background:"transparent",border:"1px solid rgba(198,168,94,.3)",borderRadius:4,padding:"9px 16px",fontSize:13,fontFamily:"'Cormorant Garamond',serif",color:C.soft,cursor:"pointer",fontStyle:"italic"}}>← Back</button>
        </div>
      </div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:28,justifyContent:"center"}}>
        {CATEGORIES.map(cat=>(
          <span key={cat} onClick={()=>setCatFilter(cat)} style={{background:catFilter===cat?"linear-gradient(135deg,#F4D6D6,#E6DDF2)":"rgba(253,250,246,.8)",border:`1px solid ${catFilter===cat?C.rose:"rgba(198,168,94,.22)"}`,borderRadius:3,padding:"6px 15px",fontSize:12.5,cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",color:catFilter===cat?C.plum:C.soft,fontWeight:catFilter===cat?600:400,transition:"all .25s",fontStyle:"italic"}}>{cat}</span>
        ))}
      </div>
      {aiIdeas.filter(i=>catFilter==="All"||i.category===catFilter).length>0&&(
        <div style={{marginBottom:40}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <div style={{flex:1,height:"1px",background:"linear-gradient(to right,transparent,rgba(198,168,94,.4))"}}/>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.gold,letterSpacing:3,whiteSpace:"nowrap"}}>✨ CONJURED FOR YOU BY AI</span>
            <div style={{flex:1,height:"1px",background:"linear-gradient(to left,transparent,rgba(198,168,94,.4))"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:18}}>
            {aiIdeas.filter(i=>catFilter==="All"||i.category===catFilter).map((idea,i)=>(
              <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={onShareToCommunity} showShare={true}/>
            ))}
          </div>
        </div>
      )}
      {commIdeas.filter(i=>catFilter==="All"||i.category===catFilter).length>0&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <div style={{flex:1,height:"1px",background:"linear-gradient(to right,transparent,rgba(125,90,123,.3))"}}/>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:C.plum,letterSpacing:3,whiteSpace:"nowrap"}}>✦ FROM THE COMMUNITY REGISTRY</span>
            <div style={{flex:1,height:"1px",background:"linear-gradient(to left,transparent,rgba(125,90,123,.3))"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:18}}>
            {commIdeas.filter(i=>catFilter==="All"||i.category===catFilter).map((idea,i)=>(
              <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={onShareToCommunity} showShare={false}/>
            ))}
          </div>
        </div>
      )}
      {allResults.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:42,marginBottom:16}}>🥀</div>
          <p style={{fontFamily:"'Playfair Display',serif",fontSize:21,color:C.soft,fontStyle:"italic"}}>Alas… nothing found for this category.</p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  COMMUNITY PAGE
// ─────────────────────────────────────────────────────────────────
const CommunityPage = ({allComm,user,onSave,savedIds,onLike,onGoHome}) => (
  <div style={{maxWidth:1100,margin:"0 auto",padding:"54px 24px 90px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:40}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:5,marginBottom:10}}>✦ THE COMMUNITY REGISTRY ✦</div>
      <Divider color={C.gold}/>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:29,color:C.ink,fontStyle:"italic",margin:"18px 0 8px"}}>Ideas shared by the collective 🌸</h2>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:C.soft,fontStyle:"italic"}}>Browse what others have created. Like your favourites. Get inspired.</p>
    </div>
    {allComm.length===0?(
      <div style={{textAlign:"center",padding:"60px 20px"}}>
        <div style={{fontSize:42,marginBottom:16}}>🌱</div>
        <p style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:C.soft,fontStyle:"italic"}}>The registry is awaiting its first submissions.</p>
        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.soft,marginTop:8,fontStyle:"italic"}}>Search for ideas using your items, then share an AI idea to the community!</p>
      </div>
    ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:18}}>
        {allComm.map((idea,i)=>(
          <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={()=>{}} showShare={false}/>
        ))}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  SAVED PAGE
// ─────────────────────────────────────────────────────────────────
const SavedPage = ({savedList,user,onSave,savedIds,onLike,onShareToCommunity,onGoHome}) => (
  <div style={{maxWidth:1080,margin:"0 auto",padding:"54px 24px 90px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:36}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:5,marginBottom:10}}>✦ YOUR COLLECTION ✦</div>
      <Divider color={C.gold}/>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:C.ink,fontStyle:"italic",marginTop:18}}>
        {savedList.length>0?`${savedList.length} treasures saved 💖`:"Your collection awaits its first treasure 🤍"}
      </h2>
    </div>
    {savedList.length===0?(
      <div style={{textAlign:"center",padding:"60px 20px"}}>
        <div style={{fontSize:46,marginBottom:16}}>🥀</div>
        <p style={{fontFamily:"'Playfair Display',serif",fontSize:21,color:C.soft,fontStyle:"italic"}}>Nothing saved yet. Quite the tragedy.</p>
        <button onClick={onGoHome} style={{...btnStyle,marginTop:22,fontSize:14}}>Discover something lovely →</button>
      </div>
    ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:18}}>
        {savedList.map((idea,i)=>(
          <IdeaCard key={idea.id} idea={idea} idx={i} user={user} onSave={onSave} savedIds={savedIds} onLike={onLike} onShareToCommunity={onShareToCommunity} showShare={idea.source==="ai"}/>
        ))}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  PROFILE PAGE
// ─────────────────────────────────────────────────────────────────
const ProfilePage = ({user,savedList,histList,allComm,onLogin,onSignup,onLogout,onRerun}) => (
  <div style={{maxWidth:700,margin:"0 auto",padding:"54px 24px 90px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:34}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:5,marginBottom:10}}>✦ YOUR JOURNAL ✦</div>
      <Divider color={C.gold}/>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:C.ink,fontStyle:"italic",marginTop:18}}>
        {user?`Welcome back, ${user.name.split(" ")[0]} 🌷`:"Your story starts here 💌"}
      </h2>
    </div>
    {!user?(
      <div style={{background:C.lavender,borderRadius:4,padding:"40px 32px",textAlign:"center",border:"1px solid rgba(198,168,94,.3)",outline:"4px solid rgba(198,168,94,.06)",outlineOffset:4,boxShadow:"0 8px 32px rgba(125,90,123,.1)"}}>
        <div style={{fontSize:40,marginBottom:14}}>🔐</div>
        <p style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:C.ink,fontStyle:"italic",marginBottom:24,lineHeight:1.6}}>Sign in to save ideas, track history, and share with the community.</p>
        <div style={{display:"flex",gap:12,justifyContent:"center"}}>
          <button onClick={onLogin} style={{...btnStyle,fontSize:14}}>Sign In ✨</button>
          <button onClick={onSignup} style={{...btnStyle,fontSize:14}}>Create Account 🌸</button>
        </div>
      </div>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {[
          {l:"Ideas Saved",v:savedList.length,e:"💖"},
          {l:"Searches Made",v:histList.length,e:"🔍"},
          {l:"Community Contributions",v:allComm.filter(i=>i.submitted_by===user.id).length,e:"✦"},
        ].map((s,i)=>(
          <div key={i} style={{background:[C.blush,C.lavender,C.powder][i],borderRadius:3,padding:"20px 24px",border:"1px solid rgba(198,168,94,.2)",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 3px 12px rgba(74,63,63,.06)"}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:C.ink,fontStyle:"italic"}}>{s.e} {s.l}</span>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:30,color:C.plum,fontWeight:600}}>{s.v}</span>
          </div>
        ))}
        {histList.length>0&&(
          <div style={{background:"rgba(255,255,255,.6)",borderRadius:3,padding:"20px 24px",border:"1px solid rgba(198,168,94,.18)"}}>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:3,marginBottom:14,textTransform:"uppercase"}}>Recent Searches</p>
            {histList.slice(0,5).map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<4?"1px solid rgba(198,168,94,.1)":"none"}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{h.items.map(it=><Tag key={it} label={it}/>)}</div>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11.5,color:C.soft,whiteSpace:"nowrap",marginLeft:10,fontStyle:"italic"}}>{h.count} ideas</span>
              </div>
            ))}
            <button onClick={onRerun} style={{...btnStyle,marginTop:14,fontSize:13,padding:"8px 18px"}}>Re-run last search ↩</button>
          </div>
        )}
        <button onClick={onLogout} style={{background:"transparent",border:"1px solid rgba(198,168,94,.28)",borderRadius:4,padding:"13px",fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:C.soft,cursor:"pointer",textAlign:"center",fontStyle:"italic"}}>Bid farewell for now 👋</button>
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  ADMIN PAGE
// ─────────────────────────────────────────────────────────────────
const AdminPage = ({pending,onApprove,onReject}) => (
  <div style={{maxWidth:920,margin:"0 auto",padding:"54px 24px 90px",animation:"fadeUp .5s ease"}}>
    <div style={{textAlign:"center",marginBottom:34}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:5,marginBottom:10}}>✦ ADMIN PANEL ✦</div>
      <Divider color={C.gold}/>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:C.ink,fontStyle:"italic",marginTop:18}}>The Review Chamber 🔍</h2>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:C.soft,marginTop:6,fontStyle:"italic"}}>{pending.length} idea{pending.length!==1?"s":""} awaiting approval</p>
    </div>
    {pending.length===0?(
      <div style={{textAlign:"center",padding:"44px",background:C.sage,borderRadius:4,border:"1px solid rgba(198,168,94,.2)"}}>
        <div style={{fontSize:36,marginBottom:12}}>✦</div>
        <p style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.ink,fontStyle:"italic"}}>All submissions reviewed. The registry is in order.</p>
      </div>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {pending.map((idea,i)=>(
          <div key={idea.id} style={{background:CARD_BG[i%CARD_BG.length],borderRadius:3,padding:"24px",border:"1px solid rgba(198,168,94,.22)",outline:"3px solid rgba(198,168,94,.06)",outlineOffset:3}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
              <div>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.ink,fontStyle:"italic",marginBottom:4}}>{idea.title}</h3>
                <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12.5,color:C.soft,fontStyle:"italic"}}>By {idea.submitted_by_name} · {idea.category}</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>onApprove(idea)} style={{...btnStyle,fontSize:13,padding:"8px 18px",background:"linear-gradient(135deg,#C9D8C5,#DCE7F3)"}}>✦ Approve</button>
                <button onClick={()=>onReject(idea.id)} style={{background:"rgba(160,80,80,.08)",border:"1px solid rgba(160,80,80,.28)",borderRadius:4,padding:"8px 16px",fontSize:13,color:"#a05",fontFamily:"'Cormorant Garamond',serif",cursor:"pointer",fontStyle:"italic"}}>🥀 Reject</button>
              </div>
            </div>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.soft,marginBottom:10,fontStyle:"italic"}}>{idea.genz_desc}</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:idea.note?8:0}}>
              {(idea.required_items||[]).map((it,j)=><Tag key={j} label={it}/>)}
            </div>
            {idea.note&&<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12.5,color:C.ink,fontStyle:"italic",marginTop:8}}>💌 "{idea.note}"</p>}
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  MAIN APP
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
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem("old_user");
    if(stored){
      try {
        const u = JSON.parse(stored);
        setUser(u);
        loadUserData(u);
      } catch {}
    }
    loadCommunityIdeas();
  },[]);

  const showToast = (msg) => {
    setToast({msg,visible:true});
    setTimeout(()=>setToast(t=>({...t,visible:false})),2400);
  };

  const loadUserData = (u) => {
    const saved = DB.getSaved(u.id);
    const hist  = DB.getHistory(u.id);
    setSavedList(saved);
    setHistList(hist);
    if(u.role==="admin"){
      setPending(DB.getPending());
    }
  };

  const loadCommunityIdeas = () => {
    const ideas = DB.getCommunityIdeas();
    setAllComm(ideas.filter(i=>i.status==="approved"));
  };

  const handleAuth = (u) => {
    setUser(u);
    if (typeof window !== 'undefined') sessionStorage.setItem("old_user", JSON.stringify(u));
    setAuthModal(null);
    loadUserData(u);
    showToast(`Welcome, ${u.name.split(" ")[0]} 🌸`);
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== 'undefined') sessionStorage.removeItem("old_user");
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

    const freshComm     = DB.getCommunityIdeas();
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      const data = await res.json();
const text = data.result;
      const ideas = (parsed.ideas||[]).map(i=>({
        ...i,
        id:`ai_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        source:"ai",
        score:100
      }));
      setAiIdeas(ideas);
      if(user){
        DB.addHistory(user.id, currentItems, ideas.length + matched.length);
        setHistList(DB.getHistory(user.id));
      }
      setPage("results");
      setSparkTrigger(t=>t+1);
    }
    let ideas = [];

try {
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  ideas = (parsed.ideas || []).map(i => ({
    ...i,
    id: `ai_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    source: "ai",
  }));

} catch (e) {
  console.error("Parsing failed, raw text:", text);
  console.error(e);
  showToast("Alas... something went awry. Try again.");
}
    setLoading(false);
  },[items,filters,user]);

  const handleSave = (idea) => {
    if(!user){setAuthModal("login");return;}
    const {saved,list} = DB.toggleSave(user.id, idea);
    setSavedList(list);
    showToast(saved?"Saved to your collection 💖":"Removed from collection");
  };

  const handleLike = (idea) => {
    if(!user){setAuthModal("login");return;}
    const result = DB.likeIdea(idea.id, user.id);
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

  const submitToCommunity = (idea, extra) => {
    const communityIdea = {
      ...idea,
      id:`c_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      source:"community", status:"pending",
      submitted_by:user.id, submitted_by_name:user.name,
      submitted_at:Date.now(), likes:0, likers:[],
      required_items:idea.uses_items||[],
      note:extra.note||""
    };
    DB.submitForReview(communityIdea);
    setShareModal(null);
    showToast("Submitted for review 💌 Thank you, darling!");
  };

  const handleApprove = (idea) => {
    const approved = DB.approveIdea(idea);
    setPending(p=>p.filter(x=>x.id!==idea.id));
    setAllComm(p=>[...p, approved]);
    showToast("Idea approved ✦ Now live in the community!");
  };

  const handleReject = (id) => {
    DB.rejectIdea(id);
    setPending(p=>p.filter(x=>x.id!==id));
    showToast("Idea rejected 🥀");
  };

  const savedIds   = savedList.map(x=>x.id);
  const hasResults = aiIdeas.length>0||commIdeas.length>0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,400;1,600&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=Poppins:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#fdfaf6;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
        @keyframes chipIn{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}
        @keyframes sway{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}
        @keyframes letterReveal{from{opacity:0;transform:translateY(32px) rotate(-1.2deg) scale(.97);filter:blur(1.5px)}to{opacity:1;transform:translateY(0) rotate(0) scale(1);filter:blur(0)}}
        @keyframes sparkleRise{0%{opacity:0;transform:translateY(0) scale(.4) rotate(0deg)}30%{opacity:1;transform:translateY(-22px) scale(1.15) rotate(15deg)}100%{opacity:0;transform:translateY(-65px) scale(.65) rotate(30deg)}}
        @keyframes modalIn{from{opacity:0;transform:scale(.93) translateY(18px)}to{opacity:1;transform:none}}
        @keyframes navGlow{0%,100%{box-shadow:0 1px 0 rgba(198,168,94,.15)}50%{box-shadow:0 1px 0 rgba(198,168,94,.35)}}
        input,textarea{transition:border-color .25s,box-shadow .25s;}
        input:focus,textarea:focus{border-color:#D8A7A7!important;border-bottom-color:#C6A85E!important;box-shadow:0 0 0 3px rgba(216,167,167,.15)!important;outline:none;}
        button:not([disabled]):hover{transform:translateY(-2px)!important;box-shadow:0 8px 24px rgba(125,90,123,.22)!important;}
        @media(max-width:600px){h1{font-size:28px!important;}nav{padding:12px 16px!important;}}
      `}</style>

      <FloralBg/>
      <Loader visible={loading} items={items}/>
      <Toast msg={toast.msg} visible={toast.visible}/>
      <Sparkles trigger={sparkTrigger}/>

      {authModal&&(
        <AuthModal mode={authModal} onClose={()=>setAuthModal(null)} onSwitch={()=>setAuthModal(m=>m==="login"?"signup":"login")} onSuccess={handleAuth}/>
      )}
      {shareModal&&(
        <ShareModal idea={shareModal} onClose={()=>setShareModal(null)} onSubmit={submitToCommunity}/>
      )}

      <div style={{minHeight:"100vh",background:"transparent",position:"relative",zIndex:1}}>
        <nav style={{position:"sticky",top:0,zIndex:100,background:"rgba(253,250,246,.92)",backdropFilter:"blur(18px)",borderBottom:"1px solid rgba(198,168,94,.22)",animation:"navGlow 4s ease-in-out infinite"}}>
          <div style={{height:"2px",background:"linear-gradient(to right,transparent,rgba(198,168,94,.35),rgba(198,168,94,.6),rgba(198,168,94,.35),transparent)"}}/>
          <div style={{maxWidth:1120,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 30px",flexWrap:"wrap",gap:10}}>
            <div onClick={()=>setPage("home")} style={{cursor:"pointer"}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:9,color:C.gold,letterSpacing:5,marginBottom:2}}>✦ ✦ ✦</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.ink,fontWeight:600,fontStyle:"italic",letterSpacing:"-.3px"}}>Of Little Delights</div>
            </div>
            <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
              {[["Discover","home"],["Community","community"],["Saved","saved"],["My Journal","profile"],...(user?.role==="admin"?[["Admin 🔍","admin"]]:[])].map(([l,pg])=>(
                <span key={pg} onClick={()=>setPage(pg)} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,fontWeight:600,cursor:"pointer",color:page===pg?C.plum:C.soft,borderBottom:page===pg?`1.5px solid ${C.plum}`:"none",paddingBottom:2,transition:"color .2s",fontStyle:"italic",letterSpacing:".3px"}}>{l}</span>
              ))}
              {hasResults&&(
                <span onClick={()=>setPage("results")} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,cursor:"pointer",color:page==="results"?C.plum:C.soft,borderBottom:page==="results"?`1.5px solid ${C.plum}`:"none",paddingBottom:2,fontStyle:"italic"}}>Results</span>
              )}
              {user
                ?<span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.soft,fontStyle:"italic"}}>✿ {user.name.split(" ")[0]}</span>
                :<button onClick={()=>setAuthModal("login")} style={{...btnStyle,padding:"8px 20px",fontSize:13}}>Enter ✨</button>
              }
            </div>
          </div>
        </nav>

        {page==="home"&&<HomePage inputVal={inputVal} onInputChange={handleInputChange} onAddItem={()=>addItem(inputVal)} onKeyDown={handleKeyDown} suggestions={suggestions} items={items} filters={filters} onRemoveItem={removeItem} onAddQuick={addItem} onToggleFilter={toggleFilter} onGenerate={()=>generate()} onClear={()=>setItems([])} inputRef={inputRef}/>}
        {page==="results"&&<ResultsPage aiIdeas={aiIdeas} commIdeas={commIdeas} items={items} catFilter={catFilter} setCatFilter={setCatFilter} user={user} onSave={handleSave} savedIds={savedIds} onLike={handleLike} onShareToCommunity={handleShareToCommunity} onGenerate={()=>generate()} onBack={()=>setPage("home")}/>}
        {page==="community"&&<CommunityPage allComm={allComm} user={user} onSave={handleSave} savedIds={savedIds} onLike={handleLike} onGoHome={()=>setPage("home")}/>}
        {page==="saved"&&<SavedPage savedList={savedList} user={user} onSave={handleSave} savedIds={savedIds} onLike={handleLike} onShareToCommunity={handleShareToCommunity} onGoHome={()=>setPage("home")}/>}
        {page==="profile"&&<ProfilePage user={user} savedList={savedList} histList={histList} allComm={allComm} onLogin={()=>setAuthModal("login")} onSignup={()=>setAuthModal("signup")} onLogout={logout} onRerun={()=>{if(histList[0]){setItems(histList[0].items);generate(histList[0].items);}}}/>}
        {page==="admin"&&user?.role==="admin"&&<AdminPage pending={pending} onApprove={handleApprove} onReject={handleReject}/>}

        <div style={{borderTop:"1px solid rgba(198,168,94,.18)",textAlign:"center",padding:"28px",background:"rgba(253,250,246,.6)"}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:C.gold,letterSpacing:4,marginBottom:6}}>✦ ✦ ✦</div>
          <p style={{fontFamily:"'Playfair Display',serif",fontSize:13.5,color:C.soft,fontStyle:"italic"}}>Of Little Delights · Where little things become rather lovely</p>
        </div>
      </div>
    </>
  );
}

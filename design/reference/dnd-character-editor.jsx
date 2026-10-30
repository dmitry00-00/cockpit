import { useState, useEffect, useMemo, useCallback } from "react";

// ═══ GAME DATA (from xlsx structure) ═══
const RACES = [
  { name:"Human", icon:"👤", speed:30, size:"Medium", traits:["Extra Language"], mods:{str:1,dex:1,con:1,int:1,wis:1,cha:1} },
  { name:"Elf (High)", icon:"🧝", speed:30, size:"Medium", traits:["Darkvision","Fey Ancestry","Trance","Cantrip"], mods:{dex:2,int:1} },
  { name:"Elf (Wood)", icon:"🧝", speed:35, size:"Medium", traits:["Darkvision","Fey Ancestry","Trance","Fleet of Foot","Mask of the Wild"], mods:{dex:2,wis:1} },
  { name:"Dwarf (Hill)", icon:"⛏", speed:25, size:"Medium", traits:["Darkvision","Dwarven Resilience","Stonecunning","+1 HP/level"], mods:{con:2,wis:1} },
  { name:"Dwarf (Mountain)", icon:"⛏", speed:25, size:"Medium", traits:["Darkvision","Dwarven Resilience","Stonecunning","Armor Prof"], mods:{con:2,str:2} },
  { name:"Halfling (Lightfoot)", icon:"🧑", speed:25, size:"Small", traits:["Lucky","Brave","Halfling Nimbleness","Naturally Stealthy"], mods:{dex:2,cha:1} },
  { name:"Halfling (Stout)", icon:"🧑", speed:25, size:"Small", traits:["Lucky","Brave","Halfling Nimbleness","Stout Resilience"], mods:{dex:2,con:1} },
  { name:"Gnome (Rock)", icon:"🎩", speed:25, size:"Small", traits:["Darkvision","Gnome Cunning","Tinker"], mods:{int:2,con:1} },
  { name:"Half-Elf", icon:"🧝", speed:30, size:"Medium", traits:["Darkvision","Fey Ancestry","2 Free Skills","+1 to two abilities"], mods:{cha:2} },
  { name:"Half-Orc", icon:"👹", speed:30, size:"Medium", traits:["Darkvision","Menacing","Relentless Endurance","Savage Attacks"], mods:{str:2,con:1} },
  { name:"Dragonborn", icon:"🐲", speed:30, size:"Medium", traits:["Breath Weapon","Damage Resistance"], mods:{str:2,cha:1} },
  { name:"Tiefling", icon:"😈", speed:30, size:"Medium", traits:["Darkvision","Hellish Resistance","Infernal Legacy"], mods:{cha:2,int:1} },
];

const CLASSES = [
  { name:"Barbarian", icon:"🪓", hd:12, saves:["str","con"], numSkills:2, skills:["Animal Handling","Athletics","Intimidation","Nature","Perception","Survival"] },
  { name:"Bard", icon:"🎵", hd:8, saves:["dex","cha"], numSkills:3, skills:["Acrobatics","Animal Handling","Arcana","Athletics","Deception","History","Insight","Intimidation","Investigation","Medicine","Nature","Perception","Performance","Persuasion","Religion","Sleight of Hand","Stealth","Survival"] },
  { name:"Cleric", icon:"⛪", hd:8, saves:["wis","cha"], numSkills:2, skills:["History","Insight","Medicine","Persuasion","Religion"] },
  { name:"Druid", icon:"🌿", hd:8, saves:["int","wis"], numSkills:2, skills:["Arcana","Animal Handling","Insight","Medicine","Nature","Perception","Religion","Survival"] },
  { name:"Fighter", icon:"⚔", hd:10, saves:["str","con"], numSkills:2, skills:["Acrobatics","Animal Handling","Athletics","History","Insight","Intimidation","Perception","Survival"] },
  { name:"Monk", icon:"👊", hd:8, saves:["str","dex"], numSkills:2, skills:["Acrobatics","Athletics","History","Insight","Religion","Stealth"] },
  { name:"Paladin", icon:"🛡", hd:10, saves:["wis","cha"], numSkills:2, skills:["Athletics","Insight","Intimidation","Medicine","Persuasion","Religion"] },
  { name:"Ranger", icon:"🏹", hd:10, saves:["str","dex"], numSkills:3, skills:["Animal Handling","Athletics","Insight","Investigation","Nature","Perception","Stealth","Survival"] },
  { name:"Rogue", icon:"🗡", hd:8, saves:["dex","int"], numSkills:4, skills:["Acrobatics","Athletics","Deception","Insight","Intimidation","Investigation","Perception","Performance","Persuasion","Sleight of Hand","Stealth"] },
  { name:"Sorcerer", icon:"✨", hd:6, saves:["con","cha"], numSkills:2, skills:["Arcana","Deception","Insight","Intimidation","Persuasion","Religion"] },
  { name:"Warlock", icon:"🔮", hd:8, saves:["wis","cha"], numSkills:2, skills:["Arcana","Deception","History","Intimidation","Investigation","Nature","Religion"] },
  { name:"Wizard", icon:"🧙", hd:6, saves:["int","wis"], numSkills:2, skills:["Arcana","History","Insight","Investigation","Medicine","Religion"] },
];

const BACKGROUNDS = [
  { name:"Acolyte", skills:["Insight","Religion"] },
  { name:"Criminal", skills:["Deception","Stealth"] },
  { name:"Folk Hero", skills:["Animal Handling","Survival"] },
  { name:"Noble", skills:["History","Persuasion"] },
  { name:"Outlander", skills:["Athletics","Survival"] },
  { name:"Sage", skills:["Arcana","History"] },
  { name:"Sailor", skills:["Athletics","Perception"] },
  { name:"Soldier", skills:["Athletics","Intimidation"] },
  { name:"Urchin", skills:["Sleight of Hand","Stealth"] },
  { name:"Hermit", skills:["Medicine","Religion"] },
];

const ALL_SKILLS = [
  { name:"Athletics", ab:"str", icon:"💪" },
  { name:"Acrobatics", ab:"dex", icon:"🤸" },
  { name:"Sleight of Hand", ab:"dex", icon:"🃏" },
  { name:"Stealth", ab:"dex", icon:"🌑" },
  { name:"Arcana", ab:"int", icon:"✨" },
  { name:"History", ab:"int", icon:"📜" },
  { name:"Investigation", ab:"int", icon:"🔍" },
  { name:"Nature", ab:"int", icon:"🌿" },
  { name:"Religion", ab:"int", icon:"🕯" },
  { name:"Animal Handling", ab:"wis", icon:"🐾" },
  { name:"Insight", ab:"wis", icon:"👁" },
  { name:"Medicine", ab:"wis", icon:"💊" },
  { name:"Perception", ab:"wis", icon:"👀" },
  { name:"Survival", ab:"wis", icon:"🔥" },
  { name:"Deception", ab:"cha", icon:"🎭" },
  { name:"Intimidation", ab:"cha", icon:"💀" },
  { name:"Performance", ab:"cha", icon:"🎵" },
  { name:"Persuasion", ab:"cha", icon:"💬" },
];

const AB_KEYS = ["str","dex","con","int","wis","cha"];
const AB_COL = {str:"#c0392b",dex:"#27ae60",con:"#d4813a",int:"#2980b9",wis:"#8e44ad",cha:"#c9a44a"};
const AB_GROUPS = [{ab:"str",col:"#c0392b"},{ab:"dex",col:"#27ae60"},{ab:"int",col:"#2980b9"},{ab:"wis",col:"#8e44ad"},{ab:"cha",col:"#c9a44a"}];
const mod = (s) => Math.floor((s-10)/2);
const fmtMod = (m) => m >= 0 ? `+${m}` : `${m}`;
const PB_COST = {8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
const fontUrl = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";

export default function Editor() {
  const [name, setName] = useState("New Hero");
  const [raceIdx, setRaceIdx] = useState(5); // Lightfoot Halfling
  const [classIdx, setClassIdx] = useState(7); // Ranger
  const [bgIdx, setBgIdx] = useState(4); // Outlander
  const [scores, setScores] = useState({str:15,dex:15,con:13,int:12,wis:10,cha:8});
  const [classSkills, setClassSkills] = useState(["Stealth","Nature","Animal Handling"]);
  const [loaded, setLoaded] = useState(false);
  const [showRace, setShowRace] = useState(false);
  const [showClass, setShowClass] = useState(false);
  const [showBg, setShowBg] = useState(false);

  useEffect(() => {
    const l = document.createElement("link"); l.href = fontUrl; l.rel = "stylesheet";
    document.head.appendChild(l); setTimeout(() => setLoaded(true), 80);
    return () => document.head.removeChild(l);
  }, []);

  const race = RACES[raceIdx];
  const cls = CLASSES[classIdx];
  const bg = BACKGROUNDS[bgIdx];

  const pointsUsed = useMemo(() => AB_KEYS.reduce((s,k) => s + (PB_COST[scores[k]]||0), 0), [scores]);
  const pointsLeft = 27 - pointsUsed;

  const finalScores = useMemo(() => {
    const f = {};
    AB_KEYS.forEach(k => { f[k] = scores[k] + (race.mods[k] || 0); });
    return f;
  }, [scores, race]);

  const allProfSkills = useMemo(() => {
    const s = new Set([...classSkills, ...bg.skills]);
    return s;
  }, [classSkills, bg]);

  const canPickSkill = (sk) => cls.skills.includes(sk) && !bg.skills.includes(sk);
  const classSkillsLeft = cls.numSkills - classSkills.filter(s => !bg.skills.includes(s)).length;

  const toggleClassSkill = (sk) => {
    if (bg.skills.includes(sk)) return;
    if (classSkills.includes(sk)) {
      setClassSkills(c => c.filter(x => x !== sk));
    } else if (classSkillsLeft > 0) {
      setClassSkills(c => [...c, sk]);
    }
  };

  const incScore = (k) => {
    setScores(s => {
      const nv = s[k] + 1;
      if (nv > 15) return s;
      const cost = (PB_COST[nv]||0) - (PB_COST[s[k]]||0);
      if (cost > pointsLeft) return s;
      return {...s, [k]: nv};
    });
  };
  const decScore = (k) => {
    setScores(s => {
      if (s[k] <= 8) return s;
      return {...s, [k]: s[k]-1};
    });
  };

  const maxHp = cls.hd + mod(finalScores.con);
  const ac = 10 + mod(finalScores.dex);
  const pb = 2;

  if (!loaded) return null;

  return (
    <div className="R">
      <style>{`
        .R{--bg:#1a1118;--cd:#2a2030;--pn:#1e1626;--br:#8b6b3a;--bl:#c9a44a;--bd:#5a4630;--tx:#e8d5b0;--t2:#a89478;--t3:#6a5a48;--gd:#d4a843;--rd:#c0392b;--gn:#27ae60;--bu:#2980b9;--pf:'Press Start 2P',monospace;font-family:var(--pf);display:flex;justify-content:center;min-height:100vh;background:var(--bg);padding:10px;box-sizing:border-box;image-rendering:pixelated}
        .C{width:420px;max-width:100%;background:var(--cd);border:3px solid var(--br);box-shadow:0 0 0 1px var(--bg),0 0 0 3px var(--bd),0 6px 24px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:visible;animation:fu .4s ease-out;position:relative}
        @keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

        /* SPINE */
        .sp{display:flex;align-items:center;gap:6px;padding:6px 10px;background:linear-gradient(135deg,#3a2820,#2a1a18);border-bottom:2px solid var(--br);min-height:36px}
        .sp-p{width:32px;height:32px;border:2px solid var(--bl);background:linear-gradient(135deg,#4a3028,#3a2018);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
        .name-input{flex:1;min-width:0;background:transparent;border:none;border-bottom:1px dashed var(--bd);color:var(--gd);font-family:var(--pf);font-size:9px;padding:2px 4px;outline:none;letter-spacing:.5px}
        .name-input:focus{border-color:var(--gd)}
        .name-input::placeholder{color:var(--t3)}
        .sp-b{display:flex;gap:3px;flex-shrink:0}
        .pick-btn{width:28px;height:28px;border:2px solid var(--bd);background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;transition:all .12s;position:relative}
        .pick-btn:hover{border-color:var(--gd);background:rgba(0,0,0,.4)}
        .pick-btn.open{border-color:var(--gd);z-index:20}

        /* DROPDOWNS */
        .dropdown{position:absolute;top:100%;right:0;background:var(--cd);border:2px solid var(--br);max-height:260px;overflow-y:auto;z-index:30;width:200px;box-shadow:0 8px 24px rgba(0,0,0,.7)}
        .dropdown::-webkit-scrollbar{width:3px}
        .dropdown::-webkit-scrollbar-thumb{background:var(--bd)}
        .dd-item{display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;transition:all .1s;border-bottom:1px solid var(--bd);font-size:5.5px;color:var(--t2)}
        .dd-item:hover{background:rgba(212,168,67,.08);color:var(--tx)}
        .dd-item.sel{color:var(--gd);background:rgba(212,168,67,.1)}
        .dd-icon{font-size:14px;width:20px;text-align:center}
        .dd-name{flex:1}
        .dd-meta{font-size:4px;color:var(--t3)}

        /* COMBAT */
        .cs{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:2px solid var(--br);background:var(--pn)}
        .cv{display:flex;flex-direction:column;align-items:center;padding:4px 2px;border-right:1px solid var(--bd)}
        .cv:last-child{border-right:none}
        .cv-l{font-size:4px;color:var(--t3);letter-spacing:1px}
        .cv-v{font-size:10px;color:var(--tx)}

        /* SECTION HEADERS */
        .sec{font-size:5px;color:var(--t3);letter-spacing:2px;padding:6px 10px 4px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center}
        .sec-info{color:var(--gd);font-size:5.5px}
        .sec-warn{color:var(--rd)}

        /* POINT BUY GRID */
        .pb-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;padding:6px}
        .pb-cell{display:flex;flex-direction:column;align-items:center;padding:3px 1px;background:rgba(0,0,0,.2);border:2px solid var(--bd)}
        .pb-lbl{font-size:5px;color:var(--t3);letter-spacing:.5px;margin-bottom:2px}
        .pb-row{display:flex;align-items:center;gap:1px}
        .pb-btn{width:16px;height:16px;border:1px solid var(--bd);background:rgba(0,0,0,.3);color:var(--t2);font-family:var(--pf);font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;padding:0;line-height:1}
        .pb-btn:hover{border-color:var(--gd);color:var(--tx)}
        .pb-btn:disabled{opacity:.2;cursor:default}
        .pb-val{font-size:10px;color:var(--tx);width:22px;text-align:center}
        .pb-mod{font-size:6px;color:var(--t2);margin-top:1px}
        .pb-race{font-size:4.5px;color:var(--gd);margin-top:1px}
        .pb-final{font-size:7px;color:var(--gd);background:rgba(0,0,0,.3);padding:1px 4px;margin-top:2px}

        /* SKILLS PICK */
        .sk-sec{padding:6px}
        .sk-groups{display:flex;flex-direction:column;gap:2px}
        .sg{display:flex;align-items:center;gap:3px;padding:2px 3px;border-left:2px solid var(--gc,#555);background:color-mix(in srgb,var(--gc,#555) 5%,transparent)}
        .sgl{font-size:4px;width:18px;text-align:center;flex-shrink:0;letter-spacing:.5px;color:var(--gc,#555);opacity:.8}
        .sts{display:flex;flex-wrap:wrap;gap:2px}
        .st{width:32px;height:32px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.25);border:2px solid transparent;cursor:pointer;transition:all .12s;position:relative}
        .st:hover{background:rgba(255,255,255,.05);transform:translateY(-1px)}
        .st.prof{border-color:var(--gd);background:rgba(212,168,67,.06)}
        .st.bg-prof{border-color:var(--bu);background:rgba(41,128,185,.06)}
        .st.available{border-color:rgba(212,168,67,.3);border-style:dashed}
        .st.locked{opacity:.35;cursor:default}
        .st.locked:hover{transform:none;background:rgba(0,0,0,.25)}
        .st-i{font-size:12px;line-height:1}
        .st-v{font-size:5px;color:var(--tx);font-family:var(--pf);margin-top:1px}
        .st.prof .st-v{color:var(--gd)}
        .st.bg-prof .st-v{color:var(--bu)}
        .st-tag{position:absolute;top:1px;right:1px;font-size:3px;padding:0 2px;letter-spacing:0;font-family:var(--pf)}
        .st-tag.bg{color:var(--bu)}
        .st-tag.cls{color:var(--gd)}

        /* BACKGROUND PICKER */
        .bg-row{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--bd);cursor:pointer;position:relative}
        .bg-row:hover{background:rgba(255,255,255,.02)}
        .bg-name{font-size:7px;color:var(--gd);flex:1}
        .bg-skills{font-size:4.5px;color:var(--t2)}
        .bg-arrow{font-size:8px;color:var(--t3)}

        /* TRAITS */
        .traits-row{padding:6px 10px;display:flex;flex-wrap:wrap;gap:3px;border-bottom:1px solid var(--bd)}
        .trait-tag{font-size:4.5px;color:var(--t2);background:rgba(0,0,0,.25);padding:2px 5px;border:1px solid var(--bd)}

        /* SUMMARY */
        .summary{background:linear-gradient(135deg,#3a2820,#2a1a18);border-top:2px solid var(--br);padding:8px 10px;text-align:center}
        .sum-name{font-size:8px;color:var(--gd);margin-bottom:3px}
        .sum-sub{font-size:5px;color:var(--t2);letter-spacing:.5px}
        .sum-stats{display:flex;justify-content:center;gap:8px;margin-top:5px;font-size:5px;color:var(--tx)}
        .sum-hp{color:var(--gn)}
        .sum-ac{color:var(--bu)}
      `}</style>

      <div className="C">
        {/* SPINE — EDITABLE */}
        <div className="sp">
          <div className="sp-p">{cls.icon}</div>
          <input className="name-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Character name..." maxLength={24}/>
          <div className="sp-b">
            {/* RACE PICKER */}
            <div className={`pick-btn ${showRace?"open":""}`} onClick={()=>{setShowRace(!showRace);setShowClass(false);setShowBg(false)}} title="Pick Race">
              {race.icon}
              {showRace&&<div className="dropdown" onClick={e=>e.stopPropagation()}>
                {RACES.map((r,i)=>(
                  <div key={r.name} className={`dd-item ${i===raceIdx?"sel":""}`} onClick={()=>{setRaceIdx(i);setShowRace(false)}}>
                    <span className="dd-icon">{r.icon}</span>
                    <span className="dd-name">{r.name}</span>
                    <span className="dd-meta">{Object.entries(r.mods).map(([k,v])=>`${k.slice(0,1).toUpperCase()}+${v}`).join(" ")}</span>
                  </div>
                ))}
              </div>}
            </div>
            {/* CLASS PICKER */}
            <div className={`pick-btn ${showClass?"open":""}`} onClick={()=>{setShowClass(!showClass);setShowRace(false);setShowBg(false)}} title="Pick Class">
              {cls.icon}
              {showClass&&<div className="dropdown" onClick={e=>e.stopPropagation()}>
                {CLASSES.map((c,i)=>(
                  <div key={c.name} className={`dd-item ${i===classIdx?"sel":""}`} onClick={()=>{setClassIdx(i);setClassSkills([]);setShowClass(false)}}>
                    <span className="dd-icon">{c.icon}</span>
                    <span className="dd-name">{c.name}</span>
                    <span className="dd-meta">d{c.hd} · {c.numSkills} skills</span>
                  </div>
                ))}
              </div>}
            </div>
          </div>
        </div>

        {/* COMBAT DERIVED */}
        <div className="cs">
          <div className="cv"><span className="cv-l">AC</span><span className="cv-v">{ac}</span></div>
          <div className="cv"><span className="cv-l">HP</span><span className="cv-v" style={{color:"var(--gn)"}}>{maxHp}</span></div>
          <div className="cv"><span className="cv-l">HD</span><span className="cv-v" style={{fontSize:"8px"}}>1d{cls.hd}</span></div>
          <div className="cv"><span className="cv-l">PROF</span><span className="cv-v">+{pb}</span></div>
        </div>

        {/* POINT BUY */}
        <div className="sec">
          <span>ABILITY SCORES (POINT BUY)</span>
          <span className={`sec-info ${pointsLeft<0?"sec-warn":""}`}>{pointsLeft} pts left</span>
        </div>
        <div className="pb-grid">
          {AB_KEYS.map(k=>{
            const base = scores[k];
            const racial = race.mods[k] || 0;
            const final = base + racial;
            const m = mod(final);
            return (
              <div key={k} className="pb-cell" style={{borderColor:`color-mix(in srgb,${AB_COL[k]} 50%,var(--bd))`}}>
                <div className="pb-lbl">{k.toUpperCase()}</div>
                <div className="pb-row">
                  <button className="pb-btn" onClick={()=>decScore(k)} disabled={base<=8}>−</button>
                  <div className="pb-val">{base}</div>
                  <button className="pb-btn" onClick={()=>incScore(k)} disabled={base>=15||pointsLeft<=(PB_COST[base+1]||99)-(PB_COST[base]||0)}>+</button>
                </div>
                {racial!==0 && <div className="pb-race">+{racial} {race.name.split(" ")[0]}</div>}
                <div className="pb-final">{final}</div>
                <div className="pb-mod">{fmtMod(m)}</div>
              </div>
            );
          })}
        </div>

        {/* BACKGROUND */}
        <div className="bg-row" onClick={()=>{setShowBg(!showBg);setShowRace(false);setShowClass(false)}} style={{position:"relative"}}>
          <span className="bg-name">📖 {bg.name}</span>
          <span className="bg-skills">{bg.skills.join(", ")}</span>
          <span className="bg-arrow">{showBg?"▲":"▼"}</span>
          {showBg&&<div className="dropdown" style={{top:"100%",left:0,right:0,width:"auto"}} onClick={e=>e.stopPropagation()}>
            {BACKGROUNDS.map((b,i)=>(
              <div key={b.name} className={`dd-item ${i===bgIdx?"sel":""}`} onClick={()=>{setBgIdx(i);setShowBg(false)}}>
                <span className="dd-name">{b.name}</span>
                <span className="dd-meta">{b.skills.join(", ")}</span>
              </div>
            ))}
          </div>}
        </div>

        {/* RACIAL TRAITS */}
        <div className="traits-row">
          {race.traits.map(t=><span key={t} className="trait-tag">{t}</span>)}
        </div>

        {/* SKILLS */}
        <div className="sec">
          <span>SKILLS</span>
          <span className={`sec-info ${classSkillsLeft>0?"sec-warn":""}`}>
            {classSkillsLeft > 0 ? `Pick ${classSkillsLeft} more` : "✓ Done"}
          </span>
        </div>
        <div className="sk-sec">
          <div className="sk-groups">
            {AB_GROUPS.map(g => {
              const gs = ALL_SKILLS.filter(s => s.ab === g.ab);
              return (
                <div key={g.ab} className="sg" style={{"--gc":g.col}}>
                  <div className="sgl">{g.ab.toUpperCase()}</div>
                  <div className="sts">
                    {gs.map(s => {
                      const isBg = bg.skills.includes(s.name);
                      const isCls = classSkills.includes(s.name) && !isBg;
                      const isProf = isBg || isCls;
                      const canPick = canPickSkill(s.name) && !isCls;
                      const isAvail = canPick && classSkillsLeft > 0;
                      const isLocked = !isProf && !isAvail;
                      const bonus = mod(finalScores[s.ab]) + (isProf ? pb : 0);
                      return (
                        <div key={s.name}
                          className={`st ${isCls?"prof":""} ${isBg?"bg-prof":""} ${isAvail&&!isProf?"available":""} ${isLocked?"locked":""}`}
                          title={`${s.name} (${s.ab.toUpperCase()}) ${fmtMod(bonus)}${isBg?" — from background":""}${isCls?" — class skill":""}`}
                          onClick={()=>{if(!isBg && canPickSkill(s.name)) toggleClassSkill(s.name)}}>
                          <span className="st-i">{s.icon}</span>
                          <span className="st-v">{fmtMod(bonus)}</span>
                          {isBg && <span className="st-tag bg">BG</span>}
                          {isCls && <span className="st-tag cls">CL</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SUMMARY */}
        <div className="summary">
          <div className="sum-name">{name || "???"}</div>
          <div className="sum-sub">{race.name} {cls.name} · {bg.name}</div>
          <div className="sum-stats">
            <span className="sum-hp">HP {maxHp}</span>
            <span className="sum-ac">AC {ac}</span>
            <span>HD 1d{cls.hd}</span>
            <span>Speed {race.speed}ft</span>
          </div>
        </div>
      </div>
    </div>
  );
}

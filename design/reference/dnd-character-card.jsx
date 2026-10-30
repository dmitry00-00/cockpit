import { useState, useEffect, useCallback } from "react";

// ─── DATA ───
const CH = {
  identity: {
    name: "Bo Tambernack", race: "Lightfoot Halfling", raceIcon: "🧑",
    class: "Ranger", classIcon: "🏹", level: 1, alignment: "N",
    speed: 25, profBonus: 2, ac: 13, hitDice: "1d10", maxHp: 12,
    background: "Outlander",
    backgroundFeature: "Wanderer — Excellent memory for maps and geography. Can always find food and fresh water for up to six people each day.",
    personality: "I was, in fact, raised by wolves.",
    ideal: "Life is like the seasons — in constant change, and we must change with it.",
    bond: "I suffer awful visions of a coming disaster and will do anything to prevent it.",
    flaw: "I am slow to trust members of other races, towns, and societies.",
  },
  abilities: {
    str: { score: 17, mod: 3, profSave: false },
    dex: { score: 20, mod: 5, profSave: true },
    con: { score: 16, mod: 3, profSave: false },
    int: { score: 14, mod: 2, profSave: false },
    wis: { score: 15, mod: 2, profSave: true },
    cha: { score: 7, mod: -2, profSave: false },
  },
  skills: [
    { name: "Athletics", ab: "Str", bonus: 3, prof: false, icon: "💪" },
    { name: "Acrobatics", ab: "Dex", bonus: 5, prof: false, icon: "🤸" },
    { name: "Sleight of Hand", ab: "Dex", bonus: 5, prof: false, icon: "🃏" },
    { name: "Stealth", ab: "Dex", bonus: 7, prof: true, icon: "🌑" },
    { name: "Arcana", ab: "Int", bonus: 2, prof: false, icon: "✨" },
    { name: "History", ab: "Int", bonus: 2, prof: false, icon: "📜" },
    { name: "Investigation", ab: "Int", bonus: 2, prof: false, icon: "🔍" },
    { name: "Nature", ab: "Int", bonus: 4, prof: true, icon: "🌿" },
    { name: "Religion", ab: "Int", bonus: 2, prof: false, icon: "🕯" },
    { name: "Animal Handling", ab: "Wis", bonus: 4, prof: true, icon: "🐾" },
    { name: "Insight", ab: "Wis", bonus: 2, prof: false, icon: "👁" },
    { name: "Medicine", ab: "Wis", bonus: 2, prof: false, icon: "💊" },
    { name: "Perception", ab: "Wis", bonus: 2, prof: false, icon: "👀" },
    { name: "Survival", ab: "Wis", bonus: 4, prof: true, icon: "🔥" },
    { name: "Deception", ab: "Cha", bonus: 0, prof: false, icon: "🎭" },
    { name: "Intimidation", ab: "Cha", bonus: -2, prof: false, icon: "💀" },
    { name: "Performance", ab: "Cha", bonus: 0, prof: false, icon: "🎵" },
    { name: "Persuasion", ab: "Cha", bonus: 0, prof: false, icon: "💬" },
  ],
  features: [
    { name: "Favored Enemy", icon: "🎯", desc: "Advantage on Survival to track, Int to recall info about chosen enemies.", src: "Ranger" },
    { name: "Natural Explorer", icon: "🗺", desc: "Difficult terrain doesn't slow group. Can't become lost except by magic.", src: "Ranger" },
    { name: "Lucky", icon: "🍀", desc: "Reroll nat 1 on d20, must use new roll.", src: "Halfling" },
    { name: "Brave", icon: "🦁", desc: "Advantage on saves vs frightened.", src: "Halfling" },
    { name: "Naturally Stealthy", icon: "👤", desc: "Hide behind creature one size larger.", src: "Lightfoot" },
  ],
  equipment: {
    slots: {
      head: null,
      body: { name: "Leather Armor", icon: "🛡" },
      mainHand: { name: "Longbow", icon: "🏹" },
      offHand: null,
      back: { name: "Quiver (20)", icon: "➴" },
      feet: null,
      ring1: null,
      ring2: null,
      neck: null,
    },
    weapons: [
      { name: "Longbow", icon: "🏹", atk: "+7", dmg: "1d8+5", type: "Piercing", range: "150/600" },
      { name: "Shortsword", icon: "🗡", atk: "+7", dmg: "1d6+5", type: "Piercing", range: "Melee" },
      { name: "Handaxe", icon: "🪓", atk: "+5", dmg: "1d6+3", type: "Slashing", range: "20/60" },
    ],
    inventory: [
      { name: "Shortsword", icon: "🗡" },
      { name: "Handaxe", icon: "🪓" },
      { name: "Explorer's Pack", icon: "🎒" },
      { name: "Hunting Trap", icon: "⚙" },
      { name: "Rations (5)", icon: "🍖" },
      { name: "Rope (50ft)", icon: "🪢" },
      null, null, null, null, null, null,
    ],
  },
  spells: {
    ability: "Wis", dc: 12, atk: "+4",
    slots: [], // Ranger gets spells at level 2
    known: [],
  },
  chronicle: [
    { day: "—", event: "Born in a halfling settlement in the Sword Coast lowlands." },
    { day: "Age 8", event: "Separated from family during orc raid. Raised by a wolf pack in Neverwinter Wood." },
    { day: "Age 14", event: "Encountered a ranger who taught common tongue and basic survival skills." },
    { day: "Age 22", event: "First vision of coming disaster. Began traveling to investigate." },
    { day: "Age 26", event: "Arrived at Waterdeep. Adventure begins." },
  ],
};

const AB_GROUPS = [
  { ab: "Str", lbl: "STR", col: "#c0392b" },
  { ab: "Dex", lbl: "DEX", col: "#27ae60" },
  { ab: "Int", lbl: "INT", col: "#2980b9" },
  { ab: "Wis", lbl: "WIS", col: "#8e44ad" },
  { ab: "Cha", lbl: "CHA", col: "#c9a44a" },
];

const CONDS = [
  { n: "Blinded", i: "🙈" }, { n: "Charmed", i: "💕" }, { n: "Deafened", i: "🔇" },
  { n: "Frightened", i: "😨" }, { n: "Grappled", i: "✊" }, { n: "Incapacitated", i: "💫" },
  { n: "Invisible", i: "👻" }, { n: "Paralyzed", i: "⚡" }, { n: "Petrified", i: "🪨" },
  { n: "Poisoned", i: "☠" }, { n: "Prone", i: "⬇" }, { n: "Restrained", i: "⛓" },
  { n: "Stunned", i: "💥" }, { n: "Unconscious", i: "💤" },
];

const AB_COL = { str:"#c0392b", dex:"#27ae60", con:"#d4813a", int:"#2980b9", wis:"#8e44ad", cha:"#c9a44a" };
const roll20 = () => Math.floor(Math.random() * 20) + 1;
const fontUrl = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";

const SLOT_LAYOUT = [
  { key: "head", label: "Head", x: 50, y: 2 },
  { key: "neck", label: "Neck", x: 50, y: 22 },
  { key: "body", label: "Body", x: 50, y: 44 },
  { key: "mainHand", label: "Main", x: 12, y: 38 },
  { key: "offHand", label: "Off", x: 88, y: 38 },
  { key: "back", label: "Back", x: 88, y: 16 },
  { key: "ring1", label: "Ring", x: 14, y: 58 },
  { key: "ring2", label: "Ring", x: 86, y: 58 },
  { key: "feet", label: "Feet", x: 50, y: 72 },
];

export default function Card() {
  const [tab, setTab] = useState("stats");
  const [hp, setHp] = useState(CH.identity.maxHp);
  const [tmpHp, setTmpHp] = useState(0);
  const [hpD, setHpD] = useState("");
  const [dice, setDice] = useState(null);
  const [conds, setConds] = useState([]);
  const [showConds, setShowConds] = useState(false);
  const [ds, setDs] = useState({ s: 0, f: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const l = document.createElement("link"); l.href = fontUrl; l.rel = "stylesheet";
    document.head.appendChild(l); setTimeout(() => setLoaded(true), 80);
    return () => document.head.removeChild(l);
  }, []);

  const doRoll = useCallback((label, mod) => {
    const d = roll20();
    setDice({ label, total: d + mod, brk: `d20(${d}) ${mod >= 0 ? "+" : ""}${mod}`, crit: d === 20, fumble: d === 1 });
  }, []);

  const applyHp = (t) => {
    const v = parseInt(hpD); if (isNaN(v) || v <= 0) return;
    if (t === "d") {
      let r = v;
      if (tmpHp > 0) { const a = Math.min(tmpHp, r); setTmpHp(x => x - a); r -= a; }
      setHp(h => Math.max(0, h - r));
    } else setHp(h => Math.min(CH.identity.maxHp, h + v));
    setHpD("");
  };

  if (!loaded) return null;
  const pct = Math.max(0, Math.min(100, (hp / CH.identity.maxHp) * 100));
  const hpCol = pct > 50 ? "#4a2" : pct > 25 ? "#ca2" : "#c33";
  const pb = CH.identity.profBonus;
  const tabs = [
    { id: "stats", ic: "⬡" }, { id: "gear", ic: "◈" },
    { id: "spells", ic: "✦" }, { id: "lore", ic: "📖" },
  ];

  return (
    <div className="R">
      <style>{`
        .R {
          --bg:#1a1118; --cd:#2a2030; --pn:#1e1626;
          --br:#8b6b3a; --bl:#c9a44a; --bd:#5a4630;
          --tx:#e8d5b0; --t2:#a89478; --t3:#6a5a48;
          --gd:#d4a843; --rd:#c0392b; --gn:#27ae60; --bu:#2980b9;
          --pf:'Press Start 2P',monospace;
          font-family:var(--pf); display:flex; justify-content:center;
          min-height:100vh; background:var(--bg); padding:10px;
          box-sizing:border-box; image-rendering:pixelated;
        }
        .C {
          width:400px; max-width:100%; background:var(--cd);
          border:3px solid var(--br);
          box-shadow:0 0 0 1px var(--bg),0 0 0 3px var(--bd),0 6px 24px rgba(0,0,0,.6);
          display:flex; flex-direction:column; overflow:hidden;
          animation:fu .4s ease-out;
        }
        @keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

        /* SPINE */
        .sp{display:flex;align-items:center;gap:8px;padding:6px 10px;background:linear-gradient(135deg,#3a2820,#2a1a18);border-bottom:2px solid var(--br);min-height:34px}
        .sp-p{width:30px;height:30px;border:2px solid var(--bl);background:linear-gradient(135deg,#4a3028,#3a2018);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;position:relative}
        .sp-lv{position:absolute;bottom:-3px;right:-3px;background:var(--gd);color:var(--bg);font-size:4.5px;padding:1px 2px;border:1px solid var(--bg);font-family:var(--pf)}
        .sp-n{font-size:9px;color:var(--gd);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.5px}
        .sp-b{display:flex;gap:3px;flex-shrink:0}
        .sp-i{width:24px;height:24px;border:1px solid var(--bd);background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:13px}

        /* COMBAT */
        .cs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:2px solid var(--br);background:var(--pn)}
        .cv{display:flex;flex-direction:column;align-items:center;padding:4px 2px;border-right:1px solid var(--bd)}
        .cv:last-child{border-right:none}
        .cv-l{font-size:4px;color:var(--t3);letter-spacing:1px}
        .cv-v{font-size:10px;color:var(--tx)}

        /* HP ROW: death saves + bar + controls ALL IN ONE */
        .hp-row{display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(0,0,0,.15);border-bottom:1px solid var(--bd)}
        .ds-mini{display:flex;gap:1px;flex-shrink:0}
        .ds-p{width:7px;height:7px;border:1px solid var(--bd);background:transparent;cursor:pointer;padding:0;transition:all .1s}
        .ds-p.s.on{background:var(--gn);border-color:var(--gn)}
        .ds-p.f.on{background:var(--rd);border-color:var(--rd)}
        .ds-sep{width:3px}
        .hp-mid{flex:1;display:flex;flex-direction:column;gap:1px;min-width:0}
        .hp-top{display:flex;justify-content:space-between;font-size:4.5px;color:var(--t3)}
        .hp-num{font-size:6px;color:var(--tx)}
        .hp-trk{height:5px;background:rgba(0,0,0,.4);border:1px solid var(--bd);overflow:hidden}
        .hp-fill{height:100%;transition:width .3s,background .3s;position:relative}
        .hp-fill::after{content:'';position:absolute;top:0;left:0;right:0;height:40%;background:rgba(255,255,255,.2)}
        .hp-in{width:40px;background:rgba(0,0,0,.3);border:1px solid var(--bd);color:var(--tx);font-family:var(--pf);font-size:6px;padding:2px 4px;outline:none;flex-shrink:0}
        .hp-in:focus{border-color:var(--gd)}
        .hp-in::placeholder{color:var(--t3);font-size:4px}
        .hp-b{background:rgba(0,0,0,.3);border:1px solid var(--bd);color:var(--t2);font-family:var(--pf);font-size:4.5px;padding:2px 5px;cursor:pointer;transition:all .1s;flex-shrink:0}
        .hp-b:hover{border-color:var(--gd);color:var(--tx)}
        .hp-b.dm:hover{border-color:var(--rd);color:var(--rd)}
        .hp-b.hl:hover{border-color:var(--gn);color:var(--gn)}

        /* STATUS BAR */
        .sb{display:flex;align-items:center;gap:2px;padding:4px 8px;border-bottom:1px solid var(--bd);flex-wrap:wrap;position:relative}
        .fi{width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;background:rgba(0,0,0,.2);border:1px solid var(--bd);transition:all .12s;position:relative}
        .fi:hover{border-color:var(--gd);transform:translateY(-1px)}
        .ft{display:none;position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);background:var(--cd);border:2px solid var(--br);padding:5px 7px;font-size:5px;color:var(--t2);width:170px;z-index:50;line-height:1.7;box-shadow:0 4px 12px rgba(0,0,0,.5);pointer-events:none}
        .ft .fn{color:var(--gd);font-size:5.5px;display:block;margin-bottom:2px}
        .fi:hover .ft{display:block}
        .ss{width:1px;height:14px;background:var(--bd);margin:0 2px}
        .ci{width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;border:1px solid transparent;transition:all .12s;opacity:.25}
        .ci.on{opacity:1;border-color:var(--rd);background:rgba(192,57,43,.12)}
        .ci:hover{opacity:.7}
        .ce{width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:7px;cursor:pointer;color:var(--t3);border:1px solid var(--bd);background:rgba(0,0,0,.2);transition:all .12s;font-family:var(--pf)}
        .ce:hover{color:var(--tx);border-color:var(--gd)}
        .cd{width:100%;display:flex;flex-wrap:wrap;gap:2px;padding-top:3px;border-top:1px solid var(--bd);margin-top:2px}

        /* TABS */
        .tb{display:grid;grid-template-columns:repeat(4,1fr);background:var(--bg);border-bottom:2px solid var(--br)}
        .ti{background:none;border:none;color:var(--t3);font-family:var(--pf);font-size:5px;padding:6px 2px;cursor:pointer;transition:all .12s;display:flex;flex-direction:column;align-items:center;gap:2px;border-right:1px solid var(--bd);position:relative;text-transform:uppercase}
        .ti:last-child{border-right:none}
        .ti.on{color:var(--gd);background:var(--cd)}
        .ti.on::after{content:'';position:absolute;bottom:-2px;left:15%;right:15%;height:2px;background:var(--gd)}
        .ti:hover:not(.on){color:var(--t2)}
        .ti-i{font-size:9px}

        /* TAB BODY */
        .tbody{min-height:320px;display:flex;flex-direction:column;overflow-y:auto}
        .tbody::-webkit-scrollbar{width:3px}
        .tbody::-webkit-scrollbar-thumb{background:var(--bd)}
        .tfill{flex:1;min-height:12px}

        /* ABILITIES */
        .ag{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;padding:7px 6px;border-bottom:1px solid var(--bd)}
        .ab{display:flex;flex-direction:column;align-items:center;padding:4px 1px;background:rgba(0,0,0,.2);border:2px solid var(--bd);cursor:pointer;transition:all .12s}
        .ab:hover{background:rgba(255,255,255,.04);transform:translateY(-1px)}
        .ab-l{font-size:4.5px;color:var(--t3);letter-spacing:.5px}
        .ab-m{font-size:11px;color:var(--tx);line-height:1.2}
        .ab-s{font-size:5.5px;color:var(--t2);background:rgba(0,0,0,.3);padding:1px 3px;margin-top:1px}

        /* SKILLS */
        .skp{padding:4px 6px 6px}
        .skh{display:flex;justify-content:space-between;font-size:4.5px;color:var(--t3);letter-spacing:1.5px;padding:2px 2px 4px;border-bottom:1px solid var(--bd);margin-bottom:3px}
        .skpb{color:var(--gd);font-size:5.5px}
        .skg{display:flex;flex-direction:column;gap:2px}
        .sg{display:flex;align-items:center;gap:3px;padding:2px 3px;border-left:2px solid var(--gc,#555);background:color-mix(in srgb,var(--gc,#555) 5%,transparent)}
        .sgl{font-size:4px;width:18px;text-align:center;flex-shrink:0;letter-spacing:.5px;color:var(--gc,#555);opacity:.8}
        .sts{display:flex;flex-wrap:wrap;gap:2px}
        .st{width:30px;height:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.25);border:2px solid transparent;cursor:pointer;transition:all .12s}
        .st:hover{background:rgba(255,255,255,.05);transform:translateY(-1px)}
        .st.pr{border-color:var(--gd);background:rgba(212,168,67,.06);box-shadow:inset 0 0 5px rgba(212,168,67,.12)}
        .st-i{font-size:12px;line-height:1}
        .st-v{font-size:5px;color:var(--tx);font-family:var(--pf);margin-top:1px}
        .st.pr .st-v{color:var(--gd)}

        /* GEAR TAB — DOLL */
        .gp{padding:6px}
        .sec{font-size:4.5px;color:var(--t3);letter-spacing:1.5px;padding:2px;border-bottom:1px solid var(--bd);margin-bottom:3px;margin-top:6px}
        .sec:first-child{margin-top:0}
        .doll-wrap{position:relative;width:100%;height:160px;margin-bottom:6px;background:rgba(0,0,0,.15);border:1px solid var(--bd)}
        .doll-body{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:90px;display:flex;flex-direction:column;align-items:center}
        .doll-head{width:16px;height:16px;border-radius:50%;border:1px solid var(--bd);background:rgba(255,255,255,.05)}
        .doll-torso{width:22px;height:30px;border:1px solid var(--bd);border-top:none;background:rgba(255,255,255,.03)}
        .doll-legs{width:22px;height:28px;border:1px solid var(--bd);border-top:none;background:rgba(255,255,255,.02);display:flex}
        .doll-leg{flex:1;border-right:1px solid var(--bd)}
        .doll-leg:last-child{border-right:none}
        .doll-arms{position:absolute;top:20px;left:50%;transform:translateX(-50%);width:52px;display:flex;justify-content:space-between}
        .doll-arm{width:8px;height:32px;border:1px solid var(--bd);background:rgba(255,255,255,.02)}
        .slot{position:absolute;width:36px;height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed var(--bd);background:rgba(0,0,0,.2);cursor:pointer;transition:all .12s;transform:translate(-50%,-50%)}
        .slot:hover{border-color:var(--gd);background:rgba(0,0,0,.3)}
        .slot.filled{border-style:solid;border-color:var(--bl);background:rgba(212,168,67,.06)}
        .slot-icon{font-size:14px;line-height:1}
        .slot-lbl{font-size:3.5px;color:var(--t3);margin-top:1px;letter-spacing:.5px}
        .slot.filled .slot-lbl{color:var(--t2)}

        /* INVENTORY GRID */
        .inv-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:2px}
        .inv-cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px solid var(--bd);background:rgba(0,0,0,.2);font-size:14px;cursor:pointer;transition:all .12s;position:relative}
        .inv-cell:hover{border-color:var(--gd)}
        .inv-cell.empty{opacity:.3}
        .inv-cell .inv-tip{display:none;position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:var(--cd);border:1px solid var(--br);padding:3px 6px;font-size:5px;color:var(--tx);white-space:nowrap;z-index:20;pointer-events:none}
        .inv-cell:hover .inv-tip{display:block}

        /* WEAPONS */
        .wpn{padding:5px;margin:2px 0;background:rgba(0,0,0,.2);border:1px solid var(--bd);cursor:pointer;transition:all .12s;display:flex;align-items:center;gap:5px}
        .wpn:hover{border-color:var(--gd)}
        .wpn-i{font-size:14px;width:20px;text-align:center;flex-shrink:0}
        .wpn-d{flex:1;min-width:0}
        .wpn-n{font-size:5.5px;color:var(--tx);margin-bottom:2px}
        .wpn-s{display:flex;gap:4px;font-size:7px}
        .wpn-a{color:var(--gn)}
        .wpn-dm{color:var(--rd)}
        .wpn-mt{font-size:4px;color:var(--t3);margin-top:1px}

        /* SPELLS TAB */
        .spell-panel{padding:8px}
        .spell-info{display:flex;gap:8px;font-size:5px;color:var(--t2);padding:4px 0 8px;border-bottom:1px solid var(--bd)}
        .spell-tag{background:rgba(0,0,0,.25);padding:2px 5px;border:1px solid var(--bd)}
        .spell-empty{text-align:center;padding:30px 10px;font-size:5.5px;color:var(--t3);line-height:2}
        .spell-empty-icon{font-size:28px;margin-bottom:8px;opacity:.3;display:block}

        /* LORE TAB */
        .lore-panel{padding:6px 8px}
        .lore-bg{font-size:5.5px;color:var(--gd);letter-spacing:1px;margin-bottom:2px}
        .lore-feat{font-size:5px;color:var(--t2);line-height:1.8;padding:4px 0;border-bottom:1px solid var(--bd)}
        .lore-trait{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.03)}
        .lore-trait-lbl{font-size:4px;color:var(--t3);letter-spacing:1px;margin-bottom:1px}
        .lore-trait-val{font-size:5px;color:var(--t2);line-height:1.7}
        .chron{margin-top:4px}
        .chron-entry{display:flex;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.03)}
        .chron-dot{width:6px;height:6px;border:1px solid var(--gd);background:rgba(212,168,67,.15);flex-shrink:0;margin-top:2px}
        .chron-day{font-size:4.5px;color:var(--gd);min-width:32px;flex-shrink:0}
        .chron-txt{font-size:5px;color:var(--t2);line-height:1.7;flex:1}

        /* INIT */
        .init{background:linear-gradient(135deg,#3a2820,#2a1a18);border:none;border-top:2px solid var(--br);color:var(--t2);font-family:var(--pf);font-size:6.5px;padding:9px;cursor:pointer;transition:all .15s;letter-spacing:2px;width:100%}
        .init:hover{color:var(--gd)}

        /* DICE */
        .dov{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;justify-content:center;align-items:center;z-index:100;animation:fii .12s;backdrop-filter:blur(2px)}
        @keyframes fii{from{opacity:0}to{opacity:1}}
        .dbx{background:var(--cd);border:3px solid var(--br);padding:14px 24px;text-align:center;box-shadow:0 0 0 1px var(--bg),0 10px 32px rgba(0,0,0,.6);animation:dp .2s ease-out}
        @keyframes dp{from{opacity:0;transform:scale(.85) translateY(-12px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .dl{font-size:5.5px;color:var(--t3);letter-spacing:1px;margin-bottom:5px}
        .dv{font-size:26px;color:var(--tx);margin:5px 0}
        .dv.cr{color:var(--gd);text-shadow:0 0 8px rgba(212,168,67,.5)}
        .dv.fm{color:var(--rd);text-shadow:0 0 8px rgba(192,57,43,.5)}
        .dbr{font-size:4.5px;color:var(--t2);margin-bottom:8px}
        .dtg{font-size:6.5px;letter-spacing:2px;margin-bottom:5px;animation:pls .5s ease infinite alternate}
        @keyframes pls{from{opacity:.7}to{opacity:1}}
        .dok{background:rgba(0,0,0,.3);border:1px solid var(--bd);color:var(--t2);font-family:var(--pf);font-size:5.5px;padding:4px 18px;cursor:pointer;transition:all .12s}
        .dok:hover{border-color:var(--gd);color:var(--tx)}
      `}</style>

      <div className="C">
        {/* SPINE */}
        <div className="sp">
          <div className="sp-p">{CH.identity.classIcon}<div className="sp-lv">LV{CH.identity.level}</div></div>
          <div className="sp-n">{CH.identity.name}</div>
          <div className="sp-b">
            <div className="sp-i" title={CH.identity.race}>{CH.identity.raceIcon}</div>
            <div className="sp-i" title={CH.identity.class}>{CH.identity.classIcon}</div>
          </div>
        </div>

        {/* COMBAT */}
        <div className="cs">
          <div className="cv"><span className="cv-l">AC</span><span className="cv-v">{CH.identity.ac}</span></div>
          <div className="cv"><span className="cv-l">HD</span><span className="cv-v" style={{fontSize:"8px"}}>{CH.identity.hitDice}</span></div>
          <div className="cv"><span className="cv-l">PROF</span><span className="cv-v">+{pb}</span></div>
        </div>

        {/* HP + DEATH SAVES + CONTROLS — ONE ROW */}
        <div className="hp-row">
          <div className="ds-mini" title="Death Saves: Success">
            {[1,2,3].map(i=><button key={i} className={`ds-p s ${ds.s>=i?"on":""}`} onClick={()=>setDs(d=>({...d,s:d.s>=i?i-1:i}))}/>)}
          </div>
          <div className="ds-sep"/>
          <div className="ds-mini" title="Death Saves: Failure">
            {[1,2,3].map(i=><button key={i} className={`ds-p f ${ds.f>=i?"on":""}`} onClick={()=>setDs(d=>({...d,f:d.f>=i?i-1:i}))}/>)}
          </div>
          <div className="hp-mid">
            <div className="hp-top"><span>HP</span><span className="hp-num">{hp}/{CH.identity.maxHp}{tmpHp>0&&<span style={{color:"var(--bu)"}}> +{tmpHp}</span>}</span></div>
            <div className="hp-trk"><div className="hp-fill" style={{width:`${pct}%`,background:hpCol}}/></div>
          </div>
          <input className="hp-in" type="number" placeholder="±" value={hpD} onChange={e=>setHpD(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")applyHp("d")}} min="0"/>
          <button className="hp-b dm" onClick={()=>applyHp("d")}>DMG</button>
          <button className="hp-b hl" onClick={()=>applyHp("h")}>HEAL</button>
        </div>

        {/* STATUS BAR */}
        <div className="sb">
          {CH.features.map(f=>(
            <div key={f.name} className="fi" title={f.name}>
              {f.icon}
              <div className="ft"><span className="fn">{f.name} ({f.src})</span>{f.desc}</div>
            </div>
          ))}
          <div className="ss"/>
          {conds.map(n=>{const c=CONDS.find(x=>x.n===n);return c?<div key={n} className="ci on" title={n} onClick={()=>setConds(x=>x.filter(y=>y!==n))}>{c.i}</div>:null})}
          <div className="ce" onClick={()=>setShowConds(!showConds)}>{showConds?"×":"…"}</div>
          {showConds&&<div className="cd">{CONDS.map(c=><div key={c.n} className={`ci ${conds.includes(c.n)?"on":""}`} title={c.n} onClick={()=>setConds(x=>x.includes(c.n)?x.filter(y=>y!==c.n):[...x,c.n])}>{c.i}</div>)}</div>}
        </div>

        {/* TABS */}
        <div className="tb">
          {tabs.map(t=><button key={t.id} className={`ti ${tab===t.id?"on":""}`} onClick={()=>setTab(t.id)}><span className="ti-i">{t.ic}</span>{t.id}</button>)}
        </div>

        {/* CONTENT */}
        <div className="tbody">
          {tab==="stats"&&<>
            <div className="ag">
              {Object.entries(CH.abilities).map(([k,a])=>(
                <div key={k} className="ab" style={{borderColor:`color-mix(in srgb,${AB_COL[k]} 50%,var(--bd))`}}
                  onClick={()=>doRoll(`${k.toUpperCase()} Check`,a.mod)}
                  title={`${k.toUpperCase()}: ${a.score} (${a.mod>=0?"+":""}${a.mod})${a.profSave?" — Save proficient":""}`}>
                  <div className="ab-l">{k.toUpperCase()}{a.profSave?" ★":""}</div>
                  <div className="ab-m">{a.mod>=0?`+${a.mod}`:a.mod}</div>
                  <div className="ab-s">{a.score}</div>
                </div>
              ))}
            </div>
            <div className="skp">
              <div className="skh"><span>SKILLS</span><span className="skpb">PROF +{pb}</span></div>
              <div className="skg">
                {AB_GROUPS.map(g=>{
                  const gs=CH.skills.filter(s=>s.ab===g.ab);
                  if(!gs.length) return null;
                  return <div key={g.ab} className="sg" style={{"--gc":g.col}}>
                    <div className="sgl">{g.lbl}</div>
                    <div className="sts">
                      {gs.map(s=><div key={s.name} className={`st ${s.prof?"pr":""}`} title={`${s.name} (${s.ab})`} onClick={()=>doRoll(s.name,s.bonus)}>
                        <span className="st-i">{s.icon}</span>
                        <span className="st-v">{s.bonus>=0?`+${s.bonus}`:s.bonus}</span>
                      </div>)}
                    </div>
                  </div>
                })}
              </div>
            </div>
          </>}

          {tab==="gear"&&<div className="gp">
            <div className="sec">EQUIPPED</div>
            <div className="doll-wrap">
              <div className="doll-body">
                <div className="doll-head"/>
                <div className="doll-torso"/>
                <div className="doll-arms"><div className="doll-arm"/><div className="doll-arm"/></div>
                <div className="doll-legs"><div className="doll-leg"/><div className="doll-leg"/></div>
              </div>
              {SLOT_LAYOUT.map(sl=>{
                const item=CH.equipment.slots[sl.key];
                return <div key={sl.key} className={`slot ${item?"filled":""}`}
                  style={{left:`${sl.x}%`,top:`${sl.y}%`}}
                  title={item?item.name:sl.label}>
                  <span className="slot-icon">{item?item.icon:"·"}</span>
                  <span className="slot-lbl">{item?item.name:sl.label}</span>
                </div>
              })}
            </div>

            <div className="sec">WEAPONS</div>
            {CH.equipment.weapons.map(w=>(
              <div key={w.name} className="wpn" onClick={()=>doRoll(`${w.name} Attack`,parseInt(w.atk))}>
                <div className="wpn-i">{w.icon}</div>
                <div className="wpn-d">
                  <div className="wpn-n">{w.name}</div>
                  <div className="wpn-s"><span className="wpn-a">{w.atk}</span><span className="wpn-dm">{w.dmg}</span></div>
                  <div className="wpn-mt">{w.type} · {w.range}</div>
                </div>
              </div>
            ))}

            <div className="sec">INVENTORY</div>
            <div className="inv-grid">
              {CH.equipment.inventory.map((item,i)=>(
                <div key={i} className={`inv-cell ${!item?"empty":""}`}>
                  {item?item.icon:"·"}
                  {item&&<div className="inv-tip">{item.name}</div>}
                </div>
              ))}
            </div>
          </div>}

          {tab==="spells"&&<div className="spell-panel">
            <div className="spell-info">
              <span className="spell-tag">Ability: WIS</span>
              <span className="spell-tag">DC: {CH.spells.dc}</span>
              <span className="spell-tag">ATK: {CH.spells.atk}</span>
            </div>
            <div className="spell-empty">
              <span className="spell-empty-icon">📕</span>
              Rangers learn spells at level 2.<br/>
              No spells known yet.
            </div>
          </div>}

          {tab==="lore"&&<div className="lore-panel">
            <div className="lore-bg">{CH.identity.background}</div>
            <div className="lore-feat">{CH.identity.backgroundFeature}</div>
            {[
              ["PERSONALITY",CH.identity.personality],
              ["IDEAL",CH.identity.ideal],
              ["BOND",CH.identity.bond],
              ["FLAW",CH.identity.flaw],
            ].map(([l,v])=><div key={l} className="lore-trait"><div className="lore-trait-lbl">{l}</div><div className="lore-trait-val">{v}</div></div>)}
            <div className="sec" style={{marginTop:8}}>CHRONICLE</div>
            <div className="chron">
              {CH.chronicle.map((e,i)=>(
                <div key={i} className="chron-entry">
                  <div className="chron-dot"/>
                  <div className="chron-day">{e.day}</div>
                  <div className="chron-txt">{e.event}</div>
                </div>
              ))}
            </div>
          </div>}

          <div className="tfill"/>
        </div>

        {/* INITIATIVE */}
        <button className="init" onClick={()=>doRoll("Initiative",CH.abilities.dex.mod)}>⚔ ROLL INITIATIVE ⚔</button>
      </div>

      {/* DICE */}
      {dice&&<div className="dov" onClick={()=>setDice(null)}>
        <div className="dbx" onClick={e=>e.stopPropagation()}>
          <div className="dl">{dice.label}</div>
          <div className={`dv ${dice.crit?"cr":""} ${dice.fumble?"fm":""}`}>{dice.total}</div>
          <div className="dbr">{dice.brk}</div>
          {dice.crit&&<div className="dtg" style={{color:"var(--gd)"}}>CRITICAL!</div>}
          {dice.fumble&&<div className="dtg" style={{color:"var(--rd)"}}>FUMBLE!</div>}
          <button className="dok" onClick={()=>setDice(null)}>OK</button>
        </div>
      </div>}
    </div>
  );
}

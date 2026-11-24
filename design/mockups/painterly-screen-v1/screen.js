'use strict';
const $=id=>document.getElementById(id);
const state={hp:41,hour:8,day:15};const history=[];let timer;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4200)}
function sync(){const pct=state.hp/49*100;$('hp').textContent=state.hp;$('hp-status').textContent=state.hp===0?'Без сознания':state.hp<13?'Тяжело ранен':state.hp<25?'Ранен':'В строю';$('railhp').textContent=state.hp+' / 49';$('hpbar').style.width=pct+'%';$('railbar').style.width=pct+'%';$('clock').textContent=state.day+' Mirtul 1492 DR';$('hour').textContent=String(state.hour).padStart(2,'0')+':00 · '+(state.hour<6?'ночь':state.hour<12?'утро':state.hour<18?'день':'вечер');$('undo').disabled=!history.length}
function change(text,fn){history.push({state:{...state},event:$('last-event').textContent});fn();$('last-event').textContent=text;sync();toast(text)}
for(const[id,sign]of[['damage',-1],['heal',1]])$(id).onclick=()=>{const n=Number($('amount').value);if(!Number.isInteger(n)||n<1||n>99)return toast('Введите целое число от 1 до 99');change('Bo: '+(sign<0?'урон ':'лечение ')+n,()=>state.hp=Math.min(49,Math.max(0,state.hp+sign*n)))};
$('undo').onclick=()=>{const old=history.pop();if(!old)return;Object.assign(state,old.state);$('last-event').textContent=old.event;sync();toast('Последнее действие отменено')};
$('advance').onclick=()=>{const n=Number($('tempo').value);change('Время продвинуто на '+n+' ч. · локальный пример',()=>{state.hour+=n;state.day+=Math.floor(state.hour/24);state.hour%=24})};
function roll(label,bonus){const die=Math.floor(Math.random()*20)+1;toast(label+': '+(die+bonus)+' = d20 ('+die+') + '+bonus+' · пример броска')}
$('initiative').onclick=()=>roll('Инициатива',3);document.querySelectorAll('[data-roll]').forEach(b=>b.onclick=()=>roll(b.dataset.roll,Number(b.dataset.bonus)));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{for(const id of['overview','gear','story'])$(id).hidden=id!==b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
document.querySelectorAll('[data-notice]').forEach(b=>b.onclick=()=>toast(b.dataset.notice));
const places={Neverwinter:'Город за спиной. Впереди — дорога на юг и следы исчезнувшего каравана.',Leilon:'Старый тракт проходит у стен поселения. Здесь ещё помнят путников с севера.','Neverwinter Wood':'Густой лес скрывает старые тропы. Шум дороги быстро теряется среди деревьев.'};
function place(name){$('place-name').textContent=name;$('place-description').textContent=places[name];toast('В фокусе: '+name)}
document.querySelectorAll('[data-place]').forEach(b=>{b.onclick=()=>place(b.dataset.place);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();place(b.dataset.place)}}});
$('route').onclick=()=>{const on=$('route').getAttribute('aria-pressed')!=='true';$('route').setAttribute('aria-pressed',String(on));$('routepath').hidden=!on;$('routepath').style.display=on?'':'none'};
let zoom=1;const center=[8675,2800];function setZoom(z){zoom=Math.max(.8,Math.min(1.6,z));const w=1350/zoom,h=1100/zoom;$('worldmap').setAttribute('viewBox',[center[0]-w/2,center[1]-h/2,w,h].join(' '));$('zoom-in').disabled=zoom>=1.6;$('zoom-out').disabled=zoom<=.8}
$('zoom-in').onclick=()=>setZoom(zoom+.2);$('zoom-out').onclick=()=>setZoom(zoom-.2);
for(let y=8;y<=13;y++)for(let x=30;x<=37;x++){const im=document.createElementNS('http://www.w3.org/2000/svg','image');for(const[k,v]of Object.entries({href:'../../../maps/tiles/toril-clean/7/'+x+'_'+y+'.webp',x:x*256,y:y*256,width:256,height:256}))im.setAttribute(k,v);$('tiles').append(im)}
$('quest').onclick=()=>$('quest-dialog').showModal();$('close-dialog').onclick=()=>$('quest-dialog').close();$('quest-dialog').onclick=e=>{if(e.target===$('quest-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}};
// Роль → id → производная: смысл хранится в реестре, не угадывается по имени файла.
async function loadVisualRoles(){
  try{
    const response=await fetch('manifest.json');if(!response.ok)throw Error('Реестр недоступен');
    const manifest=await response.json(),byId=new Map(manifest.assets.map(a=>[a.id,a]));
    const assetFor=id=>byId.get(manifest.aliases?.[id]??id);
    const variantFor=asset=>asset?.variants.find(v=>v.width===128)??asset?.variants[0];
    for(const image of document.querySelectorAll('img[data-art-role]')){
      const role=manifest.roles[image.dataset.artRole],asset=assetFor(role?.assetId),v=variantFor(asset);
      if(!role||!v)throw Error('Нет образа для '+image.dataset.artRole);
      image.src=v.path;image.alt=role.alt;
    }
    $('review-grid').replaceChildren();
    for(const[key,role]of Object.entries(manifest.roles)){
      const asset=assetFor(role.assetId),v=variantFor(asset);if(!v)throw Error('Нет образа '+key);
      const box=document.createElement('div'),h=document.createElement('h3');h.textContent=role.label;box.dataset.role=key;box.append(h);
      for(const size of[32,48,64]){
        const fig=document.createElement('figure'),image=document.createElement('img'),cap=document.createElement('figcaption');
        image.src=v.path;image.alt=role.alt;image.width=size;image.height=size;image.loading='lazy';cap.textContent=size+' px';fig.append(image,cap);box.append(fig);
      }
      $('review-grid').append(box);
    }
  }catch(error){const p=document.createElement('p');p.className='review-error';p.textContent='Не удалось открыть реестр знаков: '+error.message;$('review-grid').replaceChildren(p)}
}
loadVisualRoles();
sync();

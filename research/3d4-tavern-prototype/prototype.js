    const props = [
      { id:'tracks', title:'Мокрые следы', tag:'У двери', kind:'открытое наблюдение', playerVisible:true,
        markup:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 7c5 0 8 5 6 10-1 3-4 4-7 3-4-2-5-8-2-11 1-1 2-2 3-2Zm16 3c5-1 9 3 8 8-1 4-4 6-8 5-4-1-6-5-4-9 1-2 2-3 4-4ZM11 27c5-1 8 3 7 8-1 4-4 6-8 4-3-1-4-5-2-9 1-2 2-3 3-3Zm18 2c5-1 8 2 7 7-1 4-4 6-8 4-3-2-4-6-1-9l2-2Z" fill="#7c9b91" stroke="#d1c5a4" stroke-width="1.4"/><path d="M7 43c8-3 21-3 31 1" fill="none" stroke="#3c6870" stroke-width="2"/></svg>',
        text:'На полу видны три мокрых отпечатка каблука, ведущие к боковой двери. Это только наблюдение; причина и принадлежность не установлены.',
        playerText:'На полу видны мокрые следы, ведущие к боковой двери.',
        note:'Мокрые следы ведут к боковой двери; владелец не установлен.' },
      { id:'bell', title:'Колокольчик под стойкой', tag:'Под стойкой', kind:'секретная заметка мастера', playerVisible:false,
        markup:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 7c-8 0-12 7-12 16v8l-5 5h34l-5-5v-8c0-9-4-16-12-16Z" fill="#b18448" stroke="#f0cf8d" stroke-width="2"/><path d="M19 39c1 5 9 5 10 0" fill="#d2aa69" stroke="#f0cf8d" stroke-width="2"/><circle cx="24" cy="6" r="3" fill="#ead6a8"/></svg>',
        text:'На язычке свежая царапина. Авторская зацепка: колокольчиком подают тихий сигнал человеку у окна. Это сюжетная заметка, не установленная игровая способность.',
        playerText:'В заметках партии отмечен тихий сигнал у стойки.',
        note:'Под стойкой колокольчик с новой царапиной; авторская зацепка: он служит тихим сигналом человеку у окна.' },
      { id:'traveler', title:'Фигура у окна', tag:'У окна', kind:'неустановленная личность', playerVisible:false,
        markup:'<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 8 15l5 5v18h22V20l5-5L24 5Z" fill="#453542" stroke="#cfb17b" stroke-width="2"/><path d="M18 22c0-5 3-8 6-8s6 3 6 8l-3 5h-6l-3-5Z" fill="#8b725d"/><path d="M15 37c1-8 5-12 9-12s8 4 9 12" fill="#32443f" stroke="#829d88" stroke-width="2"/><circle cx="22" cy="21" r="1" fill="#efd4a0"/><circle cx="27" cy="21" r="1" fill="#efd4a0"/></svg>',
        text:'Путник сидит лицом к окну и не представился. Авторская подсказка мастеру: он заметит, если кто-то тронет колокольчик. Не назначайте проверку, если её не требует сцена.',
        playerText:'У окна сидит молчаливый путник.',
        note:'Путник у окна не представился; авторская подсказка: следит за колокольчиком.' }
    ];
    let audience='dm', selected=null;
    const disclosed=new Set(['tracks']);
    const byId=id=>props.find(item=>item.id===id);
    const stage=document.getElementById('stage');
    const visibleProps=()=>props.filter(item=>audience==='dm'||item.playerVisible||disclosed.has(item.id));
    function select(id){ selected=id; render(); }
    function render(){
      stage.querySelectorAll('.hotspot').forEach(node=>node.remove());
      const positions={tracks:[18,77],bell:[79,55],traveler:[47,32]};
      const visible=visibleProps();
      for(const item of visible){
        const [x,y]=positions[item.id];
        const button=document.createElement('button');
        button.type='button'; button.className='hotspot'; button.style.left=x+'%'; button.style.top=y+'%';
        button.setAttribute('aria-label',item.title); button.setAttribute('aria-pressed',String(selected===item.id));
        button.innerHTML=item.markup+'<span class="tag">'+item.tag+'</span>';
        button.addEventListener('click',()=>select(item.id)); stage.append(button);
      }
      const current=selected&&visible.some(item=>item.id===selected)?byId(selected):null;
      document.getElementById('dm-mode').setAttribute('aria-pressed',String(audience==='dm'));
      document.getElementById('player-mode').setAttribute('aria-pressed',String(audience==='players'));
      document.getElementById('audience-label').textContent=audience==='dm'?`Вид мастера · ${visible.length} детали`:`Вид игроков · ${visible.length} детали`;
      document.getElementById('detail-title').textContent=current?current.title:'Выберите предмет в зале';
      document.getElementById('detail').innerHTML=current?`<p>${audience==='players'?current.playerText:current.text}</p>`:'<p>Нажатие открывает заметку-прототип. Здесь нет бросков, Сл и скрытых игровых эффектов.</p>';
      document.getElementById('mapping').textContent=current
        ? audience==='dm'?'Черновик → NOTE_ADDED visible:false. «Раскрыть» моделирует отдельное подтверждение visible:true.':'Игрокам показан только раскрытый текст; мастерские поля и нераскрытые props не созданы в DOM.'
        :'Действия ниже только моделируют связь с NOTE_ADDED. В прототипе они не записывают кампанию.';
      const dmNote=document.getElementById('dm-note'), reveal=document.getElementById('reveal');
      dmNote.disabled=!current||audience!=='dm'; reveal.disabled=!current||audience!=='dm'||disclosed.has(current.id);
      reveal.textContent=current&&disclosed.has(current.id)?'Уже раскрыто':'Раскрыть игрокам';
      document.getElementById('status').textContent='';
    }
    document.getElementById('dm-mode').addEventListener('click',()=>{audience='dm';render()});
    document.getElementById('player-mode').addEventListener('click',()=>{audience='players';render()});
    document.getElementById('dm-note').addEventListener('click',()=>{
      const current=selected&&byId(selected); if(!current)return;
      document.getElementById('status').textContent='Черновик мастера подготовлен (в кампанию не записан).';
    });
    document.getElementById('reveal').addEventListener('click',()=>{
      const current=selected&&byId(selected); if(!current)return;
      disclosed.add(current.id); audience='players'; render();
      document.getElementById('status').textContent='Показана безопасная заметка-прототип. В настоящем приложении здесь нужно явное событие NOTE_ADDED visible:true.';
    });
    render();

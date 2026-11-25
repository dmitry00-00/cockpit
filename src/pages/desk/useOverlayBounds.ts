import { useLayoutEffect, type RefObject } from 'react';

/** Reserve actual party/header/footer bounds; never hardcode a clock or card height. */
export function useOverlayBounds(main: RefObject<HTMLElement | null>, host: HTMLElement | null, expanded: boolean, workspace: string | null, face: string) {
 useLayoutEffect(() => {
  const area=main.current;
  if(!area||!host)return;
  const header=area.querySelector<HTMLElement>('.desk-party-header');
  const toolbar=header?.querySelector<HTMLElement>('.party-spread-toolbar');
  const actions=header?.querySelector<HTMLElement>('.desk-party-actions');
  const context=area.querySelector<HTMLElement>('.party-spread-context');
  const update=()=>{
   const box=area.getBoundingClientRect();
   const top = expanded && !workspace
    ? Math.max(toolbar?.getBoundingClientRect().bottom??box.top,actions?.getBoundingClientRect().bottom??box.top)
    : header?.getBoundingClientRect().bottom??box.top;
   const bottom=context && expanded && !workspace ? context.getBoundingClientRect().top : box.bottom;
   if(typeof window.matchMedia==='function' && window.matchMedia('(max-width: 700px)').matches){
    // On a phone the tools rail consumes most of the useful width. Pin local
    // windows to the viewport while keeping the party bar and time ribbon clear.
    host.style.position='fixed';
    host.style.left='0';
    host.style.right='0';
    host.style.zIndex='50';
    host.style.top=`${Math.max(0,top)}px`;
    host.style.bottom=`${Math.max(0,window.innerHeight-bottom)}px`;
   }else{
    host.style.position='absolute';
    host.style.left='0';
    host.style.right='0';
    host.style.zIndex='';
    host.style.top=`${Math.max(0,top-box.top)}px`;
    host.style.bottom=`${Math.max(0,box.bottom-bottom)}px`;
   }
  };
  update();
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
  for(const node of [area,header,toolbar,actions,context])if(node)observer?.observe(node);
  window.addEventListener('resize',update);
  return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
 },[main,host,expanded,workspace,face]);
}

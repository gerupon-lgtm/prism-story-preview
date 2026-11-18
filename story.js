import {VERSION,blocks,slides} from './story-data.js?v=0.1.8';
import {Chime,BELL_SOUND} from './engine/audio.js?v=story-0.1.8';
import {SPIRIT_CUES,VOICE_LIFE,spiritVoice} from './spirit-voice.js?v=0.1.8';

// 独立した閲覧試作。Session、成績、保存、PWA登録には接続しない。
const $=id=>document.getElementById(id),reader=$('reader'),scene=$('scene');
const chime=new Chime({latencyHint:.03});chime.muted=true;
const media=matchMedia('(prefers-reduced-motion: reduce)');
let preference='auto';
try{const saved=JSON.parse(localStorage.getItem('prism-notes.motion.v1'));if(saved?.version===1&&['auto','full','reduce'].includes(saved.value))preference=saved.value;}catch{/* 読めない場合は端末設定。保存は変更しない。 */}
let reduced=preference==='reduce'||preference==='auto'&&media.matches;
let index=Math.max(0,slides.findIndex(s=>s.id===decodeURIComponent(location.hash.slice(1))));
let sound=false,paused=false,epoch=0,tailUntil=0,queued=false,loading=false,notice='音は「音：なし」から有効にできます。';
const timers=new Set();
const preparedScenes=new Map();
const ringing=new WeakMap();
// 回想の4鐘の音程はROOT序章の定数に合わせる。音色はPRISMのChimeを変更せず利用。
const ROOT_BELL_HZ={12:349.23,9:349.23*4/3,8:349.23*3/2,6:349.23*2};
const asset=name=>name.startsWith('r:')?`./assets/${name.slice(2)}.webp?v=${VERSION}`:`./public/${name.includes('/')?name:`graphics/${name}.png`}?v=${VERSION}`;
const art=(name,x,y,w,h,cls='')=>({name,x,y,w,h,cls});
const bell=(x=59,y=25,w=23,h=65,cls='')=>art('goal',x,y,w,h,'bell '+cls);
const spirit=(x=11,y=29,w=27,h=64,cls='')=>art('spirit-guide.png',x,y,w,h,'spirit '+cls);
// 上の spirit-guide は public/ 直下。画像の原本は一切加工しない。
const source=(x=20,y=25,w=17,h=25)=>art('source',x,y,w,h);
const prism=(x=45,y=45,w=12,h=20)=>art('prism',x,y,w,h);
// ROOT序章と同じ4つの鐘。祭壇の枠は付けず、大きさの比を保って下端をそろえる。
const forgedBells=(dim=[])=>[12,9,8,6].map((n,i)=>{
 const w={12:25.3125,9:18.984375,8:16.875,6:12.65625}[n],h=w*1.6;
 return art('r:bell-'+n,[10.15625,37.03125,57.578125,76.015625][i],80.208333-h,w,h,'forged-bell '+(dim.includes(n)?'dim':''));
});
const scenes={
 forge:{bg:'r:forge-legend',art:[...forgedBells(),art('r:hammer',5.5,79,15.2,16)],kind:'forge'},
 order:{bg:'r:forge-legend',art:[art('r:shadow-order',14,28,72,54,'shadow'),...forgedBells([12,6])],kind:'forge'},
 sealed:{bg:'r:forge-legend',art:[art('r:order-sealing-people',12.5,13.5,75,65),art('r:shield-sealed',30.1,47.4,13.3,28),art('r:sword-sealed',43.4,45.8,13.3,29),art('r:armor-sealed',56.6,47.4,13.3,28)],kind:'sealing'},
 altar:{bg:'ruins',art:[bell(39,20,26,71),bell(78,42,9,28,'distant')],kind:'altar'},
 broken:{bg:'ruins',art:[source(16,60,17,25),prism(45,47,12,20),bell(72,24,17,53)],kind:'broken'},
 invitation:{bg:'ruins',art:[spirit(14,23,32,71),bell(66,30,20,60)],kind:'stars'},
 departure:{bg:'ruins',art:[spirit(8,42,20,53),source(29,56,13,22),prism(47,47,11,17),bell(70,22,18,57)],kind:'stars'},
 fault:{bg:'observatory',art:[prism(43,42,15,23,'distant'),bell(73,25,17,55)],kind:'fault'},
 repeat:{bg:'observatory',art:[spirit(12,36,25,60),bell(55,18,28,73)],kind:'repeat'},
 far:{bg:'starwalk',art:[bell(23,35,22,61),bell(75,27,9,27,'distant')],kind:'far'},
 many:{bg:'starwalk',art:[bell(13,43,15,44),bell(43,34,12,36),bell(69,25,9,28,'distant'),spirit(78,45,17,48)],kind:'stars'},
 water:{bg:'moonwater',art:[bell(24,23,18,50),bell(61,30,16,46)],kind:'water'},
 echo:{bg:'moonwater',art:[spirit(8,38,23,57),bell(40,20,18,51),bell(73,27,16,45)],kind:'echo'},
 memory:{bg:'r:forge-legend',art:[...forgedBells(),art('r:hammer',5.5,79,15.2,16,'memory-ghost')],kind:'forge'},
 remember:{bg:'starecho',art:[spirit(28,22,34,75),bell(73,33,16,47)],kind:'remember'},
 return:{bg:'starreturn',art:[source(26,15,19,29),bell(65,47,18,49)],kind:'return'},
 branch:{bg:'starreturn',art:[source(44,12,19,28),bell(74,49,16,44),spirit(12,40,23,57)],kind:'branch'},
 mirror:{bg:'moonmirror',art:[art('mirror',43,22,28,66)],kind:'mirror'},
 reflection:{bg:'moonmirror',art:[spirit(12,30,29,66),art('mirror',59,23,25,62),art('r:spirit-listening',63,35,14,40,'memory-ghost')],kind:'mirror'},
 gate:{bg:'stargate',art:[prism(43,33,16,27)],kind:'gate'},
 lastgate:{bg:'stargate',art:[spirit(12,35,25,61),bell(59,28,20,59)],kind:'lastgate'},
 complete:{bg:'ruins',art:[source(43,9,14,22),bell(14,48,15,44),bell(43,43,17,50),bell(76,48,15,44)],kind:'complete'},
 panorama:{bg:'starwalk',art:[bell(19,41,11,34),bell(46,32,12,36),bell(76,42,10,31)],kind:'panorama'},
 thanks:{bg:'starwalk',art:[spirit(28,19,36,78),bell(76,39,14,40)],kind:'stars'},
 quiet:{bg:'ruins',art:[bell(25,42,12,35,'distant'),bell(72,36,10,29,'distant')],kind:'quiet'},
 future:{bg:'r:forge-ruins',art:[art('r:monochord-story',24,43,57,37),art('r:hammer',9,76,20,15,'old')],kind:'future'},
 root:{bg:'r:forge-ruins',art:[art('r:monochord-story',20,44,60,38),art('r:hammer',8,78,18,13,'old'),art('r:spirit-listening',67,18,24,59,'future-spirit')],kind:'future'},
};
// 星の精霊の採用絵は左向き。画像は変えず、対象が左・精霊が右になるよう座標を入れ替える。
// many は初めから精霊が右・鐘が左なので、そのまま使う。
const inwardScenes=new Set(['invitation','departure','repeat','echo','remember','branch','reflection','lastgate','thanks']);
function imageEl(name,cls=''){
 const img=new Image();
 img.src=name==='spirit-guide.png'?`./public/spirit-guide.png?v=${VERSION}`:asset(name);
 img.alt='';img.className=cls;img.draggable=false;return img;
}
const svgNS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs){const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;}
function lightmap(kind){
 const svg=svgEl('svg',{class:'lightmap',viewBox:'0 0 1280 800',preserveAspectRatio:'none','aria-hidden':'true'});
 const stars=[[90,130],[220,65],[415,150],[530,80],[660,130],[850,90],[1050,150],[1180,68],[343,275],[933,245],[1075,350]];
 if(!['forge','seal','future','memory'].includes(kind))for(const [i,[cx,cy]] of stars.entries())svg.append(svgEl('circle',{cx,cy,r:i%3===0?1.8:1,class:`starlight ${i===1||i===7?'spark':''}`,style:`animation-delay:${-i*.7}s`}));
 const path=(d,cls='ray')=>svg.append(svgEl('path',{d,class:cls}));
 const ellipse=(cx,cy,rx,ry,cls='pool')=>svg.append(svgEl('ellipse',{cx,cy,rx,ry,class:cls}));
 if(['broken','fault'].includes(kind))path('M 200 570 Q 460 400 900 350','ray broken-ray');
 if(['far','complete','panorama','quiet'].includes(kind)){
  path('M 210 520 Q 560 200 1050 480');path('M 210 520 Q 600 680 1050 480');
 }
 if(['water','echo'].includes(kind))for(let i=0;i<3;i++){ellipse(420,660,90+i*30,12+i*8);ellipse(900,665,75+i*30,11+i*8);}
 if(kind==='return')path('M 900 540 C 1160 260 560 110 450 260');
 if(kind==='branch'){path('M 690 230 Q 900 300 1080 520');path('M 690 230 Q 470 260 400 430');}
 if(kind==='mirror')path('M 140 400 L 830 365 L 1120 180');
 if(['gate','lastgate'].includes(kind)){ellipse(kind==='gate'?650:890,390,155,230,'halo');ellipse(kind==='gate'?650:890,390,166,240,'pool');}
 if(kind==='complete'){ellipse(640,430,260,130,'halo');for(const [cx,cy] of [[270,430],[660,390],[1060,430]])ellipse(cx,cy,35,60,'halo');}
 return svg;
}
function buildScene(slide){
 const spec=scenes[slide.scene],holder=document.createElement('div'),reverseLayout=inwardScenes.has(slide.scene);
 holder.append(imageEl(spec.bg,'backdrop'));
 if(spec.kind==='forge'){const tint=document.createElement('div');tint.className='forge-tint';holder.append(tint);}
 if(['complete','panorama'].includes(spec.kind)){
  for(const [bg,x,y,w,h] of [['moonwater',1,48,39,52],['observatory',60,25,40,60],['moonmirror',30,40,40,60]]){
   const img=imageEl(bg,'journey-fragment');Object.assign(img.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});holder.append(img);
  }
 }
 if(spec.kind==='memory')holder.append(imageEl('r:forge-legend','memory-backdrop'));
 const light=lightmap(spec.kind);if(reverseLayout)light.style.transform='scaleX(-1)';holder.append(light);
 for(const item of spec.art){const img=imageEl(item.name,'art '+item.cls);Object.assign(img.style,{left:(reverseLayout?100-item.x-item.w:item.x)+'%',top:item.y+'%',width:item.w+'%',height:item.h+'%'});holder.append(img);}
 if(spec.kind==='seal')for(const cls of ['seal-glow','seal-stone']){const div=document.createElement('div');div.className=cls;holder.append(div);}
 return holder;
}
function prepareScene(slide){
 if(!preparedScenes.has(slide.scene)){
  const holder=buildScene(slide);
  const promise=Promise.all([...holder.querySelectorAll('img')].map(img=>img.decode())).then(()=>holder);
  preparedScenes.set(slide.scene,promise);
  promise.catch(()=>{if(preparedScenes.get(slide.scene)===promise)preparedScenes.delete(slide.scene);});
 }
 return preparedScenes.get(slide.scene);
}
function preloadNext(){
 const next=slides[(index+1)%slides.length];
 for(const key of preparedScenes.keys())if(key!==next.scene)preparedScenes.delete(key);
 void prepareScene(next).catch(()=>{/* 先読みの失敗は、実際の移動時に再試行する。 */});
}
function later(fn,delay){const timer=setTimeout(()=>{timers.delete(timer);fn();},delay);timers.add(timer);return timer;}
function stopAll(reason='stopped'){
 epoch++;for(const timer of timers)clearTimeout(timer);timers.clear();tailUntil=0;queued=false;loading=false;reader.removeAttribute('aria-busy');for(const img of $('scenery').querySelectorAll('.is-ringing')){img.classList.remove('is-ringing');ringing.delete(img);}chime.stop(reason);paused=true;reader.classList.add('paused');
}
function updateControls(){
 $('sound').textContent=sound?'音：あり':'音：なし';$('sound').setAttribute('aria-pressed',String(sound));
 for(const id of ['motion','motion-menu'])if($(id)){$(id).textContent=reduced?'動き：控えめ':'動き：通常';$(id).setAttribute('aria-pressed',String(reduced));}
 reader.classList.toggle('reduced',reduced);
 $('previous').disabled=index===0||queued||loading;$('next').disabled=queued||loading;
 $('stop').disabled=paused&&!queued&&!loading;$('replay').disabled=queued||loading;
 $('next').textContent=loading?'準備中':queued?'余韻待ち':index===slides.length-1?'最初から':isLastOfBlock()&&slides[index].block!=='E'?'次の場面へ':'つづき';
 $('status').textContent=notice;
}
function isLastOfBlock(){return !slides[index+1]||slides[index+1].block!==slides[index].block;}
async function playCues(){
 const slide=slides[index],ticket=epoch;
 if(!sound||paused||document.hidden||(!slide.cues?.length&&!slide.speaker))return;
 const voiceDelay=slide.voiceDelay??0;
 const length=Math.max(slide.speaker?voiceDelay+SPIRIT_CUES.at(-1).at+.02+VOICE_LIFE+.15:0,slide.cues?.length?slide.cues.at(-1)[0]+.05+BELL_SOUND.durationSeconds+.15:0);
 tailUntil=performance.now()+500+length*1000;
 try{await chime.enable();}catch{if(ticket!==epoch)return;sound=false;chime.mute();tailUntil=0;notice='音を開始できませんでした。絵と文章で続けられます。';updateControls();return;}
 if(ticket!==epoch||paused||document.hidden||!sound){if(!sound)chime.mute();return;}
 const started=performance.now();tailUntil=started+length*1000;
 if(slide.speaker){
  if(chime.context.state!=='running'){tailUntil=0;notice='音の準備ができませんでした。「再演」で試せます。';updateControls();return;}
  const start=chime.context.currentTime+.02;
  for(const cue of SPIRIT_CUES)spiritVoice(chime,cue.hz,start+voiceDelay+cue.at);
 }
 for(const [at,pitch] of slide.cues??[])later(()=>{
  if(ticket!==epoch||paused||!sound||document.hidden)return;
  const notes=pitch.bells?pitch.bells.map(n=>({hz:ROOT_BELL_HZ[n],img:$('scenery').querySelector(`img[src*="bell-${n}.webp"]`)})):[{hz:440*2**(((pitch.midi??pitch)-69)/12),img:$('scenery').querySelectorAll('.art.bell')[pitch.bell??0]}];
  let start=chime.context.currentTime+.05;
  for(const note of notes){
   if(chime.context.state==='running'){const voice=chime.ring(note.hz,start);if(voice)start=voice.time;}
   else chime.strike({frequencyHz:note.hz});
   // 描画も予約した発音時刻へ合わせる。旧場面の予約はstopAllで取り消す。
   later(()=>{
    if(ticket!==epoch||!note.img)return;
    const stamp={};ringing.set(note.img,stamp);
    note.img.classList.remove('is-ringing');void note.img.offsetWidth;note.img.classList.add('is-ringing');
    later(()=>{if(ticket===epoch&&ringing.get(note.img)===stamp){note.img.classList.remove('is-ringing');ringing.delete(note.img);}},BELL_SOUND.durationSeconds*1000);
   },Math.max(0,(start-chime.context.currentTime)*1000));
  }
  tailUntil=Math.max(tailUntil,performance.now()+(Math.max(0,start-chime.context.currentTime)+BELL_SOUND.durationSeconds+.15)*1000);
 },at*1000);
 const markQuiet=()=>{if(ticket!==epoch||queued)return;const remaining=tailUntil-performance.now();if(remaining>20){later(markQuiet,remaining+20);return;}notice='余韻が静かになりました。';updateControls();};
 later(markQuiet,tailUntil-performance.now());
 notice=slide.speaker?(slide.cues?.length?'鐘の応答と星の精霊の声を聴けます。通常のページ送りは余韻を待ちます。':'星の精霊の声を聴けます。通常のページ送りは余韻を待ちます。'):'鐘と余韻を聴けます。通常のページ送りは余韻を待ちます。';updateControls();
}
async function render(target=index){
 const ticket=epoch,slide=slides[target];loading=true;reader.setAttribute('aria-busy','true');notice='場面の絵を準備しています。';updateControls();
 let prepared;
 try{prepared=await prepareScene(slide);}catch{
  if(ticket!==epoch)return;loading=false;reader.removeAttribute('aria-busy');notice='絵を読み込めませんでした。「再演」で試せます。';updateControls();return;
 }
 if(ticket!==epoch)return;
 index=target;loading=false;reader.removeAttribute('aria-busy');
 const block=blocks.find(b=>b.id===slide.block);paused=false;reader.classList.remove('paused');
 $('era').textContent=slide.era;$('art-note').textContent=slide.note??'';
 $('block-position').textContent=block.position;$('chapter-title').textContent=block.title;
 $('narration').textContent=slide.words;$('speaker').hidden=!slide.speaker;$('words').scrollTop=0;
 $('bridge').textContent=isLastOfBlock()?block.after:'';
 $('counter').innerHTML=`${String(index+1).padStart(2,'0')} <i>/ 27</i>`;$('slide-id').textContent=slide.id;
 $('progress-fill').style.width=((index+1)/slides.length*100)+'%';
 notice=slide.music?'楽曲は未収録です。時間を決めず、手動で進めます。':sound?(slide.speaker?'星の精霊の声を鳴らします。':slide.cues?.length?'この場面では鐘を鳴らします。':'この場面は音なしです。'):'音なしで閲覧中。音を有効にすると、物語に合わせて鐘と精霊の声が響きます。';
 scene.dataset.effect=slide.scene;scene.setAttribute('aria-label',`${slide.era}。${slide.note??''}`);
 $('scenery').replaceChildren(...prepared.childNodes);preparedScenes.delete(slide.scene);$('music-slot').hidden=!slide.music;
 updateControls();history.replaceState(null,'',`#${slide.id}`);void playCues();preloadNext();
 document.title=`${slide.id} · PRISM NOTES おはなし試作 v${VERSION}`;
 for(const button of $('scene-list').querySelectorAll('[data-index]'))button.setAttribute('aria-current',String(Number(button.dataset.index)===index));
}
function show(target,{immediate=false}={}){
 if(queued||loading)return;
 if(!immediate&&sound&&!paused&&tailUntil>performance.now()){
  queued=true;notice='余韻のあとに進みます。「停止」でこのページに留まれます。';updateControls();
  const ticket=epoch;
  const finish=()=>{if(ticket!==epoch)return;const remaining=tailUntil-performance.now();if(remaining>20){later(finish,remaining+20);return;}queued=false;show(target,{immediate:true});};
  later(finish,tailUntil-performance.now()+20);return;
 }
 stopAll('navigation');void render(Math.max(0,Math.min(slides.length-1,target)));
}
$('previous').addEventListener('click',()=>show(index-1));
$('next').addEventListener('click',()=>show(index===slides.length-1?0:index+1));
$('stop').addEventListener('click',()=>{stopAll();notice='停止しました。「再演」でこの場面を初めから見られます。';updateControls();});
$('replay').addEventListener('click',()=>{stopAll('replay');render();});
$('sound').addEventListener('click',()=>{
 if(sound){sound=false;stopAll('muted');chime.mute();notice='消音しました。「再演」で絵の動きを再開できます。';updateControls();}
 else{stopAll('replay');sound=true;render();}
});
function toggleMotion(){preference=reduced?'full':'reduce';reduced=!reduced;updateControls();}
$('motion').addEventListener('click',toggleMotion);
const motionMenu=document.createElement('button');motionMenu.id='motion-menu';motionMenu.type='button';motionMenu.addEventListener('click',toggleMotion);$('scene-menu').querySelector('.menu-foot').insertBefore(motionMenu,$('restart'));
media.addEventListener('change',()=>{if(preference==='auto'){reduced=media.matches;updateControls();}});
for(const block of blocks){
 const group=document.createElement('section'),heading=document.createElement('h3');heading.textContent=block.title;group.append(heading);
 for(const [i,slide] of slides.entries())if(slide.block===block.id){
  const button=document.createElement('button');button.type='button';button.dataset.index=i;
  const id=document.createElement('b'),text=document.createElement('span');id.textContent=slide.id;text.textContent=slide.words;button.append(id,text);button.addEventListener('click',()=>{$('scene-menu').close();show(i,{immediate:true});});group.append(button);
 }
 $('scene-list').append(group);
}
$('chapters').addEventListener('click',()=>{stopAll('menu');notice='場面一覧を開いたため停止しました。続きは「再演」から。';updateControls();$('scene-menu').showModal();$('scene-list').querySelector('[aria-current=true]')?.scrollIntoView({block:'nearest'});});
$('close-menu').addEventListener('click',()=>$('scene-menu').close());
$('scene-menu').addEventListener('click',event=>{if(event.target===$('scene-menu')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
$('skip').addEventListener('click',()=>{const next=slides.findIndex((s,i)=>i>index&&s.block!==slides[index].block);$('scene-menu').close();show(next<0?0:next,{immediate:true});});
$('restart').addEventListener('click',()=>{$('scene-menu').close();show(0,{immediate:true});});
document.addEventListener('keydown',event=>{
 if($('scene-menu').open||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,select,textarea,[contenteditable]'))return;
 if(event.key==='ArrowRight'){event.preventDefault();show(index===slides.length-1?0:index+1);}
 if(event.key==='ArrowLeft'){event.preventDefault();show(index-1);}
 if(event.key==='Escape'){stopAll();notice='停止しました。「再演」で再開できます。';updateControls();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAll('hidden');notice='画面が非表示になったため停止しました。「再演」で再開できます。';updateControls();}});
window.addEventListener('pagehide',()=>{stopAll('pagehide');void chime.context?.suspend();});
window.addEventListener('hashchange',()=>{const target=slides.findIndex(s=>s.id===decodeURIComponent(location.hash.slice(1)));if(target>=0&&target!==index)show(target,{immediate:true});});
// 検査用の読取専用情報。ゲーム状態を操作する入口は設けない。
Object.defineProperty(window,'__storyPreview',{get:()=>({version:VERSION,index,id:slides[index].id,total:slides.length,sound,paused,reduced,queued,loading,timers:timers.size,voices:chime.voices.size,spiritVoices:[...chime.voices].filter(v=>v.kind==='spirit').map(v=>({hz:v.hz,time:v.time,end:v.end})),bellTimes:[...chime.bellVoices].map(v=>v.time),bells:[...chime.bellVoices].map(v=>({hz:v.frequencyHz,time:v.time,end:v.endTime})),pendingBells:chime.pendingBells.length,tailRemaining:Math.max(0,tailUntil-performance.now()),audioState:chime.context?.state??'uncreated'})});
render();

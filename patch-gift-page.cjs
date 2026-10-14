const fs=require('fs');
const file='C:/Users/Lenovo/GiftLoop-demo/dist/index.html';
let s=fs.readFileSync(file,'utf8');
const start=s.indexOf('  function renderPersonList(){');
const end=s.indexOf('\n  function renderHouse()',start);
if(start<0||end<0)throw new Error('renderPersonList not found');
const replacement=`  function renderPersonList(){
    const row=document.getElementById('personList'),strip=document.getElementById('giftProfileStrip'),setup=document.getElementById('giftSetup'),reminder=document.getElementById('giftRecentReminder');
    if(!row||!strip||!setup||!reminder)return;
    if(state.selected&&!getFriendByRef(state.selected.id))state.selected=null;
    const visible=state.friends.filter(f=>!giftFriendQuery||(f.name+f.relationship+f.interests.join('')).toLowerCase().includes(giftFriendQuery)).slice(0,4);
    row.innerHTML=visible.map(f=>\`<button class="gift-friend \${state.selected?.id===f.id?'selected':''}" data-pick-person="\${f.id}" style="--friend-tone:\${f.mbtiColor}"><span class="gift-person" aria-hidden="true"><i class="hair"></i><i class="head"></i><i class="body"></i></span><b>\${escapeHtml(f.name)}</b><small>\${escapeHtml(f.relationship)}</small></button>\`).join('')||'<div class="gift-recent-empty">还没有朋友，先去朋友页添加一位吧。</div>';
    const upcoming=state.friends.find(f=>/生日|毕业|纪念日/.test(f.date));
    if(upcoming){const occasion=(upcoming.date.match(/生日|毕业|纪念日/)||['重要日'])[0],days=(String(upcoming.meta||'').match(/\\d+/)||[])[0],timing=days?occasion+'还有 '+days+' 天':upcoming.date;reminder.innerHTML=\`<button class="gift-recent-card" data-quick-prepare="\${upcoming.id}" data-quick-occasion="\${occasion}" style="--friend-tone:\${upcoming.mbtiColor}"><span class="gift-recent-person" aria-hidden="true"></span><span class="gift-recent-copy"><b>\${escapeHtml(upcoming.name)}</b><small>\${escapeHtml(timing)}</small></span><span class="gift-recent-action">准备心意 →</span></button>\`}else{reminder.innerHTML='<div class="gift-recent-empty">最近没有赶着准备的日子，想送礼也不需要理由。</div>'}
    const f=state.selected;
    setup.classList.toggle('open',!!f);
    if(!f){strip.innerHTML='';return}
    const latestNote=state.notes.find(n=>n.friendId===f.id||n.friend===f.name),recent=latestNote?.event||f.recentMemories?.[0]||'最近还没有新的记录';
    strip.innerHTML=\`<b>\${escapeHtml(f.name)} · \${escapeHtml(f.relationship)}</b><small>\${escapeHtml(f.personality.join(' · '))}<br>\${escapeHtml(f.interests.join(' / '))}</small><em>最近记得：「\${escapeHtml(recent.replace(/^最近/,'')}」</em>\`;
    document.querySelectorAll('[data-gift-reason]').forEach(x=>x.classList.toggle('selected',x.dataset.giftReason===state.giftReason));
    document.querySelectorAll('[data-gift-budget]').forEach(x=>x.classList.toggle('selected',x.dataset.giftBudget===state.budget));
  }`;
s=s.slice(0,start)+replacement+s.slice(end);
const marker="const giftReasonButton=e.target.closest('[data-gift-reason]');";
const insertion="const quickPrepare=e.target.closest('[data-quick-prepare]');if(quickPrepare){state.selected=getFriendByRef(quickPrepare.dataset.quickPrepare);state.giftReason=quickPrepare.dataset.quickOccasion||'生日';state.occasion=state.giftReason;renderPersonList();setTimeout(()=>document.getElementById('giftSetup')?.scrollIntoView({behavior:'smooth',block:'start'}),80);return}"+marker;
if(!s.includes(marker))throw new Error('click marker not found');
s=s.replace(marker,insertion);
fs.writeFileSync(file,s,'utf8');
console.log('Gift page logic updated');

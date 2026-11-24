(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const main = get('guide');
  const topics = [...main.querySelectorAll('section[data-topic]')];
  const overview = get('overview');
  const menu = get('mobile-topics');
  const topicLinks = [...document.querySelectorAll('[data-topic-link]')];
  const rail = get('right-rail');
  const railNav = get('rail-nav');
  const dialog = get('search-dialog');
  const query = get('query');
  const hits = get('search-results');
  const openSearch = get('open-search');
  const themeButton = get('theme-choice');
  const themeKey = 'hypha-guide-theme';
  let active;
  let railTargets = [];
  let scrollFrame = 0;
  let lastSearchFocus;
  const plain = text => (text || '').replace(/\s+/g,' ').trim();
  const normalize = text => plain(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function setTheme(theme, save = false) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    const other = value === 'light' ? 'Dark' : 'Light';
    get('theme-text').textContent = other + ' mode';
    themeButton.setAttribute('aria-label','Switch to ' + other.toLowerCase() + ' mode');
    get('theme-color').content = value === 'light' ? '#ffffff' : '#000000';
    if (save) {
      try { localStorage.setItem(themeKey,value); } catch { /* The choice still applies to this document. */ }
    }
  }
  setTheme(document.documentElement.dataset.theme);
  themeButton.hidden = false;
  themeButton.addEventListener('click',() => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light',true));
  window.addEventListener('storage',event => { if (event.key === themeKey) setTheme(event.newValue); });

  function showRail(topic) {
    railNav.replaceChildren();
    const links = [...topic.querySelectorAll('.within-topic a')];
    rail.hidden = links.length === 0;
    railTargets = [];
    if (!links.length) return;
    const label = document.createElement('p');
    label.textContent = 'In this topic';
    label.className = 'rail-label';
    const list = document.createElement('ul');
    links.forEach(original => {
      const link = original.cloneNode(true);
      const item = document.createElement('li');
      item.append(link);
      list.append(item);
      railTargets.push({link,target:get(link.hash.slice(1))});
    });
    railNav.append(label,list);
  }
  function scrollMark() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const cutoff = document.querySelector('.topbar').offsetHeight + 85;
      let chosen;
      for (const item of railTargets) {
        if (item.target && item.target.getBoundingClientRect().top <= cutoff) chosen = item;
      }
      for (const item of railTargets) {
        if (item === chosen) item.link.setAttribute('aria-current','location');
        else item.link.removeAttribute('aria-current');
      }
    });
  }
  const globalTitle = document.createElement('h1');
  globalTitle.className = 'sr';
  globalTitle.textContent = 'Hypha player guide';
  globalTitle.hidden = true;
  main.prepend(globalTitle);
  function hashId() {
    try { return decodeURIComponent(location.hash.slice(1)); }
    catch { return ''; }
  }
  function navigate(moveFocus = true) {
    const id = hashId();
    const destination = get(id);
    const topic = id === 'guide' ? active || overview : destination?.closest('section[data-topic]') || overview;
    const heading = topic.querySelector('h1,h2');
    if (active !== topic) {
      topics.forEach(t => { t.hidden = t !== topic; });
      for (const link of topicLinks) {
        if (link.dataset.topicLink === topic.id) link.setAttribute('aria-current','page');
        else link.removeAttribute('aria-current');
      }
      active = topic;
      globalTitle.hidden = active === overview;
      get('mobile-current').textContent = topic.dataset.label;
      document.title = topic.dataset.label + ' · Hypha player guide';
      showRail(topic);
      const activeLink = document.querySelector('.side [aria-current="page"]');
      const side = activeLink?.closest('.side');
      if (side && side.clientHeight && activeLink) {
        const offset = activeLink.getBoundingClientRect().top - side.getBoundingClientRect().top;
        if (offset < 0 || offset > side.clientHeight - 48) side.scrollTop += offset - side.clientHeight / 2;
      }
    }
    menu.open = false;
    const isTop = !id || ['top','guide',topic.id,heading.id].includes(id) || !destination;
    const target = isTop ? heading : destination;
    const disclosure = target.closest('details:not(.within-topic)');
    if (disclosure) disclosure.open = true;
    if (moveFocus) {
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({preventScroll:true});
    }
    requestAnimationFrame(() => {
      const y = isTop ? 0 : target.getBoundingClientRect().top + window.scrollY - document.querySelector('.topbar').offsetHeight - 18;
      window.scrollTo(0,Math.max(0,y));
      scrollMark();
    });
  }
  window.addEventListener('hashchange',() => navigate());
  document.addEventListener('click',event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (dialog.open) dialog.close();
    if (menu.open) menu.open = false;
    if (link.hash === location.hash) { event.preventDefault(); navigate(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.documentElement.classList.add('reader');
  navigate(false);
  window.addEventListener('scroll',scrollMark,{passive:true});

  // Collect only published guide content. Every result resolves to a real static anchor.
  const index = [];
  function neighbors(node) {
    if (node.tagName === 'DT') return node.nextElementSibling?.textContent || '';
    if (node.tagName === 'SUMMARY' || node.tagName === 'STRONG' || node.tagName === 'CAPTION') return node.parentElement.textContent;
    const pieces = [];
    for (let n=node.nextElementSibling; n && pieces.join(' ').length<1100; n=n.nextElementSibling) {
      if (/^H[123]$/.test(n.tagName) || n.matches('nav')) break;
      if (!n.matches('.within-topic')) pieces.push(n.textContent);
    }
    return pieces.join(' ');
  }
  for (const topic of topics) {
    const title = topic.dataset.label;
    const first = topic.querySelector('h1,h2');
    for (const node of topic.querySelectorAll('h1[id],h2[id],h3[id],dt[id],summary[id],caption[id],strong[id]')) {
      const name = plain(node.textContent).replace(/\.$/,'');
      const passage = plain(neighbors(node));
      const key = node === first ? topic.id : node.id;
      index.push({key,name,topic:title,passage,titleKey:normalize(name),groupKey:normalize(title),textKey:normalize(passage)});
    }
  }
  function runSearch() {
    const text = normalize(query.value);
    hits.replaceChildren();
    const status = get('search-status');
    if (!text) { status.textContent = 'Search for a topic, rule or in-app label.'; return; }
    const tokens = text.split(' ');
    const matches = [];
    for (const entry of index) {
      const all = entry.titleKey + ' ' + entry.groupKey + ' ' + entry.textKey;
      if (!tokens.every(token => all.includes(token))) continue;
      let rank = tokens.reduce((a,t) => a + (entry.titleKey.includes(t) ? 9 : 0) + (entry.groupKey.includes(t) ? 2 : 0),0);
      if (entry.titleKey.includes(text)) rank += 18;
      if (entry.groupKey === text) rank += 20;
      if (entry.textKey.includes(text)) rank += 3;
      matches.push({entry,rank});
    }
    matches.sort((a,b) => b.rank-a.rank);
    const shown = matches.slice(0,8);
    status.textContent = shown.length ? (matches.length>shown.length ? 'Top '+shown.length+' of '+matches.length+' results' : shown.length+' result'+(shown.length===1?'':'s')) : 'No matching topics. Try a shorter phrase.';
    for (const {entry} of shown) {
      const li=document.createElement('li'), a=document.createElement('a'), title=document.createElement('strong'), where=document.createElement('small'), excerpt=document.createElement('span');
      a.href='#'+entry.key;title.textContent=entry.name;where.textContent=entry.topic;
      const sample = entry.passage || entry.name;
      excerpt.textContent = sample.length>104 ? sample.slice(0,101).replace(/\s+\S*$/,'')+'…' : sample;
      a.append(where,title,excerpt);li.append(a);hits.append(li);
    }
  }
  function openDialog() {
    if (dialog.open) return;
    lastSearchFocus = document.activeElement;
    menu.open = false;
    dialog.showModal();
    query.value = '';
    runSearch();
    query.focus();
  }
  if (typeof dialog.showModal === 'function') {
    openSearch.hidden=false;
    openSearch.addEventListener('click',openDialog);
    get('close-search').addEventListener('click',() => dialog.close());
    dialog.addEventListener('close',() => { if (document.activeElement === document.body && lastSearchFocus?.isConnected) lastSearchFocus.focus({preventScroll:true}); });
    query.addEventListener('input',runSearch);
    document.addEventListener('keydown',event => {
      const editing=event.target.matches('input,textarea,[contenteditable="true"]');
      if (!dialog.open && ((!editing && event.key==='/') || ((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='k'))) { event.preventDefault();openDialog(); }
    });
    dialog.addEventListener('keydown',event => {
      if (event.key === 'Escape') { event.preventDefault(); dialog.close(); return; }
      const links=[...hits.querySelectorAll('a')];
      if (!links.length) return;
      const i=links.indexOf(document.activeElement);
      if (event.key==='ArrowDown') { event.preventDefault();links[Math.min(i+1,links.length-1)].focus(); }
      else if (event.key==='ArrowUp' && i>=0) { event.preventDefault();(i===0?query:links[i-1]).focus(); }
      else if (event.key==='Enter' && document.activeElement===query) { event.preventDefault();links[0].click(); }
    });
  }
})();


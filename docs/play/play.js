(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const clamp = (x, a=0, b=1) => Math.min(b, Math.max(a, x));
  function smooth(a, b, value) {
    const p = clamp((value-a)/(b-a));
    return p*p*(3-2*p);
  }
  function cubic(a, b, c, d, t) {
    const u = 1-t;
    return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const television = byId('tv-object'), launch = byId('launch');
  const partners = byId('duo-object'), palm = byId('catch');
  const stage = partners.querySelector('.performers');
  const figures = [...stage.querySelectorAll('.performer')];
  const mesh = stage.querySelector('.partner-mesh');
  const flight = byId('flight'), poster = flight.querySelector('img');
  const shell = flight.querySelector('canvas');
  // Five lacquer drops travel out from the same point where the palms meet.
  const droplets = [
    [-.83,-.40, .017,'#ffacdc','#ff378e','#8a145e'],
    [-.51,-.89, .024,'#fafb95','#c8e32d','#647c16'],
    [ .08,-1.0, .015,'#e6dfff','#b49afb','#6155a9'],
    [ .64,-.73, .024,'#fff5a9','#f6ba29','#9b6522'],
    [ .98,-.17, .015,'#f8d5fc','#dd67de','#8944a5']
  ].map(([x,y,size,light,colour,dark]) => {
    const dot = document.createElement('i');
    dot.style.setProperty('--drop-light', light);
    dot.style.setProperty('--drop', colour);
    dot.style.setProperty('--drop-dark', dark);
    palm.append(dot);
    return {dot,x,y,size};
  });

  let manualPause = false, raf = 0, dirty = true, geometry;
  let scrollPose = window.scrollY, lastTime = 0;
  let ball, players, platesReady = false, artRequested = false;
  let lastBallPose = null, lastPlayersPose = null;
  const moves = () => !manualPause && !reduced.matches;
  const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
  function resized() { dirty = true; queue(); }

  function readGeometry() {
    // Read the stationary layout boxes. The television itself tilts during the flight.
    const tv = television.parentElement.getBoundingClientRect();
    const cast = partners.getBoundingClientRect();
    const hands = palm.getBoundingClientRect();
    const y = window.scrollY, h = window.innerHeight;
    const diameter = launch.querySelector('img').offsetWidth;
    const endY = hands.top+y;
    const endScroll = Math.max(h*.52, endY-h*.43);
    geometry = {
      w: document.documentElement.clientWidth, h, diameter, frame: diameter*2.6,
      startX: tv.left+launch.offsetLeft, startY: tv.top+y+launch.offsetTop,
      endX: hands.left, endY, endScroll, castY:cast.top+y, castSize:cast.width
    };
    flight.style.width = geometry.frame+'px';
    ball?.resize(geometry.frame);
    players?.resize(cast.width);
    droplets.forEach(({dot,size}) => dot.style.setProperty('--drop-size',Math.max(4,size*cast.width)+'px'));
    lastBallPose = lastPlayersPose = null;
    dirty = false;
  }

  function setRestingComposition() {
    document.body.classList.remove('with-flight');
    flight.hidden = true;
    stage.hidden = true;
    partners.classList.remove('is-performing');
    television.style.transform = '';
    droplets.forEach(({dot}) => { dot.style.opacity='0'; });
    lastBallPose = lastPlayersPose = null;
  }

  async function prepareArt() {
    if (artRequested || !moves()) return;
    artRequested = true;
    const coating = new Image();
    coating.src = shell.dataset.file;
    coating.decode().then(() => {
      ball = window.HyphaSculptures?.ball(shell,coating,() => {
        ball = null; shell.hidden = true; lastBallPose = null; queue();
      });
      shell.hidden = !ball;
      resized();
    }).catch(() => { shell.hidden = true; });

    try {
      await Promise.all(figures.map(img => {
        img.src = img.dataset.file;
        return img.decode();
      }));
      platesReady = true;
      players = window.HyphaSculptures?.partners(mesh,figures,() => {
        players = null; mesh.hidden = true;
        figures.forEach(img => { img.hidden=false; }); lastPlayersPose=null; queue();
      });
      mesh.hidden = !players;
      figures.forEach(img => { img.hidden=!!players; });
      resized();
    } catch {
      // The original paired sculpture remains present when split artwork cannot load.
      platesReady = false; stage.hidden = true;
    }
  }

  function posePartners(progress, g, scrollY) {
    if (!platesReady || scrollY+g.h < g.castY-70 || scrollY > g.castY+g.castSize+80) return;
    stage.hidden = false;
    partners.classList.add('is-performing');
    const spread = 1-smooth(.62,1,progress);
    const crouch = smooth(.40,.67,progress)*(1-smooth(.67,.90,progress));
    const recoil = -Math.sin(Math.PI*clamp((progress-1.025)/.17))*.40;
    const key = [spread,crouch,recoil].map(n=>Math.round(n*10000)).join('/');
    if (lastPlayersPose !== key) {
      if (players) {
        players.draw(spread,crouch,recoil);
      } else {
        // Independent native image layers still meet when a GPU context is unavailable.
        figures.forEach((img,i) => {
          const direction=i?1:-1;
          img.style.transform='translateX('+(direction*spread*5)+'%) rotate('+(direction*(spread*10+crouch*2-recoil*2))+'deg) scaleY('+(1-.05*crouch)+')';
        });
      }
      lastPlayersPose = key;
    }
    const beat = clamp((progress-.982)/.21);
    const radius = g.castSize*(.026+.145*smooth(0,1,beat));
    const opacity = smooth(0,.19,beat)*(1-smooth(.46,1,beat));
    droplets.forEach(({dot,x,y}) => {
      dot.style.opacity = opacity.toFixed(3);
      if (opacity === 0) return;
      const stretch = 1+.95*(1-beat);
      const angle = Math.atan2(y,x)*180/Math.PI;
      dot.style.transform = 'translate(-50%,-50%) translate('+x*radius+'px,'+y*radius+'px) rotate('+angle+'deg) scale('+stretch+','+(.62+.22*beat)+')';
    });
  }

  function poseBall(progress, g, scrollY) {
    if (progress >= 1.025) { flight.hidden = true; return; }
    flight.hidden = false;
    const t = smooth(0,1,progress);
    const narrow = g.w<=680;
    const x = cubic(g.startX,g.w*(narrow?.95:.96),g.w*(narrow?.21:.20),g.endX,t);
    // A world-space curve keeps the final few pixels registered to the hands on a fast scroll.
    const y = cubic(g.startY,g.h*.18+g.endScroll*.25,g.h*.60+g.endScroll*.70,g.endY,t)-scrollY;
    const pull = Math.pow(Math.max(0,Math.sin(Math.PI*clamp(progress))),1.36);
    const size = (1+.32*pull)*(1-.945*smooth(.75,1,progress));
    flight.style.transform = 'translate3d('+(x-g.frame/2).toFixed(2)+'px,'+(y-g.frame/2).toFixed(2)+'px,0)';
    flight.style.opacity = (1-smooth(.984,1.025,progress)).toFixed(3);
    const blend = ball ? smooth(.008,.072,progress) : 0;
    shell.style.opacity = blend.toFixed(3);
    poster.style.opacity = (1-blend).toFixed(3);
    if (blend < 1) {
      poster.style.transform = 'translate(-50%,-50%) rotate('+(-20+progress*259)+'deg) scale('+(size*(1+.55*pull))+','+(size*(1-.24*pull))+')';
    }
    if (ball && blend>0 && lastBallPose!==progress) {
      ball.draw(clamp(progress),pull,size);
      lastBallPose=progress;
    }
  }

  function paint(time) {
    raf=0;
    if (dirty) readGeometry();
    const g=geometry, y=window.scrollY;
    if (!moves()) {
      scrollPose=y; lastTime=0;
      return;
    }
    document.body.classList.add('with-flight');
    const step = lastTime ? clamp(time-lastTime, 0, 80) : 16.7;
    // Interpolate coalesced wheel deltas. Native scroll and anchor navigation retain control.
    if (Math.abs(y-scrollPose)>g.h*.75) scrollPose=y;
    else scrollPose += (y-scrollPose)*(1-Math.exp(-step/36));
    if (Math.abs(y-scrollPose)<.12) scrollPose=y;
    lastTime=time;
    const progress=scrollPose/g.endScroll;
    const depart=clamp(scrollPose/(g.h*.85));
    television.style.transform='perspective(1100px) rotateY('+(-19*depart).toFixed(2)+'deg) rotateZ('+(-8*depart).toFixed(2)+'deg) scale('+(1+.075*depart).toFixed(3)+')';
    poseBall(progress,g,y);
    posePartners(progress,g,y);
    if (y!==scrollPose) queue();
  }

  function motionChanged() {
    scrollPose=window.scrollY;
    lastTime=0;
    if (!moves()) setRestingComposition();
    else prepareArt();
    resized();
  }
  document.addEventListener('hypha:motion',event => {
    manualPause=event.detail.paused;
    motionChanged();
  });
  reduced.addEventListener('change',motionChanged);
  window.addEventListener('scroll',queue,{passive:true});
  window.addEventListener('resize',resized,{passive:true});
  if ('ResizeObserver' in window) {
    const observer=new ResizeObserver(resized);
    [byId('rally'),byId('draw')].forEach(el=>observer.observe(el));
  }
  if (document.fonts) document.fonts.ready.then(resized);
  if (!moves()) setRestingComposition();
  resized();
  if (document.readyState==='complete') prepareArt();
  else window.addEventListener('load',prepareArt,{once:true});
})();

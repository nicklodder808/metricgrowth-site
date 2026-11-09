/* ==========================================================================
   Metric Growth — site.js
   Vanilla JS, no dependencies. Every animation pauses when off-screen and
   respects prefers-reduced-motion.
   ========================================================================== */
(() => {
  'use strict';
  window.__mg = true;

  const root = document.documentElement;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches;
  const onChange = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn));
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ------------------------------------------------------------------------
     Shared helpers
     ------------------------------------------------------------------------ */
  const svgEl = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(SVGNS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (parent) parent.appendChild(n);
    return n;
  };

  // A gentle quadratic curve between two points. `dir` flips the bend.
  const curve = (x1, y1, x2, y2, dir = 1, bend = 0.16) => {
    const cx = (x1 + x2) / 2 - (y2 - y1) * bend * dir;
    const cy = (y1 + y2) / 2 + (x2 - x1) * bend * dir;
    const f = (n) => n.toFixed(1);
    return `M${f(x1)} ${f(y1)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`;
  };

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // A "comet" is a referral in motion: a short glowing dash travelling a path.
  const createComet = (group, d, { dur = 1700, seg = 48, halo = 7, r = 3 } = {}) => {
    const tail = svgEl('path', { d, class: 'comet-tail' }, group);
    const glow = svgEl('circle', { r: halo, class: 'comet-halo' }, group);
    const head = svgEl('circle', { r, class: 'comet-head' }, group);
    const len = tail.getTotalLength();
    const s = Math.min(seg, len * 0.45);
    tail.style.strokeDasharray = `${s} ${len + s}`;
    tail.style.strokeDashoffset = s;
    const p0 = tail.getPointAtLength(0);
    [glow, head].forEach((c) => {
      c.setAttribute('cx', p0.x);
      c.setAttribute('cy', p0.y);
      c.style.opacity = 0;
    });
    return { tail, glow, head, len, s, dur, t0: performance.now() };
  };

  const advanceComet = (c, now) => {
    const p = Math.min(1, Math.max(0, (now - c.t0) / c.dur));
    const dist = easeInOut(p) * c.len;
    c.tail.style.strokeDashoffset = c.s - dist;
    const pt = c.tail.getPointAtLength(dist);
    c.head.setAttribute('cx', pt.x);
    c.head.setAttribute('cy', pt.y);
    c.glow.setAttribute('cx', pt.x);
    c.glow.setAttribute('cy', pt.y);
    const o = p < 0.08 ? p / 0.08 : p > 0.92 ? (1 - p) / 0.08 : 1;
    c.head.style.opacity = o;
    c.glow.style.opacity = o;
    return p >= 1;
  };

  const removeComet = (c) => {
    c.tail.remove();
    c.glow.remove();
    c.head.remove();
  };

  const ping = (el) => {
    if (!el) return;
    el.classList.remove('is-ping');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('is-ping');
  };

  /* ------------------------------------------------------------------------
     1. Headline: split into words for the entrance animation
     ------------------------------------------------------------------------ */
  const splitWords = (el) => {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
              return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            w.appendChild(inner);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };
    walk(el);
  };
  $$('[data-split]').forEach(splitWords);

  const markLoaded = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-loaded')));
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]).then(markLoaded);
  } else {
    markLoaded();
  }

  /* ------------------------------------------------------------------------
     2. Header: scrolled state, reading progress, hero parallax
     ------------------------------------------------------------------------ */
  const header = $('[data-header]');
  const hero = $('.hero');
  let scrollQueued = false;
  const onScroll = () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      const y = window.scrollY || 0;
      if (header) {
        header.classList.toggle('is-scrolled', y > 8);
        const max = root.scrollHeight - window.innerHeight;
        header.style.setProperty('--progress', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
      }
      if (hero && !reduced() && y < hero.offsetHeight) hero.style.setProperty('--py', (y * 0.12).toFixed(1));
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------------
     3. Mobile menu
     ------------------------------------------------------------------------ */
  const toggle = $('[data-menu-toggle]');
  const menu = $('#mobile-menu');
  const setMenu = (open) => {
    if (!toggle || !header) return;
    toggle.setAttribute('aria-expanded', String(open));
    const label = $('.sr-only', toggle);
    if (label) label.textContent = open ? 'Close menu' : 'Open menu';
    header.classList.toggle('menu-open', open);
    document.body.classList.toggle('no-scroll', open);
  };
  if (toggle && menu) {
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && header.classList.contains('menu-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    onChange(window.matchMedia('(min-width: 901px)'), (e) => {
      if (e.matches) setMenu(false);
    });
  }

  /* ------------------------------------------------------------------------
     4. Reveal on scroll + active navigation
     ------------------------------------------------------------------------ */
  const revealIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealIO.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0 }
  );
  $$('[data-reveal]').forEach((el) => revealIO.observe(el));

  const navLinks = $$('.nav a[href^="#"]');
  const navIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
      });
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  $$('main > section[id]').forEach((s) => navIO.observe(s));

  /* ------------------------------------------------------------------------
     5. Hero: the dot grid lights up around the pointer
     ------------------------------------------------------------------------ */
  if (hero && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let raf = 0;
    let mx = 0;
    let my = 0;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        hero.style.setProperty('--mx', `${mx}px`);
        hero.style.setProperty('--my', `${my}px`);
        hero.style.setProperty('--glow', reduced() ? '0' : '1');
      });
    });
    hero.addEventListener('pointerleave', () => hero.style.setProperty('--glow', '0'));
  }

  /* ------------------------------------------------------------------------
     6. Hero network: partner companies send new customers to "You"
     ------------------------------------------------------------------------ */
  const initNetwork = () => {
    const net = $('[data-network]');
    if (!net) return;
    const svg = $('svg', net);
    const linksG = $('[data-links]', svg);
    const cometsG = $('[data-comets]', svg);
    const orbits = $$('[data-orbit]', svg);
    const firm = $('[data-firm]', net);
    const nodes = $$('[data-node]', net);
    const toast = $('[data-toast]');
    const fromEl = toast && $('[data-toast-from]', toast);
    const textEl = toast && $('[data-toast-text]', toast);
    const order = [0, 3, 1, 4, 2, 5];
    let links = [];
    let comets = [];
    let raf = 0;
    let timer = 0;
    let swapTimer = 0;
    let running = false;
    let inView = false;
    let seq = 0;

    const layout = () => {
      const box = net.getBoundingClientRect();
      if (!box.width) return;
      svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
      const f = firm.getBoundingClientRect();
      const fx = f.left + f.width / 2 - box.left;
      const fy = f.top + f.height / 2 - box.top;
      const fr = f.width / 2;
      orbits.forEach((o, k) => {
        o.setAttribute('cx', fx.toFixed(1));
        o.setAttribute('cy', fy.toFixed(1));
        o.setAttribute('r', (fr * (k ? 3.05 : 1.8)).toFixed(1));
      });
      comets.forEach(removeComet);
      comets = [];
      linksG.replaceChildren();
      links = nodes.map((node, i) => {
        node.classList.remove('is-sending');
        const r = $('.node-dot', node).getBoundingClientRect();
        const x = r.left + r.width / 2 - box.left;
        const y = r.top + r.height / 2 - box.top;
        const d = curve(x, y, fx, fy, i % 2 ? 1 : -1, 0.16);
        const path = svgEl('path', { d, class: 'link' }, linksG);
        return { node, path, d, busy: false };
      });
    };

    const showToast = (node) => {
      if (!toast) return;
      clearTimeout(swapTimer);
      toast.classList.add('is-swap');
      swapTimer = setTimeout(() => {
        fromEl.textContent = node.dataset.from;
        textEl.textContent = node.dataset.moment;
        toast.classList.remove('is-swap');
      }, 230);
    };

    const arrive = (i) => {
      const L = links[i];
      if (!L) return;
      L.busy = false;
      L.node.classList.remove('is-sending');
      if (!L.node.classList.contains('is-hover')) L.path.classList.remove('is-hot');
      ping(firm);
      showToast(L.node);
    };

    const frame = (now) => {
      comets = comets.filter((c) => {
        if (!advanceComet(c, now)) return true;
        removeComet(c);
        arrive(c.i);
        return false;
      });
      raf = comets.length ? requestAnimationFrame(frame) : 0;
    };

    const launch = (i) => {
      const L = links[i];
      if (!L || L.busy) return;
      L.busy = true;
      L.node.classList.add('is-sending');
      L.path.classList.add('is-hot');
      const c = createComet(cometsG, L.d, { dur: 1900, seg: 56 });
      c.i = i;
      comets.push(c);
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const loop = () => {
      if (!running) return;
      launch(order[seq++ % order.length]);
      timer = setTimeout(loop, 2900);
    };
    const start = () => {
      if (running || reduced() || !inView || document.hidden) return;
      running = true;
      timer = setTimeout(loop, 700);
    };
    const stop = () => {
      running = false;
      clearTimeout(timer);
    };

    nodes.forEach((node, i) => {
      const on = () => {
        node.classList.add('is-hover');
        if (links[i]) links[i].path.classList.add('is-hot');
        if (reduced()) showToast(node);
        else launch(i);
      };
      const off = () => {
        node.classList.remove('is-hover');
        const L = links[i];
        if (L && !L.busy) L.path.classList.remove('is-hot');
      };
      node.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
      node.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') off(); });
      node.addEventListener('click', () => {
        on();
        setTimeout(off, 1800);
      });
    });

    new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) start();
        else stop();
      },
      { threshold: 0.15 }
    ).observe(net);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    onChange(mqReduce, () => (reduced() ? stop() : start()));

    let resizeTimer = 0;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 120);
    }).observe(net);
    layout();
    setTimeout(layout, 1500); // re-measure once fonts and entrance animations settle
  };
  initNetwork();

  /* ------------------------------------------------------------------------
     7. "Examples": partnership-type tabs (WAI-ARIA tabs pattern)
     ------------------------------------------------------------------------ */
  const initMoments = () => {
    const wrap = $('[data-moments]');
    if (!wrap) return;
    const tabs = $$('[role="tab"]', wrap);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const list = tabs[0] && tabs[0].parentElement;
    const mqChips = window.matchMedia('(max-width: 860px)');

    const select = (i, { focus = false, user = false } = {}) => {
      tabs.forEach((t, j) => {
        const on = j === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      const p = panels[i];
      p.classList.remove('is-entering');
      void p.offsetWidth;
      p.classList.add('is-entering');
      if (focus) tabs[i].focus({ preventScroll: true });
      if (user && mqChips.matches && list) {
        const t = tabs[i];
        list.scrollTo({ left: t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2, behavior: reduced() ? 'auto' : 'smooth' });
      }
    };

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i, { user: true }));
      t.addEventListener('keydown', (e) => {
        const n = tabs.length;
        let j = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j === null) return;
        e.preventDefault();
        select(j, { focus: true, user: true });
      });
    });
  };
  initMoments();

  /* ------------------------------------------------------------------------
     8. "How it works": the diagram evolves as each step scrolls into view.
        Steps: 1 Research, 2 Offer, 3 Deal, 4 Partners, 5 Launch, 6 Growth.
     ------------------------------------------------------------------------ */
  const initHow = () => {
    const section = $('#how');
    if (!section) return;
    const stage = $('[data-stage]', section);
    const svg = $('[data-stage-svg]', section);
    const steps = $$('.how-step[data-step]', section);
    const list = $('.how-steps', section);
    const firmCore = $('[data-bp-firm]', section);
    const counters = $$('[data-count]', stage);
    if (!stage || !svg || !steps.length) return;
    const LAST = steps.length; // the dashboard counts up on the last step
    const FLOW_FROM = 5; // from "Launch" onwards, new customers flow in

    const C = 260;
    // [angle in degrees, radius, fit score 1-3]. Score 3 = the firms we recruit.
    const spots = [
      [5, 122, 2], [50, 134, 3], [95, 118, 1], [140, 130, 3], [185, 126, 2], [230, 138, 3], [275, 120, 1], [320, 132, 3],
      [25, 204, 3], [55, 196, 1], [80, 212, 2], [115, 190, 3], [150, 208, 1], [172, 198, 2],
      [205, 214, 3], [240, 192, 1], [262, 206, 2], [295, 200, 3], [335, 210, 1], [355, 194, 2],
    ];
    const cands = spots.map(([a, r, s], i) => {
      const t = (a * Math.PI) / 180;
      return { x: C + r * Math.cos(t), y: C + r * Math.sin(t), s, top: s === 3, i };
    });

    // Blueprint scaffolding
    const grid = svgEl('g', {}, svg);
    [82, 150, 222].forEach((r, k) => svgEl('circle', { cx: C, cy: C, r, class: k === 2 ? 'bp-ring dash' : 'bp-ring' }, grid));
    svgEl('path', { d: `M${C} 26V494M26 ${C}H494`, class: 'bp-cross' }, grid);
    let ticks = '';
    for (let a = 0; a < 360; a += 15) {
      const t = (a * Math.PI) / 180;
      const r2 = a % 45 === 0 ? 234 : 229;
      ticks += `M${(C + 222 * Math.cos(t)).toFixed(1)} ${(C + 222 * Math.sin(t)).toFixed(1)}L${(C + r2 * Math.cos(t)).toFixed(1)} ${(C + r2 * Math.sin(t)).toFixed(1)}`;
    }
    svgEl('path', { d: ticks, class: 'bp-ticks' }, grid);

    const gLinks = svgEl('g', {}, svg);
    const gCands = svgEl('g', {}, svg);
    const gBadges = svgEl('g', {}, svg);
    const gComets = svgEl('g', {}, svg);
    const topLinks = [];
    let li = 0;
    let bi = 0;
    cands.forEach((c) => {
      const g = svgEl('g', { class: `cand s${c.s}${c.top ? ' top' : ''}`, transform: `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})` }, gCands);
      const inner = svgEl('g', { class: 'cand-inner', style: `--i:${c.i}` }, g);
      svgEl('circle', { r: 10.5, class: 'cand-halo' }, inner);
      svgEl('path', { d: 'M0 -10.5A10.5 10.5 0 1 1 -0.01 -10.5', class: 'cand-ring', pathLength: 3, 'stroke-dasharray': `${c.s} 3` }, inner);
      svgEl('circle', { r: c.top ? 4.2 : 3.4, class: 'cand-dot' }, inner);
      if (!c.top) return;
      const d = curve(c.x, c.y, C, C, li % 2 ? 1 : -1, 0.14);
      svgEl('path', { d, class: 'rlink', pathLength: 1, style: `--i:${li}` }, gLinks);
      topLinks.push(d);
      if (li % 2 === 0) {
        const bx = c.x + (c.x > C ? 12 : -34);
        const by = c.y - 30;
        const bg = svgEl('g', { transform: `translate(${bx.toFixed(1)} ${by.toFixed(1)})` }, gBadges);
        const bin = svgEl('g', { class: 'badge-inner', style: `--i:${bi++}` }, bg);
        svgEl('rect', { x: 0, y: 0, width: 22, height: 20, rx: 3.5 }, bin);
        svgEl('path', { d: 'M0 6.5H22M6 -2V3M16 -2V3' }, bin);
        svgEl('path', { d: 'M7 13l3 3 5-6' }, bin);
      }
      li++;
    });

    // Customer flow (steps 5 and 6)
    let flowing = false;
    let inView = false;
    let raf = 0;
    let timer = 0;
    let comets = [];
    let k = 0;
    const frame = (now) => {
      comets = comets.filter((c) => {
        if (!advanceComet(c, now)) return true;
        removeComet(c);
        ping(firmCore);
        return false;
      });
      raf = comets.length ? requestAnimationFrame(frame) : 0;
    };
    const emit = () => {
      if (!flowing) return;
      k = (k * 5 + 3) % topLinks.length;
      comets.push(createComet(gComets, topLinks[k], { dur: 1500, seg: 34, halo: 6, r: 2.6 }));
      if (!raf) raf = requestAnimationFrame(frame);
      timer = setTimeout(emit, 720);
    };
    const startFlow = () => {
      if (flowing || reduced() || !inView) return;
      flowing = true;
      emit();
    };
    const stopFlow = () => {
      flowing = false;
      clearTimeout(timer);
    };

    // Dashboard numbers count up the first time the last step is reached
    counters.forEach((el) => { el.textContent = '0'; });
    let counted = false;
    const countUp = () => {
      if (counted) return;
      counted = true;
      counters.forEach((el) => {
        const to = Number(el.dataset.count);
        if (reduced()) {
          el.textContent = String(to);
          return;
        }
        const t0 = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / 1500);
          el.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    };

    let current = 0;
    const setStep = (n) => {
      if (n === current) return;
      current = n;
      stage.dataset.current = String(n);
      for (let s = 1; s <= LAST; s++) stage.classList.toggle(`reach-${s}`, n >= s);
      steps.forEach((st) => st.classList.toggle('is-active', Number(st.dataset.step) === n));
      list.style.setProperty('--hp', ((n - 1) / (LAST - 1)).toFixed(3));
      if (n >= FLOW_FROM) startFlow();
      else stopFlow();
      if (n === LAST) countUp();
    };

    const mqMobile = window.matchMedia('(max-width: 900px)');
    let stepIO;
    const observeSteps = () => {
      if (stepIO) stepIO.disconnect();
      stepIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setStep(Number(entry.target.dataset.step));
          });
        },
        { rootMargin: mqMobile.matches ? '-58% 0px -36% 0px' : '-46% 0px -46% 0px' }
      );
      steps.forEach((s) => stepIO.observe(s));
    };
    observeSteps();
    onChange(mqMobile, observeSteps);

    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView && current === 0) setStep(1);
      if (inView && current >= FLOW_FROM) startFlow();
      else if (!inView) stopFlow();
    }).observe(stage);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopFlow();
      else if (current >= FLOW_FROM) startFlow();
    });
  };
  initHow();

  /* ------------------------------------------------------------------------
     9. Contact form. Posts to Formspree once a real form ID is set in the
        form's action; until then it opens the visitor's email app instead.
     ------------------------------------------------------------------------ */
  const form = $('[data-form]');
  if (form) {
    const status = $('[data-form-status]', form);
    const button = $('button[type="submit"]', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const action = form.getAttribute('action') || '';
      if (action.includes('YOUR_FORM_ID')) {
        const body = [
          `Name: ${data.get('name')}`,
          `Company: ${data.get('company')}`,
          `Email: ${data.get('email')}`,
          `Phone: ${data.get('phone') || '-'}`,
          '',
          "I'd like to book a call about partnerships.",
        ].join('\n');
        const subject = `Book a call: ${data.get('company') || 'Website enquiry'}`;
        window.location.href = `mailto:hello@metricgrowth.io?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        status.textContent = 'Opening your email app with your details filled in…';
        return;
      }
      button.disabled = true;
      status.textContent = 'Sending…';
      try {
        const res = await fetch(action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        status.textContent = 'Thank you. We’ll be in touch shortly to find a time.';
      } catch (err) {
        status.textContent = 'Something went wrong. Please email hello@metricgrowth.io instead.';
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------------------
     10. Footer year
     ------------------------------------------------------------------------ */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();

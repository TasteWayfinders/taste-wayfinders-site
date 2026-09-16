// ---------- Header scroll state ----------
const header = document.getElementById('siteHeader');
if (header) {
  const onScroll = () => {
    if (window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  document.addEventListener('scroll', onScroll);
  onScroll();
}

// ---------- Mobile menu ----------
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuClose = document.getElementById('mobileMenuClose');
if (burger && mobileMenu) {
  function closeMenu() {
    burger.classList.remove('open');
    mobileMenu.classList.remove('open');
  }
  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });
  if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMenu);
  mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

  // Swipe up to close (menu slides down from the top, so swiping up dismisses it)
  let touchStartY = 0;
  mobileMenu.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  mobileMenu.addEventListener('touchend', (e) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    if (deltaY < -60) closeMenu(); // swiped up at least 60px
  }, { passive: true });
}

// ---------- Scroll reveal ----------
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(el => io.observe(el));
    // Safety net: force-reveal everything after 2.5s in case of any edge case
    setTimeout(() => revealEls.forEach(el => el.classList.add('in')), 2500);
  } else {
    // Fallback for browsers without IntersectionObserver: just show content
    revealEls.forEach(el => el.classList.add('in'));
  }
}

// ---------- Reusable Netlify Forms AJAX submit ----------
// Usage: wireUpForm('contactForm', { successMessage: '...', onSuccess: (formData) => {} })
function wireUpForm(formId, opts) {
  opts = opts || {};
  const form = document.getElementById(formId);
  if (!form) return;
  const status = form.querySelector('.form-status');
  const submitBtn = form.querySelector('button[type="submit"]');

  function encodeFormData(data) {
    return Object.keys(data)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
      .join('&');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.checkValidity && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const formData = Object.fromEntries(new FormData(form).entries());
    if (submitBtn) submitBtn.disabled = true;
    if (status) status.textContent = 'Sending…';

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeFormData(formData)
    })
      .then((res) => {
        if (!res.ok) throw new Error('Form not registered by Netlify yet');
        if (status) status.textContent = opts.successMessage || "Thanks — we've received this. We'll be in touch soon.";
        form.reset();
        // Pass the submitted data along, in case the caller needs it after reset()
        // (e.g. to also save it somewhere else, like Airtable).
        if (opts.onSuccess) opts.onSuccess(formData);
      })
      .catch(() => {
        if (status) status.textContent = 'Something went wrong. Please email us directly at info@tastetravels.net.';
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

// ---------- Prefill "Apply Now" service field from URL, e.g. apply.html?service=UK+Tourist+Visa ----------
function prefillServiceFromQuery(selectId) {
  const params = new URLSearchParams(window.location.search);
  const service = params.get('service');
  const select = document.getElementById(selectId);
  const heading = document.getElementById('applyHeading');
  if (service) {
    if (heading) heading.textContent = 'Apply — ' + service;
    if (select) {
      let found = false;
      for (const opt of select.options) {
        if (opt.value === service) { opt.selected = true; found = true; break; }
      }
      if (!found) {
        const opt = document.createElement('option');
        opt.value = service;
        opt.textContent = service;
        opt.selected = true;
        select.insertBefore(opt, select.firstChild);
      }
    }
  }
}

// ---------- Motivational slideshow ----------
function initSlideshow() {
  const wrap = document.querySelector('.motiv-slideshow');
  if (!wrap) return;
  const slides = wrap.querySelectorAll('.motiv-slide');
  const dotsWrap = wrap.querySelector('.motiv-dots');
  let current = 0;
  let timer;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    if (i === 0) dot.classList.add('active');
    dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
  });
  const dots = dotsWrap.querySelectorAll('button');

  function goTo(i) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = (i + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }
  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }
  function startTimer() { timer = setInterval(next, 5500); }
  function stopTimer() { clearInterval(timer); }

  const nextBtn = wrap.querySelector('.motiv-arrow.next');
  const prevBtn = wrap.querySelector('.motiv-arrow.prev');
  if (nextBtn) nextBtn.addEventListener('click', () => { next(); stopTimer(); startTimer(); });
  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); stopTimer(); startTimer(); });

  wrap.addEventListener('mouseenter', stopTimer);
  wrap.addEventListener('mouseleave', startTimer);

  startTimer();
}
document.addEventListener('DOMContentLoaded', initSlideshow);

// ---------- Site-wide nav login state ----------
// This is the ONLY place netlifyIdentity.init() should be called — pages can
// hook into login/logout via window.onIdentityLogin / window.onIdentityLogout.
function initNavAuthState() {
  // Netlify's "Pretty URLs" strips ".html" from links at deploy time, so a link
  // written as href="account.html" in the source can render live as href="/account".
  // Matching on the raw href string breaks the moment that happens — so instead we
  // resolve each link to its real path and compare against both possible forms.
  function isAccountLink(a) {
    try {
      const path = new URL(a.getAttribute('href'), window.location.origin).pathname;
      return path === '/account' || path === '/account.html';
    } catch (e) {
      return false;
    }
  }
  const loginLinks = Array.from(document.querySelectorAll('.nav-cta a, .mobile-menu a')).filter(isAccountLink);

  function labelFor(user) {
    return (user.user_metadata && user.user_metadata.full_name) ? user.user_metadata.full_name.split(' ')[0] : user.email;
  }
  function applyLoggedIn(user) {
    loginLinks.forEach(a => { a.textContent = labelFor(user); });
    if (typeof window.onIdentityLogin === 'function') window.onIdentityLogin(user);
  }
  function applyLoggedOut() {
    loginLinks.forEach(a => { a.textContent = 'Log in'; });
    if (typeof window.onIdentityLogout === 'function') window.onIdentityLogout();
  }

  if (typeof netlifyIdentity === 'undefined') {
    if (typeof window.onIdentityUnavailable === 'function') window.onIdentityUnavailable();
    return;
  }

  // Instant check so the nav doesn't flash "Log in" while the network round-trip
  // to confirm the session is still in flight.
  let sourcedFromCache = false;
  try {
    const cached = JSON.parse(localStorage.getItem('gotrue.user'));
    if (cached && cached.email) { applyLoggedIn(cached); sourcedFromCache = true; }
  } catch (e) { /* no cached session, that's fine */ }

  netlifyIdentity.on('init', user => {
    if (user) applyLoggedIn(user);
    else if (!sourcedFromCache) applyLoggedOut();
    // If we already showed a cached session, don't let an inconclusive server
    // check silently revert it — an explicit 'logout' event will still update the nav.
  });
  netlifyIdentity.on('login', user => { applyLoggedIn(user); netlifyIdentity.close(); });
  netlifyIdentity.on('logout', () => applyLoggedOut());
  netlifyIdentity.init();
}
document.addEventListener('DOMContentLoaded', initNavAuthState);

// ---------- Chat assistant widget ----------
// Guided-topics assistant: tap a question for a pre-written answer, or type
// your own and we match it against the same topics by keyword. No AI model
// behind this — it's intentionally simple and honest about what it can do,
// with "Talk to a real person" always one tap away on WhatsApp.
(function () {
  const TOPICS = [
    {
      keywords: ['start', 'apply', 'begin', 'application'],
      q: 'How do I start my application?',
      a: "Head to our Apply page and tell us your destination and the service you need — we'll follow up with next steps within one business day.",
      cta: { label: 'Go to Apply page', href: 'apply.html' }
    },
    {
      keywords: ['document', 'documents', 'paperwork', 'passport'],
      q: 'What documents do I need?',
      a: "It depends on your visa type, but most applications need a valid passport, proof of funds, and supporting documents like an invitation or admission letter. We'll send you the exact checklist once we know your destination."
    },
    {
      keywords: ['time', 'long', 'how long', 'processing', 'wait'],
      q: 'How long does the process take?',
      a: 'Processing times vary by country and service — anywhere from a few days to a few weeks. Well give you a realistic timeline during your consultation.'
    },
    {
      keywords: ['country', 'countries', 'uk', 'canada', 'schengen', 'cover'],
      q: 'Which countries do you cover?',
      a: 'We regularly help with the UK, Canada, Schengen countries, and relocation-by-investment programmes — plus general travel planning almost anywhere.'
    },
    {
      keywords: ['not sure', 'decided', "don't know", 'unsure', 'options'],
      q: "What if I haven't decided yet?",
      a: "That's completely fine — tell us your situation on our Apply page and we'll help you figure out the right path.",
      cta: { label: 'Tell us your situation', href: 'apply.html' }
    },
    {
      keywords: ['price', 'cost', 'fee', 'fees', 'much', 'pay'],
      q: 'How much does it cost?',
      a: "Costs depend on the service and destination, so we don't quote a flat number here — tell us your situation and we'll give you clear pricing before you commit to anything."
    }
  ];

  const WHATSAPP_URL = 'https://wa.me/2349152395723';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function buildWidget() {
    const bubble = document.createElement('button');
    bubble.className = 'twf-chat-bubble';
    bubble.setAttribute('aria-label', 'Open chat assistant');
    bubble.innerHTML =
      '<svg class="twf-chat-open-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' +
      '<svg class="twf-chat-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    const panel = document.createElement('div');
    panel.className = 'twf-chat-panel';
    panel.innerHTML =
      '<div class="twf-chat-head">' +
        '<strong>Taste Wayfinders Assistant</strong>' +
        '<span>Automated \u00b7 usually replies instantly</span>' +
      '</div>' +
      '<div class="twf-chat-body" id="twfChatBody">' +
        '<div class="twf-chat-msg">Hi! I\'m the Taste Wayfinders assistant. Ask me a question, or tap a topic below.</div>' +
        '<div class="twf-chat-topics" id="twfChatTopics"></div>' +
      '</div>' +
      '<a href="' + WHATSAPP_URL + '" target="_blank" rel="noopener" class="twf-chat-human">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
        'Talk to a real person' +
      '</a>' +
      '<div class="twf-chat-input-row">' +
        '<input type="text" id="twfChatInput" placeholder="Ask a question…" autocomplete="off">' +
        '<button id="twfChatSend" aria-label="Send">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        '</button>' +
      '</div>';

    document.body.appendChild(panel);
    document.body.appendChild(bubble);

    const topicsWrap = panel.querySelector('#twfChatTopics');
    TOPICS.forEach(function (t) {
      const btn = document.createElement('button');
      btn.textContent = t.q;
      btn.addEventListener('click', function () { askTopic(t); });
      topicsWrap.appendChild(btn);
    });

    bubble.addEventListener('click', function () {
      const isOpen = panel.classList.toggle('open');
      bubble.classList.toggle('open', isOpen);
      bubble.setAttribute('aria-label', isOpen ? 'Close chat assistant' : 'Open chat assistant');
    });

    const body = panel.querySelector('#twfChatBody');
    const input = panel.querySelector('#twfChatInput');
    const sendBtn = panel.querySelector('#twfChatSend');

    function addMessage(text, isUser, cta) {
      const msg = document.createElement('div');
      msg.className = 'twf-chat-msg' + (isUser ? ' twf-user' : '');
      msg.innerHTML = escapeHtml(text);
      if (cta) {
        const link = document.createElement('a');
        link.href = cta.href;
        link.textContent = cta.label + ' \u2192';
        link.style.cssText = 'display:inline-block;margin-top:8px;font-weight:700;color:var(--violet);text-decoration:none;';
        msg.appendChild(document.createElement('br'));
        msg.appendChild(link);
      }
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function askTopic(t) {
      addMessage(t.q, true);
      setTimeout(function () { addMessage(t.a, false, t.cta); }, 300);
    }

    function handleFreeText() {
      const value = input.value.trim();
      if (!value) return;
      addMessage(value, true);
      input.value = '';
      const lower = value.toLowerCase();
      const match = TOPICS.find(function (t) {
        return t.keywords.some(function (k) { return lower.indexOf(k) !== -1; });
      });
      setTimeout(function () {
        if (match) {
          addMessage(match.a, false, match.cta);
        } else {
          addMessage(
            "I'm not totally sure on that one — tap \u201cTalk to a real person\u201d above and our team will help directly.",
            false
          );
        }
      }, 300);
    }

    sendBtn.addEventListener('click', handleFreeText);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleFreeText();
    });
  }

  document.addEventListener('DOMContentLoaded', buildWidget);
})();

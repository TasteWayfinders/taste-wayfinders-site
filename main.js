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

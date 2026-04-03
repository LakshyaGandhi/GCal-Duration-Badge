(function () {
  if (window.__gcal_duration_ext_active) return;
  window.__gcal_duration_ext_active = true;

  function parseDuration(text) {
    const match = text.match(/(\d+(?::\d+)?)(am|pm)?\s+to\s+(\d+(?::\d+)?)(am|pm)/i);
    if (!match) return null;

    let [, startRaw, startMer, endRaw, endMer] = match;

    endMer = endMer.toLowerCase();
    startMer = (startMer || endMer).toLowerCase();

    const toMins = (raw, mer) => {
      const [h, m = 0] = raw.split(':').map(Number);
      let hrs = h % 12;
      if (mer === 'pm') hrs += 12;
      return hrs * 60 + Number(m);
    };

    let start = toMins(startRaw, startMer);
    let end = toMins(endRaw, endMer);

    if (start >= end) {
      startMer = startMer === 'am' ? 'pm' : 'am';
      start = toMins(startRaw, startMer);
    }

    const diff = end - start;
    if (diff <= 0) return null;

    const h = Math.floor(diff / 60);
    const m = diff % 60;

    return {
      label: m === 0 ? `${h}h` : `${h}h ${m}m`,
      minutes: diff
    };
  }

  function isInPopup(el) {
    return el.closest('[role="dialog"]');
  }

  function inject(chip) {
    if (!chip) return;
    if (isInPopup(chip)) return;

    if (chip.querySelector('.__duration_badge')) return;

    const textEl = chip.querySelector('.XuJrye');
    if (!textEl) return;

    const text = textEl.innerText || '';

    // 🔥 NEW: skip all-day
    if (/all day/i.test(text)) return;

    if (!/to/i.test(text)) return;

    const result = parseDuration(text);
    if (!result) return;

    // 🔥 skip short events
    if (result.minutes < 45) return;

    // 🔥 NEW: skip tiny UI blocks
    if (chip.offsetHeight < 20) return;

    const duration = result.label;

    const container =
      textEl.closest('.NlL62b') ||
      textEl.closest('.ifwtOb') ||
      textEl.parentElement;

    if (!container) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    if (chip.offsetHeight === 0) return;

    const badge = document.createElement('div');
    badge.className = '__duration_badge';
    badge.textContent = duration;

    badge.style.cssText = `
      position: absolute;
      bottom: 4px;
      right: 4px;
      background: rgba(255,255,255,0.9);
      color: #333;
      font-size: 10px;
      font-weight: 500;
      padding: 2px 6px;
      border-radius: 6px;
      pointer-events: none;
      z-index: 2;
      white-space: nowrap;
    `;

    container.appendChild(badge);
  }

  let rafId = null;

  function handleMutations() {
    if (rafId) return;

    rafId = requestAnimationFrame(() => {
      rafId = null;
      document.querySelectorAll('[data-eventchip]').forEach(inject);
    });
  }

  const observer = new MutationObserver(handleMutations);

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  handleMutations();

  console.log("🚀 FINAL stable optimized version running");
})();

(function () {
  if (window.__gcal_duration_ext_active) return;
  window.__gcal_duration_ext_active = true;

  const activeBadges = new Set();

  // ------------------------
  // 📅 Extract DATE from text
  // ------------------------
  function extractDate(text) {
    const match = text.match(/([A-Za-z]+ \d{1,2}, \d{4})/);
    if (!match) return null;
    return new Date(match[1]);
  }

  // ------------------------
  // ⏱ Parse Duration + REAL date
  // ------------------------
  function parseDuration(text) {
    const timeMatch = text.match(/(\d+(?::\d+)?)(am|pm)?\s+to\s+(\d+(?::\d+)?)(am|pm)/i);
    if (!timeMatch) return null;

    let [, startRaw, startMer, endRaw, endMer] = timeMatch;

    endMer = endMer.toLowerCase();
    startMer = (startMer || endMer).toLowerCase();

    const baseDate = extractDate(text);
    if (!baseDate) return null;

    const toDateTime = (raw, mer) => {
      const [h, m = 0] = raw.split(':').map(Number);
      let hrs = h % 12;
      if (mer === 'pm') hrs += 12;

      const d = new Date(baseDate);
      d.setHours(hrs, m, 0, 0);
      return d;
    };

    let startDate = toDateTime(startRaw, startMer);
    let endDate = toDateTime(endRaw, endMer);

    // Handle AM/PM flip
    if (startDate >= endDate) {
      startMer = startMer === 'am' ? 'pm' : 'am';
      startDate = toDateTime(startRaw, startMer);
    }

    const diff = (endDate - startDate) / 60000;
    if (diff <= 0) return null;

    const h = Math.floor(diff / 60);
    const m = diff % 60;

    return {
      label: m === 0 ? `${h}h` : `${h}h ${m}m`,
      minutes: diff,
      startDate,
      endDate
    };
  }

  function isInPopup(el) {
    return el.closest('[role="dialog"]');
  }

  // ------------------------
  function inject(chip) {
    if (!chip) return;
    if (isInPopup(chip)) return;

    if (chip.querySelector('.__duration_badge')) return;

    const textEl = chip.querySelector('.XuJrye');
    if (!textEl) return;

    const text = textEl.innerText || '';

    if (/all day/i.test(text)) return;
    if (!/to/i.test(text)) return;

    const result = parseDuration(text);
    if (!result) return;

    if (result.minutes < 45) return;
    if (chip.offsetHeight < 20) return;

    const container =
      textEl.closest('.NlL62b') ||
      textEl.closest('.ifwtOb') ||
      textEl.parentElement;

    if (!container) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const badge = document.createElement('div');
    badge.className = '__duration_badge';

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

    badge.__eventData = result;
    activeBadges.add(badge);

    updateBadge(badge);
  }

  // ------------------------
  function updateBadge(badge) {
    const data = badge.__eventData;
    if (!data) return;

    const now = new Date();
    const { startDate, endDate, label } = data;

    // Only show countdown if NOW is inside event
    if (now >= startDate && now <= endDate) {
      const mins = Math.floor((endDate - now) / 60000);

      const h = Math.floor(mins / 60);
      const m = mins % 60;

      const text = m === 0 ? `${h}h left` : `${h}h ${m}m left`;
      badge.textContent = `⌛ ${text}`;
    } else {
      badge.textContent = label;
    }
  }

  // ------------------------
  setInterval(() => {
    activeBadges.forEach((badge) => {
      if (!document.body.contains(badge)) {
        activeBadges.delete(badge);
        return;
      }
      updateBadge(badge);
    });
  }, 60000);

  // ------------------------
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

  console.log("🚀 FINAL FIXED VERSION (real date-aware countdown)");
})();

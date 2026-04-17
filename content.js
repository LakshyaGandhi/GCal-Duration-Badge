(function () {
  if (window.__gcal_duration_ext_active) return;
  window.__gcal_duration_ext_active = true;

  const activeBadges = new Set();

  // 1. INJECT CSS GLOBALLY (Pure White Background, Pure Black Text)
  const style = document.createElement('style');
  style.textContent = `
    .__duration_badge {
      position: absolute;
      bottom: 4px;
      right: 4px;
      background: #ffffff;
      color: #000000;
      font-size: 10px;
      font-weight: 500;
      padding: 2px 6px;
      border-radius: 6px;
      pointer-events: none;
      z-index: 2;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(0,0,0,0.15);
    }
  `;
  document.head.appendChild(style);

  // 2. PARSE DURATION (Supports 24h format, i18n separators, and overnight math)
  function parseDuration(text, chip) {
    // Regex handles English "to", en-dashes "–", hyphens "-", and 24h formats
    const timeMatch = text.match(/(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:to|–|-|a|~)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i);
    if (!timeMatch) return null;

    let [, startRaw, startMer, endRaw, endMer] = timeMatch;

    // If end meridian exists but start is missing (e.g. "10 - 11am"), inherit it.
    if (endMer && !startMer) startMer = endMer;

    const toMinutes = (raw, mer) => {
      let [h, m = 0] = raw.split(':').map(Number);
      if (mer) {
        mer = mer.toLowerCase();
        if (mer === 'pm' && h < 12) h += 12;
        if (mer === 'am' && h === 12) h = 0;
      }
      return h * 60 + m;
    };

    let startMins = toMinutes(startRaw, startMer);
    let endMins = toMinutes(endRaw, endMer);

    // Correct overnight math
    if (endMins <= startMins) endMins += 24 * 60;

    const diff = endMins - startMins;
    if (diff <= 0) return null;

    const h = Math.floor(diff / 60);
    const m = diff % 60;
    const label = m === 0 ? `${h}h` : `${h}h ${m}m`;

    // 3. SECURE DATE EXTRACTION (DOM Traversal > Natural Language)
    let baseDate = null;
    let current = chip;

    // Strategy A: Traverse up GCal's grid to find the column's data-date (Day/Week view)
    while (current && current !== document.body) {
      if (current.dataset && current.dataset.date) {
        const dStr = current.dataset.date; // format: YYYYMMDD
        if (dStr.length === 8) {
          baseDate = new Date(
            parseInt(dStr.substring(0, 4), 10),
            parseInt(dStr.substring(4, 6), 10) - 1,
            parseInt(dStr.substring(6, 8), 10)
          );
          break;
        }
      }
      current = current.parentElement;
    }

    // Strategy B: Fallback to reading text (Schedule/Agenda view)
    if (!baseDate) {
      const dateMatch = text.match(/([A-Za-z]+ \d{1,2}, \d{4})/);
      if (dateMatch) baseDate = new Date(dateMatch[1]);
    }

    let startDate = null;
    let endDate = null;

    // Map extracted date back to exact millisecond timestamps
    if (baseDate) {
      startDate = new Date(baseDate);
      startDate.setHours(Math.floor(startMins / 60), startMins % 60, 0, 0);

      endDate = new Date(baseDate);
      endDate.setHours(Math.floor(endMins / 60), endMins % 60, 0, 0);
    }

    return { label, minutes: diff, startDate, endDate };
  }

  // 4. INJECT ENGINE (Prevents Ghost Badges)
  function inject(chip) {
    if (!chip || chip.closest('[role="dialog"]')) return;

    const textEl = chip.querySelector('.XuJrye') || chip;
    const text = textEl.innerText || '';

    if (/all day|todo/i.test(text)) return;

    const result = parseDuration(text, chip);
    // Ignore < 45m events, or events too thin to fit a badge gracefully
    if (!result || result.minutes < 45 || chip.offsetHeight < 20) return;

    const existingBadge = chip.querySelector('.__duration_badge');

    if (existingBadge) {
      // Prevent DOM thrashing. Update data only if the event was resized.
      if (existingBadge.__eventData && existingBadge.__eventData.minutes !== result.minutes) {
        existingBadge.__eventData = result;
        updateBadge(existingBadge);
      }
      return;
    }

    let container = chip.querySelector('.NlL62b') || chip.querySelector('.ifwtOb') || textEl.parentElement;
    if (!container) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const badge = document.createElement('div');
    badge.className = '__duration_badge';
    
    container.appendChild(badge);
    badge.__eventData = result;
    activeBadges.add(badge);

    updateBadge(badge);
  }

  // 5. RENDER ENGINE (Handles Live State)
  function updateBadge(badge) {
    const data = badge.__eventData;
    if (!data) return;

    const { startDate, endDate, label } = data;
    let badgeText = label;

    if (startDate && endDate) {
      const now = new Date();

      if (now >= startDate && now <= endDate) {
        // Event is ACTIVE
        const mins = Math.floor((endDate - now) / 60000);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        badgeText = `⌛ ${m === 0 ? `${h}h` : `${h}h ${m}m`} left`;

      } else if (now < startDate) {
        // Event is UPCOMING (Nudge feature)
        const minsToStart = Math.floor((startDate - now) / 60000);
        if (minsToStart > 0 && minsToStart <= 15) {
          badgeText = `🚀 in ${minsToStart}m`;
        }
      }
    }

    badge.textContent = badgeText;
  }

  // 6. PERFECT SYNC INTERVAL (No Clock Drift)
  function startSmartInterval() {
    function tick() {
      activeBadges.forEach((badge) => {
        // Self-cleaning garbage collection for deleted/removed chips
        if (!document.body.contains(badge)) {
          activeBadges.delete(badge);
          return;
        }
        updateBadge(badge);
      });
      scheduleNextTick();
    }

    function scheduleNextTick() {
      const now = new Date();
      // Calculate exactly how many ms until the system clock hits xx:00
      const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      setTimeout(tick, msUntilNextMinute);
    }
    scheduleNextTick();
  }
  startSmartInterval();

  // 7. SURGICAL DOM OBSERVER (No more `querySelectorAll` sledgehammers)
  function processMutations(mutations) {
    const chipsToProcess = new Set();

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node IS a chip
            if (node.matches && node.matches('[data-eventchip]')) {
              chipsToProcess.add(node);
            }
            // Check if the added node CONTAINS chips (e.g. changing week view)
            if (node.querySelectorAll) {
              node.querySelectorAll('[data-eventchip]').forEach(c => chipsToProcess.add(c));
            }
          }
        });
      } else if (mutation.type === 'characterData' || mutation.type === 'attributes') {
        // Check if an existing chip's text/size was modified
        const target = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
        if (target && target.closest) {
          const chip = target.closest('[data-eventchip]');
          if (chip) chipsToProcess.add(chip);
        }
      }
    }

    // Only inject on the specific nodes that changed
    chipsToProcess.forEach(inject);
  }

  const observer = new MutationObserver(processMutations);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributeFilter: ['style', 'class'] });

  // Initial trigger
  document.querySelectorAll('[data-eventchip]').forEach(inject);

  console.log("🚀 GCal Duration Engine v2.0: Surgical, Synchronized & Minimalist");
})();

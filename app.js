// Pulse — renders data/changelog.json. Vanilla JS, no dependencies.

(function () {
  'use strict';

  const DATA_URL = 'data/changelog.json';
  const UPTIME_DAYS = 30;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- helpers ----------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'text') node.textContent = value;
        else if (key === 'class') node.className = value;
        else node.setAttribute(key, value);
      }
    }
    (children || []).forEach((child) => child && node.appendChild(child));
    return node;
  }

  function formatDate(iso, opts) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, opts || { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(startIso, endIso) {
    const minutes = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function isoDay(date) {
    return date.toISOString().slice(0, 10);
  }

  // ---------- animated counters ----------
  function countUp(node, target, decimals) {
    if (reduceMotion) { node.textContent = target.toFixed(decimals); return; }
    const duration = 1400;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = (target * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function formatTimeWindow(startIso, endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const startValid = !Number.isNaN(start.getTime());
    const endValid = !Number.isNaN(end.getTime());
    const dateOpts = { year: 'numeric', month: 'short', day: 'numeric' };
    const timeOpts = { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
    if (!startValid && !endValid) return '';
    if (!startValid) return `until ${end.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
    if (!endValid) return `from ${start.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
    const sameDay = start.toDateString() === end.toDateString();
    const startStr = start.toLocaleString(undefined, { ...dateOpts, ...timeOpts });
    const endStr = sameDay
      ? end.toLocaleString(undefined, timeOpts)
      : end.toLocaleString(undefined, { ...dateOpts, ...timeOpts });
    return `${startStr} – ${endStr}`;
  }

  // ---------- renderers ----------
  function renderMaintenance(maintenance) {
    const banner = document.getElementById('maintenance-banner');
    if (!banner) return;
    banner.hidden = true;
    banner.innerHTML = '';

    if (!maintenance || !maintenance.ends_at) return;
    const ends = new Date(maintenance.ends_at);
    if (Number.isNaN(ends.getTime()) || ends.getTime() <= Date.now()) return;

    const children = [];
    if (maintenance.title) {
      children.push(el('p', { class: 'maintenance-title', text: maintenance.title }));
    }
    const timeWindow = formatTimeWindow(maintenance.starts_at, maintenance.ends_at);
    if (timeWindow) {
      children.push(el('p', { class: 'maintenance-window', text: timeWindow }));
    }
    if (maintenance.message) {
      children.push(el('p', { class: 'maintenance-message', text: maintenance.message }));
    }

    banner.appendChild(el('div', { class: 'container maintenance-inner', role: 'status' }, children));
    banner.hidden = false;
  }

  function renderHero(data) {
    const labels = { operational: 'All systems operational', degraded: 'Degraded performance', outage: 'Major outage' };
    const level = (data.status && data.status.level) || 'operational';
    const badge = document.getElementById('hero-badge');
    badge.dataset.level = level;
    document.getElementById('hero-badge-text').textContent = labels[level] || level;

    document.getElementById('hero-tagline').textContent =
      (data.status && data.status.message) || (data.product && data.product.tagline) || '';
    const updated = data.product && data.product.updated_at;
    document.getElementById('hero-updated').textContent = updated ? `updated ${formatDateTime(updated)}` : '';

    // Compute last incident and days without incidents
    const incidents = data.incidents || [];
    const incidentsElement = document.getElementById('hero-incidents');
    if (incidents.length === 0) {
      incidentsElement.textContent = 'No incidents on record';
    } else {
      const sortedIncidents = incidents
        .slice()
        .filter((inc) => inc.resolved_at)
        .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));

      if (sortedIncidents.length === 0) {
        incidentsElement.textContent = 'No incidents on record';
      } else {
        const lastIncident = sortedIncidents[0];
        const resolvedDate = new Date(lastIncident.resolved_at);
        const today = new Date();
        const daysSince = Math.floor((today - resolvedDate) / (1000 * 60 * 60 * 24));
        const formattedDate = formatDate(lastIncident.resolved_at);
        incidentsElement.textContent = `Last incident: ${formattedDate} · ${daysSince} days without incidents`;
      }
    }

    const uptime = Number(data.product && data.product.uptime_90d);
    countUp(document.getElementById('stat-uptime'), Number.isFinite(uptime) ? uptime : 100, 2);
    countUp(document.getElementById('stat-releases'), (data.releases || []).length, 0);
    countUp(document.getElementById('stat-incidents'), (data.incidents || []).length, 0);
  }

  function dayLevels(component, incidents) {
    // Map each of the last UPTIME_DAYS days to a level, from the component's
    // incident_days plus any incident that lists it as affected.
    const levels = new Map();
    (component.incident_days || []).forEach((d) => levels.set(d, 'degraded'));
    (incidents || []).forEach((incident) => {
      if (!(incident.affected || []).includes(component.id)) return;
      const day = isoDay(new Date(incident.started_at));
      const current = levels.get(day);
      const next = incident.impact === 'outage' ? 'outage' : 'degraded';
      if (current !== 'outage') levels.set(day, next);
    });
    return levels;
  }

  function renderComponents(components, incidents) {
    const list = document.getElementById('component-list');
    list.innerHTML = '';
    if (!components || components.length === 0) {
      list.appendChild(el('li', { class: 'empty', text: 'No components defined.' }));
      return;
    }

    const today = new Date();
    components.forEach((component, index) => {
      const levels = dayLevels(component, incidents);
      const grid = el('div', { class: 'uptime-grid', role: 'img', 'aria-label': `${component.name} uptime, last ${UPTIME_DAYS} days` });
      let badDays = 0;
      for (let i = UPTIME_DAYS - 1; i >= 0; i -= 1) {
        const date = new Date(today);
        date.setUTCDate(today.getUTCDate() - i);
        const day = isoDay(date);
        const level = levels.get(day) || 'operational';
        if (level !== 'operational') badDays += 1;
        const labels = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage' };
        grid.appendChild(el('span', { class: 'day', 'data-level': level, 'data-label': `${formatDate(day, { month: 'short', day: 'numeric' })} · ${labels[level]}`, tabindex: '0', role: 'button', 'aria-label': `${formatDate(day, { month: 'short', day: 'numeric' })} · ${labels[level]}` }));
      }
      const pct = (((UPTIME_DAYS - badDays) / UPTIME_DAYS) * 100).toFixed(2);

      const item = el('li', { class: 'component reveal', style: `transition-delay:${index * 60}ms` }, [
        el('div', { class: 'component-name' }, [
          el('span', { class: 'level-dot', 'data-level': component.level || 'operational' }),
          el('span', { text: component.name }),
        ]),
        grid,
        el('div', { class: 'component-uptime', text: `${pct}%` }),
      ]);
      list.appendChild(item);
    });
  }

  function renderReleases(releases) {
    const list = document.getElementById('release-list');
    list.innerHTML = '';
    if (!releases || releases.length === 0) {
      list.appendChild(el('li', { class: 'empty', text: 'No releases yet.' }));
      return;
    }

    releases
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach((release, index) => {
        const id = `v${slug(release.version)}`;
        const highlights = (release.highlights || []).map((h) => el('li', { text: h }));
        const card = el('article', { class: 'release-card' }, [
          el('div', { class: 'release-head' }, [
            el('span', { class: 'release-version', text: `v${release.version}` }),
            el('h3', { class: 'release-title', text: release.title }),
            release.tag ? el('span', { class: 'tag', 'data-tag': slug(release.tag), text: release.tag }) : null,
            el('time', { class: 'release-date', datetime: release.date, text: formatDate(release.date) }),
          ]),
          el('p', { class: 'release-body', text: release.description || '' }),
          highlights.length ? el('ul', { class: 'highlights' }, highlights) : null,
        ]);
        list.appendChild(el('li', { class: 'release reveal', id, style: `transition-delay:${Math.min(index, 6) * 70}ms` }, [card]));
      });
  }

  function renderIncidents(incidents, components) {
    const list = document.getElementById('incident-list');
    list.innerHTML = '';
    if (!incidents || incidents.length === 0) {
      list.appendChild(el('li', { class: 'empty', text: 'No incidents recorded.' }));
      return;
    }
    const names = new Map((components || []).map((c) => [c.id, c.name]));

    incidents
      .slice()
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .forEach((incident, index) => {
        const duration = incident.resolved_at ? formatDuration(incident.started_at, incident.resolved_at) : 'ongoing';
        const affected = (incident.affected || []).map((id) => el('span', { text: names.get(id) || id }));
        list.appendChild(
          el('li', { class: 'incident reveal', 'data-impact': incident.impact || 'degraded', style: `transition-delay:${index * 70}ms` }, [
            el('div', { class: 'incident-when' }, [
              el('time', { datetime: incident.started_at, text: formatDateTime(incident.started_at) }),
              el('div', null, [el('span', { class: 'incident-duration', text: duration })]),
            ]),
            el('div', null, [
              el('p', { class: 'incident-title', text: incident.title }),
              el('p', { class: 'incident-summary', text: incident.summary || '' }),
              affected.length ? el('div', { class: 'incident-affected' }, affected) : null,
            ]),
          ])
        );
      });
  }

  function renderError(error) {
    document.getElementById('hero-badge-text').textContent = 'Status unavailable';
    const list = document.getElementById('release-list');
    list.innerHTML = '';
    list.appendChild(el('li', { class: 'empty', text: `Could not load changelog: ${error.message}` }));
  }

  // ---------- scroll reveal ----------
  function observeReveals() {
    const nodes = document.querySelectorAll('.reveal:not(.in)');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    nodes.forEach((n) => io.observe(n));
  }

  // ---------- boot ----------
  async function load() {
    observeReveals();
    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderMaintenance(data.maintenance);
      renderHero(data);
      renderComponents(data.components, data.incidents);
      renderReleases(data.releases);
      renderIncidents(data.incidents, data.components);
    } catch (error) {
      renderError(error);
    }
    observeReveals();
  }

  document.addEventListener('DOMContentLoaded', load);
})();

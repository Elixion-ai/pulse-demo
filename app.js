// Pulse — renders data/changelog.json into the page. No dependencies.

(function () {
  'use strict';

  const DATA_URL = 'data/changelog.json';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined) continue;
        if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else node.setAttribute(key, value);
      }
    }
    (children || []).forEach((child) => child && node.appendChild(child));
    return node;
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDuration(startIso, endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const minutes = Math.round((end - start) / 60000);
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function renderStatus(status) {
    const badge = document.getElementById('status-badge');
    const message = document.getElementById('status-message');
    const updated = document.getElementById('status-updated');
    if (!status) return;

    const labels = { operational: 'All systems operational', degraded: 'Degraded performance', outage: 'Major outage' };
    badge.dataset.level = status.level || 'operational';
    badge.textContent = labels[status.level] || status.level || 'Unknown';
    message.textContent = status.message || '';
    updated.textContent = status.updated_at ? `Last updated ${formatDate(status.updated_at)}` : '';
  }

  function renderReleases(releases) {
    const list = document.getElementById('release-list');
    list.innerHTML = '';
    if (!releases || releases.length === 0) {
      list.appendChild(el('li', { class: 'empty', text: 'No releases yet.' }));
      return;
    }

    const sorted = releases.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach((release) => {
      const id = `v${slug(release.version)}`;
      const item = el('li', { class: 'release', id }, [
        el('div', { class: 'release-head' }, [
          el('span', { class: 'release-version', text: release.version }),
          el('h3', { class: 'release-title', text: release.title }),
          release.tag ? el('span', { class: 'tag', 'data-tag': slug(release.tag), text: release.tag }) : null,
          el('time', { class: 'release-date', datetime: release.date, text: formatDate(release.date) }),
        ]),
        el('p', { class: 'release-body', text: release.description || '' }),
      ]);
      list.appendChild(item);
    });
  }

  function renderIncidents(incidents) {
    const list = document.getElementById('incident-list');
    list.innerHTML = '';
    if (!incidents || incidents.length === 0) {
      list.appendChild(el('li', { class: 'empty', text: 'No incidents recorded.' }));
      return;
    }

    const sorted = incidents.slice().sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    sorted.forEach((incident) => {
      const duration = incident.resolved_at ? formatDuration(incident.started_at, incident.resolved_at) : 'ongoing';
      list.appendChild(
        el('li', { class: 'incident' }, [
          el('div', { class: 'incident-when' }, [
            el('time', { datetime: incident.started_at, text: formatDate(incident.started_at) }),
            el('div', { class: 'incident-duration', text: duration }),
          ]),
          el('div', null, [
            el('p', { class: 'incident-title', text: incident.title }),
            el('p', { class: 'incident-summary', text: incident.summary || '' }),
          ]),
        ])
      );
    });
  }

  function renderError(error) {
    const list = document.getElementById('release-list');
    list.innerHTML = '';
    list.appendChild(el('li', { class: 'empty', text: `Could not load changelog: ${error.message}` }));
    document.getElementById('status-badge').textContent = 'Unknown';
  }

  async function load() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderStatus(data.status);
      renderReleases(data.releases);
      renderIncidents(data.incidents);
    } catch (error) {
      renderError(error);
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();

// Fills the page footer with the deployed build's version and time, so a
// glance at the bottom of the page shows which deploy you're looking at.
// version.json is generated at build time (scripts/generate-version.mjs)
// and fetched network-first by the service worker.

const footer = document.getElementById('version-footer');

async function show() {
  try {
    const res = await fetch('/version.json');
    if (!res.ok) throw new Error();
    const { sha, builtAt } = await res.json();
    const when = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(builtAt));
    footer.textContent = `v${sha} · built ${when}`;
  } catch {
    footer.textContent = 'local dev build';
  }
}

if (footer) show();

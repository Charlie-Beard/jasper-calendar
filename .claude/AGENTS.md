# Jasper Calendar - Agent Guidelines

## Critical Mistakes to Avoid

### 1. **Never Make Up Data**
❌ WRONG: Invented random Oma days (July 31, August 11) without asking the user
✅ RIGHT: Always ask the user for specific dates/values before implementing

### 2. **Always Clear User Intent First**
When adding new day types or features, explicitly confirm:
- Which dates apply
- Which emoji to use
- What color scheme
- How it combines with other indicators

### 3. **Understand Emoji Overlap Prevention**
When a tile has 2+ emojis, they MUST NOT overlap:
- **Top-left position**: Primary indicator (Oma 👩, Cleaner 🧹, Trip 🐉, Gran 👵👴)
- **Top-right position**: Secondary indicator (Dad 👨, Special 🎉)
- Example: August 4 = `👩 🧹 4` (Oma left, Cleaner right)
- Example: August 22-23 = `🐉 👨` (Trip left, Dad right)

## Hot Reload & Cache Management

### Service Worker Cache Version
After ANY changes to public files (CSS, JS, HTML), ALWAYS increment the cache version:

```javascript
// public/sw.js
const CACHE = 'jasper-vX';  // Increment X with each change
```

**Why**: The service worker caches all shell files. Without incrementing, browsers serve stale cached versions.

**When to increment**:
- ✅ Changes to public/js/calendar.js
- ✅ Changes to public/css/style.css
- ✅ Changes to public/index.html
- ✅ Any color/styling changes
- ❌ Changes to .dev.vars (different reload mechanism)
- ❌ Changes to src/worker.js (Worker watches this separately)

### Restarting Dev Server
For `.dev.vars` changes (like TEST_TODAY), need to:
1. Kill the current wrangler dev process
2. Restart: `npx wrangler dev --port 8787`
3. The new environment variables will be loaded

For CSS/JS changes, just increment cache version and reload browser.

## Project Architecture

### Key Files

**public/js/calendar.js**
- Main rendering logic
- Day type detection functions (grandparentDay, omaDay, cleanerDay, dadOff, tripFor)
- renderTile() function that combines all day type classes
- Priority system: Gran/Oma > Dad, Cleaner is additive

**public/css/style.css**
- Tile variants: `.tile.gran`, `.tile.oma`, `.tile.dad`, `.tile.cleaner`
- Blend gradients: `.tile.trip.dad`, `.tile.oma.cleaner`
- Badge positioning: `.tile-badge`, `.gran-badge`, `.oma-badge`, `.cleaner-badge`, `.dad-badge`

**public/sw.js**
- Service worker cache versioning
- Always update CACHE when shell files change

**.dev.vars**
- Local development secrets
- `TEST_TODAY=YYYY-MM-DD` to set calendar date
- `ADMIN_PASSWORD`, `AUTH_SECRET`

### Configuration

**Holiday Period**
- Start: 2026-07-23 (Thursday)
- End: 2026-09-01 (Tuesday)
- 41 days total

**Day Type Arrays** (in calendar.js)
```javascript
const TRIPS = [{ from, to, label, emoji }]
const GRANDPARENT_DAYS = ['YYYY-MM-DD', ...]
const OMA_DAYS = ['YYYY-MM-DD', ...]
const DAD_OFF_EXTRA = ['YYYY-MM-DD', ...]  // Weekends + extras
const CLEANER_SKIP = ['YYYY-MM-DD', ...]    // Skip cleaners on these Tuesdays
```

**Tuesday Cleaners**
- Every Tuesday except dates in CLEANER_SKIP
- Orange color (#ffe8d6 → #ffd9bf)
- Emoji: 🧹

**Dad Off**
- Every Saturday & Sunday
- Plus DAD_OFF_EXTRA dates
- Indigo color (#eef0ff → #dde2ff)
- Emoji: 👨

**Grandparent Days**
- Specific dates only (GRANDPARENT_DAYS array)
- Pink color (#fdeef4 → #fad7e6)
- Emoji: 👵👴
- Takes priority over Dad indicator

**Oma Days**
- Specific dates only (OMA_DAYS array)
- Purple color (#d4b8e6 → #bf9fdd)
- Emoji: 👩
- Takes priority over Dad indicator
- Blends with Cleaner on shared days

**Family Trips**
- Date ranges (TRIPS array)
- Green color (#e9faf1 → #d3f2e1)
- Custom emoji per trip (e.g., 🐉 for Wales)

## Workflow Best Practices

### When Adding New Day Types
1. Add data array to calendar.js
2. Add detection function (returns boolean)
3. Add logic to renderTile() - check priority rules
4. Add emoji to badges string
5. Add CSS class and styling
6. Add badge positioning CSS
7. Increment cache version
8. Test in browser

### When Modifying Colors
1. Update CSS gradient colors
2. Increment cache version
3. Test in fresh browser tab

### When Testing Different Dates
1. Edit .dev.vars TEST_TODAY value
2. Kill and restart wrangler dev
3. Open fresh browser tab

## Common Pitfalls

- ❌ Forgetting to increment cache version → old files served
- ❌ Positioning both emojis on same side → they overlap
- ❌ Adding day types without checking priority
- ❌ Making up data instead of asking user
- ❌ Not closing old browser tabs → cached version shown

## Current State (as of v17)

**Active Day Types**
- Cleaners: Every Tuesday except Aug 25 (🧹, orange)
- Oma: Aug 4 only (👩, purple, blends with cleaners on Tuesdays)
- Grandparents: Specific dates (👵👴, pink)
- Dad Off: Weekends + Jul 28, Aug 17 (👨, indigo)
- Wales Trip: Aug 21-28 (🐉, green)

**Emoji Positioning Examples**
- Aug 4: `👩` (left) `🧹` (right) - Oma + Tuesday cleaner
- Aug 22-23: `🐉` (left) `👨` (right) - Trip + Dad
- Aug 25: `🐉` only - Trip day, cleaner skipped

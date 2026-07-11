# UI Enhancements Visual Guide

## Projection Source and Confidence Badges

This guide shows how the new `CompactProjectionBadge` appears throughout the projections page.

---

## Location 1: Owner Playoff Cards (Mobile & Desktop)

### Before:

```
┌─────────────────────────────────────┐
│ QB   Patrick Mahomes          14.5 │
│ RB1  Christian McCaffrey       8.2 │
│ WR1  Tyreek Hill              12.1 │
└─────────────────────────────────────┘
```

### After:

```
┌───────────────────────────────────────────────────┐
│ QB   Patrick Mahomes  [Props (4) ● High]   14.5 │
│ RB1  Christian McCaffrey  [Hist ● Med]      8.2 │
│ WR1  Tyreek Hill  [Blend (2) ● Med]        12.1 │
└───────────────────────────────────────────────────┘
```

**Badge Elements:**

- **Source Label**: "Props" (blue), "Hist" (green), "Blend" (purple)
- **Prop Count**: (4) - number of betting props used
- **Confidence Dot**: Colored indicator (● green=high, ● yellow=med, ● red=low)
- **Confidence Level**: "High", "Med", "Low"

**Tooltip on Hover:**
Shows detailed factors like "5 prop lines, 3 playoff games, fresh data"

---

## Location 2: Owner Playoff Details Table

### Before:

```
┌──────────────────────────────────────────────────────┐
│ Player              │ Actual │ Avg/G │ WC │ DIV │...│
├─────────────────────┼────────┼───────┼────┼─────┼───┤
│ QB Patrick Mahomes  │  42.1  │  21.0 │ 10 │ 8.4 │...│
│ RB1 C. McCaffrey    │  18.3  │   9.1 │  5 │ 3.6 │...│
└──────────────────────────────────────────────────────┘
```

### After:

```
┌────────────────────────────────────────────────────────────────┐
│ Player                        │ Actual │ Avg/G │ WC │ DIV │...│
├───────────────────────────────┼────────┼───────┼────┼─────┼───┤
│ QB Patrick Mahomes            │  42.1  │  21.0 │ 10 │ 8.4 │...│
│ [Props (4) ● High]            │        │       │    │     │   │
│                               │        │       │    │     │   │
│ RB1 C. McCaffrey [Hist ● Med] │  18.3  │   9.1 │  5 │ 3.6 │...│
└────────────────────────────────────────────────────────────────┘
```

**Note:** Badge appears inline with player name and team, providing immediate context.

---

## Location 3: Single Week View

### Before:

```
┌───────────────────────────────────────────────┐
│ Owner: John's Team                            │
├───────────────────────────────────────────────┤
│ QB   Patrick Mahomes  KC      14.5      7.3  │
│ RB1  Saquon Barkley   PHI      8.2      4.9  │
│ WR1  Tyreek Hill      MIA     12.1      6.0  │
└───────────────────────────────────────────────┘
```

### After:

```
┌─────────────────────────────────────────────────────────┐
│ Owner: John's Team                                      │
├─────────────────────────────────────────────────────────┤
│ QB   Patrick Mahomes  KC  [Props (4) ● H]  14.5   7.3 │
│ RB1  Saquon Barkley   PHI [Blend (2) ● M]   8.2   4.9 │
│ WR1  Tyreek Hill      MIA [Props (3) ● H]  12.1   6.0 │
└─────────────────────────────────────────────────────────┘
```

**Note:** Abbreviated confidence levels (H/M/L) save space on mobile.

---

## Full Projection Breakdown Modal

### Triggered By:

- Clicking any player that has breakdown data
- Look for the "›" indicator on player rows

### Modal Contents:

```
╔═══════════════════════════════════════════════════════╗
║                Patrick Mahomes                    [×] ║
║                QB - KC                                ║
║                                                       ║
║         Projected Points           Expected Value    ║
║              21.5                       10.8         ║
╠═══════════════════════════════════════════════════════╣
║ Confidence                                            ║
║ High (85/100)                                         ║
║ ■■■■■■■■■□ 85%                                        ║
║ [5 prop lines] [3 playoff games] [Fresh data (<6h)]  ║
╠═══════════════════════════════════════════════════════╣
║ Source Blend                                          ║
║ 75% props / 25% historical                            ║
║ ████████████████████░░░░░                            ║
║ Props: 22.3 pts    Historical: 19.2 pts              ║
╠═══════════════════════════════════════════════════════╣
║ Projection Range                                      ║
║                    21.5 pts                           ║
║ ┄┄┄┄┄┄┄●┄┄┄┄┄┄                                       ║
║ Low: 15.0                            High: 28.0      ║
╠═══════════════════════════════════════════════════════╣
║ Weather Adjustment                                    ║
║ 💨 -8% (15mph wind, 35°F)                            ║
╠═══════════════════════════════════════════════════════╣
║ Prop Lines                                            ║
║ ┌────────────┬─────────┬──────┐                      ║
║ │ Stat       │ Line    │ Pts  │                      ║
║ ├────────────┼─────────┼──────┤                      ║
║ │ Pass Yds   │ 275.5   │ +11.0│                      ║
║ │ Pass TDs   │ 2.5     │ +15.0│                      ║
║ │ Rush Yds   │ 18.5    │  +1.9│                      ║
║ │ Anytime TD │ 35%     │  +2.1│                      ║
║ └────────────┴─────────┴──────┘                      ║
╠═══════════════════════════════════════════════════════╣
║ 3 playoff games                                       ║
║ Props updated: Jan 24, 2026 9:45 PM                  ║
╚═══════════════════════════════════════════════════════╝
```

---

## Badge Color Scheme

### Source Colors:

- **Blue** - Props (prop-based projections)
- **Green** - Hist (historical average only)
- **Purple** - Blend (mixed prop + historical)

### Confidence Colors:

- **Green dot** - High confidence (70+ score)
- **Yellow dot** - Medium confidence (40-69 score)
- **Red dot** - Low confidence (<40 score)

---

## Badge Variants

### Full Badge (Desktop):

```
[Props (4) ● High]
```

- Shows full source label
- Shows prop count
- Shows full confidence level

### Compact Badge (Mobile):

```
[Props (4) ● H]
```

- Abbreviated confidence (H/M/L)
- Saves horizontal space

### Minimal Badge (Very Small Screens):

```
[P4 ●]
```

- Source initial + count
- Dot only for confidence

---

## Interactive Behavior

### 1. Hover Tooltips

```
╔════════════════════════════════╗
║ Projection Details             ║
║                                ║
║ Source: Blended                ║
║ Props: 4 lines used            ║
║ Confidence: 85/100             ║
║                                ║
║ Factors:                       ║
║ • 5 prop lines                 ║
║ • 3 playoff games              ║
║ • Fresh data (<6h)             ║
║ • Weather adjusted             ║
╚════════════════════════════════╝
```

### 2. Click Player

- Opens full `ProjectionBreakdownCard` modal
- Dimmed background overlay
- Click outside or [×] to close
- Shows all breakdown details

### 3. Toggle Prop-Based

```
┌──────────────────────────────┐
│ ☑ Prop-based (78%)           │
└──────────────────────────────┘
```

- Checkbox shows current state
- Percentage shows prop coverage
- Toggling refreshes all projections
- Badges update accordingly

---

## Prop Coverage Indicator

In the page header:

```
┌─────────────────────────────────────────────────┐
│ Projections                          [ℹ️]       │
│ Cumulative expected value for rest of playoffs │
│                                                 │
│ [Rest of Playoffs] [Single Week]               │
│ ☑ Prop-based (78%)         [Sync]             │
└─────────────────────────────────────────────────┘
```

**78%** = 78% of active players have prop data available

Lower percentages may indicate:

- Odds API hasn't been synced recently
- Players from eliminated teams (no upcoming games)
- Less popular players without props

---

## Enhanced Metadata Section

Below the header:

```
┌─────────────────────────────────────────────────────────┐
│ Completed: [Wild Card] [Divisional]                    │
│ Remaining: [Conference] [Super Bowl]                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Eliminated: 10 (BUF, KC, PHI, SF, DET, TB, GB, LAR,   │
│              HOU, BAL)                                  │
│ Bye Teams: KC, PHI, SF, BAL                            │
│ Odds in DB: 24                                          │
│ Year: 2025                                              │
│ Props: 35/45 (78%)                                      │
│ Weather ✓                                               │
└─────────────────────────────────────────────────────────┘
```

This debug section helps verify:

- Which rounds are complete/remaining
- Which teams are still playing
- How much data is available for projections

---

## Projection Methodology (Info Modal)

Click the [ℹ️] button next to "Projections" to see:

```
╔═══════════════════════════════════════════════════════╗
║         Understanding Our Projections            [×]  ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║ Data Sources                                          ║
║ ──────────────────────────────────────────────────── ║
║                                                       ║
║ 1. Betting Props (The Odds API)                      ║
║    • Pass/rush/receiving yards over/under            ║
║    • Touchdown probabilities                         ║
║    • Market consensus from multiple sportsbooks      ║
║                                                       ║
║ 2. Historical Performance                            ║
║    • Playoff game statistics                         ║
║    • Recent games weighted more heavily              ║
║    • Position-specific baselines                     ║
║                                                       ║
║ 3. Weather Data (OpenMeteo)                          ║
║    • Wind speed, temperature, precipitation          ║
║    • Position-specific impact adjustments            ║
║    • Real-time stadium forecasts                     ║
║                                                       ║
║ Projection Methodology                               ║
║ ──────────────────────────────────────────────────── ║
║                                                       ║
║ • Adaptive Blending                                  ║
║   Weight betting props and historical data based on  ║
║   quality and availability. More props = more weight.║
║                                                       ║
║ • Weather Adjustments                                ║
║   Apply position-specific multipliers for wind,      ║
║   temperature, and precipitation.                    ║
║                                                       ║
║ • Confidence Scoring                                 ║
║   0-100 score based on data quality, recency, and    ║
║   sample size.                                        ║
║                                                       ║
║ • Expected Value                                     ║
║   Projected Points × Win Probability = EV            ║
║   Accounts for elimination risk.                     ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

---

## User Experience Flow

1. **Visit Projections Page**
   → See inline badges showing source and confidence

2. **Hover Over Badge**
   → Tooltip shows detailed breakdown

3. **Click Player Name**
   → Full modal with all projection details

4. **Review Breakdown**
   → Understand how projection was calculated
   → See all contributing factors
   → View prop lines and weather impact

5. **Close Modal**
   → Return to list view

6. **Toggle Settings**
   → Enable/disable prop-based projections
   → Switch between playoff view and single week
   → Sync latest data

---

## Mobile Optimizations

- Compact badge labels (H/M/L instead of High/Medium/Low)
- Touch-friendly click targets
- Modal fills screen on small devices
- Horizontal scrolling for wide tables
- Stacked info on narrow screens

---

## Accessibility Features

- Color is not the only indicator (icons + text)
- Tooltips provide context
- Keyboard navigation supported
- Screen reader friendly labels
- High contrast colors for badges

---

This visual guide should help users understand what they're seeing and how to interact with the new projection transparency features!

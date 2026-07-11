# Testing Checklist - Projections Enhancement

## Quick Verification Steps

### 1. Page Loads Successfully ✓

- [ ] Navigate to `/projections`
- [ ] Page loads without errors
- [ ] No console errors in browser DevTools

### 2. Inline Badges Appear ✓

**Playoffs View - Owner Cards:**

- [ ] Open first owner card
- [ ] Verify badges appear next to player names
- [ ] Badges show format: `[Source (N) ● Level]`
- [ ] Colors are correct:
  - [ ] Blue for "Props"
  - [ ] Green for "Hist"
  - [ ] Purple for "Blend"
  - [ ] Green dot for high confidence
  - [ ] Yellow dot for medium confidence
  - [ ] Red dot for low confidence

**Playoffs View - Detailed Table:**

- [ ] Click any owner row to expand detailed view
- [ ] Verify badges appear in player name column
- [ ] All players show appropriate badges

**Single Week View:**

- [ ] Switch to "Single Week" tab
- [ ] Select a week from dropdown
- [ ] Open owner cards
- [ ] Verify badges appear for all players

### 3. Modal Breakdown Works ✓

- [ ] Click any player that has a "›" indicator
- [ ] Modal opens with full breakdown
- [ ] All sections are visible:
  - [ ] Header (player name, position, team)
  - [ ] Projected points and EV
  - [ ] Confidence gauge with score
  - [ ] Source blend bar
  - [ ] Projection range
  - [ ] Weather adjustment (if applicable)
  - [ ] Props breakdown table (if props available)
  - [ ] Data freshness footer
- [ ] Modal can be closed:
  - [ ] Click [×] button
  - [ ] Click outside modal (on overlay)

### 4. Prop Coverage Indicator ✓

- [ ] Check header area
- [ ] "Prop-based" checkbox shows percentage
- [ ] Example: `☑ Prop-based (78%)`
- [ ] Percentage matches metadata in debug section

### 5. Enhanced Metadata Section ✓

- [ ] Debug info section below header shows:
  - [ ] Eliminated teams count
  - [ ] Bye teams list
  - [ ] Odds in DB count
  - [ ] Props coverage (X/Y players, percentage)
  - [ ] Weather availability indicator

### 6. Toggle Functionality ✓

- [ ] Uncheck "Prop-based" checkbox
- [ ] Page refreshes with updated data
- [ ] Badges update to show "Hist" for more players
- [ ] Re-check "Prop-based" checkbox
- [ ] Page refreshes again
- [ ] Badges revert to prop-based sources

### 7. Sync Functionality ✓

- [ ] Click [Sync] button
- [ ] Loading indicator appears
- [ ] Data refreshes after sync completes
- [ ] Timestamps update

### 8. Responsive Design ✓

**Desktop (>768px):**

- [ ] Badges show full labels
- [ ] Modal is centered
- [ ] Tables are readable

**Mobile (<768px):**

- [ ] Badges show compact labels (H/M/L)
- [ ] Modal fills screen
- [ ] Cards stack vertically
- [ ] Touch targets are large enough

### 9. Tooltips Work ✓

- [ ] Hover over any badge
- [ ] Tooltip appears showing:
  - [ ] Projection source details
  - [ ] Confidence factors
  - [ ] Prop count
- [ ] Tooltip disappears on mouse out

### 10. Error Handling ✓

**No Breakdown Data:**

- [ ] Players without breakdown don't show "›" indicator
- [ ] Clicking them doesn't open modal
- [ ] Badges still show based on available metadata

**No Props Available:**

- [ ] Players without props show "Hist" badge
- [ ] Modal (if available) shows props section as empty
- [ ] No errors in console

**Network Errors:**

- [ ] Disable network in DevTools
- [ ] Try to load page
- [ ] Error message displays
- [ ] Page doesn't crash

---

## Data Verification

### 11. Projection Calculations ✓

Pick a player and verify:

- [ ] Projected points make sense for position
- [ ] Confidence level matches data quality
  - High = 4+ props + 2+ games + fresh data
  - Medium = 2-3 props OR 1-2 games
  - Low = minimal data
- [ ] Source blend matches:
  - Props = 100% prop weight
  - Hist = 0% prop weight
  - Blend = somewhere in between

### 12. Weather Adjustments ✓

Find a player in bad weather:

- [ ] Weather badge shows impact (high/medium/low)
- [ ] Adjustment percentage is negative for offense
- [ ] Adjustment percentage is positive for defense
- [ ] Conditions are described in tooltip

### 13. Prop Lines Display ✓

Find a player with props:

- [ ] Open modal
- [ ] Props breakdown table shows all available lines
- [ ] Each line shows:
  - [ ] Stat type (Pass Yds, Rush Yds, etc.)
  - [ ] Line value (275.5, etc.)
  - [ ] Point contribution (+11.0, etc.)
- [ ] Total roughly matches projected points

### 14. Confidence Factors ✓

Open modal for high-confidence player:

- [ ] Score is 70+
- [ ] Factors include:
  - "X prop lines"
  - "X playoff games"
  - "Fresh data" or "Recent data"
  - "Weather adjusted" (if applicable)

Open modal for low-confidence player:

- [ ] Score is <40
- [ ] Fewer factors listed
- [ ] May say "1 prop line" or "0 playoff games"

---

## Performance Verification

### 15. Load Times ✓

- [ ] Page loads in <3 seconds
- [ ] Modal opens instantly
- [ ] No lag when expanding owners
- [ ] Smooth scrolling

### 16. No Memory Leaks ✓

- [ ] Open/close modal multiple times
- [ ] Switch between tabs multiple times
- [ ] Toggle prop-based on/off multiple times
- [ ] No slowdown over time
- [ ] Memory usage stays reasonable in DevTools

---

## Cross-Browser Testing

### 17. Chrome ✓

- [ ] All features work
- [ ] Badges render correctly
- [ ] Modal displays properly

### 18. Firefox ✓

- [ ] All features work
- [ ] Badges render correctly
- [ ] Modal displays properly

### 19. Safari ✓

- [ ] All features work
- [ ] Badges render correctly
- [ ] Modal displays properly

### 20. Mobile Safari / Chrome ✓

- [ ] Touch interactions work
- [ ] Modal scrolls properly
- [ ] Badges are readable

---

## Edge Cases

### 21. Player with No Data ✓

- [ ] Player shows position baseline
- [ ] Low confidence badge
- [ ] Historical source
- [ ] No breakdown available (no ›)

### 22. Player on Bye Team ✓

- [ ] Week 1 shows "BYE" indicator
- [ ] No projected points for that week
- [ ] Advance probability is 1.0

### 23. Injured Player with Substitution ✓

- [ ] Shows "INJ" badge
- [ ] Strikethrough on name
- [ ] Shows substitute player name
- [ ] Both projections visible

### 24. Eliminated Team Player ✓

- [ ] Shows "OUT" badge
- [ ] Opacity reduced
- [ ] No remaining EV
- [ ] No badge (no future projections)

---

## Documentation Verification

### 25. Methodology Modal ✓

- [ ] Click [ℹ️] button next to "Projections" title
- [ ] Modal explains projection methodology
- [ ] Sections include:
  - [ ] Data sources
  - [ ] Calculation methods
  - [ ] Weather adjustments
  - [ ] Confidence scoring
  - [ ] Expected value formula

### 26. EV Explainer Modal ✓

- [ ] Click [ℹ️] button next to "EV" column headers
- [ ] Modal explains expected value concept
- [ ] Shows formula
- [ ] Provides examples
- [ ] Clear and understandable

---

## Sign-Off

Once all items are checked:

✅ **All features working as expected**
✅ **No console errors**
✅ **Performance is acceptable**
✅ **Mobile experience is good**
✅ **Data calculations are correct**

**Implementation Status:** COMPLETE ✓

**Tested By:** ******\_\_\_\_******

**Date:** ******\_\_\_\_******

**Notes:**

---

---

---

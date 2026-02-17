# Font Size Increase Design

**Date**: 2026-02-16
**Objective**: Increase default font sizes in firmware UI for improved readability

## Overview

Update the firmware UI to use larger fonts for the status message and button labels on the 820x320 display. This change improves readability and user experience without requiring hardware changes or significant code modifications.

## Current State

Current fonts in `firmware/src/display/display_manager.cpp`:
- Status bar (line 255): `lv_font_montserrat_14` (14px)
- Notification area (line 265): `lv_font_montserrat_16` (16px)
- Button labels (line 280): `lv_font_montserrat_16` (16px)

## Target Fonts

- Status bar: `lv_font_montserrat_24` (24px) — +10px
- Notification area: `lv_font_montserrat_28` (28px) — +12px
- Button labels: `lv_font_montserrat_32` (32px) — +16px

## Implementation Approach

### 1. Centralized Font Configuration
Add font defines to `firmware/src/config.h` as a single source of truth:
```cpp
// Font sizes for UI elements
#define FONT_STATUS   &lv_font_montserrat_24
#define FONT_NOTIF    &lv_font_montserrat_28
#define FONT_BUTTON   &lv_font_montserrat_32
```

**Rationale**: Centralizing fonts makes them easy to adjust in the future and documents the intended sizing hierarchy.

### 2. Update Display Manager
Modify `firmware/src/display/display_manager.cpp` to use the new constants:
- **Line 255** (status label): Replace `&lv_font_montserrat_14` with `FONT_STATUS`
- **Line 265** (notification label): Replace `&lv_font_montserrat_16` with `FONT_NOTIF`
- **Line 280** (button labels): Replace `&lv_font_montserrat_16` with `FONT_BUTTON`

## Layout Analysis

| Element | Size | Height | Notes |
|---------|------|--------|-------|
| Status bar | 30px | 24px font | Fits with padding |
| Notification area | ~260px | 28px font | Word-wrap handles larger text |
| Button bar | 62px | 32px font | Large font centered, room for padding |

All elements comfortably fit the increased font sizes.

## Files Modified

1. **`firmware/src/config.h`** — Add 3 font configuration lines
2. **`firmware/src/display/display_manager.cpp`** — Update 3 font references (total 3 lines changed)

## Testing Criteria

- Firmware compiles without errors
- Display initializes successfully
- Status text displays correctly
- Notification text displays and wraps properly
- Button labels are centered and visible
- Font sizes visually match target specifications

## Rollback Plan

If needed, the changes are minimal and easily reversible:
- Revert config.h changes
- Revert display_manager.cpp font references

## Future Enhancements

- Implement font size configuration via serial/WebSocket protocol
- Add theme support for different font sets based on display size
- Consider dynamic font sizing based on notification length

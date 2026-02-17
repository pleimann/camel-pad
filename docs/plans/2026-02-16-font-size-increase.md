# Font Size Increase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Increase firmware UI font sizes (status: 14px→24px, notifications: 16px→28px, buttons: 16px→32px) for improved readability.

**Architecture:** Centralize font configuration in `config.h` as preprocessor defines, then reference these constants in `display_manager.cpp`. This approach makes fonts easily adjustable and documents the sizing hierarchy.

**Tech Stack:** PlatformIO, LVGL v9, ESP-IDF, C++

---

## Task 1: Add Font Configuration Constants to config.h

**Files:**
- Modify: `firmware/src/config.h`

**Step 1: Open config.h and locate the pin definitions**

Open the file at `firmware/src/config.h`. Find the section with pin `#define` statements. We'll add the font constants after the pin definitions (typically near the end of the file before any closing `#endif`).

**Step 2: Add font configuration constants**

Add these three lines after the pin definitions section:

```cpp
// Font sizes for UI elements
#define FONT_STATUS   &lv_font_montserrat_24
#define FONT_NOTIF    &lv_font_montserrat_28
#define FONT_BUTTON   &lv_font_montserrat_32
```

**Step 3: Verify the file saves**

Save the file. Verify the new lines are present in the editor.

**Step 4: Commit this change**

```bash
cd /Users/mike/Workspace/esp/camel-pad
git add firmware/src/config.h
git commit -m "config: add font size constants for UI elements"
```

Expected: Commit succeeds, shows 1 file changed.

---

## Task 2: Update Status Label Font in display_manager.cpp

**Files:**
- Modify: `firmware/src/display/display_manager.cpp:255`

**Step 1: Open display_manager.cpp and locate line 255**

Open `firmware/src/display/display_manager.cpp`. Navigate to line 255 where the status label font is set. You should see:
```cpp
lv_obj_set_style_text_font(_statusLabel, &lv_font_montserrat_14, 0);
```

**Step 2: Replace the font reference with the constant**

Change `&lv_font_montserrat_14` to `FONT_STATUS`:
```cpp
lv_obj_set_style_text_font(_statusLabel, FONT_STATUS, 0);
```

**Step 3: Verify the change**

Confirm the line now reads `FONT_STATUS` instead of the hardcoded font reference.

**Step 4: Commit this change**

```bash
git add firmware/src/display/display_manager.cpp
git commit -m "display: increase status label font to 24px"
```

Expected: Commit succeeds, shows 1 file changed with 1 line modified.

---

## Task 3: Update Notification Label Font in display_manager.cpp

**Files:**
- Modify: `firmware/src/display/display_manager.cpp:265`

**Step 1: Locate line 265 in display_manager.cpp**

Navigate to line 265 where the notification label font is set. You should see:
```cpp
lv_obj_set_style_text_font(_notifLabel, &lv_font_montserrat_16, 0);
```

**Step 2: Replace the font reference with the constant**

Change `&lv_font_montserrat_16` to `FONT_NOTIF`:
```cpp
lv_obj_set_style_text_font(_notifLabel, FONT_NOTIF, 0);
```

**Step 3: Verify the change**

Confirm the line now reads `FONT_NOTIF` instead of the hardcoded font reference.

**Step 4: Commit this change**

```bash
git add firmware/src/display/display_manager.cpp
git commit -m "display: increase notification label font to 28px"
```

Expected: Commit succeeds, shows 1 file changed with 1 line modified.

---

## Task 4: Update Button Labels Font in display_manager.cpp

**Files:**
- Modify: `firmware/src/display/display_manager.cpp:280`

**Step 1: Locate line 280 in display_manager.cpp**

Navigate to line 280 inside the button creation loop. You should see:
```cpp
lv_obj_set_style_text_font(_btnLabels[i], &lv_font_montserrat_16, 0);
```

**Step 2: Replace the font reference with the constant**

Change `&lv_font_montserrat_16` to `FONT_BUTTON`:
```cpp
lv_obj_set_style_text_font(_btnLabels[i], FONT_BUTTON, 0);
```

**Step 3: Verify the change**

Confirm the line now reads `FONT_BUTTON` instead of the hardcoded font reference.

**Step 4: Commit this change**

```bash
git add firmware/src/display/display_manager.cpp
git commit -m "display: increase button label font to 32px"
```

Expected: Commit succeeds, shows 1 file changed with 1 line modified.

---

## Task 5: Build Firmware and Verify Compilation

**Files:**
- None (build verification only)

**Step 1: Navigate to firmware directory**

```bash
cd /Users/mike/Workspace/esp/camel-pad/firmware
```

**Step 2: Clean and build**

```bash
.venv/bin/platformio run --verbose
```

Expected: Build completes without errors. Output should show:
- Compiling firmware files
- Linking
- Final message indicating successful build (e.g., "✓ Built target" or similar)

**Step 3: Verify build artifacts**

Check that `.pio/build/` directory contains the compiled binary.

**Step 4: Note any warnings**

Review output for warnings. Font reference errors would appear here. If compilation fails, review the error messages and ensure all font constants are properly defined in config.h.

**No commit needed** — this is verification only.

---

## Task 6: Flash and Test on Device

**Files:**
- None (runtime testing)

**Step 1: Connect device via USB**

Plug the Waveshare ESP32-S3-LCD-3.16 into your development machine via USB.

**Step 2: Verify device port**

```bash
ls -la /dev/tty* | grep -i usb
```

Or check in PlatformIO:
```bash
.venv/bin/platformio device list
```

**Step 3: Upload firmware**

```bash
cd /Users/mike/Workspace/esp/camel-pad/firmware
.venv/bin/platformio run --target upload
```

Expected: Upload completes without errors. Device should reset and display should show the new UI with larger fonts.

**Step 4: Visual Verification**

Once the device boots:
- **Status bar** (top) — Should display "Ready" or status text in visibly larger font (24px)
- **Notification area** (middle) — If text is shown, it should be noticeably larger (28px)
- **Button area** (bottom) — Button labels ("1", "2", "3", "4") should be prominently displayed in large font (32px), centered in each button

**Step 5: Test text wrapping and layout**

- Send a test notification via the bridge to verify notification text wraps properly with the larger 28px font
- Verify buttons remain clickable and labels are centered
- Confirm no text is cut off or overlapping

**No commit needed** — this is manual verification. If issues are found, note them and proceed to fixing them.

---

## Task 7: Final Verification and Summary Commit

**Files:**
- None (verification and summary)

**Step 1: Verify all changes are committed**

```bash
cd /Users/mike/Workspace/esp/camel-pad
git status
```

Expected: Output shows `nothing to commit, working tree clean`

**Step 2: Review commit log**

```bash
git log --oneline -5
```

Expected: Last 4 commits show:
- "display: increase button label font to 32px"
- "display: increase notification label font to 28px"
- "display: increase status label font to 24px"
- "config: add font size constants for UI elements"

**Step 3: Document completion**

The implementation is complete. Font sizes have been successfully increased across all UI elements:
- Status bar: 14px → 24px
- Notifications: 16px → 28px
- Button labels: 16px → 32px

All changes are committed with clear commit messages for future reference.

**No additional commit needed.**

---

## Success Criteria Checklist

- ✅ Font constants added to `config.h`
- ✅ Status label uses `FONT_STATUS` (24px)
- ✅ Notification label uses `FONT_NOTIF` (28px)
- ✅ Button labels use `FONT_BUTTON` (32px)
- ✅ Firmware compiles without errors
- ✅ Firmware uploads to device successfully
- ✅ Display shows larger, more readable fonts
- ✅ All text fits properly in allocated UI areas
- ✅ Changes committed with descriptive messages

## Rollback Instructions

If rollback is needed, revert the commits in reverse order:

```bash
git revert HEAD~3..HEAD
```

Or manually revert individual commits:
```bash
git revert <commit-hash>
```

---

## Related Documentation

- Design document: `docs/plans/2026-02-16-font-size-increase-design.md`
- Display manager: `firmware/src/display/display_manager.cpp`
- Configuration: `firmware/src/config.h`

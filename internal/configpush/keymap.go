package configpush

import (
	"fmt"
	"strings"
	"unicode"
)

// KeycodeName returns the Python Keycode constant name for a key string
// e.g., "a" -> "A", "enter" -> "ENTER", "ctrl" -> "CONTROL"
func KeycodeName(key string) (string, error) {
	key = strings.ToLower(strings.TrimSpace(key))

	// Check modifiers
	if name, ok := modifierMap[key]; ok {
		return name, nil
	}

	// Check special keys
	if name, ok := specialKeyMap[key]; ok {
		return name, nil
	}

	// Single character - convert to uppercase for Keycode constant
	if len(key) == 1 {
		r := rune(key[0])
		if r >= 'a' && r <= 'z' {
			return string(unicode.ToUpper(r)), nil
		}
		if r >= '0' && r <= '9' {
			// Numbers are like Keycode.ONE, Keycode.TWO, etc.
			return numberNames[r-'0'], nil
		}
		// Punctuation and symbols
		if name, ok := symbolMap[r]; ok {
			return name, nil
		}
	}

	return "", fmt.Errorf("unknown key: %s", key)
}

// ParseKeyToKeycodes parses a key string like "ctrl+shift+c" into Keycode names
func ParseKeyToKeycodes(s string) ([]string, error) {
	parts := strings.Split(strings.ToLower(s), "+")
	var keycodes []string

	for i, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		name, err := KeycodeName(part)
		if err != nil {
			return nil, fmt.Errorf("invalid key component %q: %w", part, err)
		}

		// Modifiers come first, then the actual key last
		if i < len(parts)-1 {
			// This should be a modifier
			if !isModifier(part) {
				return nil, fmt.Errorf("%q is not a valid modifier", part)
			}
		}

		keycodes = append(keycodes, name)
	}

	if len(keycodes) == 0 {
		return nil, fmt.Errorf("no keys specified")
	}

	return keycodes, nil
}

func isModifier(key string) bool {
	_, ok := modifierMap[strings.ToLower(key)]
	return ok
}

var modifierMap = map[string]string{
	"ctrl":    "CONTROL",
	"control": "CONTROL",
	"alt":     "ALT",
	"option":  "ALT",
	"shift":   "SHIFT",
	"meta":    "GUI",
	"cmd":     "GUI",
	"command": "GUI",
	"win":     "GUI",
	"super":   "GUI",
}

var specialKeyMap = map[string]string{
	"enter":     "ENTER",
	"return":    "ENTER",
	"tab":       "TAB",
	"esc":       "ESCAPE",
	"escape":    "ESCAPE",
	"space":     "SPACE",
	"spacebar":  "SPACE",
	"backspace": "BACKSPACE",
	"delete":    "DELETE",
	"del":       "DELETE",
	"insert":    "INSERT",
	"ins":       "INSERT",
	"home":      "HOME",
	"end":       "END",
	"pageup":    "PAGE_UP",
	"pgup":      "PAGE_UP",
	"pagedown":  "PAGE_DOWN",
	"pgdn":      "PAGE_DOWN",
	"up":        "UP_ARROW",
	"down":      "DOWN_ARROW",
	"left":      "LEFT_ARROW",
	"right":     "RIGHT_ARROW",
	"f1":        "F1",
	"f2":        "F2",
	"f3":        "F3",
	"f4":        "F4",
	"f5":        "F5",
	"f6":        "F6",
	"f7":        "F7",
	"f8":        "F8",
	"f9":        "F9",
	"f10":       "F10",
	"f11":       "F11",
	"f12":       "F12",
	"capslock":  "CAPS_LOCK",
	"printscreen": "PRINT_SCREEN",
	"scrolllock":  "SCROLL_LOCK",
	"pause":       "PAUSE",
}

var numberNames = []string{
	"ZERO", "ONE", "TWO", "THREE", "FOUR",
	"FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
}

var symbolMap = map[rune]string{
	'-':  "MINUS",
	'=':  "EQUALS",
	'[':  "LEFT_BRACKET",
	']':  "RIGHT_BRACKET",
	'\\': "BACKSLASH",
	';':  "SEMICOLON",
	'\'': "QUOTE",
	'`':  "GRAVE_ACCENT",
	',':  "COMMA",
	'.':  "PERIOD",
	'/':  "FORWARD_SLASH",
}

# ESPHome Seesaw Component Design

**Date:** 2026-02-02
**Status:** Approved
**Target:** ATtiny 1-series Seesaw breakouts (ATtiny816, ATtiny817, ATtiny1616)

## Overview

An ESPHome external component to expose Adafruit Seesaw firmware functionality over I2C. The component follows ESPHome's hub + sub-platform pattern, allowing Seesaw GPIO, Keypad, and NeoPixel features to integrate naturally with ESPHome's entity system.

## Scope

### Included Modules
- **GPIO**: Digital input (binary_sensor) and output platforms
- **Keypad**: Raw event stream with key ID and edge detection
- **NeoPixel**: Addressable light platform + raw pixel API

### Target Hardware
| Chip | Hardware ID | Flash | RAM |
|------|-------------|-------|-----|
| ATtiny816 | 0x84 | 8KB | 512B |
| ATtiny817 | 0x85 | 8KB | 512B |
| ATtiny1616 | 0x88 | 16KB | 2KB |

### Out of Scope (Future)
- ADC module
- PWM module
- Encoder module
- Touch module
- EEPROM module
- SAMD-based Seesaw devices

## Component Structure

```
components/
└── seesaw/
    ├── __init__.py           # Hub component (I2C device registration)
    ├── seesaw.h              # Core C++ class with I2C protocol
    ├── seesaw.cpp
    ├── binary_sensor/
    │   ├── __init__.py       # GPIO input config
    │   ├── seesaw_binary_sensor.h
    │   └── seesaw_binary_sensor.cpp
    ├── output/
    │   ├── __init__.py       # GPIO output config
    │   ├── seesaw_output.h
    │   └── seesaw_output.cpp
    ├── keypad/
    │   ├── __init__.py       # Keypad event config
    │   ├── seesaw_keypad.h
    │   └── seesaw_keypad.cpp
    └── light/
        ├── __init__.py       # NeoPixel light config
        ├── seesaw_neopixel.h
        └── seesaw_neopixel.cpp
```

## YAML Configuration Interface

```yaml
external_components:
  - source:
      type: local
      path: ../components

seesaw:
  id: my_seesaw
  address: 0x49

# GPIO input as binary sensor
binary_sensor:
  - platform: seesaw
    seesaw_id: my_seesaw
    pin: 4
    name: "Button 1"

# GPIO output
output:
  - platform: seesaw
    seesaw_id: my_seesaw
    pin: 5
    id: led_output

# Keypad raw events
seesaw_keypad:
  seesaw_id: my_seesaw
  on_key_event:
    - lambda: |-
        if (x.edge == seesaw_keypad::KEY_EDGE_RISING) {
          ESP_LOGI("keypad", "Key %d pressed", x.key);
        }

# NeoPixel as addressable light
light:
  - platform: seesaw_neopixel
    seesaw_id: my_seesaw
    pin: 6
    num_leds: 4
    color_order: GRB
    name: "Keypad LEDs"
    id: keypad_leds
    effects:
      - rainbow:
```

## I2C Protocol

Seesaw uses 2-byte register addressing: `[module_base, function_register]`

### Module Base Addresses
| Module | Address |
|--------|---------|
| STATUS | 0x00 |
| GPIO | 0x01 |
| NEOPIXEL | 0x0E |
| KEYPAD | 0x10 |

### Status Registers
| Register | Address | Description |
|----------|---------|-------------|
| HW_ID | 0x01 | Hardware identification |
| VERSION | 0x02 | Firmware version |
| SWRST | 0x7F | Software reset |

### GPIO Registers
| Register | Address | Description |
|----------|---------|-------------|
| DIRSET_BULK | 0x02 | Set pin as output |
| DIRCLR_BULK | 0x03 | Set pin as input |
| BULK | 0x04 | Read pin states |
| BULK_SET | 0x05 | Set pins high |
| BULK_CLR | 0x06 | Set pins low |
| PULLENSET | 0x0B | Enable pull-ups |
| PULLENCLR | 0x0C | Disable pull-ups |

### Keypad Registers
| Register | Address | Description |
|----------|---------|-------------|
| COUNT | 0x04 | Number of events in FIFO |
| FIFO | 0x10 | Read event data |

Event format: `[key_number | (edge << 6)]`
- Edge 0: HIGH
- Edge 1: LOW
- Edge 2: FALLING
- Edge 3: RISING

### NeoPixel Registers
| Register | Address | Description |
|----------|---------|-------------|
| PIN | 0x01 | Set output pin |
| SPEED | 0x02 | 0=400KHz, 1=800KHz |
| BUF_LENGTH | 0x03 | Buffer size (num_leds * bpp) |
| BUF | 0x04 | Write pixel data |
| SHOW | 0x05 | Latch to LEDs |

## C++ Architecture

### Hub Component (`seesaw.h`)

```cpp
namespace esphome::seesaw {

enum SeesawModule : uint8_t {
  SEESAW_STATUS = 0x00,
  SEESAW_GPIO = 0x01,
  SEESAW_NEOPIXEL = 0x0E,
  SEESAW_KEYPAD = 0x10,
};

enum SeesawHardwareID : uint8_t {
  ATTINY816 = 0x84,
  ATTINY817 = 0x85,
  ATTINY1616 = 0x88,
};

class SeesawComponent : public Component, public i2c::I2CDevice {
 public:
  void setup() override;
  void dump_config() override;
  float get_setup_priority() const override { return setup_priority::IO; }

  // Low-level I2C operations
  bool write_register(uint8_t module, uint8_t reg, const uint8_t *data, size_t len);
  bool read_register(uint8_t module, uint8_t reg, uint8_t *data, size_t len);

  // Status queries
  uint8_t get_hardware_id();
  uint32_t get_version();
  void software_reset();

  // GPIO operations
  bool gpio_set_mode(uint8_t pin, uint8_t mode);
  bool gpio_write(uint8_t pin, bool value);
  bool gpio_read(uint8_t pin);
  uint32_t gpio_read_bulk();

 protected:
  uint8_t hardware_id_{0};
  uint32_t version_{0};
};

}  // namespace esphome::seesaw
```

### Binary Sensor (`binary_sensor/seesaw_binary_sensor.h`)

```cpp
class SeesawBinarySensor : public binary_sensor::BinarySensor,
                           public PollingComponent,
                           public Parented<SeesawComponent> {
 public:
  void setup() override;
  void update() override;

  void set_pin(uint8_t pin) { this->pin_ = pin; }
  void set_mode(uint8_t mode) { this->mode_ = mode; }

 protected:
  uint8_t pin_;
  uint8_t mode_;
};
```

### Output (`output/seesaw_output.h`)

```cpp
class SeesawOutput : public output::BinaryOutput,
                     public Component,
                     public Parented<SeesawComponent> {
 public:
  void setup() override;
  void write_state(bool state) override;

  void set_pin(uint8_t pin) { this->pin_ = pin; }

 protected:
  uint8_t pin_;
};
```

### Keypad (`keypad/seesaw_keypad.h`)

```cpp
namespace esphome::seesaw_keypad {

enum KeyEdge : uint8_t {
  KEY_EDGE_HIGH = 0,
  KEY_EDGE_LOW = 1,
  KEY_EDGE_FALLING = 2,
  KEY_EDGE_RISING = 3,
};

struct KeyEvent {
  uint8_t key;
  KeyEdge edge;
};

class SeesawKeypadComponent : public PollingComponent,
                              public Parented<seesaw::SeesawComponent> {
 public:
  void setup() override;
  void update() override;
  void dump_config() override;

  Trigger<KeyEvent> *get_key_event_trigger() { return &this->key_event_trigger_; }

 protected:
  void read_fifo_();

  Trigger<KeyEvent> key_event_trigger_;
};

}  // namespace esphome::seesaw_keypad
```

### NeoPixel Light (`light/seesaw_neopixel.h`)

```cpp
namespace esphome::seesaw_neopixel {

enum ColorOrder : uint8_t {
  COLOR_ORDER_RGB = 0,
  COLOR_ORDER_GRB = 1,
  COLOR_ORDER_RGBW = 2,
  COLOR_ORDER_GRBW = 3,
};

class SeesawNeopixelLight : public light::AddressableLight,
                            public Parented<seesaw::SeesawComponent> {
 public:
  void setup() override;
  void dump_config() override;

  // AddressableLight interface
  int32_t size() const override { return this->num_leds_; }
  light::LightTraits get_traits() override;
  void write_state(light::LightState *state) override;
  void clear_effect_data() override;

  // Raw API for direct pixel control
  void set_pixel(uint16_t index, uint8_t r, uint8_t g, uint8_t b);
  void set_pixel(uint16_t index, uint8_t r, uint8_t g, uint8_t b, uint8_t w);
  void show();
  void clear();

  void set_pin(uint8_t pin) { this->pin_ = pin; }
  void set_num_leds(uint16_t num) { this->num_leds_ = num; }
  void set_color_order(ColorOrder order) { this->color_order_ = order; }

 protected:
  light::ESPColorView get_view_internal(int32_t index) const override;
  void send_pixels_();

  uint8_t pin_;
  uint16_t num_leds_;
  ColorOrder color_order_{COLOR_ORDER_GRB};
  uint8_t bytes_per_pixel_{3};
  std::unique_ptr<uint8_t[]> buffer_;
};

}  // namespace esphome::seesaw_neopixel
```

## Implementation Order

1. **Hub component** - I2C protocol, device detection, software reset
2. **GPIO output** - Simplest sub-component, validates I2C communication
3. **GPIO binary sensor** - Validates read operations
4. **NeoPixel light** - Visual feedback for testing
5. **Keypad events** - Most complex, requires FIFO handling

## Testing

Test configuration will be added to `pad/esphome.yaml` using:

```yaml
external_components:
  - source:
      type: local
      path: ../components
```

Each sub-component will be tested incrementally during implementation.

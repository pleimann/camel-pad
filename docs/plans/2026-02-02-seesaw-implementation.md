# Seesaw Component Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an ESPHome external component for Adafruit Seesaw ATtiny 1-series breakouts with GPIO, Keypad, and NeoPixel support.

**Architecture:** Hub component manages I2C communication; sub-components (binary_sensor, output, keypad, light) use Parented<> template to access hub. Each sub-component follows ESPHome platform patterns.

**Tech Stack:** Python (ESPHome codegen), C++ (ESP-IDF/Arduino), I2C protocol

**Repository:** https://github.com/pleimann/esphome-adafruit-seesaw

---

## Task 1: Repository Setup

**Files:**
- Create: `components/seesaw/README.md`
- Create: `.gitignore`

**Step 1: Initialize repository structure**

```bash
cd /Users/mike/Workspace/esp/camel-pad
mkdir -p components/seesaw
```

**Step 2: Create README.md**

Create `components/seesaw/README.md`:
```markdown
# ESPHome Seesaw Component

ESPHome external component for Adafruit Seesaw ATtiny 1-series breakouts.

## Supported Hardware

- ATtiny816 (Hardware ID: 0x84)
- ATtiny817 (Hardware ID: 0x85)
- ATtiny1616 (Hardware ID: 0x88)

## Features

- GPIO input (binary_sensor) and output
- Keypad with raw event stream
- NeoPixel addressable LEDs

## Installation

```yaml
external_components:
  - source: github://pleimann/esphome-adafruit-seesaw
```

## Usage

See [ESPHome documentation](https://esphome.io) for configuration examples.
```

**Step 3: Create .gitignore**

Create `components/seesaw/.gitignore`:
```
__pycache__/
*.pyc
.esphome/
```

**Step 4: Commit**

```bash
git add components/seesaw/
git commit -m "feat(seesaw): initialize component structure"
```

---

## Task 2: Hub Component - Python Schema

**Files:**
- Create: `components/seesaw/__init__.py`

**Step 1: Create hub Python module**

Create `components/seesaw/__init__.py`:
```python
import esphome.codegen as cg
from esphome.components import i2c
import esphome.config_validation as cv
from esphome.const import CONF_ID

CODEOWNERS = ["@pleimann"]
DEPENDENCIES = ["i2c"]
MULTI_CONF = True

CONF_SEESAW_ID = "seesaw_id"

seesaw_ns = cg.esphome_ns.namespace("seesaw")
SeesawComponent = seesaw_ns.class_("SeesawComponent", cg.Component, i2c.I2CDevice)

CONFIG_SCHEMA = (
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(SeesawComponent),
        }
    )
    .extend(cv.COMPONENT_SCHEMA)
    .extend(i2c.i2c_device_schema(0x49))
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await i2c.register_i2c_device(var, config)
```

**Step 2: Commit**

```bash
git add components/seesaw/__init__.py
git commit -m "feat(seesaw): add hub component Python schema"
```

---

## Task 3: Hub Component - C++ Header

**Files:**
- Create: `components/seesaw/seesaw.h`

**Step 1: Create C++ header**

Create `components/seesaw/seesaw.h`:
```cpp
#pragma once

#include "esphome/core/component.h"
#include "esphome/components/i2c/i2c.h"

namespace esphome {
namespace seesaw {

// Seesaw module base addresses
enum SeesawModule : uint8_t {
  SEESAW_STATUS = 0x00,
  SEESAW_GPIO = 0x01,
  SEESAW_NEOPIXEL = 0x0E,
  SEESAW_KEYPAD = 0x10,
};

// Status module registers
enum SeesawStatusReg : uint8_t {
  SEESAW_STATUS_HW_ID = 0x01,
  SEESAW_STATUS_VERSION = 0x02,
  SEESAW_STATUS_OPTIONS = 0x03,
  SEESAW_STATUS_SWRST = 0x7F,
};

// GPIO module registers
enum SeesawGPIOReg : uint8_t {
  SEESAW_GPIO_DIRSET = 0x02,
  SEESAW_GPIO_DIRCLR = 0x03,
  SEESAW_GPIO_BULK = 0x04,
  SEESAW_GPIO_BULK_SET = 0x05,
  SEESAW_GPIO_BULK_CLR = 0x06,
  SEESAW_GPIO_PULLENSET = 0x0B,
  SEESAW_GPIO_PULLENCLR = 0x0C,
};

// Hardware IDs for ATtiny 1-series
enum SeesawHardwareID : uint8_t {
  SEESAW_HW_ID_ATTINY816 = 0x84,
  SEESAW_HW_ID_ATTINY817 = 0x85,
  SEESAW_HW_ID_ATTINY1616 = 0x88,
};

class SeesawComponent : public Component, public i2c::I2CDevice {
 public:
  void setup() override;
  void dump_config() override;
  float get_setup_priority() const override { return setup_priority::IO; }

  /// Write data to a seesaw register
  bool write_register(uint8_t module, uint8_t reg, const uint8_t *data, size_t len);
  bool write_register(uint8_t module, uint8_t reg) { return this->write_register(module, reg, nullptr, 0); }

  /// Read data from a seesaw register
  bool read_register(uint8_t module, uint8_t reg, uint8_t *data, size_t len, uint16_t delay_us = 250);

  /// Get hardware ID
  uint8_t get_hardware_id() const { return this->hardware_id_; }

  /// Get firmware version
  uint32_t get_version() const { return this->version_; }

  /// Software reset the seesaw
  void software_reset();

  /// GPIO operations
  bool gpio_set_pin_mode(uint8_t pin, bool output);
  bool gpio_set_pullup(uint8_t pin, bool enable);
  bool gpio_digital_write(uint8_t pin, bool value);
  bool gpio_digital_read(uint8_t pin, bool &value);
  bool gpio_read_bulk(uint32_t &values);

 protected:
  uint8_t hardware_id_{0};
  uint32_t version_{0};
};

}  // namespace seesaw
}  // namespace esphome
```

**Step 2: Commit**

```bash
git add components/seesaw/seesaw.h
git commit -m "feat(seesaw): add hub component C++ header"
```

---

## Task 4: Hub Component - C++ Implementation

**Files:**
- Create: `components/seesaw/seesaw.cpp`

**Step 1: Create C++ implementation**

Create `components/seesaw/seesaw.cpp`:
```cpp
#include "seesaw.h"
#include "esphome/core/log.h"
#include "esphome/core/hal.h"

namespace esphome {
namespace seesaw {

static const char *const TAG = "seesaw";

void SeesawComponent::setup() {
  ESP_LOGCONFIG(TAG, "Setting up Seesaw...");

  // Software reset
  this->software_reset();
  delay(10);

  // Read hardware ID
  uint8_t hw_id;
  if (!this->read_register(SEESAW_STATUS, SEESAW_STATUS_HW_ID, &hw_id, 1)) {
    ESP_LOGE(TAG, "Failed to read hardware ID");
    this->mark_failed();
    return;
  }
  this->hardware_id_ = hw_id;

  // Validate hardware ID
  if (hw_id != SEESAW_HW_ID_ATTINY816 && hw_id != SEESAW_HW_ID_ATTINY817 && hw_id != SEESAW_HW_ID_ATTINY1616) {
    ESP_LOGE(TAG, "Unknown hardware ID: 0x%02X", hw_id);
    this->mark_failed();
    return;
  }

  // Read version
  uint8_t version_buf[4];
  if (!this->read_register(SEESAW_STATUS, SEESAW_STATUS_VERSION, version_buf, 4, 1000)) {
    ESP_LOGE(TAG, "Failed to read version");
    this->mark_failed();
    return;
  }
  this->version_ = (uint32_t(version_buf[0]) << 24) | (uint32_t(version_buf[1]) << 16) |
                   (uint32_t(version_buf[2]) << 8) | uint32_t(version_buf[3]);

  ESP_LOGCONFIG(TAG, "Seesaw initialized successfully");
}

void SeesawComponent::dump_config() {
  ESP_LOGCONFIG(TAG, "Seesaw:");
  LOG_I2C_DEVICE(this);

  const char *hw_name;
  switch (this->hardware_id_) {
    case SEESAW_HW_ID_ATTINY816:
      hw_name = "ATtiny816";
      break;
    case SEESAW_HW_ID_ATTINY817:
      hw_name = "ATtiny817";
      break;
    case SEESAW_HW_ID_ATTINY1616:
      hw_name = "ATtiny1616";
      break;
    default:
      hw_name = "Unknown";
      break;
  }
  ESP_LOGCONFIG(TAG, "  Hardware: %s (0x%02X)", hw_name, this->hardware_id_);
  ESP_LOGCONFIG(TAG, "  Version: 0x%08X", this->version_);
}

void SeesawComponent::software_reset() {
  this->write_register(SEESAW_STATUS, SEESAW_STATUS_SWRST, (const uint8_t[]){0xFF}, 1);
}

bool SeesawComponent::write_register(uint8_t module, uint8_t reg, const uint8_t *data, size_t len) {
  std::vector<uint8_t> buf;
  buf.reserve(2 + len);
  buf.push_back(module);
  buf.push_back(reg);
  if (data != nullptr && len > 0) {
    buf.insert(buf.end(), data, data + len);
  }
  return this->write(buf.data(), buf.size()) == i2c::ERROR_OK;
}

bool SeesawComponent::read_register(uint8_t module, uint8_t reg, uint8_t *data, size_t len, uint16_t delay_us) {
  uint8_t cmd[2] = {module, reg};
  if (this->write(cmd, 2) != i2c::ERROR_OK) {
    return false;
  }
  delayMicroseconds(delay_us);
  return this->read(data, len) == i2c::ERROR_OK;
}

bool SeesawComponent::gpio_set_pin_mode(uint8_t pin, bool output) {
  uint32_t pin_mask = 1UL << pin;
  uint8_t data[4] = {
      uint8_t(pin_mask >> 24),
      uint8_t(pin_mask >> 16),
      uint8_t(pin_mask >> 8),
      uint8_t(pin_mask),
  };
  uint8_t reg = output ? SEESAW_GPIO_DIRSET : SEESAW_GPIO_DIRCLR;
  return this->write_register(SEESAW_GPIO, reg, data, 4);
}

bool SeesawComponent::gpio_set_pullup(uint8_t pin, bool enable) {
  uint32_t pin_mask = 1UL << pin;
  uint8_t data[4] = {
      uint8_t(pin_mask >> 24),
      uint8_t(pin_mask >> 16),
      uint8_t(pin_mask >> 8),
      uint8_t(pin_mask),
  };
  uint8_t reg = enable ? SEESAW_GPIO_PULLENSET : SEESAW_GPIO_PULLENCLR;
  return this->write_register(SEESAW_GPIO, reg, data, 4);
}

bool SeesawComponent::gpio_digital_write(uint8_t pin, bool value) {
  uint32_t pin_mask = 1UL << pin;
  uint8_t data[4] = {
      uint8_t(pin_mask >> 24),
      uint8_t(pin_mask >> 16),
      uint8_t(pin_mask >> 8),
      uint8_t(pin_mask),
  };
  uint8_t reg = value ? SEESAW_GPIO_BULK_SET : SEESAW_GPIO_BULK_CLR;
  return this->write_register(SEESAW_GPIO, reg, data, 4);
}

bool SeesawComponent::gpio_digital_read(uint8_t pin, bool &value) {
  uint32_t values;
  if (!this->gpio_read_bulk(values)) {
    return false;
  }
  value = (values >> pin) & 1;
  return true;
}

bool SeesawComponent::gpio_read_bulk(uint32_t &values) {
  uint8_t data[4];
  if (!this->read_register(SEESAW_GPIO, SEESAW_GPIO_BULK, data, 4)) {
    return false;
  }
  values = (uint32_t(data[0]) << 24) | (uint32_t(data[1]) << 16) | (uint32_t(data[2]) << 8) | uint32_t(data[3]);
  return true;
}

}  // namespace seesaw
}  // namespace esphome
```

**Step 2: Commit**

```bash
git add components/seesaw/seesaw.cpp
git commit -m "feat(seesaw): add hub component C++ implementation"
```

---

## Task 5: Test Hub Component

**Files:**
- Modify: `/Users/mike/Workspace/esp/camel-pad/pad/esphome.yaml`

**Step 1: Update esphome.yaml to use external component**

Add to the top of `pad/esphome.yaml` (after `esphome:` block):
```yaml
external_components:
  - source:
      type: local
      path: ../components
```

Replace the existing `i2c_device:` block with:
```yaml
seesaw:
  id: my_seesaw
  address: 0x49
```

**Step 2: Validate configuration**

```bash
cd /Users/mike/Workspace/esp/camel-pad/pad
esphome config esphome.yaml
```
Expected: Configuration validates without errors

**Step 3: Compile (optional, if device available)**

```bash
esphome compile esphome.yaml
```
Expected: Compiles successfully

**Step 4: Commit test config changes**

```bash
git add pad/esphome.yaml
git commit -m "test(seesaw): add hub component to test config"
```

---

## Task 6: GPIO Output Sub-Component - Python

**Files:**
- Create: `components/seesaw/output/__init__.py`

**Step 1: Create output Python module**

Create `components/seesaw/output/__init__.py`:
```python
import esphome.codegen as cg
from esphome.components import output
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_PIN

from .. import CONF_SEESAW_ID, SeesawComponent, seesaw_ns

DEPENDENCIES = ["seesaw"]

SeesawOutput = seesaw_ns.class_("SeesawOutput", output.BinaryOutput, cg.Component)

CONFIG_SCHEMA = output.BINARY_OUTPUT_SCHEMA.extend(
    {
        cv.Required(CONF_ID): cv.declare_id(SeesawOutput),
        cv.GenerateID(CONF_SEESAW_ID): cv.use_id(SeesawComponent),
        cv.Required(CONF_PIN): cv.int_range(min=0, max=20),
    }
).extend(cv.COMPONENT_SCHEMA)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await output.register_output(var, config)

    parent = await cg.get_variable(config[CONF_SEESAW_ID])
    cg.add(var.set_parent(parent))
    cg.add(var.set_pin(config[CONF_PIN]))
```

**Step 2: Commit**

```bash
git add components/seesaw/output/
git commit -m "feat(seesaw): add GPIO output sub-component Python schema"
```

---

## Task 7: GPIO Output Sub-Component - C++

**Files:**
- Create: `components/seesaw/output/seesaw_output.h`
- Create: `components/seesaw/output/seesaw_output.cpp`

**Step 1: Create C++ header**

Create `components/seesaw/output/seesaw_output.h`:
```cpp
#pragma once

#include "esphome/core/component.h"
#include "esphome/components/output/binary_output.h"
#include "../seesaw.h"

namespace esphome {
namespace seesaw {

class SeesawOutput : public output::BinaryOutput, public Component {
 public:
  void setup() override;
  void dump_config() override;

  void set_parent(SeesawComponent *parent) { this->parent_ = parent; }
  void set_pin(uint8_t pin) { this->pin_ = pin; }

 protected:
  void write_state(bool state) override;

  SeesawComponent *parent_;
  uint8_t pin_;
};

}  // namespace seesaw
}  // namespace esphome
```

**Step 2: Create C++ implementation**

Create `components/seesaw/output/seesaw_output.cpp`:
```cpp
#include "seesaw_output.h"
#include "esphome/core/log.h"

namespace esphome {
namespace seesaw {

static const char *const TAG = "seesaw.output";

void SeesawOutput::setup() {
  ESP_LOGCONFIG(TAG, "Setting up Seesaw Output pin %d...", this->pin_);
  this->parent_->gpio_set_pin_mode(this->pin_, true);
}

void SeesawOutput::dump_config() {
  ESP_LOGCONFIG(TAG, "Seesaw Output:");
  ESP_LOGCONFIG(TAG, "  Pin: %d", this->pin_);
}

void SeesawOutput::write_state(bool state) {
  this->parent_->gpio_digital_write(this->pin_, state);
}

}  // namespace seesaw
}  // namespace esphome
```

**Step 3: Commit**

```bash
git add components/seesaw/output/
git commit -m "feat(seesaw): add GPIO output sub-component C++ implementation"
```

---

## Task 8: GPIO Binary Sensor Sub-Component - Python

**Files:**
- Create: `components/seesaw/binary_sensor/__init__.py`

**Step 1: Create binary_sensor Python module**

Create `components/seesaw/binary_sensor/__init__.py`:
```python
import esphome.codegen as cg
from esphome.components import binary_sensor
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_PIN

from .. import CONF_SEESAW_ID, SeesawComponent, seesaw_ns

DEPENDENCIES = ["seesaw"]

CONF_PULLUP = "pullup"

SeesawBinarySensor = seesaw_ns.class_(
    "SeesawBinarySensor", binary_sensor.BinarySensor, cg.PollingComponent
)

CONFIG_SCHEMA = (
    binary_sensor.binary_sensor_schema(SeesawBinarySensor)
    .extend(
        {
            cv.GenerateID(CONF_SEESAW_ID): cv.use_id(SeesawComponent),
            cv.Required(CONF_PIN): cv.int_range(min=0, max=20),
            cv.Optional(CONF_PULLUP, default=True): cv.boolean,
        }
    )
    .extend(cv.polling_component_schema("60ms"))
)


async def to_code(config):
    var = await binary_sensor.new_binary_sensor(config)
    await cg.register_component(var, config)

    parent = await cg.get_variable(config[CONF_SEESAW_ID])
    cg.add(var.set_parent(parent))
    cg.add(var.set_pin(config[CONF_PIN]))
    cg.add(var.set_pullup(config[CONF_PULLUP]))
```

**Step 2: Commit**

```bash
git add components/seesaw/binary_sensor/
git commit -m "feat(seesaw): add GPIO binary sensor sub-component Python schema"
```

---

## Task 9: GPIO Binary Sensor Sub-Component - C++

**Files:**
- Create: `components/seesaw/binary_sensor/seesaw_binary_sensor.h`
- Create: `components/seesaw/binary_sensor/seesaw_binary_sensor.cpp`

**Step 1: Create C++ header**

Create `components/seesaw/binary_sensor/seesaw_binary_sensor.h`:
```cpp
#pragma once

#include "esphome/core/component.h"
#include "esphome/components/binary_sensor/binary_sensor.h"
#include "../seesaw.h"

namespace esphome {
namespace seesaw {

class SeesawBinarySensor : public binary_sensor::BinarySensor, public PollingComponent {
 public:
  void setup() override;
  void update() override;
  void dump_config() override;

  void set_parent(SeesawComponent *parent) { this->parent_ = parent; }
  void set_pin(uint8_t pin) { this->pin_ = pin; }
  void set_pullup(bool pullup) { this->pullup_ = pullup; }

 protected:
  SeesawComponent *parent_;
  uint8_t pin_;
  bool pullup_{true};
};

}  // namespace seesaw
}  // namespace esphome
```

**Step 2: Create C++ implementation**

Create `components/seesaw/binary_sensor/seesaw_binary_sensor.cpp`:
```cpp
#include "seesaw_binary_sensor.h"
#include "esphome/core/log.h"

namespace esphome {
namespace seesaw {

static const char *const TAG = "seesaw.binary_sensor";

void SeesawBinarySensor::setup() {
  ESP_LOGCONFIG(TAG, "Setting up Seesaw Binary Sensor pin %d...", this->pin_);
  this->parent_->gpio_set_pin_mode(this->pin_, false);  // Input
  if (this->pullup_) {
    this->parent_->gpio_set_pullup(this->pin_, true);
  }
}

void SeesawBinarySensor::update() {
  bool value;
  if (this->parent_->gpio_digital_read(this->pin_, value)) {
    this->publish_state(value);
  }
}

void SeesawBinarySensor::dump_config() {
  LOG_BINARY_SENSOR("", "Seesaw Binary Sensor", this);
  ESP_LOGCONFIG(TAG, "  Pin: %d", this->pin_);
  ESP_LOGCONFIG(TAG, "  Pullup: %s", YESNO(this->pullup_));
}

}  // namespace seesaw
}  // namespace esphome
```

**Step 3: Commit**

```bash
git add components/seesaw/binary_sensor/
git commit -m "feat(seesaw): add GPIO binary sensor sub-component C++ implementation"
```

---

## Task 10: Test GPIO Components

**Files:**
- Modify: `/Users/mike/Workspace/esp/camel-pad/pad/esphome.yaml`

**Step 1: Add GPIO test configuration**

Add to `pad/esphome.yaml`:
```yaml
binary_sensor:
  - platform: seesaw
    seesaw_id: my_seesaw
    pin: 4
    name: "Seesaw Button"
    pullup: true

output:
  - platform: seesaw
    seesaw_id: my_seesaw
    pin: 5
    id: seesaw_led

switch:
  - platform: output
    name: "Seesaw LED"
    output: seesaw_led
```

**Step 2: Validate configuration**

```bash
cd /Users/mike/Workspace/esp/camel-pad/pad
esphome config esphome.yaml
```
Expected: Configuration validates without errors

**Step 3: Compile**

```bash
esphome compile esphome.yaml
```
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add pad/esphome.yaml
git commit -m "test(seesaw): add GPIO components to test config"
```

---

## Task 11: Keypad Sub-Component - Python

**Files:**
- Create: `components/seesaw/keypad/__init__.py`

**Step 1: Create keypad Python module**

Create `components/seesaw/keypad/__init__.py`:
```python
import esphome.codegen as cg
from esphome import automation
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_TRIGGER_ID

from .. import CONF_SEESAW_ID, SeesawComponent, seesaw_ns

DEPENDENCIES = ["seesaw"]

CONF_ON_KEY_EVENT = "on_key_event"

seesaw_keypad_ns = seesaw_ns.namespace("keypad")
SeesawKeypad = seesaw_keypad_ns.class_("SeesawKeypad", cg.PollingComponent)
KeyEvent = seesaw_keypad_ns.struct("KeyEvent")
KeyEventTrigger = seesaw_keypad_ns.class_(
    "KeyEventTrigger", automation.Trigger.template(KeyEvent)
)

CONFIG_SCHEMA = (
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(SeesawKeypad),
            cv.GenerateID(CONF_SEESAW_ID): cv.use_id(SeesawComponent),
            cv.Optional(CONF_ON_KEY_EVENT): automation.validate_automation(
                {
                    cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(KeyEventTrigger),
                }
            ),
        }
    )
    .extend(cv.polling_component_schema("10ms"))
    .extend(cv.COMPONENT_SCHEMA)
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    parent = await cg.get_variable(config[CONF_SEESAW_ID])
    cg.add(var.set_parent(parent))

    for conf in config.get(CONF_ON_KEY_EVENT, []):
        trigger = cg.new_Pvariable(conf[CONF_TRIGGER_ID], var)
        await automation.build_automation(trigger, [(KeyEvent, "x")], conf)
```

**Step 2: Commit**

```bash
git add components/seesaw/keypad/
git commit -m "feat(seesaw): add keypad sub-component Python schema"
```

---

## Task 12: Keypad Sub-Component - C++

**Files:**
- Create: `components/seesaw/keypad/seesaw_keypad.h`
- Create: `components/seesaw/keypad/seesaw_keypad.cpp`

**Step 1: Create C++ header**

Create `components/seesaw/keypad/seesaw_keypad.h`:
```cpp
#pragma once

#include "esphome/core/component.h"
#include "esphome/core/automation.h"
#include "../seesaw.h"

namespace esphome {
namespace seesaw {
namespace keypad {

// Keypad module registers
enum SeesawKeypadReg : uint8_t {
  SEESAW_KEYPAD_STATUS = 0x00,
  SEESAW_KEYPAD_EVENT = 0x01,
  SEESAW_KEYPAD_INTENSET = 0x02,
  SEESAW_KEYPAD_INTENCLR = 0x03,
  SEESAW_KEYPAD_COUNT = 0x04,
  SEESAW_KEYPAD_FIFO = 0x10,
};

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

class SeesawKeypad;

class KeyEventTrigger : public Trigger<KeyEvent> {
 public:
  explicit KeyEventTrigger(SeesawKeypad *parent);
};

class SeesawKeypad : public PollingComponent {
 public:
  void setup() override;
  void update() override;
  void dump_config() override;

  void set_parent(SeesawComponent *parent) { this->parent_ = parent; }
  void add_on_key_event_callback(std::function<void(KeyEvent)> &&callback) {
    this->key_event_callback_.add(std::move(callback));
  }

 protected:
  void read_fifo_();

  SeesawComponent *parent_;
  CallbackManager<void(KeyEvent)> key_event_callback_;
};

}  // namespace keypad
}  // namespace seesaw
}  // namespace esphome
```

**Step 2: Create C++ implementation**

Create `components/seesaw/keypad/seesaw_keypad.cpp`:
```cpp
#include "seesaw_keypad.h"
#include "esphome/core/log.h"

namespace esphome {
namespace seesaw {
namespace keypad {

static const char *const TAG = "seesaw.keypad";

KeyEventTrigger::KeyEventTrigger(SeesawKeypad *parent) {
  parent->add_on_key_event_callback([this](KeyEvent event) { this->trigger(event); });
}

void SeesawKeypad::setup() {
  ESP_LOGCONFIG(TAG, "Setting up Seesaw Keypad...");
  // Enable all key events by writing to event register
  // Each bit enables events for that key
  // For now, enable all keys (0xFF for 8 keys)
  uint8_t enable_data = 0xFF;
  this->parent_->write_register(SEESAW_KEYPAD, SEESAW_KEYPAD_EVENT, &enable_data, 1);
}

void SeesawKeypad::update() {
  this->read_fifo_();
}

void SeesawKeypad::dump_config() {
  ESP_LOGCONFIG(TAG, "Seesaw Keypad:");
  ESP_LOGCONFIG(TAG, "  Update interval: %dms", this->get_update_interval());
}

void SeesawKeypad::read_fifo_() {
  // Read number of events in FIFO
  uint8_t count;
  if (!this->parent_->read_register(SEESAW_KEYPAD, SEESAW_KEYPAD_COUNT, &count, 1)) {
    return;
  }

  if (count == 0) {
    return;
  }

  // Read events from FIFO
  // Each event is 1 byte: [key_number:6][edge:2]
  uint8_t events[count];
  if (!this->parent_->read_register(SEESAW_KEYPAD, SEESAW_KEYPAD_FIFO, events, count)) {
    return;
  }

  for (uint8_t i = 0; i < count; i++) {
    KeyEvent event;
    event.key = events[i] & 0x3F;  // Lower 6 bits
    event.edge = static_cast<KeyEdge>((events[i] >> 6) & 0x03);  // Upper 2 bits

    ESP_LOGD(TAG, "Key event: key=%d edge=%d", event.key, event.edge);
    this->key_event_callback_.call(event);
  }
}

}  // namespace keypad
}  // namespace seesaw
}  // namespace esphome
```

**Step 3: Commit**

```bash
git add components/seesaw/keypad/
git commit -m "feat(seesaw): add keypad sub-component C++ implementation"
```

---

## Task 13: NeoPixel Sub-Component - Python

**Files:**
- Create: `components/seesaw/light/__init__.py`

**Step 1: Create light Python module**

Create `components/seesaw/light/__init__.py`:
```python
import esphome.codegen as cg
from esphome.components import light
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_NUM_LEDS, CONF_OUTPUT_ID, CONF_PIN

from .. import CONF_SEESAW_ID, SeesawComponent, seesaw_ns

DEPENDENCIES = ["seesaw"]

CONF_COLOR_ORDER = "color_order"

seesaw_neopixel_ns = seesaw_ns.namespace("neopixel")
SeesawNeopixelLight = seesaw_neopixel_ns.class_("SeesawNeopixelLight", light.AddressableLight)

ColorOrder = seesaw_neopixel_ns.enum("ColorOrder")
COLOR_ORDERS = {
    "RGB": ColorOrder.COLOR_ORDER_RGB,
    "RBG": ColorOrder.COLOR_ORDER_RBG,
    "GRB": ColorOrder.COLOR_ORDER_GRB,
    "GBR": ColorOrder.COLOR_ORDER_GBR,
    "BRG": ColorOrder.COLOR_ORDER_BRG,
    "BGR": ColorOrder.COLOR_ORDER_BGR,
}

CONFIG_SCHEMA = light.ADDRESSABLE_LIGHT_SCHEMA.extend(
    {
        cv.GenerateID(CONF_OUTPUT_ID): cv.declare_id(SeesawNeopixelLight),
        cv.GenerateID(CONF_SEESAW_ID): cv.use_id(SeesawComponent),
        cv.Required(CONF_PIN): cv.int_range(min=0, max=20),
        cv.Required(CONF_NUM_LEDS): cv.positive_not_null_int,
        cv.Optional(CONF_COLOR_ORDER, default="GRB"): cv.enum(COLOR_ORDERS, upper=True),
    }
).extend(cv.COMPONENT_SCHEMA)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_OUTPUT_ID])
    await light.register_light(var, config)
    await cg.register_component(var, config)

    parent = await cg.get_variable(config[CONF_SEESAW_ID])
    cg.add(var.set_parent(parent))
    cg.add(var.set_pin(config[CONF_PIN]))
    cg.add(var.set_num_leds(config[CONF_NUM_LEDS]))
    cg.add(var.set_color_order(config[CONF_COLOR_ORDER]))
```

**Step 2: Commit**

```bash
git add components/seesaw/light/
git commit -m "feat(seesaw): add NeoPixel light sub-component Python schema"
```

---

## Task 14: NeoPixel Sub-Component - C++ Header

**Files:**
- Create: `components/seesaw/light/seesaw_neopixel.h`

**Step 1: Create C++ header**

Create `components/seesaw/light/seesaw_neopixel.h`:
```cpp
#pragma once

#include "esphome/core/component.h"
#include "esphome/components/light/addressable_light.h"
#include "../seesaw.h"

namespace esphome {
namespace seesaw {
namespace neopixel {

// NeoPixel module registers
enum SeesawNeopixelReg : uint8_t {
  SEESAW_NEOPIXEL_STATUS = 0x00,
  SEESAW_NEOPIXEL_PIN = 0x01,
  SEESAW_NEOPIXEL_SPEED = 0x02,
  SEESAW_NEOPIXEL_BUF_LENGTH = 0x03,
  SEESAW_NEOPIXEL_BUF = 0x04,
  SEESAW_NEOPIXEL_SHOW = 0x05,
};

enum ColorOrder : uint8_t {
  COLOR_ORDER_RGB = 0,
  COLOR_ORDER_RBG = 1,
  COLOR_ORDER_GRB = 2,
  COLOR_ORDER_GBR = 3,
  COLOR_ORDER_BRG = 4,
  COLOR_ORDER_BGR = 5,
};

class SeesawNeopixelLight : public light::AddressableLight {
 public:
  void setup() override;
  void dump_config() override;
  float get_setup_priority() const override { return setup_priority::HARDWARE; }

  // AddressableLight interface
  int32_t size() const override { return this->num_leds_; }
  light::LightTraits get_traits() override;
  void write_state(light::LightState *state) override;
  void clear_effect_data() override;

  // Configuration setters
  void set_parent(SeesawComponent *parent) { this->parent_ = parent; }
  void set_pin(uint8_t pin) { this->pin_ = pin; }
  void set_num_leds(uint16_t num) { this->num_leds_ = num; }
  void set_color_order(ColorOrder order) { this->color_order_ = order; }

  // Raw API for direct pixel control
  void set_pixel(uint16_t index, uint8_t r, uint8_t g, uint8_t b);
  void show();
  void clear();

 protected:
  light::ESPColorView get_view_internal(int32_t index) const override;
  void send_buffer_();
  void reorder_color_(uint8_t r, uint8_t g, uint8_t b, uint8_t *out) const;

  SeesawComponent *parent_;
  uint8_t pin_;
  uint16_t num_leds_;
  ColorOrder color_order_{COLOR_ORDER_GRB};
  std::unique_ptr<uint8_t[]> buffer_;
  uint8_t *effect_data_{nullptr};
};

}  // namespace neopixel
}  // namespace seesaw
}  // namespace esphome
```

**Step 2: Commit**

```bash
git add components/seesaw/light/seesaw_neopixel.h
git commit -m "feat(seesaw): add NeoPixel light sub-component C++ header"
```

---

## Task 15: NeoPixel Sub-Component - C++ Implementation

**Files:**
- Create: `components/seesaw/light/seesaw_neopixel.cpp`

**Step 1: Create C++ implementation**

Create `components/seesaw/light/seesaw_neopixel.cpp`:
```cpp
#include "seesaw_neopixel.h"
#include "esphome/core/log.h"

namespace esphome {
namespace seesaw {
namespace neopixel {

static const char *const TAG = "seesaw.neopixel";

void SeesawNeopixelLight::setup() {
  ESP_LOGCONFIG(TAG, "Setting up Seesaw NeoPixel...");

  // Allocate buffer (3 bytes per pixel for RGB)
  size_t buffer_size = this->num_leds_ * 3;
  this->buffer_ = std::make_unique<uint8_t[]>(buffer_size);
  memset(this->buffer_.get(), 0, buffer_size);

  // Set NeoPixel pin
  this->parent_->write_register(SEESAW_NEOPIXEL, SEESAW_NEOPIXEL_PIN, &this->pin_, 1);

  // Set speed to 800KHz
  uint8_t speed = 1;
  this->parent_->write_register(SEESAW_NEOPIXEL, SEESAW_NEOPIXEL_SPEED, &speed, 1);

  // Set buffer length
  uint8_t len_data[2] = {
      uint8_t(buffer_size >> 8),
      uint8_t(buffer_size & 0xFF),
  };
  this->parent_->write_register(SEESAW_NEOPIXEL, SEESAW_NEOPIXEL_BUF_LENGTH, len_data, 2);

  // Clear all pixels
  this->clear();
  this->show();
}

void SeesawNeopixelLight::dump_config() {
  ESP_LOGCONFIG(TAG, "Seesaw NeoPixel:");
  ESP_LOGCONFIG(TAG, "  Pin: %d", this->pin_);
  ESP_LOGCONFIG(TAG, "  Num LEDs: %d", this->num_leds_);
  ESP_LOGCONFIG(TAG, "  Color Order: %d", this->color_order_);
}

light::LightTraits SeesawNeopixelLight::get_traits() {
  auto traits = light::LightTraits();
  traits.set_supported_color_modes({light::ColorMode::RGB});
  return traits;
}

void SeesawNeopixelLight::write_state(light::LightState *state) {
  this->send_buffer_();
  this->parent_->write_register(SEESAW_NEOPIXEL, SEESAW_NEOPIXEL_SHOW);
  this->mark_shown_();
}

void SeesawNeopixelLight::clear_effect_data() {
  for (int i = 0; i < this->size(); i++) {
    this->effect_data_[i] = 0;
  }
}

light::ESPColorView SeesawNeopixelLight::get_view_internal(int32_t index) const {
  size_t offset = index * 3;
  uint8_t *base = this->buffer_.get() + offset;

  // Map based on color order
  uint8_t *r, *g, *b;
  switch (this->color_order_) {
    case COLOR_ORDER_RGB:
      r = base + 0; g = base + 1; b = base + 2;
      break;
    case COLOR_ORDER_RBG:
      r = base + 0; g = base + 2; b = base + 1;
      break;
    case COLOR_ORDER_GRB:
      r = base + 1; g = base + 0; b = base + 2;
      break;
    case COLOR_ORDER_GBR:
      r = base + 2; g = base + 0; b = base + 1;
      break;
    case COLOR_ORDER_BRG:
      r = base + 1; g = base + 2; b = base + 0;
      break;
    case COLOR_ORDER_BGR:
      r = base + 2; g = base + 1; b = base + 0;
      break;
    default:
      r = base + 1; g = base + 0; b = base + 2;  // GRB default
      break;
  }

  return light::ESPColorView(r, g, b, nullptr, this->effect_data_ + index, &this->correction_);
}

void SeesawNeopixelLight::set_pixel(uint16_t index, uint8_t r, uint8_t g, uint8_t b) {
  if (index >= this->num_leds_) {
    return;
  }
  auto view = this->get_view_internal(index);
  view.set_red(r);
  view.set_green(g);
  view.set_blue(b);
}

void SeesawNeopixelLight::show() {
  this->send_buffer_();
  this->parent_->write_register(SEESAW_NEOPIXEL, SEESAW_NEOPIXEL_SHOW);
}

void SeesawNeopixelLight::clear() {
  size_t buffer_size = this->num_leds_ * 3;
  memset(this->buffer_.get(), 0, buffer_size);
}

void SeesawNeopixelLight::send_buffer_() {
  // Send buffer in chunks (max ~30 bytes per I2C transaction for safety)
  const size_t chunk_size = 24;  // 8 pixels per chunk
  size_t buffer_size = this->num_leds_ * 3;

  for (size_t offset = 0; offset < buffer_size; offset += chunk_size) {
    size_t remaining = buffer_size - offset;
    size_t to_send = std::min(remaining, chunk_size);

    // Data format: [offset_hi, offset_lo, pixel_data...]
    uint8_t data[2 + chunk_size];
    data[0] = offset >> 8;
    data[1] = offset & 0xFF;
    memcpy(data + 2, this->buffer_.get() + offset, to_send);

    this->parent_->write_register(SEESAW_NEOPIXEL, SEESAW_NEOPIXEL_BUF, data, 2 + to_send);
  }
}

}  // namespace neopixel
}  // namespace seesaw
}  // namespace esphome
```

**Step 2: Commit**

```bash
git add components/seesaw/light/seesaw_neopixel.cpp
git commit -m "feat(seesaw): add NeoPixel light sub-component C++ implementation"
```

---

## Task 16: Final Integration Test

**Files:**
- Modify: `/Users/mike/Workspace/esp/camel-pad/pad/esphome.yaml`

**Step 1: Add full test configuration**

Update `pad/esphome.yaml` with complete seesaw configuration:
```yaml
seesaw_keypad:
  seesaw_id: my_seesaw
  on_key_event:
    - logger.log:
        format: "Seesaw key %d edge %d"
        args: ["x.key", "x.edge"]

light:
  - platform: seesaw_neopixel
    seesaw_id: my_seesaw
    pin: 6
    num_leds: 4
    color_order: GRB
    name: "Seesaw LEDs"
    id: seesaw_leds
```

**Step 2: Validate configuration**

```bash
cd /Users/mike/Workspace/esp/camel-pad/pad
esphome config esphome.yaml
```
Expected: Configuration validates without errors

**Step 3: Compile**

```bash
esphome compile esphome.yaml
```
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add pad/esphome.yaml
git commit -m "test(seesaw): add full integration test config"
```

---

## Task 17: Push to GitHub

**Step 1: Add remote and push**

```bash
cd /Users/mike/Workspace/esp/camel-pad
git remote add seesaw-origin https://github.com/pleimann/esphome-adafruit-seesaw.git || true
git subtree push --prefix=components/seesaw seesaw-origin main
```

Or if you want to maintain it as a separate repo:

```bash
cd /Users/mike/Workspace/esp/camel-pad/components/seesaw
git init
git remote add origin https://github.com/pleimann/esphome-adafruit-seesaw.git
git add .
git commit -m "feat: initial seesaw component release"
git branch -M main
git push -u origin main
```

**Step 2: Verify on GitHub**

Visit https://github.com/pleimann/esphome-adafruit-seesaw to confirm files are uploaded.

---

## Summary

This plan creates an ESPHome external component with:

1. **Hub component** - I2C communication with Seesaw devices
2. **GPIO output** - Digital output pins via `output:` platform
3. **GPIO binary sensor** - Digital input pins via `binary_sensor:` platform
4. **Keypad** - Raw event stream via `seesaw_keypad:` component
5. **NeoPixel** - Addressable LEDs via `light:` platform

Total: 17 tasks with incremental commits and testing at each stage.

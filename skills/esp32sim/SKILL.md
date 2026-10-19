---
name: esp32sim
description: Run, test, and debug ESP32/ESP32-S3/C3/C6 firmware in a local emulator without physical hardware or cloud tokens. Use whenever writing, compiling, simulating, or testing ESP32 C/C++ or Arduino firmware, validating UART logs, simulating button presses, or diagnosing panics and crashes.
---

# ESP32 Emulated Firmware Development & Testing

`esp32sim-mcp` equips coding agents with the power to boot, test, and debug ESP32 firmware locally in an instruction-level emulator (`esp32sim`). It runs the actual mask ROM, secondary bootloader, FreeRTOS, and unmodified applications.

## The TDD Embedded Loop

When tasked with building or testing an ESP32 feature, follow this loop:

```
┌────────────────────────────────────────────────────────┐
│ 1. Write / Update Firmware Code                        │
│    (main/main.c, components, CMakeLists.txt)           │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Compile with ESP-IDF                                │
│    `idf.py build` (creates build/flasher_args.json)    │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Run Simulation & Assert UART with `sim_expect`      │
│    Check boot sequence, Wi-Fi join, HTTP/MQTT response │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Diagnose Failures & Crashes                         │
│    Guru Meditation, Stack Overflow, Assert, Heap leak  │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 5. Fix Code and Re-run Simulation                      │
└────────────────────────────────────────────────────────┘
```

Other build systems (PlatformIO, Arduino): pass `appBin`, `bootloaderBin` and `ptableBin` explicitly instead of `projectDir`.

## Building the Firmware

Pick the first option that works; check before you build:

1. **Local ESP-IDF.** If `idf.py --version` works (or `$IDF_PATH` is set: run `. "$IDF_PATH/export.sh"` first), use it directly.
2. **Docker, when ESP-IDF is not installed.** If `docker info` succeeds, build with Espressif's official image instead of installing ESP-IDF. Run from the project root:
   ```bash
   docker run --rm -v "$PWD:/project" -w /project espressif/idf:v5.5.4 idf.py set-target esp32s3 build
   ```
   - `set-target` is needed only the first time or when changing chip (it wipes `build/`); afterwards run `idf.py build` the same way. Use the chip the user targets: `esp32`, `esp32s3`, `esp32c3`, `esp32c6`.
   - On Linux add `-u "$(id -u):$(id -g)" -e HOME=/tmp` so `build/` is not owned by root. Not needed on macOS or Windows.
   - The first run pulls a multi-GB image once; tell the user it is downloading. Later builds take seconds to a couple of minutes.
   - If the project pins another ESP-IDF version (the `ESP-IDF` line at the top of `sdkconfig`, or `idf` in `dependencies.lock`), use the matching `espressif/idf:vX.Y.Z` tag.
   - The output lands in the project's `build/` as usual, so `sim_*` tools find it through `projectDir`.
3. **Neither available.** Do not install ESP-IDF on your own initiative: it downloads several GB and takes a long time. Tell the user, and offer Docker Desktop or the ESP-IDF installer, and let them choose.

## Available MCP Tools

### 1. `sim_run`
Boots the firmware in `esp32sim` and returns UART console logs, duration, stop reason, and any detected panics.
- **Parameters:**
  - `projectDir`: Root directory of the ESP-IDF project (defaults to workspace). Automatically locates `build/flasher_args.json` and `.bin` files!
  - `chip`: `'s3'` (default), `'c3'`, `'c6'`, or `'esp32'`.
  - `board`: Board model: `'atech14'` (S3 default), `'waveshare-lcd4b'`, `'waveshare-amoled18-v2'`, `'waveshare-cam'`, `'waveshare-c6-lcd147'` (C6), `'ttgo-tdisplay'` (ESP32), or `'none'` for a bare module (stock ESP-IDF examples). Omit it on the C3. Use `sim_list_boards` for details.
  - `maxSeconds`: Emulated seconds limit (default `10`). Emulation usually runs faster than real time.
  - `wifi`: Attach a virtual access point with DHCP/DNS/NAT, e.g. `'ssid=demo,psk=secret'` (a bare SSID means an open network). The station gets `10.0.2.15`. Also accepted by `sim_expect` and `sim_script`.
  - `console`: `'both'` by default (UART0 + USB-Serial/JTAG), so output is captured whichever console the project uses. Lines ESP-IDF mirrors on both consoles are shown once; pass `'uart0'` or `'usb'` to see a single console.
  - `stopAfterExceptions`: Leave unset. It counts *every* CPU exception, including the window overflows Xtensa code takes constantly, so `1` stops before the bootloader. Panics are detected from the log anyway.

### 2. `sim_expect` (Recommended for Tests)
Runs firmware and asserts that specified strings or regexes appear on the UART output.
- **Parameters:**
  - `patterns`: Array of expected console output. Plain text matches as a substring of a line (`"Counter: 5"`); a regular expression goes between slashes (`"/Counter: \\d+/"`, `"/got ip/i"`). Required: an empty list is an error.
  - `ordered`: If `true` (default), patterns must appear in chronological order.
  - Returns: Pass/Fail status, line numbers, matched text, and diagnostics for missing lines.

### 3. `sim_script`
Simulates hardware interactions at specific timestamps:
- **Events:**
  - `press`: Hold button down (e.g. `{ time: 1.5, action: "press", target: "btn1", durationMs: 150 }`).
  - `knob`: Rotate encoder (e.g. `{ time: 2.0, action: "knob", direction: "cw", steps: 2 }`).
  - `release`: Release a button or GPIO (e.g. `{ time: 2.0, action: "release", target: "16" }`).
  - `gpio`: Drive a pin level (e.g. `{ time: 2.5, action: "gpio", pin: 17, level: 0 }`).
  - `uart`: Push one line into UART0's receive FIFO, or UART1 with `port: 1` (e.g. `{ time: 3.0, action: "uart", data: "PING" }`). Use this for firmware reading UART0 with `uart_read_bytes`.
  - `serial`: Send text into the USB-Serial/JTAG console instead (e.g. `{ time: 3.0, action: "serial", data: "PING" }`).
  - `touch`: Touch panel press at (x, y); `down: false` releases (e.g. `{ time: 4.5, action: "touch", x: 450, y: 30 }`).
  - `stop`: Terminate simulation early (e.g. `{ time: 5.0, action: "stop" }`).

### 4. `sim_screenshot`
Captures virtual display buffer for boards with LCD/TFT/AMOLED (ST7735, ST7789, ST7701S, CO5300).
- **Parameters:**
  - `board`: `'atech14'` (160x80 ST7735), `'waveshare-lcd4b'` (480x480), `'waveshare-amoled18-v2'` (368x448), `'waveshare-c6-lcd147'` (172x320), `'ttgo-tdisplay'` (135x240).
  - `timeSeconds`: Emulated second to take snapshot.
  - Returns embedded PNG data and file path.

### 5. `sim_list_boards`
Lists all supported chips, boards, CPU architectures, display resolutions, and buttons.

### 6. `sim_doctor`
Checks if `esp32sim` is available, reports host architecture, and offers setup tips.

## Diagnosing Common ESP-IDF Crashes

When `sim_run` or `sim_expect` flags a crash:

1. **Guru Meditation Error: LoadProhibited / StoreProhibited**
   - Cause: Null pointer dereference or invalid memory access.
   - Solution: Check pointer initialization before dereferencing; verify buffer bounds.

2. **Stack overflow in task `<TaskName>`**
   - Cause: Task stack size allocated in `xTaskCreate` is too small for local buffers or printf.
   - Solution: Increase task stack depth (e.g., from `2048` to `4096` bytes).

3. **CORRUPT HEAP: multi_heap.c**
   - Cause: Buffer overflow / memory corruption writing past allocated `malloc` block.
   - Solution: Review string formatting (`snprintf`), array indexing, and free() calls.

4. **assert failed: `<expression>`**
   - The emulator captures the exact file and line number of the failing assertion in the UART output.

## CLI Commands for CI / Terminal

The same commands can be executed via terminal:
```bash
# Run simulation
esp32sim-mcp run --chip s3 --max-seconds 5

# Automated test with assertions (exits 0 on success, 1 on fail)
esp32sim-mcp expect --pattern "Hello world!" "WiFi initialized"

# Check environment health
esp32sim-mcp doctor
```

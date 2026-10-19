# Contributing

Thanks for helping. Bug reports, board/peripheral coverage and fixes to the agent skill are all welcome.

## Setup

```bash
git clone https://github.com/stramanu/esp32sim-mcp.git
cd esp32sim-mcp
npm ci
npm test        # unit tests; real-emulator tests skip if esp32sim is missing
```

Node.js 22+ is required.

## Running the real-emulator tests

The end-to-end tests boot firmware in [esp32sim](https://github.com/mikroverk/esp32sim). To run them locally:

```bash
cargo install --locked --git https://github.com/mikroverk/esp32sim --rev f535f3b42293a76ab64c231a0425f35857ab6cf1 esp32sim   # or set ESP32SIM_PATH
node dist/cli/index.js fetch-roms                                    # after npm run build
```

The test that runs `examples/hello-esp32` from source also needs an ESP-IDF build of it. Without a local ESP-IDF, Docker works:

```bash
docker run --rm -v "$PWD/examples/hello-esp32:/project" -w /project \
  espressif/idf:v5.5.4 idf.py set-target esp32s3 build
```

`ESP32SIM_REQUIRE_E2E=1 npm test` turns a missing emulator, ROM or example build into a failure instead of a skip. CI runs that way, with the prebuilt emulator `setup` installs. To move to a newer esp32sim:

1. Bump `ESP32SIM_REF` in `emulator.yml` and `ESP32SIM_TESTED_REV` in `src/core/binary.ts` (a test checks they match).
2. Run the **Emulator binaries** workflow; it publishes the release `esp32sim-<rev>`.
3. Copy the SHA-256 of each archive (its `.sha256` asset) into `EMULATOR_ASSETS` in `src/core/emulator.ts`.

## Guidelines

- Keep the wrapper faithful to esp32sim's CLI (`docs/cli.md` upstream). If you add a flag, board or script action, check it against a real run and add a test.
- Behaviour an agent relies on (tool names, inputs, output shape) is the public API: change it deliberately and note it in `CHANGELOG.md`.
- Update `skills/esp32sim/SKILL.md` when tool behaviour changes; it is what agents read.
- Run `npm run lint && npm test` before opening a pull request.

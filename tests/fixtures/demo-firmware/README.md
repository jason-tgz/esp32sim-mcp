# Demo firmware fixtures

Byte-identical copies of images from [esp32sim](https://github.com/mikroverk/esp32sim)'s
`web/wasm/fw/public/` (commit f535f3b), MIT licensed:

- `hello*`, `c3-hello*`: ESP-IDF `hello_world`
- `atech-*`: the Atech board firmware by the esp32sim authors
- `s3-wifi*`: the WiFi station of esp32sim's `examples/c6-wifi-station`, built for the S3.
  It links ESP-IDF, Espressif's WiFi/PHY libraries, FreeRTOS, lwIP, Mbed TLS, wpa_supplicant and newlib;
  their licences are listed in `wifi-station-NOTICE.txt`.

They are test inputs only and are not part of the npm package.

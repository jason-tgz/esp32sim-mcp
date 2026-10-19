#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "driver/gpio.h"

static const char *TAG = "hello";

// btn1 on the emulator's default atech14 board (active low)
#define BUTTON_PIN GPIO_NUM_17

void app_main(void)
{
    ESP_LOGI(TAG, "Hello from esp32sim-mcp");

    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << BUTTON_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);
    ESP_LOGI(TAG, "Waiting for button presses");

    int presses = 0;
    int last = 1;
    for (int tick = 0; tick < 100; tick++) {  // 5 s at 50 ms
        int level = gpio_get_level(BUTTON_PIN);
        if (last == 1 && level == 0) {
            presses++;
            ESP_LOGI(TAG, "Button pressed (%d)", presses);
        }
        last = level;
        vTaskDelay(pdMS_TO_TICKS(50));
    }

    ESP_LOGI(TAG, "Done: %d presses", presses);
}

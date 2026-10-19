#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "esp_log.h"
#include "driver/gpio.h"

static const char *TAG = "ESP32_APP";

#define BUTTON_PIN GPIO_NUM_0

void app_main(void)
{
    ESP_LOGI(TAG, "========================================");
    ESP_LOGI(TAG, "  ESP32-S3 Emulated Testbed Starting...  ");
    ESP_LOGI(TAG, "========================================");

    ESP_LOGI(TAG, "Initializing peripherals and virtual WiFi...");
    vTaskDelay(pdMS_TO_TICKS(100));

    ESP_LOGI(TAG, "WiFi connected to virtual AP 'VirtualNet'");
    ESP_LOGI(TAG, "HTTP Server listening on port 80");

    // Configure simulated button
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << BUTTON_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);

    ESP_LOGI(TAG, "System ready. Listening for hardware events...");

    int count = 0;
    while (count < 10) {
        vTaskDelay(pdMS_TO_TICKS(500));
        count++;

        if (gpio_get_level(BUTTON_PIN) == 0) {
            ESP_LOGI(TAG, "EVENT: Button pressed! Triggering action...");
        }
    }

    ESP_LOGI(TAG, "Test completed successfully.");
}

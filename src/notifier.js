"use strict";

const axios = require("axios");
const moment = require("moment");

class TelegramNotifier {
  constructor(options) {
    this.botToken = options.botToken;
    this.chatId = options.chatId;
    this.debounceInterval = options.debounceInterval;
    this.notificationStartHour = options.notificationStartHour;
    this.notificationEndHour = options.notificationEndHour;
    this.isEnabled = options.isEnabled;

    this.lastSentTime = 0;
    this.pendingMessage = null;
    this.timeoutId = null;
  }

  withinNotificationWindow() {
    const hour = moment().hour();
    return (
      hour >= this.notificationStartHour && hour < this.notificationEndHour
    );
  }

  async send(message) {
    if (!this.isEnabled()) {
      return;
    }

    if (!this.withinNotificationWindow()) {
      return;
    }

    const now = Date.now();

    if (now - this.lastSentTime >= this.debounceInterval) {
      const didSend = await this.actuallySend(message);
      if (didSend) {
        this.lastSentTime = now;
      }
      return;
    }

    this.pendingMessage = message;

    if (!this.timeoutId) {
      const delay = this.debounceInterval - (now - this.lastSentTime);
      this.timeoutId = setTimeout(async () => {
        const didSend = await this.actuallySend(this.pendingMessage);
        if (didSend) {
          this.lastSentTime = Date.now();
        }
        this.pendingMessage = null;
        this.timeoutId = null;
      }, delay);
    }
  }

  async actuallySend(message) {
    if (!this.botToken || !this.chatId) {
      return false;
    }

    if (!this.isEnabled() || !this.withinNotificationWindow()) {
      return false;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: this.chatId,
        text: message,
      });
      return true;
    } catch (error) {
      console.error("Failed to send Telegram message:", error);
      return false;
    }
  }
}

module.exports = { TelegramNotifier };

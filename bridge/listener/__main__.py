"""Entry point para o listener Telegram."""

import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)

from listener.telegram_agent import TelegramAgent

if __name__ == "__main__":
    agent = TelegramAgent()
    agent.run()

import type { JsonValue } from "../types/task";

export type AppHandler = (payload: JsonValue) => void | Promise<void>;

export const appRegistry: Record<string, AppHandler> = {
  photoPrompt: (payload) => {
    console.info("[app:photoPrompt] payload", payload);
  },
  triviaCard: (payload) => {
    console.info("[app:triviaCard] payload", payload);
  },
  audioPing: (payload) => {
    console.info("[app:audioPing] payload", payload);
  }
};

export const runAppTask = (appName: string, payload: JsonValue) => {
  const handler = appRegistry[appName];
  if (!handler) {
    console.warn(`[app-registry] Missing app "${appName}"`, payload);
    return;
  }

  void handler(payload);
};

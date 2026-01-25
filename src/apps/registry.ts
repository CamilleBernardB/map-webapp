import type { JsonValue } from "../types/task";

export type AppResult = {
  success: boolean;
  message?: string;
};

export type AppHandler = (payload: JsonValue) => AppResult | Promise<AppResult>;

export const appRegistry: Record<string, AppHandler> = {
  photoPrompt: (payload) => {
    console.info("[app:photoPrompt] payload", payload);
    return { success: false };
  },
  triviaCard: (payload) => {
    console.info("[app:triviaCard] payload", payload);
    return { success: false };
  },
  audioPing: (payload) => {
    console.info("[app:audioPing] payload", payload);
    return { success: false };
  },
  showMessage: (payload) => {
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return { success: false, message };
  },
  askPuzzle: (payload) => {
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return { success: false, message };
  },
  askWordle: (payload) => {
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return { success: false, message };
  },
  askFifteen: (payload) => {
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return { success: false, message };
  }
};

export const runAppTask = async (
  appName: string,
  payload: JsonValue
): Promise<AppResult> => {
  const handler = appRegistry[appName];
  if (!handler) {
    const message = `[app-registry] Missing app "${appName}"`;
    console.warn(message, payload);
    return { success: false, message };
  }

  return handler(payload);
};

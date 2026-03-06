import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = "8000";

function getHostFromExpoConfig(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).manifest?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    "";

  if (typeof hostUri !== "string" || hostUri.length === 0) return null;
  const host = hostUri.split(":")[0];
  return host || null;
}

export function getApiBaseUrl(): string {
  const host = getHostFromExpoConfig();
  if (host) return `http://${host}:${API_PORT}`;

  if (Platform.OS === "android") return `http://10.0.2.2:${API_PORT}`;
  return `http://127.0.0.1:${API_PORT}`;
}

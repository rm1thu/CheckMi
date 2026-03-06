// src/auth.ts
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "token";

export async function saveToken(token: string) {
  if (!token) throw new Error("No token to save");
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken() {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

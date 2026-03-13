// src/auth.ts
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "token";
const ADMIN_TOKEN_KEY = "admin_token";

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

export async function saveAdminToken(token: string) {
  if (!token) throw new Error("No admin token to save");
  await SecureStore.setItemAsync(ADMIN_TOKEN_KEY, token);
}

export async function getAdminToken() {
  return await SecureStore.getItemAsync(ADMIN_TOKEN_KEY);
}

export async function clearAdminToken() {
  await SecureStore.deleteItemAsync(ADMIN_TOKEN_KEY);
}

// src/auth.ts
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "token";
const ADMIN_TOKEN_KEY = "admin_token";
const LOGIN_SUCCESS_TOAST_KEY = "login_success_toast";

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

export async function markLoginSuccessToastPending() {
  await SecureStore.setItemAsync(LOGIN_SUCCESS_TOAST_KEY, "1");
}

export async function consumeLoginSuccessToastPending() {
  const value = await SecureStore.getItemAsync(LOGIN_SUCCESS_TOAST_KEY);
  if (value !== "1") return false;
  await SecureStore.deleteItemAsync(LOGIN_SUCCESS_TOAST_KEY);
  return true;
}

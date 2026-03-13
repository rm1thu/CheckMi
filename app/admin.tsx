import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../src/api";
import { clearAdminToken, getAdminToken, saveAdminToken } from "../src/auth";
import { AppTheme, useAppTheme } from "../src/theme-mode";

const BASE_URL = getApiBaseUrl();

type AdminRequestItem = {
  id: number;
  userId: number;
  userName: string;
  userRole: string;
  userEmail?: string | null;
  requestType: "delete_data" | "delete_account" | string;
  status: "pending" | "approved" | "rejected" | string;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function requestTypeLabel(v: string) {
  if (v === "delete_data") return "Delete Data";
  if (v === "delete_account") return "Delete Account";
  return v;
}

export default function AdminScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requests, setRequests] = useState<AdminRequestItem[]>([]);

  const adminFetch = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!adminToken) throw new Error("Not logged in as admin");

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 401) {
      await clearAdminToken();
      setAdminToken(null);
      throw new Error("Admin session expired. Please log in again.");
    }

    return res;
  }, [adminToken]);

  const loadRequests = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoadingRequests(true);
      const res = await adminFetch("/admin/deletion-requests?status=pending");
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail || `Failed (${res.status})`);
      }
      setRequests(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Could not load requests", e?.message || "Try again.");
    } finally {
      setLoadingRequests(false);
    }
  }, [adminFetch, adminToken]);

  useEffect(() => {
    (async () => {
      const token = await getAdminToken();
      if (!token) return;
      setAdminToken(token);
    })();
  }, []);

  useEffect(() => {
    if (!adminToken) return;
    void loadRequests();
  }, [adminToken, loadRequests]);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert("Missing credentials", "Enter username and password.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${BASE_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        Alert.alert("Login failed", data?.detail || "Invalid credentials.");
        return;
      }
      if (!data?.token) {
        Alert.alert("Login failed", "No admin token returned.");
        return;
      }

      await saveAdminToken(data.token);
      setAdminToken(data.token);
      setPassword("");
    } catch {
      Alert.alert("Network error", "Could not reach the backend.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await clearAdminToken();
    setAdminToken(null);
    setRequests([]);
  };

  const approveRequest = async (id: number) => {
    try {
      setLoadingRequests(true);
      const res = await adminFetch(`/admin/deletion-requests/${id}/approve`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.detail || `Failed (${res.status})`);
      }
      await loadRequests();
    } catch (e: any) {
      Alert.alert("Approve failed", e?.message || "Try again.");
    } finally {
      setLoadingRequests(false);
    }
  };

  const rejectRequest = async (id: number) => {
    try {
      setLoadingRequests(true);
      const res = await adminFetch(`/admin/deletion-requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: "Rejected by admin" }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.detail || `Failed (${res.status})`);
      }
      await loadRequests();
    } catch (e: any) {
      Alert.alert("Reject failed", e?.message || "Try again.");
    } finally {
      setLoadingRequests(false);
    }
  };

  if (!adminToken) {
    return (
      <KeyboardAvoidingView
        style={styles.authScreen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.authTopBlob} />
        <View style={styles.authBottomBlob} />

        <ScrollView
          contentContainerStyle={styles.authContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.authHeaderRow}>
            <TouchableOpacity style={styles.authIconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={18} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.authTitle}>Admin Access</Text>
            <View style={styles.authIconBtnGhost} />
          </View>

          <Text style={styles.authSubtitle}>Sign in to review deletion requests.</Text>

          <View style={styles.authCard}>
            <Text style={styles.authSectionTitle}>Admin Login</Text>

            <Text style={styles.authLabel}>Username</Text>
            <TextInput
              style={styles.authInput}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="admin"
              placeholderTextColor="rgba(255,255,255,0.45)"
            />

            <Text style={styles.authLabel}>Password</Text>
            <TextInput
              style={styles.authInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="rgba(255,255,255,0.45)"
            />

            <TouchableOpacity
              style={[styles.authPrimaryBtn, submitting && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.authPrimaryBtnText}>Log in as admin</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.authScreen}>
      <View style={styles.authTopBlob} />
      <View style={styles.authBottomBlob} />

      <ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
        <View style={styles.authHeaderRow}>
          <Text style={styles.authTitle}>Admin Requests</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.authIconBtn} onPress={() => void loadRequests()}>
              <Ionicons name="refresh" size={16} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.authIconBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.authSubtitle}>Pending delete-data and delete-account requests.</Text>

        <View style={styles.authCard}>
          <Text style={styles.authSectionTitle}>Pending Requests</Text>

          {loadingRequests ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#ffffff" />
            </View>
          ) : requests.length === 0 ? (
            <Text style={styles.authMutedText}>No pending requests.</Text>
          ) : (
            requests.map((item) => (
              <View key={item.id} style={styles.authRequestCard}>
                <View style={styles.requestHead}>
                  <Text style={styles.authRequestTitle}>#{item.id}</Text>
                  <View style={styles.authTypeChip}>
                    <Text style={styles.authTypeChipText}>{requestTypeLabel(item.requestType)}</Text>
                  </View>
                </View>
                <Text style={styles.authRequestMeta}>
                  {item.userName} • {item.userRole}
                </Text>
                <Text style={styles.authRequestMeta}>Email: {item.userEmail || "N/A"}</Text>
                <Text style={styles.authRequestMeta}>Requested: {formatDate(item.requestedAt)}</Text>

                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.authSecondaryBtn, styles.authRejectBtn]}
                    onPress={() => void rejectRequest(item.id)}
                  >
                    <Text style={styles.authSecondaryBtnText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.authPrimaryBtn, styles.authApproveBtn]}
                    onPress={() => void approveRequest(item.id)}
                  >
                    <Text style={styles.authPrimaryBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    authScreen: {
      flex: 1,
      backgroundColor: "#0B1220",
    },
    authTopBlob: {
      position: "absolute",
      top: -120,
      right: -80,
      width: 240,
      height: 240,
      borderRadius: 999,
      backgroundColor: "rgba(59,130,246,0.35)",
    },
    authBottomBlob: {
      position: "absolute",
      bottom: -140,
      left: -100,
      width: 280,
      height: 280,
      borderRadius: 999,
      backgroundColor: "rgba(16,185,129,0.25)",
    },
    authContent: {
      paddingTop: 58,
      paddingHorizontal: 20,
      paddingBottom: 36,
    },
    authHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    authIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)",
    },
    authIconBtnGhost: {
      width: 34,
      height: 34,
    },
    authTitle: {
      fontSize: 25,
      fontWeight: "800",
      color: "#ffffff",
    },
    authSubtitle: {
      fontSize: 13,
      color: "rgba(255,255,255,0.72)",
      marginBottom: 14,
    },
    authCard: {
      backgroundColor: "rgba(255,255,255,0.06)",
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      marginBottom: 14,
    },
    authSectionTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: "#ffffff",
      marginBottom: 6,
    },
    authLabel: {
      marginTop: 10,
      marginBottom: 6,
      fontSize: 13,
      color: "rgba(255,255,255,0.78)",
      fontWeight: "600",
    },
    authInput: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
      borderRadius: 12,
      color: "#ffffff",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    authPrimaryBtn: {
      backgroundColor: "#2563eb",
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    authPrimaryBtnText: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 13,
    },
    authSecondaryBtn: {
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    authSecondaryBtnText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 13,
    },
    authMutedText: {
      color: "rgba(255,255,255,0.72)",
      marginTop: 12,
    },
    authRequestCard: {
      backgroundColor: "rgba(255,255,255,0.05)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    authTypeChip: {
      borderRadius: 999,
      backgroundColor: "rgba(96,165,250,0.18)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: "rgba(96,165,250,0.35)",
    },
    authTypeChipText: {
      color: "#dbeafe",
      fontSize: 11,
      fontWeight: "700",
    },
    authRequestTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: "#ffffff",
    },
    authRequestMeta: {
      fontSize: 12,
      color: "rgba(255,255,255,0.78)",
      marginBottom: 2,
    },
    authApproveBtn: {
      marginTop: 0,
      minWidth: 96,
    },
    authRejectBtn: {
      marginTop: 0,
      minWidth: 96,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingTop: 58,
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    headerActions: {
      flexDirection: "row",
      gap: 10 as any,
      alignItems: "center",
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    iconBtnGhost: {
      width: 34,
      height: 34,
    },
    title: {
      fontSize: 25,
      fontWeight: "800",
      color: theme.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 14,
    },
    section: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: theme.textPrimary,
      marginBottom: 6,
    },
    label: {
      marginTop: 10,
      marginBottom: 6,
      fontSize: 13,
      color: theme.textSecondary,
      fontWeight: "600",
    },
    input: {
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      color: theme.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    primaryBtn: {
      backgroundColor: theme.primaryStrong,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    primaryBtnText: {
      color: theme.primaryText,
      fontWeight: "800",
      fontSize: 13,
    },
    secondaryBtn: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    secondaryBtnText: {
      color: theme.textPrimary,
      fontWeight: "700",
      fontSize: 13,
    },
    loadingWrap: {
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 20,
    },
    emptyText: {
      color: theme.textSecondary,
      marginTop: 16,
    },
    requestCard: {
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    requestHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    typeChip: {
      borderRadius: 999,
      backgroundColor: theme.chip,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    typeChipText: {
      color: theme.textPrimary,
      fontSize: 11,
      fontWeight: "700",
    },
    requestTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.textPrimary,
    },
    requestMeta: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 2,
    },
    requestActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8 as any,
      marginTop: 8,
    },
    approveBtn: {
      marginTop: 0,
      minWidth: 96,
    },
    rejectBtn: {
      marginTop: 0,
      minWidth: 96,
    },
  });
}

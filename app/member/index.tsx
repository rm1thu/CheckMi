import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../src/api";
import { getAvatarPaletteForKey, getNameInitials } from "../../src/avatar";
import { AppTheme, useAppTheme } from "../../src/theme-mode";

type Metrics = {
  heartRate?: number | null;
  weight?: number | null;
  steps?: number | null;
  sleep?: number | null;
  bloodGlucose?: number | null;
  systolicBP?: number | null;
  diastolicBP?: number | null;
  cholesterol?: number | null;
};

type FamilyMemberSummary = {
  id: number;
  name: string;
  role: string;
  metrics: Metrics | null; // ✅ still allow null if no logs yet
};

const BASE_URL = getApiBaseUrl();

// ✅ AUTH FETCH HELPER
async function authFetch(url: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync("token");
  if (!token) throw new Error("No token found. Please log in again.");

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  return fetch(url, { ...options, headers });
}

/* ---------- HELPERS ---------- */
function isNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const formatKSteps = (steps?: number | null) => {
  if (steps === null || steps === undefined) return "Not shared";
  if (!isNumber(steps)) return "--";
  if (steps >= 1000) return `${Math.round(steps / 1000)}k`;
  return String(steps);
};

const displayMetric = (v?: number | null, unit?: string) => {
  if (v === null || v === undefined) return "Not shared";
  if (!isNumber(v)) return "--";
  return unit ? `${v} ${unit}` : String(v);
};

export default function MemberIndexScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const isFocused = useIsFocused();
  const [family, setFamily] = useState<FamilyMemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFamily = async () => {
    const res = await authFetch(`${BASE_URL}/family`);
    if (!res.ok) throw new Error(`Failed to load family: ${res.status}`);
    const data: FamilyMemberSummary[] = await res.json();
    setFamily(data);
  };

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      await loadFamily();
    } catch (err: any) {
      console.error("❌ Member index load error:", err);

      if (String(err?.message || "").includes("401")) {
        setError("You’re not logged in. Please log in again.");
      } else {
        setError("Could not load members");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await authFetch(`${BASE_URL}/family`);
        if (!res.ok) throw new Error(`Failed to load family: ${res.status}`);
        const data: FamilyMemberSummary[] = await res.json();
        if (!cancelled) setFamily(data);
      } catch (err: any) {
        console.error("❌ Member index load error:", err);
        if (!cancelled) {
          if (String(err?.message || "").includes("401")) {
            setError("You’re not logged in. Please log in again.");
          } else {
            setError("Could not load members");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFocused]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Members</Text>

        <TouchableOpacity onPress={refresh}>
          <Text style={styles.linkText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {family.length === 0 ? (
        <Text style={styles.emptyText}>No members found.</Text>
      ) : (
        family.map((member) => {
          const avatarPalette = getAvatarPaletteForKey(
            theme,
            member.id ?? member.name
          );

          return (
            <TouchableOpacity
              key={member.id}
              style={styles.memberRow}
              onPress={() => router.push(`/member/${member.id}`)}
            >
              <View
                style={[
                  styles.memberAvatar,
                  { backgroundColor: avatarPalette.background },
                ]}
              >
                <Text style={[styles.memberAvatarText, { color: avatarPalette.text }]}>
                  {getNameInitials(member.name)}
                </Text>
              </View>

              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberRole}>{member.role}</Text>

                {!member.metrics ? (
                  <Text style={styles.memberEmptyDataText}>No health data yet</Text>
                ) : (
                  <>
                    <View style={styles.memberMetricsRow}>
                      <Text style={styles.memberMetric}>
                        ❤️ {displayMetric(member.metrics.heartRate, "bpm")}
                      </Text>
                      <Text style={styles.memberMetric}>
                        📈 {formatKSteps(member.metrics.steps)}{" "}
                        {isNumber(member.metrics.steps) ? "steps" : ""}
                      </Text>
                    </View>
                    <View style={styles.memberMetricsRow}>
                      <Text style={styles.memberMetric}>
                        🌙 {displayMetric(member.metrics.sleep, "h")}
                      </Text>
                      <Text style={styles.memberMetric}>
                        ⚖️ {displayMetric(member.metrics.weight, "kg")}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.chevronBox}>
                <Text style={styles.chevronText}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { paddingTop: 55, paddingHorizontal: 20, paddingBottom: 30 },
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    backBtn: { paddingVertical: 6, paddingRight: 10 },
    backText: { fontSize: 13, color: theme.textPrimary, fontWeight: "700" },
    title: { fontSize: 20, fontWeight: "800", color: theme.textPrimary },
    linkText: { fontSize: 13, color: theme.primary, fontWeight: "600" },
    errorText: { color: theme.danger, marginBottom: 12 },
    emptyText: { color: theme.textSecondary },

    memberRow: {
      flexDirection: "row",
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    memberAvatar: {
      width: 46,
      height: 46,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    memberAvatarText: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.mode === "dark" ? theme.primary : theme.primaryStrong,
    },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 15, fontWeight: "700", color: theme.textPrimary },
    memberRole: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
    memberEmptyDataText: { color: theme.textSecondary, fontSize: 12, marginTop: 6 },
    memberMetricsRow: { flexDirection: "row", justifyContent: "space-between" },
    memberMetric: { fontSize: 12, color: theme.textPrimary, marginTop: 2 },
    chevronBox: { justifyContent: "center", alignItems: "center", paddingLeft: 6 },
    chevronText: { fontSize: 22, color: theme.textMuted, marginTop: -2 },
  });
}

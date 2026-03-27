import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../src/api";
import { getAvatarPaletteForKey, getNameInitials } from "../../src/avatar";
import { loadAppPrefs } from "../../src/prefs";
import { showTabToast } from "../../src/tab-toast";
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
  metrics: Metrics | null;
};

type ConsentItem = {
  metricType:
    | "heartRate"
    | "weight"
    | "steps"
    | "sleep"
    | "bloodGlucose"
    | "systolicBP"
    | "diastolicBP"
    | "cholesterol";
  isShared: boolean;
};

type AlertItem = {
  id: number;
  category: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "urgent" | string;
  metric_type?: string | null;
  metric_value?: number | null;
  is_read: number; // 0/1
  created_at: string;
};

type FamilyGoals = {
  steps: number;
  sleep: number;
};

type FamilyChatMessage = {
  id: number;
  familyId: number;
  userId: number;
  userName: string;
  userRole: string;
  message: string;
  parentId?: number | null;
  createdAt: string;
};

const BASE_URL = getApiBaseUrl();
const FAMILY_CHAT_MESSAGE_MAX = 500;
const FAMILY_STEPS_GOAL_MAX = 100000;
const FAMILY_SLEEP_GOAL_MIN = 1;
const FAMILY_SLEEP_GOAL_MAX = 24;
const FAMILY_ALERT_CATEGORY = "family";
const LAST_SEEN_FAMILY_ALERT_ID_KEY = "last_seen_family_alert_id";

function normalizeChatMessage(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasMeaningfulChatText(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function getChatMessageError(value: string): string | null {
  const message = normalizeChatMessage(value);
  if (!message) return "Please enter a message before sending.";
  if (message.length > FAMILY_CHAT_MESSAGE_MAX) {
    return `Messages must be ${FAMILY_CHAT_MESSAGE_MAX} characters or fewer.`;
  }
  if (!hasMeaningfulChatText(message)) {
    return "Message must include letters or numbers.";
  }
  return null;
}

function getLatestUnreadFamilyAlert(alerts: AlertItem[]): AlertItem | null {
  return (
    alerts.find(
      (alert) =>
        alert.category === FAMILY_ALERT_CATEGORY && (alert?.is_read ?? 0) === 0
    ) || null
  );
}

async function authFetch(url: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync("token");
  if (!token) throw new Error("No token found. Please log in again.");

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

const CONSENT_LABELS: {
  key: ConsentItem["metricType"];
  label: string;
  hint: string;
  icon: string;
}[] = [
  { key: "steps", label: "Steps", hint: "Daily step count", icon: "📈" },
  { key: "sleep", label: "Sleep", hint: "Hours slept", icon: "🌙" },
  { key: "heartRate", label: "Heart rate", hint: "Beats per minute", icon: "❤️" },
  { key: "weight", label: "Weight", hint: "Body weight", icon: "⚖️" },
  { key: "bloodGlucose", label: "Blood glucose", hint: "mmol/L", icon: "🩸" },
  { key: "systolicBP", label: "Systolic BP", hint: "mmHg", icon: "🫀" },
  { key: "diastolicBP", label: "Diastolic BP", hint: "mmHg", icon: "🫀" },
  { key: "cholesterol", label: "Cholesterol", hint: "mmol/L", icon: "🥚" },
];

function isNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function metricIsHidden(m: Metrics | null, key: ConsentItem["metricType"]) {
  if (!m) return false;
  const v = (m as any)[key];
  return v === null || v === undefined;
}

function alertBg(severity: string, theme: AppTheme) {
  if (theme.mode === "dark") {
    if (severity === "urgent") return { backgroundColor: "#3f1f2a" };
    if (severity === "warning") return { backgroundColor: "#3b2f11" };
    return { backgroundColor: "#102a43" };
  }

  if (severity === "urgent") return { backgroundColor: "#fee2e2" };
  if (severity === "warning") return { backgroundColor: "#fef3c7" };
  return { backgroundColor: "#e0f2fe" };
}

function alertBorder(severity: string, theme: AppTheme) {
  if (theme.mode === "dark") {
    if (severity === "urgent") return { borderColor: "#f87171" };
    if (severity === "warning") return { borderColor: "#fbbf24" };
    return { borderColor: "#38bdf8" };
  }

  if (severity === "urgent") return { borderColor: "#ef4444" };
  if (severity === "warning") return { borderColor: "#f59e0b" };
  return { borderColor: "#38bdf8" };
}

function alertIcon(severity: string) {
  if (severity === "urgent") return "🚨";
  if (severity === "warning") return "⚠️";
  return "ℹ️";
}

export default function DashboardScreen() {
  const theme = useAppTheme();
  const isFocused = useIsFocused();
  const styles = useDashboardStyles();
  const [family, setFamily] = useState<FamilyMemberSummary[]>([]);
  const [familyName, setFamilyName] = useState<string>("Family Dashboard");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shareCode, setShareCode] = useState<string>("");
  const [codeLoading, setCodeLoading] = useState(false);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // ✅ Consent modal state
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consent, setConsent] = useState<
    Record<ConsentItem["metricType"], boolean>
  >({
    heartRate: false,
    weight: false,
    steps: false,
    sleep: false,
    bloodGlucose: false,
    systolicBP: false,
    diastolicBP: false,
    cholesterol: false,
  });


  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatTouched, setChatTouched] = useState(false);
  const [chatSubmitAttempted, setChatSubmitAttempted] = useState(false);
  const [chatMessages, setChatMessages] = useState<FamilyChatMessage[]>([]);

  const [goals, setGoals] = useState<FamilyGoals>({ steps: 10000, sleep: 8 });
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsSaving, setGoalsSaving] = useState(false);
  const [stepsGoalInput, setStepsGoalInput] = useState("10000");
  const [sleepGoalInput, setSleepGoalInput] = useState("8");
  const [magnifiedCardsEnabled, setMagnifiedCardsEnabled] = useState(false);
  const chatValidationError = useMemo(() => getChatMessageError(chatInput), [chatInput]);

  const loadMagnificationPreference = async () => {
    try {
      const prefs = await loadAppPrefs();
      setMagnifiedCardsEnabled(!!prefs.magnifiedCardsEnabled);
    } catch {
      // keep default
    }
  };

  const loadFamily = async () => {
    const res = await authFetch(`${BASE_URL}/family`);
    if (!res.ok) throw new Error(`Failed to load family: ${res.status}`);
    const data: FamilyMemberSummary[] = await res.json();
    setFamily(data);
    setFamilyName("Family Dashboard");
  };

  const loadShareCode = async () => {
    const res = await authFetch(`${BASE_URL}/me/share-code`);
    if (!res.ok) throw new Error(`Failed to load share code: ${res.status}`);
    const data: { code: string } = await res.json();
    setShareCode(data.code);
  };

  const loadConsent = async () => {
    const res = await authFetch(`${BASE_URL}/me/consent`);
    if (!res.ok) throw new Error(`Failed to load consent: ${res.status}`);
    const data: ConsentItem[] = await res.json();

    const next = { ...consent };
    for (const item of data) next[item.metricType] = !!item.isShared;
    setConsent(next);
  };

  const updateConsent = async (
    metricType: ConsentItem["metricType"],
    isShared: boolean
  ) => {
    const res = await authFetch(`${BASE_URL}/me/consent`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metricType, isShared }),
    });

    const data = await res.json().catch(() => []);
    if (!res.ok) {
      const msg =
        (data as any)?.detail || `Failed to update consent (${res.status})`;
      throw new Error(msg);
    }

    const next = { ...consent };
    for (const item of data as ConsentItem[])
      next[item.metricType] = !!item.isShared;
    setConsent(next);
  };

  const loadAlerts = async () => {
    const res = await authFetch(`${BASE_URL}/me/alerts`);
    if (!res.ok) throw new Error(`Failed to load alerts: ${res.status}`);
    const data: AlertItem[] = await res.json();
    const nextAlerts = Array.isArray(data) ? data : [];
    setAlerts(nextAlerts);

    const latestFamilyAlert = getLatestUnreadFamilyAlert(nextAlerts);
    if (!latestFamilyAlert) return;

    const lastSeenId = await SecureStore.getItemAsync(LAST_SEEN_FAMILY_ALERT_ID_KEY);
    if (lastSeenId === String(latestFamilyAlert.id)) return;

    await SecureStore.setItemAsync(
      LAST_SEEN_FAMILY_ALERT_ID_KEY,
      String(latestFamilyAlert.id)
    );
    showTabToast({
      title: latestFamilyAlert.title,
      message: latestFamilyAlert.message,
    });
  };

  const loadChatMessages = async () => {
    const res = await authFetch(`${BASE_URL}/family/chat/messages`);
    if (!res.ok) throw new Error(`Failed to load family chat: ${res.status}`);
    const data: FamilyChatMessage[] = await res.json();
    setChatMessages(Array.isArray(data) ? data : []);
  };

  const loadFamilyGoals = async () => {
    const res = await authFetch(`${BASE_URL}/family/goals`);
    if (!res.ok) throw new Error(`Failed to load family goals: ${res.status}`);
    const data: FamilyGoals = await res.json();

    setGoals(data);
    setStepsGoalInput(String(data.steps));
    setSleepGoalInput(String(data.sleep));
  };

  const openGoalsModal = async () => {
    try {
      setGoalsLoading(true);
      await loadFamilyGoals();
      setGoalsOpen(true);
    } catch (err: any) {
      Alert.alert("Could not load goals", err?.message || "Try again.");
    } finally {
      setGoalsLoading(false);
    }
  };

  const saveFamilyGoals = async () => {
    const stepsRaw = stepsGoalInput.trim();
    const sleepRaw = sleepGoalInput.trim();
    const steps = Number(stepsRaw);
    const sleep = Number(sleepRaw);

    if (!stepsRaw || !Number.isInteger(steps) || steps <= 0) {
      Alert.alert("Invalid steps goal", "Steps goal must be a whole number greater than 0.");
      return;
    }
    if (steps > FAMILY_STEPS_GOAL_MAX) {
      Alert.alert(
        "Invalid steps goal",
        `Steps goal must be ${FAMILY_STEPS_GOAL_MAX.toLocaleString()} or less.`
      );
      return;
    }
    if (
      !sleepRaw ||
      !Number.isFinite(sleep) ||
      sleep < FAMILY_SLEEP_GOAL_MIN ||
      sleep > FAMILY_SLEEP_GOAL_MAX
    ) {
      Alert.alert(
        "Invalid sleep goal",
        `Sleep goal must be between ${FAMILY_SLEEP_GOAL_MIN} and ${FAMILY_SLEEP_GOAL_MAX} hours.`
      );
      return;
    }

    try {
      setGoalsSaving(true);
      const res = await authFetch(`${BASE_URL}/family/goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: Math.round(steps), sleep }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        Alert.alert("Could not save goals", data?.detail || `Status ${res.status}`);
        return;
      }

      const next: FamilyGoals = {
        steps: Number(data.steps),
        sleep: Number(data.sleep),
      };
      setGoals(next);
      setStepsGoalInput(String(next.steps));
      setSleepGoalInput(String(next.sleep));
      setGoalsOpen(false);
    } catch (err: any) {
      Alert.alert("Could not save goals", err?.message || "Try again.");
    } finally {
      setGoalsSaving(false);
    }
  };

  const markAlertsRead = async (ids: number[]) => {
    if (!ids.length) return;

    const res = await authFetch(`${BASE_URL}/me/alerts/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertIds: ids }),
    });

    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const msg = (data as any)?.detail || `Failed to mark read (${res.status})`;
      throw new Error(msg);
    }

    setAlerts((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, is_read: 1 } : a))
    );
  };

  const refreshAll = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadFamily(), loadShareCode(), loadAlerts(), loadFamilyGoals()]);
    } catch (err: any) {
      console.error("❌ Dashboard refresh error:", err);
      setError(err?.message || "Could not load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const refreshCodeOnly = async () => {
    try {
      setCodeLoading(true);
      setError(null);
      await loadShareCode();
    } catch (err: any) {
      console.error("❌ Share code refresh error:", err);
      setError(err?.message || "Could not refresh share code");
    } finally {
      setCodeLoading(false);
    }
  };

  const openConsentModal = async () => {
    try {
      setConsentLoading(true);
      setError(null);
      await loadConsent();
      setConsentOpen(true);
    } catch (err: any) {
      console.error("❌ Consent load error:", err);
      Alert.alert("Could not load consent", err?.message || "Try again.");
    } finally {
      setConsentLoading(false);
    }
  };

  const openAlertsModal = async () => {
    try {
      setAlertsLoading(true);
      await loadAlerts();
      setAlertsOpen(true);
    } catch (err: any) {
      Alert.alert("Could not load alerts", err?.message || "Try again.");
    } finally {
      setAlertsLoading(false);
    }
  };

  const openChatModal = async () => {
    try {
      setChatLoading(true);
      setChatTouched(false);
      setChatSubmitAttempted(false);
      await loadChatMessages();
      setChatOpen(true);
    } catch (err: any) {
      Alert.alert("Could not load family chat", err?.message || "Try again.");
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatMessage = async () => {
    setChatTouched(true);
    setChatSubmitAttempted(true);

    const message = normalizeChatMessage(chatInput);
    if (chatValidationError) return;

    try {
      setChatSending(true);
      const res = await authFetch(`${BASE_URL}/family/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        Alert.alert("Could not send message", data?.detail || `Status ${res.status}`);
        return;
      }

      setChatMessages((prev) => [...prev, data as FamilyChatMessage]);
      setChatInput("");
      setChatTouched(false);
      setChatSubmitAttempted(false);
    } catch (err: any) {
      Alert.alert("Could not send message", err?.message || "Try again.");
    } finally {
      setChatSending(false);
    }
  };

  const doJoinFamily = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      Alert.alert("Missing code", "Enter a family code to join.");
      return;
    }

    try {
      setJoining(true);
      setError(null);

      const res = await authFetch(`${BASE_URL}/family/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        Alert.alert("Join failed", data?.detail || `Status ${res.status}`);
        return;
      }

      const alreadyInFamily = data?.message === "Already in this family";
      setJoinOpen(false);
      setJoinCode("");
      await refreshAll();
      showTabToast({
        title: alreadyInFamily ? "Already in family" : "Joined family",
        message: alreadyInFamily
          ? "You are already a member of this family group."
          : "You have joined the family group.",
      });
    } catch (err: any) {
      console.error("❌ Join error:", err);
      Alert.alert("Join failed", err?.message || "Could not join family");
    } finally {
      setJoining(false);
    }
  };

  const leaveFamily = async () => {
    try {
      setLeaving(true);
      setError(null);

      const res = await authFetch(`${BASE_URL}/family/leave`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        Alert.alert("Could not leave family", data?.detail || `Status ${res.status}`);
        return;
      }

      await refreshAll();
      Alert.alert("Left family", "You have left the family group.");
    } catch (err: any) {
      Alert.alert("Could not leave family", err?.message || "Try again.");
    } finally {
      setLeaving(false);
    }
  };

  const confirmLeaveFamily = () => {
    Alert.alert(
      "Leave family group?",
      "You will be removed from this family and its shared dashboard.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            void leaveFamily();
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!isFocused) return;
    void loadMagnificationPreference();
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([
          loadFamily(),
          loadShareCode(),
          loadAlerts(),
          loadFamilyGoals(),
        ]);
      } catch (err: any) {
        console.error("❌ Dashboard refresh error:", err);
        if (!cancelled) {
          setError(err?.message || "Could not load dashboard data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFocused]);

  const unread = useMemo(
    () => alerts.filter((a) => (a?.is_read ?? 0) === 0),
    [alerts]
  );
  const topAlert = unread[0];
  const stats = useMemo(() => {
    const withMetrics = family.filter((m) => m.metrics);

    const values = {
      heartRate: [] as number[],
      steps: [] as number[],
      sleep: [] as number[],
      weight: [] as number[],
      bloodGlucose: [] as number[],
      systolicBP: [] as number[],
      diastolicBP: [] as number[],
      cholesterol: [] as number[],
    };

    for (const f of withMetrics) {
      const m = f.metrics!;
      if (isNumber(m.heartRate)) values.heartRate.push(m.heartRate);
      if (isNumber(m.steps)) values.steps.push(m.steps);
      if (isNumber(m.sleep)) values.sleep.push(m.sleep);
      if (isNumber(m.weight)) values.weight.push(m.weight);
      if (isNumber(m.bloodGlucose)) values.bloodGlucose.push(m.bloodGlucose);
      if (isNumber(m.systolicBP)) values.systolicBP.push(m.systolicBP);
      if (isNumber(m.diastolicBP)) values.diastolicBP.push(m.diastolicBP);
      if (isNumber(m.cholesterol)) values.cholesterol.push(m.cholesterol);
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return {
      totalMembers: family.length,
      hasAnyMetrics: withMetrics.length > 0,
      avgHeart: avg(values.heartRate),
      avgSteps: avg(values.steps),
      avgSleep: avg(values.sleep),
      avgWeight: avg(values.weight),
      avgGlucose: avg(values.bloodGlucose),
      avgSystolic: avg(values.systolicBP),
      avgDiastolic: avg(values.diastolicBP),
      avgCholesterol: avg(values.cholesterol),
    };
  }, [family]);

  const formatK = (steps?: number | null) => {
    if (!isNumber(steps)) return "--";
    if (steps >= 1000) return `${Math.round(steps / 1000)}k`;
    return String(steps);
  };

  const fmt = (v: number | null, suffix: string, decimals?: number) => {
    if (v === null) return "--";
    if (typeof decimals === "number") return `${Number(v.toFixed(decimals))} ${suffix}`;
    return `${Math.round(v)} ${suffix}`;
  };

  const goalProgress = (value: number | null, goal: number) => {
    if (!isNumber(value) || goal <= 0) return 0;
    return Math.max(0, Math.min((value / goal) * 100, 100));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{familyName}</Text>
            <Text style={styles.subtitle}>
              Overview of your family’s health today
            </Text>
          </View>

          <TouchableOpacity onPress={refreshAll}>
            <Text style={styles.linkText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}


        {topAlert ? (
          <TouchableOpacity
            activeOpacity={0.9}
            style={[
              styles.alertBanner,
              alertBg(topAlert.severity, theme),
              alertBorder(topAlert.severity, theme),
            ]}
            onPress={openAlertsModal}
          >
            <Text style={styles.alertBannerTitle}>
              {alertIcon(topAlert.severity)} {topAlert.title}
            </Text>
            <Text style={styles.alertBannerMsg} numberOfLines={2}>
              {topAlert.message}
            </Text>
            <Text style={styles.alertBannerLink}>
              View alerts ({unread.length})
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          <TouchableOpacity
            style={[
              styles.shareBtn,
              { backgroundColor: theme.primary, marginRight: 10 },
            ]}
            onPress={() => setJoinOpen(true)}
          >
            <Text style={styles.shareBtnText}>Join family</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: theme.primaryStrong }]}
            onPress={openConsentModal}
            disabled={consentLoading}
          >
            <Text style={styles.shareBtnText}>
              {consentLoading ? "Loading..." : "Sharing & consent"}
            </Text>
          </TouchableOpacity>

          <View style={{ width: 10 }} />

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: theme.primaryStrong }]}
            onPress={openAlertsModal}
            disabled={alertsLoading}
          >
            <Text style={styles.shareBtnText}>
              {alertsLoading ? "Loading..." : `Alerts${unread.length ? ` (${unread.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginBottom: 12 }}>
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: theme.primaryStrong }]}
            onPress={openChatModal}
            disabled={chatLoading}
          >
            <Text style={styles.shareBtnText}>
              {chatLoading ? "Loading..." : "Family chat"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.shareCard}>
          <View>
            <Text style={styles.shareLabel}>Share code</Text>
            <Text style={styles.shareCode}>{shareCode || "—"}</Text>
          </View>

          <View style={styles.shareActions}>
            <TouchableOpacity
              style={[styles.shareBtn, styles.refreshBtn]}
              onPress={refreshCodeOnly}
              disabled={codeLoading}
            >
              <Text style={[styles.shareBtnText, styles.refreshBtnText]}>
                {codeLoading ? "Refreshing..." : "Refresh code"}
              </Text>
            </TouchableOpacity>

            <View style={{ width: 10 }} />

            <TouchableOpacity
              style={styles.shareBtn}
              onPress={async () => {
                if (!shareCode) return;
                await Share.share({
                  message: `Join my CheckMi family using this code: ${shareCode}`,
                });
              }}
            >
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.leaveBtn, leaving && { opacity: 0.65 }]}
          onPress={confirmLeaveFamily}
          disabled={leaving}
        >
          <Text style={styles.leaveBtnText}>
            {leaving ? "Leaving..." : "Leave family group"}
          </Text>
        </TouchableOpacity>

        <View style={styles.summaryGrid}>
          <SummaryCard
            label="Members"
            value={String(stats.totalMembers)}
            chip="👪"
            magnified={magnifiedCardsEnabled}
          />

          <SummaryCard
            label="Avg Heart Rate"
            value={fmt(stats.avgHeart, "bpm")}
            chip="❤️"
            magnified={magnifiedCardsEnabled}
          />
          <SummaryCard
            label="Avg Steps"
            value={stats.avgSteps === null ? "--" : formatK(stats.avgSteps)}
            chip="📈"
            magnified={magnifiedCardsEnabled}
          />
          <SummaryCard
            label="Avg Sleep"
            value={fmt(stats.avgSleep, "h", 1)}
            chip="🌙"
            magnified={magnifiedCardsEnabled}
          />
          <SummaryCard
            label="Avg Weight"
            value={fmt(stats.avgWeight, "kg", 1)}
            chip="⚖️"
            magnified={magnifiedCardsEnabled}
          />
          <SummaryCard
            label="Avg Glucose"
            value={fmt(stats.avgGlucose, "mmol/L", 1)}
            chip="🩸"
            magnified={magnifiedCardsEnabled}
          />
          <SummaryCard
            label="Avg Systolic"
            value={fmt(stats.avgSystolic, "mmHg")}
            chip="🫀"
            magnified={magnifiedCardsEnabled}
          />
          <SummaryCard
            label="Avg Diastolic"
            value={fmt(stats.avgDiastolic, "mmHg")}
            chip="🫀"
            magnified={magnifiedCardsEnabled}
          />
          <SummaryCard
            label="Avg Cholesterol"
            value={fmt(stats.avgCholesterol, "mmol/L", 1)}
            chip="🥚"
            magnified={magnifiedCardsEnabled}
          />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Family goals</Text>
          <TouchableOpacity onPress={openGoalsModal} disabled={goalsLoading}>
            <Text style={styles.linkText}>{goalsLoading ? "Loading..." : "Set goals"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.goalSummaryCard}>
          <View style={styles.goalSummaryRow}>
            <Text style={styles.goalLabel}>Daily steps goal</Text>
            <Text style={styles.goalTarget}>{Math.round(goals.steps)} steps</Text>
          </View>
          <View style={styles.goalTrack}>
            <View
              style={[
                styles.goalFill,
                { width: `${goalProgress(stats.avgSteps, goals.steps)}%` },
              ]}
            />
          </View>
          <Text style={styles.goalMeta}>
            Family average: {stats.avgSteps === null ? "--" : `${Math.round(stats.avgSteps)} steps`}
          </Text>

          <View style={styles.goalSpacer} />

          <View style={styles.goalSummaryRow}>
            <Text style={styles.goalLabel}>Sleep goal</Text>
            <Text style={styles.goalTarget}>{Number(goals.sleep.toFixed(1))} h</Text>
          </View>
          <View style={styles.goalTrack}>
            <View
              style={[
                styles.goalFill,
                { width: `${goalProgress(stats.avgSleep, goals.sleep)}%` },
              ]}
            />
          </View>
          <Text style={styles.goalMeta}>
            Family average: {stats.avgSleep === null ? "--" : `${Number(stats.avgSleep.toFixed(1))} h`}
          </Text>
        </View>

        {/* Members */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Members snapshot</Text>
          <TouchableOpacity onPress={() => router.push("/member")}>
            <Text style={styles.linkText}>View members</Text>
          </TouchableOpacity>
        </View>

        {family.length === 0 ? (
          <Text style={styles.mutedTopText}>
            No family members yet.
          </Text>
        ) : (
          family.map((member) => {
            const avatarPalette = getAvatarPaletteForKey(
              theme,
              member.id ?? member.name
            );

            return (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.memberRow,
                  magnifiedCardsEnabled && styles.memberRowMagnified,
                ]}
                onPress={() => router.push(`/member/${member.id}`)}
              >
                <View
                  style={[
                    styles.memberAvatar,
                    magnifiedCardsEnabled && styles.memberAvatarMagnified,
                    { backgroundColor: avatarPalette.background },
                  ]}
                >
                  <Text
                    style={[
                      styles.memberAvatarText,
                      magnifiedCardsEnabled && styles.memberAvatarTextMagnified,
                      { color: avatarPalette.text },
                    ]}
                  >
                    {getNameInitials(member.name)}
                  </Text>
                </View>

                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, magnifiedCardsEnabled && styles.memberNameMagnified]}>
                    {member.name}
                  </Text>
                  <Text style={[styles.memberRole, magnifiedCardsEnabled && styles.memberRoleMagnified]}>
                    {member.role}
                  </Text>

                  {!member.metrics ? (
                    <Text style={styles.memberEmptyText}>
                      No health data yet
                    </Text>
                  ) : (
                    <>
                      <View style={styles.memberMetricsRow}>
                        <Text style={[styles.memberMetric, magnifiedCardsEnabled && styles.memberMetricMagnified]}>
                          ❤️{" "}
                          {metricIsHidden(member.metrics, "heartRate")
                            ? "Not shared"
                            : isNumber(member.metrics.heartRate)
                            ? `${member.metrics.heartRate} bpm`
                            : "--"}
                        </Text>
                        <Text style={[styles.memberMetric, magnifiedCardsEnabled && styles.memberMetricMagnified]}>
                          📈{" "}
                          {metricIsHidden(member.metrics, "steps")
                            ? "Not shared"
                            : isNumber(member.metrics.steps)
                            ? `${formatK(member.metrics.steps)} steps`
                            : "--"}
                        </Text>
                      </View>
                      <View style={styles.memberMetricsRow}>
                        <Text style={[styles.memberMetric, magnifiedCardsEnabled && styles.memberMetricMagnified]}>
                          🌙{" "}
                          {metricIsHidden(member.metrics, "sleep")
                            ? "Not shared"
                            : isNumber(member.metrics.sleep)
                            ? `${member.metrics.sleep} h`
                            : "--"}
                        </Text>
                        <Text style={[styles.memberMetric, magnifiedCardsEnabled && styles.memberMetricMagnified]}>
                          ⚖️{" "}
                          {metricIsHidden(member.metrics, "weight")
                            ? "Not shared"
                            : isNumber(member.metrics.weight)
                            ? `${member.metrics.weight} kg`
                            : "--"}
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

      <Modal
        visible={alertsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAlertsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Alerts</Text>

              <TouchableOpacity
                style={[styles.shareBtn, styles.refreshBtn]}
                onPress={async () => {
                  try {
                    const ids = unread.map((a) => a.id);
                    await markAlertsRead(ids);
                  } catch (e: any) {
                    Alert.alert("Could not mark read", e?.message || "Try again.");
                  }
                }}
                disabled={!unread.length}
              >
                <Text style={[styles.shareBtnText, styles.refreshBtnText]}>
                  Mark all read
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.mutedBottomText}>
              Alerts are generated when you log metrics (goals + unusual patterns).
            </Text>

            <ScrollView style={{ maxHeight: 380 }}>
              {alerts.length === 0 ? (
                <Text style={styles.mutedText}>No alerts yet.</Text>
              ) : (
                alerts.map((a) => {
                  const unreadRow = (a.is_read ?? 0) === 0;
                  return (
                    <View
                      key={a.id}
                      style={[
                        styles.alertRow,
                        alertBg(a.severity, theme),
                        alertBorder(a.severity, theme),
                        unreadRow ? { opacity: 1 } : { opacity: 0.7 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alertRowTitle}>
                          {alertIcon(a.severity)} {a.title}
                        </Text>
                        <Text style={styles.alertRowMsg}>{a.message}</Text>
                        <Text style={styles.alertRowMeta}>
                          {a.category} • {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                        </Text>
                      </View>

                      {unreadRow ? (
                        <TouchableOpacity
                          style={[styles.shareBtn, styles.refreshBtn]}
                          onPress={async () => {
                            try {
                              await markAlertsRead([a.id]);
                            } catch (e: any) {
                              Alert.alert("Could not mark read", e?.message || "Try again.");
                            }
                          }}
                        >
                          <Text style={[styles.shareBtnText, styles.refreshBtnText]}>
                            Read
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.shareBtn, styles.refreshBtn]}
                onPress={() => setAlertsOpen(false)}
              >
                <Text style={[styles.shareBtnText, styles.refreshBtnText]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={goalsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Family goals</Text>
            <Text style={styles.mutedBottomText}>
              Set shared daily targets for your family dashboard.
            </Text>

            <Text style={styles.goalInputLabel}>Daily steps goal</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={stepsGoalInput}
              onChangeText={(value) => setStepsGoalInput(value.replace(/[^\d]/g, ""))}
              maxLength={6}
            />

            <Text style={styles.goalInputLabel}>Sleep goal (hours)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="decimal-pad"
              value={sleepGoalInput}
              onChangeText={(value) => {
                const cleaned = value.replace(/[^0-9.]/g, "");
                const [whole, ...rest] = cleaned.split(".");
                setSleepGoalInput(rest.length ? `${whole}.${rest.join("")}` : cleaned);
              }}
              maxLength={5}
            />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.shareBtn, styles.refreshBtn]}
                onPress={() => setGoalsOpen(false)}
                disabled={goalsSaving}
              >
                <Text style={[styles.shareBtnText, styles.refreshBtnText]}>Cancel</Text>
              </TouchableOpacity>

              <View style={{ width: 10 }} />

              <TouchableOpacity
                style={[styles.shareBtn, { backgroundColor: theme.primary }]}
                onPress={saveFamilyGoals}
                disabled={goalsSaving}
              >
                {goalsSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.shareBtnText}>Save goals</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={chatOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setChatOpen(false);
          setChatTouched(false);
          setChatSubmitAttempted(false);
        }}
      >
        <View style={styles.chatModalBackdrop}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          >
            <View style={[styles.modalCard, styles.chatModalCard]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.modalTitle}>Family chat</Text>
                <TouchableOpacity
                  style={[styles.shareBtn, styles.refreshBtn]}
                  onPress={async () => {
                    try {
                      setChatLoading(true);
                      await loadChatMessages();
                    } catch (e: any) {
                      Alert.alert("Could not refresh chat", e?.message || "Try again.");
                    } finally {
                      setChatLoading(false);
                    }
                  }}
                  disabled={chatLoading || chatSending}
                >
                  <Text style={[styles.shareBtnText, styles.refreshBtnText]}>
                    {chatLoading ? "Refreshing..." : "Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.mutedBottomText}>
                Send updates and questions to everyone in your family group.
              </Text>

              <ScrollView
                style={styles.chatScroll}
                contentContainerStyle={styles.chatScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {chatMessages.length === 0 ? (
                  <Text style={styles.mutedText}>No messages yet. Start the conversation.</Text>
                ) : (
                  chatMessages.map((msg) => (
                    <View key={msg.id} style={styles.chatRow}>
                      <View style={styles.chatHeaderRow}>
                        <View>
                          <Text style={styles.chatAuthor}>
                            {msg.userName} • {msg.userRole}
                          </Text>
                        </View>
                        <Text style={styles.chatMeta}>
                          {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}
                        </Text>
                      </View>
                      <Text style={styles.chatBody}>{msg.message}</Text>
                    </View>
                  ))
                )}
              </ScrollView>

              <TextInput
                style={[
                  styles.chatComposerInput,
                  (chatTouched || chatSubmitAttempted) &&
                    chatValidationError &&
                    styles.chatComposerInputError,
                ]}
                placeholder="Write a message..."
                placeholderTextColor={theme.textMuted}
                value={chatInput}
                onChangeText={setChatInput}
                onBlur={() => setChatTouched(true)}
                maxLength={FAMILY_CHAT_MESSAGE_MAX}
                multiline
                editable={!chatSending}
              />
              {(chatTouched || chatSubmitAttempted) && chatValidationError ? (
                <Text style={styles.chatComposerErrorText}>{chatValidationError}</Text>
              ) : null}

              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.shareBtn, styles.refreshBtn]}
                  onPress={() => {
                    setChatOpen(false);
                    setChatTouched(false);
                    setChatSubmitAttempted(false);
                  }}
                  disabled={chatSending}
                >
                  <Text style={[styles.shareBtnText, styles.refreshBtnText]}>Close</Text>
                </TouchableOpacity>

                <View style={{ width: 10 }} />

                <TouchableOpacity
                  style={[
                    styles.shareBtn,
                    { backgroundColor: theme.primary },
                    (chatValidationError || chatSending) && styles.chatSendButtonDisabled,
                  ]}
                  onPress={sendChatMessage}
                  disabled={chatSending}
                >
                  {chatSending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.shareBtnText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Consent Modal */}
      <Modal
        visible={consentOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setConsentOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sharing & consent</Text>
            <Text style={styles.mutedBottomText}>
              Choose what your family can see. You can change this anytime.
            </Text>

            <View style={{ marginBottom: 10 }}>
              {CONSENT_LABELS.map((item) => (
                <View key={item.key} style={styles.consentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.consentLabel}>
                      {item.icon} {item.label}
                    </Text>
                    <Text style={styles.consentHint}>{item.hint}</Text>
                  </View>

                  <Switch
                    value={!!consent[item.key]}
                    onValueChange={async (v) => {
                      const prev = consent[item.key];
                      setConsent((s) => ({ ...s, [item.key]: v })); // optimistic UI
                      try {
                        await updateConsent(item.key, v);
                        await loadFamily(); // refresh so filtering applies immediately
                      } catch (e: any) {
                        setConsent((s) => ({ ...s, [item.key]: prev })); // revert
                        Alert.alert(
                          "Could not update consent",
                          e?.message || "Try again."
                        );
                      }
                    }}
                  />
                </View>
              ))}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <TouchableOpacity
                style={[styles.shareBtn, styles.refreshBtn]}
                onPress={() => setConsentOpen(false)}
              >
                <Text style={[styles.shareBtnText, styles.refreshBtnText]}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Modal */}
      <Modal
        visible={joinOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setJoinOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join a family</Text>
            <Text style={styles.mutedBottomText}>
              Enter the share code you received.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. A1B2C3"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              value={joinCode}
              onChangeText={setJoinCode}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginTop: 14,
              }}
            >
              <TouchableOpacity
                style={[styles.shareBtn, styles.refreshBtn]}
                onPress={() => setJoinOpen(false)}
                disabled={joining}
              >
                <Text style={[styles.shareBtnText, styles.refreshBtnText]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <View style={{ width: 10 }} />

              <TouchableOpacity
                style={[styles.shareBtn, { backgroundColor: theme.primary }]}
                onPress={doJoinFamily}
                disabled={joining}
              >
                <Text style={styles.shareBtnText}>
                  {joining ? "Joining..." : "Join"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SummaryCard({
  label,
  value,
  chip,
  magnified,
}: {
  label: string;
  value: string;
  chip: string;
  magnified: boolean;
}) {
  const styles = useDashboardStyles();

  return (
    <View style={[styles.summaryCard, magnified && styles.summaryCardMagnified]}>
      <View style={[styles.summaryChip, magnified && styles.summaryChipMagnified]}>
        <Text style={[styles.summaryChipText, magnified && styles.summaryChipTextMagnified]}>
          {chip}
        </Text>
      </View>
      <Text style={[styles.summaryLabel, magnified && styles.summaryLabelMagnified]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, magnified && styles.summaryValueMagnified]}>
        {value}
      </Text>
    </View>
  );
}

function useDashboardStyles() {
  const theme = useAppTheme();
  return React.useMemo(() => createStyles(theme), [theme]);
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { paddingTop: 55, paddingHorizontal: 20, paddingBottom: 30 },
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    title: { fontSize: 26, fontWeight: "800", color: theme.textPrimary },
    subtitle: { fontSize: 14, color: theme.textSecondary, marginTop: 4 },
    errorText: { color: theme.danger, marginBottom: 12 },

    alertBanner: {
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
    },
    alertBannerTitle: { fontSize: 14, fontWeight: "900", color: theme.textPrimary },
    alertBannerMsg: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    alertBannerLink: {
      fontSize: 12,
      color: theme.textPrimary,
      fontWeight: "800",
      marginTop: 8,
    },

    alertRow: {
      flexDirection: "row",
      gap: 10 as any,
      padding: 12,
      borderRadius: 16,
      marginBottom: 10,
      borderWidth: 1,
      alignItems: "flex-start",
    },
    alertRowTitle: { fontSize: 13, fontWeight: "900", color: theme.textPrimary },
    alertRowMsg: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    alertRowMeta: { fontSize: 11, color: theme.textMuted, marginTop: 6 },

    shareCard: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 14,
      marginBottom: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    shareLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 4,
      fontWeight: "600",
    },
    shareCode: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 2,
      color: theme.textPrimary,
    },

    shareActions: { flexDirection: "row", alignItems: "center" },

    shareBtn: {
      backgroundColor: theme.primaryStrong,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
    },
    shareBtnText: { color: theme.primaryText, fontWeight: "700", fontSize: 13 },

    refreshBtn: { backgroundColor: theme.surfaceAlt },
    refreshBtnText: { color: theme.textPrimary },
    leaveBtn: {
      backgroundColor: theme.mode === "dark" ? "#3f1f2a" : "#fee2e2",
      borderColor: theme.mode === "dark" ? "#7f1d1d" : "#fecaca",
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 18,
    },
    leaveBtnText: { color: theme.danger, fontWeight: "800", fontSize: 14 },

    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    summaryCard: {
      width: "48%",
      backgroundColor: theme.surface,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 12,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    summaryCardMagnified: {
      borderRadius: 22,
      paddingVertical: 16,
      paddingHorizontal: 16,
      minHeight: 138,
    },
    summaryChip: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: theme.chip,
      marginBottom: 6,
    },
    summaryChipMagnified: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginBottom: 8,
    },
    summaryChipText: { fontSize: 12 },
    summaryChipTextMagnified: { fontSize: 14 },
    summaryLabel: { fontSize: 12, color: theme.textSecondary, marginBottom: 2 },
    summaryLabelMagnified: { fontSize: 14, marginBottom: 4 },
    summaryValue: { fontSize: 18, fontWeight: "700", color: theme.textPrimary },
    summaryValueMagnified: { fontSize: 24, fontWeight: "800" },

    goalSummaryCard: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 14,
      marginBottom: 18,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    goalSummaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    goalLabel: { fontSize: 14, fontWeight: "700", color: theme.textPrimary },
    goalTarget: { fontSize: 13, fontWeight: "700", color: theme.textSecondary },
    goalTrack: {
      width: "100%",
      height: 10,
      backgroundColor: theme.surfaceSoft,
      borderRadius: 999,
      overflow: "hidden",
    },
    goalFill: { height: 10, backgroundColor: theme.success, borderRadius: 999 },
    goalMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 6 },
    goalSpacer: { height: 12 },

    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
      marginTop: 4,
    },
    sectionTitle: { fontSize: 18, fontWeight: "700", color: theme.textPrimary },
    linkText: { fontSize: 13, color: theme.primary, fontWeight: "600" },

    memberRow: {
      flexDirection: "row",
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    memberRowMagnified: {
      borderRadius: 20,
      padding: 18,
      marginBottom: 12,
    },
    memberAvatar: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: theme.surfaceSoft,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    memberAvatarMagnified: {
      width: 54,
      height: 54,
      borderRadius: 18,
    },
    memberAvatarText: { fontSize: 20, fontWeight: "700", color: theme.textPrimary },
    memberAvatarTextMagnified: { fontSize: 24 },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 15, fontWeight: "700", color: theme.textPrimary },
    memberNameMagnified: { fontSize: 18 },
    memberRole: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
    memberRoleMagnified: { fontSize: 14, marginBottom: 6 },
    memberMetricsRow: { flexDirection: "row", justifyContent: "space-between" },
    memberMetric: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    memberMetricMagnified: { fontSize: 14, marginTop: 4 },
    memberEmptyText: { color: theme.textSecondary, fontSize: 12, marginTop: 6 },
    chevronBox: { justifyContent: "center", alignItems: "center", paddingLeft: 6 },
    chevronText: { fontSize: 22, color: theme.textMuted, marginTop: -2 },
    mutedTopText: { color: theme.textSecondary, marginTop: 4 },
    mutedBottomText: { color: theme.textSecondary, marginBottom: 10 },
    mutedText: { color: theme.textSecondary },
    chatScroll: { flex: 1, marginBottom: 10 },
    chatScrollContent: { paddingBottom: 6 },
    chatRow: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 10,
      marginBottom: 8,
    },
    chatHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8 as any,
    },
    chatAuthor: { fontSize: 12, fontWeight: "800", color: theme.textPrimary },
    chatMeta: { fontSize: 11, color: theme.textMuted },
    chatBody: { fontSize: 14, color: theme.textPrimary, marginTop: 6, lineHeight: 20 },
    chatComposerInput: {
      backgroundColor: theme.input,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 15,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
      minHeight: 52,
      maxHeight: 120,
      textAlignVertical: "top",
    },
    chatComposerInputError: {
      borderColor: theme.danger,
    },
    chatComposerErrorText: {
      color: theme.danger,
      fontSize: 12,
      marginTop: 6,
    },
    chatSendButtonDisabled: {
      opacity: 0.6,
    },
    keyboardAvoiding: { flex: 1, width: "100%" },
    chatModalBackdrop: {
      flex: 1,
      backgroundColor: theme.background,
    },
    chatModalCard: {
      flex: 1,
      borderRadius: 0,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      paddingTop: 56,
      paddingBottom: 14,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: theme.surface,
      padding: 16,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: theme.textPrimary,
      marginBottom: 6,
    },
    modalInput: {
      backgroundColor: theme.input,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      fontSize: 15,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
    },
    goalInputLabel: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 6,
      marginTop: 8,
      fontWeight: "600",
    },

    consentRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    consentLabel: { fontSize: 14, fontWeight: "700", color: theme.textPrimary },
    consentHint: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  });
}

import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../src/api";
import { getAvatarPaletteForKey, getNameInitials } from "../../src/avatar";
import { loadAppPrefs } from "../../src/prefs";
import { AppTheme, useAppTheme } from "../../src/theme-mode";

type MetricCardProps = {
  label: string;
  value: string;
  unit: string;
  accentBg: string;
  icon: string;
  magnified: boolean;
};

type Metrics = {
  heartRate: number;
  weight: number;
  steps: number;
  sleep: number;
  bloodGlucose: number; // mmol/L
  systolicBP: number; // mmHg
  diastolicBP: number; // mmHg
  cholesterol: number; // mmol/L
};

type MetricFieldKey = keyof Metrics;

type MetricInputState = Record<MetricFieldKey, string>;

type MetricFieldConfig = {
  key: MetricFieldKey;
  label: string;
  keyboardType: "decimal-pad" | "number-pad";
  min: number;
  max: number;
  integer?: boolean;
};

type UserSummary = {
  name: string;
  role: string;
  metrics: Metrics;
};

type MetricHistoryPoint = {
  heartRate: number;
  weight: number;
  steps: number;
  sleep: number;
  bloodGlucose: number;
  systolicBP: number;
  diastolicBP: number;
  cholesterol: number;
  timestamp: string;
};

type RecommendationItem = {
  title: string;
  summary?: string;
  url?: string;
  slug?: string;
  severity?: "info" | "urgent" | "warning";
  source?: string;
};

type FamilyGoals = {
  steps: number;
  sleep: number;
};

type MedicationItem = {
  name: string;
  detail: string;
  schedule: string;
};

type PreventiveCareItem = {
  name: string;
  due: string;
  cadence: string;
  detail?: string;
};

type TrendMetricKey =
  | "steps"
  | "sleep"
  | "weight"
  | "heartRate"
  | "bloodGlucose"
  | "systolicBP"
  | "diastolicBP"
  | "cholesterol";

const TABS = [
  "Trends",
  "Recommendations",
  "Medications",
  "Goals",
  "Preventative Care",
];

const METRIC_FIELDS: MetricFieldConfig[] = [
  { key: "heartRate", label: "Heart Rate (bpm)", keyboardType: "number-pad", min: 30, max: 240, integer: true },
  { key: "weight", label: "Weight (kg)", keyboardType: "decimal-pad", min: 1, max: 500 },
  { key: "steps", label: "Steps", keyboardType: "number-pad", min: 0, max: 100000, integer: true },
  { key: "sleep", label: "Sleep (hrs)", keyboardType: "decimal-pad", min: 0, max: 24 },
  { key: "bloodGlucose", label: "Blood Glucose (mmol/L)", keyboardType: "decimal-pad", min: 0.1, max: 40 },
  { key: "systolicBP", label: "Systolic BP (mmHg)", keyboardType: "number-pad", min: 50, max: 260, integer: true },
  { key: "diastolicBP", label: "Diastolic BP (mmHg)", keyboardType: "number-pad", min: 30, max: 180, integer: true },
  { key: "cholesterol", label: "Cholesterol (mmol/L)", keyboardType: "decimal-pad", min: 0.1, max: 20 },
];

const EMPTY_METRIC_INPUTS: MetricInputState = {
  heartRate: "",
  weight: "",
  steps: "",
  sleep: "",
  bloodGlucose: "",
  systolicBP: "",
  diastolicBP: "",
  cholesterol: "",
};

const ALL_METRIC_FIELDS_TOUCHED: Record<MetricFieldKey, boolean> = {
  heartRate: true,
  weight: true,
  steps: true,
  sleep: true,
  bloodGlucose: true,
  systolicBP: true,
  diastolicBP: true,
  cholesterol: true,
};

const INITIAL_METRIC_TOUCHED: Record<MetricFieldKey, boolean> = {
  heartRate: false,
  weight: false,
  steps: false,
  sleep: false,
  bloodGlucose: false,
  systolicBP: false,
  diastolicBP: false,
  cholesterol: false,
};

const BASE_URL = getApiBaseUrl();

function formatMetricRangeValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function metricInputsFromMetrics(metrics?: Partial<Metrics> | null): MetricInputState {
  return {
    heartRate:
      metrics?.heartRate === undefined || metrics.heartRate === null
        ? ""
        : String(metrics.heartRate),
    weight:
      metrics?.weight === undefined || metrics.weight === null ? "" : String(metrics.weight),
    steps: metrics?.steps === undefined || metrics.steps === null ? "" : String(metrics.steps),
    sleep: metrics?.sleep === undefined || metrics.sleep === null ? "" : String(metrics.sleep),
    bloodGlucose:
      metrics?.bloodGlucose === undefined || metrics.bloodGlucose === null
        ? ""
        : String(metrics.bloodGlucose),
    systolicBP:
      metrics?.systolicBP === undefined || metrics.systolicBP === null
        ? ""
        : String(metrics.systolicBP),
    diastolicBP:
      metrics?.diastolicBP === undefined || metrics.diastolicBP === null
        ? ""
        : String(metrics.diastolicBP),
    cholesterol:
      metrics?.cholesterol === undefined || metrics.cholesterol === null
        ? ""
        : String(metrics.cholesterol),
  };
}

function validateMetricInputs(inputs: MetricInputState): {
  errors: Partial<Record<MetricFieldKey, string>>;
  payload: Metrics | null;
} {
  const errors: Partial<Record<MetricFieldKey, string>> = {};
  const parsed = {} as Metrics;

  for (const field of METRIC_FIELDS) {
    const raw = inputs[field.key].trim();

    if (!raw) {
      errors[field.key] = `${field.label} is required.`;
      continue;
    }

    const number = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(number)) {
      errors[field.key] = `Enter a valid ${field.integer ? "whole " : ""}number for ${field.label.toLowerCase()}.`;
      continue;
    }

    if (field.integer && !Number.isInteger(number)) {
      errors[field.key] = `${field.label} must be a whole number.`;
      continue;
    }

    if (number < field.min || number > field.max) {
      errors[field.key] = `${field.label} must be between ${formatMetricRangeValue(field.min)} and ${formatMetricRangeValue(field.max)}.`;
      continue;
    }

    parsed[field.key] = field.integer ? Math.trunc(number) : number;
  }

  return {
    errors,
    payload: Object.keys(errors).length === 0 ? parsed : null,
  };
}

async function authFetch(url: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync("token");

  if (!token) {
    Alert.alert("Session expired", "Please log in again.");
    router.replace("/(auth)/login");
    return null;
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  return fetch(url, { ...options, headers });
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const styles = useHomeStyles();
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState("Trends");

  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [history, setHistory] = useState<MetricHistoryPoint[]>([]);

  // ✅ family name on Home page
  const [familyName, setFamilyName] = useState<string>("My Family");

  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState<string>("Your profile");
  const [profileRole, setProfileRole] = useState<string>("Self");

  // ✅ recommendations
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [preventiveCare, setPreventiveCare] = useState<PreventiveCareItem[]>([]);
  const [preventiveCareLoading, setPreventiveCareLoading] = useState(false);
  const [familyGoals, setFamilyGoals] = useState<FamilyGoals>({
    steps: 10000,
    sleep: 8,
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [metricInputs, setMetricInputs] = useState<MetricInputState>(EMPTY_METRIC_INPUTS);
  const [metricTouched, setMetricTouched] = useState<Record<MetricFieldKey, boolean>>(
    INITIAL_METRIC_TOUCHED
  );
  const [metricSubmitAttempted, setMetricSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [magnifiedCardsEnabled, setMagnifiedCardsEnabled] = useState(false);

  const metricValidation = React.useMemo(
    () => validateMetricInputs(metricInputs),
    [metricInputs]
  );
  const metricErrorCount = Object.keys(metricValidation.errors).length;
  const canSaveMetrics = metricErrorCount === 0;

  const formatSteps = (steps: number | undefined) => {
    if (steps === undefined || steps === null) return "--";
    if (steps >= 1000) return `${Math.round(steps / 1000)}k`;
    return String(steps);
  };

  // ✅ load family name (FIXED: backend returns {id, name})
  const loadFamilyName = async () => {
    try {
      const res = await authFetch(`${BASE_URL}/me/family`);
      if (!res) return;
      if (!res.ok) return;

      const data: { id: number; name: string } = await res.json();
      if (data?.name) setFamilyName(data.name);
    } catch {
      // silent
    }
  };

  // ✅ load profile name even if no metrics yet
  const loadProfileName = async () => {
    try {
      const res = await authFetch(`${BASE_URL}/me`);
      if (!res) return;
      if (!res.ok) return;

      const me: { id?: number; name?: string; role?: string } = await res.json();
      if (typeof me?.id === "number") setProfileId(me.id);
      if (me?.name) setProfileName(me.name);
      if (me?.role) setProfileRole(me.role);
    } catch {
      // silent
    }
  };

  const loadFamilyGoals = async () => {
    try {
      const res = await authFetch(`${BASE_URL}/family/goals`);
      if (!res) return;
      if (!res.ok) return;

      const data: FamilyGoals = await res.json();
      if (
        typeof data?.steps === "number" &&
        Number.isFinite(data.steps) &&
        typeof data?.sleep === "number" &&
        Number.isFinite(data.sleep)
      ) {
        setFamilyGoals({ steps: data.steps, sleep: data.sleep });
      }
    } catch {
      // silent fallback to defaults
    }
  };

  const loadSummary = async () => {
    try {
      setLoading(true);

      const res = await authFetch(`${BASE_URL}/me/summary`);
      if (!res) return;

      if (res.status === 404) {
        setSummary(null);
        setMetricInputs(EMPTY_METRIC_INPUTS);
        return;
      }

      if (!res.ok) throw new Error("Failed to load summary");

      const data: UserSummary = await res.json();
      setSummary(data);

      // also update fallback name/role so avatar stays correct
      if (data?.name) setProfileName(data.name);
      if (data?.role) setProfileRole(data.role);

      setMetricInputs(metricInputsFromMetrics(data.metrics));
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", "Could not load your health data.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await authFetch(`${BASE_URL}/me/metrics/history`);
      if (!res) return;

      if (res.status === 404) {
        setHistory([]);
        return;
      }

      if (!res.ok) throw new Error("Failed to load history");

      const data: MetricHistoryPoint[] = await res.json();
      setHistory(data);
    } catch (err) {
      console.error("History error:", err);
    }
  };

  // ✅ NEW: load NHS-based recommendations (from backend /me/recommendations)
  const loadRecommendations = async () => {
    try {
      setRecsLoading(true);
      const res = await authFetch(`${BASE_URL}/me/recommendations`);
      if (!res) return;

      if (res.status === 404) {
        // No metrics yet on backend => no recommendations
        setRecs([]);
        return;
      }

      if (!res.ok) {
        // backend might return 500 if NHS_API_KEY not set, etc.
        console.log("Recommendations HTTP error:", res.status);
        setRecs([]);
        return;
      }

      const data: RecommendationItem[] = await res.json();
      setRecs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Recommendations error:", err);
      setRecs([]);
    } finally {
      setRecsLoading(false);
    }
  };

  const loadPreventiveCare = async () => {
    try {
      setPreventiveCareLoading(true);
      const res = await authFetch(`${BASE_URL}/me/preventive-care`);
      if (!res) return;

      if (res.status === 404) {
        setPreventiveCare([]);
        return;
      }

      if (!res.ok) {
        console.log("Preventive care HTTP error:", res.status);
        setPreventiveCare([]);
        return;
      }

      const data: PreventiveCareItem[] = await res.json();
      setPreventiveCare(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Preventive care error:", err);
      setPreventiveCare([]);
    } finally {
      setPreventiveCareLoading(false);
    }
  };

  const loadMagnificationPreference = async () => {
    try {
      const prefs = await loadAppPrefs();
      setMagnifiedCardsEnabled(!!prefs.magnifiedCardsEnabled);
    } catch {
      // keep default
    }
  };

  useEffect(() => {
    loadMagnificationPreference();
    loadFamilyName();
    loadProfileName();
    loadFamilyGoals();
    loadSummary();
    loadHistory();
    loadRecommendations();
    loadPreventiveCare();
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    loadMagnificationPreference();
    loadProfileName();
    loadSummary();
    loadPreventiveCare();
  }, [isFocused]);

  const openLogHealthModal = () => {
    setMetricInputs(metricInputsFromMetrics(summary?.metrics));
    setMetricTouched(INITIAL_METRIC_TOUCHED);
    setMetricSubmitAttempted(false);
    setModalVisible(true);
  };

  const updateMetricInput = (key: MetricFieldKey, value: string) => {
    setMetricInputs((current) => ({ ...current, [key]: value }));
  };

  const markMetricTouched = (key: MetricFieldKey) => {
    setMetricTouched((current) => ({ ...current, [key]: true }));
  };

  const saveHealthData = async () => {
    setMetricSubmitAttempted(true);
    setMetricTouched(ALL_METRIC_FIELDS_TOUCHED);

    if (!metricValidation.payload) return;

    const payload = metricValidation.payload;

    try {
      setSaving(true);

      const res = await authFetch(`${BASE_URL}/me/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res) return;

      if (!res.ok) {
        const raw = await res.text();
        let detail = raw || `Request failed (${res.status})`;
        try {
          const parsed = raw ? JSON.parse(raw) : null;
          const parsedDetail = parsed?.detail;
          if (typeof parsedDetail === "string" && parsedDetail.trim()) {
            detail = parsedDetail;
          }
        } catch {
          // keep raw detail fallback
        }
        throw new Error(detail);
      }

      const updated: UserSummary = await res.json();
      setSummary(updated);
      setMetricInputs(metricInputsFromMetrics(updated.metrics));
      setMetricTouched(INITIAL_METRIC_TOUCHED);
      setMetricSubmitAttempted(false);

      // refresh name/role just in case
      if (updated?.name) setProfileName(updated.name);
      if (updated?.role) setProfileRole(updated.role);

      await loadHistory();
      await loadRecommendations(); // ✅ refresh recommendations after saving new data
      await loadPreventiveCare();
      setModalVisible(false);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Could not save your health data.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const metrics = summary?.metrics;
  const profileAvatarPalette = getAvatarPaletteForKey(
    theme,
    profileId ?? summary?.name ?? profileName
  );

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.appBar}>
          <View style={styles.appBarLeft}>
            <View style={styles.logoBox}>
              <Text style={styles.logoIcon}>♡</Text>
            </View>
            <View>
              <Text style={styles.appName}>CheckMi</Text>
              <Text style={styles.familyNameText}>{familyName}</Text>
            </View>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileHeaderRow}>
            <View
              style={[
                styles.profileAvatar,
                { backgroundColor: profileAvatarPalette.background },
              ]}
            >
              <Text style={[styles.profileInitial, { color: profileAvatarPalette.text }]}>
                {getNameInitials(summary?.name ?? profileName)}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {summary?.name ?? profileName}
              </Text>
              <Text style={styles.profileRole}>
                {summary?.role ?? profileRole}
              </Text>

              {!summary ? (
                <Text style={styles.emptyHint}>
                  No data yet — tap “Log Health Data” to add your first entry.
                </Text>
              ) : null}
            </View>
          </View>

          <TouchableOpacity style={styles.logButton} onPress={openLogHealthModal}>
            <Text style={styles.logButtonText}>+ Log Health Data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard
            label="Heart Rate"
            value={metrics ? String(metrics.heartRate) : "--"}
            unit="bpm"
            icon="❤️"
            accentBg="#ffe4ea"
            magnified={magnifiedCardsEnabled}
          />
          <MetricCard
            label="Weight"
            value={metrics ? String(metrics.weight) : "--"}
            unit="kg"
            icon="⚖️"
            accentBg="#fff2cc"
            magnified={magnifiedCardsEnabled}
          />
          <MetricCard
            label="Steps"
            value={metrics ? formatSteps(metrics.steps) : "--"}
            unit=""
            icon="📈"
            accentBg="#e6ffef"
            magnified={magnifiedCardsEnabled}
          />
          <MetricCard
            label="Sleep"
            value={metrics ? String(metrics.sleep) : "--"}
            unit="hrs"
            icon="🌙"
            accentBg="#e8edff"
            magnified={magnifiedCardsEnabled}
          />
          <MetricCard
            label="Blood Glucose"
            value={metrics ? String(metrics.bloodGlucose) : "--"}
            unit="mmol/L"
            icon="🩸"
            accentBg="#fee2e2"
            magnified={magnifiedCardsEnabled}
          />
          <MetricCard
            label="Systolic BP"
            value={metrics ? String(metrics.systolicBP) : "--"}
            unit="mmHg"
            icon="🫀"
            accentBg="#e0f2fe"
            magnified={magnifiedCardsEnabled}
          />
          <MetricCard
            label="Diastolic BP"
            value={metrics ? String(metrics.diastolicBP) : "--"}
            unit="mmHg"
            icon="🫀"
            accentBg="#e0f2fe"
            magnified={magnifiedCardsEnabled}
          />
          <MetricCard
            label="Cholesterol"
            value={metrics ? String(metrics.cholesterol) : "--"}
            unit="mmol/L"
            icon="🥚"
            accentBg="#fef3c7"
            magnified={magnifiedCardsEnabled}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {TABS.map((tab) => {
            const active = tab === activeTab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabChip, active && styles.tabChipActive]}
                onPress={() => {
                  if (tab === "Medications") {
                    router.push("/medications" as any);
                    return;
                  }
                  setActiveTab(tab);
                }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {activeTab === "Trends" && <TrendsSection history={history} />}
        
        {activeTab === "Medications" && <MedicationsSection metrics={metrics} />}
        {activeTab === "Goals" && (
          <GoalsSection metrics={metrics} goals={familyGoals} />
        )}
        {activeTab === "Recommendations" && (
          <RecommendationsSection recs={recs} loading={recsLoading} />
        )}
        {activeTab === "Preventative Care" && (
          <PreventativeCareSection
            items={preventiveCare}
            loading={preventiveCareLoading}
          />
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ScrollView
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalTitle}>Log Health Data</Text>

                {metricSubmitAttempted && metricErrorCount > 0 ? (
                  <Text style={styles.modalErrorText}>
                    Please fix the highlighted fields before saving.
                  </Text>
                ) : null}

                {METRIC_FIELDS.map((field, index) => {
                  const error =
                    metricTouched[field.key] || metricSubmitAttempted
                      ? metricValidation.errors[field.key]
                      : undefined;

                  return (
                    <View key={field.key}>
                      <Text style={styles.modalLabel}>{field.label}</Text>
                      <TextInput
                        style={[styles.input, error && styles.inputError]}
                        keyboardType={field.keyboardType}
                        value={metricInputs[field.key]}
                        onChangeText={(value) => updateMetricInput(field.key, value)}
                        onBlur={() => markMetricTouched(field.key)}
                        returnKeyType={index === METRIC_FIELDS.length - 1 ? "done" : "next"}
                        autoCapitalize="none"
                        editable={!saving}
                      />
                      {error ? <Text style={styles.inputHelpText}>{error}</Text> : null}
                    </View>
                  );
                })}

                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancel]}
                    onPress={() => setModalVisible(false)}
                    disabled={saving}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.modalSave,
                      (!canSaveMetrics || saving) && styles.modalButtonDisabled,
                    ]}
                    onPress={saveHealthData}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={styles.modalSaveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function MetricCard({
  label,
  value,
  unit,
  accentBg,
  icon,
  magnified,
}: MetricCardProps) {
  const styles = useHomeStyles();

  return (
    <View style={[styles.metricCard, magnified && styles.metricCardMagnified]}>
      <View style={[styles.metricTopRow, magnified && styles.metricTopRowMagnified]}>
        <Text style={[styles.metricLabel, magnified && styles.metricLabelMagnified]}>
          {label}
        </Text>
        <View
          style={[
            styles.metricIconBox,
            magnified && styles.metricIconBoxMagnified,
            { backgroundColor: accentBg },
          ]}
        >
          <Text style={[styles.metricIcon, magnified && styles.metricIconMagnified]}>
            {icon}
          </Text>
        </View>
      </View>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, magnified && styles.metricValueMagnified]}>
          {value}
        </Text>
        {unit ? (
          <Text style={[styles.metricUnit, magnified && styles.metricUnitMagnified]}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}


type SelectOption<T extends string> = { label: string; value: T };

function SelectSheet<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
}) {
  const styles = useHomeStyles();
  const [open, setOpen] = React.useState(false);

  const currentLabel =
    options.find((o) => o.value === value)?.label ?? String(value);

  return (
    <>
      <Text style={styles.controlLabel}>{label}</Text>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setOpen(true)}
        style={styles.selectPill}
      >
        <Text style={styles.selectPillText} numberOfLines={1}>
          {currentLabel}
        </Text>
        <Text style={styles.selectChevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setOpen(false)}
          style={styles.sheetBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{label}</Text>

            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  activeOpacity={0.9}
                  style={[
                    styles.sheetOption,
                    selected && styles.sheetOptionSelected,
                  ]}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sheetOptionText,
                      selected && styles.sheetOptionTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {selected ? <Text style={styles.sheetTick}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setOpen(false)}
              style={styles.sheetCancel}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function TrendsSection({ history }: { history: MetricHistoryPoint[] }) {
  const styles = useHomeStyles();
  type Range = "Daily" | "Weekly" | "Monthly";

  const [range, setRange] = React.useState<Range>("Daily");
  const [metricKey, setMetricKey] = React.useState<TrendMetricKey>("steps");

  if (!history || history.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trends</Text>
        <Text style={styles.emptyText}>
          No history yet. Log some health data to see trends.
        </Text>
      </View>
    );
  }

  const metricLabel: Record<TrendMetricKey, string> = {
    steps: "Steps",
    sleep: "Sleep (hrs)",
    weight: "Weight (kg)",
    heartRate: "Heart Rate (bpm)",
    bloodGlucose: "Blood Glucose (mmol/L)",
    systolicBP: "Systolic BP (mmHg)",
    diastolicBP: "Diastolic BP (mmHg)",
    cholesterol: "Cholesterol (mmol/L)",
  };

  const metricUnit: Record<TrendMetricKey, string> = {
    steps: "steps",
    sleep: "hrs",
    weight: "kg",
    heartRate: "bpm",
    bloodGlucose: "mmol/L",
    systolicBP: "mmHg",
    diastolicBP: "mmHg",
    cholesterol: "mmol/L",
  };

  const rangeOptions: SelectOption<Range>[] = [
    { label: "Daily", value: "Daily" },
    { label: "Weekly", value: "Weekly" },
    { label: "Monthly", value: "Monthly" },
  ];

  const metricOptions: SelectOption<TrendMetricKey>[] = [
    { label: "Steps", value: "steps" },
    { label: "Sleep (hrs)", value: "sleep" },
    { label: "Weight (kg)", value: "weight" },
    { label: "Heart Rate (bpm)", value: "heartRate" },
    { label: "Blood Glucose (mmol/L)", value: "bloodGlucose" },
    { label: "Systolic BP (mmHg)", value: "systolicBP" },
    { label: "Diastolic BP (mmHg)", value: "diastolicBP" },
    { label: "Cholesterol (mmol/L)", value: "cholesterol" },
  ];

  const parseDate = (ts: string) => {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  };

  const startOfWeek = (d: Date) => {
    const copy = new Date(d);
    const day = copy.getDay(); // 0=Sun..6=Sat
    const diff = (day === 0 ? -6 : 1) - day; // Monday start
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const startOfMonth = (d: Date) => {
    const copy = new Date(d.getFullYear(), d.getMonth(), 1);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const fmtDay = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const fmtWeek = (d: Date) => {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${fmtDay(d)}–${fmtDay(end)}`;
  };

  const fmtMonth = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", year: "numeric" });

  type Bucket = {
    key: string;
    label: string;
    timestamp: string;
    value: number;
    count: number;
  };

  const entriesSorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const bucketsMap = new Map<string, Bucket>();

  for (const e of entriesSorted) {
    const d = parseDate(e.timestamp);
    if (!d) continue;

    let bucketDate: Date;
    let key: string;
    let label: string;

    if (range === "Daily") {
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      bucketDate = dd;
      key = dd.toISOString();
      label = fmtDay(dd);
    } else if (range === "Weekly") {
      const wk = startOfWeek(d);
      bucketDate = wk;
      key = wk.toISOString();
      label = fmtWeek(wk);
    } else {
      const mo = startOfMonth(d);
      bucketDate = mo;
      key = mo.toISOString();
      label = fmtMonth(mo);
    }

    const raw = (e as any)[metricKey];
    const value = typeof raw === "number" && !isNaN(raw) ? raw : 0;

    const existing = bucketsMap.get(key);
    if (!existing) {
      bucketsMap.set(key, {
        key,
        label,
        timestamp: bucketDate.toISOString(),
        value,
        count: 1,
      });
    } else {
      existing.value += value;
      existing.count += 1;
    }
  }

  const useAverage = metricKey !== "steps";

  const buckets: Bucket[] = Array.from(bucketsMap.values())
    .map((b) => ({
      ...b,
      value: useAverage ? b.value / b.count : b.value,
    }))
    .sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  const shown = buckets.slice(-7);
  const maxValue = Math.max(...shown.map((b) => b.value || 0), 1);

  const formatValue = (val: number) => {
    if (useAverage) return Number(val.toFixed(1));
    return Math.round(val);
  };

  const barColorByMetric: Record<TrendMetricKey, string> = {
    steps: "#16a34a60",
    sleep: "#4f46e560",
    weight: "#f9731660",
    heartRate: "#ef444460",
    bloodGlucose: "#22c55e60",
    systolicBP: "#0ea5e960",
    diastolicBP: "#38bdf860",
    cholesterol: "#facc1560",
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Trends</Text>

      <View style={styles.trendControlsRow}>
        <View style={{ flex: 1 }}>
          <SelectSheet
            label="Range"
            value={range}
            options={rangeOptions}
            onChange={setRange}
          />
        </View>

        <View style={{ width: 12 }} />

        <View style={{ flex: 1 }}>
          <SelectSheet
            label="Metric"
            value={metricKey}
            options={metricOptions}
            onChange={setMetricKey}
          />
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>
          {metricLabel[metricKey]} • {range} (last {shown.length})
        </Text>

        <View
          style={[
            styles.chartBody,
            { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8 },
          ]}
        >
          {shown.map((b) => {
            const h = Math.max(10, (b.value / maxValue) * 100);
            return (
              <View
                key={b.key}
                style={{
                  flex: 1,
                  justifyContent: "flex-end",
                  alignItems: "center",
                  paddingHorizontal: 4,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: h,
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    backgroundColor: barColorByMetric[metricKey],
                  }}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.detailList}>
          {shown
            .slice()
            .reverse()
            .map((b) => (
              <View key={b.key} style={styles.detailRow}>
                <Text style={styles.detailDate}>{b.label}</Text>
                <Text style={styles.detailValue}>
                  {formatValue(b.value)} {metricUnit[metricKey]}
                </Text>
              </View>
            ))}
        </View>
      </View>
    </View>
  );
}

function MedicationsSection({ metrics }: { metrics?: Metrics }) {
  const styles = useHomeStyles();
  const meds: MedicationItem[] = [];

  if (!metrics) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Medications</Text>
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>No medication plan yet.</Text>
          <Text style={styles.listSubtitle}>
            Log health data first, then use this section for medication reminders.
          </Text>
        </View>
      </View>
    );
  }

  if (metrics.systolicBP >= 140 || metrics.diastolicBP >= 90) {
    meds.push({
      name: "Blood Pressure Check-in",
      detail: "Review treatment plan with your clinician",
      schedule: "Weekly reminder",
    });
  }

  if (metrics.bloodGlucose > 7.8) {
    meds.push({
      name: "Glucose Plan Review",
      detail: "Discuss medication timing and adherence",
      schedule: "Weekly reminder",
    });
  }

  if (metrics.cholesterol > 5.0) {
    meds.push({
      name: "Cholesterol Management Review",
      detail: "Discuss lipid-lowering options with your clinician",
      schedule: "Monthly reminder",
    });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Medications</Text>

      {meds.length === 0 ? (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>No medication reminders needed right now.</Text>
          <Text style={styles.listSubtitle}>
            Your latest metrics do not currently trigger medication review prompts.
          </Text>
        </View>
      ) : (
        meds.map((m, i) => (
          <View key={i} style={styles.listCard}>
            <Text style={styles.listTitle}>{m.name}</Text>
            <Text style={styles.listSubtitle}>{m.detail}</Text>
            <Text style={styles.listSubtitle}>{m.schedule}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function GoalsSection({
  metrics,
  goals,
}: {
  metrics?: Metrics;
  goals: FamilyGoals;
}) {
  const styles = useHomeStyles();
  const safeNumber = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value;
  };

  const clampPercent = (progress: number | null, goal: number) => {
    if (progress === null || !Number.isFinite(goal) || goal <= 0) return 0;
    return Math.max(0, Math.min((progress / goal) * 100, 100));
  };

  const formatValue = (value: number | null, decimals = 0) => {
    if (value === null) return "--";
    if (decimals > 0) return Number(value.toFixed(decimals)).toString();
    return Math.round(value).toString();
  };

  const goalsRows = [
    {
      label: "Daily Steps",
      progress: safeNumber(metrics?.steps),
      goal: goals.steps,
      suffix: "steps",
      decimals: 0,
    },
    {
      label: "Sleep",
      progress: safeNumber(metrics?.sleep),
      goal: goals.sleep,
      suffix: "h",
      decimals: 1,
    },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Health Goals</Text>
      {goalsRows.map((g, i) => {
        const percent = clampPercent(g.progress, g.goal);
        return (
          <View key={i} style={styles.goalCard}>
            <Text style={styles.listTitle}>{g.label}</Text>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>

            <Text style={styles.goalText}>
              {formatValue(g.progress, g.decimals)} / {formatValue(g.goal, g.decimals)} {g.suffix}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RecommendationsSection({
  recs,
  loading,
}: {
  recs: RecommendationItem[];
  loading: boolean;
}) {
  const styles = useHomeStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Personalised Recommendations</Text>

      {loading ? (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Loading recommendations…</Text>
        </View>
      ) : recs.length === 0 ? (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>No recommendations yet.</Text>
          <Text style={styles.listSubtitle}>
            Log health data to see NHS-based advice.
          </Text>
        </View>
      ) : (
        recs.map((r, i) => (
          <View key={i} style={styles.listCard}>
            <Text style={styles.listTitle}>
              {r.severity === "urgent" ? "⚠️ " : ""}{r.title}
            </Text>

            {r.summary ? (
              <Text style={styles.listSubtitle}>{r.summary}</Text>
            ) : null}

            {r.url ? (
              <TouchableOpacity
                style={{ marginTop: 10 }}
                onPress={() => Linking.openURL(r.url!)}
              >
                <Text style={[styles.listSubtitle, { textDecorationLine: "underline" }]}>
                  Read more (NHS)
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function PreventativeCareSection({
  items,
  loading,
}: {
  items: PreventiveCareItem[];
  loading: boolean;
}) {
  const styles = useHomeStyles();
  const formatDue = (due: string) => {
    const parsed = new Date(due);
    if (Number.isNaN(parsed.getTime())) return due;
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Preventative Care</Text>
      {loading ? (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Loading preventative care…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>No preventative care items yet.</Text>
          <Text style={styles.listSubtitle}>
            Log health data to generate personalized follow-up items.
          </Text>
        </View>
      ) : (
        items.map((it, i) => (
          <View key={`${it.name}-${i}`} style={styles.listCard}>
            <Text style={styles.listTitle}>{it.name}</Text>
            <Text style={styles.listSubtitle}>Due: {formatDue(it.due)}</Text>
            <Text style={styles.listSubtitle}>{it.cadence}</Text>
            {it.detail ? (
              <Text style={[styles.listSubtitle, { marginTop: 4 }]}>{it.detail}</Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function useHomeStyles() {
  const theme = useAppTheme();
  return React.useMemo(() => createStyles(theme), [theme]);
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { paddingTop: 50, paddingHorizontal: 20, paddingBottom: 40 },

    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

    appBar: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
    appBarLeft: { flexDirection: "row", alignItems: "center" },
    logoBox: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: "#fb4a8a",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 8,
    },
    logoIcon: { color: "#fff", fontSize: 18 },
    appName: { fontSize: 20, fontWeight: "800", color: theme.textPrimary },
    familyNameText: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

    profileCard: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 18,
      marginBottom: 18,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.05,
      shadowOffset: { width: 0, height: 4 },
    },

    profileHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    profileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 20,
      backgroundColor: theme.surfaceSoft,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    profileInitial: { fontSize: 26, fontWeight: "700", color: theme.textPrimary },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 20, fontWeight: "800", color: theme.textPrimary },
    profileRole: { fontSize: 14, color: theme.textSecondary, marginTop: 2 },
    emptyHint: { color: theme.textSecondary, marginTop: 6 },

    logButton: {
      backgroundColor: theme.primaryStrong,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: "center",
    },
    logButtonText: { color: theme.primaryText, fontWeight: "600", fontSize: 15 },

    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },

    metricCard: {
      width: "48%",
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 14,
      marginBottom: 12,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    metricCardMagnified: {
      borderRadius: 24,
      padding: 18,
      minHeight: 136,
    },

    metricTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    metricTopRowMagnified: {
      marginBottom: 12,
    },
    metricLabel: { fontSize: 13, color: theme.textSecondary, fontWeight: "500" },
    metricLabelMagnified: {
      fontSize: 15,
      fontWeight: "700",
    },
    metricIconBox: {
      width: 30,
      height: 30,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    metricIconBoxMagnified: {
      width: 38,
      height: 38,
      borderRadius: 14,
    },
    metricIcon: { fontSize: 16 },
    metricIconMagnified: {
      fontSize: 20,
    },

    metricValueRow: { flexDirection: "row", alignItems: "flex-end" },
    metricValue: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.textPrimary,
      marginRight: 4,
    },
    metricValueMagnified: {
      fontSize: 26,
    },
    metricUnit: { fontSize: 13, color: theme.textMuted },
    metricUnitMagnified: {
      fontSize: 15,
    },

    tabsRow: { flexDirection: "row", marginVertical: 16 },
    tabChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: theme.chip,
      borderRadius: 999,
      marginRight: 8,
    },
    tabChipActive: {
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.18 : 0.1,
      shadowOffset: { width: 0, height: 3 },
    },
    tabText: { fontSize: 13, color: theme.textSecondary },
    tabTextActive: { color: theme.textPrimary, fontWeight: "700" },

    trendControlsRow: { flexDirection: "row", marginBottom: 12 },
    controlLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 6,
      fontWeight: "600",
    },

    selectPill: {
      backgroundColor: theme.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 44,
    },
    selectPillText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.textPrimary,
      flex: 1,
      marginRight: 10,
    },
    selectChevron: { fontSize: 14, color: theme.textSecondary, fontWeight: "900" },

    sheetBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: "flex-end",
    },
    sheetCard: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 22,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: theme.textPrimary,
      marginBottom: 10,
    },
    sheetOption: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetOptionSelected: { backgroundColor: theme.surfaceAlt },
    sheetOptionText: { fontSize: 14, fontWeight: "700", color: theme.textPrimary },
    sheetOptionTextSelected: { color: theme.textPrimary },
    sheetTick: { fontSize: 16, fontWeight: "900", color: theme.textPrimary },
    sheetCancel: {
      marginTop: 10,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: "center",
    },
    sheetCancelText: { fontSize: 14, fontWeight: "700", color: theme.textPrimary },

    chartCard: {
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 14,
      marginBottom: 12,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    chartTitle: { fontSize: 15, fontWeight: "700", color: theme.textPrimary, marginBottom: 10 },
    chartBody: {
      height: 120,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      justifyContent: "flex-end",
    },

    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 12,
    },

    listCard: {
      backgroundColor: theme.surface,
      padding: 14,
      borderRadius: 16,
      marginBottom: 10,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    listTitle: { fontSize: 15, fontWeight: "600", color: theme.textPrimary },
    listSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
    emptyText: { color: theme.textSecondary },

    goalCard: { marginBottom: 16 },
    progressBar: {
      width: "100%",
      height: 10,
      backgroundColor: theme.surfaceSoft,
      borderRadius: 6,
      marginVertical: 6,
    },
    progressFill: { height: 10, backgroundColor: theme.success, borderRadius: 6 },
    goalText: { fontSize: 13, color: theme.textSecondary },

    modalRoot: { flex: 1 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
      maxHeight: "80%",
    },
    modalContent: { paddingBottom: 8 },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 16,
      color: theme.textPrimary,
    },
    modalLabel: { fontSize: 14, marginTop: 8, marginBottom: 4, color: theme.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.input,
      color: theme.textPrimary,
    },
    inputError: {
      borderColor: theme.danger,
    },
    inputHelpText: {
      color: theme.danger,
      fontSize: 12,
      marginTop: 4,
    },
    modalButtonsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
    modalButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      marginLeft: 8,
    },
    modalButtonDisabled: {
      opacity: 0.55,
    },
    modalCancel: { backgroundColor: theme.surfaceAlt },
    modalSave: { backgroundColor: theme.primaryStrong },
    modalCancelText: { color: theme.textSecondary, fontWeight: "500" },
    modalSaveText: { color: theme.primaryText, fontWeight: "600" },
    modalErrorText: {
      color: theme.danger,
      marginBottom: 8,
      fontSize: 13,
      fontWeight: "600",
    },

    detailList: {
      marginTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 6,
    },
    detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    detailDate: { fontSize: 12, color: theme.textSecondary },
    detailValue: { fontSize: 12, fontWeight: "600", color: theme.textPrimary },
  });
}

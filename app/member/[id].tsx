import { useIsFocused } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../src/api";
import { getAvatarPaletteForKey, getNameInitials } from "../../src/avatar";
import { loadAppPrefs } from "../../src/prefs";
import { AppTheme, useAppTheme } from "../../src/theme-mode";

/* ---------- TYPES ---------- */
type BackendMetrics = {
  heartRate?: number | null;
  weight?: number | null;
  steps?: number | null;
  sleep?: number | null;
  bloodGlucose?: number | null;
  systolicBP?: number | null;
  diastolicBP?: number | null;
  cholesterol?: number | null;
};

type BackendFamilyMemberSummary = {
  id: number;
  name: string;
  role: string;
  metrics: BackendMetrics | null;
};

type MetricHistoryPoint = BackendMetrics & { timestamp: string };

type RecommendationItem = {
  title: string;
  summary?: string;
  url?: string;
  slug?: string;
  severity?: "info" | "urgent" | "warning";
  source?: string;
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

type Range = "Daily" | "Weekly" | "Monthly";

const TABS = [
  "Trends",
  "Recommendations",
  "Medications",
  "Goals",
  "Preventative Care",
];

/* ---------- BASE URL + AUTH FETCH ---------- */
const BASE_URL = getApiBaseUrl();

function useThemedStyles() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  return { theme, styles };
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

/* ---------- SMALL HELPERS ---------- */
function isNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const formatSteps = (steps: number | null | undefined) => {
  if (!isNumber(steps)) return "--";
  if (steps >= 1000) return `${Math.round(steps / 1000)}k`;
  return String(steps);
};

function displayMetric(
  m: BackendMetrics | null,
  key: TrendMetricKey,
  unit?: string
) {
  if (!m) return "--";
  const v = (m as any)[key];
  if (v === null || v === undefined) return "Not shared";
  if (!isNumber(v)) return "--";
  return unit ? `${v} ${unit}` : String(v);
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
  const { styles } = useThemedStyles();
  const [open, setOpen] = useState(false);
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

/* ---------- SCREEN ---------- */
export default function MemberPage() {
  const { theme, styles } = useThemedStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isFocused = useIsFocused();

  const [activeTab, setActiveTab] = useState("Trends");

  const [member, setMember] = useState<BackendFamilyMemberSummary | null>(null);
  const [history, setHistory] = useState<MetricHistoryPoint[]>([]);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [preventiveCare, setPreventiveCare] = useState<PreventiveCareItem[]>([]);
  const [preventiveCareLoading, setPreventiveCareLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [magnifiedCardsEnabled, setMagnifiedCardsEnabled] = useState(false);

  // trends controls
  const [range, setRange] = useState<Range>("Daily");
  const [metricKey, setMetricKey] = useState<TrendMetricKey>("steps");

  const loadMagnificationPreference = async () => {
    try {
      const prefs = await loadAppPrefs();
      setMagnifiedCardsEnabled(!!prefs.magnifiedCardsEnabled);
    } catch {
      // keep default
    }
  };

  useEffect(() => {
    if (!id || !isFocused) return;

    let cancelled = false;
    void loadMagnificationPreference();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const memberRes = await authFetch(`${BASE_URL}/family/members/${id}`);
        if (!memberRes.ok) {
          const txt = await memberRes.text().catch(() => "");
          throw new Error(`Failed to load member: ${memberRes.status} ${txt}`);
        }
        const memberJson: BackendFamilyMemberSummary = await memberRes.json();
        if (!cancelled) setMember(memberJson);
      } catch (err: any) {
        console.error("❌ Error loading member:", err);
        if (!cancelled) setError(err?.message || "Could not load member data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    (async () => {
      try {
        const historyRes = await authFetch(`${BASE_URL}/users/${id}/metrics/history`);
        if (historyRes.status === 404) {
          if (!cancelled) setHistory([]);
          return;
        }
        if (!historyRes.ok) {
          if (!cancelled) setHistory([]);
          return;
        }
        const historyData: MetricHistoryPoint[] = await historyRes.json();
        if (!cancelled) setHistory(Array.isArray(historyData) ? historyData : []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();

    (async () => {
      try {
        if (!cancelled) setRecsLoading(true);
        const recsRes = await authFetch(`${BASE_URL}/users/${id}/recommendations`);
        if (recsRes.status === 404) {
          if (!cancelled) setRecs([]);
          return;
        }
        if (!recsRes.ok) {
          if (!cancelled) setRecs([]);
          return;
        }
        const recsData: RecommendationItem[] = await recsRes.json();
        if (!cancelled) setRecs(Array.isArray(recsData) ? recsData : []);
      } catch {
        if (!cancelled) setRecs([]);
      } finally {
        if (!cancelled) setRecsLoading(false);
      }
    })();

    (async () => {
      try {
        if (!cancelled) setPreventiveCareLoading(true);
        const preventiveRes = await authFetch(`${BASE_URL}/users/${id}/preventive-care`);
        if (preventiveRes.status === 404) {
          if (!cancelled) setPreventiveCare([]);
          return;
        }
        if (!preventiveRes.ok) {
          if (!cancelled) setPreventiveCare([]);
          return;
        }
        const preventiveData: PreventiveCareItem[] = await preventiveRes.json();
        if (!cancelled) {
          setPreventiveCare(Array.isArray(preventiveData) ? preventiveData : []);
        }
      } catch {
        if (!cancelled) setPreventiveCare([]);
      } finally {
        if (!cancelled) setPreventiveCareLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, isFocused]);

  // ✅ If selected metric is "Not shared", show a clear note in Trends
  const selectedMetricShared = useMemo(() => {
    const m = member?.metrics;
    if (!m) return true; // no metrics -> handled elsewhere
    const v = (m as any)[metricKey];
    return !(v === null || v === undefined);
  }, [member, metricKey]);

  if (loading && !member) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!member || error) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.errorText}>{error || "Member not found."}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.goBackText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const m = member.metrics;
  const avatarPalette = getAvatarPaletteForKey(theme, member.id ?? member.name);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      {/* Profile */}
      <View style={styles.profileCard}>
        <View
          style={[
            styles.profileAvatar,
            { backgroundColor: avatarPalette.background },
          ]}
        >
          <Text style={[styles.profileInitial, { color: avatarPalette.text }]}>
            {getNameInitials(member.name)}
          </Text>
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{member.name}</Text>
          <Text style={styles.profileRole}>{member.role}</Text>

          {!m ? <Text style={styles.noDataText}>No health data yet.</Text> : null}
        </View>
      </View>

      {/* Metrics (ALL 8) */}
      <View style={styles.metricGrid}>
        <MetricCard
          label="Heart Rate"
          value={displayMetric(m, "heartRate", "bpm")}
          icon="❤️"
          accentBg="#ffe4ea"
          magnified={magnifiedCardsEnabled}
        />
        <MetricCard
          label="Weight"
          value={displayMetric(m, "weight", "kg")}
          icon="⚖️"
          accentBg="#fff2cc"
          magnified={magnifiedCardsEnabled}
        />
        <MetricCard
          label="Steps"
          value={m ? (m.steps === null || m.steps === undefined ? "Not shared" : formatSteps(m.steps)) : "--"}
          icon="📈"
          accentBg="#e6ffef"
          magnified={magnifiedCardsEnabled}
        />
        <MetricCard
          label="Sleep"
          value={displayMetric(m, "sleep", "hrs")}
          icon="🌙"
          accentBg="#e8edff"
          magnified={magnifiedCardsEnabled}
        />
        <MetricCard
          label="Blood Glucose"
          value={displayMetric(m, "bloodGlucose", "mmol/L")}
          icon="🩸"
          accentBg="#fee2e2"
          magnified={magnifiedCardsEnabled}
        />
        <MetricCard
          label="Systolic BP"
          value={displayMetric(m, "systolicBP", "mmHg")}
          icon="🫀"
          accentBg="#e0f2fe"
          magnified={magnifiedCardsEnabled}
        />
        <MetricCard
          label="Diastolic BP"
          value={displayMetric(m, "diastolicBP", "mmHg")}
          icon="🫀"
          accentBg="#e0f2fe"
          magnified={magnifiedCardsEnabled}
        />
        <MetricCard
          label="Cholesterol"
          value={displayMetric(m, "cholesterol", "mmol/L")}
          icon="🥚"
          accentBg="#fef3c7"
          magnified={magnifiedCardsEnabled}
        />
      </View>

      {/* Tabs */}
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
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {activeTab === "Trends" && (
        <MemberTrends
          history={history}
          range={range}
          setRange={setRange}
          metricKey={metricKey}
          setMetricKey={setMetricKey}
          metricIsShared={selectedMetricShared}
        />
      )}

      {activeTab === "Medications" && <MedicationsSection metrics={m || undefined} />}
      {activeTab === "Goals" && <GoalsSection metrics={m || undefined} />}
      {activeTab === "Recommendations" && (
        <RecommendationsSection recs={recs} loading={recsLoading} />
      )}
      {activeTab === "Preventative Care" && (
        <PreventativeCareSection items={preventiveCare} loading={preventiveCareLoading} />
      )}
    </ScrollView>
  );
}

/* ---------- UI COMPONENTS ---------- */
function MetricCard({
  label,
  value,
  icon,
  accentBg,
  magnified,
}: {
  label: string;
  value: string;
  icon: string;
  accentBg: string;
  magnified: boolean;
}) {
  const { styles } = useThemedStyles();
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
      </View>
    </View>
  );
}

/* ---------- TRENDS ---------- */
function MemberTrends({
  history,
  range,
  setRange,
  metricKey,
  setMetricKey,
  metricIsShared,
}: {
  history: MetricHistoryPoint[];
  range: Range;
  setRange: (r: Range) => void;
  metricKey: TrendMetricKey;
  setMetricKey: (k: TrendMetricKey) => void;
  metricIsShared: boolean;
}) {
  const { styles } = useThemedStyles();
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

  const shown = useMemo(() => {
    if (!history || history.length === 0) return [];

    const parseDate = (ts: string) => {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d;
    };

    const startOfWeek = (d: Date) => {
      const copy = new Date(d);
      const day = copy.getDay();
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

    const sorted = [...history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const map = new Map<string, Bucket>();

    for (const e of sorted) {
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
      // If consent filtered it, raw will be null -> SKIP (don’t add zeros)
      if (!isNumber(raw)) continue;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          label,
          timestamp: bucketDate.toISOString(),
          value: raw,
          count: 1,
        });
      } else {
        existing.value += raw;
        existing.count += 1;
      }
    }

    const useAverage = metricKey !== "steps";

    const buckets = Array.from(map.values())
      .map((b) => ({ ...b, value: useAverage ? b.value / b.count : b.value }))
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    return buckets.slice(-7);
  }, [history, range, metricKey]);

  // If selected metric is not shared, show a clear message
  if (!metricIsShared) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trends</Text>

        <View style={styles.trendControlsRow}>
          <View style={{ flex: 1 }}>
            <SelectSheet label="Range" value={range} options={rangeOptions} onChange={setRange} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <SelectSheet label="Metric" value={metricKey} options={metricOptions} onChange={setMetricKey} />
          </View>
        </View>

        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Not shared</Text>
          <Text style={styles.listSubtitle}>
            This metric is hidden by the user’s sharing settings, so trends can’t be displayed.
          </Text>
        </View>
      </View>
    );
  }

  if (!history || history.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trends</Text>
        <Text style={styles.helperText}>
          No history yet. Log some health data to see trends.
        </Text>
      </View>
    );
  }

  if (shown.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trends</Text>

        <View style={styles.trendControlsRow}>
          <View style={{ flex: 1 }}>
            <SelectSheet label="Range" value={range} options={rangeOptions} onChange={setRange} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <SelectSheet label="Metric" value={metricKey} options={metricOptions} onChange={setMetricKey} />
          </View>
        </View>

        <View style={styles.listCard}>
          <Text style={styles.helperText}>
            No visible data for this metric (it may be unshared or not logged yet).
          </Text>
        </View>
      </View>
    );
  }

  const maxValue = Math.max(...shown.map((b) => b.value || 0), 1);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Trends</Text>

      <View style={styles.trendControlsRow}>
        <View style={{ flex: 1 }}>
          <SelectSheet label="Range" value={range} options={rangeOptions} onChange={setRange} />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <SelectSheet label="Metric" value={metricKey} options={metricOptions} onChange={setMetricKey} />
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>
          {metricOptions.find((o) => o.value === metricKey)?.label ?? "Metric"} •{" "}
          {range} (last {shown.length})
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
              <View key={b.key} style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }}>
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
                  {metricKey === "steps" ? Math.round(b.value) : Number(b.value.toFixed(1))}{" "}
                  {metricUnit[metricKey]}
                </Text>
              </View>
            ))}
        </View>
      </View>
    </View>
  );
}

/* ---------- OTHER TABS ---------- */
function GoalsSection({
  metrics,
}: {
  metrics?: BackendMetrics | null;
}) {
  const { styles } = useThemedStyles();
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

  const goals = [
    { label: "Daily Steps", progress: safeNumber(metrics?.steps), goal: 10000, suffix: "steps", decimals: 0 },
    { label: "Sleep", progress: safeNumber(metrics?.sleep), goal: 8, suffix: "h", decimals: 1 },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Health Goals</Text>

      {goals.map((g, i) => {
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

function MedicationsSection({ metrics }: { metrics?: BackendMetrics | null }) {
  const { styles } = useThemedStyles();
  const meds: { name: string; detail: string; schedule: string }[] = [];

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

  if ((metrics.systolicBP ?? 0) >= 140 || (metrics.diastolicBP ?? 0) >= 90) {
    meds.push({
      name: "Blood Pressure Check-in",
      detail: "Review treatment plan with your clinician",
      schedule: "Weekly reminder",
    });
  }

  if ((metrics.bloodGlucose ?? 0) > 7.8) {
    meds.push({
      name: "Glucose Plan Review",
      detail: "Discuss medication timing and adherence",
      schedule: "Weekly reminder",
    });
  }

  if ((metrics.cholesterol ?? 0) > 5.0) {
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
            Latest metrics do not currently trigger medication review prompts.
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

function RecommendationsSection({
  recs,
  loading,
}: {
  recs: RecommendationItem[];
  loading: boolean;
}) {
  const { styles } = useThemedStyles();
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
              {r.severity === "urgent" ? "⚠️ " : ""}
              {r.title}
            </Text>

            {r.summary ? <Text style={styles.listSubtitle}>{r.summary}</Text> : null}

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
  const { styles } = useThemedStyles();
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

/* ---------- STYLES ---------- */
function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: 50,
      paddingHorizontal: 20,
    },
    center: { justifyContent: "center", alignItems: "center" },

    errorText: {
      fontSize: 16,
      color: theme.danger,
      marginBottom: 8,
      textAlign: "center",
      paddingHorizontal: 20,
    },
    goBackText: { color: theme.textPrimary, fontWeight: "600" },
    noDataText: { color: theme.textSecondary, marginTop: 6 },

    backRow: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
    backArrow: { fontSize: 20, marginRight: 6, color: theme.textPrimary },
    backText: { fontSize: 16, fontWeight: "600", color: theme.textPrimary },

    profileCard: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 18,
      marginBottom: 18,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.18 : 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
    },

    profileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 20,
      backgroundColor: theme.mode === "dark" ? "#3b2332" : "#ffe4ea",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    profileInitial: {
      fontSize: 26,
      fontWeight: "700",
      color: theme.mode === "dark" ? theme.primary : "#e11d48",
    },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 20, fontWeight: "800", color: theme.textPrimary },
    profileRole: { fontSize: 14, color: theme.textSecondary, marginTop: 2 },

    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    metricCard: {
      width: "48%",
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.16 : 0.04,
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
    metricLabelMagnified: { fontSize: 15, fontWeight: "700" },
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
    metricIconMagnified: { fontSize: 20 },
    metricValueRow: { flexDirection: "row", alignItems: "flex-end" },
    metricValue: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.textPrimary,
      marginRight: 4,
    },
    metricValueMagnified: { fontSize: 26 },

    tabsRow: { flexDirection: "row", marginBottom: 16 },
    tabChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.chip,
      marginRight: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tabChipActive: {
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.08,
      shadowOffset: { width: 0, height: 3 },
    },
    tabText: { fontSize: 13, color: theme.textSecondary },
    tabTextActive: { color: theme.textPrimary, fontWeight: "700" },

    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 12,
    },
    helperText: { color: theme.textSecondary },

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
      borderTopWidth: 1,
      borderColor: theme.border,
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
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.16 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    chartTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 10,
    },
    chartBody: {
      height: 120,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      justifyContent: "flex-end",
    },

    detailList: {
      marginTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 6,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    detailDate: { fontSize: 12, color: theme.textSecondary },
    detailValue: { fontSize: 12, fontWeight: "600", color: theme.textPrimary },

    listCard: {
      backgroundColor: theme.surface,
      padding: 14,
      borderRadius: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.16 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    listTitle: { fontSize: 15, fontWeight: "600", color: theme.textPrimary },
    listSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },

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
  });
}

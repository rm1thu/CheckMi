import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../src/api";
import { getAvatarPaletteForKey, getNameInitials } from "../../src/avatar";
import { clearToken, getToken } from "../../src/auth";
import { loadAppPrefs, saveAppPrefs } from "../../src/prefs";
import { AppTheme, useAppTheme, useThemeMode } from "../../src/theme-mode";

const BASE_URL = getApiBaseUrl();

type Prefs = {
  notificationsEnabled: boolean;
  magnifiedCardsEnabled: boolean;
};

type MeProfile = {
  id: number;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  email?: string | null;
};

type ExportMetricEntry = {
  createdAt?: string | null;
  heartRate?: number | null;
  weight?: number | null;
  steps?: number | null;
  sleep?: number | null;
  bloodGlucose?: number | null;
  systolicBP?: number | null;
  diastolicBP?: number | null;
  cholesterol?: number | null;
};

type ExportConsentEntry = {
  metricType?: string | null;
  isShared?: boolean;
  updatedAt?: string | null;
};

type ExportAlertEntry = {
  title?: string | null;
  message?: string | null;
  severity?: string | null;
  createdAt?: string | null;
  metricType?: string | null;
  metricValue?: number | null;
};

type ExportSessionEntry = {
  createdAt?: string | null;
  tokenMasked?: string | null;
};

type ExportPayload = {
  exportedAt?: string | null;
  user?: {
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    email?: string | null;
  } | null;
  family?: {
    familyId?: number | null;
    familyName?: string | null;
    ownerUserId?: number | null;
    createdAt?: string | null;
    joinedAt?: string | null;
    shareCode?: string | null;
    goals?: {
      steps?: number | null;
      sleep?: number | null;
    } | null;
  } | null;
  metrics?: ExportMetricEntry[] | null;
  consent?: ExportConsentEntry[] | null;
  alerts?: ExportAlertEntry[] | null;
  auth?: {
    activeSessions?: ExportSessionEntry[] | null;
  } | null;
};

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrapLine(line: string, maxChars = 90): string[] {
  if (line.length <= maxChars) return [line];
  const chunks: string[] = [];
  let start = 0;
  while (start < line.length) {
    chunks.push(line.slice(start, start + maxChars));
    start += maxChars;
  }
  return chunks;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatMetricLabel(metricKey?: string | null): string {
  const labels: Record<string, string> = {
    heartRate: "Heart rate",
    weight: "Weight",
    steps: "Steps",
    sleep: "Sleep",
    bloodGlucose: "Blood glucose",
    systolicBP: "Systolic blood pressure",
    diastolicBP: "Diastolic blood pressure",
    cholesterol: "Cholesterol",
  };
  if (!metricKey) return "Unknown metric";
  if (labels[metricKey]) return labels[metricKey];
  return metricKey.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatMetricValue(
  value: number | null | undefined,
  unit: string
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not available";
  }
  return `${value} ${unit}`.trim();
}

function buildReadableExportLines(
  payload: ExportPayload,
  profile: MeProfile | null
): string[] {
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
  const consent = Array.isArray(payload.consent) ? payload.consent : [];
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  const sessions = Array.isArray(payload.auth?.activeSessions)
    ? payload.auth?.activeSessions
    : [];

  const user = payload.user ?? null;
  const firstName = user?.firstName?.trim() || "";
  const lastName = user?.lastName?.trim() || "";
  const fullName =
    `${firstName} ${lastName}`.trim() || profile?.name || "Unknown user";

  const lines: string[] = [
    "CheckMi Personal Data Export",
    `Generated: ${formatDateTime(payload.exportedAt)}`,
    "",
    "Account details",
    `- Name: ${fullName}`,
    `- Role: ${user?.role || profile?.role || "Not available"}`,
    `- Email: ${user?.email || profile?.email || "Not available"}`,
    `- User ID: ${user?.id ?? "Not available"}`,
    "",
    "Family details",
  ];

  if (!payload.family) {
    lines.push("- Not currently linked to a family group.");
  } else {
    lines.push(`- Family name: ${payload.family.familyName || "Not available"}`);
    lines.push(`- Family ID: ${payload.family.familyId ?? "Not available"}`);
    lines.push(`- Family owner user ID: ${payload.family.ownerUserId ?? "Not available"}`);
    lines.push(`- Joined family: ${formatDateTime(payload.family.joinedAt)}`);
    lines.push(`- Family created: ${formatDateTime(payload.family.createdAt)}`);
    lines.push(`- Share code: ${payload.family.shareCode || "Not available"}`);
    lines.push(
      `- Family step goal: ${payload.family.goals?.steps ?? "Not available"}`
    );
    lines.push(
      `- Family sleep goal: ${
        payload.family.goals?.sleep ?? "Not available"
      }`
    );
  }

  lines.push("");
  lines.push("Export summary");
  lines.push(`- Health metric entries: ${metrics.length}`);
  lines.push(`- Sharing consent items: ${consent.length}`);
  lines.push(`- Alerts: ${alerts.length}`);
  lines.push(`- Active sessions: ${sessions.length}`);

  lines.push("");
  lines.push("Latest health entries");
  if (metrics.length === 0) {
    lines.push("- No health entries available.");
  } else {
    const latest = [...metrics].slice(-5).reverse();
    latest.forEach((m, index) => {
      lines.push(`Entry ${index + 1} - ${formatDateTime(m.createdAt)}`);
      lines.push(`- Heart rate: ${formatMetricValue(m.heartRate, "bpm")}`);
      lines.push(`- Weight: ${formatMetricValue(m.weight, "kg")}`);
      lines.push(`- Steps: ${formatMetricValue(m.steps, "")}`);
      lines.push(`- Sleep: ${formatMetricValue(m.sleep, "hours")}`);
      lines.push(`- Blood glucose: ${formatMetricValue(m.bloodGlucose, "mmol/L")}`);
      lines.push(
        `- Systolic blood pressure: ${formatMetricValue(m.systolicBP, "mmHg")}`
      );
      lines.push(
        `- Diastolic blood pressure: ${formatMetricValue(m.diastolicBP, "mmHg")}`
      );
      lines.push(`- Cholesterol: ${formatMetricValue(m.cholesterol, "mmol/L")}`);
      lines.push("");
    });
  }

  lines.push("Sharing preferences");
  if (consent.length === 0) {
    lines.push("- No sharing consent records available.");
  } else {
    consent.forEach((c) => {
      lines.push(
        `- ${formatMetricLabel(c.metricType)}: ${
          c.isShared ? "Shared" : "Private"
        } (updated ${formatDateTime(c.updatedAt)})`
      );
    });
  }

  lines.push("");
  lines.push("Recent alerts");
  if (alerts.length === 0) {
    lines.push("- No alerts available.");
  } else {
    const latestAlerts = [...alerts].slice(-10).reverse();
    latestAlerts.forEach((a) => {
      const severity = (a.severity || "info").toUpperCase();
      lines.push(
        `- [${severity}] ${a.title || "Untitled alert"} (${formatDateTime(
          a.createdAt
        )})`
      );
      if (a.message) lines.push(`  ${a.message}`);
      if (a.metricType) {
        lines.push(
          `  Metric: ${formatMetricLabel(a.metricType)}${
            a.metricValue !== null && a.metricValue !== undefined
              ? ` (${a.metricValue})`
              : ""
          }`
        );
      }
    });
  }

  lines.push("");
  lines.push("Active sessions");
  if (sessions.length === 0) {
    lines.push("- No active session metadata available.");
  } else {
    sessions.forEach((s, index) => {
      lines.push(
        `- Session ${index + 1}: ${formatDateTime(s.createdAt)}${
          s.tokenMasked ? ` (${s.tokenMasked})` : ""
        }`
      );
    });
  }

  const wrapped: string[] = [];
  lines.forEach((line) => {
    if (!line.trim()) {
      wrapped.push("");
      return;
    }
    wrapped.push(...wrapLine(line, 90));
  });
  return wrapped;
}

function buildPdfFromLines(lines: string[]): string {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 40;
  const marginTop = 50;
  const marginBottom = 50;
  const fontSize = 10;
  const lineHeight = 14;
  const linesPerPage = Math.max(
    1,
    Math.floor((pageHeight - marginTop - marginBottom) / lineHeight)
  );

  const pagedLines: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pagedLines.push(lines.slice(i, i + linesPerPage));
  }
  if (pagedLines.length === 0) {
    pagedLines.push(["No export data available."]);
  }

  const totalPages = pagedLines.length;
  const firstPageObject = 3;
  const fontObject = firstPageObject + totalPages * 2;
  const maxObject = fontObject;
  const objects: Record<number, string> = {};

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  const kids = pagedLines
    .map((_, i) => `${firstPageObject + i * 2} 0 R`)
    .join(" ");
  objects[2] = `<< /Type /Pages /Count ${totalPages} /Kids [ ${kids} ] >>`;

  pagedLines.forEach((pageLines, index) => {
    const pageObj = firstPageObject + index * 2;
    const contentObj = pageObj + 1;
    const startY = pageHeight - marginTop;
    const bodyLines = pageLines
      .map((line) => `(${escapePdfText(line)}) Tj`)
      .join("\nT*\n");
    const stream = `BT
/F1 ${fontSize} Tf
${lineHeight} TL
${marginLeft} ${startY} Td
${bodyLines}
ET`;
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontObject} 0 R >> >> >>`;
  });

  objects[fontObject] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = new Array(maxObject + 1).fill(0);

  for (let objNum = 1; objNum <= maxObject; objNum += 1) {
    offsets[objNum] = pdf.length;
    const body = objects[objNum] || "";
    pdf += `${objNum} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${maxObject + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let objNum = 1; objNum <= maxObject; objNum += 1) {
    const padded = String(offsets[objNum]).padStart(10, "0");
    pdf += `${padded} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

export default function SettingsScreen() {
  const theme = useAppTheme();
  const { darkModeEnabled, setDarkModeEnabled } = useThemeMode();
  const isFocused = useIsFocused();
  const showNotificationsToggle = true; // set false if you want to remove it completely

  const [prefs, setPrefs] = useState<Prefs>({
    notificationsEnabled: true,
    magnifiedCardsEnabled: false,
  });
  const styles = React.useMemo(
    () => createStyles(theme, prefs.magnifiedCardsEnabled),
    [theme, prefs.magnifiedCardsEnabled]
  );

  const [loadingExport, setLoadingExport] = useState(false);
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [deletingData, setDeletingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const profileAvatarPalette = getAvatarPaletteForKey(
    theme,
    profile?.id ?? profile?.name
  );

  // Load prefs
  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadAppPrefs();
        setPrefs({
          notificationsEnabled: loaded.notificationsEnabled,
          magnifiedCardsEnabled: loaded.magnifiedCardsEnabled,
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  // Save prefs
  const updatePrefs = async (next: Partial<Prefs>) => {
    const updated = { ...prefs, ...next };
    setPrefs(updated);
    try {
      await saveAppPrefs(updated);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await clearToken();
    router.replace("/(auth)/login");
  };

  async function apiFetch(path: string, options: RequestInit = {}) {
    const token = await getToken();
    if (!token) throw new Error("Missing token. Please log in again.");

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res;
  }

  useEffect(() => {
    if (!isFocused) return;

    (async () => {
      try {
        setProfileLoading(true);
        const res = await apiFetch("/me", { method: "GET" });
        const data: MeProfile = await res.json();
        setProfile(data);
      } catch {
        // silent: settings still works without profile preview
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [isFocused]);

  const handleDownloadData = async () => {
    try {
      setLoadingExport(true);
      const res = await apiFetch("/me/export", { method: "GET" });
      const data: ExportPayload = await res.json();
      const lines = buildReadableExportLines(data, profile);

      const pdfContent = buildPdfFromLines(lines);
      const dir = FileSystem.documentDirectory;
      if (!dir) throw new Error("Local document storage is not available.");

      const fileUri = `${dir}checkmi-data-export-${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, pdfContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      try {
        await Share.share({
          title: "CheckMi Data Export (PDF)",
          message: "Your CheckMi data export PDF.",
          url: fileUri,
        });
        return;
      } catch {
        // fallback to opening file below
      }

      if (Platform.OS === "android") {
        const contentUri = await FileSystem.getContentUriAsync(fileUri);
        await Linking.openURL(contentUri);
      } else {
        await Linking.openURL(fileUri);
      }

      Alert.alert(
        "PDF ready",
        "Your data export has been generated as a PDF."
      );
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? "Something went wrong");
    } finally {
      setLoadingExport(false);
    }
  };

  const confirmDeleteMyData = () => {
    Alert.alert(
      "Delete my data?",
      "This will permanently delete your health metrics, alerts, and consent settings. Your account will stay active.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDeleteMyData },
      ]
    );
  };

  const handleDeleteMyData = async () => {
    try {
      setDeletingData(true);
      await apiFetch("/me/data", { method: "DELETE" });
      Alert.alert("Deleted", "Your personal data has been deleted.");
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message ?? "Something went wrong");
    } finally {
      setDeletingData(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account?",
      "This will permanently delete your account and associated data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: handleDeleteAccount },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    try {
      setDeletingAccount(true);
      await apiFetch("/me", { method: "DELETE" });
      await clearToken();
      Alert.alert("Account deleted", "Your account has been deleted.");
      router.replace("/(auth)/login");
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message ?? "Something went wrong");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Manage your CheckMi preferences</Text>

      <TouchableOpacity
        style={styles.profileCard}
        onPress={() => router.push("/profile")}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.profileAvatar,
            { backgroundColor: profileAvatarPalette.background },
          ]}
        >
          <Text style={[styles.profileAvatarText, { color: profileAvatarPalette.text }]}>
            {getNameInitials(profile?.name)}
          </Text>
        </View>

        <View style={styles.profileBody}>
          <Text style={styles.profileName}>{profile?.name || "Your Profile"}</Text>
          <Text style={styles.profileEmail}>
            {profile?.email || "No email on file"}
          </Text>

          <View style={styles.profileMetaRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{profile?.role || "Self"}</Text>
            </View>
            <Text style={styles.profileActionText}>
              {profileLoading ? "Loading..." : "Edit profile"}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <TouchableOpacity style={[styles.row, styles.firstRow]} onPress={() => router.push("/member")}>
          <View style={styles.rowLeft}>
            <Ionicons name="people-outline" size={22} color={theme.textSecondary} />
            <View>
              <Text style={styles.rowLabel}>Family Members</Text>
              <Text style={styles.rowDescription}>Manage linked family profiles</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        {showNotificationsToggle && (
          <View style={[styles.row, styles.firstRow]}>
            <View style={styles.rowLeft}>
              <Ionicons name="notifications-outline" size={22} color={theme.textSecondary} />
              <View>
                <Text style={styles.rowLabel}>Push Notifications</Text>
                <Text style={styles.rowDescription}>Reminders and health alerts</Text>
              </View>
            </View>
            <Switch
              value={prefs.notificationsEnabled}
              onValueChange={(v) => updatePrefs({ notificationsEnabled: v })}
            />
          </View>
        )}

        <View style={[styles.row, showNotificationsToggle ? {} : styles.firstRow]}>
          <View style={styles.rowLeft}>
            <Ionicons name="moon-outline" size={22} color={theme.textSecondary} />
            <View>
              <Text style={styles.rowLabel}>Dark Mode</Text>
              <Text style={styles.rowDescription}>Use dark theme interface</Text>
            </View>
          </View>
          <Switch
            value={darkModeEnabled}
            onValueChange={(v) => {
              void setDarkModeEnabled(v);
            }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="resize-outline" size={22} color={theme.textSecondary} />
            <View>
              <Text style={styles.rowLabel}>Magnification Mode</Text>
              <Text style={styles.rowDescription}>
                Enlarge health cards across the app
              </Text>
            </View>
          </View>
          <Switch
            value={prefs.magnifiedCardsEnabled}
            onValueChange={(v) => {
              void updatePrefs({ magnifiedCardsEnabled: v });
            }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy & Data</Text>

        <TouchableOpacity
          style={[styles.row, styles.firstRow]}
          onPress={handleDownloadData}
          disabled={loadingExport}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="download-outline" size={22} color={theme.textSecondary} />
            <View>
              <Text style={styles.rowLabel}>Download my data (PDF)</Text>
              <Text style={styles.rowDescription}>Export your stored info as a PDF</Text>
            </View>
          </View>
          {loadingExport ? <ActivityIndicator /> : <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={confirmDeleteMyData} disabled={deletingData}>
          <View style={styles.rowLeft}>
            <Ionicons name="trash-outline" size={22} color={theme.warning} />
            <View>
              <Text style={[styles.rowLabel, { color: theme.warning }]}>Delete my data</Text>
              <Text style={styles.rowDescription}>Removes metrics, alerts, consent</Text>
            </View>
          </View>
          {deletingData ? <ActivityIndicator /> : <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={confirmDeleteAccount} disabled={deletingAccount}>
          <View style={styles.rowLeft}>
            <Ionicons name="warning-outline" size={22} color={theme.danger} />
            <View>
              <Text style={[styles.rowLabel, { color: theme.danger }]}>Delete my account</Text>
              <Text style={styles.rowDescription}>Permanent removal (cannot undo)</Text>
            </View>
          </View>
          {deletingAccount ? <ActivityIndicator /> : <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <TouchableOpacity style={[styles.row, styles.firstRow]} onPress={() => router.push("/about")}>
          <View style={styles.rowLeft}>
            <Ionicons name="information-circle-outline" size={22} color={theme.textSecondary} />
            <View>
              <Text style={styles.rowLabel}>About CheckMi</Text>
              <Text style={styles.rowDescription}>Version 1.0.0</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => router.push("/privacy")}>
          <View style={styles.rowLeft}>
            <Ionicons name="shield-checkmark-outline" size={22} color={theme.textSecondary} />
            <View>
              <Text style={styles.rowLabel}>Privacy Policy</Text>
              <Text style={styles.rowDescription}>How we handle your data</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: AppTheme, magnified: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingTop: magnified ? 68 : 60,
      paddingHorizontal: magnified ? 22 : 20,
      paddingBottom: magnified ? 56 : 44,
    },
    title: {
      fontSize: magnified ? 30 : 26,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    subtitle: {
      marginTop: 4,
      fontSize: magnified ? 16 : 14,
      color: theme.textSecondary,
      marginBottom: magnified ? 24 : 20,
    },
    profileCard: {
      backgroundColor: theme.surface,
      borderRadius: magnified ? 24 : 20,
      padding: magnified ? 18 : 14,
      marginBottom: magnified ? 18 : 16,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.24 : 0.04,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 8,
      elevation: 1,
    },
    profileAvatar: {
      width: magnified ? 58 : 48,
      height: magnified ? 58 : 48,
      borderRadius: magnified ? 18 : 16,
      backgroundColor: theme.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: magnified ? 14 : 12,
    },
    profileAvatarText: {
      fontSize: magnified ? 20 : 17,
      fontWeight: "800",
      color: theme.textPrimary,
    },
    profileBody: { flex: 1, marginRight: 10 },
    profileName: {
      fontSize: magnified ? 18 : 16,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    profileEmail: {
      marginTop: 2,
      fontSize: magnified ? 14 : 12,
      color: theme.textSecondary,
    },
    profileMetaRow: {
      marginTop: magnified ? 10 : 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    roleBadge: {
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    roleBadgeText: {
      fontSize: magnified ? 12 : 11,
      fontWeight: "700",
      color: theme.textSecondary,
    },
    profileActionText: {
      fontSize: magnified ? 13 : 12,
      fontWeight: "700",
      color: theme.primary,
    },

    section: {
      backgroundColor: theme.surface,
      borderRadius: magnified ? 22 : 18,
      paddingHorizontal: magnified ? 18 : 16,
      paddingVertical: magnified ? 14 : 12,
      marginBottom: magnified ? 18 : 16,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.24 : 0.04,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 8,
      elevation: 1,
    },
    sectionTitle: {
      fontSize: magnified ? 16 : 14,
      fontWeight: "700",
      color: theme.textSecondary,
      marginBottom: magnified ? 8 : 6,
    },

    row: {
      paddingVertical: magnified ? 14 : 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    firstRow: { borderTopWidth: 0 },

    rowLeft: { flexDirection: "row", alignItems: "center", gap: magnified ? 12 : 10 },
    rowLabel: {
      fontSize: magnified ? 17 : 15,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    rowDescription: {
      fontSize: magnified ? 13 : 12,
      color: theme.textMuted,
      marginTop: magnified ? 3 : 2,
    },

    footer: { marginTop: 8 },
    logoutButton: {
      backgroundColor: theme.mode === "dark" ? "#3f1f2a" : "#fee2e2",
      paddingVertical: magnified ? 14 : 12,
      borderRadius: 999,
      alignItems: "center",
    },
    logoutText: {
      color: theme.danger,
      fontWeight: "700",
      fontSize: magnified ? 17 : 15,
    },

  });
}

import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../src/api";
import { getToken } from "../src/auth";
import { AppTheme, useAppTheme } from "../src/theme-mode";

const BASE_URL = getApiBaseUrl();
const MEDICATION_NAME_MAX = 120;
const MEDICATION_DOSAGE_MAX = 120;
const MEDICATION_INSTRUCTIONS_MAX = 255;
const MEDICATION_SCHEDULE_MAX = 120;

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

type MedicationItem = {
  id: number;
  name: string;
  dosage: string;
  instructions?: string | null;
  scheduleTimes: string[];
  pillsRemaining: number;
  refillThreshold: number;
  isActive: boolean;
  adherence7d: number;
  adherence30d: number;
  nextReminderAt?: string | null;
  dueSoon: boolean;
  refillAlert: boolean;
  lastLogStatus?: string | null;
  lastLogAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type MedicationSummary = {
  totalMedications: number;
  activeMedications: number;
  dueSoonCount: number;
  refillAlertCount: number;
  averageAdherence7d: number;
  averageAdherence30d: number;
};

type MedicationOverviewResponse = {
  summary: MedicationSummary;
  medications: MedicationItem[];
};

type MedicationLogItem = {
  id: number;
  medicationId: number;
  status: string;
  scheduledAt?: string | null;
  note?: string | null;
  createdAt: string;
};

type MedicationFormState = {
  name: string;
  dosage: string;
  instructions: string;
  scheduleTimes: string;
  pillsRemaining: string;
  refillThreshold: string;
  isActive: boolean;
};

const DEFAULT_FORM: MedicationFormState = {
  name: "",
  dosage: "1 dose",
  instructions: "",
  scheduleTimes: "08:00",
  pillsRemaining: "30",
  refillThreshold: "5",
  isActive: true,
};

function formatDateTime(value?: string | null): string {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function normalizeScheduleInput(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

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
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Request failed (${res.status})`);
  }
  return res;
}

export default function MedicationsScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isFocused = useIsFocused();

  const [summary, setSummary] = useState<MedicationSummary | null>(null);
  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingId, setLoggingId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingMedication, setEditingMedication] = useState<MedicationItem | null>(null);
  const [form, setForm] = useState<MedicationFormState>(DEFAULT_FORM);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsTitle, setLogsTitle] = useState("");
  const [logs, setLogs] = useState<MedicationLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadMedications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/me/medications", { method: "GET" });
      const data: MedicationOverviewResponse = await res.json();
      setSummary(data.summary || null);
      setMedications(Array.isArray(data.medications) ? data.medications : []);
    } catch (e: any) {
      Alert.alert("Could not load medications", e?.message || "Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    void loadMedications();
  }, [isFocused, loadMedications]);

  const openCreate = () => {
    setEditingMedication(null);
    setForm(DEFAULT_FORM);
    setFormOpen(true);
  };

  const openEdit = (item: MedicationItem) => {
    setEditingMedication(item);
    setForm({
      name: item.name || "",
      dosage: item.dosage || "1 dose",
      instructions: item.instructions || "",
      scheduleTimes: (item.scheduleTimes || []).join(", "),
      pillsRemaining: String(item.pillsRemaining ?? 0),
      refillThreshold: String(item.refillThreshold ?? 5),
      isActive: !!item.isActive,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingMedication(null);
    setForm(DEFAULT_FORM);
  };

  const saveMedication = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert("Missing name", "Please enter a medication name.");
      return;
    }
    if (name.length > MEDICATION_NAME_MAX) {
      Alert.alert("Name too long", `Medication name must be ${MEDICATION_NAME_MAX} characters or fewer.`);
      return;
    }

    const dosage = form.dosage.trim() || "1 dose";
    if (dosage.length > MEDICATION_DOSAGE_MAX) {
      Alert.alert("Dosage too long", `Dosage must be ${MEDICATION_DOSAGE_MAX} characters or fewer.`);
      return;
    }

    const instructions = form.instructions.trim();
    if (instructions.length > MEDICATION_INSTRUCTIONS_MAX) {
      Alert.alert(
        "Instructions too long",
        `Instructions must be ${MEDICATION_INSTRUCTIONS_MAX} characters or fewer.`
      );
      return;
    }

    const scheduleTimes = normalizeScheduleInput(form.scheduleTimes);
    if (scheduleTimes.length === 0) {
      Alert.alert("Missing schedule", "Please enter at least one HH:MM time.");
      return;
    }
    const badTime = scheduleTimes.find((value) => !isValidTime(value));
    if (badTime) {
      Alert.alert("Invalid time", `${badTime} is invalid. Use HH:MM (24-hour).`);
      return;
    }

    const pillsRemaining = Number.parseInt(form.pillsRemaining || "0", 10);
    const refillThreshold = Number.parseInt(form.refillThreshold || "0", 10);
    if (!Number.isFinite(pillsRemaining) || pillsRemaining < 0) {
      Alert.alert("Invalid quantity", "Pills remaining must be 0 or more.");
      return;
    }
    if (!Number.isFinite(refillThreshold) || refillThreshold < 0) {
      Alert.alert("Invalid threshold", "Refill threshold must be 0 or more.");
      return;
    }

    const payload = {
      name,
      dosage,
      instructions: instructions || null,
      scheduleTimes,
      pillsRemaining,
      refillThreshold,
      isActive: form.isActive,
    };

    try {
      setSaving(true);
      if (editingMedication) {
        await apiFetch(`/me/medications/${editingMedication.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/me/medications", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      closeForm();
      await loadMedications();
      Alert.alert("Saved", "Medication has been updated.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMedication = (item: MedicationItem) => {
    Alert.alert(
      "Delete medication?",
      `This will remove ${item.name} and all of its dose logs.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await apiFetch(`/me/medications/${item.id}`, { method: "DELETE" });
              await loadMedications();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message || "Try again.");
            }
          },
        },
      ]
    );
  };

  const markDose = async (item: MedicationItem, status: "taken" | "missed") => {
    try {
      setLoggingId(item.id);
      await apiFetch(`/me/medications/${item.id}/logs`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await loadMedications();
    } catch (e: any) {
      Alert.alert("Could not log dose", e?.message || "Try again.");
    } finally {
      setLoggingId(null);
    }
  };

  const openLogs = async (item: MedicationItem) => {
    try {
      setLogsOpen(true);
      setLogsTitle(item.name);
      setLogs([]);
      setLogsLoading(true);
      const res = await apiFetch(`/me/medications/${item.id}/logs?days=30&limit=120`, {
        method: "GET",
      });
      const data: MedicationLogItem[] = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Could not load logs", e?.message || "Try again.");
    } finally {
      setLogsLoading(false);
    }
  };

  const closeLogs = () => {
    setLogsOpen(false);
    setLogsTitle("");
    setLogs([]);
    setLogsLoading(false);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.appBar}>
          <View style={styles.appBarLeft}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={18} color={theme.textPrimary} />
            </TouchableOpacity>
            <View style={styles.logoBox}>
              <Text style={styles.logoIcon}>♡</Text>
            </View>
            <View>
              <Text style={styles.appName}>Medication Tracker</Text>
              <Text style={styles.familyNameText}>Dose logs, refill alerts and adherence</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => void loadMedications()}>
            <Ionicons name="refresh" size={18} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Adherence Summary</Text>
          {loading && !summary ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : (
            <View style={styles.summaryGrid}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryValue}>{summary?.activeMedications ?? 0}</Text>
                <Text style={styles.summaryLabel}>Active meds</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryValue}>{summary?.dueSoonCount ?? 0}</Text>
                <Text style={styles.summaryLabel}>Due soon</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryValue, { color: theme.warning }]}>
                  {summary?.refillAlertCount ?? 0}
                </Text>
                <Text style={styles.summaryLabel}>Refill alerts</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryValue}>{summary?.averageAdherence7d ?? 0}%</Text>
                <Text style={styles.summaryLabel}>Adherence 7d</Text>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Ionicons name="add-circle-outline" size={18} color={theme.primaryText} />
          <Text style={styles.addButtonText}>Add medication</Text>
        </TouchableOpacity>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Your Medications</Text>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : medications.length === 0 ? (
            <Text style={styles.emptyText}>No medications added yet.</Text>
          ) : (
            medications.map((item) => (
              <View key={item.id} style={styles.medCard}>
                <View style={styles.medHeader}>
                  <Text style={styles.medName}>{item.name}</Text>
                  <View style={[styles.activeChip, !item.isActive && styles.inactiveChip]}>
                    <Text style={styles.activeChipText}>{item.isActive ? "ACTIVE" : "PAUSED"}</Text>
                  </View>
                </View>

                <Text style={styles.medMeta}>Dosage: {item.dosage}</Text>
                <Text style={styles.medMeta}>
                  Schedule: {(item.scheduleTimes || []).join(", ") || "N/A"}
                </Text>
                <Text style={styles.medMeta}>Next reminder: {formatDateTime(item.nextReminderAt)}</Text>
                <Text style={styles.medMeta}>Adherence: {item.adherence7d}% (7d) · {item.adherence30d}% (30d)</Text>
                <Text style={[styles.medMeta, item.refillAlert ? styles.refillAlertText : null]}>
                  Pills remaining: {item.pillsRemaining} (refill at {item.refillThreshold})
                </Text>
                {item.instructions ? <Text style={styles.medMeta}>Notes: {item.instructions}</Text> : null}
                {item.lastLogAt ? (
                  <Text style={styles.medMeta}>
                    Last log: {(item.lastLogStatus || "").toUpperCase()} · {formatDateTime(item.lastLogAt)}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => void markDose(item, "taken")}
                    disabled={loggingId === item.id}
                  >
                    {loggingId === item.id ? (
                      <ActivityIndicator color={theme.primaryText} />
                    ) : (
                      <Text style={styles.actionPrimaryText}>Taken</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionSecondary]}
                    onPress={() => void markDose(item, "missed")}
                    disabled={loggingId === item.id}
                  >
                    <Text style={styles.actionSecondaryText}>Missed</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.secondaryActionRow}>
                  <TouchableOpacity style={styles.linkAction} onPress={() => void openLogs(item)}>
                    <Ionicons name="time-outline" size={14} color={theme.primary} />
                    <Text style={styles.linkActionText}>History</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.linkAction} onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={14} color={theme.primary} />
                    <Text style={styles.linkActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.linkAction} onPress={() => deleteMedication(item)}>
                    <Ionicons name="trash-outline" size={14} color={theme.danger} />
                    <Text style={[styles.linkActionText, { color: theme.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingMedication ? "Edit medication" : "Add medication"}</Text>
                <TouchableOpacity style={styles.iconBtn} onPress={closeForm}>
                  <Ionicons name="close" size={16} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.inputLabel}>Medication name</Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
                  placeholder="e.g. Metformin"
                  placeholderTextColor={theme.textMuted}
                  maxLength={MEDICATION_NAME_MAX}
                />

                <Text style={styles.inputLabel}>Dosage</Text>
                <TextInput
                  style={styles.input}
                  value={form.dosage}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, dosage: value }))}
                  placeholder="e.g. 500mg"
                  placeholderTextColor={theme.textMuted}
                  maxLength={MEDICATION_DOSAGE_MAX}
                />

                <Text style={styles.inputLabel}>Schedule times</Text>
                <TextInput
                  style={styles.input}
                  value={form.scheduleTimes}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, scheduleTimes: value }))}
                  placeholder="08:00, 20:00"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  maxLength={MEDICATION_SCHEDULE_MAX}
                />
                <Text style={styles.helperText}>Use comma-separated HH:MM (24-hour).</Text>

                <Text style={styles.inputLabel}>Pills remaining</Text>
                <TextInput
                  style={styles.input}
                  value={form.pillsRemaining}
                  onChangeText={(value) =>
                    setForm((prev) => ({ ...prev, pillsRemaining: digitsOnly(value) }))
                  }
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={theme.textMuted}
                  maxLength={6}
                />

                <Text style={styles.inputLabel}>Refill threshold</Text>
                <TextInput
                  style={styles.input}
                  value={form.refillThreshold}
                  onChangeText={(value) =>
                    setForm((prev) => ({ ...prev, refillThreshold: digitsOnly(value) }))
                  }
                  keyboardType="number-pad"
                  placeholder="5"
                  placeholderTextColor={theme.textMuted}
                  maxLength={6}
                />

                <Text style={styles.inputLabel}>Instructions (optional)</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={form.instructions}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, instructions: value }))}
                  placeholder="With food, after breakfast"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  maxLength={MEDICATION_INSTRUCTIONS_MAX}
                />

                <View style={styles.switchRow}>
                  <View>
                    <Text style={styles.rowLabel}>Active medication</Text>
                    <Text style={styles.helperText}>Turn off if this medication is paused.</Text>
                  </View>
                  <Switch
                    value={form.isActive}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))}
                  />
                </View>

                <View style={styles.modalActionRow}>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={closeForm}>
                    <Text style={styles.actionSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={saveMedication}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={theme.primaryText} />
                    ) : (
                      <Text style={styles.actionPrimaryText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={logsOpen} transparent animationType="slide" onRequestClose={closeLogs}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{logsTitle} history</Text>
                <TouchableOpacity style={styles.iconBtn} onPress={closeLogs}>
                  <Ionicons name="close" size={16} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>

              {logsLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={theme.primary} />
                </View>
              ) : logs.length === 0 ? (
                <Text style={styles.emptyText}>No recent dose logs.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {logs.map((entry) => (
                    <View key={entry.id} style={styles.logRow}>
                      <Text style={styles.logStatus}>
                        {entry.status.toUpperCase()} · {formatDateTime(entry.createdAt)}
                      </Text>
                      {entry.scheduledAt ? (
                        <Text style={styles.logMeta}>Scheduled: {formatDateTime(entry.scheduledAt)}</Text>
                      ) : null}
                      {entry.note ? <Text style={styles.logMeta}>Note: {entry.note}</Text> : null}
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingTop: 50,
      paddingHorizontal: 20,
      paddingBottom: 44,
    },
    appBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    appBarLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: 8,
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
    logoBox: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: "#fb4a8a",
      justifyContent: "center",
      alignItems: "center",
      marginHorizontal: 8,
    },
    logoIcon: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "700",
    },
    appName: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.textPrimary,
    },
    familyNameText: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    summaryCard: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 18,
      marginBottom: 18,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.05,
      shadowOffset: { width: 0, height: 4 },
    },
    sectionCard: {
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 14,
      marginBottom: 16,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 12,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    summaryStat: {
      width: "48%",
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 10,
      alignItems: "center",
      marginBottom: 10,
    },
    summaryValue: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: "800",
    },
    summaryLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8 as any,
      backgroundColor: theme.primaryStrong,
      borderRadius: 16,
      paddingVertical: 12,
      marginBottom: 16,
    },
    addButtonText: {
      color: theme.primaryText,
      fontWeight: "600",
      fontSize: 15,
    },
    medCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
    },
    medHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
      gap: 8 as any,
    },
    medName: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: "800",
      flex: 1,
    },
    medMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      marginBottom: 2,
    },
    refillAlertText: {
      color: theme.warning,
      fontWeight: "700",
    },
    activeChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: `${theme.success}22`,
      borderWidth: 1,
      borderColor: `${theme.success}66`,
    },
    inactiveChip: {
      backgroundColor: `${theme.textMuted}22`,
      borderColor: `${theme.textMuted}66`,
    },
    activeChipText: {
      color: theme.textPrimary,
      fontSize: 11,
      fontWeight: "700",
    },
    actionRow: {
      flexDirection: "row",
      gap: 8 as any,
      marginTop: 10,
    },
    secondaryActionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 10,
      gap: 8 as any,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    actionPrimary: {
      backgroundColor: theme.primaryStrong,
    },
    actionSecondary: {
      backgroundColor: theme.surfaceAlt,
    },
    actionPrimaryText: {
      color: theme.primaryText,
      fontWeight: "700",
      fontSize: 13,
    },
    actionSecondaryText: {
      color: theme.textPrimary,
      fontWeight: "700",
      fontSize: 13,
    },
    linkAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4 as any,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 999,
    },
    linkActionText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    loadingWrap: {
      paddingVertical: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      color: theme.textSecondary,
      marginTop: 6,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: "flex-end",
    },
    modalKeyboard: {
      width: "100%",
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
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    modalTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: "800",
    },
    inputLabel: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: "600",
      marginTop: 8,
      marginBottom: 6,
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
    multilineInput: {
      minHeight: 74,
      textAlignVertical: "top",
    },
    helperText: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 4,
    },
    switchRow: {
      marginTop: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8 as any,
    },
    rowLabel: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    modalActionRow: {
      flexDirection: "row",
      gap: 8 as any,
      marginTop: 14,
      marginBottom: 8,
    },
    logRow: {
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 10,
      marginBottom: 8,
    },
    logStatus: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    logMeta: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
  });
}

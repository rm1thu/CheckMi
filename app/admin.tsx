import { Ionicons } from "@expo/vector-icons";
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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../src/api";
import { clearAdminToken, getAdminToken, saveAdminToken } from "../src/auth";
import { AppTheme, useAppTheme } from "../src/theme-mode";

const BASE_URL = getApiBaseUrl();

type AdminTab = "overview" | "users" | "alerts" | "requests";
type RequestStatusFilter = "pending" | "approved" | "rejected" | "all";
type AlertSeverityFilter = "all" | "urgent" | "warning" | "info";

type AdminOverview = {
  totalUsers: number;
  totalFamilies: number;
  totalFamilyMembers: number;
  totalMetricEntries: number;
  metricsLast24h: number;
  alertsLast24h: number;
  pendingDeletionRequests: number;
};

type AdminUserItem = {
  id: number;
  name: string;
  role: string;
  email?: string | null;
  familyId?: number | null;
  familyName?: string | null;
  lastMetricAt?: string | null;
  pendingDeletionRequests: number;
};

type AdminFamilyItem = {
  id: number;
  name: string;
  ownerUserId: number;
  ownerName?: string | null;
  memberCount: number;
  stepsGoal: number;
  sleepGoal: number;
  createdAt?: string | null;
};

type AdminAlertItem = {
  id: number;
  userId: number;
  userName: string;
  severity: "info" | "warning" | "urgent" | string;
  category: string;
  title: string;
  message: string;
  metricType?: string | null;
  metricValue?: number | null;
  isRead: number;
  createdAt: string;
};

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

const ADMIN_TABS: { key: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "overview", label: "Overview", icon: "grid-outline" },
  { key: "users", label: "Users", icon: "people-outline" },
  { key: "alerts", label: "Safety", icon: "warning-outline" },
  { key: "requests", label: "Requests", icon: "mail-open-outline" },
];

const REQUEST_STATUS_OPTIONS: { key: RequestStatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const ALERT_SEVERITY_OPTIONS: { key: AlertSeverityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
  { key: "warning", label: "Warning" },
  { key: "info", label: "Info" },
];

const ROLE_PRESETS = ["Self", "Parent", "Child", "Sibling", "Grandparent", "Caregiver"];

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

function severityLabel(v: string) {
  if (v === "urgent") return "URGENT";
  if (v === "warning") return "WARNING";
  return "INFO";
}

function severityColor(theme: AppTheme, severity: string) {
  if (severity === "urgent") return theme.danger;
  if (severity === "warning") return theme.warning;
  return theme.primary;
}

export default function AdminScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [families, setFamilies] = useState<AdminFamilyItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [alerts, setAlerts] = useState<AdminAlertItem[]>([]);
  const [requests, setRequests] = useState<AdminRequestItem[]>([]);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingFamilies, setLoadingFamilies] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const [userQuery, setUserQuery] = useState("");
  const [requestQuery, setRequestQuery] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>("pending");

  const [alertSeverityFilter, setAlertSeverityFilter] = useState<AlertSeverityFilter>("all");
  const [alertUnreadOnly, setAlertUnreadOnly] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState<AdminRequestItem | null>(null);
  const [requestDetailOpen, setRequestDetailOpen] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionLoading, setDecisionLoading] = useState(false);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTargetUser, setRoleTargetUser] = useState<AdminUserItem | null>(null);
  const [newRole, setNewRole] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const adminFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
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
    },
    [adminToken]
  );

  const loadOverview = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoadingOverview(true);
      const res = await adminFetch("/admin/overview");
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `Failed (${res.status})`);
      setOverview(data);
    } catch (e: any) {
      Alert.alert("Could not load overview", e?.message || "Try again.");
    } finally {
      setLoadingOverview(false);
    }
  }, [adminFetch, adminToken]);

  const loadFamilies = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoadingFamilies(true);
      const res = await adminFetch("/admin/families?limit=100");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.detail || `Failed (${res.status})`);
      setFamilies(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Could not load families", e?.message || "Try again.");
    } finally {
      setLoadingFamilies(false);
    }
  }, [adminFetch, adminToken]);

  const loadUsers = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoadingUsers(true);
      const res = await adminFetch("/admin/users?limit=200");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.detail || `Failed (${res.status})`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Could not load users", e?.message || "Try again.");
    } finally {
      setLoadingUsers(false);
    }
  }, [adminFetch, adminToken]);

  const loadAlerts = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoadingAlerts(true);
      const unreadParam = alertUnreadOnly ? 1 : 0;
      const res = await adminFetch(
        `/admin/alerts?severity=${encodeURIComponent(alertSeverityFilter)}&unread_only=${unreadParam}&limit=200`
      );
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.detail || `Failed (${res.status})`);
      setAlerts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Could not load alerts", e?.message || "Try again.");
    } finally {
      setLoadingAlerts(false);
    }
  }, [adminFetch, adminToken, alertSeverityFilter, alertUnreadOnly]);

  const loadRequests = useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoadingRequests(true);
      const res = await adminFetch("/admin/deletion-requests?status=all");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.detail || `Failed (${res.status})`);
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
      if (token) setAdminToken(token);
    })();
  }, []);

  useEffect(() => {
    if (!adminToken) return;
    void Promise.all([loadOverview(), loadFamilies(), loadUsers(), loadRequests()]);
  }, [adminToken, loadOverview, loadFamilies, loadUsers, loadRequests]);

  useEffect(() => {
    if (!adminToken) return;
    void loadAlerts();
  }, [adminToken, loadAlerts]);

  const visibleUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = [
        String(u.id),
        u.name || "",
        u.role || "",
        u.email || "",
        u.familyName || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, userQuery]);

  const visibleRequests = useMemo(() => {
    let rows = requests;
    if (requestStatusFilter !== "all") {
      rows = rows.filter((r) => r.status === requestStatusFilter);
    }

    const q = requestQuery.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = [
        String(r.id),
        r.userName || "",
        r.userRole || "",
        r.userEmail || "",
        r.requestType || "",
        r.status || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [requests, requestStatusFilter, requestQuery]);

  const requestCounts = useMemo(() => {
    const out = { pending: 0, approved: 0, rejected: 0, all: requests.length };
    for (const r of requests) {
      if (r.status === "pending") out.pending += 1;
      else if (r.status === "approved") out.approved += 1;
      else if (r.status === "rejected") out.rejected += 1;
    }
    return out;
  }, [requests]);

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

    setOverview(null);
    setFamilies([]);
    setUsers([]);
    setAlerts([]);
    setRequests([]);

    setUserQuery("");
    setRequestQuery("");
    setRequestStatusFilter("pending");
    setAlertSeverityFilter("all");
    setAlertUnreadOnly(false);

    setSelectedRequest(null);
    setRequestDetailOpen(false);
    setDecisionNote("");

    setRoleModalOpen(false);
    setRoleTargetUser(null);
    setNewRole("");

    setActiveTab("overview");
  };

  const refreshActiveTab = async () => {
    if (activeTab === "overview") {
      await Promise.all([loadOverview(), loadFamilies()]);
      return;
    }
    if (activeTab === "users") {
      await loadUsers();
      return;
    }
    if (activeTab === "alerts") {
      await loadAlerts();
      return;
    }
    await loadRequests();
  };

  const openRequestDetail = (item: AdminRequestItem) => {
    setSelectedRequest(item);
    setDecisionNote(item.reviewNote || "");
    setRequestDetailOpen(true);
  };

  const closeRequestDetail = () => {
    setRequestDetailOpen(false);
    setSelectedRequest(null);
    setDecisionNote("");
  };

  const submitRequestDecision = useCallback(
    async (id: number, decision: "approve" | "reject", note?: string) => {
      const trimmed = (note || "").trim();
      const path =
        decision === "approve"
          ? `/admin/deletion-requests/${id}/approve`
          : `/admin/deletion-requests/${id}/reject`;

      const body =
        decision === "approve"
          ? trimmed
            ? JSON.stringify({ note: trimmed })
            : undefined
          : JSON.stringify({ note: trimmed || "Rejected by admin" });

      const res = await adminFetch(path, {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.detail || `Failed (${res.status})`);
      return data;
    },
    [adminFetch]
  );

  const approveRequest = async (id: number, note?: string) => {
    try {
      setDecisionLoading(true);
      const data = await submitRequestDecision(id, "approve", note);
      await Promise.all([loadRequests(), loadOverview(), loadUsers()]);

      setSelectedRequest((prev) => {
        if (!prev || prev.id !== id) return prev;
        return {
          ...prev,
          status: "approved",
          reviewedAt: new Date().toISOString(),
          reviewedBy: username,
          reviewNote: (note || "").trim() || prev.reviewNote,
        };
      });

      Alert.alert("Approved", data?.detail || `Request #${id} approved.`);
    } catch (e: any) {
      Alert.alert("Approve failed", e?.message || "Try again.");
    } finally {
      setDecisionLoading(false);
    }
  };

  const rejectRequest = async (id: number, note?: string) => {
    try {
      setDecisionLoading(true);
      const data = await submitRequestDecision(id, "reject", note);
      await Promise.all([loadRequests(), loadOverview(), loadUsers()]);

      setSelectedRequest((prev) => {
        if (!prev || prev.id !== id) return prev;
        return {
          ...prev,
          status: "rejected",
          reviewedAt: new Date().toISOString(),
          reviewedBy: username,
          reviewNote: (note || "").trim() || "Rejected by admin",
        };
      });

      Alert.alert("Rejected", data?.detail || `Request #${id} rejected.`);
    } catch (e: any) {
      Alert.alert("Reject failed", e?.message || "Try again.");
    } finally {
      setDecisionLoading(false);
    }
  };

  const openRoleEditor = (user: AdminUserItem) => {
    setRoleTargetUser(user);
    setNewRole(user.role || "Self");
    setRoleModalOpen(true);
  };

  const closeRoleEditor = () => {
    setRoleModalOpen(false);
    setRoleTargetUser(null);
    setNewRole("");
  };

  const saveUserRole = async () => {
    if (!roleTargetUser) return;
    const role = newRole.trim();
    if (!role) {
      Alert.alert("Missing role", "Please enter a role.");
      return;
    }

    try {
      setSavingRole(true);
      const res = await adminFetch(`/admin/users/${roleTargetUser.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.detail || `Failed (${res.status})`);

      const updated = data as AdminUserItem;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setRequests((prev) =>
        prev.map((r) => (r.userId === updated.id ? { ...r, userRole: updated.role } : r))
      );
      setSelectedRequest((prev) =>
        prev && prev.userId === updated.id ? { ...prev, userRole: updated.role } : prev
      );

      Alert.alert("Updated", `Role for ${updated.name} is now ${updated.role}.`);
      closeRoleEditor();
    } catch (e: any) {
      Alert.alert("Could not update role", e?.message || "Try again.");
    } finally {
      setSavingRole(false);
    }
  };

  const renderOverview = () => {
    return (
      <>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>System Overview</Text>

          {loadingOverview && !overview ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : !overview ? (
            <Text style={styles.mutedText}>Overview data unavailable.</Text>
          ) : (
            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{overview.totalUsers}</Text>
                <Text style={styles.statLabel}>Users</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{overview.totalFamilies}</Text>
                <Text style={styles.statLabel}>Families</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{overview.metricsLast24h}</Text>
                <Text style={styles.statLabel}>Entries (24h)</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: theme.warning }]}>
                  {overview.pendingDeletionRequests}
                </Text>
                <Text style={styles.statLabel}>Pending Requests</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{overview.alertsLast24h}</Text>
                <Text style={styles.statLabel}>Alerts (24h)</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{overview.totalMetricEntries}</Text>
                <Text style={styles.statLabel}>Total Entries</Text>
              </View>
            </View>
          )}

          <View style={styles.quickNavRow}>
            <TouchableOpacity style={styles.quickNavBtn} onPress={() => setActiveTab("alerts")}> 
              <Ionicons name="warning-outline" size={14} color={theme.primaryText} />
              <Text style={styles.quickNavBtnText}>Open Safety</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickNavBtn} onPress={() => setActiveTab("requests")}> 
              <Ionicons name="mail-open-outline" size={14} color={theme.primaryText} />
              <Text style={styles.quickNavBtnText}>Open Requests</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Families</Text>
            <TouchableOpacity onPress={() => void loadFamilies()} style={styles.inlineIconBtn}>
              <Ionicons name="refresh" size={14} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>

          {loadingFamilies && families.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : families.length === 0 ? (
            <Text style={styles.mutedText}>No families found.</Text>
          ) : (
            families.slice(0, 10).map((family) => (
              <View key={family.id} style={styles.rowCard}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle}>{family.name}</Text>
                  <View style={styles.countChip}>
                    <Text style={styles.countChipText}>{family.memberCount} members</Text>
                  </View>
                </View>
                <Text style={styles.rowMeta}>Owner: {family.ownerName || `User #${family.ownerUserId}`}</Text>
                <Text style={styles.rowMeta}>
                  Goals: {family.stepsGoal} steps · {family.sleepGoal.toFixed(1)}h sleep
                </Text>
                <Text style={styles.rowMeta}>Created: {formatDate(family.createdAt)}</Text>
              </View>
            ))
          )}
        </View>
      </>
    );
  };

  const renderUsers = () => {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>User Management</Text>
        <Text style={styles.sectionSubtitle}>Search users and update their profile role.</Text>

        <TextInput
          style={styles.input}
          value={userQuery}
          onChangeText={setUserQuery}
          placeholder="Search by name, email, role, family or ID"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.rowMeta}>{visibleUsers.length} user(s)</Text>
          <TouchableOpacity onPress={() => void loadUsers()} style={styles.inlineIconBtn}>
            <Ionicons name="refresh" size={14} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {loadingUsers && users.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : visibleUsers.length === 0 ? (
          <Text style={styles.mutedText}>No users found for this search.</Text>
        ) : (
          visibleUsers.map((user) => (
            <View key={user.id} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{user.name}</Text>
                <View style={styles.roleChip}>
                  <Text style={styles.roleChipText}>{user.role}</Text>
                </View>
              </View>
              <Text style={styles.rowMeta}>ID: #{user.id}</Text>
              <Text style={styles.rowMeta}>Email: {user.email || "N/A"}</Text>
              <Text style={styles.rowMeta}>Family: {user.familyName || "Not in a family"}</Text>
              <Text style={styles.rowMeta}>Last metric entry: {formatDate(user.lastMetricAt)}</Text>

              <View style={styles.userFooterRow}>
                {user.pendingDeletionRequests > 0 ? (
                  <View style={styles.warningChip}>
                    <Text style={styles.warningChipText}>
                      {user.pendingDeletionRequests} pending request(s)
                    </Text>
                  </View>
                ) : (
                  <View />
                )}

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => openRoleEditor(user)}>
                  <Text style={styles.secondaryBtnText}>Edit Role</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  const renderAlerts = () => {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Safety Monitor</Text>
        <Text style={styles.sectionSubtitle}>Track recent user alerts across the app.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {ALERT_SEVERITY_OPTIONS.map((option) => {
            const active = alertSeverityFilter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setAlertSeverityFilter(option.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.filterChip, alertUnreadOnly && styles.filterChipActive]}
            onPress={() => setAlertUnreadOnly((prev) => !prev)}
          >
            <Text style={[styles.filterChipText, alertUnreadOnly && styles.filterChipTextActive]}>
              Unread only
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.rowMeta}>{alerts.length} alert(s)</Text>
          <TouchableOpacity onPress={() => void loadAlerts()} style={styles.inlineIconBtn}>
            <Ionicons name="refresh" size={14} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {loadingAlerts && alerts.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : alerts.length === 0 ? (
          <Text style={styles.mutedText}>No alerts match the selected filters.</Text>
        ) : (
          alerts.map((a) => (
            <View key={a.id} style={[styles.rowCard, { borderLeftColor: severityColor(theme, a.severity), borderLeftWidth: 4 }]}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{a.title}</Text>
                <View style={[styles.severityChip, { backgroundColor: `${severityColor(theme, a.severity)}22` }]}>
                  <Text style={[styles.severityChipText, { color: severityColor(theme, a.severity) }]}>
                    {severityLabel(a.severity)}
                  </Text>
                </View>
              </View>

              <Text style={styles.rowMeta}>User: {a.userName} (#{a.userId})</Text>
              <Text style={styles.rowMeta}>{a.message}</Text>
              <Text style={styles.rowMeta}>Metric: {a.metricType || "N/A"}</Text>
              <Text style={styles.rowMeta}>Time: {formatDate(a.createdAt)}</Text>
            </View>
          ))
        )}
      </View>
    );
  };

  const renderRequests = () => {
    return (
      <>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Deletion Requests</Text>
          <Text style={styles.sectionSubtitle}>Approve or reject user data/account deletion requests.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {REQUEST_STATUS_OPTIONS.map((option) => {
              const active = requestStatusFilter === option.key;
              const count = requestCounts[option.key];
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setRequestStatusFilter(option.key)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {option.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput
            style={styles.input}
            value={requestQuery}
            onChangeText={setRequestQuery}
            placeholder="Search by name, email, role, status or ID"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.rowMeta}>{visibleRequests.length} request(s)</Text>
            <TouchableOpacity onPress={() => void loadRequests()} style={styles.inlineIconBtn}>
              <Ionicons name="refresh" size={14} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionCard}>
          {loadingRequests && requests.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : visibleRequests.length === 0 ? (
            <Text style={styles.mutedText}>No requests found for this filter.</Text>
          ) : (
            visibleRequests.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.rowCard}
                activeOpacity={0.92}
                onPress={() => openRequestDetail(item)}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle}>#{item.id} · {requestTypeLabel(item.requestType)}</Text>
                  <View
                    style={[
                      styles.statusChip,
                      item.status === "approved"
                        ? styles.statusChipApproved
                        : item.status === "rejected"
                        ? styles.statusChipRejected
                        : styles.statusChipPending,
                    ]}
                  >
                    <Text style={styles.statusChipText}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.rowMeta}>User: {item.userName} · {item.userRole}</Text>
                <Text style={styles.rowMeta}>Email: {item.userEmail || "N/A"}</Text>
                <Text style={styles.rowMeta}>Requested: {formatDate(item.requestedAt)}</Text>

                {item.status !== "pending" ? (
                  <>
                    <Text style={styles.rowMeta}>
                      Reviewed: {formatDate(item.reviewedAt)} by {item.reviewedBy || "N/A"}
                    </Text>
                    {item.reviewNote ? <Text style={styles.rowMeta}>Note: {item.reviewNote}</Text> : null}
                  </>
                ) : (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, styles.actionBtn]}
                      onPress={() => void rejectRequest(item.id, "Rejected by admin")}
                      disabled={decisionLoading}
                    >
                      <Text style={styles.secondaryBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.actionBtn]}
                      onPress={() => void approveRequest(item.id)}
                      disabled={decisionLoading}
                    >
                      <Text style={styles.primaryBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </>
    );
  };

  if (!adminToken) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBlob} />
        <View style={styles.bottomBlob} />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={18} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Admin Access</Text>
            <View style={styles.iconBtnGhost} />
          </View>

          <Text style={styles.subtitle}>Sign in to manage users, safety alerts, and deletion requests.</Text>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Admin Login</Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="admin"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={theme.textMuted}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={theme.primaryText} />
              ) : (
                <Text style={styles.primaryBtnText}>Log in as admin</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBlob} />
      <View style={styles.bottomBlob} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Admin Console</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => void refreshActiveTab()}>
              <Ionicons name="refresh" size={16} color={theme.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={16} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.subtitle}>Manage app health operations and user safety from one place.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {ADMIN_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabChip, active && styles.tabChipActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={active ? theme.primaryText : theme.textSecondary}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {activeTab === "overview" ? renderOverview() : null}
        {activeTab === "users" ? renderUsers() : null}
        {activeTab === "alerts" ? renderAlerts() : null}
        {activeTab === "requests" ? renderRequests() : null}
      </ScrollView>

      <Modal
        visible={requestDetailOpen}
        transparent
        animationType="slide"
        onRequestClose={closeRequestDetail}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Request Details</Text>
                <TouchableOpacity style={styles.iconBtn} onPress={closeRequestDetail}>
                  <Ionicons name="close" size={16} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>

              {selectedRequest ? (
                <>
                  <Text style={styles.rowMeta}>
                    ID: #{selectedRequest.id} · {requestTypeLabel(selectedRequest.requestType)}
                  </Text>
                  <Text style={styles.rowMeta}>Status: {selectedRequest.status}</Text>
                  <Text style={styles.rowMeta}>User: {selectedRequest.userName}</Text>
                  <Text style={styles.rowMeta}>Role: {selectedRequest.userRole}</Text>
                  <Text style={styles.rowMeta}>Email: {selectedRequest.userEmail || "N/A"}</Text>
                  <Text style={styles.rowMeta}>Requested: {formatDate(selectedRequest.requestedAt)}</Text>
                  {selectedRequest.status !== "pending" ? (
                    <Text style={styles.rowMeta}>
                      Reviewed: {formatDate(selectedRequest.reviewedAt)} by {selectedRequest.reviewedBy || "N/A"}
                    </Text>
                  ) : null}

                  <Text style={styles.label}>Review note</Text>
                  <TextInput
                    style={styles.noteInput}
                    value={decisionNote}
                    onChangeText={setDecisionNote}
                    placeholder="Optional note for approval or rejection"
                    placeholderTextColor={theme.textMuted}
                    editable={selectedRequest.status === "pending" && !decisionLoading}
                    multiline
                  />

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, styles.actionBtn]}
                      onPress={() => void rejectRequest(selectedRequest.id, decisionNote)}
                      disabled={selectedRequest.status !== "pending" || decisionLoading}
                    >
                      {decisionLoading ? (
                        <ActivityIndicator color={theme.primaryText} />
                      ) : (
                        <Text style={styles.secondaryBtnText}>Reject</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.actionBtn]}
                      onPress={() => void approveRequest(selectedRequest.id, decisionNote)}
                      disabled={selectedRequest.status !== "pending" || decisionLoading}
                    >
                      {decisionLoading ? (
                        <ActivityIndicator color={theme.primaryText} />
                      ) : (
                        <Text style={styles.primaryBtnText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={styles.mutedText}>Request not found.</Text>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={roleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeRoleEditor}
      >
        <View style={styles.modalBackdropCenter}>
          <View style={styles.roleModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update User Role</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={closeRoleEditor}>
                <Ionicons name="close" size={16} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.rowMeta}>
              {roleTargetUser ? `${roleTargetUser.name} (#${roleTargetUser.id})` : "No user selected"}
            </Text>

            <Text style={styles.label}>Quick roles</Text>
            <View style={styles.rolePresetWrap}>
              {ROLE_PRESETS.map((role) => {
                const active = newRole.trim().toLowerCase() === role.toLowerCase();
                return (
                  <TouchableOpacity
                    key={role}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => setNewRole(role)}
                  >
                    <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>{role}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Role value</Text>
            <TextInput
              style={styles.input}
              value={newRole}
              onChangeText={setNewRole}
              placeholder="Enter role"
              placeholderTextColor={theme.textMuted}
            />

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, styles.actionBtn]}
                onPress={closeRoleEditor}
                disabled={savingRole}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.actionBtn]}
                onPress={saveUserRole}
                disabled={savingRole}
              >
                {savingRole ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <Text style={styles.primaryBtnText}>Save Role</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const dark = theme.mode === "dark";
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    topBlob: {
      position: "absolute",
      top: -130,
      right: -90,
      width: 240,
      height: 240,
      borderRadius: 999,
      backgroundColor: dark ? "rgba(59,130,246,0.23)" : "rgba(59,130,246,0.12)",
    },
    bottomBlob: {
      position: "absolute",
      bottom: -140,
      left: -90,
      width: 260,
      height: 260,
      borderRadius: 999,
      backgroundColor: dark ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.1)",
    },
    content: {
      paddingTop: 58,
      paddingHorizontal: 20,
      paddingBottom: 36,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10 as any,
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
    inlineIconBtn: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surfaceAlt,
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
    tabRow: {
      paddingBottom: 12,
      gap: 8 as any,
    },
    tabChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6 as any,
      backgroundColor: theme.surface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tabChipActive: {
      backgroundColor: theme.primaryStrong,
      borderColor: theme.primaryStrong,
    },
    tabText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: "700",
    },
    tabTextActive: {
      color: theme.primaryText,
    },
    sectionCard: {
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
      marginBottom: 8,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 10,
    },
    sectionHeaderRow: {
      marginTop: 8,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    label: {
      marginTop: 8,
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
    noteInput: {
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      color: theme.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 80,
      textAlignVertical: "top",
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
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryBtnText: {
      color: theme.textPrimary,
      fontWeight: "700",
      fontSize: 13,
    },
    quickNavRow: {
      marginTop: 10,
      flexDirection: "row",
      gap: 8 as any,
    },
    quickNavBtn: {
      flex: 1,
      marginTop: 2,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6 as any,
      backgroundColor: theme.primaryStrong,
      borderRadius: 10,
      paddingVertical: 9,
    },
    quickNavBtnText: {
      color: theme.primaryText,
      fontSize: 12,
      fontWeight: "700",
    },
    statGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    statCard: {
      width: "48%",
      marginBottom: 10,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center",
    },
    statValue: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: "800",
    },
    statLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    chipRow: {
      paddingBottom: 10,
      gap: 8 as any,
    },
    filterChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterChipActive: {
      backgroundColor: theme.primaryStrong,
      borderColor: theme.primaryStrong,
    },
    filterChipText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: "700",
    },
    filterChipTextActive: {
      color: theme.primaryText,
    },
    rowCard: {
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
      gap: 8 as any,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.textPrimary,
      flex: 1,
    },
    rowMeta: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 2,
    },
    mutedText: {
      color: theme.textSecondary,
      marginTop: 6,
    },
    countChip: {
      borderRadius: 999,
      backgroundColor: `${theme.primary}22`,
      borderWidth: 1,
      borderColor: `${theme.primary}66`,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    countChipText: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: "700",
    },
    roleChip: {
      borderRadius: 999,
      backgroundColor: `${theme.primary}22`,
      borderWidth: 1,
      borderColor: `${theme.primary}66`,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    roleChipText: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: "700",
    },
    warningChip: {
      borderRadius: 999,
      backgroundColor: `${theme.warning}22`,
      borderWidth: 1,
      borderColor: `${theme.warning}66`,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    warningChipText: {
      color: theme.warning,
      fontSize: 11,
      fontWeight: "700",
    },
    userFooterRow: {
      marginTop: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8 as any,
    },
    severityChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
    severityChipText: {
      fontSize: 11,
      fontWeight: "700",
    },
    statusChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
    },
    statusChipPending: {
      backgroundColor: `${theme.warning}1f`,
      borderColor: `${theme.warning}66`,
    },
    statusChipApproved: {
      backgroundColor: `${theme.success}22`,
      borderColor: `${theme.success}66`,
    },
    statusChipRejected: {
      backgroundColor: `${theme.danger}22`,
      borderColor: `${theme.danger}66`,
    },
    statusChipText: {
      color: theme.textPrimary,
      fontSize: 11,
      fontWeight: "700",
    },
    actionRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8 as any,
      marginTop: 8,
    },
    actionBtn: {
      marginTop: 0,
      minWidth: 100,
    },
    loadingWrap: {
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 20,
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
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    modalTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: "800",
    },
    modalBackdropCenter: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    roleModalCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
    },
    rolePresetWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8 as any,
      marginBottom: 8,
    },
    presetChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    presetChipActive: {
      backgroundColor: theme.primaryStrong,
      borderColor: theme.primaryStrong,
    },
    presetChipText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: "700",
    },
    presetChipTextActive: {
      color: theme.primaryText,
    },
  });
}

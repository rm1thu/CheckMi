import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { getApiBaseUrl } from "../src/api";
import { getToken } from "../src/auth";
import { AppTheme, useAppTheme } from "../src/theme-mode";

const BASE_URL = getApiBaseUrl();
const MAX_NAME_LENGTH = 100;
const MAX_ROLE_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type MeProfile = {
  id: number;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  email?: string | null;
};

const DEFAULT_ROLE_OPTIONS = [
  "Self",
  "Parent",
  "Child",
  "Spouse/Partner",
  "Sibling",
  "Grandparent",
  "Caregiver",
  "Other",
];

export default function ProfileScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);

  const [me, setMe] = useState<MeProfile | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const roleOptions = React.useMemo(() => {
    if (role && !DEFAULT_ROLE_OPTIONS.includes(role)) {
      return [role, ...DEFAULT_ROLE_OPTIONS];
    }
    return DEFAULT_ROLE_OPTIONS;
  }, [role]);

  const fetchMe = async () => {
    const token = await getToken();
    if (!token) {
      router.replace("/(auth)/login");
      return;
    }

    const res = await fetch(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text || "Request failed"}`);

    const data: MeProfile = JSON.parse(text);
    setMe(data);
    setFirstName(data.firstName ?? "");
    setLastName(data.lastName ?? "");
    setRole(data.role ?? "");
    setEmail((data.email ?? "") as string);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await fetchMe();
      } catch (e: any) {
        Alert.alert("Profile error", e?.message ?? "Could not load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    try {
      if (!me) return;

      const fn = firstName.trim();
      const ln = lastName.trim();
      const r = role.trim();
      const em = email.trim();

      if (fn.length < 2 || ln.length < 2 || !r) {
        Alert.alert("Missing info", "First name, last name and role are required.");
        return;
      }
      if (fn.length > MAX_NAME_LENGTH || ln.length > MAX_NAME_LENGTH) {
        Alert.alert("Name too long", `Names must be ${MAX_NAME_LENGTH} characters or fewer.`);
        return;
      }
      if (r.length > MAX_ROLE_LENGTH) {
        Alert.alert("Role too long", `Role must be ${MAX_ROLE_LENGTH} characters or fewer.`);
        return;
      }
      if (em && !isValidEmail(em)) {
        Alert.alert("Invalid email", "Please enter a valid email.");
        return;
      }

      setSaving(true);
      const token = await getToken();
      if (!token) throw new Error("Missing token");

      const res = await fetch(`${BASE_URL}/me`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: fn,
          lastName: ln,
          role: r,
          email: em,
        }),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text || "Save failed"}`);

      const updated: MeProfile = JSON.parse(text);
      setMe(updated);

      Alert.alert("Saved", "Your profile has been updated.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.title}>My Profile</Text>

        <TouchableOpacity onPress={save} style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving}>
          {saving ? <ActivityIndicator /> : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>First name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          maxLength={MAX_NAME_LENGTH}
        />

        <Text style={styles.label}>Last name</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          maxLength={MAX_NAME_LENGTH}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          maxLength={MAX_EMAIL_LENGTH}
        />

        <Text style={styles.label}>Role</Text>
        <TouchableOpacity
          style={[styles.input, styles.roleSelect]}
          onPress={() => setRoleModalVisible(true)}
          activeOpacity={0.9}
        >
          <Text style={styles.roleValue}>{role || "Select your role"}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={roleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRoleModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setRoleModalVisible(false)}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Role</Text>

            {roleOptions.map((item) => {
              const selected = item === role;
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.modalOption, selected && styles.modalOptionSelected]}
                  onPress={() => {
                    setRole(item);
                    setRoleModalVisible(false);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalOptionText}>{item}</Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={18} color={theme.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setRoleModalVisible(false)}
              activeOpacity={0.9}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: 60,
      paddingHorizontal: 20,
      backgroundColor: theme.background,
    },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },

    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    iconBtn: { padding: 8, borderRadius: 999, backgroundColor: theme.surface },

    title: { fontSize: 22, fontWeight: "800", color: theme.textPrimary },

    saveBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: theme.primaryStrong,
    },
    saveText: { color: theme.primaryText, fontWeight: "800" },

    card: { backgroundColor: theme.surface, borderRadius: 16, padding: 16 },
    label: { fontSize: 12, color: theme.textSecondary, marginTop: 10, marginBottom: 6 },
    input: {
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.textPrimary,
    },
    roleSelect: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    roleValue: {
      fontSize: 15,
      color: theme.textPrimary,
      fontWeight: "500",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 20,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: theme.textPrimary,
      marginBottom: 8,
    },
    modalOption: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    modalOptionSelected: {
      backgroundColor: theme.surfaceAlt,
    },
    modalOptionText: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    modalClose: {
      marginTop: 8,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 999,
      alignItems: "center",
      paddingVertical: 11,
    },
    modalCloseText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.textPrimary,
    },
  });
}

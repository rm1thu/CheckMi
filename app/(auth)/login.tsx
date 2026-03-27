import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getApiBaseUrl } from "../../src/api";
import { saveToken } from "../../src/auth";
import { queueTabToast } from "../../src/tab-toast";

const BASE_URL = getApiBaseUrl();

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !submitting;
  }, [email, password, submitting]);

  const handleLogin = async () => {
    if (!canSubmit) return;

    try {
      setSubmitting(true);

      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Login failed", data?.detail || "Invalid email or password.");
        return;
      }

      if (!data?.token) {
        Alert.alert("Login failed", "Server did not return a session token.");
        return;
      }

      await saveToken(data.token);
      await queueTabToast({
        title: "Login successful",
        message: "You have logged in successfully.",
      });
      router.replace("/(tabs)");
    } catch {
      Alert.alert("Network error", "Could not reach the backend.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* blobs like welcome */}
      <View style={styles.topBlob} />
      <View style={styles.bottomBlob} />

      <View style={styles.content}>
        <Text style={styles.title}>CheckMi</Text>
        <Text style={styles.subtitle}>Welcome to your health space</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="rgba(255,255,255,0.45)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="••••••••"
              placeholderTextColor="rgba(255,255,255,0.45)"
              secureTextEntry={!showPw}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPw((v) => !v)}
              activeOpacity={0.8}
              style={styles.showBtn}
            >
              <Text style={styles.showText}>{showPw ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            activeOpacity={0.85}
            onPress={handleLogin}
            disabled={!canSubmit}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log in</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/signup")}
            activeOpacity={0.8}
            style={styles.linkWrap}
          >
            <Text style={styles.linkText}>
              No account? <Text style={styles.linkAccent}>Sign up</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/admin")}
            activeOpacity={0.85}
            style={styles.adminButton}
          >
            <Text style={styles.adminButtonText}>Admin login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },


  topBlob: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.35)",
  },
  bottomBlob: {
    position: "absolute",
    bottom: -140,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.25)",
  },

  title: {
    color: "white",
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.70)",
    marginTop: 6,
    marginBottom: 18,
    fontSize: 15,
    textAlign: "center",
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },

  label: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },

  input: {
    color: "white",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    paddingRight: 90, 
  },
  showBtn: {
    position: "absolute",
    right: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  showText: {
    color: "#60a5fa",
    fontWeight: "700",
  },

  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
  },

  linkWrap: {
    marginTop: 14,
    alignItems: "center",
  },
  linkText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },
  linkAccent: {
    color: "#60a5fa",
    fontWeight: "800",
  },
  adminButton: {
    marginTop: 12,
    alignSelf: "center",
    minWidth: 170,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  adminButtonText: {
    color: "#dbeafe",
    fontSize: 14,
    fontWeight: "800",
  },
});

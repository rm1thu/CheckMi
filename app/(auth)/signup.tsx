import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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

const BASE_URL = getApiBaseUrl();
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MAX_PASSWORD_LENGTH = 128;

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const pwRules = (pw: string) => ({
  len: pw.length >= 8,
  num: /\d/.test(pw),
  sym: /[^A-Za-z0-9]/.test(pw),
});

export default function SignupScreen() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [touched, setTouched] = useState({
    first: false,
    last: false,
    email: false,
    pw: false,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  const firstOk = useMemo(() => firstName.trim().length >= 2, [firstName]);
  const lastOk = useMemo(() => lastName.trim().length >= 2, [lastName]);
  const emailOk = useMemo(() => isValidEmail(email), [email]);
  const rules = useMemo(() => pwRules(password), [password]);
  const pwOk = rules.len && rules.num && rules.sym;

  const canSubmit = firstOk && lastOk && emailOk && pwOk && !submitting;

  const onSignup = async () => {
    setTouched({ first: true, last: true, email: true, pw: true });
    setFormError(null);

    if (!canSubmit) return;

    try {
      setSubmitting(true);

      const res = await fetch(`${BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data?.detail || "Signup failed.");
        return;
      }

      if (data?.token) await saveToken(data.token);

      router.replace("/(tabs)");
    } catch {
      setFormError("Network error. Is your backend running?");
    } finally {
      setSubmitting(false);
    }
  };

  const Rule = ({ ok, text }: { ok: boolean; text: string }) => (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleDot, ok && styles.ruleDotOk]}>{ok ? "✓" : "•"}</Text>
      <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{text}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Welcome-style blobs */}
      <View style={styles.topBlob} />
      <View style={styles.bottomBlob} />

      <Animated.View
        style={[
          styles.container,
          { opacity: fade, transform: [{ translateY: slide }] },
        ]}
      >
        <Text style={styles.brand}>Create account</Text>
        <Text style={styles.subtitle}>Join your family health space</Text>

        <View style={styles.card}>
          <Text style={styles.label}>First name</Text>
          <TextInput
            style={[styles.input, touched.first && !firstOk && styles.inputError]}
            value={firstName}
            onChangeText={setFirstName}
            onBlur={() => setTouched((t) => ({ ...t, first: true }))}
            maxLength={MAX_NAME_LENGTH}
            returnKeyType="next"
            onSubmitEditing={() => lastRef.current?.focus()}
            placeholder="First Name"
            placeholderTextColor={styles._ph.color}
          />
          {touched.first && !firstOk ? (
            <Text style={styles.helpError}>At least 2 characters.</Text>
          ) : null}

          <Text style={[styles.label, { marginTop: 12 }]}>Last name</Text>
          <TextInput
            ref={lastRef}
            style={[styles.input, touched.last && !lastOk && styles.inputError]}
            value={lastName}
            onChangeText={setLastName}
            onBlur={() => setTouched((t) => ({ ...t, last: true }))}
            maxLength={MAX_NAME_LENGTH}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            placeholder="Last Name"
            placeholderTextColor={styles._ph.color}
          />
          {touched.last && !lastOk ? (
            <Text style={styles.helpError}>At least 2 characters.</Text>
          ) : null}

          <Text style={[styles.label, { marginTop: 12 }]}>Email</Text>
          <TextInput
            ref={emailRef}
            style={[styles.input, touched.email && !emailOk && styles.inputError]}
            value={email}
            onChangeText={setEmail}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder="you@example.com"
            placeholderTextColor={styles._ph.color}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={MAX_EMAIL_LENGTH}
            returnKeyType="next"
            onSubmitEditing={() => pwRef.current?.focus()}
          />
          {touched.email && !emailOk ? (
            <Text style={styles.helpError}>Enter a valid email.</Text>
          ) : null}

          <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
          <View style={styles.pwRow}>
            <TextInput
              ref={pwRef}
              style={[
                styles.input,
                styles.pwInput,
                touched.pw && !pwOk && styles.inputError,
              ]}
              value={password}
              onChangeText={setPassword}
              onBlur={() => setTouched((t) => ({ ...t, pw: true }))}
              placeholder="Create a strong password"
              placeholderTextColor={styles._ph.color}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              maxLength={MAX_PASSWORD_LENGTH}
              returnKeyType="done"
              onSubmitEditing={onSignup}
            />
            <TouchableOpacity onPress={() => setShowPw((s) => !s)} style={styles.pwToggle}>
              <Text style={styles.pwToggleText}>{showPw ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 10 }}>
            <Rule ok={rules.len} text="At least 8 characters" />
            <Rule ok={rules.num} text="Contains a number" />
            <Rule ok={rules.sym} text="Contains a symbol" />
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <TouchableOpacity
            onPress={onSignup}
            activeOpacity={0.9}
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            disabled={!canSubmit}
          >
            {submitting ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryBtnText}>Creating…</Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>Sign up</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text style={styles.footerLink}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Welcome background
  screen: {
    flex: 1,
    backgroundColor: "#0B1220",
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  container: { width: "100%" },

  // Welcome blobs
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

  // Headings
  brand: {
    fontSize: 26,
    fontWeight: "900",
    color: "#ffffff",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.70)",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 14,
  },


  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },

  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.78)",
    marginBottom: 6,
  },

  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#ffffff",
  },

  _ph: { color: "rgba(255,255,255,0.45)" } as any,

  inputError: { borderColor: "#ef4444" },
  helpError: {
    marginTop: 6,
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "700",
  },

  pwRow: { position: "relative" },
  pwInput: { paddingRight: 70 },
  pwToggle: { position: "absolute", right: 14, top: 11, paddingVertical: 4, paddingHorizontal: 6 },
  pwToggleText: { color: "#60a5fa", fontWeight: "800" },

  ruleRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  ruleDot: { width: 18, color: "rgba(255,255,255,0.55)", fontWeight: "900" },
  ruleDotOk: { color: "#22c55e" },
  ruleText: { color: "rgba(255,255,255,0.55)", fontWeight: "700" },
  ruleTextOk: { color: "#22c55e" },

  formError: { marginTop: 12, color: "#fca5a5", fontSize: 13, fontWeight: "800" },


  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  footerRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 },
  footerText: { color: "rgba(255,255,255,0.70)", fontWeight: "600" },
  footerLink: { color: "#60a5fa", fontWeight: "900" },
});

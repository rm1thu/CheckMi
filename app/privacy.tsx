import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppTheme, useAppTheme } from "../src/theme-mode";

export default function PrivacyScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.subtitle}>How CheckMi handles your data</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Data we store</Text>
        <Text style={styles.paragraph}>
          CheckMi stores account details, health metrics you log, consent settings,
          and alerts generated from your data.
        </Text>

        <Text style={styles.sectionTitle}>Sharing controls</Text>
        <Text style={styles.paragraph}>
          Family data visibility follows your consent settings. You can change these
          controls at any time in the dashboard.
        </Text>

        <Text style={styles.sectionTitle}>Your rights</Text>
        <Text style={styles.paragraph}>
          You can export your data, delete your personal data, or permanently delete
          your account from Settings.
        </Text>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
    backBtn: { alignSelf: "flex-start", marginBottom: 16 },
    backText: { color: theme.textPrimary, fontWeight: "700" },
    title: { fontSize: 28, fontWeight: "800", color: theme.textPrimary },
    subtitle: { marginTop: 6, marginBottom: 16, color: theme.textSecondary },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 16,
      shadowColor: theme.shadow,
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.04,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 8,
      elevation: 1,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.textPrimary,
      marginTop: 2,
    },
    paragraph: {
      color: theme.textSecondary,
      lineHeight: 22,
      marginTop: 6,
      marginBottom: 12,
    },
  });
}

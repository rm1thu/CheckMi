import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppTheme, useAppTheme } from "../src/theme-mode";

export default function AboutScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>About CheckMi</Text>
      <Text style={styles.subtitle}>Version 1.0.0</Text>

      <View style={styles.card}>
        <Text style={styles.paragraph}>
          CheckMi helps families track daily health metrics, share data safely, and
          stay informed with practical guidance.
        </Text>
        <Text style={styles.paragraph}>
          The app includes personal dashboards, family views, consent-based sharing,
          and export/delete data controls.
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
    paragraph: { color: theme.textSecondary, lineHeight: 22, marginBottom: 12 },
  });
}

import { router } from "expo-router";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import * as Clipboard from "expo-clipboard";

export default function InviteScreen() {
  const inviteCode = "X8DK4S"; 

  const copyCode = () => {
    Clipboard.setStringAsync(inviteCode);
  };

  return (
    <View style={styles.screen}>

   
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Invite Family Member</Text>
      <Text style={styles.subtitle}>Share this code to let someone join your family.</Text>

   
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Invite Code</Text>
        <Text style={styles.code}>{inviteCode}</Text>

        <TouchableOpacity style={styles.copyButton} onPress={copyCode}>
          <Text style={styles.copyText}>Copy Code</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.infoText}>
        When someone enters this code, they will join your family group.
      </Text>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f6fb",
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backArrow: {
    fontSize: 22,
    marginRight: 6,
    color: "#111827",
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
    alignItems: "center",
    marginBottom: 20,
  },

  cardTitle: {
    fontSize: 15,
    color: "#6b7280",
    marginBottom: 10,
  },

  code: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 4,
    color: "#111827",
    marginBottom: 20,
  },

  copyButton: {
    backgroundColor: "#020617",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },

  copyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  infoText: {
    textAlign: "center",
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
    marginTop: 10,
  },
});

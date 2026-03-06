import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { StyleSheet, View } from "react-native";

import { CornerBubbles } from "@/components/corner-bubbles";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemeModeProvider } from "@/src/theme-mode";

export default function RootLayout() {
  return (
    <ThemeModeProvider>
      <AppNavigator />
    </ThemeModeProvider>
  );
}

function AppNavigator() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const isAuthOrWelcome =
    segments[0] === "(auth)" || segments[0] === "welcome";

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <View style={styles.container}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="member" />
        </Stack>
        {!isAuthOrWelcome ? <CornerBubbles /> : null}
      </View>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

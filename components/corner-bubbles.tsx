import React from "react";
import { StyleSheet, View } from "react-native";

import { useAppTheme } from "@/src/theme-mode";

export function CornerBubbles() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme.mode), [theme.mode]);

  return (
    <View pointerEvents="none" style={styles.layer}>
      <View style={styles.topBubble} />
      <View style={styles.bottomBubble} />
    </View>
  );
}

function createStyles(mode: "light" | "dark") {
  const topColor =
    mode === "dark" ? "rgba(59,130,246,0.16)" : "rgba(59,130,246,0.09)";
  const bottomColor =
    mode === "dark" ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.07)";

  return StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10,
      overflow: "hidden",
    },
    topBubble: {
      position: "absolute",
      top: -165,
      right: -145,
      width: 220,
      height: 220,
      borderRadius: 999,
      backgroundColor: topColor,
    },
    bottomBubble: {
      position: "absolute",
      bottom: -190,
      left: -155,
      width: 250,
      height: 250,
      borderRadius: 999,
      backgroundColor: bottomColor,
    },
  });
}

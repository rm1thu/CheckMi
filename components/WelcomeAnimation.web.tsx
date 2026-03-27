import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

type WelcomeAnimationProps = {
  style?: StyleProp<ViewStyle>;
};

export default function WelcomeAnimation({ style }: WelcomeAnimationProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const outerScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });

  const outerOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.5],
  });

  const innerScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.04],
  });

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.outerRing,
          {
            opacity: outerOpacity,
            transform: [{ scale: outerScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.innerRing,
          {
            transform: [{ scale: innerScale }],
          },
        ]}
      />
      <View style={styles.core}>
        <Text style={styles.heart}>♡</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  outerRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(37,99,235,0.16)",
  },
  innerRing: {
    position: "absolute",
    width: 168,
    height: 168,
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  core: {
    width: 112,
    height: 112,
    borderRadius: 999,
    backgroundColor: "rgba(11,18,32,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heart: {
    color: "#fb7185",
    fontSize: 44,
    fontWeight: "700",
  },
});

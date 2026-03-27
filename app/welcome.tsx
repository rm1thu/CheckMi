import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import WelcomeAnimation from "../components/WelcomeAnimation";

export default function Welcome() {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(25)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* background blobs */}
      <View style={styles.topBlob} />
      <View style={styles.bottomBlob} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fade,
            transform: [{ translateY: slide }, { scale }],
          },
        ]}
      >
        <Text style={styles.title}>CheckMi</Text>
        <Text style={styles.subtitle}>Your family health companion</Text>

        <WelcomeAnimation style={styles.animation} />

        <Text style={styles.description}>
          Track health metrics, monitor trends, and support your family’s wellbeing — all in one place.
        </Text>

        {/* Buttons */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace("/(auth)/signup")}
          style={styles.linkWrap}
        >
          <Text style={styles.linkText}>New here? Create an account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1220",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  content: {
    alignItems: "center",
  },

  title: {
    color: "white",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  subtitle: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
    fontSize: 16,
  },

  animation: {
    width: 240,
    height: 240,
    marginVertical: 10,
  },

  description: {
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },

  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 16,
  },

  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  linkWrap: {
    marginTop: 16,
  },

  linkText: {
    color: "rgba(255,255,255,0.75)",
    textDecorationLine: "underline",
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
});

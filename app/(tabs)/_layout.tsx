import { Tabs } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  consumeQueuedTabToast,
  subscribeToTabToast,
  type TabToast,
} from '@/src/tab-toast';
import { useAppTheme } from '@/src/theme-mode';

export default function TabLayout() {
  const theme = useAppTheme();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastContent, setToastContent] = useState<TabToast | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-18)).current;
  const showDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    const clearToastTimers = () => {
      if (showDelayRef.current) clearTimeout(showDelayRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };

    const showToast = (nextToast: TabToast) => {
      if (!mounted) return;

      clearToastTimers();
      toastOpacity.stopAnimation();
      toastTranslateY.stopAnimation();

      showDelayRef.current = setTimeout(() => {
        if (!mounted) return;

        setToastContent(nextToast);
        setToastVisible(true);
        toastOpacity.setValue(0);
        toastTranslateY.setValue(-18);

        Animated.parallel([
          Animated.timing(toastOpacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(toastTranslateY, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }),
        ]).start();

        hideTimerRef.current = setTimeout(() => {
          Animated.parallel([
            Animated.timing(toastOpacity, {
              toValue: 0,
              duration: 260,
              useNativeDriver: true,
            }),
            Animated.timing(toastTranslateY, {
              toValue: -18,
              duration: 260,
              useNativeDriver: true,
            }),
          ]).start(() => {
            if (!mounted) return;
            setToastVisible(false);
            setToastContent(null);
          });
        }, 4200);
      }, 450);
    };

    const unsubscribe = subscribeToTabToast((nextToast) => {
      showToast(nextToast);
    });

    const showQueuedToast = async () => {
      const queuedToast = await consumeQueuedTabToast();
      if (!queuedToast || !mounted) return;
      showToast(queuedToast);
    };

    void showQueuedToast();

    return () => {
      mounted = false;
      unsubscribe();
      clearToastTimers();
      toastOpacity.stopAnimation();
      toastTranslateY.stopAnimation();
    };
  }, [toastOpacity, toastTranslateY]);

  const toast = toastVisible && toastContent ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toastWrap,
        {
          opacity: toastOpacity,
          transform: [{ translateY: toastTranslateY }],
        },
      ]}
    >
      <View
        style={[
          styles.toastCard,
          {
            backgroundColor: theme.primaryStrong,
            shadowColor: theme.shadow,
            borderColor:
              theme.mode === 'dark'
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <Text style={[styles.toastTitle, { color: theme.primaryText }]}>
          {toastContent.title}
        </Text>
        <Text style={[styles.toastText, { color: theme.primaryText }]}>
          {toastContent.message}
        </Text>
      </View>
    </Animated.View>
  ) : null;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
          animation: 'shift',
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
          },
          headerShown: false,
          tabBarButton: HapticTab,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="house.fill" color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="square.grid.2x2.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="gearshape.fill" color={color} />
            ),
          }}
        />
      </Tabs>
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toastWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 24,
    left: 18,
    right: 18,
    zIndex: 1000,
  },
  toastCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  toastText: {
    fontSize: 13,
    marginTop: 3,
    opacity: 0.92,
  },
});

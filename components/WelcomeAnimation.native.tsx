import LottieView from "lottie-react-native";
import React from "react";
import { StyleProp, ViewStyle } from "react-native";

type WelcomeAnimationProps = {
  style?: StyleProp<ViewStyle>;
};

export default function WelcomeAnimation({ style }: WelcomeAnimationProps) {
  return (
    <LottieView
      source={require("../assets/animations/heartbeat.json")}
      autoPlay
      loop
      style={style}
    />
  );
}

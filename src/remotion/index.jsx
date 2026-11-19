import React from "react";
import { Composition } from "remotion";

const Main = ({ title = "Your next video", subtitle = "Created with Remotion" }) => (
  <div style={{ flex: 1, background: "#101827", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: "Arial", gap: 24 }}>
    <div style={{ fontSize: 76, fontWeight: 800 }}>{title}</div>
    <div style={{ fontSize: 32, color: "#a7b6cc" }}>{subtitle}</div>
  </div>
);
export const RemotionRoot = () => <Composition id="Main" component={Main} durationInFrames={150} fps={30} width={1920} height={1080} defaultProps={{ title: "Your next video", subtitle: "Created with Remotion" }} />;

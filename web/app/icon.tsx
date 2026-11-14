import { ImageResponse } from "next/og";

// App icon generated at build time: a serif "F" on the accent colour. Used by the manifest.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#3c3489", color: "#fafaf7", fontSize: 340, fontFamily: "serif", fontWeight: 500 }}>
        F
      </div>
    ),
    size,
  );
}

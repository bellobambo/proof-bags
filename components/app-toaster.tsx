"use client";

import { Toaster } from "react-hot-toast";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 7000,
        style: {
          background: "#101418",
          color: "#f5f7fa",
          border: "1px solid rgba(255,255,255,0.12)",
        },
      }}
    />
  );
}

"use client";

import { UnikitThemeProvider, Button, useUnikitTheme } from "@unikit-bridge/ui";
import type { ReactNode } from "react";

const COLOR_SCHEME_STORAGE_KEY = "rustra-color-scheme";

export function SiteThemeProvider({ children }: { children: ReactNode }) {
  return (
    <UnikitThemeProvider storageKey={COLOR_SCHEME_STORAGE_KEY}>
      {children}
    </UnikitThemeProvider>
  );
}

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useUnikitTheme();
  return (
    <Button
      variant="outline"
      size="sm"
      onPress={toggleColorScheme}
      accessibilityLabel="색 테마 전환"
      className="site-focusable"
    >
      {colorScheme === "light" ? "다크" : "라이트"}
    </Button>
  );
}

"use client";

import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@unikit-bridge/ui";
import { SiteBrand, RustraMark } from "./brand";
import { ThemeToggle } from "./site-theme";

const CTA_PRIMARY_CLASS =
  "site-focusable inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90";
const CTA_SECONDARY_CLASS =
  "site-focusable inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent";

const GITHUB_URL = "https://github.com/loopy-lim/unikit-bridge";
const DOCS_URL =
  "https://github.com/loopy-lim/unikit-bridge/blob/main/docs/getting-started.md";
const NPM_URL = "https://www.npmjs.com/package/@unikit-bridge/rustra";

function SiteNav() {
  return (
    <header className="border-b border-border/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <SiteBrand />
        <nav className="flex items-center gap-2.5 text-sm sm:gap-3">
          <a
            href="#install"
            className="site-focusable text-muted-foreground transition-colors hover:text-foreground"
          >
            설치
          </a>
          <a
            href="#why"
            className="site-focusable hidden text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            왜 rustra
          </a>
          <a
            href={GITHUB_URL}
            className="site-focusable hidden text-muted-foreground transition-colors hover:text-foreground sm:inline"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="border-b border-border/60 py-14 sm:py-16 lg:py-20">
      <div className="site-hero-in mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 sm:gap-5">
          <RustraMark
            size={96}
            className="size-16 sm:size-20 md:size-24"
          />
          <p className="site-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            rustra
          </p>
        </div>
        <h1 className="mt-4 max-w-3xl text-xl font-medium leading-snug tracking-tight text-foreground sm:text-2xl md:text-3xl">
          한 Rust 코어 → Node, Bun, Tauri, React Native.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          컴팩트 바이너리 와이어와 CI 계약 게이트로, 스키마 깨짐을 막으면서
          타입 안전 클라이언트를 각 호스트에 생성합니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="#install" className={CTA_PRIMARY_CLASS}>
            시작하기
          </a>
          <a
            href={GITHUB_URL}
            className={CTA_SECONDARY_CLASS}
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

function ValueSection() {
  return (
    <section
      id="why"
      className="scroll-mt-20 border-b border-border/60 py-14 sm:py-16 lg:py-20"
    >
      <div className="site-section-in mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="site-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          정의는 한 번, 호출은 어디서나
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Rust에서{" "}
          <code className="site-mono text-[0.95em]">#[command]</code>로
          정의하면{" "}
          <code className="site-mono text-[0.95em]">rustra codegen</code>이
          플랫폼별 타입 안전 클라이언트를 만듭니다. 같은 계약, 같은 Frame
          와이어.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <FeatureCard
            label="Wire"
            title="Frame 바이너리"
            body="요청 페이로드 기준 JSON 대비 약 11.8× 작습니다. (페이로드 바이트, RTT 아님)"
          />
          <FeatureCard
            label="Contract"
            title="CI 계약 게이트"
            body="스키마 해시를 깨는 변경을 CI에서 차단해 호스트별 드리프트를 막습니다."
          />
          <FeatureCard
            label="Hosts"
            title="네 플랫폼"
            body="Node, Bun, Tauri, React Native가 같은 EngineClient 경로를 공유합니다."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="site-card rounded-xl border border-border bg-background p-5 hover:border-foreground/25">
      <Badge variant="outline">{label}</Badge>
      <h3 className="mt-3 text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function InstallSection() {
  return (
    <section
      id="install"
      className="scroll-mt-20 border-b border-border/60 py-14 sm:py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="site-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          설치
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          CLI로 클라이언트를 생성하고, 호스트 런타임 패키지로 연결합니다.
        </p>
        <div className="mt-8 max-w-3xl space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">CLI</p>
            <pre className="site-mono overflow-x-auto rounded-md border border-border bg-muted p-4 text-xs text-foreground">
              bun add -g @unikit-bridge/rustra{"\n"}rustra codegen
            </pre>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              TypeScript 호출
            </p>
            <pre className="site-mono overflow-x-auto rounded-md border border-border bg-muted p-4 text-xs text-foreground">{`import { addNumbers } from './generated/node.js';

const { sum } = await addNumbers({ a: 42, b: 58 });`}</pre>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href={DOCS_URL}
            className={CTA_PRIMARY_CLASS}
            rel="noreferrer"
            target="_blank"
          >
            Getting started
          </a>
          <a
            href={NPM_URL}
            className={CTA_SECONDARY_CLASS}
            rel="noreferrer"
            target="_blank"
          >
            npm 패키지
          </a>
        </div>
      </div>
    </section>
  );
}

function PreviewScene({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="site-card rounded-xl border border-border bg-background p-5 hover:border-foreground/25">
      <div className="mb-4 flex">
        <Badge variant="outline">{label}</Badge>
      </div>
      <div className="flex min-h-28 flex-col justify-center gap-4">{children}</div>
    </div>
  );
}

function LiveSection() {
  return (
    <section className="py-14 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="site-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          같은 UI 키트로 만든 소개 페이지
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          이 사이트는{" "}
          <code className="site-mono text-[0.95em]">@unikit-bridge/ui</code>를
          그대로 씁니다. 아래는 실제 컴포넌트입니다.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <PreviewScene label="호스트">
            <Tabs defaultValue="node">
              <TabsList variant="line">
                <TabsTrigger value="node">Node</TabsTrigger>
                <TabsTrigger value="bun">Bun</TabsTrigger>
                <TabsTrigger value="tauri">Tauri</TabsTrigger>
                <TabsTrigger value="rn">RN</TabsTrigger>
              </TabsList>
              <TabsContent value="node">
                <span className="text-sm text-foreground">
                  N-API 어댑터로 같은 계약을 호출합니다.
                </span>
              </TabsContent>
              <TabsContent value="bun">
                <span className="text-sm text-foreground">
                  Bun FFI 경로로 같은 Frame 와이어를 태웁니다.
                </span>
              </TabsContent>
              <TabsContent value="tauri">
                <span className="text-sm text-foreground">
                  데스크톱 WebView에서도 동일한 클라이언트를 씁니다.
                </span>
              </TabsContent>
              <TabsContent value="rn">
                <span className="text-sm text-foreground">
                  React Native JSI/Nitro 경로와 계약 패리티를 유지합니다.
                </span>
              </TabsContent>
            </Tabs>
          </PreviewScene>
          <PreviewScene label="액션">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Frame</Badge>
              <Badge variant="secondary">codegen</Badge>
              <Badge variant="outline">contract gate</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onPress={() => {
                  window.open(DOCS_URL, "_blank", "noreferrer");
                }}
              >
                문서 열기
              </Button>
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  window.open(GITHUB_URL, "_blank", "noreferrer");
                }}
              >
                저장소
              </Button>
            </div>
          </PreviewScene>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
        rustra — one Rust core, typed clients, Frame wire
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="site-canvas">
      <SiteNav />
      <main>
        <Hero />
        <ValueSection />
        <InstallSection />
        <LiveSection />
      </main>
      <Footer />
    </div>
  );
}

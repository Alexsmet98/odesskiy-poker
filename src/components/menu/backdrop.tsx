import type { ReactNode } from "react";

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="bar-grain lamp-glow relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-32 top-24 size-[36rem] animate-drift smoke-layer" />
      <div
        className="pointer-events-none absolute -right-40 bottom-10 size-[32rem] animate-drift smoke-layer"
        style={{ animationDelay: "-9s" }}
      />
      <div className="relative z-10 flex w-full max-w-xl flex-col gap-6">
        {children}
      </div>
    </div>
  );
}

export function Title({ subtitle }: { subtitle?: string }) {
  return (
    <header className="text-center">
      <h1 className="animate-flicker font-heading text-3xl tracking-[0.18em] text-ember uppercase sm:text-4xl">
        Одесский покер
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {subtitle ?? "подвал у порта, лампа на одном проводе"}
      </p>
    </header>
  );
}

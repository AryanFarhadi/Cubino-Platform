"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { api, setAccessToken, getApiUrl } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { LionLogo } from "@/components/ui/lion";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () =>
      api<{ accessToken: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      router.push("/app");
    },
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-den-darker p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(88,101,242,0.15)_0%,_transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(240,177,50,0.08)_0%,_transparent_40%)]" />

      <div className="relative w-full max-w-md rounded-cubino border border-white/[0.06] bg-den-surface p-8 shadow-den">
        <div className="mb-8 flex flex-col items-center gap-3">
          <LionLogo size={72} />
          <h1 className="text-2xl font-bold text-den-cream">Welcome back!</h1>
          <p className="text-sm text-den-muted">We&apos;re so excited to see you again</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-den-muted">
              Email
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-den-muted">
              Password
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {login.isError && (
            <p className="text-sm text-den-berry">{(login.error as Error).message}</p>
          )}
          <Button type="submit" className="mt-2 w-full" disabled={login.isPending}>
            {login.isPending ? "Logging in..." : "Log In"}
          </Button>
        </form>
        <div className="mt-4 flex flex-col gap-2">
          <a
            href={`${getApiUrl()}/api/v1/auth/oauth/google`}
            className="rounded-den border border-white/10 py-2 text-center text-sm text-den-cream hover:bg-den-elevated"
          >
            Continue with Google
          </a>
          <a
            href={`${getApiUrl()}/api/v1/auth/oauth/github`}
            className="rounded-den border border-white/10 py-2 text-center text-sm text-den-cream hover:bg-den-elevated"
          >
            Continue with GitHub
          </a>
        </div>
        <p className="mt-6 text-center text-sm text-den-muted">
          Need an account?{" "}
          <Link href="/register" className="text-den-link hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

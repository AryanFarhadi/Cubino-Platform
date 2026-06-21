"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { api, setAccessToken } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { LionLogo } from "@/components/ui/lion";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const register = useMutation({
    mutationFn: () =>
      api<{ accessToken: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, username, password }),
      }),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      router.push("/app");
    },
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-den-darker p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(240,177,50,0.12)_0%,_transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(88,101,242,0.1)_0%,_transparent_40%)]" />

      <div className="relative w-full max-w-md rounded-cubino border border-white/[0.06] bg-den-surface p-8 shadow-den">
        <div className="mb-8 flex flex-col items-center gap-3">
          <LionLogo size={72} />
          <h1 className="text-2xl font-bold text-den-cream">Create an account</h1>
          <p className="text-sm text-den-muted">Join the pride on Cubino</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
        >
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-den-muted">
              Email
            </label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-den-muted">
              Username
            </label>
            <Input placeholder="lionking" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-den-muted">
              Password
            </label>
            <Input type="password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          {register.isError && (
            <p className="text-sm text-den-berry">{(register.error as Error).message}</p>
          )}
          <Button type="submit" className="mt-2 w-full" disabled={register.isPending}>
            {register.isPending ? "Creating account..." : "Continue"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-den-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-den-link hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

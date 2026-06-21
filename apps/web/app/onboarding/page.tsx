"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/primitives";
import { LionLogo } from "@/components/ui/lion";

const INTERESTS = ["Gaming", "Music", "Art", "Tech", "Sports", "Anime"];

const STARTER_ACHIEVEMENTS = [
  { name: "First Roar", description: "Send your first message" },
  { name: "Pride Leader", description: "Create a den" },
  { name: "Pride Member", description: "Join your first den" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const setDens = useAppStore((s) => s.setDens);
  const setActiveDenId = useAppStore((s) => s.setActiveDenId);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [denName, setDenName] = useState("My Pride");

  const createDen = useMutation({
    mutationFn: () => api<{ den: { id: string; name: string }; inviteCode: string }>("/api/v1/dens", {
      method: "POST",
      body: JSON.stringify({ name: denName }),
    }),
    onSuccess: (res) => {
      localStorage.setItem("cubino_onboarded", "1");
      setDens([{ id: res.den.id, name: res.den.name, ownerId: "", description: null, iconUrl: null }]);
      setActiveDenId(res.den.id);
      router.push("/app");
    },
  });

  const skip = () => {
    localStorage.setItem("cubino_onboarded", "1");
    router.push("/app");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-den-darker p-6">
      <LionLogo size={72} />
      <h1 className="mt-4 text-2xl font-bold text-den-cream">Welcome to Cubino</h1>
      {step === 0 && (
        <div className="mt-8 w-full max-w-md text-center">
          <p className="text-den-muted">What are you interested in?</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {INTERESTS.map((i) => (
              <button
                key={i}
                onClick={() =>
                  setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
                }
                className={`rounded-full px-4 py-2 text-sm ${
                  selected.includes(i) ? "bg-den-honey text-white" : "bg-den-elevated text-den-muted"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <Button className="mt-6 w-full" onClick={() => setStep(1)}>Continue</Button>
          <div className="mt-6 rounded-cubino border border-den-gold/20 bg-den-gold/5 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-den-gold">
              Achievements to unlock
            </p>
            <ul className="mt-2 space-y-2" aria-label="Starter achievements">
              {STARTER_ACHIEVEMENTS.map((a) => (
                <li key={a.name} className="text-sm">
                  <span className="font-medium text-den-cream">{a.name}</span>
                  <span className="text-den-muted"> — {a.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <button onClick={skip} className="mt-3 text-sm text-den-muted hover:underline">Skip</button>
        </div>
      )}
      {step === 1 && (
        <div className="mt-8 w-full max-w-md">
          <p className="text-center text-den-muted">Create your first den or join one later</p>
          <p className="mt-2 text-center text-xs text-den-muted">
            Creating a den unlocks <span className="text-den-gold">Pride Leader</span>. Discovering
            public dens unlocks <span className="text-den-gold">Pride Member</span>.
          </p>
          <input
            value={denName}
            onChange={(e) => setDenName(e.target.value)}
            className="mt-4 w-full rounded-den bg-den-elevated px-4 py-3 text-den-cream"
            placeholder="Den name"
          />
          <Button
            className="mt-4 w-full"
            onClick={() => createDen.mutate()}
            disabled={createDen.isPending}
          >
            {createDen.isPending ? "Creating..." : "Create my den"}
          </Button>
          <Button
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              localStorage.setItem("cubino_onboarded", "1");
              router.push("/discover");
            }}
          >
            Discover public dens
          </Button>
          <button onClick={skip} className="mt-3 w-full text-center text-sm text-den-muted hover:underline">
            I'll join one later
          </button>
        </div>
      )}
    </div>
  );
}

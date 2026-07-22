"use client";

// Where to bias address suggestions: the signed-in user's own recorded location (22/07
// feedback #2 follow-up). Photon gives house-level features no meaningful importance score, so
// without a hint "12 Chapel Street" ranks Maldon and Serpentine alongside Prahran.
//
// The state is read off an address the user has ALREADY entered — no geolocation permission, no
// extra network call, nothing new stored. It only reorders suggestions; every result stays
// reachable, so a clinic treating an interstate patient is never blocked.
import { useMemo } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { activePremise } from "@/lib/demo/backend";
import { biasForAddress, type GeoPoint } from "@/lib/addressSearch";

export function useAddressBias(): GeoPoint | undefined {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const profile = identity ? store.profileForUser(identity.user.id) : undefined;

  return useMemo(() => {
    if (!profile) return undefined;
    // Most specific first: where this user actually administers, then their practice address,
    // then the account's contact address.
    const candidates = [
      activePremise(profile)?.address,
      profile.principalPlace,
      profile.address,
    ];
    for (const address of candidates) {
      const bias = biasForAddress(address);
      if (bias) return bias;
    }
    return undefined;
  }, [profile]);
}
